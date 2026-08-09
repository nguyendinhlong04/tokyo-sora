'use client'

/**
 * Nút nhặt món — hình tròn vàng khi giỏ chưa có, nở thành thanh đếm khi đã có.
 *
 * Thuần phần nhìn: đếm bằng giỏ nào là việc của nơi gọi. Trang thương hiệu (W1 ·
 * W2 · W3) nối vào kho riêng của `QuickAdd`, màn đặt món O2 nối vào `useOrder` —
 * hai kho tách nhau theo §23.1.6, nhưng khách chỉ được thấy MỘT cái nút.
 *
 * Nút KHÔNG được nằm trong thẻ liên kết: nút lồng trong liên kết là HTML sai và
 * bấm cộng sẽ nhảy trang. Nơi gọi dựng nó thành anh em của liên kết.
 */

/** Dấu cộng và dấu trừ vẽ bằng nét, không phải ký tự — nét dày đều ở mọi cỡ */
function IconCong({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M0 6h12" />
      <path d="M6 0v12" />
    </svg>
  )
}

function IconTru({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M0 4h8" />
    </svg>
  )
}

export function DishCounter({
  name,
  qty,
  onAdd,
  onBot,
  disabled = false,
  tone = 'gold',
  className = '',
}: {
  /** Tên món — chỉ để đọc lên cho trình đọc màn hình, không in ra */
  name: string
  qty: number
  onAdd: () => void
  onBot: () => void
  /** Món tạm hết: nút vẫn giữ chỗ nhưng xám và không bấm được */
  disabled?: boolean
  /** Nền khối đặt nút: trang tối thì `gold`, khối giấy kraft sáng thì `kraft` */
  tone?: 'gold' | 'kraft'
  className?: string
}) {
  /**
   * Nền vàng ĐẶC, nét dấu cộng màu nền trang — đảo cực so với phần còn lại của ô
   * món, nơi vàng chỉ là chữ và đường mảnh. Đo được 8,8:1, nút đọc ra ngay mà
   * không cần một đường viền nào.
   *
   * Trên giấy kraft thì đảo lại lần nữa: viên vàng #c9a85c nằm trên kraft
   * #d9cdb8 chỉ đo 1,4:1 — nét cộng bên trong vẫn rõ nhưng cái nút thì tan vào
   * nền. Mực kraft đo 10,6:1, và đó cũng đúng lối hai nút cuối trang W2 đã vẽ.
   */
  const vo = `flex h-8 items-center rounded-pill transition-colors ${
    disabled
      ? 'bg-line-2 text-ink-mute'
      : tone === 'kraft'
        ? 'bg-kraft-ink text-gold-200'
        : 'bg-accent text-on-accent'
  }`

  /* Ô vẽ chỉ 32 nhưng vùng chạm phải 44: `-my-1.5` cho hai nút con trổ lên trên
     và xuống dưới viên thuốc bằng phần đệm trong suốt. Đây là nút bán hàng, thu
     vùng chạm xuống bằng đúng ô vẽ là bấm trượt.
     Hẹp lại còn 20 dưới 480: ở đó thanh đếm phải nhường chỗ cho giá đứng cùng
     hàng — xem phép đo ở khối giữ chỗ bên dưới. Chiều cao 44 giữ nguyên, nên
     ngón tay mất bề ngang chứ không mất cả vùng chạm. */
  const conBam = '-my-1.5 grid h-11 w-5 flex-none place-items-center xs:w-6.5'

  return (
    /* Khối giữ chỗ LUÔN rộng bằng đúng thanh đếm lúc nở hết. Không có nó thì mỗi
       lần khách bấm cộng ở món đầu tiên, dòng giá bên trái co lại một nhịp và cả
       hàng giật.
       52 dưới 480 chứ không 68: đo ở khổ 375 thì ô món rộng 161, trừ đệm 24 và
       khoảng cách 4 còn 133; giá 13px cần 78, nên thanh chỉ được lấy 52. Giữ 68
       ở đó là giá không còn chỗ và bị cắt đuôi.
       `min-w` chứ không `w`: mười phần trở lên thì con số cần 17 chứ không 12 và
       thanh phải nở thêm. Chặn cứng ở 52 là hai nút bị đẩy tràn ra đè lên giá. */
    <div className={`flex min-w-13 flex-none items-center justify-end xs:min-w-17 ${className}`}>
      {qty === 0 ? (
        <button
          type="button"
          aria-label={`Thêm ${name} vào giỏ`}
          disabled={disabled}
          onClick={onAdd}
          className="-my-1.5 grid h-11 w-8 place-items-center"
        >
          <span
            className={`${vo} w-8 justify-center ${
              disabled ? '' : tone === 'kraft' ? 'hover:bg-kraft-ink-2' : 'hover:bg-gold-200'
            }`}
          >
            <IconCong />
          </span>
        </button>
      ) : (
        <div className={vo}>
          <button type="button" aria-label={`Bớt ${name}`} onClick={onBot} className={conBam}>
            <IconTru />
          </button>
          {/* `min-w-4` chứ không để chữ tự định bề rộng: 1 và 11 mà rộng khác
              nhau thì hai nút hai bên xê dịch mỗi lần bấm, ngón tay đang đặt ở
              đó bị trượt sang nút kia. */}
          <span className="min-w-3 text-center font-mono text-[length:var(--fs-b2)] font-semibold xs:min-w-4">
            {qty}
          </span>
          <button
            type="button"
            aria-label={`Thêm ${name} vào giỏ`}
            onClick={onAdd}
            className={conBam}
          >
            <IconCong size={8} />
          </button>
        </div>
      )}
    </div>
  )
}
