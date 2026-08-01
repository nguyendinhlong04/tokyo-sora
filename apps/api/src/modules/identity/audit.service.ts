import { Inject, Injectable } from '@nestjs/common'
import { DB } from '../../common/db.module'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import { auditLog } from '../../db/schema'
import { actorRef, type Actor } from './actor'

export interface AuditEntry {
  actor: Actor
  action: string
  entity: string
  entityId: string
  payload?: Record<string, unknown>
  approvalId?: number | null
  ip?: string | null
}

/**
 * Nhật ký thao tác A7. Ghi trong CÙNG transaction với hành động — nếu hành động
 * rollback thì dấu vết cũng biến mất, không để lại bản ghi ma.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async write(tx: Tx, entry: AuditEntry): Promise<void> {
    const ref = actorRef(entry.actor)
    await tx.insert(auditLog).values({
      branchId: entry.actor.kind === 'system' ? null : entry.actor.branchId,
      actorKind: ref.kind,
      actorId: ref.id,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payload: entry.payload ?? null,
      approvalId: entry.approvalId ?? null,
      deviceId: entry.actor.kind === 'staff' ? entry.actor.deviceId : null,
      ip: entry.ip ?? null,
    })
  }

  /** Dùng khi không có sẵn transaction bên ngoài */
  async writeStandalone(entry: AuditEntry): Promise<void> {
    await this.db.transaction(async (tx) => this.write(tx, entry))
  }
}
