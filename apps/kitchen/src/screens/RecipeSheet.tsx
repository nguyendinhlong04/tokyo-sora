import { Badge, Button, Modal } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, type KitchenRecipe, type RecipeStepPhase } from '../api'

/**
 * K7 — Thẻ công thức mở ngay trên màn bếp.
 *
 * Người đọc ở đây khác hẳn người soạn ở Office: đang đứng, đeo găng, có vé đang
 * chạy sau lưng. Nên thẻ mở ra ở giai đoạn RA MÓN chứ không phải từ đầu, và mỗi
 * lần chỉ hiện một giai đoạn — cuộn tìm giữa ba mươi bước là cách chắc chắn để
 * người ta đóng lại và làm theo trí nhớ.
 *
 * KHÔNG CÓ TIỀN ở đây, và đó là ràng buộc chứ không phải lựa chọn trình bày:
 * điểm đọc `/api/recipes/:id` đã trả về bản trừ sạch giá vốn.
 */

/**
 * Nhãn giai đoạn giữa "Chế biến" chứ không phải "Ra món": K6 trên thanh điều
 * hướng đã mang tên "Ra món" rồi, và hai thứ cùng tên trong một app là hai thứ
 * người ta sẽ hỏi lại.
 */
const PHASES: { key: RecipeStepPhase; label: string }[] = [
  { key: 'so_che', label: 'Sơ chế' },
  { key: 'che_bien', label: 'Chế biến' },
  { key: 'hoan_thien', label: 'Hoàn thiện' },
]

const METHOD_LABEL: Record<string, string> = {
  song: 'Khách tự nướng',
  nuong: 'Bếp nướng',
  nau: 'Bếp nấu',
  lap_rap: 'Lắp ráp',
}

type Tab = RecipeStepPhase | 'yeu_cau'

export function RecipeSheet({ dishId, onClose }: { dishId: string | null; onClose: () => void }) {
  const recipe = useQuery({
    queryKey: ['recipe', dishId],
    queryFn: () => api.recipe(dishId!),
    enabled: Boolean(dishId),
    // Quy trình đổi vài lần một mùa, không phải vài lần một ca. Giữ lâu để mở
    // lại giữa giờ cao điểm là hiện ngay, không phải chờ mạng.
    staleTime: 30 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  return (
    <Modal
      open={dishId !== null}
      wide
      title={recipe.data?.dish.nameVi ?? 'Công thức'}
      onClose={onClose}
      footer={<Button size="lg" onClick={onClose}>Đóng</Button>}
    >
      {recipe.isPending ? <p className="text-ink-mute">Đang tải công thức…</p> : null}
      {recipe.isError ? (
        <p className="text-warn">
          Không tải được công thức. Vé vẫn chạy bình thường — thử lại khi có mạng.
        </p>
      ) : null}
      {recipe.data ? <Sheet recipe={recipe.data} /> : null}
    </Modal>
  )
}

function Sheet({ recipe }: { recipe: KitchenRecipe }) {
  const { dish, doc, steps, ingredients, substitutes } = recipe

  const countOf = (phase: RecipeStepPhase) => steps.filter((s) => s.phase === phase).length
  // Mở ở giai đoạn CHẾ BIẾN — đó là việc đang làm lúc người ta bấm vào đây. Món
  // không có bước chế biến thì lùi về giai đoạn đầu tiên thật sự có bước.
  const [tab, setTab] = useState<Tab>(
    () => PHASES.find((p) => p.key === 'che_bien' && countOf(p.key) > 0)?.key
      ?? PHASES.find((p) => countOf(p.key) > 0)?.key
      ?? 'yeu_cau',
  )

  if (!doc) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[length:var(--fs-t2)] text-ink-hi">Món này chưa có quy trình.</p>
        <p className="text-[length:var(--fs-b1)] leading-relaxed text-ink-mute">
          Bếp trưởng soạn ở Sora Office, mục Công thức. Soạn xong là hiện ở đây ngay, không
          phải cập nhật gì trên màn này.
        </p>
        {ingredients.length > 0 ? <Ingredients lines={ingredients} /> : null}
      </div>
    )
  }

  const shown = steps.filter((s) => s.phase === tab)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{METHOD_LABEL[doc.methodKind] ?? doc.methodKind}</Badge>
        {doc.yieldLabel ? (
          <span className="text-[length:var(--fs-t2)] text-ink-hi">{doc.yieldLabel}</span>
        ) : null}
        {dish.allergens.map((a) => (
          <Badge key={a} tone="danger">
            Dị ứng: {a}
          </Badge>
        ))}
      </div>

      {ingredients.length > 0 ? <Ingredients lines={ingredients} /> : null}

      <nav className="flex gap-2">
        {PHASES.map((phase) => (
          <TabButton
            key={phase.key}
            on={tab === phase.key}
            onClick={() => setTab(phase.key)}
            disabled={countOf(phase.key) === 0}
          >
            {phase.label}
            <span className="font-mono text-[length:var(--fs-b2)] opacity-70">
              {countOf(phase.key)}
            </span>
          </TabButton>
        ))}
        <TabButton on={tab === 'yeu_cau'} onClick={() => setTab('yeu_cau')}>
          Yêu cầu &amp; lưu ý
        </TabButton>
      </nav>

      {tab === 'yeu_cau' ? (
        <Requirements recipe={recipe} substitutes={substitutes} />
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((step, index) => (
            <li
              key={index}
              className={[
                'flex gap-4 rounded-md border bg-surface-1 px-4 py-3',
                step.isCcp ? 'border-danger' : 'border-line-2',
              ].join(' ')}
            >
              <span className="min-w-[2ch] font-mono text-[length:var(--fs-ticket-qty)] font-semibold text-accent-ink">
                {index + 1}
              </span>
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-[length:var(--fs-ticket-dish)] leading-snug text-ink-hi">
                  {step.text}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {step.paramLabel ? (
                    <span className="rounded-sm bg-surface-3 px-2 py-0.5 font-mono text-[length:var(--fs-b1)] text-accent-ink">
                      {step.paramLabel}
                    </span>
                  ) : null}
                  {step.seconds ? (
                    <span className="font-mono text-[length:var(--fs-b1)] text-ink-mute">
                      {formatSeconds(step.seconds)}
                    </span>
                  ) : null}
                  {step.isCcp ? <Badge tone="danger">Điểm kiểm soát</Badge> : null}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {tab === 'hoan_thien' && doc.plateLabel ? (
        <p className="text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          <span className="text-ink-mute">Bày lên: </span>
          {doc.plateLabel}
        </p>
      ) : null}

      {/* Mạng chớp thì máy phục vụ bản đã tải lần trước — ngày cập nhật là cách
          duy nhất để người đọc biết mình đang xem bản nào */}
      <p className="text-[length:var(--fs-b2)] text-ink-mute">
        Bản cập nhật {new Date(doc.updatedAt).toLocaleDateString('vi-VN')}
      </p>
    </div>
  )
}

/** Định lượng là lời chỉ dẫn, không phải tiền — thứ hay quên nhất nên để trên cùng */
function Ingredients({ lines }: { lines: KitchenRecipe['ingredients'] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {lines.map((line) => (
        <span
          key={line.name}
          className="rounded-sm border border-line-2 px-3 py-1.5 text-[length:var(--fs-b1)] text-ink-body"
        >
          {line.name}{' '}
          {/* Có khoảng trắng trước đơn vị: '1 lá' chứ không phải '1lá', vì đơn vị
              cơ sở không phải lúc nào cũng là một chữ cái dính liền được như 'g' */}
          <span className="font-mono text-ink-hi">
            {line.qtyBase} {line.baseUnit}
          </span>
        </span>
      ))}
    </div>
  )
}

function Requirements({
  recipe,
  substitutes,
}: {
  recipe: KitchenRecipe
  substitutes: KitchenRecipe['substitutes']
}) {
  const doc = recipe.doc!

  return (
    <div className="flex flex-col gap-5">
      {doc.specMeasured.length > 0 ? (
        <Group title="Đạt là thế nào">
          <div className="grid grid-cols-2 gap-2">
            {doc.specMeasured.map((spec) => (
              <div key={spec.name} className="rounded-sm border border-line-2 px-3 py-2">
                <span className="block text-[length:var(--fs-b2)] text-ink-mute">{spec.name}</span>
                <span className="font-mono text-[length:var(--fs-t2)] text-ink-hi">
                  {spec.target}
                </span>
              </div>
            ))}
          </div>
        </Group>
      ) : null}

      {doc.specSensory.length > 0 ? (
        <Group title="Nhìn và ngửi">
          <Lines items={doc.specSensory} />
        </Group>
      ) : null}

      {doc.ccp.length > 0 ? (
        <Group title="Điểm kiểm soát an toàn">
          <div className="flex flex-col gap-2">
            {doc.ccp.map((point) => (
              <div key={point.point} className="rounded-sm border border-danger px-3 py-2">
                <span className="text-[length:var(--fs-t2)] text-ink-hi">{point.point}</span>
                <span className="ml-2 font-mono text-[length:var(--fs-b1)] text-accent-ink">
                  {point.limit}
                </span>
                <p className="mt-1 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
                  Lệch thì: {point.action}
                </p>
              </div>
            ))}
          </div>
        </Group>
      ) : null}

      {doc.pitfalls.length > 0 ? (
        <Group title="Lỗi hay gặp">
          <div className="flex flex-col gap-2">
            {doc.pitfalls.map((item) => (
              <div key={item.mistake} className="rounded-sm border border-line-2 px-3 py-2">
                <span className="text-[length:var(--fs-t2)] text-warn">{item.mistake}</span>
                <p className="mt-1 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
                  {item.effect} — <span className="text-ink-hi">{item.fix}</span>
                </p>
              </div>
            ))}
          </div>
        </Group>
      ) : null}

      {doc.tips.length > 0 ? (
        <Group title="Mẹo">
          <Lines items={doc.tips} />
        </Group>
      ) : null}

      {doc.equipment.length > 0 ? (
        <Group title="Cần sẵn">
          <Lines items={doc.equipment} />
        </Group>
      ) : null}

      {doc.storage ? (
        <Group title="Bảo quản & phần dư">
          <p className="text-[length:var(--fs-b1)] leading-relaxed text-ink-body">{doc.storage}</p>
        </Group>
      ) : null}

      {substitutes.length > 0 ? (
        <Group title="Hết thì mời món này">
          <div className="flex flex-wrap gap-2">
            {substitutes.map((dish) => (
              <Badge key={dish.id}>{dish.nameVi}</Badge>
            ))}
          </div>
        </Group>
      ) : null}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[length:var(--fs-b2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          · {item}
        </li>
      ))}
    </ul>
  )
}

function TabButton({
  on,
  onClick,
  disabled = false,
  children,
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex h-[var(--hit-target)] flex-1 items-center justify-center gap-2 rounded-sm border',
        'text-[length:var(--fs-t2)] whitespace-nowrap',
        'disabled:border-line-1 disabled:text-line-4',
        on ? 'border-accent bg-accent/12 font-semibold text-accent-ink' : 'border-line-3 text-ink-body',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** '3 phút' dễ đọc hơn '180 giây' khi đang đứng bếp */
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} giây`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m} phút` : `${m} phút ${s} giây`
}
