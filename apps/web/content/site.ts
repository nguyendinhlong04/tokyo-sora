/**
 * Chữ nghĩa của website thương hiệu — W1, W4, W7, W9.
 *
 * Mọi con số vận hành (giá, giờ mở, số bàn, còn bàn hay không) đều lấy từ API.
 * Chỗ này chỉ giữ thứ không có trong CSDL: lời hứa của quán, câu chuyện bếp
 * trưởng, lời dẫn từng chương thực đơn — bản sắc viết một lần, không phải nội
 * dung đổi hằng tuần.
 *
 * **Tin tức (W8) và danh sách vị trí tuyển dụng (W9) đã chuyển sang A8** và về
 * đây qua `/api/site/posts` · `/api/site/jobs`. **Nội dung trang chi tiết món
 * (W3) — chuyện nguyên liệu, độ cắt, gia vị, món dùng kèm — đã chuyển sang
 * Office M1** và về đây trong `/api/site/menu`. Đừng thêm lại vào file này: hai
 * nguồn cho một dữ liệu là hai nguồn sẽ lệch nhau.
 */

export const SITE = {
  name: 'Tokyo Sora',
  kanji: '東京空',
  tagline: 'Bầu trời Tokyo, trên bếp than.',
  lead: 'Nướng than hoa tại bàn. Bò cắt trong ngày, than đốt trước bốn mươi phút.',
  /* Không đếm chi nhánh trong chữ: số chi nhánh nằm ở A10 và đổi được bất cứ lúc
     nào, còn dòng này thì không ai nhớ ra để sửa theo. */
  blurb: 'Nhà hàng nướng than kiểu Nhật. Than hoa tại bàn, thịt cắt trong ngày.',
  domain: 'tokyosora.vn',
  contactEmail: 'lienhe@tokyosora.vn',
  /** Page Facebook nhận ref đặt chỗ: m.me/{page}?ref=DATBAN_{mã} (§30.3) */
  messengerPage: 'tokyosora',
  recruitEmail: 'tuyendung@tokyosora.vn',
  privacyEmail: 'privacy@tokyosora.vn',
} as const

/** Điều hướng chính — hai nút hành động nằm riêng, mọi trang đều có */
export const NAV = [
  { href: '/', label: 'Trang chủ' },
  { href: '/thuc-don', label: 'Thực đơn' },
  { href: '/khong-gian', label: 'Không gian' },
  { href: '/uu-dai', label: 'Ưu đãi' },
  { href: '/tin-tuc', label: 'Tin tức' },
] as const

/** Ba lời hứa dưới hero W1 */
export const PROMISES = [
  {
    icon: 'fire' as const,
    text: 'Than hoa Bình Định, đốt sẵn bốn mươi phút trước khi bạn tới.',
  },
  {
    icon: 'knife' as const,
    text: 'Bò nhập mỗi sáng, cắt trong ngày, không cấp đông lại.',
  },
  {
    icon: 'room' as const,
    text: 'Sáu phòng riêng, cửa gỗ, khói không lẫn sang bàn khác.',
  },
]

/**
 * Dải cam kết ngay dưới hero W1 — bốn việc khách cần yên tâm TRƯỚC khi bấm đặt.
 *
 * Khác ba lời hứa bên dưới: chỗ đó nói về bếp, chỗ này nói về dịch vụ đặt món.
 */
export const SERVICES = [
  { icon: 'leaf' as const, label: 'Thịt tươi mỗi ngày' },
  { icon: 'bolt' as const, label: 'Giao nhanh nội thành' },
  { icon: 'shield' as const, label: 'Thanh toán an toàn' },
  { icon: 'calendar' as const, label: 'Giữ bàn miễn phí' },
]

/** Cách ăn Yakiniku — bốn bước trên W1 */
export const HOW_TO_EAT = [
  {
    n: '1',
    title: 'Chọn ba loại thịt khác thớ',
    desc: 'Một miếng mềm, một miếng dày, một miếng giòn cạnh. Vị sẽ không lặp.',
  },
  {
    n: '2',
    title: 'Đợi vỉ đủ nóng',
    desc: 'Mỡ chạm vỉ phải reo ngay. Chưa reo thì chưa đặt thịt lên.',
  },
  {
    n: '3',
    title: 'Nướng ít một, lật một lần',
    desc: 'Đừng ấn miếng thịt xuống vỉ — nước ngọt sẽ chảy hết vào than.',
  },
  {
    n: '4',
    title: 'Ăn nóng, chấm muối trước',
    desc: 'Muối tiêu chanh cho miếng đầu, tương cho miếng sau.',
  },
]

/**
 * Câu hỏi thường gặp ở cuối W1.
 *
 * Chỉ hỏi những việc hệ thống thật sự làm được, và trả lời không kèm con số cứng
 * — phí giao, giờ mở, số phòng riêng đều đọc từ API và đổi theo chi nhánh, viết
 * cứng ở đây là bảo đảm có ngày lệch với sự thật.
 */
export const FAQ = [
  {
    q: 'Đặt bàn trước có mất phí không?',
    a: 'Không. Bạn chọn ngày, số khách và kiểu chỗ trên trang Đặt bàn, chúng tôi giữ bàn và gửi lại mã xác nhận.',
  },
  {
    q: 'Quán có giao tận nơi không?',
    a: 'Có, quanh mỗi chi nhánh. Chọn chi nhánh và phường của bạn ở bước đầu, phí giao cùng thời gian dự kiến hiện ra trước khi bạn gọi món.',
  },
  {
    q: 'Thanh toán bằng cách nào?',
    a: 'Chuyển khoản bằng mã VietQR, hoặc trả tiền mặt khi nhận hàng. Ăn tại quán thì thanh toán ở bàn khi xong bữa.',
  },
  {
    q: 'Có phòng riêng cho nhóm không?',
    a: 'Chi nhánh nào cũng có phòng riêng, số phòng mỗi nơi một khác. Chọn "Phòng riêng" khi đặt bàn để xem chỗ còn trống.',
  },
  {
    q: 'Đi trên mười khách thì đặt thế nào?',
    a: 'Nhóm lớn và đặt tiệc xin gửi qua trang Liên hệ — chúng tôi xếp bàn và bàn trước thực đơn với bạn.',
  },
]

/** Lời dẫn của từng chương thực đơn (W2) — mã nhóm khớp `categories.id` */
export const CATEGORY_NOTES: Record<string, string> = {
  set: 'Đặt sẵn theo số người — bếp chọn phần thịt đẹp nhất trong ngày.',
  yaki: 'Trái tim của Tokyo Sora. Thịt thái máy, nướng trên than trắng ngay tại bàn.',
  tuoi: 'Ăn trước khi nhóm than — đánh thức vị giác bằng đồ lạnh và chua nhẹ.',
  chien: 'Món nóng ăn xen giữa các lượt nướng, để lửa nghỉ và bụng vẫn vui.',
  lau: 'Chốt bữa bằng nước dùng nóng, cơm hoặc mì — no đủ mà không nặng.',
  sup: 'Bát nhỏ dọn cùng thịt, cân lại vị mặn ngọt của than và tương.',
  ngot: 'Lạnh, ít ngọt, dứt vị khói — kết thúc đúng kiểu Nhật.',
  bia: 'Bia lạnh sâu, rót hai lần cho lớp bọt mịn — bạn đồng hành của mỡ bò.',
  ruou: 'Sake và shochu chọn theo phần thịt, phục vụ ở ba mức nhiệt.',
  tra: 'Trà nóng miễn phí châm lại, hoặc trà lạnh pha lạnh mười hai giờ.',
}

/** Gợi ý gọi món in trên panel kraft cuối W2 */
export const ORDER_ADVICE = [
  {
    title: 'Hai người',
    desc: 'Một Set Sora, thêm một phần bò và một món lạnh. Chốt bằng mì lạnh.',
  },
  {
    title: 'Bốn người',
    desc: 'Set Sumi cho nền, gọi thêm ba phần bò khác thớ để so vị.',
  },
  {
    title: 'Thứ tự',
    desc: 'Lạnh trước, nạc trước mỡ, đậm sau nhạt — để lưỡi còn nhận vị.',
  },
]

/**
 * Phần của chi nhánh chưa có cột trong CSDL: chữ kanji và điểm nhấn không gian.
 * Địa chỉ, giờ mở, điện thoại, số bàn thì đọc từ API (A10 là nguồn duy nhất).
 */
export const BRANCH_EXTRAS: Record<string, { kanji: string; highlights: string[] }> = {
  cg: {
    kanji: '空',
    highlights: ['Khu bếp than tại bàn', '3 phòng riêng'],
  },
  ht: {
    kanji: '湖',
    highlights: ['Sân thượng nhìn hồ', '2 phòng riêng'],
  },
  td: {
    kanji: '南',
    highlights: ['Khu bếp than tại bàn', '4 phòng riêng'],
  },
}

/** W4 — câu chuyện */
export const STORY = {
  kanji: '物語',
  title: 'Bắt đầu từ một quán mười hai ghế ở Nakameguro',
  lead: 'Năm 2009, ông Nakamura mở một quán nướng nhỏ đủ chỗ cho mười hai người. Không thực đơn in. Khách ngồi xuống, ông hỏi hôm nay muốn ăn phần nào của con bò.',
  caption: 'Quán gốc, 2009. Ảnh do gia đình Nakamura giữ.',
  body: [
    'Mười ba năm sau, con trai ông sang Hà Nội. Anh mang theo hai thứ: cách chọn than và thói quen hỏi khách trước khi cắt thịt. Còn lại thì làm mới hết — bò lấy từ trại trong nước, tương ướp nêm lại cho vừa vị Việt, và bếp than đặt ngay giữa bàn thay vì ở gian trong.',
    'Tokyo Sora không phải bản sao của quán gốc. Chỗ này ồn hơn, đông hơn, và người ta gọi bia nhiều hơn. Nhưng than vẫn được đốt bốn mươi phút trước khi mở cửa, và thịt vẫn cắt trong ngày. Hai điều đó thì không đổi.',
  ],
  quote: 'Than tốt không cần lửa lớn. Nó chỉ cần nóng đúng và im lặng.',
  quoteBy: 'Nakamura Kenji · bếp trưởng sáng lập',
  charcoal: {
    title: 'Bốn mươi phút trước khi mở cửa',
    body: [
      'Than được xếp thành ba lớp trong lò lớn ở sân sau. Lớp dưới cháy trước, lớp trên hong khô. Đến 16:20 thì than đã đỏ đều và không còn khói trắng — đó là lúc chia vào từng bếp bàn.',
      'Nếu bạn tới lúc 17:00, bếp trên bàn bạn đã nóng sẵn. Không phải chờ.',
    ],
  },
  chef: {
    name: 'Nakamura Sho',
    nameJa: '中村 翔',
    bio: 'Học nghề mười một năm ở quán của cha, ba năm ở một quán yakiniku tại Osaka. Sang Việt Nam năm 2022. Anh vẫn tự đi chọn bò hai buổi sáng mỗi tuần và tự cắt phần thăn.',
    facts: [
      { label: 'Vào nghề', value: '2008', mono: true },
      { label: 'Ở Tokyo Sora', value: 'Từ 2022', mono: true },
      { label: 'Phần thịt anh chọn', value: 'Lõi vai bò · nướng lửa lớn, ăn ngay', mono: false },
    ],
  },
}

/** W7 — ưu đãi đang chạy */
export const OFFERS = [
  {
    kanji: '刻',
    title: 'Giờ vàng 17:00–18:30',
    desc: 'Giảm 15% mọi set khi đặt bàn trước và tới đúng giờ.',
  },
  {
    kanji: '祝',
    title: 'Sinh nhật trong tuần',
    desc: 'Tặng bánh phô mai Hokkaido và một ly sake nhỏ cho chủ tiệc.',
  },
  {
    kanji: '重',
    title: 'Bốn lần đến, lần thứ năm',
    desc: 'Tích đủ bốn hoá đơn set, lần thứ năm được tặng đĩa bò tái chanh.',
  },
]

/** W9 — việc cần trao đổi qua biểu mẫu liên hệ */
export const CONTACT_SUBJECTS = [
  'Đặt bàn nhóm trên 10 khách',
  'Đặt tiệc phòng riêng',
  'Góp ý về bữa ăn',
  'Hợp tác · cung cấp nguyên liệu',
  'Việc khác',
]

/** W9 — lời dẫn khối tuyển dụng. Danh sách vị trí thì đọc từ A8. */
export const RECRUIT = {
  lead: 'Chúng tôi trả lương theo giờ công thật, có phụ cấp ca tối và bữa ăn trong ca. Chưa có kinh nghiệm vẫn nhận — trạm chiên và trạm rau học được trong hai tuần.',
}

/** Kiểu chỗ khách chọn ở W6 — khớp `tables.kind` trong CSDL */
export const SEAT_KINDS = [
  { id: 'standard', label: 'Bàn thường', fire: false },
  { id: 'grill', label: 'Bàn nướng có bếp', fire: true },
  { id: 'private', label: 'Phòng riêng', fire: false },
] as const

export type SeatKindId = (typeof SEAT_KINDS)[number]['id']
