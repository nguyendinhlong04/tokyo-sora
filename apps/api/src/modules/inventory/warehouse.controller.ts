import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { WarehouseService } from './warehouse.service'

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')

const Approval = z
  .object({
    approverStaffId: z.number().int().positive(),
    approverPin: z.string().min(4).max(6),
    reason: z.string().min(1).max(300),
  })
  .nullish()

const SupplierBody = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(160),
  taxCode: z
    .string()
    .regex(/^\d{10}(-\d{3})?$/, 'MST gồm 10 số, đơn vị phụ thuộc thêm -3 số')
    .nullable()
    .default(null),
  contactName: z.string().max(120).nullable().default(null),
  phone: z.string().max(40).nullable().default(null),
  email: z.string().email().max(160).nullable().default(null),
  address: z.string().max(300).nullable().default(null),
  paymentTermDays: z.number().int().min(0).max(180).default(0),
  cutoffMinute: z.number().int().min(0).max(1439).nullable().default(null),
  note: z.string().max(300).nullable().default(null),
  active: z.boolean().default(true),
})

const SupplierItemBody = z.object({
  supplierId: z.number().int().positive(),
  ingredientId: z.string().min(1),
  priceVnd: z.number().int().positive(),
  minOrderPurchase: z.number().int().min(1).default(1),
  leadTimeDays: z.number().int().min(0).max(90).default(1),
  preferred: z.boolean().default(false),
})

const PurchaseOrderBody = z.object({
  branchId: z.string().min(1),
  supplierId: z.number().int().positive(),
  expectedOn: BusinessDate.nullable().default(null),
  note: z.string().max(300).nullable().default(null),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        qtyPurchase: z.number().int().positive(),
        priceVnd: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
})

const ReceiveBody = z.object({
  branchId: z.string().min(1),
  ingredientId: z.string().min(1),
  qtyPurchase: z.number().positive(),
  totalVnd: z.number().int().min(0),
  supplierId: z.number().int().positive().nullable().default(null),
  purchaseOrderId: z.number().int().positive().nullable().default(null),
  lotCode: z.string().max(60).nullable().default(null),
  expiresOn: BusinessDate.nullable().default(null),
  /** °C nhân 10 — hàng đông −180 nghĩa là −18,0°C */
  receiveTempDeciC: z.number().int().min(-400).max(600).nullable().default(null),
  note: z.string().max(300).nullable().default(null),
})

const IssueBody = z.object({
  branchId: z.string().min(1),
  kind: z.enum(['write_off', 'internal']),
  ingredientId: z.string().min(1),
  qtyBase: z.number().int().positive(),
  reason: z.string().min(1).max(300),
  approval: Approval,
})

const ProductionBody = z.object({
  branchId: z.string().min(1),
  kind: z.enum(['pha-che', 'pha-loc', 'duc-keg']),
  inputs: z
    .array(z.object({ ingredientId: z.string().min(1), qtyBase: z.number().int().positive() }))
    .min(1)
    .max(50),
  outputs: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        qtyBase: z.number().int().positive(),
        costShareBp: z.number().int().min(0).max(10_000),
      }),
    )
    .min(1)
    .max(50),
  note: z.string().max(300).nullable().default(null),
})

const CountLinesBody = z.object({
  lines: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        countedBase: z.number().int().min(0),
        note: z.string().max(200).nullable().default(null),
      }),
    )
    .max(500),
})

const TransferBody = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  note: z.string().max(300).nullable().default(null),
  lines: z
    .array(z.object({ ingredientId: z.string().min(1), qtyBase: z.number().int().positive() }))
    .min(1)
    .max(200),
})

const ReceiveTransferBody = z.object({
  lines: z
    .array(z.object({ ingredientId: z.string().min(1), receivedBase: z.number().int().min(0) }))
    .max(200)
    .default([]),
})

/**
 * Kho — S3 … S12.
 *
 * Quyền chia theo BA MỨC của §4.2, và ranh giới nằm ở chỗ thao tác đụng vào cái gì:
 *   · `cost.view-recipe`  — mọi màn ĐỌC (sổ lô, thẻ kho, hao hụt, đơn đặt hàng).
 *     Cùng quyền với S1/S2 vì chúng cùng để lộ giá vốn.
 *   · `stock.receive`     — nhập kho và đặt hàng: thủ kho làm được, không cần duyệt.
 *   · `stock.write-off`   — xuất huỷ, xuất nội bộ, chuyển kho: dấu △ với thủ kho,
 *     nên tầng dịch vụ gọi `ApprovalService` chứ guard không tự đòi PIN.
 *   · `stock.close-count` — chốt kiểm kê, thao tác biến chênh lệch thành chi phí.
 *
 * Khai nhà cung cấp đứng sau `stock.receive` chứ không sau quyền quản trị: người
 * mua hàng là người biết mối nào bán gì, và bắt họ đi xin chủ quán mỗi lần đổi
 * nhà cung cấp là cách hồ sơ nhà cung cấp không bao giờ đúng.
 */
@Controller('api/warehouse')
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  // ---------------------------------------------------------------- S3

  @Get('suppliers')
  @RequirePermission('cost.view-recipe')
  suppliers() {
    return this.warehouse.suppliers()
  }

  @Post('suppliers')
  @RequirePermission('stock.receive')
  createSupplier(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.warehouse.saveSupplier(SupplierBody.parse(body), req.actor!)
  }

  @Put('suppliers/:id')
  @RequirePermission('stock.receive')
  updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.warehouse.saveSupplier(SupplierBody.parse(body), req.actor!, id)
  }

  @Put('supplier-items')
  @RequirePermission('stock.receive')
  setSupplierItem(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.warehouse.setSupplierItem(SupplierItemBody.parse(body), req.actor!)
  }

  @Delete('suppliers/:id/items/:ingredientId')
  @RequirePermission('stock.receive')
  removeSupplierItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('ingredientId') ingredientId: string,
    @Req() req: RequestWithActor,
  ) {
    return this.warehouse.removeSupplierItem(id, ingredientId, req.actor!)
  }

  // ---------------------------------------------------------------- S4

  @Get('purchase-orders')
  @RequirePermission('cost.view-recipe')
  purchaseOrders(@Query('branch') branch: string, @Query('state') state?: string) {
    return this.warehouse.purchaseOrders(this.requireBranch(branch), state ?? null)
  }

  @Get('reorder-suggestions')
  @RequirePermission('cost.view-recipe')
  reorderSuggestions(@Query('branch') branch: string) {
    return this.warehouse.reorderSuggestions(this.requireBranch(branch))
  }

  @Post('purchase-orders')
  @RequirePermission('stock.receive')
  createPurchaseOrder(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.warehouse.createPurchaseOrder(PurchaseOrderBody.parse(body), req.actor!)
  }

  @Post('purchase-orders/:id/send')
  @RequirePermission('stock.receive')
  sendPurchaseOrder(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.warehouse.sendPurchaseOrder(id, req.actor!)
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermission('stock.receive')
  cancelPurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { reason } = z.object({ reason: z.string().min(1).max(300) }).parse(body)
    return this.warehouse.cancelPurchaseOrder(id, reason, req.actor!)
  }

  // ---------------------------------------------------------------- S5

  @Post('receipts')
  @RequirePermission('stock.receive')
  receive(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.warehouse.receiveLot(ReceiveBody.parse(body), req.actor!)
  }

  // ---------------------------------------------------------------- S6

  @Post('issues')
  @RequirePermission('stock.write-off')
  issue(@Body() body: unknown, @Req() req: RequestWithActor) {
    const { approval, ...input } = IssueBody.parse(body)
    return this.warehouse.issue(input, req.actor!, approval)
  }

  // ---------------------------------------------------------------- S7

  @Post('production')
  @RequirePermission('stock.receive')
  produce(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.warehouse.produce(ProductionBody.parse(body), req.actor!)
  }

  @Post('lots/:id/tap')
  @RequirePermission('stock.receive')
  tapKeg(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(body)
    return this.warehouse.tapKeg({ branchId, lotId: id }, req.actor!)
  }

  // ---------------------------------------------------------------- S8

  @Post('counts')
  @RequirePermission('stock.receive')
  openCount(@Body() body: unknown, @Req() req: RequestWithActor) {
    const input = z
      .object({
        branchId: z.string().min(1),
        groupName: z.string().max(60).nullable().default(null),
      })
      .parse(body)
    return this.warehouse.openCount(input, req.actor!)
  }

  @Get('counts/:id')
  @RequirePermission('cost.view-recipe')
  countSheet(@Param('id', ParseIntPipe) id: number) {
    return this.warehouse.countSheet(id)
  }

  @Put('counts/:id/lines')
  @RequirePermission('stock.receive')
  saveCountLines(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.warehouse.saveCountLines(id, CountLinesBody.parse(body).lines, req.actor!)
  }

  @Post('counts/:id/close')
  @RequirePermission('stock.close-count')
  closeCount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const { approval } = z.object({ approval: Approval }).parse(body ?? {})
    return this.warehouse.closeCount(id, req.actor!, approval)
  }

  @Post('counts/:id/cancel')
  @RequirePermission('stock.receive')
  cancelCount(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.warehouse.cancelCount(id, req.actor!)
  }

  // ---------------------------------------------------------------- S9

  @Get('lots')
  @RequirePermission('cost.view-recipe')
  lots(@Query('branch') branch: string, @Query('all') all?: string) {
    return this.warehouse.lots(this.requireBranch(branch), all !== 'true')
  }

  // --------------------------------------------------------------- S10

  @Get('transfers')
  @RequirePermission('cost.view-recipe')
  transfers(@Query('branch') branch: string) {
    return this.warehouse.transfers(this.requireBranch(branch))
  }

  @Post('transfers')
  @RequirePermission('stock.write-off')
  sendTransfer(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.warehouse.sendTransfer(TransferBody.parse(body), req.actor!)
  }

  @Post('transfers/:id/receive')
  @RequirePermission('stock.receive')
  receiveTransfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.warehouse.receiveTransfer(id, ReceiveTransferBody.parse(body ?? {}).lines, req.actor!)
  }

  // --------------------------------------------------------------- S11

  @Get('waste')
  @RequirePermission('cost.view-recipe')
  waste(@Query('branch') branch: string, @Query('from') from: string, @Query('to') to: string) {
    return this.warehouse.wasteReport(
      this.requireBranch(branch),
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  // --------------------------------------------------------------- S12

  @Get('stock-card')
  @RequirePermission('cost.view-recipe')
  stockCard(
    @Query('branch') branch: string,
    @Query('ingredient') ingredient: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!ingredient) throw new BadRequestException('Thiếu mã nguyên liệu')
    return this.warehouse.stockCard(
      this.requireBranch(branch),
      ingredient,
      BusinessDate.parse(from),
      BusinessDate.parse(to),
    )
  }

  private requireBranch(branch: string): string {
    if (!branch) throw new BadRequestException('Thiếu mã chi nhánh')
    return branch
  }
}
