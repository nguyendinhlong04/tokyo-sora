'use client'

import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readDraftLines, writeDraftLines, type DraftLine } from '../lib/order-draft'

/**
 * Nút cộng trên trang thương hiệu — bỏ món vào giỏ mà không rời trang.
 *
 * W1 và W2 là server component và KHÔNG nằm trong `<OrderProvider>` của luồng
 * đặt món: §23.1.6 cấm kéo context của luồng đó vào bundle trang marketing. Chỗ
 * này giữ một kho nhỏ của riêng nó và ghi thẳng xuống cùng một `sessionStorage`
 * mà `OrderProvider` sẽ đọc khi khách bước sang `/dat-mon`.
 *
 * Ở đây CHƯA biết chi nhánh nào, mà giá lẫn tình trạng còn/hết đều là chuyện của
 * từng chi nhánh — thực đơn thương hiệu chỉ có giá tại quán của cấp chuỗi. Nên
 * đây thuần là chỗ nhặt món: khách chọn chi nhánh ở O1, rồi O2 đối chiếu lại giỏ
 * với thực đơn chi nhánh đó (`syncToBranch`) trước khi ai kịp trả tiền.
 */

export interface QuickDish {
  id: string
  nameVi: string
  price: number
}

interface QuickValue {
  qtyOf: (dishId: string) => number
  add: (dish: QuickDish) => void
  bot: (dishId: string) => void
}

const Ctx = createContext<QuickValue | null>(null)

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<DraftLine[]>([])
  const [loaded, setLoaded] = useState(false)

  // Đọc SAU khi dựng xong chứ không lúc khởi tạo state: máy chủ không có
  // `sessionStorage` nên dựng ra giỏ rỗng, đọc sớm là hai bên lệch cây hydrate.
  useEffect(() => {
    setLines(readDraftLines())
    setLoaded(true)
  }, [])

  useEffect(() => {
    // Chưa đọc xong thì chưa được ghi: mảng rỗng ban đầu mà ghi ra trước là xoá
    // sạch giỏ khách đã nhặt ở trang trước.
    if (!loaded) return
    writeDraftLines(lines)
  }, [lines, loaded])

  const add = useCallback((dish: QuickDish) => {
    setLines((current) => {
      // Gộp vào dòng không lời dặn: bấm cộng năm lần là một dòng năm phần, chứ
      // không phải năm dòng một phần nằm chồng nhau trong giỏ.
      const at = current.findIndex((l) => l.dishId === dish.id && l.note === '')
      return at >= 0
        ? current.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l))
        : [...current, { dishId: dish.id, name: dish.nameVi, price: dish.price, qty: 1, note: '' }]
    })
  }, [])

  /** Bớt một phần; về 0 thì rút hẳn dòng khỏi giỏ chứ không để lại dòng qty 0 */
  const bot = useCallback((dishId: string) => {
    setLines((current) =>
      current
        // Đúng dòng mà `add` đã gộp vào — dòng không lời dặn. Trang thương hiệu
        // không đặt lời dặn nào, nên ở đây luôn có đúng một dòng cho mỗi món.
        .map((l) => (l.dishId === dishId && l.note === '' ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    )
  }, [])

  const value = useMemo<QuickValue>(
    () => ({
      qtyOf: (dishId) => lines.reduce((sum, l) => (l.dishId === dishId ? sum + l.qty : sum), 0),
      add,
      bot,
    }),
    [lines, add, bot],
  )

  const count = lines.reduce((sum, l) => sum + l.qty, 0)
  const sub = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Thanh ghim đáy chỉ hiện khi giỏ có món: trang marketing không phải lúc
          nào cũng là trang gọi món, che mất một dải chân trang cho người chỉ
          đang đọc là mất chỗ vô ích. */}
      {count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/28 bg-surface-4/97 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:px-10">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {count} phần đã chọn
              </p>
              {/* Nói thẳng giá còn đổi, ngay chỗ khách nhìn thấy con số: thực đơn
                  thương hiệu in giá tại quán, còn đơn online tính theo giá của
                  chi nhánh. Giấu chuyện này tới bước thanh toán là bội tín. */}
              <p className="truncate font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {formatVnd(sub)} · tính lại theo chi nhánh bạn chọn
              </p>
            </div>
            <Link
              href="/dat-mon"
              className="flex h-12 flex-none items-center rounded-sm bg-accent-strong px-6 text-[length:var(--fs-b1)] font-semibold text-on-accent"
            >
              Xem giỏ
            </Link>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  )
}

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

/**
 * Nút nhặt món — hình tròn vàng khi giỏ chưa có, nở thành thanh đếm khi đã có.
 *
 * Hai trạng thái CÙNG CAO 32 và nơi gọi giữ chỗ cố định 68, nên lúc nở ra không
 * có gì bị đẩy đi: chỉ hình tròn dài thành viên thuốc tại chỗ.
 *
 * Ô món là một thẻ liên kết sang trang chi tiết, nên nút này KHÔNG được nằm
 * trong thẻ đó — nút trong liên kết là HTML sai và bấm cộng sẽ nhảy trang. Nơi
 * gọi dựng nó thành anh em của liên kết.
 */
export function AddDishButton({ dish, className = '' }: { dish: QuickDish; className?: string }) {
  const quick = useContext(Ctx)
  if (!quick) return null

  const qty = quick.qtyOf(dish.id)

  /**
   * Nền vàng ĐẶC, nét dấu cộng màu nền trang — đảo cực so với phần còn lại của ô
   * món, nơi vàng chỉ là chữ và đường mảnh. Đo được 8,8:1, nút đọc ra ngay mà
   * không cần một đường viền nào.
   */
  const vo = 'flex h-8 items-center rounded-pill bg-accent text-on-accent transition-colors'

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
    <div
      className={`flex min-w-13 flex-none items-center justify-end xs:min-w-17 ${className}`}
    >
      {qty === 0 ? (
        <button
          type="button"
          aria-label={`Thêm ${dish.nameVi} vào giỏ`}
          onClick={() => quick.add(dish)}
          className="-my-1.5 grid h-11 w-8 place-items-center"
        >
          <span className={`${vo} w-8 justify-center hover:bg-gold-200`}>
            <IconCong />
          </span>
        </button>
      ) : (
        <div className={vo}>
          <button
            type="button"
            aria-label={`Bớt ${dish.nameVi}`}
            onClick={() => quick.bot(dish.id)}
            className={conBam}
          >
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
            aria-label={`Thêm ${dish.nameVi} vào giỏ`}
            onClick={() => quick.add(dish)}
            className={conBam}
          >
            <IconCong size={8} />
          </button>
        </div>
      )}
    </div>
  )
}
