import { Button } from '@sora/ui'
import type { ChangeEvent, ReactNode } from 'react'

/**
 * Ô nhập dùng chung của Office.
 *
 * Trước khi có file này, 14 trong 51 màn tự khai lấy một `Input` riêng và trôi
 * lệch nhau: chiều cao chia h-9 với h-10, padding chia px-2 / px-2.5 / px-3. Hai
 * ô cạnh nhau lệch 4px không ai gọi tên được là lỗi, nhưng cả trang thì nhìn ra
 * ngay là mỗi chỗ một người dựng.
 *
 * MỘT chiều cao duy nhất cho mọi ô điều khiển trong dòng: 36px (h-9). Cùng con
 * số với `Button size="sm"`, nên nút và ô nhập đứng cạnh nhau thẳng hàng đáy —
 * đó là lý do chọn 36 chứ không phải 32 hay 40.
 */
const CONTROL =
  'h-9 rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi ' +
  'transition-colors outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-mute ' +
  'placeholder:text-ink-mute'

/** Nhãn trên ô nhập — chữ nhỏ, giãn chữ, viết hoa. Dùng ở mọi form của Office. */
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
  disabled = false,
  width,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
  disabled?: boolean
  /** Bề rộng cố định khi ô nằm trong thanh lọc; bỏ trống thì chiếm hết cột form */
  width?: number
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      style={width ? { width } : undefined}
      className={[CONTROL, width ? '' : 'w-full', mono ? 'font-mono' : '', className].join(' ')}
    />
  )
}

/**
 * Ô số.
 *
 * Trả về `number` chứ không `string` để trang gọi khỏi phải tự `Number(...)` —
 * chỗ nào quên là chỗ đó gửi chuỗi xuống máy chủ. Ô rỗng trả `null` chứ không
 * trả 0: "chưa nhập" và "nhập số không" là hai ý khác nhau, và gộp chúng lại là
 * cách một ô giá bỏ trống biến thành hàng miễn phí.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  min,
  max,
  step,
  width,
  className = '',
}: {
  value: number | null
  onChange: (next: number | null) => void
  placeholder?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  width?: number
  className?: string
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={width ? { width } : undefined}
      className={[CONTROL, width ? '' : 'w-full', 'font-mono', className].join(' ')}
    />
  )
}

export function DateInput({
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={[CONTROL, 'font-mono', className].join(' ')}
    />
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  width,
  className = '',
}: {
  value: T | ''
  onChange: (next: T) => void
  options: { value: T; label: string }[]
  /** Hiện thành mục rỗng đầu danh sách — bỏ trống thì không cho chọn "chưa chọn" */
  placeholder?: string
  disabled?: boolean
  width?: number
  className?: string
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      style={width ? { width } : undefined}
      className={[CONTROL, width ? '' : 'w-full', className].join(' ')}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  className?: string
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={[CONTROL, 'h-auto w-full py-2 leading-relaxed', className].join(' ')}
    />
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  disabled?: boolean
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[length:var(--fs-b2)] text-ink-body">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent-strong)]"
      />
      {label}
    </label>
  )
}

/**
 * Công tắc hai trạng thái dạng nút.
 *
 * Thay cho kiểu tự chế `border-accent text-accent-ink` / `border-line-3
 * text-ink-mute` rải khắp các màn. Trạng thái bật KHÔNG chỉ đổi màu chữ mà đổi
 * cả nền: người phân biệt kém màu vẫn thấy được cái nào đang bật.
 */
export function Toggle({
  on,
  onChange,
  children,
  disabled = false,
  tone = 'accent',
  className = '',
}: {
  on: boolean
  onChange: (next: boolean) => void
  children: ReactNode
  disabled?: boolean
  tone?: 'accent' | 'ok'
  className?: string
}) {
  const active =
    tone === 'ok'
      ? 'border-ok bg-ok/12 text-ok font-medium'
      : 'border-accent bg-accent/12 text-accent-ink font-medium'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={[
        'inline-flex h-9 items-center justify-center rounded-sm border px-3 text-[length:var(--fs-c1)] whitespace-nowrap',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        on ? active : 'border-line-3 text-ink-mute hover:bg-surface-3 hover:text-ink-body',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/**
 * Dải nút chọn một-trong-nhiều.
 *
 * Gộp kiểu `flex overflow-hidden rounded-sm border` đang lặp ở 6 chỗ. Dùng khi
 * số lựa chọn ít và cần thấy hết cùng lúc; nhiều hơn 5 mục thì dùng `Select`.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: string; title?: string }[]
  /** `md` cho dải tab đầu trang — cao bằng nút chính đứng cạnh nó trong PageHeader */
  size?: 'sm' | 'md'
}) {
  const box = size === 'md' ? 'h-[var(--hit-target)]' : 'h-9'
  const cell = size === 'md' ? 'px-4 text-[length:var(--fs-b2)]' : 'px-3 text-[length:var(--fs-c1)]'
  return (
    <div className={`inline-flex overflow-hidden rounded-sm border border-line-1 ${box}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={[
            'border-r border-line-1 whitespace-nowrap last:border-r-0',
            cell,
            'transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
            value === o.value
              ? 'bg-accent/12 font-medium text-accent-ink'
              : 'text-ink-mute hover:bg-surface-3 hover:text-ink-hi',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Thanh lọc đầu bảng.
 *
 * `items-end` để nhãn nằm trên còn đáy các ô thẳng hàng — nhãn dài ngắn khác
 * nhau vẫn không làm ô nhảy lên xuống.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      {children}
    </section>
  )
}

/**
 * Đầu một khối danh sách: nhãn, câu giải thích, nút thêm nằm bên phải.
 *
 * `items-start` chứ không `items-center`: câu giải thích dài hai dòng thì nút
 * vẫn đứng ngang nhãn, không trôi xuống giữa khối.
 */
export function ListHead({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          {label}
        </p>
        {hint ? (
          <p className="mt-1 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/** Nút Bỏ cố định bề rộng để hàng nhãn của `RecordList` khớp đúng hàng dữ liệu */
const DROP_WIDTH = 'w-[56px]'

/** Danh sách dòng chữ đơn giản: dụng cụ, mẹo, tiêu chí cảm quan */
export function LineList({
  label,
  hint,
  placeholder,
  value,
  disabled,
  max,
  empty = 'Chưa có dòng nào.',
  onChange,
}: {
  label: string
  hint?: string
  placeholder?: string
  value: string[]
  disabled: boolean
  max: number
  empty?: string
  onChange: (next: string[]) => void
}) {
  return (
    <div>
      <ListHead label={label} hint={hint}>
        <Button size="sm" disabled={disabled || value.length >= max} onClick={() => onChange([...value, ''])}>
          + Thêm dòng
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {value.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-5 flex-none text-center font-mono text-[length:var(--fs-c1)] text-ink-mute">
              {index + 1}
            </span>
            <TextInput
              value={row}
              disabled={disabled}
              placeholder={placeholder}
              onChange={(v) => onChange(value.map((r, i) => (i === index ? v : r)))}
            />
            <Button
              size="sm"
              variant="ghost"
              className={`${DROP_WIDTH} flex-none`}
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Bỏ
            </Button>
          </div>
        ))}
        {value.length === 0 ? (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">{empty}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Danh sách bản ghi nhiều ô — điểm kiểm soát, lỗi thường gặp, tiêu chí đo được.
 *
 * Cột khai bằng dữ liệu chứ không dựng tay ở từng chỗ gọi: bốn khối trong màn
 * quy trình có hình dạng giống hệt nhau, chỉ khác tên cột, và bốn bản sao của
 * cùng một lưới sẽ trôi lệch nhau đúng như 14 ô nhập ngày trước.
 */
export function RecordList<T extends { [K in keyof T]: string }>({
  label,
  hint,
  columns,
  blank,
  value,
  disabled,
  max,
  empty = 'Chưa khai dòng nào.',
  onChange,
}: {
  label: string
  hint?: string
  columns: { key: keyof T & string; label: string; placeholder?: string; grow?: number }[]
  /** Bản ghi rỗng khi bấm thêm — giữ đủ khoá để React không nhận nhầm ô */
  blank: T
  value: T[]
  disabled: boolean
  max: number
  empty?: string
  onChange: (next: T[]) => void
}) {
  const grid = columns.map((c) => `minmax(0, ${c.grow ?? 1}fr)`).join(' ')

  return (
    <div>
      <ListHead label={label} hint={hint}>
        <Button size="sm" disabled={disabled || value.length >= max} onClick={() => onChange([...value, { ...blank }])}>
          + Thêm dòng
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {/* Hàng nhãn dựng ĐÚNG khung của hàng dữ liệu — số thứ tự và nút Bỏ đều
            có bề rộng cố định, nên nhãn không trôi lệch khỏi ô nó gọi tên */}
        {value.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="w-5 flex-none" />
            <div
              className="grid flex-1 gap-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase"
              style={{ gridTemplateColumns: grid }}
            >
              {columns.map((c) => (
                <span key={c.key}>{c.label}</span>
              ))}
            </div>
            <span className={`${DROP_WIDTH} flex-none`} />
          </div>
        ) : null}
        {value.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="w-5 flex-none text-center font-mono text-[length:var(--fs-c1)] text-ink-mute">
              {index + 1}
            </span>
            <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: grid }}>
              {columns.map((c) => (
                <TextInput
                  key={c.key}
                  value={row[c.key] ?? ''}
                  disabled={disabled}
                  placeholder={c.placeholder}
                  onChange={(v) =>
                    onChange(value.map((r, i) => (i === index ? { ...r, [c.key]: v } : r)))
                  }
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className={`${DROP_WIDTH} flex-none`}
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Bỏ
            </Button>
          </div>
        ))}
        {value.length === 0 ? (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">{empty}</p>
        ) : null}
      </div>
    </div>
  )
}

/** Ô tìm kiếm có nhãn sẵn — mẫu lặp nhiều nhất trong các thanh lọc */
export function SearchField({
  value,
  onChange,
  label = 'Tìm kiếm',
  placeholder,
  width = 280,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  placeholder?: string
  width?: number
}) {
  return (
    <Field label={label}>
      <TextInput value={value} onChange={onChange} placeholder={placeholder} width={width} />
    </Field>
  )
}
