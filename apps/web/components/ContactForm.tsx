'use client'

import { useState } from 'react'
import { CONTACT_SUBJECTS, SITE } from '../content/site'

/**
 * Biểu mẫu liên hệ W9.
 *
 * Nội dung được gói thành một thư soạn sẵn mở bằng ứng dụng thư của khách, thay
 * vì POST vào một bảng chưa ai đọc: hộp thư liên hệ là nơi nhân viên đã mở hằng
 * ngày, còn màn quản trị cho tin nhắn website thì chưa có trong hệ thống. Khi CMS
 * A8 lên và có nơi đọc, đổi `onSubmit` thành một lần gọi API là xong — phần còn
 * lại của biểu mẫu giữ nguyên.
 *
 * Đặt bàn KHÔNG đi qua đây: trang đặt bàn nhanh hơn và giữ chỗ thật.
 */
export function ContactForm() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(CONTACT_SUBJECTS[0]!)
  const [message, setMessage] = useState('')

  const ready = name.trim().length > 0 && message.trim().length > 0

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    const body = [
      `Tên: ${name}`,
      phone ? `Điện thoại: ${phone}` : null,
      email ? `Email: ${email}` : null,
      '',
      message,
    ]
      .filter((line) => line !== null)
      .join('\n')

    window.location.href = `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Field label="Tên bạn">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nguyễn Minh"
            className="h-14 w-full rounded-sm border border-line-3 bg-surface-2 px-4 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Số điện thoại">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xx xxx xxx"
            className="h-14 w-full rounded-sm border border-line-3 bg-surface-2 px-4 font-mono text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ten@email.com"
            className="h-14 w-full rounded-sm border border-line-3 bg-surface-2 px-4 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="Việc cần trao đổi">
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-14 w-full rounded-sm border border-line-3 bg-surface-2 px-3.5 text-[length:var(--fs-b1)] text-ink-hi focus:border-accent focus:outline-none"
          >
            {CONTACT_SUBJECTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-6">
        <Field label="Nội dung">
          <textarea
            rows={6}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Viết ngắn cũng được — chúng tôi sẽ gọi lại để hỏi thêm."
            className="w-full resize-y rounded-sm border border-line-3 bg-surface-2 px-4 py-3.5 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-6">
        <button
          type="submit"
          disabled={!ready}
          className="inline-flex h-14 items-center rounded-sm bg-accent-strong px-8 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-surface-4 disabled:text-line-4"
        >
          Gửi
        </button>
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Chúng tôi trả lời trong giờ mở cửa, thường dưới hai giờ.
        </p>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}
