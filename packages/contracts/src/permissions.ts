/**
 * Ma trận phân quyền — chép nguyên bảng §4.2 của kế hoạch thiết kế.
 *
 * Đặt ở `contracts` vì cả ba nơi cùng đọc một bảng: guard của API, màn A2 (Vai trò
 * & quyền) của Office, và UI ẩn/hiện nút ở POS. Sửa quyền = sửa đúng một chỗ.
 *
 * Ba quy tắc cứng (§4.3):
 *  1. Mọi thao tác `approve` (dấu △) sinh bản ghi duyệt: ai xin, ai duyệt, lý do,
 *     thời điểm — duyệt bằng PIN ngay trên màn hình nhân viên.
 *  2. Không xoá dữ liệu, chỉ huỷ có dấu vết (bút toán ngược).
 *  3. Quyền xem GIÁ VỐN tách khỏi quyền xem DOANH THU.
 *
 * Và quy tắc phân tách nhiệm vụ (PHẦN G): người duyệt phải KHÁC người xin.
 *
 * Bảng §4.2b (Nhân sự & Chi phí) đã mã hoá đủ ở cuối `ACTIONS`.
 */

export const ROLES = [
  'R0', // Khách tại bàn (token QR)
  'R1', // Phục vụ
  'R2', // Thu ngân
  'R3', // Lễ tân / đặt bàn
  'R4', // Nhân viên bếp
  'R5', // Bếp trưởng
  'R6', // Thủ kho
  'R7', // Quản lý ca
  'R8', // Kế toán
  'R9', // Marketing
  'R10', // Chủ / Admin
  'R11', // Quản lý chuỗi
  'R12', // Điều phối online & đặt bàn (tuỳ chọn)
  'R13', // Quản lý nhân sự
] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  R0: 'Khách tại bàn',
  R1: 'Phục vụ',
  R2: 'Thu ngân',
  R3: 'Lễ tân / đặt bàn',
  R4: 'Nhân viên bếp',
  R5: 'Bếp trưởng',
  R6: 'Thủ kho',
  R7: 'Quản lý ca',
  R8: 'Kế toán',
  R9: 'Marketing',
  R10: 'Chủ / Admin',
  R11: 'Quản lý chuỗi',
  R12: 'Điều phối online & đặt bàn',
  R13: 'Quản lý nhân sự',
}

/** `allow` = ✓ · `approve` = △ (cần người khác duyệt bằng PIN) · `deny` = – */
export type Permission = 'allow' | 'approve' | 'deny'

export interface ActionDef {
  label: string
  /** Chỉ liệt kê ✓ và △; vai trò không có mặt mặc định là `deny` */
  grants: Partial<Record<Role, Exclude<Permission, 'deny'>>>
  note?: string
}

const A = 'allow' as const
const P = 'approve' as const

/**
 * Bảng §4.2. Khoá hành động dùng tiếng Anh dạng `miền.việc` để guard tra cứu;
 * `label` giữ nguyên tiếng Việt để màn A2 render đúng chữ trong tài liệu.
 */
export const ACTIONS = {
  'menu.view-price': {
    label: 'Xem thực đơn (giá bán)',
    grants: { R0: A, R1: A, R2: A, R3: A, R4: A, R5: A, R7: A, R8: A, R9: A, R11: A, R12: A, R10: A },
  },
  'order.create': {
    label: 'Tạo đơn / gọi món tại bàn',
    grants: { R0: A, R1: A, R2: A, R7: A, R10: A },
  },
  'order.line.edit-unsent': {
    label: 'Sửa món chưa gửi bếp',
    grants: { R0: A, R1: A, R2: A, R7: A, R10: A },
  },
  'order.line.void-sent': {
    label: 'Huỷ món đã gửi bếp',
    grants: { R1: P, R2: P, R5: A, R7: A, R10: A },
  },
  'table.move-merge-split': {
    label: 'Chuyển / ghép / tách bàn',
    grants: { R1: A, R2: A, R3: A, R7: A, R10: A },
  },
  'bill.discount-upto-10': {
    label: 'Giảm giá ≤ 10%',
    grants: { R2: P, R7: A, R10: A },
  },
  'bill.discount-over-10': {
    label: 'Giảm giá > 10% / tặng món',
    grants: { R7: P, R10: A },
  },
  'bill.void-printed': {
    label: 'Huỷ hoá đơn đã in',
    grants: { R2: P, R7: A, R10: A },
  },
  'payment.self-serve': {
    label: 'Khách tự thanh toán tại bàn',
    grants: { R0: A },
  },
  'payment.reconcile-self-serve': {
    label: 'Xác nhận / đối soát khoản khách tự trả',
    grants: { R1: A, R2: A, R7: A, R8: A, R10: A },
  },
  /**
   * Dòng thứ 58 — §4.2 trong tài liệu thiết kế chưa có việc này, và đó là lý do
   * ban đầu nút "Đã mang ra" phải mượn tạm khoá của bếp.
   *
   * Người bưng món ra bàn là PHỤC VỤ, không phải nhân viên bếp. Mượn khoá của bếp
   * thì nhật ký ghi "thiết bị màn bếp" chứ không ghi ai — món thất lạc là không
   * truy được người. Và trạng thái khách nhìn thấy là "Đã ra", nghĩa là đã ở trên
   * bàn; người đặt nó lên bàn mới là người được xác nhận điều đó.
   */
  'order.mark-served': {
    label: 'Xác nhận đã mang món ra bàn',
    grants: { R1: A, R2: A, R7: A, R10: A },
  },
  'table.close-after-paid': {
    label: 'Đóng bàn sau khi trả đủ',
    grants: { R1: A, R2: A, R7: A, R10: A },
  },
  'shift.drawer-close-count': {
    label: 'Mở két / đóng ca / kiểm quỹ',
    grants: { R2: A, R7: A, R8: A, R10: A },
  },
  'kds.change-item-state': {
    label: 'Đổi trạng thái món trên KDS',
    grants: { R4: A, R5: A, R7: A, R10: A },
  },
  'menu.mark-sold-out': {
    label: 'Báo hết món (86)',
    grants: { R1: P, R4: P, R5: A, R7: A, R10: A },
  },
  'online-order.confirm': {
    label: 'Nhận / xác nhận đơn online',
    grants: { R2: A, R7: A, R12: A, R10: A },
  },
  'online-order.assign-shipper-or-cancel': {
    label: 'Gán shipper / huỷ đơn online',
    grants: { R2: A, R7: A, R12: A, R10: A },
    note: 'R2 thao tác qua P16; huỷ đơn vẫn cần lý do và ghi nhật ký',
  },
  'reservation.confirm-or-noshow': {
    label: 'Xác nhận đặt bàn / đánh no-show',
    grants: { R1: A, R3: A, R7: A, R12: A, R10: A },
  },
  'cost.view-recipe': {
    label: 'Xem giá vốn & công thức',
    grants: { R4: A, R5: A, R6: A, R7: A, R8: A, R11: A, R10: A },
    note: 'R4 chỉ thấy công thức của món thuộc trạm mình (lọc thêm ở tầng truy vấn)',
  },
  'recipe.edit': {
    label: 'Sửa công thức / định lượng (cấp chuỗi)',
    grants: { R5: A, R7: P, R11: A, R10: A },
  },
  'menu.edit-price': {
    label: 'Sửa giá bán',
    grants: { R7: P, R11: A, R10: A },
  },
  'stock.receive': {
    label: 'Nhập kho / nhận hàng',
    grants: { R6: A, R7: A, R10: A },
  },
  'stock.write-off': {
    label: 'Xuất huỷ / điều chỉnh tồn',
    grants: { R5: P, R6: P, R7: A, R10: A },
  },
  'stock.close-count': {
    label: 'Chốt kiểm kê',
    grants: { R6: P, R7: A, R8: A, R10: A },
  },
  'report.branch-revenue': {
    label: 'Báo cáo doanh thu chi nhánh',
    grants: { R7: A, R8: A, R11: A, R10: A },
  },
  'report.margin-foodcost': {
    label: 'Báo cáo lãi gộp / food cost',
    grants: { R5: A, R7: A, R8: A, R11: A, R10: A },
  },
  'report.compare-branches': {
    label: 'So sánh liên chi nhánh',
    grants: { R8: A, R11: A, R10: A },
  },
  'accounting.ledger-close-period': {
    label: 'Sổ kế toán / khoá sổ kỳ',
    grants: { R8: A, R10: A },
  },
  'einvoice.void-replace-adjust': {
    label: 'Huỷ / thay thế / điều chỉnh HĐĐT',
    grants: { R7: P, R8: A, R10: A },
  },
  'cms.edit': {
    label: 'Sửa nội dung website',
    grants: { R9: A, R10: A },
  },
  'admin.manage-accounts-roles': {
    label: 'Quản lý tài khoản & quyền',
    grants: { R10: A },
  },
  'audit.view-log': {
    label: 'Xem nhật ký thao tác',
    grants: { R7: A, R8: A, R11: A, R10: A },
  },

  // ===================================================== §4.2b — Nhân sự
  //
  // Cột `NV` của tài liệu = mọi nhân viên vận hành, tức R1–R6. R9 và R12 KHÔNG
  // nằm trong nhóm đó và cũng không có cột riêng trong bảng, nên ở đây là `deny`
  // — kể cả với dòng "xem của mình". Đó là điều bảng nói, và sửa nó là việc của
  // bản thiết kế chứ không phải của lớp cài đặt.

  'staff.view-own-record': {
    label: 'Xem lịch làm, bảng công, phiếu lương của mình',
    grants: { R1: A, R2: A, R3: A, R4: A, R5: A, R6: A, R7: A, R8: A, R13: A, R11: A, R10: A },
  },
  'schedule.publish': {
    label: 'Xếp & công bố lịch chi nhánh',
    grants: { R7: A, R13: A, R10: A },
  },
  'timesheet.edit-manual': {
    label: 'Sửa công tay (kèm lý do, ghi nhật ký)',
    grants: { R7: P, R13: A, R10: A },
  },
  'timesheet.close-period': {
    label: 'Chốt công kỳ',
    grants: { R13: A, R10: A },
  },
  'payroll.view-others': {
    label: 'Xem lương người khác',
    grants: { R8: A, R13: A, R10: A },
    note: 'Nguyên tắc cứng thứ tư: R7 quản lý ca thấy CÔNG của nhân viên mình nhưng không bao giờ thấy LƯƠNG',
  },
  'payroll.configure': {
    label: 'Cấu hình cơ chế lương & thưởng',
    grants: { R13: A, R10: A },
  },
  'payroll.compute-draft': {
    label: 'Tính kỳ lương nháp',
    grants: { R13: A, R10: A },
  },
  // Ba khoá dưới đây cùng đến từ MỘT dòng của bảng — "Duyệt & phát lương | – | –
  // | kiểm | trình | – | ✓". Dòng đó đặt ba vai khác nhau vào ba bước khác nhau
  // của cùng một luồng, nên gộp thành một khoá sẽ cho R8 quyền duyệt và cho R13
  // quyền phát tiền — cả hai đều sai so với tài liệu.
  'payroll.submit': {
    label: 'Trình kỳ lương để duyệt',
    grants: { R13: A, R10: A },
  },
  'payroll.check': {
    label: 'Kiểm kỳ lương trước khi duyệt',
    grants: { R8: A, R10: A },
  },
  'payroll.approve-pay': {
    label: 'Duyệt & phát lương',
    grants: { R10: A },
  },

  // ================================================ §4.2b — Chi phí & tài sản

  'expense.record-petty': {
    label: 'Ghi phiếu chi ≤ hạn mức chi vặt',
    grants: { R7: A, R8: A, R10: A },
    note: 'Hạn mức nằm ở Trung tâm tham số A6; kế toán hậu kiểm những phiếu dưới mức',
  },
  'expense.record-over-limit': {
    label: 'Ghi phiếu chi trên hạn mức',
    grants: { R7: P, R8: A, R10: A },
  },
  'expense.approve': {
    label: 'Duyệt phiếu chi / ghi nhận tài sản',
    grants: { R8: A, R10: A },
  },
  'asset.ledger': {
    label: 'Sổ tài sản & khấu hao',
    grants: { R8: A, R10: A },
  },
  /**
   * Hai mức xem Lãi/Lỗ. Đây là nguyên tắc cứng thứ tư nhìn từ phía báo cáo: quản
   * lý ca đọc được tình hình chi nhánh mình, nhưng con số lương thì dừng ở mức
   * TỔNG — không xuống được từng người.
   */
  'report.pnl-full': {
    label: 'Xem Lãi/Lỗ đầy đủ (có chi tiết lương)',
    grants: { R8: A, R11: A, R10: A },
  },
  'report.pnl-branch-summary': {
    label: 'Xem Lãi/Lỗ chi nhánh dạng gộp (không chi tiết lương)',
    grants: { R7: A, R8: A, R11: A, R10: A },
  },

  // ======================= §4.2b — Marketing · Tích điểm · Công nợ khách DN
  //
  // Hai đoạn cuối §4.2b không viết dưới dạng bảng mà dưới dạng văn xuôi:
  //
  //   "Quyền marketing (R9): soạn khuyến mãi/voucher và trả lời phản hồi khách
  //    được phép; KÍCH HOẠT khuyến mãi cần R11/R10 duyệt (vì đụng giá); xem Sổ
  //    khách được nhưng SĐT che 3 số giữa."
  //
  //   "Quyền tích điểm & công nợ: đổi điểm tại quầy — R2 được, trong trần mỗi
  //    giao dịch (tham số); điều chỉnh điểm tay — chỉ R11/R10, kèm lý do, ghi A7;
  //    ghi nợ công ty tại P10 — R2 thao tác nhưng cần R7 duyệt + chữ ký khách;
  //    gạch nợ / xoá nợ — R8, mức lớn R10; hồ sơ khách doanh nghiệp — R2 xem,
  //    R8/R11 sửa."
  //
  // Đó vẫn là bản thiết kế nói, chỉ khác cách trình bày — nên mã hoá ở đây là
  // chép tài liệu, không phải lớp cài đặt tự nghĩ ra quyền. Chỗ nào tài liệu
  // KHÔNG nêu tên vai trò thì `note` ghi rõ vì sao vai trò đó có mặt.

  'promo.compose': {
    label: 'Soạn chương trình khuyến mãi & lô voucher',
    grants: { R9: A, R11: A, R10: A },
    note: 'R11 có mặt vì khuyến mãi là danh mục CẤP CHUỖI (§4.1) — cùng lý do R11 sửa được giá bán',
  },
  'promo.activate': {
    label: 'Kích hoạt / dừng chương trình khuyến mãi',
    grants: { R9: P, R11: A, R10: A },
    note: 'Kích hoạt là đụng giá bán nên R9 phải xin duyệt — người duyệt chỉ có thể là R11 hoặc R10',
  },
  'feedback.respond': {
    label: 'Xử lý & trả lời phản hồi khách',
    grants: { R7: A, R9: A, R11: A, R10: A },
    note: 'Tài liệu nêu R9; R7 có mặt vì hàng đợi khiếu nại gán việc cho vận hành chi nhánh và điểm trung bình đổ về B1 của quản lý ca',
  },
  /**
   * Hai khoá cho MỘT màn: đọc được Sổ khách là một chuyện, đọc được đủ mười số
   * điện thoại là chuyện khác. Tách ra vì "SĐT che 3 số giữa với vai trò không
   * cần thấy" (§25 B12) chỉ cưỡng chế được khi có một khoá riêng để hỏi.
   */
  'customer.view-book': {
    label: 'Xem Sổ khách (SĐT che 3 số giữa)',
    grants: { R2: A, R3: A, R7: A, R8: A, R9: A, R11: A, R12: A, R10: A },
  },
  'customer.view-phone-full': {
    label: 'Xem số điện thoại khách đầy đủ',
    grants: { R2: A, R3: A, R7: A, R8: A, R11: A, R12: A, R10: A },
    note: 'R9 marketing cố ý vắng mặt — đó chính là "vai trò không cần thấy" của §25 B12',
  },
  'loyalty.redeem-at-pos': {
    label: 'Đổi điểm cho khách tại quầy (trong trần mỗi giao dịch)',
    grants: { R2: A, R7: A, R10: A },
  },
  'loyalty.adjust-manual': {
    label: 'Điều chỉnh điểm bằng tay (kèm lý do, ghi A7)',
    grants: { R11: A, R10: A },
  },
  'corporate.charge-at-pos': {
    label: 'Ghi nợ công ty tại quầy',
    grants: { R2: P, R7: A, R10: A },
    note: 'R2 thao tác nhưng cần R7 duyệt + chữ ký khách — chữ ký là bằng chứng ngoài hệ thống, PIN duyệt là bằng chứng trong hệ thống',
  },
  'corporate.edit-profile': {
    label: 'Sửa hồ sơ & hạn mức nợ khách doanh nghiệp',
    grants: { R8: A, R11: A, R10: A },
  },
  'corporate.settle-writeoff': {
    label: 'Gạch nợ / xoá nợ khách doanh nghiệp',
    grants: { R8: A, R10: A },
  },
} as const satisfies Record<string, ActionDef>

export type ActionKey = keyof typeof ACTIONS

const RANK: Record<Permission, number> = { deny: 0, approve: 1, allow: 2 }

/** Quyền hiệu lực của một người: lấy mức CAO NHẤT trong các vai trò họ giữ */
export function checkPermission(action: ActionKey, roles: readonly Role[]): Permission {
  let best: Permission = 'deny'
  const grants = ACTIONS[action].grants as Partial<Record<Role, Permission>>
  for (const role of roles) {
    const grant = grants[role]
    if (grant && RANK[grant] > RANK[best]) best = grant
  }
  return best
}

/** Làm được ngay, không cần ai duyệt */
export function can(action: ActionKey, roles: readonly Role[]): boolean {
  return checkPermission(action, roles) === 'allow'
}

/** Làm được nhưng phải có người khác duyệt bằng PIN (dấu △) */
export function needsApproval(action: ActionKey, roles: readonly Role[]): boolean {
  return checkPermission(action, roles) === 'approve'
}

/** Có quyền thực hiện, dù trực tiếp hay qua duyệt */
export function isPermitted(action: ActionKey, roles: readonly Role[]): boolean {
  return checkPermission(action, roles) !== 'deny'
}

export type ApprovalRejection = 'khong-can-duyet' | 'tu-duyet' | 'nguoi-duyet-khong-du-quyen'

/**
 * Kiểm tra một lượt duyệt △.
 * Quy tắc phân tách nhiệm vụ (PHẦN G): **không ai tự duyệt việc của mình**, và
 * người duyệt phải có quyền `allow` cho chính hành động đó.
 */
export function checkApproval(
  action: ActionKey,
  requester: { id: string; roles: readonly Role[] },
  approver: { id: string; roles: readonly Role[] },
): { ok: true } | { ok: false; code: ApprovalRejection } {
  if (!needsApproval(action, requester.roles)) return { ok: false, code: 'khong-can-duyet' }
  if (requester.id === approver.id) return { ok: false, code: 'tu-duyet' }
  if (!can(action, approver.roles)) return { ok: false, code: 'nguoi-duyet-khong-du-quyen' }
  return { ok: true }
}

/** Nguồn dữ liệu cho màn A2 — render đúng lưới ✓ / △ / – trong tài liệu */
export function permissionMatrix(): {
  action: ActionKey
  label: string
  note?: string
  byRole: Record<Role, Permission>
}[] {
  return (Object.keys(ACTIONS) as ActionKey[]).map((action) => {
    const def: ActionDef = ACTIONS[action]
    return {
      action,
      label: def.label,
      ...(def.note ? { note: def.note } : {}),
      byRole: Object.fromEntries(
        ROLES.map((role) => [role, checkPermission(action, [role])]),
      ) as Record<Role, Permission>,
    }
  })
}
