import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ParameterRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { useSession } from '../session-context'

/**
 * B14 — Tích điểm & hạng thành viên.
 *
 * Không có bảng riêng: đây là **cửa vào theo ngữ cảnh** của Trung tâm tham số A6,
 * đúng §25 B14 ("Giá trị số nằm ở Trung tâm tham số") và cùng cách H6 làm với
 * `payroll.*`. Màn này gom đúng nhóm khoá `loyalty.*`, đặt tên tiếng Việt và nói
 * rõ hệ quả của từng con số; giá trị vẫn sống ở một chỗ duy nhất mà engine đọc.
 *
 * **Không có nút cộng điểm ở đây, và đó là cố ý.** Điểm chỉ sinh từ sự kiện thanh
 * toán (§25 B14). Muốn cộng ngoài luồng thì vào hồ sơ từng khách ở B12 — có lý do,
 * có người, có nhật ký A7, và chỉ quản lý chuỗi hoặc chủ quán mở được.
 */

interface RuleDef {
  key: string
  label: string
  hint: string
  kind: 'vnd' | 'months' | 'raw'
}

const GROUPS: { title: string; note: string; rules: RuleDef[] }[] = [
  {
    title: 'Tỷ lệ tích và đổi',
    note: 'Hai con số này quyết định quán cho khách đi bao nhiêu phần trăm doanh thu. Chia tỷ lệ tích cho tỷ lệ đổi ra đúng tỉ lệ đó — 10.000đ/điểm và 1.000đ/điểm là cho đi 10%.',
    rules: [
      {
        key: 'loyalty.vndPerPoint',
        label: 'Tích: bao nhiêu đồng được 1 điểm',
        hint: 'Tính trên TIỀN THỰC TRẢ sau giảm giá, làm tròn xuống — 95.000đ với mức 10.000đ là 9 điểm',
        kind: 'vnd',
      },
      {
        key: 'loyalty.vndPerPointRedeem',
        label: 'Đổi: 1 điểm ra bao nhiêu đồng giảm',
        kind: 'vnd',
        hint: 'Đặt 0 là tắt hẳn việc đổi điểm; điểm vẫn tích nhưng không tiêu được',
      },
      {
        key: 'loyalty.redeemCapVndPerOrder',
        label: 'Trần đổi mỗi giao dịch',
        hint: 'Chặn khách dồn cả năm điểm vào một bill; thu ngân R2 đổi được trong mức này mà không cần hỏi ai',
        kind: 'vnd',
      },
      {
        key: 'loyalty.expiryMonths',
        label: 'Hạn điểm',
        hint: 'Điểm tích hôm nay hết hạn sau bấy nhiêu tháng — cộng THÁNG chứ không cộng 365 ngày',
        kind: 'months',
      },
    ],
  },
  {
    title: 'Ba hạng thành viên',
    note: 'Hạng xét theo chi tiêu 12 tháng TRƯỢT, không theo năm dương lịch: khách rơi hạng khi ngừng đến, chứ không giữ hạng Vàng cả năm nhờ một tháng Tết. Dưới ngưỡng Bạc là hạng Đồng.',
    rules: [
      {
        key: 'loyalty.tierSilverVnd',
        label: 'Ngưỡng hạng Bạc',
        hint: 'Chi tiêu 12 tháng trượt đạt mức này thì lên Bạc',
        kind: 'vnd',
      },
      {
        key: 'loyalty.tierGoldVnd',
        label: 'Ngưỡng hạng Vàng',
        hint: 'Quyền lợi hạng (ưu tiên phòng riêng, ưu đãi sinh nhật) là chính sách vận hành, không phải công tắc trong hệ thống',
        kind: 'vnd',
      },
    ],
  },
]

const ALL_KEYS = GROUPS.flatMap((g) => g.rules.map((r) => r.key))

export function LoyaltyRules() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  /**
   * Xem thì marketing xem được; SỬA thì đi qua guard của A6, và guard đó chỉ mở
   * cho chủ quán. Ẩn nút với người không sửa được thay vì để họ bấm rồi nhận 403.
   */
  const mayEdit = can('admin.manage-accounts-roles')

  const params = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.setParameter(key, value, null),
    onSuccess: (_res, vars) => {
      toast('Đã lưu — bill tính từ giờ trở đi dùng con số mới', 'ok')
      setDrafts((d) => {
        const next = { ...d }
        delete next[vars.key]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const byKey = new Map((params.data ?? []).map((p) => [p.key, p]))
  const missing = ALL_KEYS.filter((k) => !byKey.has(k))
  const config = readConfig(byKey)

  return (
    <>
      <PageHeader
        title="Tích điểm & hạng thành viên"
        subtitle="Cùng một bộ tham số với Trung tâm tham số A6 — sửa ở đây hay ở đó cũng là sửa một chỗ. Điểm chỉ sinh từ lượt thanh toán; không có nút cộng điểm trên màn này."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {params.isError ? <ErrorState message={(params.error as Error).message} /> : null}

        {config ? (
          <section className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Đang hiệu lực
            </p>
            <p className="mt-2 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
              Khách trả <strong>{formatVnd(config.vndPerPoint)}</strong> được 1 điểm, mỗi điểm đổi
              lại <strong>{formatVnd(config.vndPerPointRedeem)}</strong> — tức quán cho đi{' '}
              <strong>
                {config.vndPerPoint > 0
                  ? ((config.vndPerPointRedeem / config.vndPerPoint) * 100).toLocaleString('vi-VN', {
                      maximumFractionDigits: 2,
                    })
                  : '0'}
                %
              </strong>{' '}
              doanh thu. Một bill đổi được tối đa{' '}
              <strong>{formatVnd(config.redeemCapVndPerOrder)}</strong>, và điểm hết hạn sau{' '}
              <strong>{config.expiryMonths} tháng</strong>.
            </p>
          </section>
        ) : null}

        {missing.length > 0 ? (
          <p className="mt-4 rounded-md border border-warn-line bg-surface-1 px-5 py-3 text-[length:var(--fs-c1)] leading-relaxed text-warn">
            Thiếu {missing.length} tham số ({missing.join(', ')}). Chương trình tích điểm đang chạy
            bằng giá trị mặc định trong mã nguồn — nạp lại dữ liệu nền hoặc khai ở A6 để con số có
            người chịu trách nhiệm.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-5">
          {GROUPS.map((group) => (
            <section key={group.title} className="rounded-md border border-line-1 bg-surface-1 p-5">
              <p className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">{group.title}</p>
              <p className="mt-1.5 max-w-[760px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                {group.note}
              </p>

              <div className="mt-4 flex flex-col">
                {group.rules.map((rule) => {
                  const row = byKey.get(rule.key)
                  const current = row ? Number(row.effectiveValue ?? 0) : null
                  const draft = drafts[rule.key]

                  return (
                    <div
                      key={rule.key}
                      className="grid grid-cols-[1fr_220px_110px] items-center gap-4 border-b border-line-1 py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-[length:var(--fs-b2)] text-ink-hi">
                          {rule.label}
                        </span>
                        <span className="mt-0.5 block text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                          {rule.hint}
                        </span>
                        <span className="mt-0.5 block font-mono text-[length:var(--fs-c2)] text-line-4">
                          {rule.key}
                        </span>
                      </span>

                      {mayEdit ? (
                        <Field label={rule.kind === 'months' ? 'Tháng' : 'Đồng'}>
                          <input
                            type="number"
                            value={draft ?? String(current ?? '')}
                            disabled={!row}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [rule.key]: e.target.value }))
                            }
                            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi disabled:opacity-50"
                          />
                        </Field>
                      ) : (
                        <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
                          {current === null
                            ? '—'
                            : rule.kind === 'months'
                              ? `${current} tháng`
                              : formatVnd(current)}
                        </span>
                      )}

                      <span className="flex justify-end">
                        {mayEdit && draft !== undefined && Number(draft) !== current ? (
                          <Button
                            variant="primary"
                            disabled={save.isPending}
                            onClick={() => save.mutate({ key: rule.key, value: Number(draft) })}
                          >
                            Lưu
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-5 max-w-[760px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Điểm sinh từ sự kiện thanh toán và chỉ từ đó. Huỷ hoặc hoàn một bill thì điểm của bill đó
          tự thu hồi, kể cả khi khách đã tiêu mất — số dư âm là đúng sự thật và sẽ tự bù ở lần mua
          sau. Điều chỉnh tay chỉ có ở hồ sơ từng khách trong Sổ khách, và luôn để lại dấu vết.
        </p>
      </div>
    </>
  )
}

function readConfig(byKey: Map<string, ParameterRow>) {
  const get = (key: string) => {
    const row = byKey.get(key)
    return row ? Number(row.effectiveValue ?? 0) : null
  }
  const vndPerPoint = get('loyalty.vndPerPoint')
  const vndPerPointRedeem = get('loyalty.vndPerPointRedeem')
  const redeemCapVndPerOrder = get('loyalty.redeemCapVndPerOrder')
  const expiryMonths = get('loyalty.expiryMonths')
  if (
    vndPerPoint === null ||
    vndPerPointRedeem === null ||
    redeemCapVndPerOrder === null ||
    expiryMonths === null
  ) {
    return null
  }
  return { vndPerPoint, vndPerPointRedeem, redeemCapVndPerOrder, expiryMonths }
}
