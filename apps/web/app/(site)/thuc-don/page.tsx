import { formatVnd } from '@sora/contracts'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MenuIndex } from '../../../components/MenuIndex'
import { AddDishButton, QuickAddProvider } from '../../../components/QuickAdd'
import { DishGlyph, Diamond, PhotoFrame, SignatureBadge } from '../../../components/visuals'
import { CATEGORY_NOTES, ORDER_ADVICE, SITE } from '../../../content/site'
import { dishGlyph, getMenu, groupByCategory, splitSubGroups } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Thực đơn',
  description:
    'Toàn bộ thực đơn Tokyo Sora: bò nướng than hoa, hải sản, set phần, đồ uống Nhật — giá cập nhật trực tiếp từ hệ thống nhà hàng.',
  alternates: { canonical: '/thuc-don' },
}

/**
 * W2 — Thực đơn.
 *
 * Toàn bộ món lấy cùng nguồn dữ liệu hệ thống: sửa giá ở Office là trang này đổi
 * theo trong vòng một phút, không có bước đồng bộ tay (§18.1).
 */
export default async function MenuPage() {
  const menu = await getMenu()
  const groups = groupByCategory(menu)
  const signatureCount = menu.dishes.filter((d) => d.signature).length

  return (
    <QuickAddProvider>
      {/* ------------------------------------------------- Poster đầu trang */}
      <section className="mx-auto max-w-[1280px] px-5 pt-10 lg:px-10 lg:pt-14">
        {/* Bo 12 bằng đúng ô món bên dưới, và `overflow-hidden` vì ảnh ở cột
            trái chạm hai mép khung — không cắt thì góc vuông của ảnh thò ra
            ngoài đường viền đã bo. */}
        <div className="grid overflow-hidden rounded-lg border border-accent/30 bg-canvas lg:grid-cols-[380px_1fr]">
          <div className="flex min-w-0 flex-col border-accent/18 lg:border-r">
            <div className="p-6 pb-5 lg:p-7">
              <p className="font-display text-[26px] font-semibold tracking-[0.06em] text-ink-hi lg:text-[30px]">
                TOKYO SORA
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <span className="text-[10px] font-semibold tracking-[0.2em] text-accent">
                  YAKINIKU · RAMEN · IZAKAYA
                </span>
                <span className="ml-auto grid size-8 flex-none place-items-center border border-danger-line text-center font-jp text-[10px] leading-tight text-danger">
                  美味
                </span>
              </div>
            </div>
            <div className="relative min-h-[220px] flex-1 border-t border-accent/16 lg:min-h-[280px]">
              <PhotoFrame rounded={false} bordered={false} className="absolute inset-0" />
              <span className="pointer-events-none absolute top-5 left-6 font-jp text-[30px] tracking-[0.18em] text-ink-hi [writing-mode:vertical-rl]">
                御献立
              </span>
            </div>
          </div>

          <div className="grid min-w-0 content-center gap-6 p-6 lg:px-11 lg:py-9">
            <div>
              <h1 className="font-display text-[42px] leading-none font-semibold tracking-[0.04em] text-gold-200 uppercase lg:text-[64px]">
                Thực đơn
              </h1>
              <p className="mt-3.5 font-jp text-[length:var(--fs-t2)] tracking-[0.14em] text-accent-ink lg:text-[length:var(--fs-t1)]">
                お品書き — {SITE.kanji}
              </p>
            </div>
            <div className="h-px bg-[linear-gradient(90deg,rgba(201,168,92,0.5)_0%,rgba(201,168,92,0.08)_100%)]" />
            <p className="max-w-[620px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
              Mười chương, đọc từ trên xuống là một bữa hoàn chỉnh: khai vị lạnh — thịt nướng trên
              than trắng — món nóng xen giữa — nước dùng chốt bữa — đồ ngọt lạnh. Giá đã gồm phục
              vụ, chưa gồm thuế; thực đơn đổi theo mùa và theo chi nhánh.
            </p>
            <dl className="flex flex-wrap gap-8">
              {[
                { n: menu.dishes.length, label: 'Món trong thực đơn' },
                { n: signatureCount, label: 'Món ký của bếp' },
                { n: groups.length, label: 'Chương' },
              ].map((stat) => (
                <div key={stat.label}>
                  <dd className="font-display text-[26px] font-semibold text-accent-ink lg:text-[30px]">
                    {stat.n}
                  </dd>
                  <dt className="mt-1.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Mục lục chương
          Dính dưới thanh điều hướng (đáy 96) và tự sáng chương đang đọc — xem
          `MenuIndex`. Mười tên chảy thành hai dòng chữ trần chứ không cuộn
          ngang: thanh cuộn cũ chỉ hở ba chương trong mười trên máy 375, bảy
          chương còn lại nằm sau một cử chỉ không có dấu hiệu nào báo là có. */}
      <MenuIndex chapters={groups} />

      {/* ---------------------------------------------------- Từng chương */}
      <div className="mx-auto max-w-[1280px] px-5 pt-12 lg:px-10 lg:pt-16">
        {groups.map((group, index) => (
          <section
            key={group.id}
            id={`chuong-${group.id}`}
            /* 192 = phần ghim dày nhất cộng chỗ thở. Ba thanh chồng nhau, và
               hai vế của nó đổi ngược chiều nhau nên tổng gần như đứng yên: máy
               nhỏ thì dải vàng cộng thanh điều hướng chỉ 96 nhưng mười tên phải
               xuống hai dòng (86) → 182; màn rộng thì chúng dày lên 124 còn mục
               lục gom một dòng (50) → 174. Một con số cho cả dải, không chia
               mức: chênh nhau 8, mà chia mức thì mỗi lần một trong hai thanh
               kia đổi chiều cao là phải dò lại từng ngưỡng.
               Thiếu chỗ này thì tiêu đề chương nhảy tới nằm gọn dưới thanh mục
               lục, khách bấm xong không thấy mình vừa tới đâu. */
            className="scroll-mt-48 pb-14 lg:pb-18"
          >
            {/* 32 chứ không 24: đây là ranh giới CHƯƠNG, đường có nghĩa nhất
                trang. Ngang bằng viền ô món như trước thì mắt không tách được
                tầng nào với tầng nào — chương 24, ô món 22, chênh hai phần trăm.
                Giữ khoảng cách này với alpha của ô món bên dưới. */}
            <header className="flex items-start gap-5 border-b border-accent/32 pb-6 lg:gap-6 lg:pb-7">
              <div className="mt-1 hidden lg:mx-2 lg:block">
                <Diamond>{String(index + 1).padStart(2, '0')}</Diamond>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-4 lg:gap-[18px]">
                  <h2 className="font-display text-[30px] leading-tight font-semibold tracking-[0.04em] text-gold-200 uppercase lg:text-[40px]">
                    {group.nameVi}
                  </h2>
                  {group.kanji ? (
                    <span className="font-jp text-[length:var(--fs-t1)] tracking-[0.14em] text-accent-ink">
                      {group.kanji}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {group.dishes.length} món
                  </span>
                </div>
              </div>
            </header>

            {splitSubGroups(group.dishes).map((sub) => (
              <div key={sub.key} className="pt-8">
                {sub.label ? (
                  <div className="flex items-center gap-3 pb-5">
                    <span className="font-jp text-[length:var(--fs-b2)] text-accent">✿</span>
                    <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-gold-200 uppercase">
                      {sub.label.name}
                    </span>
                    <span className="font-jp text-[length:var(--fs-t2)] tracking-[0.12em] text-ink-mute">
                      {sub.label.kanji}
                    </span>
                    <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(201,168,92,0.3)_0%,rgba(201,168,92,0.05)_100%)]" />
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-[18px]">
                  {sub.dishes.map((dish) => (
                    /* Thẻ ngoài là `div` chứ không còn là liên kết: nút cộng phải
                       đứng NGOÀI thẻ `a` — nút lồng trong liên kết là HTML sai và
                       bấm cộng sẽ nhảy sang trang món. */
                    /* `overflow-hidden` đi kèm `rounded-lg` chứ không phải cho vui:
                       ảnh món nằm sát ba mép trên của ô, không cắt thì bốn góc
                       vuông của ảnh vẫn thò ra ngoài đường viền đã bo.

                       `lg` (12) chứ không `md` (8) mà §10 dành cho thẻ: đây là
                       quyết định của quán, ô món phải cong rõ như mẫu họ đưa. Ô
                       món ở W1 đổi theo cùng lúc để hai trang không lệch nhau. */
                    <div
                      key={dish.id}
                    /* 16 chứ không 22: lùi xuống dưới đường chương (32) để lưới
                       món đọc ra là nội dung của chương chứ không phải một tầng
                       ngang hàng. Cũng là đúng alpha của ô món ở W1 — hai trang
                       vẽ cùng một thứ thì không có cớ gì đậm nhạt khác nhau. */
                      className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-accent/16 bg-surface-1 transition-colors hover:border-accent hover:bg-surface-3"
                    >
                      <Link href={`/thuc-don/${dish.id}`} className="flex min-w-0 flex-1 flex-col">
                        <div className="relative aspect-[4/3]">
                          <DishGlyph glyph={dishGlyph(dish)} src={dish.imageUrl} alt={dish.nameVi} className="size-full" />
                          {dish.signature ? (
                            <span className="absolute top-2.5 right-2.5">
                              <SignatureBadge compact />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3 pb-0 xs:p-4 xs:pb-0">
                          <p className="font-display text-[length:var(--fs-t2)] leading-tight font-semibold tracking-[0.03em] text-gold-200 uppercase">
                            {dish.nameVi}
                          </p>
                          {dish.nameJa ? (
                            <p className="font-jp text-[length:var(--fs-c1)] tracking-[0.1em] text-ink-mute">
                              {dish.nameJa}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                      {/* Giá và nút đứng CÙNG MỘT HÀNG, không còn nút ghim đè lên
                          góc ô: thanh đếm lúc nở ra rộng 68, mà trên máy 375 ô
                          món chỉ rộng 160 — ghim đè thì nó phủ mất đuôi con số.
                          Hàng này nằm ngoài `Link` vì nút không được lồng trong
                          liên kết, nên tên món ở trên mới là phần bấm sang trang. */}
                      {/* Một hàng ở MỌI khổ, và dưới 480 thì cả ba thứ cùng thu
                          lại mới đủ chỗ: giá 16 → 13, thanh đếm 68 → 52, đệm 16
                          → 12. Đo ở khổ 375: ô 161 − đệm 24 − thanh 52 − khoảng
                          cách 6 = 79 cho giá, mà "3.200.000₫" ở 13px cần 78. Sát
                          một điểm ảnh, nên `truncate` ở lại phòng khi bảng giá
                          lên tám chữ số. */}
                      <div className="flex items-center justify-between gap-1 px-3 pt-2.5 pb-3 xs:gap-2 xs:px-4 xs:pb-4">
                        <p className="min-w-0 truncate font-mono text-[length:var(--fs-c1)] text-accent-ink xs:text-[length:var(--fs-b1)]">
                          {formatVnd(dish.price)}
                        </p>
                        {/* Món không bán online thì không có nút: bấm cộng rồi tới
                            O2 mới biết không đặt được là hứa suông. */}
                        {dish.onlineVisible ? <AddDishButton dish={dish} /> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* ---------------------------------------------- Panel kraft cuối trang */}
      <section className="mx-auto max-w-[1280px] px-5 pb-20 lg:px-10 lg:pb-32">
        <div className="grid gap-8 rounded-lg bg-kraft p-7 lg:grid-cols-[1fr_300px] lg:gap-9 lg:px-9">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="font-jp text-[length:var(--fs-b1)] text-kraft-ink-2">✿</span>
              <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                Gọi món thế nào cho vừa
              </span>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              {ORDER_ADVICE.map((advice) => (
                <div key={advice.title}>
                  <p className="font-display text-[19px] font-semibold text-kraft-ink">
                    {advice.title}
                  </p>
                  <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-kraft-ink-2">
                    {advice.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 content-start gap-3">
            <Link
              href="/dat-ban"
              className="flex h-13 items-center justify-center rounded-md bg-kraft-ink text-[length:var(--fs-b1)] font-semibold text-gold-200"
            >
              Đặt bàn để thưởng thức
            </Link>
            <Link
              href="/dat-mon"
              className="flex h-13 items-center justify-center rounded-md border border-kraft-ink text-[length:var(--fs-b1)] font-semibold text-kraft-ink"
            >
              Đặt món mang về
            </Link>
          </div>
        </div>
      </section>

      {/* Schema Menu cho Google — điều kiện để món hiện trong kết quả tìm kiếm */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Menu',
            name: 'Thực đơn Tokyo Sora',
            inLanguage: 'vi-VN',
            hasMenuSection: groups.map((group) => ({
              '@type': 'MenuSection',
              name: group.nameVi,
              description: CATEGORY_NOTES[group.id],
              hasMenuItem: group.dishes.map((dish) => ({
                '@type': 'MenuItem',
                name: dish.nameVi,
                description: dish.shortDesc ?? undefined,
                offers: {
                  '@type': 'Offer',
                  price: dish.price,
                  priceCurrency: 'VND',
                },
              })),
            })),
          }),
        }}
      />
    </QuickAddProvider>
  )
}
