import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import { devices, pairingCodes, printers, staff, staffSessions, stations } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

export type DeviceKind = 'pos' | 'cashier' | 'kds' | 'kiosk' | 'bridge'

export interface PrinterInput {
  branchId: string
  name: string
  kind: 'bill' | 'tem'
  stationId: string | null
  host: string
  port: number
  template: string
  copies: number
  active: boolean
}

/** Mẫu in đi được với từng loại máy — khổ bill không in ra tem và ngược lại */
const TEMPLATES: Record<PrinterInput['kind'], string[]> = {
  bill: ['k80-bill', 'k58-bill'],
  tem: ['tem-40x30', 'tem-50x30'],
}

/**
 * A4 · A5 — phần cứng của chi nhánh.
 *
 * Hai màn đứng cạnh nhau vì cùng trả lời một câu: **cái máy đặt ở góc kia là cái
 * nào, và nó còn được phép nói chuyện với hệ thống không**. Thiết bị mang danh
 * tính (token ghép), máy in thì không — máy in là đích đến mà cầu in gửi tới, nên
 * nó chỉ cần địa chỉ và mẫu giấy.
 */
@Injectable()
export class DeviceAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  // ================================================================= A4

  /**
   * Thiết bị của một chi nhánh, kèm mã ghép còn sống.
   *
   * Có cả máy đã thu hồi: "cái tablet mất hôm thứ Ba đã ngắt chưa" là câu hỏi thật
   * và nó chỉ trả lời được nếu máy đã ngắt vẫn còn hiện trên danh sách.
   */
  async devices(branchId: string) {
    const now = new Date()
    const [rows, codes, sessions] = await Promise.all([
      this.db
        .select({ d: devices, pairedByName: staff.fullName, station: stations.name })
        .from(devices)
        .leftJoin(staff, eq(staff.id, devices.pairedBy))
        .leftJoin(stations, eq(stations.id, devices.stationId))
        .where(eq(devices.branchId, branchId))
        .orderBy(desc(devices.pairedAt)),
      this.db
        .select()
        .from(pairingCodes)
        .where(
          and(
            eq(pairingCodes.branchId, branchId),
            isNull(pairingCodes.usedAt),
            gt(pairingCodes.expiresAt, now),
          ),
        )
        .orderBy(asc(pairingCodes.expiresAt)),
      this.db
        .select({ deviceId: staffSessions.deviceId, fullName: staff.fullName })
        .from(staffSessions)
        .innerJoin(staff, eq(staff.id, staffSessions.staffId))
        .where(
          and(
            eq(staffSessions.branchId, branchId),
            isNull(staffSessions.revokedAt),
            gt(staffSessions.expiresAt, now),
          ),
        ),
    ])

    return {
      devices: rows.map(({ d, pairedByName, station }) => ({
        id: d.id,
        kind: d.kind,
        name: d.name,
        stationId: d.stationId,
        stationName: station,
        pairedAt: d.pairedAt,
        pairedByName,
        revokedAt: d.revokedAt,
        /** Ai đang đăng nhập trên máy này ngay lúc này */
        signedIn: sessions.filter((s) => s.deviceId === d.id).map((s) => s.fullName),
      })),
      pendingCodes: codes.map((c) => ({
        code: c.code,
        kind: c.kind,
        stationId: c.stationId,
        expiresAt: c.expiresAt,
      })),
      stations: await this.db
        .select({ id: stations.id, name: stations.name })
        .from(stations)
        .orderBy(asc(stations.sort)),
    }
  }

  /**
   * Ngắt từ xa.
   *
   * Thu hồi token thiết bị KHÔNG đủ: phiên nhân viên đang mở trên máy đó có token
   * riêng, và `resolveStaffSession` không hỏi lại thiết bị còn sống hay không. Nếu
   * chỉ ngắt thiết bị thì cái tablet vừa mất vẫn gọi API bình thường tới khi phiên
   * hết hạn — tức là tới 12 tiếng sau. Cắt cả hai trong cùng một transaction.
   */
  async revokeDevice(id: number, actor: Actor) {
    const [device] = await this.db.select().from(devices).where(eq(devices.id, id))
    if (!device) throw new NotFoundException('Không có thiết bị này')
    if (device.revokedAt) throw new ConflictException('Thiết bị này đã ngắt rồi')

    const now = new Date()
    const killed = await this.db.transaction(async (tx) => {
      await tx.update(devices).set({ revokedAt: now }).where(eq(devices.id, id))
      const sessions = await tx
        .update(staffSessions)
        .set({ revokedAt: now })
        .where(and(eq(staffSessions.deviceId, id), isNull(staffSessions.revokedAt)))
        .returning({ id: staffSessions.id })
      await this.audit.write(tx, {
        actor,
        action: 'device.revoked',
        entity: 'device',
        entityId: String(id),
        payload: { name: device.name, kind: device.kind, sessionsKilled: sessions.length },
      })
      return sessions.length
    })

    return { id, revokedAt: now, sessionsKilled: killed }
  }

  // ================================================================= A5

  async printers(branchId: string) {
    const [rows, stationRows] = await Promise.all([
      this.db
        .select({ p: printers, station: stations.name, byName: staff.fullName })
        .from(printers)
        .leftJoin(stations, eq(stations.id, printers.stationId))
        .leftJoin(staff, eq(staff.id, printers.updatedBy))
        .where(eq(printers.branchId, branchId))
        .orderBy(asc(printers.kind), asc(printers.name)),
      this.db
        .select({ id: stations.id, name: stations.name })
        .from(stations)
        .orderBy(asc(stations.sort)),
    ])

    return {
      printers: rows.map(({ p, station, byName }) => ({
        id: p.id,
        branchId: p.branchId,
        name: p.name,
        kind: p.kind as PrinterInput['kind'],
        stationId: p.stationId,
        stationName: station,
        host: p.host,
        port: p.port,
        template: p.template,
        copies: p.copies,
        active: p.active,
        updatedAt: p.updatedAt,
        updatedBy: byName,
      })),
      stations: stationRows,
      templates: TEMPLATES,
    }
  }

  async createPrinter(input: PrinterInput, actor: Actor) {
    assertPrinter(input)
    try {
      const [row] = await this.db
        .insert(printers)
        .values({ ...input, name: input.name.trim(), host: input.host.trim(), updatedBy: staffIdOf(actor) })
        .returning({ id: printers.id })
      await this.write(actor, 'printer.created', String(row!.id), {
        name: input.name,
        kind: input.kind,
        stationId: input.stationId,
      })
      return this.printerView(input.branchId, row!.id)
    } catch (err) {
      throw this.friendlyUnique(err, input)
    }
  }

  async updatePrinter(id: number, input: Partial<PrinterInput>, actor: Actor) {
    const [current] = await this.db.select().from(printers).where(eq(printers.id, id))
    if (!current) throw new NotFoundException('Không có máy in này')

    const next = { ...current, ...input } as PrinterInput
    assertPrinter(next)

    try {
      await this.db
        .update(printers)
        .set({
          name: next.name.trim(),
          kind: next.kind,
          stationId: next.stationId,
          host: next.host.trim(),
          port: next.port,
          template: next.template,
          copies: next.copies,
          active: next.active,
          updatedBy: staffIdOf(actor),
          updatedAt: new Date(),
        })
        .where(eq(printers.id, id))
    } catch (err) {
      throw this.friendlyUnique(err, next)
    }

    await this.write(actor, 'printer.updated', String(id), { ...input })
    return this.printerView(current.branchId, id)
  }

  /**
   * Bỏ máy in — XOÁ được, khác với bàn và tài khoản.
   *
   * Máy in không phải nguồn của bản ghi lịch sử nào: không hoá đơn nào trỏ về nó,
   * không phiếu lương nào nhắc tên nó. Giữ lại một dòng chết chỉ làm danh sách dài
   * ra ở màn hình mà người vận hành phải đọc mỗi lần thêm máy mới.
   */
  async deletePrinter(id: number, actor: Actor) {
    const deleted = await this.db.delete(printers).where(eq(printers.id, id)).returning({
      name: printers.name,
      branchId: printers.branchId,
    })
    if (deleted.length === 0) throw new NotFoundException('Không có máy in này')
    await this.write(actor, 'printer.deleted', String(id), { name: deleted[0]!.name })
    return { id, deleted: true }
  }

  // ============================================================== phụ trợ

  private friendlyUnique(err: unknown, input: Partial<PrinterInput>) {
    if (isUniqueViolation(err, 'printers_branch_name_unique')) {
      return new ConflictException(`Chi nhánh đã có máy in tên "${input.name}"`)
    }
    return err
  }

  private async printerView(branchId: string, id: number) {
    return (await this.printers(branchId)).printers.find((p) => p.id === id)!
  }

  private async write(actor: Actor, action: string, entityId: string, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, { actor, action, entity: 'printer', entityId, payload })
    })
  }
}

function staffIdOf(actor: Actor): number | null {
  return actor.kind === 'staff' ? actor.staffId : null
}

/**
 * Kiểm ở tầng dịch vụ chứ không chỉ dựa vào CHECK của CSDL: ràng buộc trong lược
 * đồ chỉ trả về "vi phạm printers_station_check", còn người đang đứng ở màn hình
 * cần biết máy in tem thì phải chọn trạm nào.
 */
function assertPrinter(input: PrinterInput) {
  if (!input.name.trim()) throw new BadRequestException('Máy in phải có tên')
  if (!input.host.trim()) throw new BadRequestException('Máy in phải có địa chỉ trong mạng LAN')
  if (input.kind === 'tem' && !input.stationId) {
    throw new BadRequestException('Máy in tem phải gán trạm — tem dán ngay tại trạm đóng gói')
  }
  if (input.kind === 'bill' && input.stationId) {
    throw new BadRequestException('Máy in bill đặt ở quầy thu ngân nên không gán trạm')
  }
  if (!TEMPLATES[input.kind].includes(input.template)) {
    throw new BadRequestException(
      `Mẫu in "${input.template}" không dùng được cho máy ${input.kind === 'bill' ? 'in bill' : 'in tem'} — chọn ${TEMPLATES[input.kind].join(' hoặc ')}`,
    )
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new BadRequestException('Cổng máy in nằm trong khoảng 1–65535 (máy in nhiệt thường là 9100)')
  }
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 5) {
    throw new BadRequestException('Số bản in mỗi lượt từ 1 đến 5')
  }
}

/** Dùng ở config bundle: máy in ĐANG BẬT của chi nhánh, dạng cầu in đọc được */
export async function activePrintersOf(db: Db, branchId: string) {
  const rows = await db
    .select()
    .from(printers)
    .where(and(eq(printers.branchId, branchId), eq(printers.active, true)))
    .orderBy(asc(printers.kind), asc(printers.name))
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    stationId: p.stationId,
    host: p.host,
    port: p.port,
    template: p.template,
    copies: p.copies,
  }))
}
