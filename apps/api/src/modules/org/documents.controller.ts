import {
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
  UseInterceptors,
} from '@nestjs/common'
import {
  ASSIGNMENT_KINDS,
  DECISION_TYPES,
  DOC_KINDS,
  PERSONNEL_DECISIONS,
  ROLES,
} from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { DocumentsService } from './documents.service'

const Id = z.number().int().positive()
const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
const Reason = z.string().trim().min(1, 'Ghi lý do').max(300)

const Attachment = z.object({
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => /^https:\/\/\S+$/.test(u), 'Đường dẫn đính kèm phải bắt đầu bằng https://'),
})

const Target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('toan-chuoi') }),
  z.object({ kind: z.literal('chi-nhanh'), branchId: z.string().min(1) }),
  z.object({ kind: z.literal('don-vi'), unitId: Id, includeChildren: z.boolean().default(true) }),
  z.object({ kind: z.literal('chuc-danh'), positionId: Id }),
  z.object({
    kind: z.literal('vai-tro'),
    role: z.enum(ROLES).exclude(['R0']),
    branchId: z.string().min(1).nullable().default(null),
  }),
  z.object({ kind: z.literal('ca-nhan'), staffId: Id }),
])

const Change = z.object({
  staffId: Id,
  positionId: Id,
  assignmentKind: z.enum(ASSIGNMENT_KINDS).default('chinh'),
})

const DocumentBody = z
  .object({
    kind: z.enum(DOC_KINDS),
    decisionType: z.enum(DECISION_TYPES).nullable().default(null),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
    attachments: z.array(Attachment).max(10).default([]),
    targets: z.array(Target).min(1, 'Chọn ít nhất một nơi nhận').max(20),
    changes: z.array(Change).min(1).max(20).nullable().default(null),
    requiresAck: z.boolean().default(false),
    effectiveFrom: BusinessDate,
    effectiveTo: BusinessDate.nullable().default(null),
  })
  .superRefine((b, ctx) => {
    if ((b.kind === 'quyet-dinh') !== (b.decisionType !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['decisionType'],
        message: 'Quyết định phải chọn loại quyết định; văn bản khác thì không',
      })
    }
    const personnel = b.decisionType !== null && PERSONNEL_DECISIONS.includes(b.decisionType)
    if (personnel !== (b.changes !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['changes'],
        message: 'Quyết định bổ nhiệm, điều chuyển, miễn nhiệm phải ghi rõ ai và chức danh nào',
      })
    }
    if (b.effectiveTo && b.effectiveTo < b.effectiveFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Hết hiệu lực trước ngày bắt đầu',
      })
    }
  })

const SubmitBody = z.object({ signerId: Id })
const SignBody = z.object({ pin: z.string().regex(/^\d{4,6}$/, 'PIN gồm 4–6 chữ số') })
const NoteBody = z.object({ note: Reason })
const RevokeBody = z.object({ reason: Reason })
const PreviewBody = z.object({ targets: z.array(Target).max(20) })
const ReceiptBody = z.object({ ack: z.boolean().default(false) })

/**
 * Văn bản nội bộ — N4 (sổ, soạn, trình, ký, thu hồi) và hộp thư "của tôi".
 *
 * Soạn mở cho mọi vai trò có tài khoản Office (`doc.compose`) — chữ ký mới là
 * chốt chặn. Ký thông báo: R7 · R11 · R13 · R10 trong phạm vi; ký quyết định và
 * quy định: R11 · R10 (service kiểm theo loại văn bản).
 */
@Controller('api/org')
@UseInterceptors(IdempotencyInterceptor)
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get('documents')
  @RequirePermission('doc.compose')
  register(
    @Query('state') state: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('q') q: string | undefined,
    @Req() req: RequestWithActor,
  ) {
    return this.docs.register(req.actor!, { state, kind, q })
  }

  @Get('documents/signers')
  @RequirePermission('doc.compose')
  signers(@Query('kind') kind: string, @Req() req: RequestWithActor) {
    return this.docs.signers(req.actor!, z.enum(DOC_KINDS).parse(kind))
  }

  @Post('documents/audience-preview')
  @RequirePermission('doc.compose')
  audience(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.docs.audiencePreview(req.actor!, PreviewBody.parse(body).targets)
  }

  @Post('documents')
  @RequirePermission('doc.compose')
  create(@Body() body: unknown, @Req() req: RequestWithActor) {
    return this.docs.createDraft(req.actor!, DocumentBody.parse(body))
  }

  @Get('documents/:id')
  @RequirePermission('doc.compose')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.docs.detail(req.actor!, id)
  }

  @Put('documents/:id')
  @RequirePermission('doc.compose')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.docs.updateDraft(req.actor!, id, DocumentBody.parse(body))
  }

  @Delete('documents/:id')
  @RequirePermission('doc.compose')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.docs.deleteDraft(req.actor!, id)
  }

  @Post('documents/:id/submit')
  @RequirePermission('doc.compose')
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.docs.submit(req.actor!, id, SubmitBody.parse(body).signerId)
  }

  @Post('documents/:id/return')
  @RequirePermission('doc.sign-notice')
  giveBack(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.docs.returnToDraft(req.actor!, id, NoteBody.parse(body).note)
  }

  @Post('documents/:id/sign')
  @RequirePermission('doc.sign-notice')
  sign(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Req() req: RequestWithActor) {
    return this.docs.sign(req.actor!, id, SignBody.parse(body).pin)
  }

  @Post('documents/:id/revoke')
  @RequirePermission('doc.sign-notice')
  revoke(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.docs.revoke(req.actor!, id, RevokeBody.parse(body).reason)
  }

  // ------------------------------------------------ Của tôi — Office và Kênh nhân viên

  @Get('me/documents')
  @RequirePermission('staff.view-own-record')
  mine(@Query('filter') filter: string | undefined, @Req() req: RequestWithActor) {
    return this.docs.mine(req.actor!, filter === 'unread')
  }

  @Get('me/documents/:id')
  @RequirePermission('staff.view-own-record')
  mineDetail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.docs.mineDetail(req.actor!, id)
  }

  @Post('me/documents/:id/receipt')
  @RequirePermission('staff.view-own-record')
  receipt(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.docs.markReceipt(req.actor!, id, ReceiptBody.parse(body).ack)
  }
}
