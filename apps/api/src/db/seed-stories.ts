import type { DishStoryInput } from '../modules/admin/catalog-admin.service'

/**
 * Nội dung trang chi tiết món (W3) cho bộ dữ liệu mẫu.
 *
 * Trước bản này chỗ đó nằm cứng trong `apps/web/content/stories.ts`, sửa một chữ
 * phải build lại web. Chuyển vào đây thì seed dựng lại đúng nội dung cũ, còn từ
 * giờ người nhập sửa ở Office M1 · Món và set — CSDL là nguồn duy nhất.
 *
 * Chỉ món chủ lực và ba set lớn có mặt ở đây. Món còn lại không có bản ghi và
 * trang web dựng bản gọn từ tên, giá, mô tả — đó là hành vi mong muốn, không
 * phải dữ liệu thiếu.
 */
export const DISH_STORIES: (DishStoryInput & { dishId: string })[] = [
  {
    "dishId": "bachi",
    "chapterNo": "01",
    "portionLabel": "100g",
    "nameJaFull": "牛バラ（三枚肉）",
    "intro": null,
    "note": "Mỡ nhỏ xuống dễ bùng lửa — nướng ở mép vỉ và gắp ra ngay khi cạnh vừa xém.",
    "craft": "Sơ chế kỹ lưỡng · Thái máy chuyên dụng · Giữ lạnh 0–2°C tới khi lên bàn",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "duamuoi",
      "asahi",
      "milanh"
    ],
    "origin": "Bụng dưới, giữa sườn và da",
    "originKanji": "三枚肉",
    "originImageUrl": null,
    "flavours": [
      "Vân mỡ đan dày, tan ngay trên than",
      "Ngọt mỡ, đậm vị bò",
      "Cạnh xém giòn, giữa vẫn mọng",
      "Hợp cơm trắng và bia lạnh"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "15–18 lát",
        "desc": "Chín trong vài giây, mỡ tan hết, thơm nhẹ.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "8–12 lát",
        "desc": "Cân bằng độ mọng và cạnh giòn.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Lát dày",
        "size": "4–6 lát",
        "desc": "Cắn ngập miếng, vị ngọt mỡ rõ nhất.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 20–30 giây mỗi mặt trên than hồng",
    "fireImageUrl": null,
    "dip": "Chấm Tare hoặc muối tiêu chanh khi còn nóng",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Thanh nhẹ, tôn vị ngọt của mỡ"
      },
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Đậm đà, thơm ngọt, đậm chất Nhật"
      },
      {
        "kanji": "山",
        "name": "Wasabi",
        "desc": "Cay nhẹ, cắt bớt độ béo"
      },
      {
        "kanji": "葱",
        "name": "Negi shio dare",
        "desc": "Hành lá, muối, dầu mè — hợp lát mỏng"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "luoibo",
    "chapterNo": "02",
    "portionLabel": "100g",
    "nameJaFull": "牛たん（外側）",
    "intro": null,
    "note": "Lưỡi bò ngon nhất ngay khi rời vỉ. Để nguội — nhất là lát dày — thịt sẽ săn và dai hơn.",
    "craft": "Sơ chế kỹ lưỡng · Cấp đông chuẩn nhiệt độ · Thái máy chuyên dụng · Giữ trọn độ tươi từng lát",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": null,
    "origin": "Phần ngoài của lưỡi bò",
    "originKanji": "外側",
    "originImageUrl": null,
    "flavours": [
      "Đậm vị bò tự nhiên",
      "Ngọt thịt, săn chắc",
      "Càng nhai càng thơm",
      "Phù hợp khẩu vị người Việt"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "15–18 lát",
        "desc": "Mềm, dễ ăn, thơm nhẹ. Hợp người mới thưởng thức.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "5–10 lát",
        "desc": "Cân bằng giữa độ mềm và độ săn chắc. Hương vị hài hoà.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Lát dày",
        "size": "3–5 lát",
        "desc": "Săn chắc, đậm vị — cho ai thích cảm nhận rõ kết cấu.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng khoảng 20–30 giây mỗi mặt trên bếp than",
    "fireImageUrl": null,
    "dip": "Chấm muối tiêu, vắt vài giọt chanh — hoặc sốt Tare Nhật Bản",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Vị thanh nhẹ, tôn lên vị ngọt tự nhiên của thịt"
      },
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Đậm đà, thơm ngọt, đậm chất Nhật"
      },
      {
        "kanji": "山",
        "name": "Wasabi",
        "desc": "Cay nhẹ, kích thích vị giác, hợp với lát mỏng"
      },
      {
        "kanji": "葱",
        "name": "Negi shio dare",
        "desc": "Hành lá, muối & dầu mè, thơm nhẹ, rất hợp với lưỡi bò"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "nambo",
    "chapterNo": "03",
    "portionLabel": "100g",
    "nameJaFull": "ハラミ（横隔膜）",
    "intro": null,
    "note": "Không ép miếng thịt xuống vỉ — nước ngọt chảy mất, thịt khô nhanh.",
    "craft": "Lọc màng kỹ · Ướp muối koji 4 giờ · Thái ngang thớ",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "bingoi",
      "muchacha",
      "miso"
    ],
    "origin": "Cơ hoành, sát vách bụng",
    "originKanji": "横隔膜",
    "originImageUrl": null,
    "flavours": [
      "Thớ dày, giữ nước tốt",
      "Vị bò đậm, hậu ngọt dài",
      "Mềm nhưng có độ nhai",
      "Đối trọng đẹp với Tare đậm"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "12–15 lát",
        "desc": "Nhanh chín, thơm dịu, dễ ăn.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "8–10 lát",
        "desc": "Giữ nước tốt nhất, mọng ở giữa.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Lát dày",
        "size": "4–5 lát",
        "desc": "Đậm vị nhất, cần lửa đều tay.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 40–50 giây mỗi mặt, lửa vừa",
    "fireImageUrl": null,
    "dip": "Tare đậm, hoặc muối tiêu chanh nếu thích thanh",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Đậm đà, bám thớ dày rất hợp"
      },
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Thanh nhẹ, đổi vị giữa bữa"
      },
      {
        "kanji": "山",
        "name": "Wasabi",
        "desc": "Cay nhẹ, kích thích vị giác"
      },
      {
        "kanji": "葱",
        "name": "Negi shio dare",
        "desc": "Hành muối dầu mè, dậy mùi than"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "thanbo",
    "chapterNo": "04",
    "portionLabel": "100g",
    "nameJaFull": "ヒレ（内側）",
    "intro": null,
    "note": "Thăn nội không có mỡ đỡ — quá 30 giây mỗi mặt là khô, mất hết vị.",
    "craft": "Cắt khối chuẩn 100g · Không ướp — giữ vị nguyên bản",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "junmai",
      "namdui",
      "duoibo"
    ],
    "origin": "Thăn nội, dọc sống lưng — phần ít vận động nhất",
    "originKanji": "内側",
    "originImageUrl": null,
    "flavours": [
      "Mềm gần như tan",
      "Ít mỡ, vị thanh",
      "Ngọt thịt tinh tế",
      "Sinh ra cho lửa nhẹ và muối trắng"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "10–12 lát",
        "desc": "Áp than 10–15 giây là đủ.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "6–8 lát",
        "desc": "Giữ hồng ở tâm, mềm mượt.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Khối dày",
        "size": "3–4 khối",
        "desc": "Áp bốn mặt, nghỉ một phút rồi cắt.",
        "soft": 3,
        "imageUrl": null
      }
    ],
    "fire": "Áp mỗi mặt 15–20 giây, giữ tâm hồng",
    "fireImageUrl": null,
    "dip": "Chỉ muối trắng Okinawa, thêm wasabi nếu thích",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối Okinawa",
        "desc": "Đơn giản nhất, tôn vị ngọt thịt"
      },
      {
        "kanji": "山",
        "name": "Wasabi tươi",
        "desc": "Mài tại bàn, thơm cay dịu"
      },
      {
        "kanji": "柚",
        "name": "Yuzu kosho",
        "desc": "Cay thơm vỏ quýt, rất hợp thịt nạc"
      },
      {
        "kanji": "垂",
        "name": "Tare nhạt",
        "desc": "Chỉ chấm nhẹ, không ngâm"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "misuji",
    "chapterNo": "05",
    "portionLabel": "100g",
    "nameJaFull": "ミスジ（肩)",
    "intro": null,
    "note": "Là phần hiếm — mỗi chi nhánh chỉ có giới hạn trong ngày, hết là hết.",
    "craft": "Tuyển từ vai bò Wagyu lai · Thái máy giữ vân nguyên vẹn",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "junmai",
      "duamuoi",
      "miso"
    ],
    "origin": "Giữa lá vai — mỗi con bò chỉ cho khoảng 2kg",
    "originKanji": "肩",
    "originImageUrl": null,
    "flavours": [
      "Vân cẩm thạch hiếm",
      "Béo và mềm cân bằng",
      "Gân tơ giữa miếng tạo độ giòn",
      "Phần quý, số lượng giới hạn mỗi ngày"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "12–14 lát",
        "desc": "Tan nhanh, béo nhẹ lan đều.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "7–9 lát",
        "desc": "Cảm nhận rõ gân tơ giòn.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Lát dày",
        "size": "4–5 lát",
        "desc": "Đậm, cần nhai — cho người sành.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 25–35 giây mỗi mặt",
    "fireImageUrl": null,
    "dip": "Muối tiêu chanh để giữ vị béo thanh",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Giữ vị béo thanh, không lấn"
      },
      {
        "kanji": "山",
        "name": "Wasabi",
        "desc": "Cắt béo, nâng hậu vị"
      },
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Cho ai thích đậm kiểu Kansai"
      },
      {
        "kanji": "葱",
        "name": "Negi shio dare",
        "desc": "Hành muối mát, hợp lát mỏng"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "carbi",
    "chapterNo": "07",
    "portionLabel": "100g",
    "nameJaFull": "カルビ（骨なし）",
    "intro": null,
    "note": "Thịt đã ướp tương nên rất dễ cháy — trở sớm một nhịp so với thịt trắng.",
    "craft": "Tách xương thủ công · Ướp tương Sora 2 giờ · Ra bàn trong ngày",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "duamuoi",
      "asahi",
      "namdui"
    ],
    "origin": "Sườn non tách xương, phần bụng sườn",
    "originKanji": "肋",
    "originImageUrl": null,
    "flavours": [
      "Mỡ giắt đều, ngọt đậm",
      "Ướp tương Sora hai giờ",
      "Cháy cạnh thơm mật",
      "Món ai cũng gọi lần đầu"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "12–14 lát",
        "desc": "Tương bám nhanh, cạnh caramel hoá chỉ sau vài giây.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "7–9 lát",
        "desc": "Mọng nhất, cân giữa vị tương và vị thịt.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Miếng vuông",
        "size": "5–6 miếng",
        "desc": "Cắn ngập, hợp cuốn rau xà lách.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 30–40 giây mỗi mặt, lửa vừa vì thịt đã ướp",
    "fireImageUrl": null,
    "dip": "Ăn trần hoặc cuốn xà lách với tỏi nướng",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Đậm thêm một tầng, kiểu Kansai"
      },
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Cắt ngọt tương, làm nhẹ miệng"
      },
      {
        "kanji": "蒜",
        "name": "Tỏi nướng",
        "desc": "Nướng chung, cuốn cùng lá xà lách"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay ấm bảy vị, rắc lúc vừa chín"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "sagari",
    "chapterNo": "08",
    "portionLabel": "100g",
    "nameJaFull": "サガリ（腹側）",
    "intro": null,
    "note": "Cháy cạnh là ngon, cháy đen là đắng — canh lúc rìa vừa ngả nâu vàng.",
    "craft": "Lọc gân kỹ · Không ướp · Thái ngang thớ dày đều",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "bingoi",
      "asahi",
      "miso"
    ],
    "origin": "Cơ hoành phần bụng, cạnh nầm",
    "originKanji": "横隔膜",
    "originImageUrl": null,
    "flavours": [
      "Thớ ngắn, dễ nhai",
      "Rìa giòn khi cháy cạnh",
      "Vị bò rõ, ít mỡ",
      "Ăn hoài không ngán"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "14–16 lát",
        "desc": "Rìa giòn nhanh, thơm mùi than rõ nhất.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "8–10 lát",
        "desc": "Giòn ngoài mềm trong, cân bằng nhất.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Lát dày",
        "size": "5–6 lát",
        "desc": "Nhai kỹ mới ra hết vị — dành cho người thích thớ.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 25–35 giây mỗi mặt, để rìa hơi xém",
    "fireImageUrl": null,
    "dip": "Muối tiêu chanh, thêm chút wasabi tươi",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Tôn phần rìa giòn và vị bò"
      },
      {
        "kanji": "山",
        "name": "Wasabi",
        "desc": "Cay dịu, nâng hậu vị"
      },
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Cho ai thích đậm đà"
      },
      {
        "kanji": "葱",
        "name": "Negi shio dare",
        "desc": "Hành muối mát, ăn xen giữa bữa"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "bachiheo",
    "chapterNo": "09",
    "portionLabel": "100g",
    "nameJaFull": "豚バラ（三枚肉）",
    "intro": null,
    "note": "Heo phải chín kỹ hơn bò — chờ mỡ chuyển trong hẳn rồi mới gắp.",
    "craft": "Heo tươi trong ngày · Thái lát đều 3mm · Không ướp trước",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "duamuoi",
      "asahi",
      "milanh"
    ],
    "origin": "Ba chỉ heo, phần bụng nhiều lớp",
    "originKanji": "三枚肉",
    "originImageUrl": null,
    "flavours": [
      "Nạc mỡ xen ba lớp",
      "Cạnh giòn, mỡ trong",
      "Ngọt hậu, thơm mùi than",
      "Hợp kim chi và cơm trắng"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "12–14 lát",
        "desc": "Giòn rụm quanh viền, ăn nhanh khi còn nóng.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "8–10 lát",
        "desc": "Ngoài giòn trong mềm — kiểu phổ biến nhất.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Lát dày",
        "size": "5–6 lát",
        "desc": "Mỡ tan chậm, béo đầy đặn.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 60–90 giây mỗi mặt tới khi mỡ trong",
    "fireImageUrl": null,
    "dip": "Muối tiêu chanh, kèm kim chi hoặc tỏi nướng",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Cân vị béo, làm sáng miếng thịt"
      },
      {
        "kanji": "蒜",
        "name": "Tỏi nướng",
        "desc": "Nướng cùng, ăn kèm từng lát"
      },
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Đậm ngọt, hợp cơm trắng"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay nhẹ, khử ngấy"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "suonheo",
    "chapterNo": "10",
    "portionLabel": "120g",
    "nameJaFull": "豚ロース味噌漬け",
    "intro": null,
    "note": "Miso cháy sẽ đắng gắt. Nướng ở vùng lửa yếu và trở đều tay.",
    "craft": "Ướp miso đỏ 48 giờ · Gạt bớt miso trước khi nướng · Thái theo thớ",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "duamuoi",
      "miso",
      "junmai"
    ],
    "origin": "Sườn heo phần thăn, ướp miso đỏ",
    "originKanji": "ロース",
    "originImageUrl": null,
    "flavours": [
      "Miso đỏ ướp hai ngày",
      "Mặn ngọt hài hoà",
      "Thơm mùi đậu lên men",
      "Ăn với cơm là hết bát"
    ],
    "cutsLabel": "Lựa chọn độ cắt",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "8–10 lát",
        "desc": "Miso bám đều, chín rất nhanh.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "5–7 lát",
        "desc": "Giữ được nước thịt, vị miso vừa phải.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Miếng dày",
        "size": "3–4 miếng",
        "desc": "Ngoài đậm trong ngọt, cần lửa nhỏ.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Lửa nhỏ, 60–80 giây mỗi mặt để miso không cháy",
    "fireImageUrl": null,
    "dip": "Không cần chấm — ăn kèm dưa muối và cơm",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "漬",
        "name": "Dưa muối",
        "desc": "Chua giòn, cắt vị mặn của miso"
      },
      {
        "kanji": "飯",
        "name": "Cơm trắng",
        "desc": "Bạn đồng hành đúng nghĩa"
      },
      {
        "kanji": "塩",
        "name": "Muối chanh",
        "desc": "Chỉ vắt nhẹ nếu thấy đậm"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay ấm, rắc mỏng lúc cuối"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "tomsu",
    "chapterNo": "11",
    "portionLabel": "3 con",
    "nameJaFull": "海老の塩焼き",
    "intro": null,
    "note": "Đừng nướng quá tay — thịt tôm quá lửa sẽ bở và mất vị ngọt.",
    "craft": "Tôm sống về mỗi sáng · Rửa nước muối lạnh · Rút chỉ trước khi ra bàn",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "bingoi",
      "asahi",
      "junmai"
    ],
    "origin": "Tôm sú nguyên vỏ, cỡ 20–25 con/kg",
    "originKanji": "塩焼",
    "originImageUrl": null,
    "flavours": [
      "Nướng nguyên vỏ giữ nước",
      "Ngọt biển đậm",
      "Vỏ thơm giòn, gạch béo",
      "Bóc nóng ăn ngay"
    ],
    "cutsLabel": "Cách sơ chế",
    "cuts": [
      {
        "name": "Nguyên con",
        "size": "3 con",
        "desc": "Giữ trọn nước và gạch trong đầu.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Xẻ lưng",
        "size": "3 con",
        "desc": "Chín đều hơn, dễ rút chỉ và dễ bóc.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Xẻ đôi",
        "size": "6 nửa",
        "desc": "Thấm bơ tỏi nhanh, hợp ăn chia.",
        "soft": 4,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 90–120 giây mỗi mặt tới khi vỏ đỏ cam",
    "fireImageUrl": null,
    "dip": "Muối biển và chanh, hoặc bơ tỏi phút cuối",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối chanh",
        "desc": "Đơn giản nhất, tôn vị ngọt biển"
      },
      {
        "kanji": "蒜",
        "name": "Bơ tỏi",
        "desc": "Béo thơm, quét lúc gần chín"
      },
      {
        "kanji": "酢",
        "name": "Ponzu",
        "desc": "Chua nhẹ, ăn thanh"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay ấm, rắc lên gạch tôm"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "muctrung",
    "chapterNo": "12",
    "portionLabel": "1 con",
    "nameJaFull": "イカの姿焼き",
    "intro": null,
    "note": "Quá lửa mực sẽ dai như cao su — thấy thân se lại và ngả đục là gắp.",
    "craft": "Mực trứng cấp đông trên tàu · Rã chậm qua đêm · Làm sạch giữ nguyên túi trứng",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "asahi",
      "duamuoi",
      "junmai"
    ],
    "origin": "Mực trứng nguyên con, cỡ vừa",
    "originKanji": "姿焼",
    "originImageUrl": null,
    "flavours": [
      "Giòn sần sật",
      "Trứng mực bùi béo",
      "Ngọt hậu, ít tanh",
      "Nướng xong cắt khoanh nóng"
    ],
    "cutsLabel": "Cách sơ chế",
    "cuts": [
      {
        "name": "Nguyên con",
        "size": "1 con",
        "desc": "Giữ trứng và nước ngọt bên trong.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Cắt khoanh",
        "size": "8–10 khoanh",
        "desc": "Chín nhanh, dễ chia phần.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Xẻ dọc",
        "size": "2 mảnh",
        "desc": "Áp than đều hai mặt, mép cong đẹp.",
        "soft": 3,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 2–3 phút mỗi mặt, lửa vừa",
    "fireImageUrl": null,
    "dip": "Tương gừng, hoặc muối chanh nếu thích thanh",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "姜",
        "name": "Tương gừng",
        "desc": "Ấm bụng, khử tanh"
      },
      {
        "kanji": "塩",
        "name": "Muối chanh",
        "desc": "Thanh nhẹ, giữ vị biển"
      },
      {
        "kanji": "酢",
        "name": "Ponzu",
        "desc": "Chua dịu, ăn kèm hành lá"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay nhẹ cho khoanh dày"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "namdui",
    "chapterNo": "13",
    "portionLabel": "2 cây",
    "nameJaFull": "エリンギのバター焼き",
    "intro": null,
    "note": "Quét bơ sớm sẽ khét — chỉ quét khi nấm đã se mặt và ngả vàng.",
    "craft": "Nấm Đà Lạt về mỗi sáng · Không rửa nước, lau khô · Xé tay giữ thớ",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "bachi",
      "asahi",
      "miso"
    ],
    "origin": "Nấm đùi gà, thân dày chắc",
    "originKanji": "バター焼",
    "originImageUrl": null,
    "flavours": [
      "Xé sợi theo thớ",
      "Dai ngọt như thịt",
      "Bơ tỏi quét phút cuối",
      "Món chay được gọi nhiều nhất"
    ],
    "cutsLabel": "Cách sơ chế",
    "cuts": [
      {
        "name": "Xé sợi",
        "size": "10–12 sợi",
        "desc": "Thớ hút bơ, mép sợi cháy thơm.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Cắt khoanh",
        "size": "8 khoanh",
        "desc": "Mọng nước, giữ hình đẹp trên vỉ.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Xẻ dọc",
        "size": "4 miếng",
        "desc": "Dày dặn, ăn như một miếng thịt.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 90 giây mỗi mặt, quét bơ ở phút cuối",
    "fireImageUrl": null,
    "dip": "Muối tiêu chanh, hoặc chấm tương nhạt",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Làm bật vị ngọt của nấm"
      },
      {
        "kanji": "蒜",
        "name": "Bơ tỏi",
        "desc": "Béo thơm, chuẩn kiểu izakaya"
      },
      {
        "kanji": "垂",
        "name": "Tare nhạt",
        "desc": "Chấm nhẹ, không lấn vị nấm"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay ấm, hợp món chay"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "bingoi",
    "chapterNo": "14",
    "portionLabel": "1 phần",
    "nameJaFull": "焼き野菜盛り合わせ",
    "intro": null,
    "note": "Đặt rau ở mép vỉ nơi lửa yếu, để chỗ giữa dành cho thịt.",
    "craft": "Rau theo mùa · Sơ chế trong ngày · Cắt dày đều để chín cùng nhịp",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "bachi",
      "nambo",
      "milanh"
    ],
    "origin": "Rau củ theo mùa, chọn trong ngày",
    "originKanji": "季節",
    "originImageUrl": null,
    "flavours": [
      "Ngọt nước tự nhiên",
      "Hút mỡ bò trên vỉ",
      "Giòn nhẹ, ăn nghỉ miệng",
      "Cân lại cả bữa nướng"
    ],
    "cutsLabel": "Cách sơ chế",
    "cuts": [
      {
        "name": "Lát mỏng",
        "size": "10–12 lát",
        "desc": "Chín nhanh, mép hơi cháy ngọt.",
        "soft": 4,
        "imageUrl": null
      },
      {
        "name": "Lát vừa",
        "size": "6–8 lát",
        "desc": "Ngoài xém trong còn giòn.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Miếng dày",
        "size": "4–5 miếng",
        "desc": "Mọng nước, ngọt đậm hơn.",
        "soft": 2,
        "imageUrl": null
      }
    ],
    "fire": "Nướng 2 phút mỗi mặt ở vùng lửa nhẹ của vỉ",
    "fireImageUrl": null,
    "dip": "Muối tiêu chanh, hoặc chấm tare còn lại",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "塩",
        "name": "Muối tiêu chanh",
        "desc": "Đơn giản, tôn vị ngọt rau"
      },
      {
        "kanji": "垂",
        "name": "Sốt Tare",
        "desc": "Chấm nhẹ khi ăn cùng thịt"
      },
      {
        "kanji": "味",
        "name": "Miso mè",
        "desc": "Bùi béo, hợp bí ngòi"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay ấm, đổi vị"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "sodiep",
    "chapterNo": "06",
    "portionLabel": "3 cồi",
    "nameJaFull": "ホタテ（3L）",
    "intro": null,
    "note": "Đừng chờ chín hẳn — sò điệp ngon nhất khi tâm còn hơi trong.",
    "craft": "Bay từ Hokkaido mỗi tuần · Cấp đông -35°C · Rã chậm 12 giờ",
    "footerImageUrl": null,
    "bannerJa": "焼いてうまい！",
    "bannerVi": "NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý",
    "closing": "Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.",
    "pairingDishIds": [
      "junmai",
      "bingoi",
      "asahi"
    ],
    "origin": "Cồi sò điệp Hokkaido, size 3L",
    "originKanji": "貝柱",
    "originImageUrl": null,
    "flavours": [
      "Cồi 3L dày mình",
      "Ngọt biển đậm, hậu bơ",
      "Nướng trên vỏ giữ trọn nước",
      "Chín tới 70% là điểm ngon nhất"
    ],
    "cutsLabel": "Cách sơ chế",
    "cuts": [
      {
        "name": "Nguyên cồi",
        "size": "1 cồi",
        "desc": "Trọn vị, mọng nước nhất.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Xẻ đôi",
        "size": "2 nửa",
        "desc": "Chín đều, dễ thấm bơ tỏi.",
        "soft": 3,
        "imageUrl": null
      },
      {
        "name": "Thái lát",
        "size": "4–5 lát",
        "desc": "Gần như sashimi, chỉ áp nhẹ.",
        "soft": 4,
        "imageUrl": null
      }
    ],
    "fire": "Nướng trên vỏ 60–90 giây, không lật sớm",
    "fireImageUrl": null,
    "dip": "Bơ tỏi phút cuối, hoặc ponzu lạnh",
    "dipImageUrl": null,
    "condiments": [
      {
        "kanji": "蒜",
        "name": "Bơ tỏi",
        "desc": "Béo thơm, dậy mùi than"
      },
      {
        "kanji": "酢",
        "name": "Ponzu",
        "desc": "Chua nhẹ, nhấn vị biển"
      },
      {
        "kanji": "塩",
        "name": "Muối chanh",
        "desc": "Đơn giản, tôn vị ngọt"
      },
      {
        "kanji": "七",
        "name": "Shichimi",
        "desc": "Cay ấm bảy vị, rắc phút cuối"
      }
    ],
    "serves": null,
    "duration": null,
    "flow": null,
    "extraDishIds": null
  },
  {
    "dishId": "sora",
    "chapterNo": "I",
    "portionLabel": "8 món",
    "nameJaFull": "空膳（そらぜん）",
    "intro": "Bữa nhỏ vừa đủ cho hai người: ba phần bò khác thớ để so vị, một hải sản, rau nướng hút mỡ, canh và cơm chốt bữa. Bếp cân lượng sẵn nên không ai phải gọi thêm giữa chừng.",
    "note": "Set nấu theo nhịp — nhân viên mang từng chặng chứ không dọn hết một lượt. Báo trước nếu bạn muốn ăn nhanh.",
    "craft": "Cân lượng theo hai người · Thịt thái trong ngày · Đổi vỉ khi chuyển chặng",
    "footerImageUrl": null,
    "bannerJa": "いただきます！",
    "bannerVi": "MỜI CẢ BÀN CÙNG BẮT ĐẦU",
    "closing": "Đặt bàn trước, phần thịt đẹp nhất trong ngày sẽ dành cho set của bạn.",
    "pairingDishIds": null,
    "origin": null,
    "originKanji": null,
    "originImageUrl": null,
    "flavours": null,
    "cutsLabel": null,
    "cuts": null,
    "fire": null,
    "fireImageUrl": null,
    "dip": null,
    "dipImageUrl": null,
    "condiments": null,
    "serves": "2 người",
    "duration": "90 phút",
    "flow": [
      "Dưa muối lên trước khi than đỏ — ăn nhẹ trong lúc chờ",
      "Bò theo thứ tự ba chỉ → nầm → sườn non, nạc trước mỡ sau",
      "Tôm và rau nướng ở mép vỉ, ăn xen giữa các lượt bò",
      "Canh miso và cơm khi than đã dịu, kem trà xanh khép bữa"
    ],
    "extraDishIds": [
      "thanbo",
      "sodiep",
      "asahi"
    ]
  },
  {
    "dishId": "sumi",
    "chapterNo": "II",
    "portionLabel": "12 món",
    "nameJaFull": "炭膳（すみぜん）",
    "intro": "Bản đầy đặn cho nhóm ba đến bốn: bốn phần bò gồm cả thăn nội, hai hải sản và hai món rau. Than được thay giữa bữa để lửa luôn đều từ miếng đầu tới miếng cuối.",
    "note": "Thăn nội chỉ nướng 15–20 giây mỗi mặt. Nếu nhóm ăn chậm, báo nhân viên để bếp giữ thịt lạnh thêm.",
    "craft": "Đổi than giữa bữa · Bốn phần bò khác thớ · Cân lượng theo nhóm 3–4",
    "footerImageUrl": null,
    "bannerJa": "いただきます！",
    "bannerVi": "MỜI CẢ BÀN CÙNG BẮT ĐẦU",
    "closing": "Đặt bàn trước, phần thịt đẹp nhất trong ngày sẽ dành cho set của bạn.",
    "pairingDishIds": null,
    "origin": null,
    "originKanji": null,
    "originImageUrl": null,
    "flavours": null,
    "cutsLabel": null,
    "cuts": null,
    "fire": null,
    "fireImageUrl": null,
    "dip": null,
    "dipImageUrl": null,
    "condiments": null,
    "serves": "3–4 người",
    "duration": "120 phút",
    "flow": [
      "Bò tái chanh và dưa muối mở bữa khi than vừa đỏ",
      "Ba chỉ và nầm trước, để dành thăn nội cho giữa bữa",
      "Nhân viên thay than trước chặng hải sản",
      "Rau nướng, canh và cơm khép lại trước tráng miệng"
    ],
    "extraDishIds": [
      "misuji",
      "sukiyaki",
      "junmai"
    ]
  },
  {
    "dishId": "kiwami",
    "chapterNo": "III",
    "portionLabel": "16 món",
    "nameJaFull": "極膳（きわみぜん）",
    "intro": "Bản đầy đủ nhất, phục vụ trong phòng riêng. Sáu phần bò trong đó có lõi vai và dẻ sườn — những phần mỗi con bò chỉ cho vài kilogram. Bếp trưởng chọn thịt theo lô nhập trong ngày.",
    "note": "Cần đặt trước ít nhất 4 giờ để bếp chuẩn bị phần thịt hiếm. Phòng riêng giữ tối đa sáu người.",
    "craft": "Bếp trưởng chọn theo lô nhập · Phần thịt hiếm giới hạn mỗi ngày · Phục vụ phòng riêng",
    "footerImageUrl": null,
    "bannerJa": "いただきます！",
    "bannerVi": "MỜI CẢ BÀN CÙNG BẮT ĐẦU",
    "closing": "Đặt bàn trước, phần thịt đẹp nhất trong ngày sẽ dành cho set của bạn.",
    "pairingDishIds": null,
    "origin": null,
    "originKanji": null,
    "originImageUrl": null,
    "flavours": null,
    "cutsLabel": null,
    "cuts": null,
    "fire": null,
    "fireImageUrl": null,
    "dip": null,
    "dipImageUrl": null,
    "condiments": null,
    "serves": "4–6 người",
    "duration": "150 phút",
    "flow": [
      "Ba món lạnh mở bữa cùng trà nóng trong phòng riêng",
      "Bò lên theo bốn lượt, nạc trước mỡ sau, lõi vai ở lượt ba",
      "Sò điệp và mực nướng trên vỏ giữa hai lượt bò",
      "Canh đuôi bò hầm sáu giờ và cơm nóng khép bữa"
    ],
    "extraDishIds": [
      "sukiyaki",
      "junmai",
      "hojicha"
    ]
  }
]
