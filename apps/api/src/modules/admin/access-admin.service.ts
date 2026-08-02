import { hash as argonHash } from '@node-rs/argon2'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ROLES, ROLE_LABELS, type Role } from '@sora/contracts'
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import { auditLog, branches, employees, staff, staffRoles, staffSessions } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

export interface RoleGrant {
  roleCode: Role
  /** null = phạm vi toàn chuỗi */
  branchId: string | null
}

export interface AccountInput {
  code: string
  fullName: string
  phone: string | null
  email: string | null
  active: boolean
}

/** Vai trò mở được màn quản trị — mất hết là không ai vào lại được A1 */
const ADMIN_ROLE: Role = 'R10'

/** Dùng khi không tra được chi nhánh nào — cùng mặc định với cột `branches.timezone` */
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'

/**
 * A1 · A2 · A7 — ai là ai, ai được làm gì, và ai đã làm gì.
 *
 * Ba màn này là một cụm chứ không phải ba việc rời: tài khoản sinh ra quyền,
 * quyền quyết định hành động, hành động rơi xuống nhật ký. Đọc chúng cạnh nhau là
 * cách duy nhất trả lời được câu hỏi thật của người quản lý — "ai vừa sửa cái
 * này, và vì sao họ sửa được".
 *
 * Ma trận quyền KHÔNG nằm ở đây và cũng không nằm trong CSDL: nó là hằng typed ở
 * `@sora/contracts` để guard của API, màn A2 và POS cùng đọc một nguồn. A2 vì thế
 * là màn ĐỌC ma trận, không phải màn sửa ma trận — sửa quyền là sửa bản thiết kế
 * rồi sửa hằng đó, không phải bấm nút lúc 11 giờ đêm.
 */
@Injectable()
export class AccessAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  // ================================================================= A1

  /**
   * Danh sách tài khoản kèm vai trò đã phân.
   *
   * Trả `hasPassword` / `hasPin` chứ không trả bản băm: người quản lý cần biết
   * tài khoản này vào được cửa nào (Office bằng email, hay POS bằng PIN), còn bản
   * băm thì không ai cần nhìn và mọi lần nó rời khỏi CSDL đều là một rủi ro thừa.
   */
  async accounts() {
    const [rows, roleRows, employeeRows] = await Promise.all([
      this.db.select().from(staff).orderBy(asc(staff.code)),
      this.db.select().from(staffRoles),
      this.db
        .select({ staffId: employees.staffId, branchId: employees.branchId })
        .from(employees)
        .where(eq(employees.active, true)),
    ])

    return rows.map((person) => ({
      id: person.id,
      code: person.code,
      fullName: person.fullName,
      phone: person.phone,
      email: person.email,
      active: person.active,
      hasPassword: person.passwordHash !== null,
      hasPin: person.pinHash !== null,
      roles: roleRows
        .filter((r) => r.staffId === person.id)
        .map((r) => ({ roleCode: r.roleCode as Role, branchId: r.branchId }))
        .sort((a, b) => a.roleCode.localeCompare(b.roleCode)),
      /** Chi nhánh của hồ sơ lương H1 — tài khoản chưa có hồ sơ thì không vào kỳ lương */
      employeeBranchId: employeeRows.find((e) => e.staffId === person.id)?.branchId ?? null,
    }))
  }

  /**
   * Tạo tài khoản.
   *
   * Bắt buộc có ÍT NHẤT MỘT cách đăng nhập và ÍT NHẤT MỘT vai trò. Không phải để
   * làm khó: tài khoản không có PIN lẫn mật khẩu thì không đăng nhập được ở đâu,
   * còn tài khoản không có vai trò thì `loginWithPin` từ chối ngay lúc đăng nhập.
   * Cả hai đều là bản ghi chết mà người tạo chỉ phát hiện ra vào ca sau.
   */
  async createAccount(
    input: AccountInput & { password: string | null; pin: string | null; roles: RoleGrant[] },
    actor: Actor,
  ) {
    if (!input.password && !input.pin) {
      throw new BadRequestException(
        'Tài khoản phải có ít nhất một cách đăng nhập: mật khẩu cho Office hoặc PIN cho POS',
      )
    }
    if (input.password && !input.email) {
      throw new BadRequestException('Đăng nhập Office bằng email — đặt mật khẩu thì phải có email')
    }
    if (input.roles.length === 0) {
      throw new BadRequestException('Tài khoản phải được phân ít nhất một vai trò')
    }
    assertPin(input.pin)
    assertPassword(input.password)
    await this.assertBranchesExist(input.roles)

    const created = await this.insertAccount(input)
    await this.db.insert(staffRoles).values(
      input.roles.map((r) => ({ staffId: created.id, roleCode: r.roleCode, branchId: r.branchId })),
    )
    await this.write(actor, 'account.created', String(created.id), {
      code: input.code,
      email: input.email,
      roles: input.roles,
    })
    return this.accountView(created.id)
  }

  /**
   * Sửa thông tin tài khoản.
   *
   * Ngừng hoạt động là cách DUY NHẤT cho người nghỉ việc rời hệ thống — không có
   * xoá. Đơn cũ, phiếu chi cũ, phiếu lương cũ đều trỏ về `staff.id`; xoá một dòng
   * ở đây là cắt mất tên người thao tác trên hàng nghìn bản ghi lịch sử.
   */
  async updateAccount(id: number, input: Partial<AccountInput>, actor: Actor) {
    const current = await this.requireAccount(id)

    if (input.active === false) await this.assertNotLastAdmin(id, 'ngừng hoạt động')

    const patch: Record<string, unknown> = {}
    if (input.code !== undefined) patch.code = input.code.trim()
    if (input.fullName !== undefined) patch.fullName = input.fullName.trim()
    if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
    if (input.email !== undefined) patch.email = input.email?.trim().toLowerCase() || null
    if (input.active !== undefined) patch.active = input.active

    if (patch.email === null && current.passwordHash !== null) {
      throw new BadRequestException(
        'Tài khoản này đăng nhập Office bằng email — xoá email là khoá luôn cửa vào',
      )
    }
    if (Object.keys(patch).length === 0) return this.accountView(id)

    try {
      await this.db.update(staff).set(patch).where(eq(staff.id, id))
    } catch (err) {
      throw this.friendlyUnique(err)
    }

    // Ngừng hoạt động phải cắt luôn phiên đang mở: `resolveStaffSession` không đọc
    // cột `active`, nên không cắt thì người vừa bị khoá vẫn thao tác được tới khi
    // phiên hết hạn — tức là tới 12 tiếng sau.
    if (input.active === false) await this.revokeSessionsOf(id)

    await this.write(actor, 'account.updated', String(id), patch)
    return this.accountView(id)
  }

  /** Đặt lại mật khẩu Office. Bản băm không bao giờ đi vào nhật ký. */
  async setPassword(id: number, password: string, actor: Actor) {
    const current = await this.requireAccount(id)
    if (!current.email) {
      throw new BadRequestException('Đặt email cho tài khoản trước khi đặt mật khẩu Office')
    }
    assertPassword(password)
    await this.db.update(staff).set({ passwordHash: await argonHash(password) }).where(eq(staff.id, id))
    // Đổi mật khẩu là để chặn người đang giữ nó — phiên cũ phải chết theo
    await this.revokeSessionsOf(id)
    await this.write(actor, 'account.password-reset', String(id), { code: current.code })
    return { id, hasPassword: true }
  }

  /** Đặt lại PIN vận hành (POS · KDS · kiosk chấm công) */
  async setPin(id: number, pin: string, actor: Actor) {
    const current = await this.requireAccount(id)
    assertPin(pin)
    await this.db.update(staff).set({ pinHash: await argonHash(pin) }).where(eq(staff.id, id))
    await this.revokeSessionsOf(id)
    await this.write(actor, 'account.pin-reset', String(id), { code: current.code })
    return { id, hasPin: true }
  }

  /**
   * Thay toàn bộ vai trò của một tài khoản.
   *
   * Thay cả cụm chứ không thêm/bớt từng dòng: người sửa nhìn thấy trạng thái cuối
   * cùng trên màn hình và bấm lưu, nên gửi đúng thứ họ nhìn thấy là cách duy nhất
   * không sinh ra chênh lệch giữa màn hình và CSDL.
   */
  async setRoles(id: number, roles: RoleGrant[], actor: Actor) {
    const current = await this.requireAccount(id)
    if (roles.length === 0) {
      throw new BadRequestException('Tài khoản phải giữ ít nhất một vai trò')
    }
    await this.assertBranchesExist(roles)
    if (!roles.some((r) => r.roleCode === ADMIN_ROLE)) {
      await this.assertNotLastAdmin(id, 'bỏ vai trò Chủ / Admin')
    }

    const unique = roles.filter(
      (r, i) =>
        roles.findIndex((o) => o.roleCode === r.roleCode && o.branchId === r.branchId) === i,
    )

    await this.db.transaction(async (tx) => {
      await tx.delete(staffRoles).where(eq(staffRoles.staffId, id))
      await tx
        .insert(staffRoles)
        .values(unique.map((r) => ({ staffId: id, roleCode: r.roleCode, branchId: r.branchId })))
      await this.audit.write(tx, {
        actor,
        action: 'account.roles-changed',
        entity: 'account',
        entityId: String(id),
        payload: { code: current.code, roles: unique },
      })
    })

    // Quyền đổi thì phiên đang mở phải dựng lại: `resolveStaffSession` đọc vai trò
    // mỗi request nên quyền MỚI có hiệu lực ngay, nhưng chi nhánh của phiên thì
    // không đổi — người vừa bị rút vai trò ở chi nhánh đó cần đăng nhập lại.
    await this.revokeSessionsOf(id)
    return this.accountView(id)
  }

  // ================================================================= A2

  /**
   * Nguồn cho tab "Hạn mức & phạm vi" của A2.
   *
   * Ma trận ✓/△/– thì màn hình tự dựng từ `@sora/contracts` — không đi qua mạng
   * để lấy một hằng mà máy trạm đã có. Thứ máy chủ mới biết là **ai đang giữ vai
   * trò nào ở chi nhánh nào**: đó mới là câu người quản lý hỏi khi mở A2.
   */
  async roleAssignments() {
    const [roleRows, branchRows] = await Promise.all([
      this.db
        .select({
          roleCode: staffRoles.roleCode,
          branchId: staffRoles.branchId,
          staffId: staff.id,
          fullName: staff.fullName,
          active: staff.active,
        })
        .from(staffRoles)
        .innerJoin(staff, eq(staff.id, staffRoles.staffId))
        .orderBy(asc(staff.fullName)),
      this.db.select({ id: branches.id, name: branches.name }).from(branches).orderBy(asc(branches.id)),
    ])

    const live = roleRows.filter((r) => r.active)
    return {
      branches: branchRows,
      roles: ROLES.map((role) => {
        const mine = live.filter((r) => r.roleCode === role)
        return {
          code: role,
          label: ROLE_LABELS[role],
          /** Người giữ vai trò này ở phạm vi toàn chuỗi */
          chainWide: mine
            .filter((r) => r.branchId === null)
            .map((r) => ({ staffId: r.staffId, fullName: r.fullName })),
          byBranch: Object.fromEntries(
            branchRows.map((b) => [
              b.id,
              mine.filter((r) => r.branchId === b.id).map((r) => ({ staffId: r.staffId, fullName: r.fullName })),
            ]),
          ),
        }
      }),
    }
  }

  // ================================================================= A7

  /**
   * Nhật ký thao tác.
   *
   * Phân trang bằng CON TRỎ (`beforeId`) chứ không bằng OFFSET: sổ này chỉ thêm ở
   * đầu, nên trong lúc người đọc lật trang thì OFFSET sẽ đẩy các dòng trôi xuống
   * và họ đọc lại chính dòng vừa xem. Con trỏ theo id giảm dần thì không.
   */
  async auditTrail(filter: {
    branchId: string | null
    /** Chi nhánh của người đang xem — quyết định múi giờ khi lọc cả chuỗi */
    viewerBranchId: string | null
    from: string
    to: string
    action: string | null
    actorId: number | null
    beforeId: number | null
    limit: number
  }) {
    const window = await this.window(filter)
    const where = [gte(auditLog.createdAt, window.start), lt(auditLog.createdAt, window.end)]
    if (filter.branchId) where.push(eq(auditLog.branchId, filter.branchId))
    if (filter.action) where.push(eq(auditLog.action, filter.action))
    if (filter.actorId !== null) {
      where.push(and(eq(auditLog.actorKind, 'staff'), eq(auditLog.actorId, String(filter.actorId)))!)
    }
    if (filter.beforeId !== null) where.push(lt(auditLog.id, filter.beforeId))

    const rows = await this.db
      .select({ log: auditLog, actorName: staff.fullName })
      .from(auditLog)
      .leftJoin(
        staff,
        and(eq(auditLog.actorKind, 'staff'), eq(sql`${auditLog.actorId}::bigint`, staff.id)),
      )
      .where(and(...where))
      .orderBy(desc(auditLog.id))
      .limit(filter.limit + 1)

    const page = rows.slice(0, filter.limit)
    return {
      rows: page.map(({ log, actorName }) => ({
        id: log.id,
        branchId: log.branchId,
        actorKind: log.actorKind,
        actorId: log.actorId,
        actorName,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        payload: log.payload,
        approvalId: log.approvalId,
        deviceId: log.deviceId,
        createdAt: log.createdAt,
      })),
      /** id để xin trang kế; null là đã hết */
      nextBefore: rows.length > filter.limit ? (page.at(-1)?.log.id ?? null) : null,
    }
  }

  /** Danh sách hành động CÓ THẬT trong khoảng đang xem — nguồn cho ô lọc */
  async auditActions(filter: {
    branchId: string | null
    viewerBranchId: string | null
    from: string
    to: string
  }) {
    const window = await this.window(filter)
    const where = [gte(auditLog.createdAt, window.start), lt(auditLog.createdAt, window.end)]
    if (filter.branchId) where.push(eq(auditLog.branchId, filter.branchId))

    const [actions, actors] = await Promise.all([
      this.db
        .selectDistinct({ action: auditLog.action })
        .from(auditLog)
        .where(and(...where))
        .orderBy(asc(auditLog.action)),
      this.db
        .selectDistinct({ actorId: auditLog.actorId })
        .from(auditLog)
        .where(and(...where, eq(auditLog.actorKind, 'staff'))),
    ])

    const ids = actors.map((a) => Number(a.actorId)).filter((n) => Number.isFinite(n))
    const people = ids.length
      ? await this.db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, ids))
          .orderBy(asc(staff.fullName))
      : []

    return { actions: actions.map((a) => a.action), actors: people }
  }

  // ============================================================== phụ trợ

  /**
   * Khoảng thời gian tuyệt đối của một dải ngày, theo MÚI GIỜ CHI NHÁNH.
   *
   * Cắt theo nửa đêm UTC sẽ lệch bảy tiếng: người quản lý chọn "hôm nay" mà thao
   * tác lúc 0h30 sáng lại rơi vào khoảng của ngày hôm trước — đúng những giờ mà
   * người đọc nhật ký quan tâm nhất. Biên trên lấy 00:00 của ngày kế rồi so `<`,
   * nên khoảng bao gồm trọn ngày `to` mà không phải tin vào 23:59:59.999.
   */
  private async window(filter: {
    branchId: string | null
    viewerBranchId: string | null
    from: string
    to: string
  }) {
    const timezone = await this.timezoneOf(filter.branchId ?? filter.viewerBranchId)
    return {
      start: startOfBusinessDay(filter.from, timezone),
      end: startOfBusinessDay(nextDay(filter.to), timezone),
    }
  }

  private async timezoneOf(branchId: string | null): Promise<string> {
    if (!branchId) return DEFAULT_TIMEZONE
    const [row] = await this.db
      .select({ timezone: branches.timezone })
      .from(branches)
      .where(eq(branches.id, branchId))
    return row?.timezone ?? DEFAULT_TIMEZONE
  }

  private async insertAccount(input: AccountInput & { password: string | null; pin: string | null }) {
    try {
      const [row] = await this.db
        .insert(staff)
        .values({
          code: input.code.trim(),
          fullName: input.fullName.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          passwordHash: input.password ? await argonHash(input.password) : null,
          pinHash: input.pin ? await argonHash(input.pin) : null,
          active: input.active,
        })
        .returning({ id: staff.id })
      return row!
    } catch (err) {
      throw this.friendlyUnique(err)
    }
  }

  private friendlyUnique(err: unknown) {
    if (isUniqueViolation(err, 'staff_code_unique')) {
      return new ConflictException('Mã nhân viên này đã có người dùng')
    }
    if (isUniqueViolation(err, 'staff_email_unique')) {
      return new ConflictException('Email này đã gắn với tài khoản khác')
    }
    return err
  }

  /**
   * Không để hệ thống mất người quản trị cuối cùng.
   *
   * Không có cửa hậu nào để phục hồi: mọi màn quản trị đứng sau
   * `admin.manage-accounts-roles` mà chỉ R10 có, nên tài khoản R10 cuối cùng bị
   * khoá là phải vào thẳng CSDL bằng psql mới mở lại được.
   */
  private async assertNotLastAdmin(id: number, what: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(staffRoles)
      .innerJoin(staff, eq(staff.id, staffRoles.staffId))
      .where(
        and(
          eq(staffRoles.roleCode, ADMIN_ROLE),
          eq(staff.active, true),
          sql`${staff.id} <> ${id}`,
        ),
      )
    if (Number(row?.count ?? 0) === 0) {
      throw new ConflictException(
        `Đây là tài khoản Chủ / Admin đang hoạt động cuối cùng — ${what} là không ai vào lại được màn quản trị. Lập tài khoản Chủ khác trước.`,
      )
    }
  }

  private async assertBranchesExist(roles: RoleGrant[]) {
    const wanted = [...new Set(roles.map((r) => r.branchId).filter((b): b is string => b !== null))]
    if (wanted.length === 0) return
    const rows = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(inArray(branches.id, wanted))
    const missing = wanted.filter((b) => !rows.some((r) => r.id === b))
    if (missing.length > 0) {
      throw new BadRequestException(`Không có chi nhánh ${missing.join(', ')}`)
    }
  }

  private async requireAccount(id: number) {
    const [row] = await this.db.select().from(staff).where(eq(staff.id, id))
    if (!row) throw new NotFoundException('Không có tài khoản này')
    return row
  }

  private async revokeSessionsOf(staffId: number) {
    await this.db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(staffSessions.staffId, staffId),
          sql`${staffSessions.revokedAt} IS NULL`,
          gte(staffSessions.expiresAt, new Date()),
        ),
      )
  }

  private async accountView(id: number) {
    return (await this.accounts()).find((a) => a.id === id)!
  }

  private async write(actor: Actor, action: string, entityId: string, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, { actor, action, entity: 'account', entityId, payload })
    })
  }
}

/** PIN 4–6 số, đúng ràng buộc mà `loginWithPin` kiểm lúc đăng nhập */
function assertPin(pin: string | null) {
  if (pin === null) return
  if (!/^\d{4,6}$/.test(pin)) throw new BadRequestException('PIN gồm 4 đến 6 chữ số')
  if (/^(\d)\1+$/.test(pin)) throw new BadRequestException('PIN không đặt toàn một chữ số giống nhau')
}

function assertPassword(password: string | null) {
  if (password === null) return
  if (password.length < 8) throw new BadRequestException('Mật khẩu Office tối thiểu 8 ký tự')
}

/** Ngày kế tiếp theo lịch, dùng làm biên trên nửa mở của khoảng lọc */
function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)
}
