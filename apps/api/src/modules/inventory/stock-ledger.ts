import { and, asc, eq, gt, sql } from 'drizzle-orm'
import type { Tx } from '../../common/tx'
import { ingredients, stockLevels, stockLots } from '../../db/schema'
import { pickFefo, type LotPick } from './domain/lots'

/**
 * Hai thao tác mà MỌI cửa ghi sổ kho đều phải đi qua: cộng/trừ tồn, và rút lô.
 *
 * Để ở hàm tự do thay vì phương thức của service vì cả `InventoryService` (bếp
 * bấm Xong) lẫn `WarehouseService` (S5–S10) đều gọi, và cả hai gọi từ bên trong
 * một transaction đã mở. Nhét vào một service rồi tiêm chéo chỉ tạo vòng phụ
 * thuộc mà không đổi được gì về hành vi.
 */

/** Cộng dồn tồn của một nguyên liệu ở một chi nhánh. `delta` mang dấu. */
export async function bumpStock(
  tx: Tx,
  branchId: string,
  ingredientId: string,
  delta: number,
): Promise<void> {
  await tx
    .insert(stockLevels)
    .values({ branchId, ingredientId, qtyBase: delta })
    .onConflictDoUpdate({
      target: [stockLevels.branchId, stockLevels.ingredientId],
      set: {
        qtyBase: sql`${stockLevels.qtyBase} + ${delta}`,
        updatedAt: new Date(),
      },
    })
}

/**
 * Rút lô theo FEFO và trừ số còn lại của từng lô.
 *
 * Trả về danh sách lô đã rút để nơi gọi gắn vào bút toán — mỗi lô một bút toán
 * riêng, vì "rút 800g từ lô A và 200g từ lô B" là hai sự kiện truy ngược được,
 * còn một dòng 1000g không nói được lô nào.
 *
 * Nguyên liệu KHÔNG khai lô thì trả về một `picks` rỗng và `shortBase = 0`: nơi
 * gọi ghi một bút toán không lô, đúng như trước khi có S9.
 *
 * `shortBase > 0` nghĩa là tồn theo lô không đủ. Không ném lỗi ở đây, vì quyết
 * định phụ thuộc loại bút toán: món đã nấu rồi thì không chặn được (ghi hết phần
 * rút được, phần thiếu thành bút toán không lô), còn chuyển kho thì phải chặn.
 */
export async function consumeLots(
  tx: Tx,
  branchId: string,
  ingredientId: string,
  qtyBase: number,
): Promise<{ picks: LotPick[]; shortBase: number; lotRequired: boolean }> {
  const [ing] = await tx
    .select({ lotRequired: ingredients.lotRequired })
    .from(ingredients)
    .where(eq(ingredients.id, ingredientId))
  if (!ing?.lotRequired) return { picks: [], shortBase: 0, lotRequired: false }

  const rows = await tx
    .select({
      id: stockLots.id,
      qtyRemainBase: stockLots.qtyRemainBase,
      expiresOn: stockLots.expiresOn,
      receivedOn: stockLots.receivedOn,
    })
    .from(stockLots)
    .where(
      and(
        eq(stockLots.branchId, branchId),
        eq(stockLots.ingredientId, ingredientId),
        gt(stockLots.qtyRemainBase, 0),
      ),
    )
    .orderBy(asc(stockLots.expiresOn), asc(stockLots.receivedOn), asc(stockLots.id))
    // Khoá dòng: hai vé bếp xong cùng lúc sẽ rút cùng một lô nếu không khoá.
    // `FOR UPDATE` phải đứng SAU `ORDER BY` — đảo lại là câu lệnh SQL không hợp lệ.
    .for('update')

  const { picks, shortBase } = pickFefo(
    rows.map((r) => ({
      id: r.id,
      qtyRemainBase: Number(r.qtyRemainBase),
      expiresOn: r.expiresOn,
      receivedOn: r.receivedOn,
    })),
    qtyBase,
  )

  for (const pick of picks) {
    await tx
      .update(stockLots)
      .set({ qtyRemainBase: sql`${stockLots.qtyRemainBase} - ${pick.qtyBase}` })
      .where(eq(stockLots.id, pick.lotId))
  }

  return { picks, shortBase, lotRequired: true }
}

/**
 * Chia một lượt xuất thành các bút toán theo lô.
 *
 * Nguyên liệu không khai lô, hoặc lô không đủ: phần còn lại thành MỘT bút toán
 * không gắn lô. Nó vẫn phải được ghi — hàng đã ra khỏi kho dù sổ lô không giải
 * thích nổi, và giấu nó đi là để tồn kho sai vĩnh viễn.
 */
export function splitByLot(
  qtyOutBase: number,
  picks: readonly LotPick[],
): { lotId: number | null; qtyBase: number }[] {
  const rows: { lotId: number | null; qtyBase: number }[] = picks.map((p) => ({
    lotId: p.lotId,
    qtyBase: p.qtyBase,
  }))
  const rest = qtyOutBase - rows.reduce((sum, r) => sum + r.qtyBase, 0)
  if (rest > 0) rows.push({ lotId: null, qtyBase: rest })
  return rows
}
