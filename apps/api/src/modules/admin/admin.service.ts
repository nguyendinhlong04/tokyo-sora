import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { isUniqueViolation } from '../../common/pg-error'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import {
  areas,
  branches,
  parameterHistory,
  parameters,
  reservations,
  staff,
  tableSessions,
  tables,
} from '../../db/schema'
import { assertInvoiceSerial } from '../accounting/domain/accounting'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

/**
 * Khoá tham số của A9. Gom vào một chỗ vì hai nơi cùng đọc chúng: màn A9 và
 * `AccountingService.serialOf` lúc phát hành hoá đơn.
 */
const EINVOICE = {
  taxCode: 'einvoice.taxCode',
  provider: 'einvoice.provider',
  certSerial: 'einvoice.certificateSerial',
  certExpiry: 'einvoice.certificateExpiry',
  serial: 'einvoice.serial',
  enabled: 'einvoice.enabled',
} as const

export interface TableInput {
  branchId: string
  areaId: number | null
  code: string
  kind: 'standard' | 'grill' | 'private'
  hasGrill: boolean
  grillType: 'than' | 'gas' | 'dien' | null
  seatMin: number
  seatMax: number
  active: boolean
}

/**
 * Quản trị (A3 · A6 · A10) — nơi duy nhất sửa được thứ mà engine đọc lúc chạy.
 *
 * Ba màn này nhìn thì tẻ nhạt nhưng chúng là công tắc của cả hệ thống: giờ mở
 * cửa quyết định lưới đặt bàn của W6, sơ đồ bàn quyết định sức chứa, tham số
 * quyết định thời lượng bữa và trần đơn mỗi khung. Trước khi có màn này, đổi một
 * con số phải sửa seeder rồi chạy lại.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ A6

  /**
   * Tham số áp cho một chi nhánh: mặc định cấp chuỗi, kèm bản ghi đè nếu có.
   *
   * Trả cả hai chứ không gộp sẵn — người sửa cần biết con số đang dùng là của
   * riêng chi nhánh hay đang ăn theo mặc định của chuỗi, vì xoá ghi đè và sửa
   * ghi đè là hai việc khác nhau.
   */
  async parameters(branchId: string | null) {
    const rows = await this.db
      .select({ p: parameters, by: staff.fullName })
      .from(parameters)
      .leftJoin(staff, eq(staff.id, parameters.updatedBy))
      .orderBy(asc(parameters.key))

    const chain = rows.filter((r) => r.p.branchId === null)
    const overrides = rows.filter((r) => r.p.branchId === branchId)

    return chain.map(({ p, by }) => {
      const override = overrides.find((o) => o.p.key === p.key)
      return {
        key: p.key,
        unit: p.unit,
        sensitive: p.sensitive,
        chainValue: p.value,
        branchValue: override ? override.p.value : null,
        /** Giá trị engine thật sự đọc cho chi nhánh này */
        effectiveValue: override ? override.p.value : p.value,
        scope: override ? ('branch' as const) : ('chain' as const),
        updatedAt: (override ?? { p }).p.updatedAt,
        updatedBy: (override ? overrides.find((o) => o.p.key === p.key)!.by : by) ?? null,
      }
    })
  }

  async parameterHistory(key: string) {
    const rows = await this.db
      .select({ h: parameterHistory, by: staff.fullName })
      .from(parameterHistory)
      .leftJoin(staff, eq(staff.id, parameterHistory.changedBy))
      .where(eq(parameterHistory.key, key))
      .orderBy(desc(parameterHistory.changedAt))
      .limit(50)

    return rows.map(({ h, by }) => ({
      branchId: h.branchId,
      oldValue: h.oldValue,
      newValue: h.newValue,
      changedAt: h.changedAt,
      changedBy: by ?? null,
    }))
  }

  /**
   * Đổi một tham số.
   *
   * Kiểm KIỂU theo giá trị đang có: tham số khai bằng số mà nhận chuỗi thì mọi
   * phép tính dùng nó im lặng ra `NaN` — thời lượng bữa hỏng, lưới đặt bàn trống
   * trơn, và không ai biết vì sao.
   */
  async setParameter(
    key: string,
    input: { value: unknown; branchId: string | null },
    actor: Actor,
  ) {
    const [current] = await this.db
      .select()
      .from(parameters)
      .where(and(eq(parameters.key, key), sql`${parameters.branchId} IS NULL`))
    if (!current) throw new NotFoundException(`Không có tham số ${key}`)

    const expected = typeof current.value
    if (typeof input.value !== expected) {
      throw new BadRequestException(
        `Tham số ${key} phải là kiểu ${expected === 'number' ? 'số' : expected === 'boolean' ? 'bật/tắt' : 'chuỗi'}`,
      )
    }
    if (typeof input.value === 'number' && (!Number.isFinite(input.value) || input.value < 0)) {
      throw new BadRequestException(`Tham số ${key} không nhận giá trị âm`)
    }

    await this.params.set(key, input.value, {
      branchId: input.branchId,
      changedBy: actor.kind === 'staff' ? actor.staffId : null,
    })
    await this.write(actor, 'param.updated', key, {
      branchId: input.branchId,
      from: current.value,
      to: input.value,
    })
    return { key, value: input.value, branchId: input.branchId }
  }

  /** Bỏ ghi đè của chi nhánh — quay về mặc định của chuỗi */
  async clearParameterOverride(key: string, branchId: string, actor: Actor) {
    const deleted = await this.db
      .delete(parameters)
      .where(and(eq(parameters.key, key), eq(parameters.branchId, branchId)))
      .returning({ value: parameters.value })
    if (deleted.length === 0) throw new NotFoundException('Chi nhánh này không có ghi đè cho tham số đó')

    await this.params.reload()
    await this.write(actor, 'param.override.cleared', key, {
      branchId,
      from: deleted[0]!.value,
    })
    return { key, branchId, cleared: true }
  }

  // ------------------------------------------------------------------ A9

  /**
   * Hoá đơn điện tử — cửa vào theo ngữ cảnh của chính sổ tham số A6.
   *
   * Không có bảng riêng, và đó là quyết định chứ không phải lười: §29.1 nói rõ
   * "H6 và các màn cấu hình khác là cửa vào theo ngữ cảnh của cùng bộ tham số —
   * sửa ở đâu cũng là sửa một chỗ". `AccountingService.serialOf` vốn đã đọc
   * `einvoice.serial` từ đây; dựng thêm một bảng là tạo nguồn thứ hai cho một con
   * số đã có nguồn, rồi một ngày nào đó hai nguồn lệch nhau.
   *
   * Phạm vi theo §30.2: **một mã số thuế cho cả chuỗi** (một hợp đồng HĐĐT), còn
   * **ký hiệu thì riêng từng địa điểm kinh doanh**. Nên MST và nhà cung cấp là
   * mặc định cấp chuỗi, ký hiệu và công tắc là ghi đè cấp chi nhánh.
   */
  async einvoice(branchId: string) {
    const rows = await this.db
      .select()
      .from(parameters)
      .where(
        and(
          inArray(parameters.key, Object.values(EINVOICE)),
          or(isNull(parameters.branchId), eq(parameters.branchId, branchId)),
        ),
      )

    const chain = (key: string) => rows.find((r) => r.key === key && r.branchId === null)?.value
    /**
     * Giá trị engine THẬT SỰ đọc: ghi đè của chi nhánh nếu có, ngược lại mặc định
     * chuỗi — cùng quy tắc với `ParamsService.get`, tức là cùng con số mà
     * `AccountingService.serialOf` dùng lúc phát hành. Hiện một con số khác con số
     * sẽ được dùng là cách chắc chắn nhất để kế toán tin sai.
     */
    const effective = (key: string) =>
      rows.find((r) => r.key === key && r.branchId === branchId)?.value ?? chain(key)
    const text = (value: unknown) => (typeof value === 'string' ? value : '')

    return {
      branchId,
      chain: {
        taxCode: text(chain(EINVOICE.taxCode)),
        provider: text(chain(EINVOICE.provider)),
        certificateSerial: text(chain(EINVOICE.certSerial)),
        certificateExpiry: text(chain(EINVOICE.certExpiry)),
      },
      branch: {
        serial: text(effective(EINVOICE.serial)),
        enabled: effective(EINVOICE.enabled) === true,
      },
      /** Chứng thư hết hạn là hoá đơn ngừng phát hành — cảnh báo trước 30 ngày */
      certificateDaysLeft: daysUntil(text(chain(EINVOICE.certExpiry))),
    }
  }

  /**
   * Khai cấu hình hoá đơn điện tử.
   *
   * Kiểm ký hiệu NGAY TẠI ĐÂY bằng đúng hàm mà miền kế toán dùng lúc phát hành:
   * ký hiệu sai chuẩn nếu lọt qua thì lỗi chỉ lộ ra vào lúc khách đứng chờ hoá
   * đơn ở quầy, và người sửa được nó thì đang ở nhà.
   *
   * Bật công tắc mà chưa có đủ MST + ký hiệu là bật một cái không chạy được, nên
   * chặn luôn — thà không bật được còn hơn bật rồi mỗi bill đều rơi vào hàng đợi
   * lỗi của F3.
   */
  async setEinvoice(
    branchId: string,
    input: {
      taxCode?: string
      provider?: string
      certificateSerial?: string
      certificateExpiry?: string
      serial?: string
      enabled?: boolean
    },
    actor: Actor,
  ) {
    const before = await this.einvoice(branchId)

    const taxCode = (input.taxCode ?? before.chain.taxCode).trim()
    const serial = (input.serial ?? before.branch.serial).trim()
    const certExpiry = (input.certificateExpiry ?? before.chain.certificateExpiry).trim()
    const enabled = input.enabled ?? before.branch.enabled

    if (taxCode !== '' && !/^\d{10}(-\d{3})?$/.test(taxCode)) {
      throw new BadRequestException('Mã số thuế gồm 10 số, đơn vị phụ thuộc thêm "-" và 3 số')
    }
    if (certExpiry !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(certExpiry)) {
      throw new BadRequestException('Ngày hết hạn chứng thư số viết theo mẫu YYYY-MM-DD')
    }
    let normalisedSerial = ''
    if (serial !== '') {
      try {
        normalisedSerial = assertInvoiceSerial(serial)
      } catch (err) {
        throw new BadRequestException((err as Error).message)
      }
    }
    if (enabled && (taxCode === '' || normalisedSerial === '')) {
      throw new ConflictException(
        'Chưa đủ để bật: hoá đơn điện tử cần mã số thuế của chuỗi và ký hiệu riêng của chi nhánh này',
      )
    }

    const changedBy = actor.kind === 'staff' ? actor.staffId : null
    const writes: { key: string; value: unknown; branchId: string | null }[] = []
    if (input.taxCode !== undefined) writes.push({ key: EINVOICE.taxCode, value: taxCode, branchId: null })
    if (input.provider !== undefined) {
      writes.push({ key: EINVOICE.provider, value: input.provider.trim(), branchId: null })
    }
    if (input.certificateSerial !== undefined) {
      writes.push({ key: EINVOICE.certSerial, value: input.certificateSerial.trim(), branchId: null })
    }
    if (input.certificateExpiry !== undefined) {
      writes.push({ key: EINVOICE.certExpiry, value: certExpiry, branchId: null })
    }
    if (input.serial !== undefined) {
      writes.push({ key: EINVOICE.serial, value: normalisedSerial, branchId })
    }
    if (input.enabled !== undefined) {
      writes.push({ key: EINVOICE.enabled, value: enabled, branchId })
    }

    for (const write of writes) {
      await this.params.set(write.key, write.value, { branchId: write.branchId, changedBy })
    }
    if (writes.length > 0) {
      // Không ghi giá trị chứng thư số vào nhật ký — chỉ ghi rằng nó đã đổi
      await this.write(actor, 'einvoice.configured', branchId, {
        keys: writes.map((w) => w.key),
        enabled,
      })
    }
    return this.einvoice(branchId)
  }

  // ----------------------------------------------------------------- A10

  async branches() {
    const rows = await this.db.select().from(branches).orderBy(asc(branches.id))
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email,
      timezone: b.timezone,
      openHours: (b.openHours as { raw?: string } | null)?.raw ?? null,
      active: b.active,
    }))
  }

  /**
   * Mở thêm một chi nhánh.
   *
   * Mã do NGƯỜI NHẬP đặt chứ không sinh tự động: nó đi vào đường dẫn công khai
   * (`/dat-mon/cg`), vào mã bàn in trên QR, vào tên kênh Realtime. Một chuỗi
   * ngẫu nhiên thì đúng về kỹ thuật nhưng ai đọc log cũng phải tra ngược.
   *
   * Chi nhánh mới dựng ra là RỖNG — chưa có khu, chưa có bàn, chưa có vùng giao.
   * Xếp sơ đồ bàn ở A3, khai vùng giao ở O10. Ở đây chỉ tạo cái tên và địa chỉ.
   */
  async createBranch(
    input: {
      id: string
      name: string
      address?: string | null
      phone?: string | null
      email?: string | null
      openHours?: string | null
      active?: boolean
    },
    actor: Actor,
  ) {
    const id = input.id.trim().toLowerCase()
    if (!/^[a-z0-9-]{2,12}$/.test(id)) {
      throw new BadRequestException(
        'Mã chi nhánh chỉ gồm chữ thường không dấu, số và dấu gạch ngang, dài 2–12 ký tự',
      )
    }
    const [trung] = await this.db.select({ id: branches.id }).from(branches).where(eq(branches.id, id))
    if (trung) throw new BadRequestException(`Đã có chi nhánh mang mã ${id}`)

    const gio = input.openHours?.trim() || ''
    if (gio) assertOpenHours(gio)

    await this.db.insert(branches).values({
      id,
      name: input.name.trim(),
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      openHours: gio ? { raw: gio } : null,
      active: input.active ?? true,
    })
    await this.write(actor, 'branch.created', id, { name: input.name.trim() })
    return this.branchView(id)
  }

  /**
   * Sửa thông tin chi nhánh.
   *
   * Giờ mở cửa KHÔNG chỉ là chữ trên trang Không gian: `parseOpenHours` đọc chính
   * chuỗi này để dựng lưới khung giờ W6. Nên nó được kiểm ngay tại đây — gõ sai
   * định dạng là chi nhánh đó ngừng nhận đặt mà không ai hiểu vì sao.
   */
  async updateBranch(
    id: string,
    input: {
      name?: string
      address?: string | null
      phone?: string | null
      email?: string | null
      openHours?: string | null
      active?: boolean
    },
    actor: Actor,
  ) {
    const [current] = await this.db.select().from(branches).where(eq(branches.id, id))
    if (!current) throw new NotFoundException(`Không có chi nhánh ${id}`)

    if (input.openHours !== undefined && input.openHours !== null && input.openHours.trim() !== '') {
      assertOpenHours(input.openHours)
    }

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.address !== undefined) patch.address = input.address?.trim() || null
    if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
    if (input.email !== undefined) patch.email = input.email?.trim() || null
    if (input.active !== undefined) patch.active = input.active
    if (input.openHours !== undefined) {
      patch.openHours = input.openHours?.trim() ? { raw: input.openHours.trim() } : null
    }
    if (Object.keys(patch).length === 0) return this.branchView(id)

    await this.db.update(branches).set(patch).where(eq(branches.id, id))
    await this.write(actor, 'branch.updated', id, patch)
    return this.branchView(id)
  }

  // ------------------------------------------------------------------ A3

  async floorplan(branchId: string) {
    const [areaRows, tableRows] = await Promise.all([
      this.db
        .select()
        .from(areas)
        .where(eq(areas.branchId, branchId))
        .orderBy(asc(areas.sort), asc(areas.id)),
      this.db
        .select({ t: tables, session: tableSessions.id })
        .from(tables)
        .leftJoin(
          tableSessions,
          and(eq(tableSessions.tableId, tables.id), sql`${tableSessions.status} <> 'closed'`),
        )
        .where(eq(tables.branchId, branchId))
        .orderBy(asc(tables.code)),
    ])

    return {
      areas: areaRows.map((a) => ({ id: a.id, name: a.name, sort: a.sort })),
      tables: tableRows.map(({ t, session }) => ({
        id: t.id,
        areaId: t.areaId,
        code: t.code,
        kind: t.kind,
        hasGrill: t.hasGrill,
        grillType: t.grillType,
        seatMin: t.seatMin,
        seatMax: t.seatMax,
        active: t.active,
        /** Bàn đang có khách — không cho ngừng dùng giữa bữa */
        busy: session !== null,
      })),
    }
  }

  async createArea(input: { branchId: string; name: string }, actor: Actor) {
    const [row] = await this.db
      .insert(areas)
      .values({ branchId: input.branchId, name: input.name.trim() })
      .returning()
    await this.write(actor, 'area.created', String(row!.id), { name: row!.name })
    return { id: row!.id, name: row!.name, sort: row!.sort }
  }

  async renameArea(id: number, name: string, actor: Actor) {
    const [row] = await this.db
      .update(areas)
      .set({ name: name.trim() })
      .where(eq(areas.id, id))
      .returning()
    if (!row) throw new NotFoundException('Không có khu này')
    await this.write(actor, 'area.renamed', String(id), { name: row.name })
    return { id: row.id, name: row.name, sort: row.sort }
  }

  /** Xoá khu — chặn nếu còn bàn, vì bàn mồ côi không hiện ở đâu trên sơ đồ */
  async deleteArea(id: number, actor: Actor) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tables)
      .where(eq(tables.areaId, id))
    const count = Number(row?.count ?? 0)
    if (count > 0) {
      throw new ConflictException(`Khu này còn ${count} bàn — chuyển bàn sang khu khác trước`)
    }
    await this.db.delete(areas).where(eq(areas.id, id))
    await this.write(actor, 'area.deleted', String(id), {})
    return { id, deleted: true }
  }

  async createTable(input: TableInput, actor: Actor) {
    assertTable(input)
    try {
      const [row] = await this.db.insert(tables).values(input).returning()
      await this.write(actor, 'table.created', String(row!.id), { code: row!.code })
      return row!
    } catch (err) {
      if (isUniqueViolation(err, 'tables_branch_code_unique')) {
        throw new ConflictException(`Chi nhánh đã có bàn số ${input.code}`)
      }
      throw err
    }
  }

  /**
   * Sửa bàn.
   *
   * Thu nhỏ sức chứa hay đổi kiểu chỗ có thể làm những suất đã nhận không còn
   * bàn — nên kiểm trước và nói rõ suất nào, thay vì để tối đó nhân viên phát
   * hiện lúc khách đứng ở cửa.
   */
  async updateTable(id: number, input: Partial<TableInput>, actor: Actor) {
    const [current] = await this.db.select().from(tables).where(eq(tables.id, id))
    if (!current) throw new NotFoundException('Không có bàn này')

    const next = { ...current, ...input } as TableInput
    assertTable(next)

    if (input.active === false || input.kind !== undefined || input.seatMax !== undefined) {
      const blocking = await this.futureReservationsOn(id, next)
      if (blocking) {
        throw new ConflictException({
          code: 'reservation_affected',
          message: `Bàn này đang giữ cho ${blocking.customerName} (${blocking.guestCount} khách). Đổi bàn cho suất đó trước.`,
        })
      }
    }

    await this.db
      .update(tables)
      .set({
        areaId: next.areaId,
        code: next.code,
        kind: next.kind,
        hasGrill: next.hasGrill,
        grillType: next.grillType,
        seatMin: next.seatMin,
        seatMax: next.seatMax,
        active: next.active,
      })
      .where(eq(tables.id, id))
    await this.write(actor, 'table.updated', String(id), { ...input })
    return { ...next, id }
  }

  /**
   * Ngừng dùng bàn — KHÔNG xoá.
   *
   * Bàn đã từng có đơn thì xoá là cắt mất đường truy ngược của mọi hoá đơn cũ.
   * `active = false` làm bàn biến khỏi sơ đồ và khỏi phép đếm sức chứa, mà sổ
   * sách vẫn nguyên.
   */
  async deactivateTable(id: number, actor: Actor) {
    return this.updateTable(id, { active: false }, actor)
  }

  // ------------------------------------------------------------------ phụ trợ

  private async futureReservationsOn(tableId: number, next: TableInput) {
    const rows = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.tableId, tableId),
          sql`${reservations.status} IN ('pending','confirmed')`,
          sql`${reservations.endAt} >= now()`,
        ),
      )
      .orderBy(asc(reservations.slotAt))

    return (
      rows.find(
        (r) => !next.active || next.kind !== r.seatKind || next.seatMax < r.guestCount,
      ) ?? null
    )
  }

  private async branchView(id: string) {
    return (await this.branches()).find((b) => b.id === id)!
  }

  private async write(actor: Actor, action: string, entityId: string, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, {
        actor,
        action,
        entity: action.split('.')[0]!,
        entityId,
        payload,
      })
    })
  }
}

/** Số ngày còn lại tới một mốc YYYY-MM-DD; null khi chưa khai */
function daysUntil(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const today = new Date().toISOString().slice(0, 10)
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000)
}

/** '11:00–14:00 · 17:00–23:00' — cùng định dạng mà miền đặt bàn đọc */
function assertOpenHours(raw: string) {
  const parts = raw.split(/[·,;]/).map((p) => p.trim()).filter(Boolean)
  const ok =
    parts.length > 0 &&
    parts.every((part) => /^\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}$/.test(part))
  if (!ok) {
    throw new BadRequestException(
      'Giờ mở cửa viết theo mẫu "11:00–14:00 · 17:00–23:00" — lưới đặt bàn đọc chính chuỗi này',
    )
  }
}

function assertTable(input: TableInput) {
  if (!input.code.trim()) throw new BadRequestException('Bàn phải có số')
  if (input.seatMin < 1) throw new BadRequestException('Sức chứa tối thiểu phải từ 1')
  if (input.seatMax < input.seatMin) {
    throw new BadRequestException('Sức chứa tối đa không nhỏ hơn tối thiểu')
  }
  // Cùng ràng buộc với CSDL: bàn khai có bếp buộc phải nói bếp loại gì
  if (input.hasGrill && !input.grillType) {
    throw new BadRequestException('Bàn có bếp phải chọn loại bếp: than, gas hay điện')
  }
}
