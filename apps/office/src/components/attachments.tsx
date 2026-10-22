import type { DocAttachment } from '@sora/contracts'
import { safeHref } from '@sora/core'
import { Button } from '@sora/ui'
import { ListHead, TextInput } from './form'

/**
 * Đính kèm bằng ĐƯỜNG DẪN https — văn bản (N4), việc (N5) và minh chứng. Chưa có
 * kho tệp: bản ký tay, ảnh, PDF quét lên kho của quán rồi dán link.
 */
export function AttachmentEditor({
  value,
  onChange,
  hint = 'Chưa có kho tệp: quét bản ký tay lên kho của quán rồi dán đường dẫn https.',
}: {
  value: DocAttachment[]
  onChange: (next: DocAttachment[]) => void
  hint?: string
}) {
  return (
    <div>
      <ListHead label="Đính kèm" hint={hint}>
        <Button
          size="sm"
          disabled={value.length >= 10}
          onClick={() => onChange([...value, { name: '', url: '' }])}
        >
          + Thêm đính kèm
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {value.map((a, i) => (
          <div key={i} className="grid grid-cols-[200px_1fr_auto] items-center gap-2">
            <TextInput
              value={a.name}
              placeholder="Tên hiển thị"
              onChange={(name) => onChange(value.map((x, j) => (j === i ? { ...x, name } : x)))}
            />
            <TextInput
              value={a.url}
              placeholder="https://…"
              mono
              onChange={(url) => onChange(value.map((x, j) => (j === i ? { ...x, url } : x)))}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Bỏ
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Link mở tab mới — chỉ https (`safeHref`); dữ liệu cũ sai thì hiện chữ thường */
export function AttachmentLinks({ attachments }: { attachments: DocAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div>
      <ListHead label="Đính kèm" />
      <div className="grid gap-1">
        {attachments.map((a, i) => {
          const href = safeHref(a.url)
          return href ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[length:var(--fs-b2)] text-accent-ink hover:underline"
            >
              {a.name}
            </a>
          ) : (
            <span key={i} className="text-[length:var(--fs-b2)] text-ink-mute">
              {a.name} (đường dẫn không hợp lệ)
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Đính kèm còn dở (thiếu tên hoặc link) thì không gửi — máy chủ sẽ trả 400 */
export const attachmentsReady = (list: DocAttachment[]) =>
  list.every((a) => a.name.trim() && /^https:\/\/\S+$/.test(a.url.trim()))
