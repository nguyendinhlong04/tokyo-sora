/**
 * Nổ set thành từng món thành phần — BẮT BUỘC trước khi định tuyến xuống bếp.
 * Điểm dễ sai số 1 trong tài liệu đấu nối §9.1: đẩy nguyên "Set Kiwami" xuống một
 * trạm thì bếp không làm được.
 *
 * Cấu trúc set lấy từ prototype (`Sora Web.dc.html` — setDetails.courses): set gồm
 * nhiều CHẶNG (courses: Mở bữa · Bò trên than · Hải sản · Rau nướng · Chốt bữa ·
 * Tráng miệng). "Set nấu theo nhịp — nhân viên mang từng chặng chứ không dọn hết
 * một lượt" ⇒ mỗi chặng rơi vào một ĐỢT ra món khác nhau, tính lệch từ đợt của
 * chính dòng set (để đặt set giữa bữa vẫn đúng nhịp).
 *
 * Quy tắc giá: giá nằm ở DÒNG SET; mọi dòng con giá 0 (§9.2 — giá đóng băng lúc
 * tạo đơn, không tính hai lần).
 */

export interface SetGroupItem {
  dishId: string
  /** Số phần cho MỘT set */
  qty: number
  /** Mô tả định lượng in trên vé bếp: '100g' · '3 con' · '2 bát' */
  portionLabel?: string | null
}

export interface SetGroup {
  id: string
  /** Tên chặng: 'Bò trên than' */
  label: string
  /** null = nhóm cố định lấy hết; số = "chọn N trong danh sách" (§14) */
  pickCount: number | null
  /** Chặng này ra ở đợt thứ mấy tính từ đợt của dòng set (0 = cùng đợt) */
  batchOffset: number
  items: SetGroupItem[]
}

export interface SetDefinition {
  setDishId: string
  /** Nhãn in trên vé bếp để bếp biết các món thuộc cùng một set */
  label: string
  groups: SetGroup[]
}

/** Khách chọn gì cho các nhóm "chọn N trong M" */
export interface SetSelection {
  groupId: string
  /** Cho phép trùng: khách gọi 2 phần cùng một loại bò trong "chọn 4 trong 10" */
  dishIds: string[]
}

/** Dòng set trên đơn (dòng cha) */
export interface SetLineInput {
  lineId: string
  setDishId: string
  /** Khách gọi mấy set */
  qty: number
  batchNo: number
  note?: string | null
}

/** Dòng con sinh ra — đầu vào cho định tuyến */
export interface ExplodedLine {
  parentLineId: string
  dishId: string
  qty: number
  batchNo: number
  setLabel: string
  portionLabel: string | null
  note: string | null
}

export class SetSelectionError extends Error {
  constructor(
    message: string,
    readonly groupId: string,
  ) {
    super(message)
    this.name = 'SetSelectionError'
  }
}

/**
 * Nổ một dòng set thành các dòng con.
 * Ném `SetSelectionError` nếu lựa chọn của khách không hợp lệ — chặn ngay ở tầng
 * tạo đơn, không để set thiếu món trôi xuống bếp.
 */
export function explodeSet(
  line: SetLineInput,
  def: SetDefinition,
  selections: SetSelection[] = [],
): ExplodedLine[] {
  if (line.setDishId !== def.setDishId) {
    throw new SetSelectionError(
      `Dòng set ${line.setDishId} không khớp định nghĩa ${def.setDishId}`,
      '',
    )
  }
  if (!Number.isSafeInteger(line.qty) || line.qty <= 0) {
    throw new SetSelectionError(`Số lượng set không hợp lệ: ${line.qty}`, '')
  }

  const byGroup = new Map(selections.map((s) => [s.groupId, s]))
  const out: ExplodedLine[] = []

  for (const group of def.groups) {
    const chosen = resolveGroupItems(group, byGroup.get(group.id))
    for (const item of chosen) {
      out.push({
        parentLineId: line.lineId,
        dishId: item.dishId,
        qty: item.qty * line.qty,
        batchNo: line.batchNo + group.batchOffset,
        setLabel: def.label,
        portionLabel: item.portionLabel ?? null,
        note: line.note ?? null,
      })
    }
  }

  return out
}

function resolveGroupItems(group: SetGroup, selection: SetSelection | undefined): SetGroupItem[] {
  // Nhóm cố định: lấy hết, lựa chọn của khách không có ý nghĩa
  if (group.pickCount === null) return group.items

  const picked = selection?.dishIds ?? []
  if (picked.length !== group.pickCount) {
    throw new SetSelectionError(
      `Nhóm "${group.label}" cần chọn đúng ${group.pickCount} món, đang có ${picked.length}`,
      group.id,
    )
  }

  const allowed = new Map(group.items.map((i) => [i.dishId, i]))
  return picked.map((dishId) => {
    const item = allowed.get(dishId)
    if (!item) {
      throw new SetSelectionError(
        `Món "${dishId}" không nằm trong nhóm "${group.label}"`,
        group.id,
      )
    }
    return item
  })
}

/** Mọi món có thể xuất hiện trong set — dùng cho M11 tính dải giá vốn min–max */
export function setComponentDishIds(def: SetDefinition): string[] {
  return [...new Set(def.groups.flatMap((g) => g.items.map((i) => i.dishId)))]
}
