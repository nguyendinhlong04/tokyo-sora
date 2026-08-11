/**
 * Chuẩn hoá và gộp tên đường lấy từ OSM.
 *
 * Tách khỏi `nap-dia-chi.ts` để test nhập được mà không kéo theo phần nối CSDL —
 * file kia gọi `main()` ngay khi được nạp.
 */
import { foldWard } from '../common/ward'

/**
 * Tiền tố chỉ LOẠI đường, không phải tên.
 *
 * OSM khai lúc có lúc không: "Đường Đào Tấn" và "Đào Tấn" là một con đường, để
 * nguyên thì bảng có hai dòng và ô gợi ý hiện cả hai.
 *
 * KHÔNG cắt "Ngõ" hay "Ngách" — chúng nằm trong tên thật ("Ngõ 10 Xuân Diệu"),
 * cắt đi là biến một con ngõ thành chính con phố mà nó rẽ ra.
 *
 * `(\s+|$)` chứ không `\s+`: chuỗi đã `trim()` trước khi tới đây, nên một tên rác
 * đúng bằng chữ "Đường" không còn khoảng trắng nào để `\s+` bám vào và nó lọt vào
 * bảng như một con đường tên "Đường".
 *
 * Và KHÔNG dùng `\b` cho việc đó: ranh giới từ của JS chỉ tính chữ ASCII, mà
 * "Phố" kết thúc bằng "ố" — không ký tự nào quanh đó là `\w` nên không có ranh
 * giới nào để bám. "Đường" thoát được vì nó kết thúc bằng "g".
 */
const TIEN_TO_LOAI = /^(đường|phố)(\s+|$)/i

/**
 * Chỉ viết hoa những chữ đang THƯỜNG HOÀN TOÀN.
 *
 * Hạ cả chuỗi rồi viết hoa lại là biến "QL1A" thành "Ql1a". Giữ nguyên chữ đã có
 * hoa thì "ngõ 10 xuân diệu" vẫn lên được "Ngõ 10 Xuân Diệu" mà mã tuyến không
 * hỏng.
 *
 * Sai CHÍNH TẢ dấu thì để nguyên ("Trân thị hường" ra "Trân Thị Hường"): đoán hộ
 * dấu tiếng Việt là cách sinh ra một tên đường không tồn tại. Sửa tay ở Office.
 *
 * Trả `null` khi không còn gì đáng lưu — tên rỗng hoặc một ký tự.
 */
export function donTenDuong(raw: string): string | null {
  const goc = raw.replace(/\s+/g, ' ').trim().replace(TIEN_TO_LOAI, '')
  if (goc.length < 2) return null
  return goc
    .split(' ')
    .map((tu) => (tu === tu.toLowerCase() ? tu.charAt(0).toUpperCase() + tu.slice(1) : tu))
    .join(' ')
}

/** Một đoạn đường như Overpass trả về, đã xin kèm điểm giữa bằng `out center` */
export interface DoanDuongOsm {
  tags?: { name?: string }
  center?: { lat: number; lon: number }
}

/**
 * Gộp các đoạn của cùng một con đường thành một dòng.
 *
 * OSM cắt một con đường thành nhiều đoạn — mỗi lần đổi số làn, đổi mặt đường hay
 * cắt qua ngã tư là một đoạn mới. Không gộp thì Hàm Nghi vào bảng thành mười mấy
 * dòng giống hệt nhau và ô gợi ý đọc ra như bị lặp.
 *
 * Gộp theo tên ĐÃ BỎ DẤU: OSM khai cùng một phố lúc "Hàm Nghi" lúc "hàm nghi",
 * mà hai chuỗi đó chỉ bằng nhau sau khi bỏ dấu và hạ chữ.
 *
 * Điểm đại diện là trung bình các đoạn — tức điểm GIỮA con đường. Đủ để tính phí
 * theo bậc khoảng cách, không đủ để chỉ đường tới cửa nhà.
 */
export function gopDuong(elements: DoanDuongOsm[]): { name: string; lat: number; lng: number }[] {
  const gop = new Map<string, { name: string; lats: number[]; lngs: number[] }>()

  for (const el of elements) {
    const ten = el.tags?.name ? donTenDuong(el.tags.name) : null
    // Đoạn không tên hoặc chưa có toạ độ thì bỏ — một dòng gợi ý không chỉ được
    // tới đâu còn tệ hơn là không có dòng nào
    if (!ten || !el.center) continue
    const khoa = foldWard(ten)
    const dang = gop.get(khoa) ?? { name: ten, lats: [], lngs: [] }
    dang.lats.push(el.center.lat)
    dang.lngs.push(el.center.lon)
    gop.set(khoa, dang)
  }

  const trungBinh = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return [...gop.values()].map((d) => ({
    name: d.name,
    lat: trungBinh(d.lats),
    lng: trungBinh(d.lngs),
  }))
}
