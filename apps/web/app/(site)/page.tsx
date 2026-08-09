import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import { ChapterRail } from '../../components/ChapterRail'
import { DishRails } from '../../components/DishRails'
import { HomeHero } from '../../components/HomeHero'
import { AddDishButton, QuickAddProvider } from '../../components/QuickAdd'
import { DishGlyph, SignatureBadge } from '../../components/visuals'
import { FAQ, SERVICES, SITE } from '../../content/site'
import { dishGlyph, getBranches, getHeroImages, getMenu, getWards } from '../../lib/site'

/**
 * W1 — Trang chủ.
 *
 * Hero chỉ giữ một nút — "Đặt món ngay" — để nó đi cùng nhịp trườn của tên món.
 * Việc thứ hai của website là đặt bàn, và nó vẫn có hai lối vào: nút vàng luôn
 * dính trên thanh điều hướng, và dải tìm bàn ở cuối trang (§19).
 */
export default async function HomePage() {
  // Song song hết, không nối đuôi: bốn lượt gọi này nằm trên đường tới LCP
  const [menu, branches, heroImages, wards] = await Promise.all([
    getMenu(),
    getBranches(),
    getHeroImages(),
    getWards(),
  ])
  const plates = menu.dishes.filter((d) => d.kind !== 'set')
  const signatures = plates.filter((d) => d.signature).slice(0, 6)

  // Lưới bên phải của dải hai cột phải đủ dài thì tấm bên trái dính lại mới có
  // nghĩa: sáu món thôi là cuộn chưa kịp bắt đầu đã hết lưới. Món ký đứng trước,
  // rồi bù món thường cho đủ mười hai.
  const showcase = [...plates.filter((d) => d.signature), ...plates.filter((d) => !d.signature)].slice(0, 12)

  /**
   * Món của tấm mời gọi bên trái — SET đứng trước.
   *
   * Tấm này mời khách đặt món, mà lời mời mạnh nhất là một bữa trọn gói chứ không
   * phải một đĩa thịt lẻ. Set không nằm trong `plates` (lưới bên phải và hai hàng
   * ảnh chỉ dẫn sang trang món lẻ), nên phải lấy thẳng từ `menu.dishes`.
   *
   * Lấy set đã bật "Món ký của bếp" đứng đầu thực đơn; chưa bật set nào thì lùi
   * về món ký đầu như trước. Đổi tấm này thì bật/tắt cờ món ký ở Office M1 —
   * trang chủ không giữ tên món nào viết cứng.
   */
  const cover = menu.dishes.find((d) => d.kind === 'set' && d.signature) ?? signatures[0]

  // Hai hàng ảnh trượt ngang: cắt đôi danh sách món rồi đảo chiều nửa sau, để hai
  // hàng đi ngược nhau mà không lặp lại cùng một thứ tự món.
  const rail = (list: typeof plates) =>
    list.slice(0, 12).map((d) => ({
      id: d.id,
      nameVi: d.nameVi,
      glyph: d.nameJa?.trim().charAt(0) || dishGlyph(d),
      imageUrl: d.imageUrl,
    }))
  const half = Math.ceil(plates.length / 2)
  const railTop = rail(plates.slice(0, half))
  const railBottom = rail(plates.slice(half).reverse())

  // Chương nào có món thì mới lên dải: một ô dẫn vào chương rỗng là một cú bấm
  // phí. Ảnh lấy từ món đầu tiên có ảnh trong chương, chưa có thì vẽ chữ chương.
  const chapters = menu.categories
    .map((category) => {
      const inside = menu.dishes.filter((d) => d.categoryId === category.id)
      return {
        id: category.id,
        nameVi: category.nameVi,
        glyph: category.kanji?.trim() || category.nameVi.charAt(0),
        imageUrl: inside.find((d) => d.imageUrl)?.imageUrl ?? null,
        count: inside.length,
      }
    })
    .filter((category) => category.count > 0)

  // Bộ ảnh và video hero xếp ở Office A8 đứng trước. Chưa ai xếp khung nào thì
  // lùi về năm món ký đầu như trước khi có màn đó — trang chủ không bao giờ trống
  // ảnh vì marketing chưa kịp nhập. Món chưa có ảnh vẫn vào danh sách: hero vẽ
  // một chữ lớn thay ảnh, đúng như mọi chỗ khác trong trang. Một chữ chứ không cả
  // chuỗi kana: chữ nền cao 340px, hai ba chữ là tràn ra ngoài.
  const slides =
    heroImages.length > 0
      ? heroImages.map((image) => ({
          id: `hero-${image.id}`,
          // Chú thích là chữ LỚN của hero, nên không được rỗng: ảnh không có gì để
          // chú thì hero nói tên quán, chứ không phải để trang chủ mất tiêu đề.
          nameVi: image.caption ?? SITE.name,
          nameJa: image.caption ? image.captionJa : SITE.kanji,
          glyph: '空',
          imageUrl: image.imageUrl,
          videoUrl: image.videoUrl,
        }))
      : signatures.slice(0, 5).map((dish) => ({
          id: dish.id,
          nameVi: dish.nameVi,
          nameJa: dish.nameJa,
          glyph: dish.nameJa?.trim().charAt(0) || '空',
          imageUrl: dish.imageUrl,
          videoUrl: null,
        }))

  const today = new Date()
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86_400_000)
    return {
      value: d.toISOString().slice(0, 10),
      label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : formatDate(d),
    }
  })

  return (
    <QuickAddProvider>
      {/* ---------------------------------------------------------- Hero */}
      <HomeHero
        slides={slides}
        branches={branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          address: branch.address,
          openHours: branch.openHours,
        }))}
        wards={wards}
      />

      {/* ------------------------------------------------ Dải cam kết dịch vụ */}
      <section className="bg-surface-1 px-5 py-5 md:py-6 lg:px-10">
        <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 md:gap-6 lg:gap-10">
          {SERVICES.map((service) => (
            <div key={service.label} className="flex items-center gap-3.5">
              <span className="flex-none text-accent">
                <ServiceIcon kind={service.icon} />
              </span>
              <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-hi uppercase lg:text-[length:var(--fs-b2)]">
                {service.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------- Món của bếp — hai cột
          Trái là tấm mời gọi, dính lại tại chỗ trong lúc phải cuộn qua hết món.
          Hết món thì lưới kết thúc, tấm bên trái nhả ra và cả hai cùng đi tiếp —
          đó là toàn bộ việc `sticky` làm, không cần một dòng JavaScript nào.

          `items-start` là điều kiện để nó dính: ô lưới mà kéo cao bằng cột kia
          thì không còn gì để trượt bên trong. */}
      {showcase.length > 0 ? (
        /* Đệm trên bằng đúng `lg:top-35` của cột dính: lúc mép khối chạm đỉnh màn
           thì tấm bên trái đã nằm sẵn ở chỗ nó sẽ dừng, nên chuyển sang dính
           không thấy giật.

           140 = dải vàng 44 + thanh điều hướng 80 + 16 thở. Hai thanh trên đều
           dính, nên dừng ở 96 như trước là chui một phần xuống dưới chúng. */
        <section className="px-5 pt-12 pb-12 lg:px-10 lg:pt-35 lg:pb-32">
          <div className="mx-auto grid max-w-[1280px] items-start gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="lg:sticky lg:top-35">
              {/* 156 = 140 dừng + 16 chừa mép dưới, để tấm không chạm đáy màn.

                  Khổ ĐỨNG 4/5 trên điện thoại chứ không 4/3: ở 4/3 tấm chỉ cao
                  251 mà riêng tiêu đề đã chiếm 7–47% của nó, nên chữ nằm trọn
                  trong phần lớp phủ còn trong suốt và chìm vào ảnh. Cao thêm là
                  ảnh có chỗ thở phía trên, chữ có dải tối phía dưới. */}
              <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-accent/16 sm:aspect-[4/3] lg:aspect-auto lg:h-[calc(100dvh-9.75rem)]">
                {cover ? (
                  <DishGlyph
                    glyph={dishGlyph(cover)}
                    src={cover.imageUrl}
                    alt=""
                    size="xl"
                    className="size-full"
                  />
                ) : null}
                {/* Trên điện thoại dốc tối sớm hơn hẳn: tấm ngắn nên khối chữ bắt
                    đầu ngay quá nửa, còn mốc 0.35 ở 46% của bản desktop là dành
                    cho tấm cao gần trọn màn, nơi chữ nằm tít dưới đáy. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,10,0.10)_0%,rgba(7,8,10,0.16)_30%,rgba(7,8,10,0.58)_47%,rgba(7,8,10,0.86)_64%,rgba(7,8,10,0.95)_100%)] lg:bg-[linear-gradient(180deg,rgba(7,8,10,0.15)_0%,rgba(7,8,10,0.35)_46%,rgba(7,8,10,0.92)_100%)]"
                />
                <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
                  <h2 className="max-w-[420px] font-display text-[30px] leading-[1.1] font-light text-ink-hi uppercase lg:text-[length:var(--fs-d2)]">
                    Xem những món được gọi nhiều nhất
                  </h2>
                  <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 lg:mt-8">
                    <Link
                      href="/dat-mon"
                      className="inline-flex h-13 items-center justify-center rounded-pill bg-accent px-8 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-gold-300"
                    >
                      Đặt món ngay
                    </Link>
                    <Link
                      href="/thuc-don"
                      className="text-[length:var(--fs-b2)] text-accent-ink transition-colors hover:text-gold-200"
                    >
                      Toàn bộ thực đơn →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:gap-5">
              {showcase.map((dish) => (
                /* Thẻ ngoài là `div`, liên kết nằm trong: nút cộng phải đứng
                   ngoài thẻ `a` — xem chú cùng chỗ ở W2. */
                <div
                  key={dish.id}
                  /* `rounded-lg` khớp với ô món ở W2 — xem chú ở đó về việc lệch
                     khỏi mức `md` mà §10 dành cho thẻ */
                  className="group relative overflow-hidden rounded-lg border border-accent/16 bg-surface-2 transition-colors hover:border-accent/40"
                >
                  <Link href={`/thuc-don/${dish.id}`} className="block">
                    <div className="relative aspect-[4/3]">
                      <DishGlyph
                        glyph={dishGlyph(dish)}
                        src={dish.imageUrl}
                        alt={dish.nameVi}
                        className="size-full"
                      />
                      {dish.signature ? (
                        <span className="absolute top-2.5 left-2.5">
                          <SignatureBadge compact />
                        </span>
                      ) : null}
                    </div>
                    <div className="p-3 pb-0 xs:p-3.5 xs:pb-0 lg:p-4 lg:pb-0">
                      <p className="text-[length:var(--fs-b2)] font-semibold text-ink-hi lg:text-[length:var(--fs-t2)]">
                        {dish.nameVi}
                      </p>
                      {dish.nameJa ? (
                        <p className="mt-1.5 font-jp text-[length:var(--fs-c1)] tracking-[0.08em] text-ink-mute">
                          {dish.nameJa}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                  {/* Giá và nút cùng một hàng, không còn nút ghim đè góc ô — xem
                      chú cùng chỗ ở W2 về thanh đếm rộng 68 trên ô 160 */}
                  {/* Giá và thanh đếm cùng thu lại dưới 480 mới đủ chỗ cho một
                      hàng — xem phép đo ở W2 */}
                  <div className="flex items-center justify-between gap-1 px-3 pt-2.5 pb-3 xs:gap-2 xs:px-3.5 xs:pb-3.5 lg:px-4 lg:pb-4">
                    <p className="min-w-0 truncate font-mono text-[length:var(--fs-c1)] text-accent-ink xs:text-[length:var(--fs-b2)] lg:text-[length:var(--fs-b1)]">
                      {formatVnd(dish.price)}
                    </p>
                    {dish.onlineVisible ? <AddDishButton dish={dish} /> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------- Hai hàng ảnh trượt theo cuộn */}
      {railTop.length > 0 ? <DishRails top={railTop} bottom={railBottom} /> : null}

      {/* ------------------------------------------- Chương thực đơn — dải ngang
          Ô cùng cỡ với dải ảnh phía trên để hai dải đọc như một hệ. Cuộn ngang
          bằng tay chứ không theo trang: đây là chỗ khách tìm nhóm món họ muốn,
          nên phải để họ điều khiển. */}
      {chapters.length > 0 ? (
        <section className="pb-20 lg:pb-32">
          <div className="mx-auto max-w-[1280px] px-5 lg:px-10">
            <h2 className="font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              Các chương thực đơn
            </h2>
            <p className="mt-3 font-jp text-[length:var(--fs-b1)] tracking-[0.14em] text-ink-mute">
              — 品書 —
            </p>
          </div>

          <ChapterRail chapters={chapters} />
        </section>
      ) : null}

      {/* ------------------------------------------------- Dải tìm bàn tối nay */}
      <section className="relative overflow-hidden bg-gold-900">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,10,0.42),rgba(7,8,10,0.62))]"
        />
        {/* Một hàng ngang trên laptop, ba dòng gọn trên điện thoại.
            Bản trước ăn 467 điểm ảnh — 57% màn điện thoại — cho đúng một việc là
            chọn hai ô rồi bấm. Phần lớn chỗ đó là nhãn thừa và đệm. */}
        <div className="relative mx-auto flex max-w-[1280px] flex-col gap-5 px-5 py-9 lg:flex-row lg:items-center lg:justify-between lg:gap-14 lg:px-10 lg:py-20">
          <div>
            <h2 className="font-display text-[26px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              Còn bàn tối nay
            </h2>
            <p className="mt-2 text-[length:var(--fs-b2)] text-gold-200 lg:mt-3 lg:text-[length:var(--fs-b1)]">
              Chọn ngày và số khách, chỗ trống hiện ra ngay.
            </p>
          </div>

          {/* GET sang W6: không mang gì hơn ngày và số khách — thông tin cá nhân
              không đi qua thanh địa chỉ.

              KHÔNG còn nhãn nổi trên mỗi ô: ô ngày đọc thẳng "Hôm nay", ô khách
              đọc "4 khách" — hai nhãn "NGÀY" và "SỐ KHÁCH" chỉ nói lại đúng thứ
              ô bên dưới đang hiện, mà ngốn hai dòng. Tên cho trình đọc màn hình
              chuyển sang `aria-label`, không mất gì. */}
          <form
            action="/dat-ban"
            className="grid grid-cols-2 gap-2.5 lg:flex lg:flex-none lg:gap-3"
          >
            <select
              name="ngay"
              aria-label="Ngày"
              defaultValue={dates[0]!.value}
              className="h-12 w-full rounded-sm border border-ink-hi/28 bg-canvas/50 px-3.5 text-[length:var(--fs-b2)] text-ink-hi lg:w-[168px] lg:text-[length:var(--fs-b1)]"
            >
              {dates.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select
              name="khach"
              aria-label="Số khách"
              defaultValue="4"
              className="h-12 w-full rounded-sm border border-ink-hi/28 bg-canvas/50 px-3.5 text-[length:var(--fs-b2)] text-ink-hi lg:w-[140px] lg:text-[length:var(--fs-b1)]"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} khách
                </option>
              ))}
            </select>
            {/* Trải hết bề ngang trên điện thoại: nút gửi là việc cuối, cho nó
                một dòng riêng thì ngón cái không phải nhắm */}
            <button
              type="submit"
              className="col-span-2 h-12 rounded-sm border border-ink-hi px-7 text-[length:var(--fs-b2)] font-semibold whitespace-nowrap text-ink-hi transition-colors hover:bg-ink-hi hover:text-canvas lg:col-auto lg:text-[length:var(--fs-b1)]"
            >
              Tìm bàn trống
            </button>
          </form>
        </div>
      </section>

      {/* -------------------------------------------- Câu hỏi thường gặp
          `<details>` chứ không phải khối đóng mở tự viết: trình duyệt lo sẵn phần
          bàn phím và trình đọc màn hình, và câu trả lời vẫn nằm trong HTML nên
          Google đọc được dù đang gập. */}
      <section className="px-5 py-20 lg:px-10 lg:py-32">
        <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              Câu hỏi thường gặp
            </h2>
            <p className="mt-5 max-w-[380px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
              Không thấy câu trả lời ở đây thì nhắn cho chúng tôi.
            </p>
            <Link
              href="/lien-he"
              className="mt-6 inline-flex text-[length:var(--fs-b2)] text-accent-ink transition-colors hover:text-gold-200"
            >
              Gửi câu hỏi →
            </Link>
          </div>

          <div>
            {FAQ.map((item) => (
              /* Chỉ còn vạch NGĂN GIỮA hai câu — bỏ vạch bọc trên và vạch cuối
                 khối. Vạch giữa giữ lại vì nó chia ranh vùng bấm của từng câu;
                 bỏ nốt thì khối gập mở đọc ra một mảng chữ liền. */
              <details key={item.q} className="group border-b border-accent/12 py-5 last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[length:var(--fs-b1)] font-medium text-ink-hi lg:text-[length:var(--fs-t2)] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden
                    className="grid size-8 flex-none place-items-center rounded-full border border-accent/30 text-accent transition-transform group-open:rotate-45"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 1v10M1 6h10" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3.5 max-w-[520px] text-[length:var(--fs-b2)] leading-relaxed text-ink-body lg:text-[length:var(--fs-b1)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Hai hành động gắn thẳng vào thực thể Restaurant — điều kiện để nút đặt
          hiện ngay trên kết quả tìm kiếm (§23.1.4) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Restaurant',
            name: SITE.name,
            alternateName: SITE.kanji,
            description: SITE.blurb,
            servesCuisine: 'Nhật Bản · Yakiniku',
            priceRange: '₫₫',
            hasMenu: '/thuc-don',
            telephone: branches[0]?.phone ?? undefined,
            address: branches.map((branch) => ({
              '@type': 'PostalAddress',
              streetAddress: branch.address,
            })),
            potentialAction: [
              { '@type': 'ReserveAction', target: '/dat-ban' },
              { '@type': 'OrderAction', target: '/dat-mon' },
            ],
          }),
        }}
      />
    </QuickAddProvider>
  )
}

function formatDate(d: Date): string {
  const dow = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
  return `${dow} ${d.getDate()}/${d.getMonth() + 1}`
}

function ServiceIcon({ kind }: { kind: 'leaf' | 'bolt' | 'shield' | 'calendar' }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
  }
  if (kind === 'leaf') {
    return (
      <svg {...common}>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z" />
        <path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12" />
      </svg>
    )
  }
  if (kind === 'bolt') {
    return (
      <svg {...common}>
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
      </svg>
    )
  }
  if (kind === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6l7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  )
}
