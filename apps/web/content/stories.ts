/**
 * Chuyện nguyên liệu của ~15 món chủ lực (W3) và ba set lớn (W3 · W7).
 *
 * Chữ nghĩa của bếp, không phải dữ liệu vận hành — nên KHÔNG nằm trong trung tâm
 * sản phẩm: tên, giá, dị ứng vẫn lấy từ API danh mục, chỗ này chỉ bù phần kể
 * chuyện. Khi màn CMS A8 lên, file này là thứ được thay đầu tiên.
 */

export interface DishCut {
  name: string
  size: string
  desc: string
  /** Độ mềm 1–4, vẽ thành thanh đo trên W3 */
  soft: number
}

export interface DishCondiment {
  kanji: string
  name: string
  desc: string
}

export interface DishStory {
  /** Số thứ tự in trong ô kim cương vàng */
  no: string
  portion: string
  jaFull: string
  /** Kanji ngắn của phần thịt, viết dọc cạnh ảnh */
  posShort: string
  pos: string
  flavours: string[]
  cuts: DishCut[]
  fire: string
  dip: string
  note: string
  craft: string
  conds: DishCondiment[]
}

export const DISH_STORIES: Record<string, DishStory> = {
  bachi: {
    no: "01",
    portion: "100g",
    jaFull: "牛バラ（三枚肉）",
    posShort: "三枚肉",
    pos: "Bụng dưới, giữa sườn và da",
    flavours: ["Vân mỡ đan dày, tan ngay trên than", "Ngọt mỡ, đậm vị bò", "Cạnh xém giòn, giữa vẫn mọng", "Hợp cơm trắng và bia lạnh"],
    cuts: [
      { name: "Lát mỏng", size: "15–18 lát", desc: "Chín trong vài giây, mỡ tan hết, thơm nhẹ.", soft: 4 },
      { name: "Lát vừa", size: "8–12 lát", desc: "Cân bằng độ mọng và cạnh giòn.", soft: 3 },
      { name: "Lát dày", size: "4–6 lát", desc: "Cắn ngập miếng, vị ngọt mỡ rõ nhất.", soft: 2 },
    ],
    fire: "Nướng 20–30 giây mỗi mặt trên than hồng",
    dip: "Chấm Tare hoặc muối tiêu chanh khi còn nóng",
    note: "Mỡ nhỏ xuống dễ bùng lửa — nướng ở mép vỉ và gắp ra ngay khi cạnh vừa xém.",
    craft: "Sơ chế kỹ lưỡng · Thái máy chuyên dụng · Giữ lạnh 0–2°C tới khi lên bàn",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Thanh nhẹ, tôn vị ngọt của mỡ" },
      { kanji: "垂", name: "Sốt Tare", desc: "Đậm đà, thơm ngọt, đậm chất Nhật" },
      { kanji: "山", name: "Wasabi", desc: "Cay nhẹ, cắt bớt độ béo" },
      { kanji: "葱", name: "Negi shio dare", desc: "Hành lá, muối, dầu mè — hợp lát mỏng" },
    ],
  },
  luoibo: {
    no: "02",
    portion: "100g",
    jaFull: "牛たん（外側）",
    posShort: "外側",
    pos: "Phần ngoài của lưỡi bò",
    flavours: ["Đậm vị bò tự nhiên", "Ngọt thịt, săn chắc", "Càng nhai càng thơm", "Phù hợp khẩu vị người Việt"],
    cuts: [
      { name: "Lát mỏng", size: "15–18 lát", desc: "Mềm, dễ ăn, thơm nhẹ. Hợp người mới thưởng thức.", soft: 4 },
      { name: "Lát vừa", size: "5–10 lát", desc: "Cân bằng giữa độ mềm và độ săn chắc. Hương vị hài hoà.", soft: 3 },
      { name: "Lát dày", size: "3–5 lát", desc: "Săn chắc, đậm vị — cho ai thích cảm nhận rõ kết cấu.", soft: 2 },
    ],
    fire: "Nướng khoảng 20–30 giây mỗi mặt trên bếp than",
    dip: "Chấm muối tiêu, vắt vài giọt chanh — hoặc sốt Tare Nhật Bản",
    note: "Lưỡi bò ngon nhất ngay khi rời vỉ. Để nguội — nhất là lát dày — thịt sẽ săn và dai hơn.",
    craft: "Sơ chế kỹ lưỡng · Cấp đông chuẩn nhiệt độ · Thái máy chuyên dụng · Giữ trọn độ tươi từng lát",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Vị thanh nhẹ, tôn lên vị ngọt tự nhiên của thịt" },
      { kanji: "垂", name: "Sốt Tare", desc: "Đậm đà, thơm ngọt, đậm chất Nhật" },
      { kanji: "山", name: "Wasabi", desc: "Cay nhẹ, kích thích vị giác, hợp với lát mỏng" },
      { kanji: "葱", name: "Negi shio dare", desc: "Hành lá, muối & dầu mè, thơm nhẹ, rất hợp với lưỡi bò" },
    ],
  },
  nambo: {
    no: "03",
    portion: "100g",
    jaFull: "ハラミ（横隔膜）",
    posShort: "横隔膜",
    pos: "Cơ hoành, sát vách bụng",
    flavours: ["Thớ dày, giữ nước tốt", "Vị bò đậm, hậu ngọt dài", "Mềm nhưng có độ nhai", "Đối trọng đẹp với Tare đậm"],
    cuts: [
      { name: "Lát mỏng", size: "12–15 lát", desc: "Nhanh chín, thơm dịu, dễ ăn.", soft: 4 },
      { name: "Lát vừa", size: "8–10 lát", desc: "Giữ nước tốt nhất, mọng ở giữa.", soft: 3 },
      { name: "Lát dày", size: "4–5 lát", desc: "Đậm vị nhất, cần lửa đều tay.", soft: 2 },
    ],
    fire: "Nướng 40–50 giây mỗi mặt, lửa vừa",
    dip: "Tare đậm, hoặc muối tiêu chanh nếu thích thanh",
    note: "Không ép miếng thịt xuống vỉ — nước ngọt chảy mất, thịt khô nhanh.",
    craft: "Lọc màng kỹ · Ướp muối koji 4 giờ · Thái ngang thớ",
    conds: [
      { kanji: "垂", name: "Sốt Tare", desc: "Đậm đà, bám thớ dày rất hợp" },
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Thanh nhẹ, đổi vị giữa bữa" },
      { kanji: "山", name: "Wasabi", desc: "Cay nhẹ, kích thích vị giác" },
      { kanji: "葱", name: "Negi shio dare", desc: "Hành muối dầu mè, dậy mùi than" },
    ],
  },
  thanbo: {
    no: "04",
    portion: "100g",
    jaFull: "ヒレ（内側）",
    posShort: "内側",
    pos: "Thăn nội, dọc sống lưng — phần ít vận động nhất",
    flavours: ["Mềm gần như tan", "Ít mỡ, vị thanh", "Ngọt thịt tinh tế", "Sinh ra cho lửa nhẹ và muối trắng"],
    cuts: [
      { name: "Lát mỏng", size: "10–12 lát", desc: "Áp than 10–15 giây là đủ.", soft: 4 },
      { name: "Lát vừa", size: "6–8 lát", desc: "Giữ hồng ở tâm, mềm mượt.", soft: 4 },
      { name: "Khối dày", size: "3–4 khối", desc: "Áp bốn mặt, nghỉ một phút rồi cắt.", soft: 3 },
    ],
    fire: "Áp mỗi mặt 15–20 giây, giữ tâm hồng",
    dip: "Chỉ muối trắng Okinawa, thêm wasabi nếu thích",
    note: "Thăn nội không có mỡ đỡ — quá 30 giây mỗi mặt là khô, mất hết vị.",
    craft: "Cắt khối chuẩn 100g · Không ướp — giữ vị nguyên bản",
    conds: [
      { kanji: "塩", name: "Muối Okinawa", desc: "Đơn giản nhất, tôn vị ngọt thịt" },
      { kanji: "山", name: "Wasabi tươi", desc: "Mài tại bàn, thơm cay dịu" },
      { kanji: "柚", name: "Yuzu kosho", desc: "Cay thơm vỏ quýt, rất hợp thịt nạc" },
      { kanji: "垂", name: "Tare nhạt", desc: "Chỉ chấm nhẹ, không ngâm" },
    ],
  },
  misuji: {
    no: "05",
    portion: "100g",
    jaFull: "ミスジ（肩)",
    posShort: "肩",
    pos: "Giữa lá vai — mỗi con bò chỉ cho khoảng 2kg",
    flavours: ["Vân cẩm thạch hiếm", "Béo và mềm cân bằng", "Gân tơ giữa miếng tạo độ giòn", "Phần quý, số lượng giới hạn mỗi ngày"],
    cuts: [
      { name: "Lát mỏng", size: "12–14 lát", desc: "Tan nhanh, béo nhẹ lan đều.", soft: 4 },
      { name: "Lát vừa", size: "7–9 lát", desc: "Cảm nhận rõ gân tơ giòn.", soft: 3 },
      { name: "Lát dày", size: "4–5 lát", desc: "Đậm, cần nhai — cho người sành.", soft: 2 },
    ],
    fire: "Nướng 25–35 giây mỗi mặt",
    dip: "Muối tiêu chanh để giữ vị béo thanh",
    note: "Là phần hiếm — mỗi chi nhánh chỉ có giới hạn trong ngày, hết là hết.",
    craft: "Tuyển từ vai bò Wagyu lai · Thái máy giữ vân nguyên vẹn",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Giữ vị béo thanh, không lấn" },
      { kanji: "山", name: "Wasabi", desc: "Cắt béo, nâng hậu vị" },
      { kanji: "垂", name: "Sốt Tare", desc: "Cho ai thích đậm kiểu Kansai" },
      { kanji: "葱", name: "Negi shio dare", desc: "Hành muối mát, hợp lát mỏng" },
    ],
  },
  carbi: {
    no: "07",
    portion: "100g",
    jaFull: "カルビ（骨なし）",
    posShort: "肋",
    pos: "Sườn non tách xương, phần bụng sườn",
    flavours: ["Mỡ giắt đều, ngọt đậm", "Ướp tương Sora hai giờ", "Cháy cạnh thơm mật", "Món ai cũng gọi lần đầu"],
    cuts: [
      { name: "Lát mỏng", size: "12–14 lát", desc: "Tương bám nhanh, cạnh caramel hoá chỉ sau vài giây.", soft: 4 },
      { name: "Lát vừa", size: "7–9 lát", desc: "Mọng nhất, cân giữa vị tương và vị thịt.", soft: 3 },
      { name: "Miếng vuông", size: "5–6 miếng", desc: "Cắn ngập, hợp cuốn rau xà lách.", soft: 2 },
    ],
    fire: "Nướng 30–40 giây mỗi mặt, lửa vừa vì thịt đã ướp",
    dip: "Ăn trần hoặc cuốn xà lách với tỏi nướng",
    note: "Thịt đã ướp tương nên rất dễ cháy — trở sớm một nhịp so với thịt trắng.",
    craft: "Tách xương thủ công · Ướp tương Sora 2 giờ · Ra bàn trong ngày",
    conds: [
      { kanji: "垂", name: "Sốt Tare", desc: "Đậm thêm một tầng, kiểu Kansai" },
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Cắt ngọt tương, làm nhẹ miệng" },
      { kanji: "蒜", name: "Tỏi nướng", desc: "Nướng chung, cuốn cùng lá xà lách" },
      { kanji: "七", name: "Shichimi", desc: "Cay ấm bảy vị, rắc lúc vừa chín" },
    ],
  },
  sagari: {
    no: "08",
    portion: "100g",
    jaFull: "サガリ（腹側）",
    posShort: "横隔膜",
    pos: "Cơ hoành phần bụng, cạnh nầm",
    flavours: ["Thớ ngắn, dễ nhai", "Rìa giòn khi cháy cạnh", "Vị bò rõ, ít mỡ", "Ăn hoài không ngán"],
    cuts: [
      { name: "Lát mỏng", size: "14–16 lát", desc: "Rìa giòn nhanh, thơm mùi than rõ nhất.", soft: 4 },
      { name: "Lát vừa", size: "8–10 lát", desc: "Giòn ngoài mềm trong, cân bằng nhất.", soft: 3 },
      { name: "Lát dày", size: "5–6 lát", desc: "Nhai kỹ mới ra hết vị — dành cho người thích thớ.", soft: 2 },
    ],
    fire: "Nướng 25–35 giây mỗi mặt, để rìa hơi xém",
    dip: "Muối tiêu chanh, thêm chút wasabi tươi",
    note: "Cháy cạnh là ngon, cháy đen là đắng — canh lúc rìa vừa ngả nâu vàng.",
    craft: "Lọc gân kỹ · Không ướp · Thái ngang thớ dày đều",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Tôn phần rìa giòn và vị bò" },
      { kanji: "山", name: "Wasabi", desc: "Cay dịu, nâng hậu vị" },
      { kanji: "垂", name: "Sốt Tare", desc: "Cho ai thích đậm đà" },
      { kanji: "葱", name: "Negi shio dare", desc: "Hành muối mát, ăn xen giữa bữa" },
    ],
  },
  bachiheo: {
    no: "09",
    portion: "100g",
    jaFull: "豚バラ（三枚肉）",
    posShort: "三枚肉",
    pos: "Ba chỉ heo, phần bụng nhiều lớp",
    flavours: ["Nạc mỡ xen ba lớp", "Cạnh giòn, mỡ trong", "Ngọt hậu, thơm mùi than", "Hợp kim chi và cơm trắng"],
    cuts: [
      { name: "Lát mỏng", size: "12–14 lát", desc: "Giòn rụm quanh viền, ăn nhanh khi còn nóng.", soft: 4 },
      { name: "Lát vừa", size: "8–10 lát", desc: "Ngoài giòn trong mềm — kiểu phổ biến nhất.", soft: 3 },
      { name: "Lát dày", size: "5–6 lát", desc: "Mỡ tan chậm, béo đầy đặn.", soft: 2 },
    ],
    fire: "Nướng 60–90 giây mỗi mặt tới khi mỡ trong",
    dip: "Muối tiêu chanh, kèm kim chi hoặc tỏi nướng",
    note: "Heo phải chín kỹ hơn bò — chờ mỡ chuyển trong hẳn rồi mới gắp.",
    craft: "Heo tươi trong ngày · Thái lát đều 3mm · Không ướp trước",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Cân vị béo, làm sáng miếng thịt" },
      { kanji: "蒜", name: "Tỏi nướng", desc: "Nướng cùng, ăn kèm từng lát" },
      { kanji: "垂", name: "Sốt Tare", desc: "Đậm ngọt, hợp cơm trắng" },
      { kanji: "七", name: "Shichimi", desc: "Cay nhẹ, khử ngấy" },
    ],
  },
  suonheo: {
    no: "10",
    portion: "120g",
    jaFull: "豚ロース味噌漬け",
    posShort: "ロース",
    pos: "Sườn heo phần thăn, ướp miso đỏ",
    flavours: ["Miso đỏ ướp hai ngày", "Mặn ngọt hài hoà", "Thơm mùi đậu lên men", "Ăn với cơm là hết bát"],
    cuts: [
      { name: "Lát mỏng", size: "8–10 lát", desc: "Miso bám đều, chín rất nhanh.", soft: 4 },
      { name: "Lát vừa", size: "5–7 lát", desc: "Giữ được nước thịt, vị miso vừa phải.", soft: 3 },
      { name: "Miếng dày", size: "3–4 miếng", desc: "Ngoài đậm trong ngọt, cần lửa nhỏ.", soft: 2 },
    ],
    fire: "Lửa nhỏ, 60–80 giây mỗi mặt để miso không cháy",
    dip: "Không cần chấm — ăn kèm dưa muối và cơm",
    note: "Miso cháy sẽ đắng gắt. Nướng ở vùng lửa yếu và trở đều tay.",
    craft: "Ướp miso đỏ 48 giờ · Gạt bớt miso trước khi nướng · Thái theo thớ",
    conds: [
      { kanji: "漬", name: "Dưa muối", desc: "Chua giòn, cắt vị mặn của miso" },
      { kanji: "飯", name: "Cơm trắng", desc: "Bạn đồng hành đúng nghĩa" },
      { kanji: "塩", name: "Muối chanh", desc: "Chỉ vắt nhẹ nếu thấy đậm" },
      { kanji: "七", name: "Shichimi", desc: "Cay ấm, rắc mỏng lúc cuối" },
    ],
  },
  tomsu: {
    no: "11",
    portion: "3 con",
    jaFull: "海老の塩焼き",
    posShort: "塩焼",
    pos: "Tôm sú nguyên vỏ, cỡ 20–25 con/kg",
    flavours: ["Nướng nguyên vỏ giữ nước", "Ngọt biển đậm", "Vỏ thơm giòn, gạch béo", "Bóc nóng ăn ngay"],
    cuts: [
      { name: "Nguyên con", size: "3 con", desc: "Giữ trọn nước và gạch trong đầu.", soft: 3 },
      { name: "Xẻ lưng", size: "3 con", desc: "Chín đều hơn, dễ rút chỉ và dễ bóc.", soft: 3 },
      { name: "Xẻ đôi", size: "6 nửa", desc: "Thấm bơ tỏi nhanh, hợp ăn chia.", soft: 4 },
    ],
    fire: "Nướng 90–120 giây mỗi mặt tới khi vỏ đỏ cam",
    dip: "Muối biển và chanh, hoặc bơ tỏi phút cuối",
    note: "Đừng nướng quá tay — thịt tôm quá lửa sẽ bở và mất vị ngọt.",
    craft: "Tôm sống về mỗi sáng · Rửa nước muối lạnh · Rút chỉ trước khi ra bàn",
    conds: [
      { kanji: "塩", name: "Muối chanh", desc: "Đơn giản nhất, tôn vị ngọt biển" },
      { kanji: "蒜", name: "Bơ tỏi", desc: "Béo thơm, quét lúc gần chín" },
      { kanji: "酢", name: "Ponzu", desc: "Chua nhẹ, ăn thanh" },
      { kanji: "七", name: "Shichimi", desc: "Cay ấm, rắc lên gạch tôm" },
    ],
  },
  muctrung: {
    no: "12",
    portion: "1 con",
    jaFull: "イカの姿焼き",
    posShort: "姿焼",
    pos: "Mực trứng nguyên con, cỡ vừa",
    flavours: ["Giòn sần sật", "Trứng mực bùi béo", "Ngọt hậu, ít tanh", "Nướng xong cắt khoanh nóng"],
    cuts: [
      { name: "Nguyên con", size: "1 con", desc: "Giữ trứng và nước ngọt bên trong.", soft: 3 },
      { name: "Cắt khoanh", size: "8–10 khoanh", desc: "Chín nhanh, dễ chia phần.", soft: 4 },
      { name: "Xẻ dọc", size: "2 mảnh", desc: "Áp than đều hai mặt, mép cong đẹp.", soft: 3 },
    ],
    fire: "Nướng 2–3 phút mỗi mặt, lửa vừa",
    dip: "Tương gừng, hoặc muối chanh nếu thích thanh",
    note: "Quá lửa mực sẽ dai như cao su — thấy thân se lại và ngả đục là gắp.",
    craft: "Mực trứng cấp đông trên tàu · Rã chậm qua đêm · Làm sạch giữ nguyên túi trứng",
    conds: [
      { kanji: "姜", name: "Tương gừng", desc: "Ấm bụng, khử tanh" },
      { kanji: "塩", name: "Muối chanh", desc: "Thanh nhẹ, giữ vị biển" },
      { kanji: "酢", name: "Ponzu", desc: "Chua dịu, ăn kèm hành lá" },
      { kanji: "七", name: "Shichimi", desc: "Cay nhẹ cho khoanh dày" },
    ],
  },
  namdui: {
    no: "13",
    portion: "2 cây",
    jaFull: "エリンギのバター焼き",
    posShort: "バター焼",
    pos: "Nấm đùi gà, thân dày chắc",
    flavours: ["Xé sợi theo thớ", "Dai ngọt như thịt", "Bơ tỏi quét phút cuối", "Món chay được gọi nhiều nhất"],
    cuts: [
      { name: "Xé sợi", size: "10–12 sợi", desc: "Thớ hút bơ, mép sợi cháy thơm.", soft: 4 },
      { name: "Cắt khoanh", size: "8 khoanh", desc: "Mọng nước, giữ hình đẹp trên vỉ.", soft: 3 },
      { name: "Xẻ dọc", size: "4 miếng", desc: "Dày dặn, ăn như một miếng thịt.", soft: 2 },
    ],
    fire: "Nướng 90 giây mỗi mặt, quét bơ ở phút cuối",
    dip: "Muối tiêu chanh, hoặc chấm tương nhạt",
    note: "Quét bơ sớm sẽ khét — chỉ quét khi nấm đã se mặt và ngả vàng.",
    craft: "Nấm Đà Lạt về mỗi sáng · Không rửa nước, lau khô · Xé tay giữ thớ",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Làm bật vị ngọt của nấm" },
      { kanji: "蒜", name: "Bơ tỏi", desc: "Béo thơm, chuẩn kiểu izakaya" },
      { kanji: "垂", name: "Tare nhạt", desc: "Chấm nhẹ, không lấn vị nấm" },
      { kanji: "七", name: "Shichimi", desc: "Cay ấm, hợp món chay" },
    ],
  },
  bingoi: {
    no: "14",
    portion: "1 phần",
    jaFull: "焼き野菜盛り合わせ",
    posShort: "季節",
    pos: "Rau củ theo mùa, chọn trong ngày",
    flavours: ["Ngọt nước tự nhiên", "Hút mỡ bò trên vỉ", "Giòn nhẹ, ăn nghỉ miệng", "Cân lại cả bữa nướng"],
    cuts: [
      { name: "Lát mỏng", size: "10–12 lát", desc: "Chín nhanh, mép hơi cháy ngọt.", soft: 4 },
      { name: "Lát vừa", size: "6–8 lát", desc: "Ngoài xém trong còn giòn.", soft: 3 },
      { name: "Miếng dày", size: "4–5 miếng", desc: "Mọng nước, ngọt đậm hơn.", soft: 2 },
    ],
    fire: "Nướng 2 phút mỗi mặt ở vùng lửa nhẹ của vỉ",
    dip: "Muối tiêu chanh, hoặc chấm tare còn lại",
    note: "Đặt rau ở mép vỉ nơi lửa yếu, để chỗ giữa dành cho thịt.",
    craft: "Rau theo mùa · Sơ chế trong ngày · Cắt dày đều để chín cùng nhịp",
    conds: [
      { kanji: "塩", name: "Muối tiêu chanh", desc: "Đơn giản, tôn vị ngọt rau" },
      { kanji: "垂", name: "Sốt Tare", desc: "Chấm nhẹ khi ăn cùng thịt" },
      { kanji: "味", name: "Miso mè", desc: "Bùi béo, hợp bí ngòi" },
      { kanji: "七", name: "Shichimi", desc: "Cay ấm, đổi vị" },
    ],
  },
  sodiep: {
    no: "06",
    portion: "3 cồi",
    jaFull: "ホタテ（3L）",
    posShort: "貝柱",
    pos: "Cồi sò điệp Hokkaido, size 3L",
    flavours: ["Cồi 3L dày mình", "Ngọt biển đậm, hậu bơ", "Nướng trên vỏ giữ trọn nước", "Chín tới 70% là điểm ngon nhất"],
    cuts: [
      { name: "Nguyên cồi", size: "1 cồi", desc: "Trọn vị, mọng nước nhất.", soft: 3 },
      { name: "Xẻ đôi", size: "2 nửa", desc: "Chín đều, dễ thấm bơ tỏi.", soft: 3 },
      { name: "Thái lát", size: "4–5 lát", desc: "Gần như sashimi, chỉ áp nhẹ.", soft: 4 },
    ],
    fire: "Nướng trên vỏ 60–90 giây, không lật sớm",
    dip: "Bơ tỏi phút cuối, hoặc ponzu lạnh",
    note: "Đừng chờ chín hẳn — sò điệp ngon nhất khi tâm còn hơi trong.",
    craft: "Bay từ Hokkaido mỗi tuần · Cấp đông -35°C · Rã chậm 12 giờ",
    conds: [
      { kanji: "蒜", name: "Bơ tỏi", desc: "Béo thơm, dậy mùi than" },
      { kanji: "酢", name: "Ponzu", desc: "Chua nhẹ, nhấn vị biển" },
      { kanji: "塩", name: "Muối chanh", desc: "Đơn giản, tôn vị ngọt" },
      { kanji: "七", name: "Shichimi", desc: "Cay ấm bảy vị, rắc phút cuối" },
    ],
  },
}

export interface SetStory {
  no: string
  people: string
  duration: string
  jaFull: string
  servings: string
  intro: string
  /** Bữa diễn ra theo thứ tự nào — set nấu theo nhịp, mang từng chặng */
  flow: string[]
  note: string
  craft: string
  /** Mã món gợi ý gọi thêm */
  extra: string[]
}

export const SET_STORIES: Record<string, SetStory> = {
  sora: {
    no: "I",
    people: "2 người",
    duration: "90 phút",
    jaFull: "空膳（そらぜん）",
    servings: "8 món",
    intro: "Bữa nhỏ vừa đủ cho hai người: ba phần bò khác thớ để so vị, một hải sản, rau nướng hút mỡ, canh và cơm chốt bữa. Bếp cân lượng sẵn nên không ai phải gọi thêm giữa chừng.",
    flow: [
      "Dưa muối lên trước khi than đỏ — ăn nhẹ trong lúc chờ",
      "Bò theo thứ tự ba chỉ → nầm → sườn non, nạc trước mỡ sau",
      "Tôm và rau nướng ở mép vỉ, ăn xen giữa các lượt bò",
      "Canh miso và cơm khi than đã dịu, kem trà xanh khép bữa",
    ],
    note: "Set nấu theo nhịp — nhân viên mang từng chặng chứ không dọn hết một lượt. Báo trước nếu bạn muốn ăn nhanh.",
    craft: "Cân lượng theo hai người · Thịt thái trong ngày · Đổi vỉ khi chuyển chặng",
    extra: ["thanbo", "sodiep", "asahi"],
  },
  sumi: {
    no: "II",
    people: "3–4 người",
    duration: "120 phút",
    jaFull: "炭膳（すみぜん）",
    servings: "12 món",
    intro: "Bản đầy đặn cho nhóm ba đến bốn: bốn phần bò gồm cả thăn nội, hai hải sản và hai món rau. Than được thay giữa bữa để lửa luôn đều từ miếng đầu tới miếng cuối.",
    flow: [
      "Bò tái chanh và dưa muối mở bữa khi than vừa đỏ",
      "Ba chỉ và nầm trước, để dành thăn nội cho giữa bữa",
      "Nhân viên thay than trước chặng hải sản",
      "Rau nướng, canh và cơm khép lại trước tráng miệng",
    ],
    note: "Thăn nội chỉ nướng 15–20 giây mỗi mặt. Nếu nhóm ăn chậm, báo nhân viên để bếp giữ thịt lạnh thêm.",
    craft: "Đổi than giữa bữa · Bốn phần bò khác thớ · Cân lượng theo nhóm 3–4",
    extra: ["misuji", "sukiyaki", "junmai"],
  },
  kiwami: {
    no: "III",
    people: "4–6 người",
    duration: "150 phút",
    jaFull: "極膳（きわみぜん）",
    servings: "16 món",
    intro: "Bản đầy đủ nhất, phục vụ trong phòng riêng. Sáu phần bò trong đó có lõi vai và dẻ sườn — những phần mỗi con bò chỉ cho vài kilogram. Bếp trưởng chọn thịt theo lô nhập trong ngày.",
    flow: [
      "Ba món lạnh mở bữa cùng trà nóng trong phòng riêng",
      "Bò lên theo bốn lượt, nạc trước mỡ sau, lõi vai ở lượt ba",
      "Sò điệp và mực nướng trên vỏ giữa hai lượt bò",
      "Canh đuôi bò hầm sáu giờ và cơm nóng khép bữa",
    ],
    note: "Cần đặt trước ít nhất 4 giờ để bếp chuẩn bị phần thịt hiếm. Phòng riêng giữ tối đa sáu người.",
    craft: "Bếp trưởng chọn theo lô nhập · Phần thịt hiếm giới hạn mỗi ngày · Phục vụ phòng riêng",
    extra: ["sukiyaki", "junmai", "hojicha"],
  },
}
