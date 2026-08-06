import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import { tableDevices, tableSessions, tables } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { hashToken, newToken } from '../identity/tokens'
import { clientIp, isInsideBranch, trustedHops } from './presence'

export type DeviceState = 'waiting' | 'admitted' | 'rejected'

export interface JoinResult {
  token: string
  deviceId: number
  sessionId: number
  branchId: string
  state: DeviceState
  isHost: boolean
  tableCode: string
}

/**
 * Từng điện thoại trong một bàn — LUONG-QR-BAN.md.
 *
 * Mã QR dán bàn không còn là bí mật, nên việc quét mã KHÔNG còn đồng nghĩa với
 * được gọi món. Lớp này quyết định máy vừa quét đi thẳng vào bàn hay phải đứng
 * chờ người trong bàn duyệt.
 */
@Injectable()
export class TableDeviceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Khách quét mã dán bàn.
   *
   * Máy chứng minh được đang ở trong quán thì vào thẳng; không thì đứng chờ. Máy
   * đầu tiên vào được sẽ nhận vai chủ bàn — nhưng chỉ khi nó đã vào thật, xem
   * `claimHost`.
   */
  async join(input: {
    branchId: string
    tableCode: string
    forwardedFor: string | undefined
  }): Promise<JoinResult> {
    const [row] = await this.db
      .select({ session: tableSessions, table: tables })
      .from(tableSessions)
      .innerJoin(tables, eq(tables.id, tableSessions.tableId))
      .where(
        and(
          eq(tables.branchId, input.branchId),
          eq(tables.code, input.tableCode),
          sql`${tableSessions.status} <> 'closed'`,
        ),
      )
    // Bàn chưa mở thì mã dán trên nó là một tấm giấy vô nghĩa — đây chính là lớp 1
    if (!row) throw new NotFoundException('Bàn chưa mở. Nhờ nhân viên mở bàn giúp bạn.')

    const inside = await this.isInside(input.branchId, input.forwardedFor)
    const token = newToken()

    const [device] = await this.db
      .insert(tableDevices)
      .values({
        tableSessionId: row.session.id,
        tokenHash: hashToken(token),
        state: inside ? 'admitted' : 'waiting',
        admittedVia: inside ? 'wifi' : null,
        admittedAt: inside ? new Date() : null,
      })
      .returning({ id: tableDevices.id })

    const isHost = inside ? await this.claimHost(row.session.id, device!.id) : false

    return {
      token,
      deviceId: device!.id,
      sessionId: row.session.id,
      branchId: row.session.branchId,
      state: inside ? 'admitted' : 'waiting',
      isHost,
      tableCode: row.table.code,
    }
  }

  /** Máy đang chờ hỏi lại "tôi được duyệt chưa" */
  async status(deviceId: number) {
    const device = await this.require(deviceId)
    const [session] = await this.db
      .select({ status: tableSessions.status, id: tableSessions.id })
      .from(tableSessions)
      .where(eq(tableSessions.id, device.tableSessionId))

    return {
      deviceId: device.id,
      state: session?.status === 'closed' ? ('rejected' as DeviceState) : (device.state as DeviceState),
      isHost: device.isHost,
      sessionId: device.tableSessionId,
    }
  }

  /**
   * Danh sách máy đang chờ, kèm BỐI CẢNH cho người duyệt.
   *
   * Số khách và số máy đã vào là thứ duy nhất người duyệt có để biết chuyện này
   * bình thường hay bất thường — lễ tân đã nhập số khách lúc mở bàn nên nó không
   * tốn của ai một thao tác nào. Thiếu nó thì nút Đồng ý chỉ còn là phản xạ.
   */
  async pending(sessionId: number) {
    const [session] = await this.db
      .select({ guestCount: tableSessions.guestCount })
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
    if (!session) throw new NotFoundException('Không có phiên bàn này')

    const rows = await this.db
      .select({ id: tableDevices.id, state: tableDevices.state, createdAt: tableDevices.createdAt })
      .from(tableDevices)
      .where(eq(tableDevices.tableSessionId, sessionId))

    return {
      guestCount: session.guestCount,
      admittedCount: rows.filter((r) => r.state === 'admitted').length,
      waiting: rows
        .filter((r) => r.state === 'waiting')
        .map((r) => ({ deviceId: r.id, since: r.createdAt })),
    }
  }

  /**
   * Chủ bàn hoặc nhân viên trả lời một máy đang chờ.
   *
   * Từ chối là DỨT ĐIỂM cho cả bữa: máy bị từ chối quét lại mã cũng không xin
   * được nữa. Không có chốt đó thì người ở nhà cứ xin lại tới lúc có ai bấm
   * nhầm một lần.
   */
  async decide(input: {
    deviceId: number
    approve: boolean
    actor: Actor
    byDeviceId?: number
  }) {
    return this.db.transaction(async (tx) => {
      const [device] = await tx.select().from(tableDevices).where(eq(tableDevices.id, input.deviceId))
      if (!device) throw new NotFoundException('Không có máy này')
      if (device.state !== 'waiting') {
        throw new ConflictException('Yêu cầu này đã được trả lời rồi')
      }

      const byStaff = input.actor.kind === 'staff'
      if (!byStaff) {
        // Khách chỉ trả lời được cho bàn của chính mình, và chỉ khi là chủ bàn
        const [approver] = await tx
          .select()
          .from(tableDevices)
          .where(eq(tableDevices.id, input.byDeviceId ?? 0))
        if (!approver || approver.tableSessionId !== device.tableSessionId) {
          throw new ForbiddenException('Không trả lời cho bàn khác được')
        }
        if (!approver.isHost) throw new ForbiddenException('Chỉ người mở bàn mới duyệt được')
      }

      await tx
        .update(tableDevices)
        .set(
          input.approve
            ? {
                state: 'admitted',
                admittedVia: byStaff ? 'staff' : 'host',
                admittedByStaffId: byStaff && input.actor.kind === 'staff' ? input.actor.staffId : null,
                admittedAt: new Date(),
              }
            : { state: 'rejected' },
        )
        .where(eq(tableDevices.id, input.deviceId))

      // Máy đầu tiên vào bàn qua đường nhân viên duyệt thì nhận luôn vai chủ bàn
      const isHost = input.approve ? await this.claimHost(device.tableSessionId, device.id, tx) : false

      await this.audit.write(tx, {
        actor: input.actor,
        action: input.approve ? 'table.device.admitted' : 'table.device.rejected',
        entity: 'table_device',
        entityId: String(input.deviceId),
      })

      return { deviceId: input.deviceId, state: input.approve ? 'admitted' : 'rejected', isHost }
    })
  }

  /**
   * Chủ bàn trao vai cho một máy khác trước khi rời đi.
   *
   * Không có đường này thì người mở bàn về sớm là cả bàn hết ai duyệt được, và
   * mọi máy tới sau phải đi nhờ nhân viên.
   */
  async transferHost(fromDeviceId: number, toDeviceId: number) {
    return this.db.transaction(async (tx) => {
      const [from] = await tx.select().from(tableDevices).where(eq(tableDevices.id, fromDeviceId))
      const [to] = await tx.select().from(tableDevices).where(eq(tableDevices.id, toDeviceId))
      if (!from?.isHost) throw new ForbiddenException('Chỉ người mở bàn mới trao được vai này')
      if (!to || to.tableSessionId !== from.tableSessionId) {
        throw new NotFoundException('Không có máy này trong bàn')
      }
      if (to.state !== 'admitted') throw new ConflictException('Máy đó chưa vào bàn')

      // Nhả trước rồi mới gán: chỉ số duy nhất một chủ bàn sẽ chặn nếu làm ngược
      await tx.update(tableDevices).set({ isHost: false }).where(eq(tableDevices.id, fromDeviceId))
      await tx.update(tableDevices).set({ isHost: true }).where(eq(tableDevices.id, toDeviceId))
      return { hostDeviceId: toDeviceId }
    })
  }

  /** Đóng bàn → mọi máy bị đẩy ra, mọi yêu cầu đang chờ chết theo */
  async evictAll(sessionId: number, tx?: Db) {
    const db = tx ?? this.db
    await db
      .update(tableDevices)
      .set({ state: 'rejected', isHost: false })
      .where(
        and(eq(tableDevices.tableSessionId, sessionId), sql`${tableDevices.state} <> 'rejected'`),
      )
  }

  /** Token cookie của máy → máy nào, dùng cho cả lớp xác thực */
  async resolveToken(token: string) {
    const [row] = await this.db
      .select({
        deviceId: tableDevices.id,
        state: tableDevices.state,
        isHost: tableDevices.isHost,
        sessionId: tableSessions.id,
        branchId: tableSessions.branchId,
        sessionStatus: tableSessions.status,
      })
      .from(tableDevices)
      .innerJoin(tableSessions, eq(tableSessions.id, tableDevices.tableSessionId))
      .where(eq(tableDevices.tokenHash, hashToken(token)))
    if (!row || row.sessionStatus === 'closed') return null
    return row
  }

  // ------------------------------------------------------------------ phụ trợ

  /**
   * Nhận vai chủ bàn nếu bàn chưa có ai.
   *
   * Hai máy cùng vào một lúc thì chỉ số `table_devices_one_host` để đúng một máy
   * thắng — không dùng đọc-rồi-ghi vì giữa hai bước đó máy kia đã kịp chen vào.
   */
  private async claimHost(sessionId: number, deviceId: number, tx?: Db): Promise<boolean> {
    const db = tx ?? this.db
    try {
      const updated = await db
        .update(tableDevices)
        .set({ isHost: true })
        .where(
          and(
            eq(tableDevices.id, deviceId),
            eq(tableDevices.state, 'admitted'),
            sql`NOT EXISTS (
              SELECT 1 FROM table_devices h
               WHERE h.table_session_id = ${sessionId} AND h.is_host
            )`,
          ),
        )
        .returning({ id: tableDevices.id })
      return updated.length > 0
    } catch (err) {
      // Máy khác vừa giành được vai — không phải lỗi, chỉ là mình về sau
      if (isUniqueViolation(err, 'table_devices_one_host')) return false
      throw err
    }
  }

  private async isInside(branchId: string, forwardedFor: string | undefined): Promise<boolean> {
    const networks = await this.params.get<unknown>('table.branchNetworks', branchId)
    const allowed = Array.isArray(networks) ? networks.filter((n): n is string => typeof n === 'string') : []
    return isInsideBranch(clientIp(forwardedFor, trustedHops()), allowed)
  }

  private async require(deviceId: number) {
    const [row] = await this.db.select().from(tableDevices).where(eq(tableDevices.id, deviceId))
    if (!row) throw new NotFoundException('Không có máy này')
    return row
  }
}
