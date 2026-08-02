import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, gte, inArray, lte, sql, type SQLWrapper } from 'drizzle-orm'
import { businessDateOf, displayPeriodOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { ParamsService } from '../../common/params.service'
import { PeriodLockService } from '../../common/period-lock.service'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishRecipes,
  ingredients,
  orderLines,
  productionLines,
  productionRuns,
  purchaseOrderLines,
  purchaseOrders,
  staff,
  stockCountLines,
  stockCounts,
  stockLevels,
  stockLots,
  stockMoves,
  stockTransferLines,
  stockTransfers,
  supplierItems,
  suppliers,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { effectiveQtyBase } from './domain/costing'
import {
  allocateProductionCost,
  effectiveExpiry,
  expiryBand,
  varianceOf,
  type ExpiryBand,
} from './domain/lots'
import { bumpStock, consumeLots, splitByLot } from './stock-ledger'

/** Cùng lý do với `reports.service.ts`: tổng cả kỳ vượt tầm int4 */
const sum = (expr: SQLWrapper) => sql<number>`coalesce(sum(${expr}), 0)::float8`

/**
 * Mã chứng từ nội bộ: `PO-2608-31`, `CK-2608-14`.
 *
 * Khác mã khách đọc (`ON-2608-0417`) ở chỗ nó dùng thẳng id thay vì sổ đếm theo
 * ngày: đơn đặt hàng và phiếu chuyển kho chỉ người trong quán đọc, và một sổ đếm
 * nữa chỉ thêm một chỗ có thể cấp trùng số.
 */
const docCode = (prefix: string, at: Date, timezone: string, id: number) =>
  `${prefix}-${displayPeriodOf(at, timezone)}-${id}`

export interface SupplierInput {
  code: string
  name: string
  taxCode: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  paymentTermDays: number
  cutoffMinute: number | null
  note: string | null
  active: boolean
}

export interface SupplierItemInput {
  supplierId: number
  ingredientId: string
  priceVnd: number
  minOrderPurchase: number
  leadTimeDays: number
  preferred: boolean
}

export interface ReceiveLotInput {
  branchId: string
  ingredientId: string
  /** Theo ĐƠN VỊ MUA, nhận số lẻ (2,5 kg) — server quy đổi ngay tại cửa */
  qtyPurchase: number
  totalVnd: number
  supplierId: number | null
  purchaseOrderId: number | null
  lotCode: string | null
  expiresOn: string | null
  receiveTempDeciC: number | null
  note: string | null
}

export interface IssueInput {
  branchId: string
  /** `write_off` huỷ · `internal` ăn ca, tiếp khách */
  kind: 'write_off' | 'internal'
  ingredientId: string
  qtyBase: number
  reason: string
}

export interface ProductionInput {
  branchId: string
  kind: 'pha-che' | 'pha-loc' | 'duc-keg'
  inputs: { ingredientId: string; qtyBase: number }[]
  outputs: { ingredientId: string; qtyBase: number; costShareBp: number }[]
  note: string | null
}

/**
 * Kho — S3 · S4 · S5 · S6 · S7 · S8 · S9 · S10 · S11 · S12.
 *
 * Tách khỏi `InventoryService` (M4 · M7 · S1 · S2 và trừ kho khi bếp bấm Xong) vì
 * hai nhóm việc khác nhau: bên kia là GIÁ VỐN và TIÊU THỤ TỰ ĐỘNG, bên này là
 * CHỨNG TỪ DO NGƯỜI LẬP. Chúng gặp nhau ở đúng một chỗ — `stock_moves`, sổ chỉ
 * thêm mà cả hai cùng ghi và không bên nào sửa của bên kia.
 *
 * BỐN NGUYÊN TẮC XUYÊN SUỐT CẢ NHÓM:
 *   1. Mọi thay đổi tồn đều đi qua một bút toán `stock_moves`. Không có cửa nào
 *      sửa `stock_levels` mà không để lại dòng sổ.
 *   2. FEFO quyết định RÚT LÔ NÀO; bình quân gia quyền quyết định GHI GIÁ BAO
 *      NHIÊU. Hai việc khác nhau, đừng trộn.
 *   3. Chuyển kho xác nhận HAI ĐẦU. Khoảng giữa là hàng đang đi đường, và nó phải
 *      đọc được thành một con số.
 *   4. Kỳ đã khoá sổ (F6) không nhận bút toán kho mới, kể cả phiếu ghi lùi ngày.
 */
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly locks: PeriodLockService,
  ) {}

  // ================================================== S3 · Nhà cung cấp

  async suppliers() {
    const [rows, items] = await Promise.all([
      this.db.select().from(suppliers).orderBy(asc(suppliers.name)),
      this.db
        .select({ item: supplierItems, ingredientName: ingredients.name })
        .from(supplierItems)
        .innerJoin(ingredients, eq(ingredients.id, supplierItems.ingredientId))
        .orderBy(asc(ingredients.name)),
    ])

    return rows.map((supplier) => ({
      ...supplier,
      items: items
        .filter((i) => i.item.supplierId === supplier.id)
        .map(({ item, ingredientName }) => ({ ...item, ingredientName })),
    }))
  }

  async saveSupplier(input: SupplierInput, actor: Actor, id?: number) {
    const values = {
      code: input.code.trim(),
      name: input.name.trim(),
      taxCode: input.taxCode?.trim() || null,
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      paymentTermDays: input.paymentTermDays,
      cutoffMinute: input.cutoffMinute,
      note: input.note?.trim() || null,
      active: input.active,
    }

    try {
      const [row] = id
        ? await this.db.update(suppliers).set(values).where(eq(suppliers.id, id)).returning()
        : await this.db.insert(suppliers).values(values).returning()
      if (!row) throw new NotFoundException('Không có nhà cung cấp này')
      await this.write(
        actor,
        id ? 'supplier.updated' : 'supplier.created',
        'supplier',
        String(row.id),
        values,
      )
      return row
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Mã ${input.code} đã có người dùng`)
      }
      throw err
    }
  }

  /**
   * Khai nguyên liệu nào mua của ai, giá bao nhiêu.
   *
   * Có bảng này thì S4 dựng được đơn mà không bắt thủ kho nhớ giá, và S5 so được
   * giá nhập với giá đã thoả thuận — cảnh báo lệch giá cần một mốc để so, và mốc
   * đó là dòng này.
   */
  async setSupplierItem(input: SupplierItemInput, actor: Actor) {
    await this.requireIngredient(input.ingredientId)

    return this.db.transaction(async (tx) => {
      // Một nguyên liệu chỉ có MỘT mối chính; đặt mối mới thì gỡ mối cũ trước
      if (input.preferred) {
        await tx
          .update(supplierItems)
          .set({ preferred: false })
          .where(
            and(
              eq(supplierItems.ingredientId, input.ingredientId),
              eq(supplierItems.preferred, true),
            ),
          )
      }

      await tx
        .insert(supplierItems)
        .values({ ...input, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [supplierItems.supplierId, supplierItems.ingredientId],
          set: {
            priceVnd: input.priceVnd,
            minOrderPurchase: input.minOrderPurchase,
            leadTimeDays: input.leadTimeDays,
            preferred: input.preferred,
            updatedAt: new Date(),
          },
        })

      await this.audit.write(tx, {
        actor,
        action: 'supplier.item-set',
        entity: 'supplier',
        entityId: String(input.supplierId),
        payload: { ...input },
      })
      return { ...input }
    })
  }

  async removeSupplierItem(supplierId: number, ingredientId: string, actor: Actor) {
    const deleted = await this.db
      .delete(supplierItems)
      .where(
        and(eq(supplierItems.supplierId, supplierId), eq(supplierItems.ingredientId, ingredientId)),
      )
      .returning({ ingredientId: supplierItems.ingredientId })
    if (deleted.length === 0) {
      throw new NotFoundException('Nhà cung cấp này không bán mặt hàng đó')
    }
    await this.write(actor, 'supplier.item-removed', 'supplier', String(supplierId), {
      ingredientId,
    })
    return { removed: true }
  }

  // =================================================== S4 · Đơn đặt hàng

  async purchaseOrders(branchId: string, state: string | null) {
    const where = [eq(purchaseOrders.branchId, branchId)]
    if (state) where.push(eq(purchaseOrders.state, state))

    const rows = await this.db
      .select({ po: purchaseOrders, supplierName: suppliers.name, byName: staff.fullName })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .leftJoin(staff, eq(staff.id, purchaseOrders.createdBy))
      .where(and(...where))
      .orderBy(desc(purchaseOrders.id))
      .limit(200)

    if (rows.length === 0) return []

    const lines = await this.db
      .select({ line: purchaseOrderLines, ingredient: ingredients })
      .from(purchaseOrderLines)
      .innerJoin(ingredients, eq(ingredients.id, purchaseOrderLines.ingredientId))
      .where(
        inArray(
          purchaseOrderLines.orderId,
          rows.map((r) => r.po.id),
        ),
      )

    return rows.map(({ po, supplierName, byName }) => {
      const mine = lines.filter((l) => l.line.orderId === po.id)
      return {
        ...po,
        supplierName,
        createdByName: byName,
        totalVnd: mine.reduce((s, l) => s + l.line.qtyPurchase * l.line.priceVnd, 0),
        lines: mine.map(({ line, ingredient }) => ({
          ...line,
          ingredientName: ingredient.name,
          purchaseUnit: ingredient.purchaseUnit,
          /** Còn thiếu bao nhiêu — đây là danh sách "còn nợ hàng" của người mua */
          outstandingPurchase: Math.max(0, line.qtyPurchase - line.receivedPurchase),
        })),
      }
    })
  }

  /**
   * Gợi ý đặt hàng theo tốc độ tiêu thụ 14 ngày (§25 S4).
   *
   * Công thức: lượng cần = tốc độ ngày nhân (thời gian giao cộng số ngày muốn đủ
   * hàng), trừ tồn hiện có, trừ phần đã đặt chưa về. Trừ "đã đặt chưa về" là chỗ
   * hay bị quên, và quên nó nghĩa là mỗi lần mở màn lại đặt thêm một đơn nữa cho
   * cùng một thiếu hụt.
   *
   * Bán thành phẩm KHÔNG gợi ý: chúng sinh ra từ S7, không mua ngoài.
   */
  async reorderSuggestions(branchId: string) {
    const branch = await this.requireBranch(branchId)
    const today = businessDateOf(new Date(), branch.timezone)
    const windowDays = await this.params.getNumber('stock.consumptionWindowDays', 14, branchId)
    const coverDays = await this.params.getNumber('stock.reorderCoverDays', 7, branchId)
    const from = new Date(Date.parse(`${today}T00:00:00Z`) - windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10)

    const [items, levels, used, onOrder] = await Promise.all([
      this.db
        .select({ ing: ingredients, item: supplierItems, supplierName: suppliers.name })
        .from(ingredients)
        .leftJoin(
          supplierItems,
          and(eq(supplierItems.ingredientId, ingredients.id), eq(supplierItems.preferred, true)),
        )
        .leftJoin(suppliers, eq(suppliers.id, supplierItems.supplierId))
        .where(and(eq(ingredients.active, true), eq(ingredients.isSemiFinished, false)))
        .orderBy(asc(ingredients.name)),
      this.db.select().from(stockLevels).where(eq(stockLevels.branchId, branchId)),
      this.db
        .select({
          ingredientId: stockMoves.ingredientId,
          outBase: sum(sql`-${stockMoves.qtyBase}`),
        })
        .from(stockMoves)
        .where(
          and(
            eq(stockMoves.branchId, branchId),
            gte(stockMoves.businessDate, from),
            lte(stockMoves.businessDate, today),
            inArray(stockMoves.kind, ['sale', 'write_off', 'internal', 'produce_out']),
          ),
        )
        .groupBy(stockMoves.ingredientId),
      this.db
        .select({
          ingredientId: purchaseOrderLines.ingredientId,
          pending: sum(
            sql`${purchaseOrderLines.qtyPurchase} - ${purchaseOrderLines.receivedPurchase}`,
          ),
        })
        .from(purchaseOrderLines)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.orderId))
        .where(and(eq(purchaseOrders.branchId, branchId), eq(purchaseOrders.state, 'sent')))
        .groupBy(purchaseOrderLines.ingredientId),
    ])

    return items
      .map(({ ing, item, supplierName }) => {
        const onHandBase = Number(levels.find((l) => l.ingredientId === ing.id)?.qtyBase ?? 0)
        const usedBase = Number(used.find((u) => u.ingredientId === ing.id)?.outBase ?? 0)
        const perDayBase = usedBase / windowDays
        const leadDays = item?.leadTimeDays ?? 1
        const pendingPurchase = Number(onOrder.find((o) => o.ingredientId === ing.id)?.pending ?? 0)
        const pendingBase = pendingPurchase * ing.basePerPurchase

        const targetBase = Math.max(
          Math.round(perDayBase * (leadDays + coverDays)),
          Number(ing.minLevelBase),
        )
        const needBase = Math.max(0, targetBase - onHandBase - pendingBase)
        const suggestPurchase =
          needBase === 0
            ? 0
            : Math.max(item?.minOrderPurchase ?? 1, Math.ceil(needBase / ing.basePerPurchase))

        return {
          ingredientId: ing.id,
          ingredientName: ing.name,
          groupName: ing.groupName,
          baseUnit: ing.baseUnit,
          purchaseUnit: ing.purchaseUnit,
          onHandBase,
          minLevelBase: Number(ing.minLevelBase),
          /** Tiêu thụ trung bình mỗi ngày trong cửa sổ, làm tròn để đọc */
          perDayBase: Math.round(perDayBase),
          /** Còn đủ bán mấy ngày nữa; null khi kỳ qua không bán gì */
          daysOfCover: perDayBase > 0 ? Math.floor(onHandBase / perDayBase) : null,
          pendingPurchase,
          suggestPurchase,
          supplierId: item?.supplierId ?? null,
          supplierName,
          priceVnd: item?.priceVnd ?? null,
          leadTimeDays: leadDays,
        }
      })
      .filter((row) => row.suggestPurchase > 0 || row.onHandBase < row.minLevelBase)
  }

  async createPurchaseOrder(
    input: {
      branchId: string
      supplierId: number
      expectedOn: string | null
      note: string | null
      lines: { ingredientId: string; qtyPurchase: number; priceVnd: number }[]
    },
    actor: Actor,
  ) {
    const branch = await this.requireBranch(input.branchId)
    if (input.lines.length === 0) {
      throw new BadRequestException('Đơn phải có ít nhất một dòng')
    }

    const [supplier] = await this.db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
    if (!supplier) throw new NotFoundException('Không có nhà cung cấp này')
    if (!supplier.active) throw new ConflictException(`${supplier.name} đang ngừng hợp tác`)

    return this.db.transaction(async (tx) => {
      // Mã dựng từ id nên phải chèn trước rồi mới đặt tên — cùng cách với bundle
      // cấu hình; giá trị tạm không bao giờ ra khỏi transaction này
      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          displayCode: `tam:${randomUUID()}`,
          branchId: input.branchId,
          supplierId: input.supplierId,
          expectedOn: input.expectedOn,
          note: input.note?.trim() || null,
          createdBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .returning({ id: purchaseOrders.id })

      const displayCode = docCode('PO', new Date(), branch.timezone, order!.id)
      await tx.update(purchaseOrders).set({ displayCode }).where(eq(purchaseOrders.id, order!.id))

      await tx.insert(purchaseOrderLines).values(
        input.lines.map((line) => ({
          orderId: order!.id,
          ingredientId: line.ingredientId,
          qtyPurchase: line.qtyPurchase,
          priceVnd: line.priceVnd,
        })),
      )

      await this.audit.write(tx, {
        actor,
        action: 'purchase-order.created',
        entity: 'purchase_order',
        entityId: String(order!.id),
        payload: { displayCode, supplierId: input.supplierId, lines: input.lines.length },
      })
      return { id: order!.id, displayCode }
    })
  }

  /**
   * Gửi đơn cho nhà cung cấp.
   *
   * Sau bước này đơn không sửa được nữa: đơn đã gửi là đơn bên kia đang đọc, sửa
   * bên mình mà họ không biết là cách sinh ra một lượt giao sai.
   */
  async sendPurchaseOrder(id: number, actor: Actor) {
    const [order] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id))
    if (!order) throw new NotFoundException('Không có đơn này')
    if (order.state !== 'draft') throw new ConflictException('Đơn này đã gửi hoặc đã đóng')

    await this.db
      .update(purchaseOrders)
      .set({ state: 'sent', sentAt: new Date() })
      .where(eq(purchaseOrders.id, id))
    await this.write(actor, 'purchase-order.sent', 'purchase_order', String(id), {
      displayCode: order.displayCode,
    })
    return { id, state: 'sent' }
  }

  async cancelPurchaseOrder(id: number, reason: string, actor: Actor) {
    const [order] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id))
    if (!order) throw new NotFoundException('Không có đơn này')
    if (order.state === 'received') {
      throw new ConflictException('Đơn đã nhận đủ thì không huỷ được')
    }

    await this.db
      .update(purchaseOrders)
      .set({ state: 'cancelled', closedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
    await this.write(actor, 'purchase-order.cancelled', 'purchase_order', String(id), { reason })
    return { id, state: 'cancelled' }
  }

  // ================================================ S5 · Nhập kho theo lô

  /**
   * Nhập kho — cửa DUY NHẤT làm đổi giá bình quân.
   *
   * Bốn việc trong một lượt, và thứ tự có ý nghĩa:
   *   1. Kiểm `lotRequired` — hải sản sống, thịt bò, keg buộc phải khai lô.
   *   2. Cập nhật giá bình quân gia quyền (trọng số là tồn CẢ CHUỖI).
   *   3. Sinh lô và cộng tồn.
   *   4. Ghi nhận vào dòng đơn đặt hàng nếu có, và đóng đơn khi đã đủ.
   *
   * Cảnh báo lệch giá KHÔNG chặn: giá chợ lên xuống là chuyện thường, và chặn
   * nhập hàng vì giá lệch nghĩa là hàng đứng ngoài cửa trong khi người ta đi tìm
   * quản lý. Trả về mức lệch để màn hình nói, còn hàng thì vẫn vào kho.
   */
  async receiveLot(input: ReceiveLotInput, actor: Actor) {
    if (!(input.qtyPurchase > 0)) {
      throw new BadRequestException('Lượng nhập phải lớn hơn 0')
    }
    if (!Number.isSafeInteger(input.totalVnd) || input.totalVnd < 0) {
      throw new BadRequestException('Tiền hàng phải là số nguyên đồng, không âm')
    }

    const branch = await this.requireBranch(input.branchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)
    await this.locks.assertOpen(input.branchId, [businessDate], 'nhập kho')

    return this.db.transaction(async (tx) => {
      const [ing] = await tx
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, input.ingredientId))
        .for('update')
      if (!ing) throw new NotFoundException('Không có nguyên liệu này')

      if (ing.lotRequired && !input.lotCode?.trim()) {
        throw new BadRequestException(
          `${ing.name} bắt buộc khai số lô — hải sản sống, thịt bò và keg phải truy ngược được`,
        )
      }
      if (ing.lotRequired && input.expiresOn === null && ing.openShelfLifeDays === 0) {
        throw new BadRequestException(`${ing.name} bắt buộc khai hạn dùng`)
      }

      const qtyBase = Math.round(input.qtyPurchase * ing.basePerPurchase)
      if (qtyBase <= 0) {
        throw new BadRequestException(`Lượng nhập quá nhỏ: quy đổi ra ${ing.baseUnit} thành 0`)
      }

      // Giá bình quân ở cấp chuỗi nên trọng số là tồn CẢ CHUỖI, không phải tồn
      // của riêng chi nhánh đang nhập
      const [onHand] = await tx
        .select({ qty: sum(stockLevels.qtyBase) })
        .from(stockLevels)
        .where(eq(stockLevels.ingredientId, input.ingredientId))

      const onHandBase = Number(onHand?.qty ?? 0)
      const nextMilli =
        onHandBase + qtyBase <= 0
          ? ing.costPerBaseMilli
          : Math.round(
              (onHandBase * ing.costPerBaseMilli + input.totalVnd * 1_000) / (onHandBase + qtyBase),
            )

      await tx
        .update(ingredients)
        .set({ costPerBaseMilli: nextMilli })
        .where(eq(ingredients.id, input.ingredientId))

      /** Giá lần này so với giá thoả thuận — mốc để cảnh báo lệch giá */
      const [agreed] = input.supplierId
        ? await tx
            .select({ priceVnd: supplierItems.priceVnd })
            .from(supplierItems)
            .where(
              and(
                eq(supplierItems.supplierId, input.supplierId),
                eq(supplierItems.ingredientId, input.ingredientId),
              ),
            )
        : []
      const unitPaidVnd = Math.round(input.totalVnd / input.qtyPurchase)
      const priceVarianceBp =
        agreed && agreed.priceVnd > 0
          ? Math.round(((unitPaidVnd - agreed.priceVnd) * 10_000) / agreed.priceVnd)
          : null

      let lotId: number | null = null
      if (ing.lotRequired) {
        const [lot] = await tx
          .insert(stockLots)
          .values({
            branchId: input.branchId,
            ingredientId: input.ingredientId,
            lotCode: input.lotCode!.trim(),
            receivedOn: businessDate,
            expiresOn: input.expiresOn,
            qtyInBase: qtyBase,
            qtyRemainBase: qtyBase,
            unitCostMilli: Math.round((input.totalVnd * 1_000) / qtyBase),
            receiveTempDeciC: input.receiveTempDeciC,
            supplierId: input.supplierId,
            note: input.note?.trim() || null,
          })
          .returning({ id: stockLots.id })
        lotId = lot!.id
      }

      await bumpStock(tx, input.branchId, input.ingredientId, qtyBase)

      await tx.insert(stockMoves).values({
        branchId: input.branchId,
        ingredientId: input.ingredientId,
        kind: 'receipt',
        qtyBase,
        costVnd: input.totalVnd,
        lotId,
        docKind: input.purchaseOrderId ? 'purchase_order' : null,
        docId: input.purchaseOrderId,
        note: input.note?.trim() || null,
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        businessDate,
      })

      if (input.purchaseOrderId !== null) {
        await this.applyToPurchaseOrder(
          tx,
          input.purchaseOrderId,
          input.ingredientId,
          input.qtyPurchase,
        )
      }

      await this.audit.write(tx, {
        actor,
        action: 'stock.received',
        entity: 'ingredient',
        entityId: input.ingredientId,
        payload: {
          qtyBase,
          totalVnd: input.totalVnd,
          lotCode: input.lotCode,
          costBefore: ing.costPerBaseMilli,
          costAfter: nextMilli,
          priceVarianceBp,
        },
      })

      return {
        ingredientId: input.ingredientId,
        lotId,
        qtyBase,
        costPerBaseMilli: nextMilli,
        costPerBaseMilliBefore: ing.costPerBaseMilli,
        unitPaidVnd,
        agreedPriceVnd: agreed?.priceVnd ?? null,
        /** Lệch bao nhiêu so với giá đã thoả thuận, điểm cơ bản. Không chặn. */
        priceVarianceBp,
      }
    })
  }

  /** Ghi nhận lượt nhận vào dòng đơn; đơn đủ hàng thì tự đóng */
  private async applyToPurchaseOrder(
    tx: Tx,
    orderId: number,
    ingredientId: string,
    qtyPurchase: number,
  ) {
    const updated = await tx
      .update(purchaseOrderLines)
      .set({
        receivedPurchase: sql`${purchaseOrderLines.receivedPurchase} + ${Math.round(qtyPurchase)}`,
      })
      .where(
        and(
          eq(purchaseOrderLines.orderId, orderId),
          eq(purchaseOrderLines.ingredientId, ingredientId),
        ),
      )
      .returning({ id: purchaseOrderLines.id })
    if (updated.length === 0) {
      throw new BadRequestException('Đơn đặt hàng này không có dòng cho nguyên liệu đó')
    }

    const [pending] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrderLines)
      .where(
        and(
          eq(purchaseOrderLines.orderId, orderId),
          sql`${purchaseOrderLines.receivedPurchase} < ${purchaseOrderLines.qtyPurchase}`,
        ),
      )
    if (Number(pending?.count ?? 0) === 0) {
      await tx
        .update(purchaseOrders)
        .set({ state: 'received', closedAt: new Date() })
        .where(eq(purchaseOrders.id, orderId))
    }
  }

  // ===================================================== S6 · Xuất kho

  /**
   * Xuất huỷ hoặc xuất nội bộ.
   *
   * Hai loại tách nhau vì chúng nói hai chuyện khác hẳn: huỷ là MẤT (vào dòng hao
   * hụt của S11 và của Lãi/Lỗ), còn ăn ca là CHI PHÍ CÓ ÍCH. Gộp làm một là báo
   * cáo hao hụt kêu to mỗi khi nhân viên ăn cơm.
   *
   * Cả hai đều là dấu △ với thủ kho (§4.2 `stock.write-off`) — người xuất không
   * tự duyệt việc của mình.
   */
  async issue(input: IssueInput, actor: Actor, approval?: ApprovalInput | null) {
    if (!Number.isSafeInteger(input.qtyBase) || input.qtyBase <= 0) {
      throw new BadRequestException('Lượng xuất phải là số nguyên dương')
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('Xuất kho bắt buộc ghi lý do')
    }

    const branch = await this.requireBranch(input.branchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)
    await this.locks.assertOpen(input.branchId, [businessDate], 'xuất kho')

    return this.db.transaction(async (tx) => {
      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'stock.write-off',
        entity: 'ingredient',
        entityId: input.ingredientId,
        approval,
      })

      const [ing] = await tx.select().from(ingredients).where(eq(ingredients.id, input.ingredientId))
      if (!ing) throw new NotFoundException('Không có nguyên liệu này')

      const { picks, shortBase } = await consumeLots(
        tx,
        input.branchId,
        input.ingredientId,
        input.qtyBase,
      )
      const parts = splitByLot(input.qtyBase, picks)

      await tx.insert(stockMoves).values(
        parts.map((part) => ({
          branchId: input.branchId,
          ingredientId: input.ingredientId,
          kind: input.kind,
          qtyBase: -part.qtyBase,
          costVnd: -Math.round((part.qtyBase * ing.costPerBaseMilli) / 1_000),
          lotId: part.lotId,
          note: input.reason.trim(),
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          businessDate,
        })),
      )
      await bumpStock(tx, input.branchId, input.ingredientId, -input.qtyBase)

      await this.audit.write(tx, {
        actor,
        action: input.kind === 'write_off' ? 'stock.written-off' : 'stock.issued-internal',
        entity: 'ingredient',
        entityId: input.ingredientId,
        approvalId: outcome.approvalId,
        payload: { qtyBase: input.qtyBase, reason: input.reason.trim(), shortBase },
      })

      return {
        ingredientId: input.ingredientId,
        qtyBase: input.qtyBase,
        lots: picks,
        /** Tồn theo lô không đủ — sổ lô và sổ tồn đang lệch, cần kiểm kê */
        shortBase,
      }
    })
  }

  // ============================================== S7 · Sản xuất nội bộ

  /**
   * Một lượt sản xuất: nhiều đầu vào, nhiều đầu ra.
   *
   * Pha lóc thịt là trường hợp khó nhất và cũng là trường hợp bắt buộc với quán
   * nướng: một tảng bò 12kg cho ra nầm 2,1kg, dẻ sườn 3,4kg, hao 0,8kg. Hao KHÔNG
   * phải một đầu ra — tiền của nó nằm lại trong giá của thịt dùng được, nên tổng
   * tỉ lệ chia bằng 100% dù tổng trọng lượng ra nhỏ hơn trọng lượng vào.
   *
   * Đầu ra làm đổi giá bình quân của chính nó, vì bán thành phẩm cũng là nguyên
   * liệu của công thức khác.
   */
  async produce(input: ProductionInput, actor: Actor) {
    if (input.inputs.length === 0) {
      throw new BadRequestException('Lượt sản xuất phải có đầu vào')
    }
    if (input.outputs.length === 0) {
      throw new BadRequestException('Lượt sản xuất phải có đầu ra')
    }

    const branch = await this.requireBranch(input.branchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)
    await this.locks.assertOpen(input.branchId, [businessDate], 'sản xuất nội bộ')

    return this.db.transaction(async (tx) => {
      const ids = [...new Set([...input.inputs, ...input.outputs].map((r) => r.ingredientId))]
      const rows = await tx
        .select()
        .from(ingredients)
        .where(inArray(ingredients.id, ids))
        .for('update')
      const byId = new Map(rows.map((r) => [r.id, r]))
      for (const id of ids) {
        if (!byId.has(id)) throw new NotFoundException(`Không có nguyên liệu ${id}`)
      }

      const [run] = await tx
        .insert(productionRuns)
        .values({
          branchId: input.branchId,
          kind: input.kind,
          note: input.note?.trim() || null,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          businessDate,
        })
        .returning({ id: productionRuns.id })

      // ---- Đầu vào: rút lô, trừ tồn, cộng dồn giá để chia cho đầu ra
      let totalInVnd = 0
      for (const line of input.inputs) {
        if (!Number.isSafeInteger(line.qtyBase) || line.qtyBase <= 0) {
          throw new BadRequestException('Lượng đầu vào phải là số nguyên dương')
        }
        const ing = byId.get(line.ingredientId)!
        totalInVnd += Math.round((line.qtyBase * ing.costPerBaseMilli) / 1_000)

        const { picks } = await consumeLots(tx, input.branchId, line.ingredientId, line.qtyBase)
        const parts = splitByLot(line.qtyBase, picks)

        await tx.insert(stockMoves).values(
          parts.map((part) => ({
            branchId: input.branchId,
            ingredientId: line.ingredientId,
            kind: 'produce_out' as const,
            qtyBase: -part.qtyBase,
            costVnd: -Math.round((part.qtyBase * ing.costPerBaseMilli) / 1_000),
            lotId: part.lotId,
            docKind: 'production_run',
            docId: run!.id,
            actorId: actor.kind === 'staff' ? actor.staffId : null,
            businessDate,
          })),
        )
        await bumpStock(tx, input.branchId, line.ingredientId, -line.qtyBase)
        await tx.insert(productionLines).values({
          runId: run!.id,
          ingredientId: line.ingredientId,
          direction: 'in',
          qtyBase: line.qtyBase,
        })
      }

      // ---- Đầu ra: chia giá theo tỉ lệ, cộng tồn, đổi giá bình quân
      let allocated: ReturnType<typeof allocateProductionCost>
      try {
        allocated = allocateProductionCost(totalInVnd, input.outputs)
      } catch (err) {
        throw new BadRequestException((err as Error).message)
      }

      for (const [index, out] of allocated.entries()) {
        const ing = byId.get(out.ingredientId)!
        const [onHand] = await tx
          .select({ qty: sum(stockLevels.qtyBase) })
          .from(stockLevels)
          .where(eq(stockLevels.ingredientId, out.ingredientId))
        const onHandBase = Number(onHand?.qty ?? 0)
        const nextMilli =
          onHandBase + out.qtyBase <= 0
            ? out.unitCostMilli
            : Math.round(
                (onHandBase * ing.costPerBaseMilli + out.costVnd * 1_000) /
                  (onHandBase + out.qtyBase),
              )
        await tx
          .update(ingredients)
          .set({ costPerBaseMilli: nextMilli })
          .where(eq(ingredients.id, out.ingredientId))

        let lotId: number | null = null
        if (ing.lotRequired) {
          const [lot] = await tx
            .insert(stockLots)
            .values({
              branchId: input.branchId,
              ingredientId: out.ingredientId,
              lotCode: `SX-${run!.id}-${index + 1}`,
              receivedOn: businessDate,
              expiresOn: null,
              qtyInBase: out.qtyBase,
              qtyRemainBase: out.qtyBase,
              unitCostMilli: out.unitCostMilli,
              note: `Sinh từ lượt sản xuất #${run!.id}`,
            })
            .returning({ id: stockLots.id })
          lotId = lot!.id
        }

        await tx.insert(stockMoves).values({
          branchId: input.branchId,
          ingredientId: out.ingredientId,
          kind: 'produce_in',
          qtyBase: out.qtyBase,
          costVnd: out.costVnd,
          lotId,
          docKind: 'production_run',
          docId: run!.id,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          businessDate,
        })
        await bumpStock(tx, input.branchId, out.ingredientId, out.qtyBase)
        await tx.insert(productionLines).values({
          runId: run!.id,
          ingredientId: out.ingredientId,
          direction: 'out',
          qtyBase: out.qtyBase,
          costShareBp: input.outputs[index]!.costShareBp,
          lotId,
        })
      }

      const totalInBase = input.inputs.reduce((s, i) => s + i.qtyBase, 0)
      const totalOutBase = input.outputs.reduce((s, o) => s + o.qtyBase, 0)

      await this.audit.write(tx, {
        actor,
        action: 'stock.produced',
        entity: 'production_run',
        entityId: String(run!.id),
        payload: { kind: input.kind, totalInVnd, totalInBase, totalOutBase },
      })

      return {
        runId: run!.id,
        totalInVnd,
        totalInBase,
        totalOutBase,
        /** Hao = vào trừ ra. Không có bút toán riêng; tiền đã nằm trong giá đầu ra. */
        wasteBase: totalInBase - totalOutBase,
        outputs: allocated,
      }
    })
  }

  /**
   * Đục keg — trường hợp riêng của S7 mà §25 gọi tên: keg nguyên thành keg đang mở.
   *
   * Không tiêu hao gì cả, chỉ TÁCH LÔ: lô nguyên giảm đúng một keg, sinh lô mới
   * `state = 'open'` với hạn tính từ hôm nay theo `openShelfLifeDays`. Đây là lý
   * do đồng hồ 5–7 ngày có thật chứ không phải một ghi chú trên giấy.
   */
  async tapKeg(input: { branchId: string; lotId: number }, actor: Actor) {
    const branch = await this.requireBranch(input.branchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)

    return this.db.transaction(async (tx) => {
      const [lot] = await tx
        .select()
        .from(stockLots)
        .where(eq(stockLots.id, input.lotId))
        .for('update')
      if (!lot || lot.branchId !== input.branchId) {
        throw new NotFoundException('Không có lô này')
      }
      if (lot.state === 'open') throw new ConflictException('Lô này đã đục rồi')

      const [ing] = await tx.select().from(ingredients).where(eq(ingredients.id, lot.ingredientId))
      if (!ing || ing.openShelfLifeDays <= 0) {
        throw new BadRequestException(`${ing?.name ?? 'Nguyên liệu này'} không phải keg`)
      }

      const kegBase = Number(ing.basePerPurchase)
      if (Number(lot.qtyRemainBase) < kegBase) {
        throw new ConflictException('Lô này không còn đủ một keg nguyên để đục')
      }

      const openedAt = new Date()
      const openUntil = new Date(openedAt.getTime() + ing.openShelfLifeDays * 86_400_000)
        .toISOString()
        .slice(0, 10)

      await tx
        .update(stockLots)
        .set({ qtyRemainBase: sql`${stockLots.qtyRemainBase} - ${kegBase}` })
        .where(eq(stockLots.id, lot.id))

      const [openLot] = await tx
        .insert(stockLots)
        .values({
          branchId: input.branchId,
          ingredientId: lot.ingredientId,
          lotCode: `${lot.lotCode}-MO`,
          receivedOn: businessDate,
          // Hạn trên vỏ còn gần hơn thì lấy cái gần hơn — bia không tươi lại vì
          // vừa được đục ra
          expiresOn:
            lot.expiresOn !== null && lot.expiresOn < openUntil ? lot.expiresOn : openUntil,
          qtyInBase: kegBase,
          qtyRemainBase: kegBase,
          unitCostMilli: lot.unitCostMilli,
          state: 'open',
          openedAt,
          parentLotId: lot.id,
          supplierId: lot.supplierId,
        })
        .returning({ id: stockLots.id, expiresOn: stockLots.expiresOn })

      await this.audit.write(tx, {
        actor,
        action: 'stock.keg-tapped',
        entity: 'stock_lot',
        entityId: String(openLot!.id),
        payload: {
          parentLotId: lot.id,
          ingredientId: lot.ingredientId,
          expiresOn: openLot!.expiresOn,
        },
      })

      // Tồn KHÔNG đổi: bia vẫn nằm trong kho, chỉ chuyển từ lô này sang lô kia
      return { lotId: openLot!.id, expiresOn: openLot!.expiresOn, qtyBase: kegBase }
    })
  }

  // ===================================================== S8 · Kiểm kê

  /**
   * Mở phiếu kiểm kê — chụp tồn sổ NGAY LÚC MỞ.
   *
   * Đếm mất một tiếng, trong giờ đó bếp vẫn bán. So số đếm với tồn sổ lúc CHỐT sẽ
   * ra chênh lệch giả bằng đúng lượng bán trong lúc đếm, nên mốc so phải đóng
   * băng từ đầu.
   */
  async openCount(input: { branchId: string; groupName: string | null }, actor: Actor) {
    const branch = await this.requireBranch(input.branchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)
    await this.locks.assertOpen(input.branchId, [businessDate], 'kiểm kê')

    return this.db.transaction(async (tx) => {
      const where = [eq(ingredients.active, true)]
      if (input.groupName) where.push(eq(ingredients.groupName, input.groupName))
      const items = await tx.select().from(ingredients).where(and(...where))
      if (items.length === 0) {
        throw new BadRequestException('Không có nguyên liệu nào để kiểm')
      }

      const levels = await tx
        .select()
        .from(stockLevels)
        .where(eq(stockLevels.branchId, input.branchId))

      let countId: number
      try {
        const [row] = await tx
          .insert(stockCounts)
          .values({
            branchId: input.branchId,
            groupName: input.groupName,
            openedBy: actor.kind === 'staff' ? actor.staffId : null,
            businessDate,
          })
          .returning({ id: stockCounts.id })
        countId = row!.id
      } catch (err) {
        if (isUniqueViolation(err, 'stock_counts_one_open')) {
          throw new ConflictException(
            'Chi nhánh này đang có một phiếu kiểm kê dở — chốt hoặc huỷ nó trước',
          )
        }
        throw err
      }

      await tx.insert(stockCountLines).values(
        items.map((ing) => ({
          countId,
          ingredientId: ing.id,
          snapshotBase: Number(levels.find((l) => l.ingredientId === ing.id)?.qtyBase ?? 0),
        })),
      )

      await this.audit.write(tx, {
        actor,
        action: 'stock.count-opened',
        entity: 'stock_count',
        entityId: String(countId),
        payload: { groupName: input.groupName, lines: items.length },
      })
      return { id: countId, lines: items.length }
    })
  }

  async countSheet(countId: number) {
    const [count] = await this.db.select().from(stockCounts).where(eq(stockCounts.id, countId))
    if (!count) throw new NotFoundException('Không có phiếu kiểm kê này')

    const rows = await this.db
      .select({ line: stockCountLines, ing: ingredients })
      .from(stockCountLines)
      .innerJoin(ingredients, eq(ingredients.id, stockCountLines.ingredientId))
      .where(eq(stockCountLines.countId, countId))
      .orderBy(asc(ingredients.groupName), asc(ingredients.name))

    const lines = rows.map(({ line, ing }) => {
      const counted = line.countedBase === null ? null : Number(line.countedBase)
      const diffBase = counted === null ? null : counted - Number(line.snapshotBase)
      return {
        ingredientId: ing.id,
        ingredientName: ing.name,
        groupName: ing.groupName,
        baseUnit: ing.baseUnit,
        snapshotBase: Number(line.snapshotBase),
        countedBase: counted,
        diffBase,
        diffVnd: diffBase === null ? null : Math.round((diffBase * ing.costPerBaseMilli) / 1_000),
        note: line.note,
        countedAt: line.countedAt,
      }
    })

    return {
      ...count,
      lines,
      countedLines: lines.filter((l) => l.countedBase !== null).length,
      diffVnd: lines.reduce((s, l) => s + (l.diffVnd ?? 0), 0),
    }
  }

  /** Ghi số đếm — chạy trên tablet, gọi nhiều lần trong lúc đếm */
  async saveCountLines(
    countId: number,
    lines: { ingredientId: string; countedBase: number; note: string | null }[],
    actor: Actor,
  ) {
    const [count] = await this.db.select().from(stockCounts).where(eq(stockCounts.id, countId))
    if (!count) throw new NotFoundException('Không có phiếu kiểm kê này')
    if (count.state !== 'counting') {
      throw new ConflictException('Phiếu này đã chốt hoặc đã huỷ')
    }

    for (const line of lines) {
      if (!Number.isSafeInteger(line.countedBase) || line.countedBase < 0) {
        throw new BadRequestException('Số đếm phải là số nguyên không âm')
      }
      await this.db
        .update(stockCountLines)
        .set({ countedBase: line.countedBase, note: line.note, countedAt: new Date() })
        .where(
          and(
            eq(stockCountLines.countId, countId),
            eq(stockCountLines.ingredientId, line.ingredientId),
          ),
        )
    }

    /**
     * Ghi nhật ký MỘT lần cho cả lượt lưu, không phải mỗi dòng một lần: tablet
     * gửi số đếm lên liên tục, và một dòng nhật ký cho mỗi con số sẽ làm A7 ngập
     * tới mức không đọc được thứ gì khác.
     */
    await this.write(actor, 'stock.count-saved', 'stock_count', String(countId), {
      lines: lines.length,
    })
    return { countId, saved: lines.length }
  }

  /**
   * Chốt kiểm kê — sinh bút toán `count_adjust` cho từng dòng lệch.
   *
   * Đây là thao tác có hệ quả tiền: chênh lệch trở thành chi phí trên Lãi/Lỗ ngay
   * lúc bấm. Nên nó cần duyệt (§4.2 `stock.close-count` là dấu △ với thủ kho), và
   * dòng CHƯA ĐẾM thì bỏ qua chứ không coi là 0 — "chưa đếm tới" và "đếm được 0"
   * là hai chuyện khác nhau, và coi nhầm cái đầu thành cái sau là xoá sạch kho.
   */
  async closeCount(countId: number, actor: Actor, approval?: ApprovalInput | null) {
    const [count] = await this.db.select().from(stockCounts).where(eq(stockCounts.id, countId))
    if (!count) throw new NotFoundException('Không có phiếu kiểm kê này')
    if (count.state !== 'counting') {
      throw new ConflictException('Phiếu này đã chốt hoặc đã huỷ')
    }
    await this.locks.assertOpen(count.branchId, [count.businessDate], 'chốt kiểm kê')

    return this.db.transaction(async (tx) => {
      const outcome = await this.approvals.authorize(tx, {
        actor,
        action: 'stock.close-count',
        entity: 'stock_count',
        entityId: String(countId),
        approval,
      })

      const rows = await tx
        .select({ line: stockCountLines, ing: ingredients })
        .from(stockCountLines)
        .innerJoin(ingredients, eq(ingredients.id, stockCountLines.ingredientId))
        .where(eq(stockCountLines.countId, countId))

      let adjusted = 0
      let diffVnd = 0
      for (const { line, ing } of rows) {
        if (line.countedBase === null) continue

        // Tồn HIỆN TẠI, không phải tồn lúc mở: bút toán phải đưa sổ về đúng số đếm
        const [level] = await tx
          .select({ qty: stockLevels.qtyBase })
          .from(stockLevels)
          .where(
            and(
              eq(stockLevels.branchId, count.branchId),
              eq(stockLevels.ingredientId, line.ingredientId),
            ),
          )
        const delta = Number(line.countedBase) - Number(level?.qty ?? 0)
        if (delta === 0) continue

        const costVnd = Math.round((delta * ing.costPerBaseMilli) / 1_000)
        await tx.insert(stockMoves).values({
          branchId: count.branchId,
          ingredientId: line.ingredientId,
          kind: 'count_adjust',
          qtyBase: delta,
          costVnd,
          docKind: 'stock_count',
          docId: countId,
          note: line.note?.trim() || `Chốt kiểm kê #${countId}`,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          businessDate: count.businessDate,
        })
        await bumpStock(tx, count.branchId, line.ingredientId, delta)
        adjusted += 1
        diffVnd += costVnd
      }

      await tx
        .update(stockCounts)
        .set({
          state: 'closed',
          closedAt: new Date(),
          closedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .where(eq(stockCounts.id, countId))

      await this.audit.write(tx, {
        actor,
        action: 'stock.count-closed',
        entity: 'stock_count',
        entityId: String(countId),
        approvalId: outcome.approvalId,
        payload: { adjusted, diffVnd },
      })
      return { countId, adjusted, diffVnd }
    })
  }

  async cancelCount(countId: number, actor: Actor) {
    const [count] = await this.db.select().from(stockCounts).where(eq(stockCounts.id, countId))
    if (!count) throw new NotFoundException('Không có phiếu kiểm kê này')
    if (count.state !== 'counting') {
      throw new ConflictException('Phiếu này đã chốt hoặc đã huỷ')
    }

    await this.db.update(stockCounts).set({ state: 'cancelled' }).where(eq(stockCounts.id, countId))
    await this.write(actor, 'stock.count-cancelled', 'stock_count', String(countId), {})
    return { countId, state: 'cancelled' }
  }

  // ================================================= S9 · Lô & hạn dùng

  /**
   * Sổ lô của một chi nhánh, sắp theo FEFO và tô mức hạn.
   *
   * Hạn của lô đã đục tính từ ngày đục, không từ hạn in trên vỏ — nên hai lô cùng
   * một mã hàng có thể có hạn cách nhau nửa năm, và cái sắp hỏng phải đứng trước.
   */
  async lots(branchId: string, onlyLive: boolean) {
    const branch = await this.requireBranch(branchId)
    const today = businessDateOf(new Date(), branch.timezone)
    const warnDays = await this.params.getNumber('stock.expiryWarnDays', 3, branchId)

    const where = [eq(stockLots.branchId, branchId)]
    if (onlyLive) where.push(gt(stockLots.qtyRemainBase, 0))

    const rows = await this.db
      .select({ lot: stockLots, ing: ingredients, supplierName: suppliers.name })
      .from(stockLots)
      .innerJoin(ingredients, eq(ingredients.id, stockLots.ingredientId))
      .leftJoin(suppliers, eq(suppliers.id, stockLots.supplierId))
      .where(and(...where))
      .orderBy(asc(stockLots.expiresOn), asc(stockLots.receivedOn))
      .limit(500)

    const lots = rows.map(({ lot, ing, supplierName }) => {
      const expiry = effectiveExpiry({
        expiresOn: lot.expiresOn,
        state: lot.state as 'sealed' | 'open',
        openedAt: lot.openedAt,
        openShelfLifeDays: ing.openShelfLifeDays,
      })
      return {
        id: lot.id,
        ingredientId: ing.id,
        ingredientName: ing.name,
        baseUnit: ing.baseUnit,
        lotCode: lot.lotCode,
        receivedOn: lot.receivedOn,
        labelExpiresOn: lot.expiresOn,
        /** Hạn THẬT — keg đã đục tính từ ngày đục */
        expiresOn: expiry,
        band: expiryBand(expiry, today, warnDays),
        qtyInBase: Number(lot.qtyInBase),
        qtyRemainBase: Number(lot.qtyRemainBase),
        /** Tiền đang nằm trong lô này — con số làm cảnh báo hạn có sức nặng */
        remainValueVnd: Math.round((Number(lot.qtyRemainBase) * Number(lot.unitCostMilli)) / 1_000),
        state: lot.state,
        openedAt: lot.openedAt,
        receiveTempDeciC: lot.receiveTempDeciC,
        supplierName,
        /** Đục được không: là keg, còn nguyên, và còn đủ một keg */
        tappable:
          ing.openShelfLifeDays > 0 &&
          lot.state === 'sealed' &&
          Number(lot.qtyRemainBase) >= Number(ing.basePerPurchase),
      }
    })

    const inBand = (band: ExpiryBand) => lots.filter((l) => l.band === band && l.qtyRemainBase > 0)

    return {
      branchId,
      today,
      lots,
      summary: {
        expired: inBand('het-han').length,
        expiringSoon: inBand('sap-het').length,
        expiredValueVnd: inBand('het-han').reduce((s, l) => s + l.remainValueVnd, 0),
        expiringSoonValueVnd: inBand('sap-het').reduce((s, l) => s + l.remainValueVnd, 0),
      },
    }
  }

  // =================================================== S10 · Chuyển kho

  async transfers(branchId: string) {
    const rows = await this.db
      .select({ transfer: stockTransfers, sentByName: staff.fullName })
      .from(stockTransfers)
      .leftJoin(staff, eq(staff.id, stockTransfers.sentBy))
      .where(
        sql`${stockTransfers.fromBranchId} = ${branchId} OR ${stockTransfers.toBranchId} = ${branchId}`,
      )
      .orderBy(desc(stockTransfers.id))
      .limit(100)

    if (rows.length === 0) return []

    const lines = await this.db
      .select({ line: stockTransferLines, ing: ingredients })
      .from(stockTransferLines)
      .innerJoin(ingredients, eq(ingredients.id, stockTransferLines.ingredientId))
      .where(
        inArray(
          stockTransferLines.transferId,
          rows.map((r) => r.transfer.id),
        ),
      )

    return rows.map(({ transfer, sentByName }) => ({
      ...transfer,
      sentByName,
      direction: transfer.fromBranchId === branchId ? ('out' as const) : ('in' as const),
      lines: lines
        .filter((l) => l.line.transferId === transfer.id)
        .map(({ line, ing }) => ({
          ingredientId: ing.id,
          ingredientName: ing.name,
          baseUnit: ing.baseUnit,
          qtyBase: Number(line.qtyBase),
          receivedBase: line.receivedBase === null ? null : Number(line.receivedBase),
        })),
    }))
  }

  /**
   * Gửi hàng đi chi nhánh khác.
   *
   * Sinh `transfer_out` NGAY: hàng rời kho là thật, và giấu nó tới lúc bên kia
   * nhận nghĩa là sổ bên gửi sai suốt quãng đường. Bên nhận chưa có gì cả —
   * khoảng giữa là hàng đang đi đường, đọc được bằng chênh lệch hai bút toán.
   */
  async sendTransfer(
    input: {
      fromBranchId: string
      toBranchId: string
      note: string | null
      lines: { ingredientId: string; qtyBase: number }[]
    },
    actor: Actor,
  ) {
    if (input.fromBranchId === input.toBranchId) {
      throw new BadRequestException('Chuyển kho phải sang chi nhánh khác')
    }
    if (input.lines.length === 0) {
      throw new BadRequestException('Phiếu chuyển phải có ít nhất một dòng')
    }

    const branch = await this.requireBranch(input.fromBranchId)
    await this.requireBranch(input.toBranchId)
    const businessDate = businessDateOf(new Date(), branch.timezone)
    await this.locks.assertOpen(input.fromBranchId, [businessDate], 'chuyển kho')

    return this.db.transaction(async (tx) => {
      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          displayCode: `tam:${randomUUID()}`,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          note: input.note?.trim() || null,
          sentBy: actor.kind === 'staff' ? actor.staffId : null,
          businessDate,
        })
        .returning({ id: stockTransfers.id })

      const displayCode = docCode('CK', new Date(), branch.timezone, transfer!.id)
      await tx
        .update(stockTransfers)
        .set({ displayCode })
        .where(eq(stockTransfers.id, transfer!.id))

      for (const line of input.lines) {
        if (!Number.isSafeInteger(line.qtyBase) || line.qtyBase <= 0) {
          throw new BadRequestException('Lượng chuyển phải là số nguyên dương')
        }
        const [ing] = await tx
          .select()
          .from(ingredients)
          .where(eq(ingredients.id, line.ingredientId))
        if (!ing) throw new NotFoundException(`Không có nguyên liệu ${line.ingredientId}`)

        const [level] = await tx
          .select({ qty: stockLevels.qtyBase })
          .from(stockLevels)
          .where(
            and(
              eq(stockLevels.branchId, input.fromBranchId),
              eq(stockLevels.ingredientId, line.ingredientId),
            ),
          )
        /**
         * Chuyển kho CHẶN khi không đủ — khác hẳn với bán. Ở đây chưa có gì xảy
         * ra ngoài đời nên từ chối là sửa được, còn cho tồn âm là hai kho cùng sai.
         */
        const onHand = Number(level?.qty ?? 0)
        if (onHand < line.qtyBase) {
          throw new ConflictException(
            `${ing.name}: kho chỉ còn ${onHand} ${ing.baseUnit}, không đủ để chuyển ${line.qtyBase}`,
          )
        }

        const { picks } = await consumeLots(tx, input.fromBranchId, line.ingredientId, line.qtyBase)
        const parts = splitByLot(line.qtyBase, picks)

        await tx.insert(stockMoves).values(
          parts.map((part) => ({
            branchId: input.fromBranchId,
            ingredientId: line.ingredientId,
            kind: 'transfer_out' as const,
            qtyBase: -part.qtyBase,
            costVnd: -Math.round((part.qtyBase * ing.costPerBaseMilli) / 1_000),
            lotId: part.lotId,
            docKind: 'stock_transfer',
            docId: transfer!.id,
            actorId: actor.kind === 'staff' ? actor.staffId : null,
            businessDate,
          })),
        )
        await bumpStock(tx, input.fromBranchId, line.ingredientId, -line.qtyBase)
        await tx.insert(stockTransferLines).values({
          transferId: transfer!.id,
          ingredientId: line.ingredientId,
          qtyBase: line.qtyBase,
        })
      }

      await this.audit.write(tx, {
        actor,
        action: 'stock.transfer-sent',
        entity: 'stock_transfer',
        entityId: String(transfer!.id),
        payload: { displayCode, to: input.toBranchId, lines: input.lines.length },
      })
      return { id: transfer!.id, displayCode }
    })
  }

  /**
   * Bên nhận xác nhận — đây là lúc `transfer_in` mới sinh ra.
   *
   * Nhận THIẾU thì phần chênh KHÔNG biến mất: nó thành một bút toán `write_off` ở
   * bên GỬI, vì hàng rời kho họ mà không tới nơi là hàng họ mất. Ghi hao ở bên
   * nhận sẽ làm chi nhánh nhận gánh hao của quãng đường mà họ không đi.
   */
  async receiveTransfer(
    id: number,
    lines: { ingredientId: string; receivedBase: number }[],
    actor: Actor,
  ) {
    const [transfer] = await this.db.select().from(stockTransfers).where(eq(stockTransfers.id, id))
    if (!transfer) throw new NotFoundException('Không có phiếu chuyển này')
    if (transfer.state !== 'sent') throw new ConflictException('Phiếu này đã được xử lý')

    const toBranch = await this.requireBranch(transfer.toBranchId)
    const businessDate = businessDateOf(new Date(), toBranch.timezone)
    await this.locks.assertOpen(transfer.toBranchId, [businessDate], 'nhận hàng chuyển kho')

    return this.db.transaction(async (tx) => {
      const declared = await tx
        .select({ line: stockTransferLines, ing: ingredients })
        .from(stockTransferLines)
        .innerJoin(ingredients, eq(ingredients.id, stockTransferLines.ingredientId))
        .where(eq(stockTransferLines.transferId, id))

      let shortageVnd = 0
      for (const { line, ing } of declared) {
        const declaredBase = Number(line.qtyBase)
        const counted = lines.find((l) => l.ingredientId === line.ingredientId)
        const receivedBase = counted ? counted.receivedBase : declaredBase
        if (!Number.isSafeInteger(receivedBase) || receivedBase < 0 || receivedBase > declaredBase) {
          throw new BadRequestException(
            `${ing.name}: số nhận phải nằm giữa 0 và ${declaredBase} ${ing.baseUnit}`,
          )
        }

        if (receivedBase > 0) {
          await tx.insert(stockMoves).values({
            branchId: transfer.toBranchId,
            ingredientId: line.ingredientId,
            kind: 'transfer_in',
            qtyBase: receivedBase,
            costVnd: Math.round((receivedBase * ing.costPerBaseMilli) / 1_000),
            docKind: 'stock_transfer',
            docId: id,
            actorId: actor.kind === 'staff' ? actor.staffId : null,
            businessDate,
          })
          await bumpStock(tx, transfer.toBranchId, line.ingredientId, receivedBase)
        }

        const missing = declaredBase - receivedBase
        if (missing > 0) {
          const costVnd = Math.round((missing * ing.costPerBaseMilli) / 1_000)
          shortageVnd += costVnd
          await tx.insert(stockMoves).values({
            branchId: transfer.fromBranchId,
            ingredientId: line.ingredientId,
            kind: 'write_off',
            qtyBase: -missing,
            costVnd: -costVnd,
            docKind: 'stock_transfer',
            docId: id,
            note: `Hao đường đi phiếu ${transfer.displayCode}`,
            actorId: actor.kind === 'staff' ? actor.staffId : null,
            businessDate,
          })
          /**
           * KHÔNG trừ tồn bên gửi lần nữa: `transfer_out` đã trừ đủ lúc gửi. Bút
           * toán này chỉ chuyển phần thiếu từ "đang đi đường" sang "đã mất" trên
           * SỔ, không đụng vào con số tồn.
           */
        }

        await tx
          .update(stockTransferLines)
          .set({ receivedBase })
          .where(
            and(
              eq(stockTransferLines.transferId, id),
              eq(stockTransferLines.ingredientId, line.ingredientId),
            ),
          )
      }

      await tx
        .update(stockTransfers)
        .set({
          state: 'received',
          receivedAt: new Date(),
          receivedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .where(eq(stockTransfers.id, id))

      await this.audit.write(tx, {
        actor,
        action: 'stock.transfer-received',
        entity: 'stock_transfer',
        entityId: String(id),
        payload: { shortageVnd },
      })
      return { id, state: 'received', shortageVnd }
    })
  }

  // ================================================ S11 · Báo cáo hao hụt

  /**
   * Tiêu hao THEO CÔNG THỨC so với tiêu hao THỰC TẾ.
   *
   * Lý thuyết = tổng định lượng của mọi món đã bán trong kỳ. Thực tế = tổng bút
   * toán xuất. Chênh lệch là hao — và nó đắt hơn người ta tưởng, vì 2% hao trên
   * giá vốn của một quán nướng là vài chục triệu mỗi tháng.
   *
   * BIA TƯƠI CÓ MỤC RIÊNG (§25 S11): rót lý thuyết so với keg thực dùng. Bọt và
   * phần cặn cuối keg là hao có thật, nhưng nó phải nằm trong một khoảng — ngoài
   * khoảng đó là vòi hỏng, hoặc là bia đi đường khác.
   */
  async wasteReport(branchId: string, from: string, to: string) {
    const [sold, actual, items] = await Promise.all([
      this.db
        .select({ dishId: orderLines.dishId, qty: sum(orderLines.qty) })
        .from(orderLines)
        .innerJoin(stockMoves, eq(stockMoves.orderLineId, orderLines.id))
        .where(
          and(
            eq(stockMoves.branchId, branchId),
            eq(stockMoves.kind, 'sale'),
            gte(stockMoves.businessDate, from),
            lte(stockMoves.businessDate, to),
          ),
        )
        .groupBy(orderLines.dishId),
      this.db
        .select({
          ingredientId: stockMoves.ingredientId,
          kind: stockMoves.kind,
          outBase: sum(sql`-${stockMoves.qtyBase}`),
          outVnd: sum(sql`-${stockMoves.costVnd}`),
        })
        .from(stockMoves)
        .where(
          and(
            eq(stockMoves.branchId, branchId),
            gte(stockMoves.businessDate, from),
            lte(stockMoves.businessDate, to),
            inArray(stockMoves.kind, ['sale', 'write_off', 'internal', 'count_adjust']),
          ),
        )
        .groupBy(stockMoves.ingredientId, stockMoves.kind),
      this.db.select().from(ingredients).where(eq(ingredients.active, true)),
    ])

    const recipes =
      sold.length > 0
        ? await this.db
            .select()
            .from(dishRecipes)
            .where(
              inArray(
                dishRecipes.dishId,
                sold.map((s) => s.dishId),
              ),
            )
        : []

    /** Lý thuyết: cộng định lượng (đã gồm hao hụt công thức) của mọi phần đã bán */
    const theoretical = new Map<string, number>()
    for (const recipe of recipes) {
      const portions = Number(sold.find((s) => s.dishId === recipe.dishId)?.qty ?? 0)
      if (portions <= 0) continue
      const need = effectiveQtyBase(portions, Number(recipe.qtyBase), recipe.wasteBp)
      theoretical.set(recipe.ingredientId, (theoretical.get(recipe.ingredientId) ?? 0) + need)
    }

    const pickBase = (id: string, kind: string) =>
      Number(actual.find((a) => a.ingredientId === id && a.kind === kind)?.outBase ?? 0)
    const pickVnd = (id: string, kind: string) =>
      Number(actual.find((a) => a.ingredientId === id && a.kind === kind)?.outVnd ?? 0)

    const rows = items
      .map((ing) => {
        const theoreticalBase = theoretical.get(ing.id) ?? 0
        const saleBase = pickBase(ing.id, 'sale')
        const writeOffBase = pickBase(ing.id, 'write_off')
        const internalBase = pickBase(ing.id, 'internal')
        // `count_adjust` mang dấu ngược khi thừa; hao là phần THIẾU khi kiểm kê
        const countBase = pickBase(ing.id, 'count_adjust')

        const actualBase = saleBase + writeOffBase + internalBase + countBase
        return {
          ingredientId: ing.id,
          ingredientName: ing.name,
          groupName: ing.groupName,
          baseUnit: ing.baseUnit,
          theoreticalBase,
          saleBase,
          writeOffBase,
          writeOffVnd: pickVnd(ing.id, 'write_off'),
          internalBase,
          internalVnd: pickVnd(ing.id, 'internal'),
          countBase,
          actualBase,
          ...varianceOf({
            theoreticalBase,
            actualBase,
            costPerBaseMilli: ing.costPerBaseMilli,
          }),
          isDraftBeer: ing.openShelfLifeDays > 0,
        }
      })
      .filter((r) => r.theoreticalBase > 0 || r.actualBase !== 0)
      .sort((a, b) => Math.abs(b.diffVnd) - Math.abs(a.diffVnd))

    return {
      branchId,
      from,
      to,
      rows,
      totals: {
        varianceVnd: rows.reduce((s, r) => s + r.diffVnd, 0),
        /** Huỷ là MẤT; ăn ca là chi phí có ích. Hai con số, đừng cộng lại. */
        writeOffVnd: rows.reduce((s, r) => s + r.writeOffVnd, 0),
        internalVnd: rows.reduce((s, r) => s + r.internalVnd, 0),
      },
      /** Mục riêng của bia tươi: rót lý thuyết so với keg thực dùng */
      draftBeer: rows
        .filter((r) => r.isDraftBeer)
        .map((r) => ({
          ingredientId: r.ingredientId,
          ingredientName: r.ingredientName,
          baseUnit: r.baseUnit,
          pouredBase: r.theoreticalBase,
          kegUsedBase: r.actualBase,
          diffBase: r.diffBase,
          diffVnd: r.diffVnd,
          ratio: r.ratio,
        })),
    }
  }

  // ===================================================== S12 · Thẻ kho

  /**
   * Thẻ kho một mặt hàng: mọi bút toán và tồn LUỸ KẾ sau từng dòng.
   *
   * Cột tồn luỹ kế là thứ khiến thẻ kho có ích: nhìn một dòng là biết ngay lúc đó
   * kho còn bao nhiêu, không phải tự cộng ngược từ đầu kỳ.
   */
  async stockCard(branchId: string, ingredientId: string, from: string, to: string) {
    const ing = await this.requireIngredient(ingredientId)

    const [opening] = await this.db
      .select({ qty: sum(stockMoves.qtyBase) })
      .from(stockMoves)
      .where(
        and(
          eq(stockMoves.branchId, branchId),
          eq(stockMoves.ingredientId, ingredientId),
          sql`${stockMoves.businessDate} < ${from}`,
        ),
      )

    const rows = await this.db
      .select({ move: stockMoves, byName: staff.fullName, lotCode: stockLots.lotCode })
      .from(stockMoves)
      .leftJoin(staff, eq(staff.id, stockMoves.actorId))
      .leftJoin(stockLots, eq(stockLots.id, stockMoves.lotId))
      .where(
        and(
          eq(stockMoves.branchId, branchId),
          eq(stockMoves.ingredientId, ingredientId),
          gte(stockMoves.businessDate, from),
          lte(stockMoves.businessDate, to),
        ),
      )
      .orderBy(asc(stockMoves.id))
      .limit(1_000)

    let running = Number(opening?.qty ?? 0)
    const moves = rows.map(({ move, byName, lotCode }) => {
      running += Number(move.qtyBase)
      return {
        id: move.id,
        businessDate: move.businessDate,
        createdAt: move.createdAt,
        kind: move.kind,
        qtyBase: Number(move.qtyBase),
        costVnd: Number(move.costVnd),
        lotCode,
        docKind: move.docKind,
        docId: move.docId,
        orderLineId: move.orderLineId,
        note: move.note,
        actorName: byName,
        /** Tồn ngay sau bút toán này */
        balanceBase: running,
      }
    })

    return {
      branchId,
      ingredient: {
        id: ing.id,
        name: ing.name,
        baseUnit: ing.baseUnit,
        costPerBaseMilli: ing.costPerBaseMilli,
      },
      from,
      to,
      openingBase: Number(opening?.qty ?? 0),
      closingBase: running,
      moves,
    }
  }

  // ============================================================== phụ trợ

  private async requireBranch(branchId: string) {
    const [row] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!row) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return row
  }

  private async requireIngredient(id: string) {
    const [row] = await this.db.select().from(ingredients).where(eq(ingredients.id, id))
    if (!row) throw new NotFoundException(`Không có nguyên liệu ${id}`)
    return row
  }

  private async write(
    actor: Actor,
    action: string,
    entity: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.audit.writeStandalone({ actor, action, entity, entityId, payload })
  }
}
