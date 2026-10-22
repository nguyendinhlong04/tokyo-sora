import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  checkPermission,
  PERSONNEL_DECISIONS,
  type ActionKey,
  type DecisionType,
  type DocAttachment,
  type DocKind,
  type DocTarget,
  type DocumentDetail,
  type DocumentRow,
  type MyDocument,
  type MyDocumentDetail,
  type PersonnelChange,
  type Role,
  type SignerOption,
} from '@sora/contracts'
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  orgDocumentCounters,
  orgDocumentReceipts,
  orgDocuments,
  positionAssignments,
  staff,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'
import { IdentityService } from '../identity/identity.service'
import {
  formatDocNumber,
  matchesTarget,
  planPersonnelChanges,
  resolveRecipients,
  targetsWithinScope,
} from './domain/documents'
import { scopeOf, type OrgSnapshot } from './domain/org'
import { OrgService, requireStaff, todayVN } from './org.service'

export interface DocumentInput {
  kind: DocKind
  decisionType: DecisionType | null
  title: string
  body: string
  attachments: DocAttachment[]
  targets: DocTarget[]
  changes: PersonnelChange[] | null
  requiresAck: boolean
  effectiveFrom: string
  effectiveTo: string | null
}

type DocRow = typeof orgDocuments.$inferSelect

const conflict = (code: string, message: string) => new ConflictException({ code, message })
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message })

/** Thông báo ký bằng khoá thông báo; quyết định và quy định cần người đại diện */
const signAction = (kind: DocKind): ActionKey =>
  kind === 'thong-bao' ? 'doc.sign-notice' : 'doc.sign-decision'

const isPersonnel = (d: { decisionType: DecisionType | null }) =>
  d.decisionType !== null && PERSONNEL_DECISIONS.includes(d.decisionType)

/** Vai trò THẬT của một người (mọi chi nhánh) — không trộn vai trò thiết bị của phiên */
const rolesIn = (snap: OrgSnapshot, staffId: number): Role[] =>
  (snap.people.get(staffId)?.roles ?? []).map((g) => g.role)

const canSign = (snap: OrgSnapshot, staffId: number, kind: DocKind) =>
  checkPermission(signAction(kind), rolesIn(snap, staffId)) === 'allow'

/**
 * Văn bản nội bộ — N4 và hộp thư của Kênh nhân viên.
 *
 * Ký ban hành KHÔNG đi qua ApprovalService: hàm đó bỏ qua PIN khi người làm đã có
 * quyền, và chỉ hợp khi người duyệt đứng cạnh màn hình người xin. Ở đây người ký
 * mở văn bản trên máy mình và nhập PIN của CHÍNH MÌNH — PIN là chữ ký, có chặn
 * thử sai như cửa đăng nhập.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly org: OrgService,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
  ) {}

  // ================================================================= Sổ văn bản

  async register(actor: Actor, filter: { state?: string; kind?: string; q?: string }) {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'doc', snap)
    const docs = await this.db.select().from(orgDocuments).orderBy(desc(orgDocuments.createdAt))
    const visible = docs.filter(
      (d) =>
        d.authorId === me.staffId ||
        d.signerId === me.staffId ||
        scope.chain ||
        (d.state !== 'draft' && targetsWithinScope(scope, d.targets as DocTarget[], snap)),
    )
    const needle = filter.q?.trim().toLowerCase() ?? ''
    const rows = visible.filter(
      (d) =>
        (!filter.state || d.state === filter.state) &&
        (!filter.kind || d.kind === filter.kind) &&
        (!needle ||
          d.title.toLowerCase().includes(needle) ||
          (d.number?.toLowerCase().includes(needle) ?? false)),
    )
    return this.toRows(rows)
  }

  async detail(actor: Actor, id: number): Promise<DocumentDetail> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const scope = scopeOf(me.staffId, 'doc', snap)
    const doc = await this.requireDoc(this.db, id)
    const own = doc.authorId === me.staffId || doc.signerId === me.staffId
    const targets = doc.targets as DocTarget[]
    if (
      !own &&
      !scope.chain &&
      (doc.state === 'draft' || !targetsWithinScope(scope, targets, snap))
    ) {
      throw new NotFoundException({ code: 'document_not_found', message: 'Không có văn bản này' })
    }

    const [row] = await this.toRows([doc])
    const receipts = await this.db
      .select({
        staffId: orgDocumentReceipts.staffId,
        readAt: orgDocumentReceipts.readAt,
        ackedAt: orgDocumentReceipts.ackedAt,
        fullName: staff.fullName,
      })
      .from(orgDocumentReceipts)
      .innerJoin(staff, eq(staff.id, orgDocumentReceipts.staffId))
      .where(eq(orgDocumentReceipts.documentId, id))
    const waiting = receipts
      .filter((r) => r.readAt === null || (doc.requiresAck && r.ackedAt === null))
      .map((r) => ({ staffId: r.staffId, fullName: r.fullName, read: r.readAt !== null }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))

    const signable =
      (doc.state === 'pending' && doc.signerId === me.staffId) ||
      (doc.state === 'draft' &&
        doc.authorId === me.staffId &&
        canSign(snap, me.staffId, doc.kind) &&
        targetsWithinScope(scope, targets, snap))

    return {
      ...row!,
      body: doc.body,
      attachments: doc.attachments as DocAttachment[],
      targets,
      changes: (doc.changes as PersonnelChange[] | null) ?? null,
      returnNote: doc.returnNote,
      revokedAt: doc.revokedAt?.toISOString() ?? null,
      revokeReason: doc.revokeReason,
      // Ai chưa đọc là chuyện của người phát hành, không phải của mọi người trong phạm vi
      pending: own || scope.chain ? waiting : null,
      canEdit: doc.state === 'draft' && doc.authorId === me.staffId,
      canSign: signable,
      canRevoke:
        doc.state === 'issued' &&
        !isPersonnel(doc) &&
        canSign(snap, me.staffId, doc.kind) &&
        targetsWithinScope(scope, targets, snap),
    }
  }

  // ================================================================= Nháp

  async createDraft(actor: Actor, input: DocumentInput) {
    const me = requireStaff(actor)
    await this.validateRefs(input)
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(orgDocuments)
        .values({ ...this.normalize(input), authorId: me.staffId })
        .returning({ id: orgDocuments.id })
      await this.audit.write(tx, {
        actor,
        action: 'doc.drafted',
        entity: 'org_document',
        entityId: String(row!.id),
        payload: { kind: input.kind, title: input.title },
      })
      return { id: row!.id }
    })
  }

  async updateDraft(actor: Actor, id: number, input: DocumentInput) {
    const me = requireStaff(actor)
    await this.validateRefs(input)
    return this.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, id, true)
      if (doc.authorId !== me.staffId) throw forbidden('not_author', 'Chỉ người soạn sửa được nháp')
      if (doc.state !== 'draft')
        throw conflict('document_not_draft', 'Văn bản đã trình ký — không sửa được')
      await tx
        .update(orgDocuments)
        .set({ ...this.normalize(input), updatedAt: new Date() })
        .where(eq(orgDocuments.id, id))
      return { id }
    })
  }

  async deleteDraft(actor: Actor, id: number) {
    const me = requireStaff(actor)
    return this.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, id, true)
      if (doc.authorId !== me.staffId) throw forbidden('not_author', 'Chỉ người soạn xoá được nháp')
      if (doc.state !== 'draft')
        throw conflict('document_not_draft', 'Văn bản đã trình ký — không xoá được')
      await tx.delete(orgDocuments).where(eq(orgDocuments.id, id))
      return { id }
    })
  }

  // ================================================================= Trình — trả — ký — thu hồi

  /** Nháp → chờ ký. Kiểm người ký TRƯỚC khi chuyển, để không ai phải chờ một chữ ký không thể có */
  async submit(actor: Actor, id: number, signerId: number) {
    const me = requireStaff(actor)
    if (signerId === me.staffId) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Tự ký thì bấm Ký ban hành, không cần trình',
      })
    }
    return this.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, id, true)
      if (doc.authorId !== me.staffId) throw forbidden('not_author', 'Chỉ người soạn trình được')
      if (doc.state !== 'draft') throw conflict('document_not_draft', 'Văn bản đã trình rồi')

      const [signer] = await tx
        .select({ active: staff.active, hasPin: sql<boolean>`${staff.pinHash} IS NOT NULL` })
        .from(staff)
        .where(eq(staff.id, signerId))
      if (!signer?.active) throw conflict('signer_not_permitted', 'Người ký không còn hoạt động')
      if (!signer.hasPin) {
        throw conflict('signer_no_pin', 'Người ký chưa có PIN — đặt PIN ở A1 trước khi trình')
      }
      const snap = await this.org.snapshot(todayVN(), tx)
      this.assertSigner(snap, signerId, doc)

      await tx
        .update(orgDocuments)
        .set({ state: 'pending', signerId, returnNote: null, updatedAt: new Date() })
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.state, 'draft')))
      await this.audit.write(tx, {
        actor,
        action: 'doc.submitted',
        entity: 'org_document',
        entityId: String(id),
        payload: { signerId },
      })
      return { id, state: 'pending' as const }
    })
  }

  async returnToDraft(actor: Actor, id: number, note: string) {
    const me = requireStaff(actor)
    return this.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, id, true)
      if (doc.state !== 'pending')
        throw conflict('document_not_pending', 'Văn bản không ở trạng thái chờ ký')
      if (doc.signerId !== me.staffId) {
        throw forbidden('not_designated_signer', 'Văn bản này trình cho người khác ký')
      }
      await tx
        .update(orgDocuments)
        .set({ state: 'draft', returnNote: note, updatedAt: new Date() })
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.state, 'pending')))
      await this.audit.write(tx, {
        actor,
        action: 'doc.returned',
        entity: 'org_document',
        entityId: String(id),
        payload: { note },
      })
      return { id, state: 'draft' as const }
    })
  }

  /**
   * Ký ban hành — một transaction: cấp số, áp quyết định nhân sự vào sơ đồ, chụp
   * danh sách người nhận, ghi biên nhận. Hỏng một bước là không có gì xảy ra:
   * không có văn bản mang số mà không tới tay ai, không có bổ nhiệm mà không có
   * quyết định.
   */
  async sign(actor: Actor, id: number, pin: string) {
    const me = requireStaff(actor)
    const verified = await this.identity.verifyPinOnly(
      me.staffId,
      pin,
      me.branchId,
      `sign:${me.staffId}`,
    )
    if (!verified) throw forbidden('pin_invalid', 'PIN không đúng')

    return this.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, id, true)
      if (doc.state === 'pending' && doc.signerId !== me.staffId) {
        throw forbidden('not_designated_signer', 'Văn bản này trình cho người khác ký')
      }
      const direct = doc.state === 'draft' && doc.authorId === me.staffId
      if (!(doc.state === 'pending' || direct)) {
        throw conflict('document_not_pending', 'Văn bản không ở trạng thái chờ ký')
      }

      const today = todayVN()
      const before = await this.org.snapshot(today, tx)
      this.assertSigner(before, me.staffId, doc)

      // Quyết định nhân sự đổi sơ đồ TRƯỚC khi chụp người nhận: người vừa được bổ
      // nhiệm nhận được chính quyết định của mình
      const changes = (doc.changes as PersonnelChange[] | null) ?? []
      if (isPersonnel(doc)) await this.applyPersonnel(tx, doc, changes, me.staffId)

      const [counter] = await tx
        .insert(orgDocumentCounters)
        .values({ kind: doc.kind, period: `${today.slice(0, 7)}-01`, counter: 1 })
        .onConflictDoUpdate({
          target: [orgDocumentCounters.kind, orgDocumentCounters.period],
          set: { counter: sql`${orgDocumentCounters.counter} + 1` },
        })
        .returning({ counter: orgDocumentCounters.counter })
      const number = formatDocNumber(doc.kind, today, counter!.counter)

      const after = await this.org.snapshot(today, tx)
      const recipients = resolveRecipients(doc.targets as DocTarget[], after, [
        doc.authorId,
        me.staffId,
      ])
      if (recipients.length === 0) {
        throw conflict('no_recipients', 'Không có ai thuộc nơi nhận của văn bản này')
      }

      await tx
        .update(orgDocuments)
        .set({
          state: 'issued',
          number,
          signerId: me.staffId,
          signedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orgDocuments.id, id))
      await tx
        .insert(orgDocumentReceipts)
        .values(recipients.map((staffId) => ({ documentId: id, staffId })))
        .onConflictDoNothing()
      await this.org.syncTitles(tx, today)

      await this.audit.write(tx, {
        actor,
        action: 'doc.signed',
        entity: 'org_document',
        entityId: String(id),
        payload: { number, recipients: recipients.length, changes },
      })
      return { id, number, recipients: recipients.length }
    })
  }

  async revoke(actor: Actor, id: number, reason: string) {
    const me = requireStaff(actor)
    return this.db.transaction(async (tx) => {
      const doc = await this.requireDoc(tx, id, true)
      if (doc.state !== 'issued')
        throw conflict('document_not_issued', 'Chỉ thu hồi được văn bản đã ban hành')
      if (isPersonnel(doc)) {
        throw conflict(
          'decision_not_revocable',
          'Quyết định nhân sự không thu hồi — sai thì ban hành quyết định khác để sửa',
        )
      }
      const snap = await this.org.snapshot(todayVN(), tx)
      this.assertSigner(snap, me.staffId, doc)
      await tx
        .update(orgDocuments)
        .set({
          state: 'revoked',
          revokedAt: new Date(),
          revokedBy: me.staffId,
          revokeReason: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(orgDocuments.id, id), eq(orgDocuments.state, 'issued')))
      await this.audit.write(tx, {
        actor,
        action: 'doc.revoked',
        entity: 'org_document',
        entityId: String(id),
        payload: { reason },
      })
      return { id, state: 'revoked' as const }
    })
  }

  /** Người ký hợp lệ cho một loại văn bản: có quyền ký và đã có PIN */
  async signers(actor: Actor, kind: DocKind): Promise<SignerOption[]> {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    const people = await this.db
      .select({ id: staff.id, fullName: staff.fullName })
      .from(staff)
      .where(and(eq(staff.active, true), isNotNull(staff.pinHash)))
    const titles = await this.org.titlesOf(snap)
    return people
      .filter((p) => p.id !== me.staffId && canSign(snap, p.id, kind))
      .map((p) => ({ staffId: p.id, fullName: p.fullName, title: titles.get(p.id) ?? null }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
  }

  async audiencePreview(actor: Actor, targets: DocTarget[]) {
    const me = requireStaff(actor)
    const snap = await this.org.snapshot()
    return { count: resolveRecipients(targets, snap, [me.staffId]).length }
  }

  // ================================================================= Của tôi

  async mine(actor: Actor, onlyUnread: boolean): Promise<MyDocument[]> {
    const me = requireStaff(actor)
    await this.backfillRegulations(me.staffId)
    const rows = await this.db
      .select({ d: orgDocuments, r: orgDocumentReceipts, signerName: staff.fullName })
      .from(orgDocumentReceipts)
      .innerJoin(orgDocuments, eq(orgDocuments.id, orgDocumentReceipts.documentId))
      .leftJoin(staff, eq(staff.id, orgDocuments.signerId))
      .where(
        and(
          eq(orgDocumentReceipts.staffId, me.staffId),
          eq(orgDocuments.state, 'issued'),
          onlyUnread ? isNull(orgDocumentReceipts.readAt) : undefined,
        ),
      )
      .orderBy(desc(orgDocuments.signedAt))
    return rows.map(({ d, r, signerName }) => this.toMine(d, r, signerName))
  }

  async mineDetail(actor: Actor, id: number): Promise<MyDocumentDetail> {
    const me = requireStaff(actor)
    const [row] = await this.db
      .select({ d: orgDocuments, r: orgDocumentReceipts, signerName: staff.fullName })
      .from(orgDocumentReceipts)
      .innerJoin(orgDocuments, eq(orgDocuments.id, orgDocumentReceipts.documentId))
      .leftJoin(staff, eq(staff.id, orgDocuments.signerId))
      .where(
        and(
          eq(orgDocumentReceipts.documentId, id),
          eq(orgDocumentReceipts.staffId, me.staffId),
          eq(orgDocuments.state, 'issued'),
        ),
      )
    if (!row)
      throw new NotFoundException({ code: 'document_not_found', message: 'Không có văn bản này' })
    return {
      ...this.toMine(row.d, row.r, row.signerName),
      body: row.d.body,
      attachments: row.d.attachments as DocAttachment[],
    }
  }

  /** Đã đọc / đã đọc và hiểu. Gọi lại là không đổi gì — mốc ghi đúng một lần */
  async markReceipt(actor: Actor, id: number, ack: boolean) {
    const me = requireStaff(actor)
    const [doc] = await this.db
      .select({ requiresAck: orgDocuments.requiresAck, state: orgDocuments.state })
      .from(orgDocuments)
      .where(eq(orgDocuments.id, id))
    if (!doc || doc.state !== 'issued') {
      throw new NotFoundException({ code: 'document_not_found', message: 'Không có văn bản này' })
    }
    const [row] = await this.db
      .update(orgDocumentReceipts)
      .set({
        readAt: sql`coalesce(${orgDocumentReceipts.readAt}, now())`,
        ackedAt:
          ack && doc.requiresAck
            ? sql`coalesce(${orgDocumentReceipts.ackedAt}, now())`
            : sql`${orgDocumentReceipts.ackedAt}`,
      })
      .where(
        and(eq(orgDocumentReceipts.documentId, id), eq(orgDocumentReceipts.staffId, me.staffId)),
      )
      .returning({ readAt: orgDocumentReceipts.readAt, ackedAt: orgDocumentReceipts.ackedAt })
    if (!row)
      throw new NotFoundException({ code: 'document_not_found', message: 'Không có văn bản này' })
    return {
      readAt: row.readAt?.toISOString() ?? null,
      ackedAt: row.ackedAt?.toISOString() ?? null,
    }
  }

  /** Số đếm cho hộp "Việc cần xử lý" */
  async counts(staffId: number) {
    await this.backfillRegulations(staffId)
    const [mine] = await this.db
      .select({
        unread: sql<number>`count(*) FILTER (WHERE ${orgDocumentReceipts.readAt} IS NULL)::int`,
        toAck: sql<number>`count(*) FILTER (WHERE ${orgDocuments.requiresAck} AND ${orgDocumentReceipts.ackedAt} IS NULL)::int`,
      })
      .from(orgDocumentReceipts)
      .innerJoin(orgDocuments, eq(orgDocuments.id, orgDocumentReceipts.documentId))
      .where(and(eq(orgDocumentReceipts.staffId, staffId), eq(orgDocuments.state, 'issued')))
    const [sign] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orgDocuments)
      .where(and(eq(orgDocuments.state, 'pending'), eq(orgDocuments.signerId, staffId)))
    return { unread: mine?.unread ?? 0, toAck: mine?.toAck ?? 0, toSign: sign?.n ?? 0 }
  }

  // ================================================================= Nội bộ

  /**
   * Quy định còn hiệu lực bù biên nhận cho người vào sau: nhân viên mới vẫn phải
   * đọc và xác nhận nội quy ATTP. Thông báo, quyết định thì giữ đúng ảnh chụp lúc
   * ký — người vào sau không "nhận" một thông báo của tháng trước.
   */
  private async backfillRegulations(staffId: number) {
    const today = todayVN()
    const candidates = await this.db
      .select({
        id: orgDocuments.id,
        targets: orgDocuments.targets,
        authorId: orgDocuments.authorId,
        signerId: orgDocuments.signerId,
      })
      .from(orgDocuments)
      .leftJoin(
        orgDocumentReceipts,
        and(
          eq(orgDocumentReceipts.documentId, orgDocuments.id),
          eq(orgDocumentReceipts.staffId, staffId),
        ),
      )
      .where(
        and(
          eq(orgDocuments.state, 'issued'),
          eq(orgDocuments.kind, 'quy-dinh'),
          isNull(orgDocumentReceipts.staffId),
          sql`(${orgDocuments.effectiveTo} IS NULL OR ${orgDocuments.effectiveTo} >= ${today})`,
        ),
      )
    const pending = candidates.filter((d) => d.authorId !== staffId && d.signerId !== staffId)
    if (pending.length === 0) return
    const snap = await this.org.snapshot(today)
    const due = pending.filter((d) =>
      (d.targets as DocTarget[]).some((t) => matchesTarget(t, staffId, snap)),
    )
    if (due.length === 0) return
    await this.db
      .insert(orgDocumentReceipts)
      .values(due.map((d) => ({ documentId: d.id, staffId })))
      .onConflictDoNothing()
  }

  /** Quyền ký theo loại, phạm vi phủ hết nơi nhận, không ký quyết định về chính mình */
  private assertSigner(snap: OrgSnapshot, signerId: number, doc: DocRow) {
    if (!canSign(snap, signerId, doc.kind)) {
      throw forbidden(
        'signer_not_permitted',
        doc.kind === 'thong-bao'
          ? 'Người này không có quyền ký thông báo'
          : 'Quyết định và quy định do quản lý chuỗi hoặc chủ quán ký',
      )
    }
    if (!targetsWithinScope(scopeOf(signerId, 'doc', snap), doc.targets as DocTarget[], snap)) {
      throw forbidden('signer_out_of_scope', 'Nơi nhận vượt ra ngoài phạm vi của người ký')
    }
    const changes = (doc.changes as PersonnelChange[] | null) ?? []
    if (changes.some((c) => c.staffId === signerId)) {
      throw conflict('self_decision', 'Không ai ký quyết định nhân sự về chính mình')
    }
  }

  private async applyPersonnel(tx: Tx, doc: DocRow, changes: PersonnelChange[], signerId: number) {
    const staffIds = [...new Set(changes.map((c) => c.staffId))]
    // Khoá các dòng đang mở: hai quyết định ký cùng lúc cho một người không chồng nhau
    const open = await tx
      .select({
        id: positionAssignments.id,
        staffId: positionAssignments.staffId,
        positionId: positionAssignments.positionId,
        kind: positionAssignments.kind,
        fromDate: positionAssignments.fromDate,
      })
      .from(positionAssignments)
      .where(
        and(inArray(positionAssignments.staffId, staffIds), isNull(positionAssignments.toDate)),
      )
      .for('update')
    const plan = planPersonnelChanges({
      decisionType: doc.decisionType!,
      effectiveFrom: doc.effectiveFrom,
      changes,
      open,
    })
    if (!plan.ok) throw conflict(plan.code, plan.message)
    for (const c of plan.close) {
      await tx
        .update(positionAssignments)
        .set({ toDate: c.toDate, endDocumentId: doc.id })
        .where(eq(positionAssignments.id, c.assignmentId))
    }
    if (plan.insert.length > 0) {
      await tx
        .insert(positionAssignments)
        .values(plan.insert.map((i) => ({ ...i, documentId: doc.id, createdBy: signerId })))
    }
  }

  /** Mọi id trong nơi nhận và quyết định phải có thật — sai thì báo ngay lúc soạn */
  private async validateRefs(input: DocumentInput) {
    const snap = await this.org.snapshot()
    const branchIds = new Set(
      (await this.db.select({ id: branches.id }).from(branches)).map((b) => b.id),
    )
    const bad = (message: string) => new BadRequestException({ code: 'validation_error', message })
    for (const t of input.targets) {
      if (t.kind === 'chi-nhanh' && !branchIds.has(t.branchId))
        throw bad('Nơi nhận: không có chi nhánh này')
      if (t.kind === 'vai-tro' && t.branchId && !branchIds.has(t.branchId))
        throw bad('Nơi nhận: không có chi nhánh này')
      if (t.kind === 'don-vi' && !snap.units.get(t.unitId)?.active)
        throw bad('Nơi nhận: không có đơn vị này')
      if (t.kind === 'chuc-danh' && !snap.positions.get(t.positionId)?.active)
        throw bad('Nơi nhận: không có chức danh này')
      if (t.kind === 'ca-nhan' && !snap.people.get(t.staffId)?.active)
        throw bad('Nơi nhận: không có người này')
    }
    for (const c of input.changes ?? []) {
      if (!snap.people.get(c.staffId)?.active) throw bad('Quyết định: không có người này')
      if (!snap.positions.get(c.positionId)?.active) throw bad('Quyết định: không có chức danh này')
    }
  }

  /** Người được nêu trong quyết định nhân sự luôn nhận được chính quyết định đó */
  private normalize(input: DocumentInput) {
    const targets = [...input.targets]
    for (const c of input.changes ?? []) {
      if (!targets.some((t) => t.kind === 'ca-nhan' && t.staffId === c.staffId)) {
        targets.push({ kind: 'ca-nhan', staffId: c.staffId })
      }
    }
    return {
      kind: input.kind,
      decisionType: input.decisionType,
      title: input.title,
      body: input.body,
      attachments: input.attachments,
      targets,
      changes: input.changes,
      requiresAck: input.requiresAck,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    }
  }

  private async requireDoc(db: Db | Tx, id: number, lock = false): Promise<DocRow> {
    const query = db.select().from(orgDocuments).where(eq(orgDocuments.id, id))
    const [doc] = lock ? await query.for('update') : await query
    if (!doc)
      throw new NotFoundException({ code: 'document_not_found', message: 'Không có văn bản này' })
    return doc
  }

  private async toRows(docs: DocRow[]): Promise<DocumentRow[]> {
    if (docs.length === 0) return []
    const ids = docs.map((d) => d.id)
    const people = new Set(docs.flatMap((d) => [d.authorId, d.signerId ?? d.authorId]))
    const names = new Map(
      (
        await this.db
          .select({ id: staff.id, fullName: staff.fullName })
          .from(staff)
          .where(inArray(staff.id, [...people]))
      ).map((p) => [p.id, p.fullName]),
    )
    const tallies = new Map(
      (
        await this.db
          .select({
            documentId: orgDocumentReceipts.documentId,
            total: sql<number>`count(*)::int`,
            read: sql<number>`count(${orgDocumentReceipts.readAt})::int`,
            acked: sql<number>`count(${orgDocumentReceipts.ackedAt})::int`,
          })
          .from(orgDocumentReceipts)
          .where(inArray(orgDocumentReceipts.documentId, ids))
          .groupBy(orgDocumentReceipts.documentId)
      ).map((t) => [t.documentId, t]),
    )
    return docs.map((d) => {
      const tally = tallies.get(d.id)
      return {
        id: d.id,
        kind: d.kind,
        decisionType: d.decisionType,
        number: d.number,
        title: d.title,
        state: d.state,
        requiresAck: d.requiresAck,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo,
        authorId: d.authorId,
        authorName: names.get(d.authorId) ?? '',
        signerId: d.signerId,
        signerName: d.signerId ? (names.get(d.signerId) ?? null) : null,
        signedAt: d.signedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        recipients: tally?.total ?? 0,
        read: tally?.read ?? 0,
        acked: tally?.acked ?? 0,
      }
    })
  }

  private toMine(
    d: DocRow,
    r: typeof orgDocumentReceipts.$inferSelect,
    signerName: string | null,
  ): MyDocument {
    return {
      id: d.id,
      kind: d.kind,
      decisionType: d.decisionType,
      number: d.number,
      title: d.title,
      signerName,
      signedAt: d.signedAt?.toISOString() ?? null,
      effectiveFrom: d.effectiveFrom,
      requiresAck: d.requiresAck,
      readAt: r.readAt?.toISOString() ?? null,
      ackedAt: r.ackedAt?.toISOString() ?? null,
    }
  }
}
