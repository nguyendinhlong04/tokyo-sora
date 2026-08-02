/**
 * Lô hàng — FEFO, hạn dùng, và chia giá của lượt sản xuất (S5 · S7 · S9).
 *
 * Hàm thuần, không CSDL. Ba việc ở đây, và cả ba đều là chỗ mà một lỗi nhỏ chỉ lộ
 * ra sau vài tuần dưới dạng "tồn kho không khớp mà không ai biết vì sao":
 *   1. Rút lô theo hạn gần nhất trước (FEFO).
 *   2. Tính hạn thật của một lô, kể cả keg đã đục.
 *   3. Chia giá đầu vào cho các đầu ra của một lượt pha lóc.
 *
 * NHẮC LẠI RANH GIỚI của `inventory.ts`: FEFO quyết định RÚT LÔ NÀO, không quyết
 * định GHI GIÁ BAO NHIÊU. Tiền vẫn tính bằng bình quân gia quyền di động. Trộn hai
 * thứ đó là biến hệ thành FIFO mà không ai chủ ý quyết định như vậy.
 */

export interface LotForPick {
  id: number
  /** Còn lại bao nhiêu ĐVT cơ sở */
  qtyRemainBase: number
  /** YYYY-MM-DD; null = hàng không hạn (muối, đường) */
  expiresOn: string | null
  /** Lô cũ hơn được ưu tiên khi hai lô cùng hạn — vào trước ra trước */
  receivedOn: string
}

export interface LotPick {
  lotId: number
  qtyBase: number
}

/**
 * Chọn lô để rút cho `needBase` đơn vị, theo FEFO.
 *
 * Thứ tự: hạn gần nhất trước; hàng không hạn xuống cuối; cùng hạn thì lô nhập
 * trước ra trước. Hàng không hạn xuống cuối là có chủ ý — rút con tôm hết hạn
 * ngày mai trước gói muối là điều đúng, và một lô `null` hạn mà đứng đầu sẽ giữ
 * mãi những con tôm đó trong tủ.
 *
 * Trả về danh sách lô kèm lượng rút từng lô. Nếu tổng tồn theo lô KHÔNG đủ thì
 * vẫn trả về những gì rút được cùng `shortBase` — quyết định chặn hay cho âm là
 * việc của tầng dịch vụ, vì nó phụ thuộc loại bút toán: bán thì không chặn được
 * (món đã nấu rồi), còn chuyển kho thì chặn.
 */
export function pickFefo(
  lots: readonly LotForPick[],
  needBase: number,
): { picks: LotPick[]; shortBase: number } {
  if (needBase <= 0) return { picks: [], shortBase: 0 }

  const ordered = [...lots]
    .filter((lot) => lot.qtyRemainBase > 0)
    .sort((a, b) => {
      if (a.expiresOn !== b.expiresOn) {
        if (a.expiresOn === null) return 1
        if (b.expiresOn === null) return -1
        return a.expiresOn < b.expiresOn ? -1 : 1
      }
      if (a.receivedOn !== b.receivedOn) return a.receivedOn < b.receivedOn ? -1 : 1
      return a.id - b.id
    })

  const picks: LotPick[] = []
  let left = needBase
  for (const lot of ordered) {
    if (left <= 0) break
    const take = Math.min(left, lot.qtyRemainBase)
    picks.push({ lotId: lot.id, qtyBase: take })
    left -= take
  }
  return { picks, shortBase: left }
}

export interface LotShelfLife {
  expiresOn: string | null
  state: 'sealed' | 'open'
  openedAt: Date | null
  /** Số ngày dùng được sau khi đục; 0 = không phải keg */
  openShelfLifeDays: number
}

/**
 * Hạn THẬT của một lô.
 *
 * Keg đã đục hỏng sau 5–7 ngày dù vỏ ghi sáu tháng (§25 S9), nên với lô `open`
 * thì hạn là ngày đục cộng `openShelfLifeDays` — và nếu hạn in trên vỏ còn gần
 * hơn thế thì lấy cái gần hơn. Bia không tự tươi lại vì vừa được đục ra.
 */
export function effectiveExpiry(lot: LotShelfLife): string | null {
  if (lot.state !== 'open' || lot.openedAt === null || lot.openShelfLifeDays <= 0) {
    return lot.expiresOn
  }
  const openUntil = new Date(lot.openedAt.getTime() + lot.openShelfLifeDays * 86_400_000)
    .toISOString()
    .slice(0, 10)
  if (lot.expiresOn === null) return openUntil
  return lot.expiresOn < openUntil ? lot.expiresOn : openUntil
}

export type ExpiryBand = 'het-han' | 'sap-het' | 'con-han' | 'khong-han'

/**
 * Xếp một lô vào bốn mức để S1/S9 tô màu.
 *
 * `warnDays` mặc định 3: dưới ba ngày là bếp phải dùng ngay hoặc bỏ. Con số này
 * là tham số ở A6 chứ không phải hằng, vì hải sản và đồ khô không cùng nhịp.
 */
export function expiryBand(
  effectiveExpiresOn: string | null,
  today: string,
  warnDays = 3,
): ExpiryBand {
  if (effectiveExpiresOn === null) return 'khong-han'
  if (effectiveExpiresOn < today) return 'het-han'
  const days = Math.round((Date.parse(effectiveExpiresOn) - Date.parse(today)) / 86_400_000)
  return days <= warnDays ? 'sap-het' : 'con-han'
}

export interface ProductionOutput {
  ingredientId: string
  qtyBase: number
  /** Phần giá gánh, điểm cơ bản. Tổng các dòng ra phải bằng 10000. */
  costShareBp: number
}

/**
 * Chia tổng giá đầu vào cho các đầu ra của một lượt pha lóc.
 *
 * HAO KHÔNG CÓ DÒNG RIÊNG. Lóc 12kg tảng bò được 5,5kg thịt dùng được thì mỗi cân
 * thịt đó phải gánh giá của cả 12kg — đó là lý do tổng `costShareBp` bằng 100% dù
 * tổng trọng lượng ra nhỏ hơn trọng lượng vào. Ghi hao thành một đầu ra rồi chia
 * theo trọng lượng là làm nầm bò rẻ đi một cách giả tạo, và mọi món dùng nầm sẽ
 * báo lãi cao hơn thực tế.
 *
 * Đồng cuối cùng dồn vào dòng LỚN NHẤT thay vì chia đều phần dư: tổng các dòng
 * phải bằng đúng tổng vào, và một đồng lệch trên dòng lớn nhất là chỗ ít méo nhất.
 */
export function allocateProductionCost(
  totalInVnd: number,
  outputs: readonly ProductionOutput[],
): { ingredientId: string; qtyBase: number; costVnd: number; unitCostMilli: number }[] {
  if (outputs.length === 0) return []
  const totalBp = outputs.reduce((sum, o) => sum + o.costShareBp, 0)
  if (totalBp !== 10_000) {
    throw new RangeError(`Tổng tỉ lệ chia giá phải bằng 100%, đang là ${totalBp / 100}%`)
  }

  const rows = outputs.map((output) => ({
    ingredientId: output.ingredientId,
    qtyBase: output.qtyBase,
    costVnd: Math.round((totalInVnd * output.costShareBp) / 10_000),
    unitCostMilli: 0,
  }))

  const drift = totalInVnd - rows.reduce((sum, r) => sum + r.costVnd, 0)
  if (drift !== 0) {
    const biggest = rows.reduce((best, row) => (row.costVnd > best.costVnd ? row : best), rows[0]!)
    biggest.costVnd += drift
  }

  for (const row of rows) {
    row.unitCostMilli = row.qtyBase > 0 ? Math.round((row.costVnd * 1_000) / row.qtyBase) : 0
  }
  return rows
}

/**
 * Chia đều theo trọng lượng — gợi ý ban đầu cho màn S7.
 *
 * Đây chỉ là ĐIỂM XUẤT PHÁT để người pha lóc sửa, không phải mặc định đúng: nầm
 * bò và dẻ sườn cùng ra từ một tảng nhưng không cùng giá trị. Màn S7 hiện con số
 * này rồi để họ gõ đè.
 */
export function shareByWeightBp(outputs: readonly { qtyBase: number }[]): number[] {
  const total = outputs.reduce((sum, o) => sum + o.qtyBase, 0)
  if (total <= 0) return outputs.map(() => 0)
  const raw = outputs.map((o) => Math.round((o.qtyBase * 10_000) / total))
  const drift = 10_000 - raw.reduce((sum, bp) => sum + bp, 0)
  if (drift !== 0 && raw.length > 0) {
    const biggest = raw.indexOf(Math.max(...raw))
    raw[biggest] = raw[biggest]! + drift
  }
  return raw
}

/**
 * Chênh lệch giữa tiêu hao THEO CÔNG THỨC và tiêu hao THỰC TẾ (S11).
 *
 * Dương = dùng nhiều hơn công thức, tức là hao. Âm = dùng ít hơn, thường nghĩa là
 * định lượng công thức khai thừa chứ không phải bếp tiết kiệm được — cả hai chiều
 * đều đáng xem, nên không kẹp về 0.
 */
export function varianceOf(input: {
  theoreticalBase: number
  actualBase: number
  costPerBaseMilli: number
}): { diffBase: number; diffVnd: number; ratio: number | null } {
  const diffBase = input.actualBase - input.theoreticalBase
  return {
    diffBase,
    diffVnd: Math.round((diffBase * input.costPerBaseMilli) / 1_000),
    // Công thức không đòi gì mà thực tế vẫn dùng: tỉ lệ vô nghĩa, để null thay vì ∞
    ratio: input.theoreticalBase > 0 ? diffBase / input.theoreticalBase : null,
  }
}
