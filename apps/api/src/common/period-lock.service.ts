import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { DB } from './db.module'
import type { Db } from '../db/client'
import { periodLocks } from '../db/schema'

/**
 * Chốt chặn khoá sổ (§28 F6) — dùng chung cho mọi miền có thể sửa số liệu kỳ cũ.
 *
 * Đặt ở `common` thay vì trong miền kế toán vì bốn miền khác nhau phải hỏi nó:
 * doanh thu (huỷ món), chi phí (phiếu chi), nhân sự (lịch và kỳ lương), và kho
 * (điều chỉnh tồn). Nếu nó nằm trong `AccountingModule` — module vốn phải ĐỌC
 * chi phí và nhân sự để dựng tờ khai — thì bốn miền kia nhập ngược lại sẽ thành
 * vòng phụ thuộc. Guard này chỉ đọc đúng một bảng nên không kéo theo gì cả.
 *
 * KHÔNG CÓ MỞ KHOÁ. Đó là toàn bộ giá trị của F6: sửa sai kỳ đã chốt là việc của
 * bút toán điều chỉnh ở kỳ sau, không phải việc của một nút.
 */
@Injectable()
export class PeriodLockService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Các tháng đã khoá của một chi nhánh */
  async lockedMonths(branchId: string): Promise<string[]> {
    const rows = await this.db
      .select({ month: periodLocks.month })
      .from(periodLocks)
      .where(eq(periodLocks.branchId, branchId))
    return rows.map((r) => r.month)
  }

  async isLocked(branchId: string, businessDate: string): Promise<boolean> {
    const [row] = await this.db
      .select({ month: periodLocks.month })
      .from(periodLocks)
      .where(
        and(eq(periodLocks.branchId, branchId), eq(periodLocks.month, monthOf(businessDate))),
      )
    return Boolean(row)
  }

  /**
   * Chặn thao tác chạm vào một kỳ đã khoá.
   *
   * Nhận NHIỀU ngày vì một thao tác có thể trải qua nhiều tháng — tuần lịch vắt
   * qua mốc tháng là chuyện thường, và khoá một trong hai tháng đó là đủ để cả
   * tuần không sửa được.
   */
  async assertOpen(branchId: string, businessDates: string[], what: string): Promise<void> {
    const months = [...new Set(businessDates.map(monthOf))]
    if (months.length === 0) return

    const rows = await this.db
      .select({ month: periodLocks.month })
      .from(periodLocks)
      .where(and(eq(periodLocks.branchId, branchId), inArray(periodLocks.month, months)))

    if (rows.length === 0) return

    throw new ConflictException({
      code: 'period_closed',
      message: `Kỳ ${rows.map((r) => r.month.slice(0, 7)).join(', ')} đã khoá sổ — ${what} của kỳ đã chốt phải đi qua bút toán điều chỉnh ở kỳ sau`,
    })
  }
}

function monthOf(businessDate: string): string {
  return `${businessDate.slice(0, 7)}-01`
}
