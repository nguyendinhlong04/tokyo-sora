/**
 * Nút nhặt món — hình tròn vàng khi giỏ chưa có, nở thành thanh đếm khi đã có.
 *
 * BẢN SAO CÓ CHỦ Ý của `apps/web/components/DishCounter.tsx`, cắt bỏ nền kraft mà
 * chỉ trang thương hiệu dùng và cắt điểm gãy 480 mà dòng món full-width ở đây
 * không cần. Đổi hình dáng nút thì phải đổi cả hai bên — khách gọi món ở nhà và
 * khách ngồi tại bàn phải thấy CÙNG một cái nút.
 *
 * Thuần phần nhìn: đếm bằng giỏ nào là việc của nơi gọi.
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
  /**
   * Món phải chọn vị / số người ăn: bấm cộng là MỞ chi tiết chứ không thêm thẳng.
   * Một chấm vàng báo trước điều đó, và chỉ báo khi giỏ chưa có món này — khách
   * đã chọn nó một lần rồi thì họ biết.
   */
  choice = false,
}: {
  /** Tên món — chỉ để đọc lên cho trình đọc màn hình, không in ra */
  name: string
  qty: number
  onAdd: () => void
  onBot: () => void
  /** Món tạm hết: nút vẫn giữ chỗ nhưng xám và không bấm được */
  disabled?: boolean
  choice?: boolean
}) {
  /**
   * Nền vàng ĐẶC, nét dấu cộng màu nền trang — đảo cực so với phần còn lại của ô
   * món, nơi vàng chỉ là chữ và đường mảnh. Đo được 8,8:1, nút đọc ra ngay mà
   * không cần một đường viền nào.
   */
  const vo = `flex h-8 items-center rounded-pill transition-colors ${
    disabled ? 'bg-line-2 text-ink-mute' : 'bg-accent text-on-accent'
  }`

  /* Ô vẽ chỉ 32 nhưng vùng chạm phải 44: `-my-1.5` cho hai nút con trổ lên trên
     và xuống dưới viên thuốc bằng phần đệm trong suốt. Đây là nút bán hàng, thu
     vùng chạm xuống bằng đúng ô vẽ là bấm trượt. */
  const conBam = '-my-1.5 grid h-11 w-6.5 flex-none place-items-center'

  /* Khối giữ chỗ LUÔN rộng bằng đúng thanh đếm lúc nở hết. Không có nó thì mỗi
     lần khách bấm cộng ở món đầu tiên, dòng giá bên trái co lại một nhịp và cả
     hàng giật.
     `min-w` chứ không `w`: mười phần trở lên thì con số cần 17 chứ không 12 và
     thanh phải nở thêm. */
  const khungGiuCho = 'flex min-w-17 flex-none items-center justify-end'

  const nutCong = (
    <button
      type="button"
      aria-label={choice ? `Chọn kiểu cho ${name}` : `Thêm ${name} vào giỏ`}
      disabled={disabled}
      onClick={onAdd}
      className="relative -my-1.5 grid h-11 w-8 place-items-center"
    >
      <span className={`${vo} w-8 justify-center ${disabled ? '' : 'hover:bg-gold-200'}`}>
        <IconCong />
      </span>
      {/* Chấm vàng: bấm nút này sẽ mở màn chọn kiểu chứ không thêm thẳng */}
      {choice && !disabled && qty === 0 ? (
        <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-pill bg-accent" />
      ) : null}
    </button>
  )

  if (qty === 0) return <div className={khungGiuCho}>{nutCong}</div>

  return (
    <div className={khungGiuCho}>
      <div className={vo}>
        <button type="button" aria-label={`Bớt ${name}`} onClick={onBot} className={conBam}>
          <IconTru />
        </button>
        {/* `min-w-4` chứ không để chữ tự định bề rộng: 1 và 11 mà rộng khác nhau
            thì hai nút hai bên xê dịch mỗi lần bấm, ngón tay đang đặt ở đó bị
            trượt sang nút kia. */}
        <span className="min-w-4 text-center font-mono text-[length:var(--fs-b2)] font-semibold">
          {qty}
        </span>
        <button type="button" aria-label={`Thêm ${name} vào giỏ`} onClick={onAdd} className={conBam}>
          <IconCong size={8} />
        </button>
      </div>
    </div>
  )
}
