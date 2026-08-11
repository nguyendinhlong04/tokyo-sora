/**
 * Nạp chỉ mục địa chỉ Hà Tĩnh:  pnpm --filter @sora/api db:dia-chi
 *
 * Idempotent — chạy lại chỉ cập nhật tên và toạ độ, KHÔNG đụng vào `hits` (số lần
 * khách chọn là thứ bảng tự học được, nạp lại mà xoá đi thì mỗi lần nạp là một
 * lần quên hết).
 *
 * Hai nguồn, cố ý tách bạch vì độ tin cậy khác nhau:
 *
 *  - **Phường/xã** chép tay từ Nghị quyết 1665/NQ-UBTVQH15 bên dưới. KHÔNG lấy từ
 *    OSM: đo ngày 11-08-2026, OSM chưa có ranh giới cấp xã mới của Hà Tĩnh (truy
 *    vấn `admin_level=8` trả về 0 quan hệ). Danh sách này mười năm mới đổi một
 *    lần nên chép cứng đáng hơn là phụ thuộc một API ngoài lúc nạp.
 *  - **Đường** lấy từ OSM qua Overpass. Chỗ này thì ngược lại: hai trăm tên đường
 *    chép tay là hai trăm cơ hội gõ sai, mà OSM có sẵn và kèm toạ độ.
 *
 * Vì OSM thiếu ranh giới xã nên KHÔNG gán được phường cho từng con đường — đường
 * nạp vào với `ward` rỗng. Việc gán để sau, khi có màn sửa ở Office hoặc khi phí
 * chuyển sang tính theo khoảng cách (lúc đó toạ độ là đủ, không cần phường).
 */
import 'dotenv/config'
import { and, eq, notInArray, sql } from 'drizzle-orm'
import { foldWard } from '../common/ward'
import { createDb, createPool, type Db } from './client'
import { addressPoints, branches, deliveryZones } from './schema'
import { gopDuong, type DoanDuongOsm } from './ten-duong'

/**
 * 69 đơn vị cấp xã của Hà Tĩnh từ 01-07-2025 (Nghị quyết 1665/NQ-UBTVQH15):
 * 9 phường và 60 xã. Sơn Kim 1 và Sơn Kim 2 là hai xã không sắp xếp lại.
 */
const PHUONG = [
  'Thành Sen',
  'Trần Phú',
  'Hà Huy Tập',
  'Vũng Áng',
  'Sông Trí',
  'Hoành Sơn',
  'Hải Ninh',
  'Bắc Hồng Lĩnh',
  'Nam Hồng Lĩnh',
]

const XA = [
  'Thạch Lạc', 'Đồng Tiến', 'Thạch Khê', 'Cẩm Bình', 'Kỳ Xuân', 'Kỳ Anh',
  'Kỳ Hoa', 'Kỳ Văn', 'Kỳ Khang', 'Kỳ Lạc', 'Kỳ Thượng', 'Cẩm Xuyên',
  'Thiên Cầm', 'Cẩm Duệ', 'Cẩm Hưng', 'Cẩm Lạc', 'Cẩm Trung', 'Yên Hòa',
  'Thạch Hà', 'Toàn Lưu', 'Việt Xuyên', 'Đông Kinh', 'Thạch Xuân', 'Lộc Hà',
  'Hồng Lộc', 'Mai Phụ', 'Can Lộc', 'Tùng Lộc', 'Gia Hanh', 'Trường Lưu',
  'Xuân Lộc', 'Đồng Lộc', 'Tiên Điền', 'Nghi Xuân', 'Cổ Đạm', 'Đan Hải',
  'Đức Thọ', 'Đức Đồng', 'Đức Quang', 'Đức Thịnh', 'Đức Minh', 'Hương Sơn',
  'Sơn Tây', 'Tứ Mỹ', 'Sơn Giang', 'Sơn Tiến', 'Sơn Hồng', 'Kim Hoa',
  'Vũ Quang', 'Mai Hoa', 'Thượng Đức', 'Hương Khê', 'Hương Phố', 'Hương Đô',
  'Hà Linh', 'Hương Bình', 'Phúc Trạch', 'Hương Xuân', 'Sơn Kim 1', 'Sơn Kim 2',
]

/**
 * Khung bao vùng lấy đường: TP Hà Tĩnh và các xã giáp ranh, khoảng 33 × 33 km
 * quanh quán ở 52-54 Hàm Nghi.
 *
 * KHÔNG quét cả tỉnh: Hà Tĩnh trải hơn 100 km từ Nghi Xuân xuống Kỳ Anh, mà một
 * quán không giao tới đó. Mỗi con đường thừa là một dòng gợi ý sai chen lên
 * trước dòng đúng. Nới khung khi nào quán mở rộng vùng giao.
 */
const KHUNG = { nam: 18.2, tay: 105.78, bac: 18.5, dong: 106.05 }

const OVERPASS = 'https://overpass-api.de/api/interpreter'

/** Đường có tên trong khung bao, mỗi tên một dòng kèm điểm giữa */
async function layDuongTuOsm(): Promise<{ name: string; lat: number; lng: number }[]> {
  /**
   * Bỏ đường cao tốc và đường đang thi công: không ai giao đồ ăn tới đó, mà tên
   * chúng chen thẳng lên đầu gợi ý — gõ "hàm nghi" thì "Cao tốc Bãi Vọt - Hàm
   * Nghi" và "Đi Hàm Nghi" đứng ngay dưới con phố thật.
   *
   * GIỮ `trunk`. Nghe như đường to nên bỏ được, nhưng đo trên chính khung bao
   * này: `trunk` gồm cả Quốc lộ 1 LẪN Xô Viết Nghệ Tĩnh và Tô Hiến Thành — hai
   * con phố dân ở thật, có nhà mặt đường. Bỏ nó là xoá mất khách.
   */
  const truyVan = `[out:json][timeout:180];
way(${KHUNG.nam},${KHUNG.tay},${KHUNG.bac},${KHUNG.dong})
  ["highway"]["name"]["highway"!~"^(motorway|motorway_link|construction)$"];
out center tags;`

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      /**
       * BẮT BUỘC. Chính sách dùng dữ liệu OSM đòi mỗi ứng dụng tự khai danh tính,
       * và Overpass cưỡng chế điều đó bằng **406 Not Acceptable** — đo ngày
       * 11-08-2026: cùng một truy vấn, thiếu dòng này trả 406, có thì trả 200.
       * `fetch` của Node không tự gắn User-Agent nào nên phải khai tay.
       */
      'User-Agent': 'tokyo-sora/1.0 (nap chi muc dia chi Ha Tinh)',
    },
    body: new URLSearchParams({ data: truyVan }),
  })
  if (!res.ok) throw new Error(`Overpass trả ${res.status} — thử lại sau vài phút`)

  /**
   * Overpass báo quá tải bằng HTTP **200 kèm một trang HTML**, không phải mã lỗi.
   * Đọc thẳng bằng `res.json()` thì lỗi hiện ra là "Unexpected token '<'" — người
   * chạy script không có cách nào đoán được đó là máy chủ bận, và sẽ đi tìm lỗi
   * trong mã của mình.
   */
  const raw = await res.text()
  if (!raw.trimStart().startsWith('{')) {
    throw new Error('Overpass đang bận (trả về HTML thay vì JSON) — chạy lại sau vài phút')
  }

  const { elements } = JSON.parse(raw) as { elements: DoanDuongOsm[] }
  return gopDuong(elements)
}

type DongNap = typeof addressPoints.$inferInsert

async function ghi(db: Db, rows: DongNap[]): Promise<void> {
  // Chia lô 500: Postgres chặn ở 65535 tham số cho một câu lệnh, mà mỗi dòng ăn
  // một tham số cho mỗi cột được ghi
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(addressPoints)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [addressPoints.kind, addressPoints.nameFolded, addressPoints.wardFolded],
        // `hits` cố tình vắng mặt — xem chú đầu file
        set: {
          name: sql`excluded.name`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
        },
      })
  }
}

async function main() {
  const pool = createPool()
  try {
    const db = createDb(pool)

    const hanhChinh: DongNap[] = [...PHUONG, ...XA].map((ten) => ({
      kind: 'ward',
      name: ten,
      nameFolded: foldWard(ten),
      // Phường tự nó là phường của chính nó — nhờ vậy gõ "thành sen" ra một dòng
      ward: ten,
      wardFolded: foldWard(ten),
    }))
    /**
     * Thêm mọi phường ĐANG CÓ TRONG VÙNG GIAO mà danh mục hành chính không có.
     *
     * Quán được quyền khai vùng bằng tên phường CŨ trước sáp nhập — và thực tế
     * đang khai như vậy, vì khách quen nói "Thạch Linh" chứ chưa quen "Thành
     * Sen". Chỉ mục mà chỉ có 69 tên mới thì gõ đúng cái tên quán nhận giao lại
     * không ra dòng nào: gợi ý và bảng tính tiền nói hai thứ khác nhau.
     *
     * Bảng vùng giao là bên có tiếng nói cuối về "giao được tới đâu", nên chỉ mục
     * đi theo nó chứ không ngược lại.
     */
    /* Lọc theo cả chi nhánh đang mở, đúng như `SiteService.wards()`: vùng của một
       chi nhánh đã tắt thì không ai giao tới đó được, mà gợi ý nó ra thì khách
       bấm vào rồi không đi tiếp được bước nào. */
    const vung = await db
      .select({ wards: deliveryZones.wards })
      .from(deliveryZones)
      .innerJoin(branches, eq(branches.id, deliveryZones.branchId))
      .where(and(eq(deliveryZones.active, true), eq(branches.active, true)))
    const daCo = new Set(hanhChinh.map((h) => h.nameFolded))
    const themTuVung = [...new Set(vung.flatMap((v) => v.wards))]
      .filter((ten) => !daCo.has(foldWard(ten)))
      .map((ten) => ({
        kind: 'ward',
        name: ten,
        nameFolded: foldWard(ten),
        ward: ten,
        wardFolded: foldWard(ten),
      }))

    await ghi(db, [...hanhChinh, ...themTuVung])
    console.log(`Phường/xã: ${hanhChinh.length} (+${themTuVung.length} từ bảng vùng giao)`)

    const duong = await layDuongTuOsm()
    await ghi(
      db,
      duong.map((d) => ({
        kind: 'street',
        name: d.name,
        nameFolded: foldWard(d.name),
        lat: d.lat,
        lng: d.lng,
      })),
    )
    console.log(`Đường: ${duong.length}`)

    /**
     * Dọn đường không còn trong nguồn — OSM đổi tên, hoặc chính script này vừa
     * thu hẹp lại loại đường lấy về. Không dọn thì bảng chỉ có lớn lên: mọi thứ
     * từng nạp nhầm nằm lại đó mãi và vẫn chen vào gợi ý.
     *
     * Chừa dòng có `hits > 0`. Khách đã từng chọn nghĩa là chỗ đó CÓ THẬT, dù
     * OSM vừa bỏ nó đi — thứ quán học được từ đơn thật đáng tin hơn bản đồ.
     */
    const conLai = duong.map((d) => foldWard(d.name))
    if (conLai.length > 0) {
      const { rowCount } = await db
        .delete(addressPoints)
        .where(
          and(
            eq(addressPoints.kind, 'street'),
            eq(addressPoints.hits, 0),
            notInArray(addressPoints.nameFolded, conLai),
          ),
        )
      if (rowCount) console.log(`Đã dọn ${rowCount} đường không còn trong nguồn`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
