import type { RecipeCcp, RecipeInputSpec, RecipePitfall, RecipeSpecItem, RecipeMethodKind, RecipeStepPhase } from './schema'

/**
 * Quy trình chế biến cho bộ dữ liệu mẫu — M4 · thẻ công thức.
 *
 * Hai món, cố ý chọn hai kiểu đối nghịch nhau để chứng minh mô hình bước chịu
 * được cả hai đầu: **misuji** bếp không bật lửa lần nào (khách nướng tại bàn,
 * cái quyết định chất lượng là tay dao), **karaage** hai lượt chiên với nhiệt độ
 * và thời gian phải đúng từng chục giây. Một biểu mẫu năm ô cố định sẽ để trống
 * nửa thẻ này và thiếu chỗ ghi cho nửa kia.
 *
 * SỐ TRONG ĐÂY LÀ ĐỀ XUẤT MẶC ĐỊNH, KHÔNG PHẢI CHUẨN ĐÃ DUYỆT. Định mức lóc,
 * ngưỡng thời gian ngoài lạnh, nhiệt độ dầu — bếp trưởng chốt lại rồi sửa ở
 * Office M4. Chúng có mặt ở đây để màn hình có nội dung thật mà đối chiếu, và để
 * người nhập món tiếp theo thấy được mức chi tiết cần viết tới.
 *
 * Món còn lại chưa có bản ghi: màn M4 hiện ô trống kèm nút Soạn quy trình, đó là
 * hành vi mong muốn chứ không phải dữ liệu thiếu.
 */
export interface RecipeDocSeed {
  dishId: string
  methodKind: RecipeMethodKind
  yieldLabel: string
  plateLabel: string
  prepMinutes: number
  equipment: string[]
  inputSpec: RecipeInputSpec[]
  specMeasured: RecipeSpecItem[]
  specSensory: string[]
  ccp: RecipeCcp[]
  storage: string
  tips: string[]
  pitfalls: RecipePitfall[]
  substituteIds: string[]
  steps: {
    phase: RecipeStepPhase
    text: string
    seconds?: number
    paramLabel?: string
    isCcp?: boolean
  }[]
}

export const RECIPE_DOCS: RecipeDocSeed[] = [
  {
    dishId: 'misuji',
    methodKind: 'song',
    yieldLabel: '100g · 7–9 lát (lát vừa)',
    plateLabel: 'Đĩa gỗ số 3, lót một lá tía tô, chén muối tiêu chanh ở góc bốn giờ',
    prepMinutes: 25,
    equipment: [
      'Dao lóc mũi nhọn',
      'Dao thái thịt lưỡi dài',
      'Thớt đỏ — quy ước thịt sống',
      'Cân điện tử vạch 1g',
      'Máy hút chân không',
      'Mười đĩa giữ sẵn trong tủ mát quầy sống',
    ],
    inputSpec: [
      {
        item: 'Quy cách nhận',
        requirement: 'Lõi vai bò nguyên khối, hút chân không, còn nhãn lô và hạn dùng',
      },
      {
        item: 'Nhiệt độ khi nhận',
        requirement: 'Mát ≤ 4°C hoặc đông ≤ −18°C. Lệch ngưỡng thì từ chối lô, chụp ảnh, ghi lý do ở S5',
      },
      {
        item: 'Cảm quan',
        requirement: 'Đỏ tươi đến đỏ sẫm, mỡ trắng ngà, mặt cắt khô ráo. Nhớt tay, mùi chua hoặc mỡ ngả vàng là loại',
      },
      {
        item: 'Đúng phần thịt',
        requirement: 'Phải thấy gân lá chạy giữa khối — dấu nhận dạng của misuji. Khối không có gân lá là đã giao nhầm phần vai khác',
      },
      {
        item: 'Định mức lóc',
        requirement: '1kg nguyên khối ra khoảng 0,78kg dùng được, hao 22% màng bạc và gân. Lệch quá 5% thì soát lại tay dao hoặc chất lượng lô',
      },
    ],
    specMeasured: [
      { name: 'Khối lượng', target: '100g ± 3g' },
      { name: 'Số lát — lát vừa', target: '7–9 lát' },
      { name: 'Độ dày', target: '5mm ± 1mm' },
      { name: 'Nhiệt độ tâm khi rời quầy', target: '≤ 4°C' },
      { name: 'Vé đến ra bàn', target: '≤ 180 giây' },
      { name: 'Tối đa ở nhiệt độ phòng', target: '≤ 20 phút' },
    ],
    specSensory: [
      'Mặt cắt đỏ tươi và bóng, vân mỡ nổi rõ hình lá',
      'Lát phẳng, không rách mép',
      'Đĩa không đọng nước máu',
      'Không mùi lạ',
    ],
    ccp: [
      {
        point: 'Rã đông',
        limit: 'Ngăn mát 0–2°C, 18–24 giờ',
        action: 'Rã đông ở nhiệt độ phòng hoặc ngâm nước thì huỷ cả khối, ghi lý do ở S6',
      },
      {
        point: 'Hạn dùng khối đã lóc',
        limit: '3 ngày ở 0–2°C, xuất theo FEFO',
        action: 'Quá hạn thì huỷ kèm ảnh ở S6, không hạ cấp sang món khác',
      },
      {
        point: 'Thời gian ngoài lạnh',
        limit: 'Khối ≤ 10 phút trên bàn thái · đĩa đã xếp ≤ 20 phút trước khi lên bàn',
        action: 'Quá ngưỡng thì thu về, huỷ, làm đĩa mới. Không cất lại tủ',
      },
      {
        point: 'Nhiễm chéo sống — chín',
        limit: 'Thớt đỏ, dao riêng, kẹp gắp cán đỏ đi kèm đĩa',
        action: 'Dùng nhầm dụng cụ đồ chín thì bỏ phần thịt đó và rửa lại dụng cụ',
      },
    ],
    storage:
      'Lát đã thái không lưu qua ca: cuối ca còn thì chuyển ăn ca và ghi xuất nội bộ ở S6, không trả lại tủ. Khối đã lóc giữ 3 ngày ở 0–2°C theo FEFO. Món khách trả lại, kể cả chưa động đũa, vẫn huỷ — thịt sống rời quầy là không quay đầu.',
    tips: [
      'Thái khi thịt về −2…0°C thì lát đứng và cạnh sắc; lạnh quá thì lát vỡ',
      'Ngâm dao trong khay đá, lau khô trước mỗi khối — dao ấm kéo mỡ làm mặt cắt xỉn',
      'Phần trên và phần dưới gân lá thái riêng vì thớ chạy hai chiều khác nhau',
      'Muốn nhanh giờ cao điểm thì chia sẵn KHỐI, không thái sẵn LÁT',
    ],
    pitfalls: [
      {
        mistake: 'Thái dọc thớ',
        effect: 'Dai, mất cảm giác tan — đúng thứ khách trả 380.000₫ để mua',
        fix: 'Xoay khối, lưỡi dao vuông góc với sợi thịt',
      },
      {
        mistake: 'Thịt quá lạnh, dưới −4°C',
        effect: 'Lát vỡ, rìa nát',
        fix: 'Chờ về −2…0°C rồi mới thái',
      },
      {
        mistake: 'Thái sẵn trước giờ cao điểm',
        effect: 'Mặt cắt thâm, mỡ oxy hoá',
        fix: 'Chỉ thái theo vé',
      },
      {
        mistake: 'Xếp lên đĩa ấm',
        effect: 'Mỡ chảy, thịt xỉn trước khi tới bàn',
        fix: 'Giữ mười đĩa trong tủ mát quầy sống',
      },
      {
        mistake: 'Chồng lát quá nửa',
        effect: 'Lát dưới bết, khách khó gắp từng miếng',
        fix: 'Xoè hình quạt, chồng mép không quá một phần ba lát',
      },
    ],
    substituteIds: ['carbi', 'sagari'],
    steps: [
      {
        phase: 'so_che',
        text: 'Rã đông trong ngăn mát. Không rã đông ở nhiệt độ phòng, không ngâm nước.',
        paramLabel: '0–2°C · 18–24 giờ',
        isCcp: true,
      },
      {
        phase: 'so_che',
        text: 'Thấm khô mặt ngoài, lóc màng bạc bằng dao mũi nhọn, giữ nguyên lớp vân mỡ ngay dưới màng.',
        seconds: 360,
      },
      {
        phase: 'so_che',
        text: 'Tách gân lá giữa khối: rạch dọc sát hai bên gân rồi lấy gân ra. Phần trên và phần dưới để riêng.',
        seconds: 600,
      },
      {
        phase: 'so_che',
        text: 'Chia khối 500g, hút chân không, dán nhãn: tên phần · ngày lóc · số lô nguồn.',
        seconds: 420,
        paramLabel: 'khối 500g',
      },
      {
        phase: 'so_che',
        text: 'Cất 0–2°C, dùng trong 3 ngày kể từ ngày lóc, xuất theo FEFO.',
        paramLabel: '3 ngày',
        isCcp: true,
      },
      {
        phase: 'so_che',
        text: 'Ghi lượt lóc vào S7: vào là khối nguyên, ra là khối đã lóc, chênh lệch là hao.',
      },
      {
        phase: 'che_bien',
        text: 'Đọc vé, xác nhận độ cắt khách chọn: mỏng 12–14 lát · vừa 7–9 lát · dày 4–5 lát.',
        seconds: 5,
      },
      {
        phase: 'che_bien',
        text: 'Lấy khối theo FEFO, để ngoài cho về −2…0°C. Thịt hơi đông thì lát đứng và cạnh sắc.',
        paramLabel: '−2…0°C',
      },
      {
        phase: 'che_bien',
        text: 'Thái ngang thớ. Độ dày: mỏng 3mm · vừa 5mm · dày 8mm.',
        seconds: 60,
        paramLabel: '3 · 5 · 8mm',
      },
      {
        phase: 'che_bien',
        text: 'Cân 100g ± 3g. Thiếu thì bù bằng lát cùng độ dày, không bù bằng vụn.',
        seconds: 20,
        paramLabel: '100g ± 3g',
      },
      {
        phase: 'che_bien',
        text: 'Trả khối thừa vào tủ ngay. Khối không nằm trên bàn thái quá 10 phút.',
        seconds: 15,
        isCcp: true,
      },
      {
        phase: 'hoan_thien',
        text: 'Xếp lát xoè hình quạt trên đĩa đã làm lạnh, chồng mép không quá một phần ba lát.',
        seconds: 45,
      },
      {
        phase: 'hoan_thien',
        text: 'Lót một lá tía tô ở góc trên trái, đặt chén muối tiêu chanh 5g và một lát chanh ở góc bốn giờ.',
        seconds: 20,
      },
      {
        phase: 'hoan_thien',
        text: 'Kèm kẹp gắp thịt sống cán đỏ. Không dùng chung kẹp với đồ đã chín.',
        isCcp: true,
      },
      {
        phase: 'hoan_thien',
        text: 'Bàn đã nướng quá ba lượt thì đổi vỉ mới cùng lúc ra món.',
      },
    ],
  },

  {
    dishId: 'karaage',
    methodKind: 'nau',
    yieldLabel: '6 miếng · 180g sau chiên',
    plateLabel: 'Rổ tre lót giấy thấm, chén mayo yuzu và một lát chanh bên phải',
    prepMinutes: 40,
    equipment: [
      'Nồi chiên sâu hai ngăn',
      'Nhiệt kế dầu',
      'Nhiệt kế đầu dò tâm thịt',
      'Rổ ráo dầu và giá nghỉ',
      'Thớt vàng — quy ước thịt gia cầm sống',
      'Khay ướp có nắp',
    ],
    inputSpec: [
      {
        item: 'Nguyên liệu chính',
        requirement: 'Đùi gà rút xương còn da, mát ≤ 4°C, không đông đá lại lần hai',
      },
      {
        item: 'Cảm quan',
        requirement: 'Thịt hồng nhạt, da không nhớt, không mùi. Miếng thâm hoặc chảy nước đục là loại',
      },
      {
        item: 'Dầu chiên',
        requirement: 'Trong, không khét, không cặn đáy. Sẫm màu hoặc bốc khói sớm thì thay cả mẻ dầu',
      },
    ],
    specMeasured: [
      { name: 'Khối lượng sau chiên', target: '180g ± 10g · 6 miếng' },
      { name: 'Miếng cắt', target: '30–35g mỗi miếng' },
      { name: 'Nhiệt độ tâm khi ra', target: '≥ 75°C' },
      { name: 'Thời gian ướp', target: '2–4 giờ ở ≤ 4°C' },
      { name: 'Vé đến ra bàn', target: '≤ 10 phút' },
    ],
    specSensory: [
      'Vỏ vàng hổ phách, ráp đều, không mảng bột trắng',
      'Cắn vào giòn rõ, bên trong còn mọng nước',
      'Không ngấm dầu, giấy thấm dưới đáy không loang vệt lớn',
      'Thơm gừng tỏi, không nồng mùi dầu cũ',
    ],
    ccp: [
      {
        point: 'Nhiệt độ tâm miếng gà',
        limit: '≥ 75°C giữ ít nhất 15 giây',
        action: 'Chưa đạt thì chiên thêm 20 giây rồi đo lại. Không ra bàn khi chưa đo',
      },
      {
        point: 'Nhiệt độ khối ướp',
        limit: '≤ 4°C trong suốt thời gian ướp',
        action: 'Khay để ngoài quá 30 phút thì huỷ cả khay, ghi lý do ở S6',
      },
      {
        point: 'Nhiễm chéo gia cầm sống',
        limit: 'Thớt vàng, kẹp riêng, rửa tay sau mỗi khay',
        action: 'Dùng nhầm dụng cụ đồ chín thì bỏ phần đó và rửa lại dụng cụ',
      },
    ],
    storage:
      'Gà đã ướp giữ tối đa 24 giờ ở ≤ 4°C, ghi giờ bắt đầu ướp trên nắp khay. Karaage đã chiên không giữ lại: quá 15 phút chưa ra bàn thì chiên mẻ mới. Dầu lọc cuối mỗi ca, thay theo lịch ở S6.',
    tips: [
      'Chiên lần một cho chín, lần hai cho giòn — bỏ lần nghỉ giữa hai lượt là vỏ mềm lại sau ba phút',
      'Bột phủ mỏng, gõ bớt bột thừa: bột dày sinh mảng trắng và hút dầu',
      'Không thả quá nửa mặt chảo mỗi lượt, dầu tụt nhiệt là miếng ngấm dầu',
      'Đo tâm ở miếng DÀY NHẤT của mẻ, không đo miếng đầu tiên vớ được',
    ],
    pitfalls: [
      {
        mistake: 'Chiên một lần cho nhanh',
        effect: 'Vỏ mềm sau vài phút, mất đúng thứ khách gọi món này để ăn',
        fix: 'Giữ đủ hai lượt và lần nghỉ giữa chúng',
      },
      {
        mistake: 'Thả quá nhiều miếng một lượt',
        effect: 'Dầu tụt nhiệt, miếng ngấm dầu và nhợt màu',
        fix: 'Tối đa nửa mặt chảo, chia thành hai lượt',
      },
      {
        mistake: 'Không đo nhiệt độ tâm',
        effect: 'Gà chưa chín tới — rủi ro an toàn thực phẩm, không phải chuyện khẩu vị',
        fix: 'Đo miếng dày nhất mỗi mẻ, ghi nhận nếu dưới ngưỡng',
      },
      {
        mistake: 'Xếp chồng lên nhau khi vừa vớt',
        effect: 'Hơi nước đọng, vỏ mềm ngay trên đường ra bàn',
        fix: 'Ráo trên giá một lớp, chỉ dồn khi xếp ra rổ',
      },
    ],
    substituteIds: [],
    steps: [
      {
        phase: 'so_che',
        text: 'Lọc đùi gà, cắt miếng 30–35g, giữ nguyên da.',
        seconds: 600,
        paramLabel: '30–35g',
      },
      {
        phase: 'so_che',
        text: 'Trộn nước ướp: nước tương, sake, gừng và tỏi băm. Bóp đều cho ngấm.',
        seconds: 300,
      },
      {
        phase: 'so_che',
        text: 'Ướp trong khay đậy nắp ở ngăn mát, ghi giờ bắt đầu ướp lên nắp.',
        paramLabel: '≤ 4°C · 2–4 giờ',
        isCcp: true,
      },
      {
        phase: 'che_bien',
        text: 'Đun dầu tới nhiệt độ lượt một, kiểm bằng nhiệt kế chứ không ước lượng.',
        seconds: 120,
        paramLabel: '160–170°C',
      },
      {
        phase: 'che_bien',
        text: 'Vớt gà khỏi nước ướp, để ráo rồi lăn bột khoai tây, gõ bớt bột thừa.',
        seconds: 90,
      },
      {
        phase: 'che_bien',
        text: 'Chiên lượt một, thả tối đa nửa mặt chảo.',
        seconds: 180,
        paramLabel: '160–170°C · 3 phút',
      },
      {
        phase: 'che_bien',
        text: 'Vớt ra giá, để nghỉ một lớp — hơi ẩm trong miếng thoát ra ở bước này.',
        seconds: 120,
      },
      {
        phase: 'che_bien',
        text: 'Chiên lượt hai cho vỏ giòn và lên màu hổ phách.',
        seconds: 50,
        paramLabel: '190°C · 45–60 giây',
      },
      {
        phase: 'che_bien',
        text: 'Đo nhiệt độ tâm ở miếng dày nhất. Chưa đạt thì chiên thêm 20 giây rồi đo lại.',
        seconds: 20,
        paramLabel: '≥ 75°C',
        isCcp: true,
      },
      {
        phase: 'hoan_thien',
        text: 'Ráo dầu trên giá một lớp, không xếp chồng khi còn bốc hơi.',
        seconds: 30,
      },
      {
        phase: 'hoan_thien',
        text: 'Xếp 6 miếng vào rổ tre lót giấy thấm.',
        seconds: 25,
      },
      {
        phase: 'hoan_thien',
        text: 'Đặt chén mayo yuzu và một lát chanh bên phải, ra bàn ngay khi còn nóng.',
        seconds: 20,
      },
    ],
  },
]
