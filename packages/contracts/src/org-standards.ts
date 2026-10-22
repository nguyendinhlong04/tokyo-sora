import type { OrgUnitKind } from './org.js'
import type { Role } from './permissions.js'

/**
 * Mẫu chuẩn bộ máy của một chuỗi nhà hàng nướng than — điểm xuất phát để bấm
 * "Dựng theo mẫu chuẩn" ở Office, không phải khuôn bắt buộc.
 *
 * Nội dung chữ (mô tả công việc) là bản nháp nghiệp vụ: chủ quán và quản lý vận
 * hành phải duyệt trước khi dùng làm căn cứ tuyển dụng hay đánh giá. Áp mẫu là
 * thao tác idempotent — đơn vị và chức danh đã có (trùng tên) thì bỏ qua, nên
 * sửa tay sau khi áp không bị ghi đè ở lần áp sau.
 */

export interface StandardPosition {
  title: string
  isHead?: boolean
  headcount: number
  suggestedRole: Role
  duties: string[]
  authorities: string[]
  requirements: string[]
}

export interface StandardUnit {
  name: string
  kind: Exclude<OrgUnitKind, 'cong-ty' | 'chi-nhanh'>
  /** Tổ bếp gắn với trạm KDS — chỉ gắn khi trạm có thật trong CSDL */
  stationId?: string
  positions: StandardPosition[]
  children?: StandardUnit[]
}

const COOK_DUTIES = [
  'Chế biến món theo đúng công thức và định lượng của trạm',
  'Giữ thời gian ra món trong chuẩn SLA của trạm',
  'Ghi nhãn, bảo quản nguyên liệu đúng nhiệt độ; giữ trạm sạch suốt ca',
  'Làm checklist mở và đóng ca của trạm',
]

const cookTeam = (name: string, stationId: string): StandardUnit => ({
  name,
  kind: 'to',
  stationId,
  positions: [
    {
      title: 'Đầu bếp',
      headcount: 2,
      suggestedRole: 'R4',
      duties: COOK_DUTIES,
      authorities: ['Báo hết món của trạm trên màn bếp', 'Từ chối nhận nguyên liệu không đạt'],
      requirements: [
        'Có kinh nghiệm ở trạm tương ứng',
        'Có giấy xác nhận kiến thức an toàn thực phẩm',
      ],
    },
  ],
})

/** Khối của cả chuỗi — áp một lần cho cả công ty */
export const STANDARD_CHAIN_UNITS: StandardUnit[] = [
  {
    name: 'Ban điều hành',
    kind: 'khoi',
    positions: [
      {
        title: 'Giám đốc điều hành',
        isHead: true,
        headcount: 1,
        suggestedRole: 'R10',
        duties: [
          'Định hướng chiến lược và kế hoạch kinh doanh năm của chuỗi',
          'Phê duyệt ngân sách, giá bán, mở hoặc đóng chi nhánh',
          'Ký quyết định bổ nhiệm, khen thưởng, kỷ luật và quy định nội bộ',
          'Theo dõi kết quả kinh doanh và KPI các khối hằng tháng',
        ],
        authorities: [
          'Quyết định cơ cấu tổ chức và định biên',
          'Duyệt chi vượt hạn mức, duyệt và phát lương',
          'Ban hành quy chế thưởng, nội quy lao động',
        ],
        requirements: [
          'Kinh nghiệm điều hành chuỗi nhà hàng',
          'Hiểu tài chính nhà hàng: food cost, prime cost, dòng tiền',
          'Nắm Bộ luật Lao động và quy định an toàn thực phẩm',
        ],
      },
    ],
  },
  {
    name: 'Khối văn phòng',
    kind: 'khoi',
    positions: [],
    children: [
      {
        name: 'Phòng Kế toán',
        kind: 'phong',
        positions: [
          {
            title: 'Kế toán trưởng',
            isHead: true,
            headcount: 1,
            suggestedRole: 'R8',
            duties: [
              'Tổ chức công tác kế toán, sổ sách theo chuẩn mực',
              'Khoá sổ tháng, lập báo cáo tài chính và báo cáo thuế',
              'Đối soát doanh thu – ngân hàng – quỹ, kiểm soát chi phí',
              'Kiểm tra kỳ lương trước khi trình duyệt',
            ],
            authorities: [
              'Từ chối phiếu chi thiếu chứng từ',
              'Đề xuất định mức chi và hạn mức tạm ứng',
              'Yêu cầu chi nhánh giải trình chênh lệch két, kho',
            ],
            requirements: [
              'Tốt nghiệp kế toán – tài chính, có chứng chỉ kế toán trưởng',
              'Thành thạo hoá đơn điện tử, thuế GTGT, TNDN, TNCN',
            ],
          },
          {
            title: 'Kế toán viên',
            headcount: 1,
            suggestedRole: 'R8',
            duties: [
              'Ghi nhận chứng từ thu chi, hoá đơn đầu vào',
              'Đối soát sổ quỹ và báo có ngân hàng hằng ngày',
              'Theo dõi công nợ nhà cung cấp và khách doanh nghiệp',
            ],
            authorities: ['Yêu cầu bổ sung chứng từ trước khi ghi sổ'],
            requirements: ['Trung cấp kế toán trở lên', 'Cẩn thận, trung thực'],
          },
        ],
      },
      {
        name: 'Phòng Nhân sự',
        kind: 'phong',
        positions: [
          {
            title: 'Trưởng phòng nhân sự',
            isHead: true,
            headcount: 1,
            suggestedRole: 'R13',
            duties: [
              'Lập kế hoạch định biên, tuyển dụng, đào tạo hội nhập',
              'Quản lý hồ sơ, hợp đồng lao động, bảo hiểm',
              'Tổ chức chấm công, tính lương, đánh giá KPI hằng kỳ',
              'Soạn và trình ký quyết định nhân sự, nội quy, quy chế',
            ],
            authorities: [
              'Đề xuất bổ nhiệm, điều chuyển, khen thưởng, kỷ luật',
              'Khoá bảng công, trình kỳ lương',
              'Dựng và cập nhật sơ đồ tổ chức',
            ],
            requirements: [
              'Kinh nghiệm hành chính – nhân sự',
              'Nắm Bộ luật Lao động 2019 và chế độ bảo hiểm xã hội',
              'Giữ bảo mật thông tin lương',
            ],
          },
          {
            title: 'Chuyên viên nhân sự',
            headcount: 1,
            suggestedRole: 'R13',
            duties: [
              'Theo dõi chấm công, nghỉ phép, đổi ca',
              'Chuẩn bị hồ sơ tuyển dụng, hợp đồng',
              'Hỗ trợ tính lương và giải đáp phiếu lương',
            ],
            authorities: ['Cấp link Kênh nhân viên cho người mới'],
            requirements: ['Giao tiếp tốt, cẩn thận với giấy tờ'],
          },
        ],
      },
      {
        name: 'Phòng Marketing',
        kind: 'phong',
        positions: [
          {
            title: 'Trưởng phòng marketing',
            isHead: true,
            headcount: 1,
            suggestedRole: 'R9',
            duties: [
              'Lập kế hoạch truyền thông và khuyến mãi theo mùa',
              'Quản lý website, mạng xã hội, đánh giá của khách',
              'Theo dõi khách mới, khách quay lại, doanh thu kênh online',
              'Phối hợp chi nhánh xử lý khiếu nại trên mạng',
            ],
            authorities: [
              'Soạn chương trình khuyến mãi, voucher (bật cần quản lý chuỗi duyệt)',
              'Đăng nội dung website',
            ],
            requirements: ['Kinh nghiệm marketing ngành ăn uống', 'Viết nội dung, chụp ảnh món'],
          },
          {
            title: 'Chuyên viên marketing',
            headcount: 1,
            suggestedRole: 'R9',
            duties: [
              'Soạn bài, ảnh cho website và mạng xã hội',
              'Trả lời đánh giá, tin nhắn của khách',
              'Đo kết quả từng chương trình khuyến mãi',
            ],
            authorities: ['Soạn khuyến mãi ở trạng thái nháp'],
            requirements: ['Viết tốt, nhạy xu hướng'],
          },
        ],
      },
    ],
  },
  {
    name: 'Khối vận hành',
    kind: 'khoi',
    positions: [
      {
        title: 'Quản lý chuỗi',
        isHead: true,
        headcount: 1,
        suggestedRole: 'R11',
        duties: [
          'Điều hành các chi nhánh theo chuẩn vận hành chung',
          'Kiểm tra định kỳ chất lượng món, dịch vụ, vệ sinh',
          'Theo dõi doanh thu, food cost và KPI từng chi nhánh',
          'Đánh giá quản lý chi nhánh hằng tháng',
        ],
        authorities: [
          'Ký thông báo, quyết định trong phạm vi vận hành',
          'Duyệt bật khuyến mãi, điều chỉnh giá bán',
          'Đề xuất điều chuyển nhân sự giữa chi nhánh',
        ],
        requirements: [
          'Kinh nghiệm quản lý nhiều nhà hàng',
          'Nắm quy trình an toàn thực phẩm, phòng cháy',
        ],
      },
    ],
  },
]

/** Tên khối mà mọi chi nhánh nằm dưới khi áp mẫu chuỗi */
export const STANDARD_OPERATIONS_UNIT = 'Khối vận hành'

/** Chức danh trưởng của chính đơn vị chi nhánh */
export const STANDARD_BRANCH_HEAD: StandardPosition = {
  title: 'Quản lý chi nhánh',
  isHead: true,
  headcount: 1,
  suggestedRole: 'R7',
  duties: [
    'Chịu trách nhiệm doanh thu, chi phí và chất lượng của chi nhánh',
    'Xếp lịch, phân ca, giám sát chấm công',
    'Nộp báo cáo cuối ngày, xử lý sự cố và khiếu nại',
    'Đào tạo và đánh giá nhân viên chi nhánh',
  ],
  authorities: [
    'Giao việc và nghiệm thu trong chi nhánh',
    'Ký thông báo nội bộ của chi nhánh',
    'Duyệt huỷ món, giảm giá trong hạn mức',
    'Đề xuất khen thưởng, kỷ luật',
  ],
  requirements: [
    'Hai năm quản lý nhà hàng trở lên',
    'Có giấy xác nhận kiến thức an toàn thực phẩm',
    'Xử lý tình huống bình tĩnh trước khách',
  ],
}

/** Bộ phận của một chi nhánh: sảnh, bếp (sáu tổ theo trạm), kho */
export const STANDARD_BRANCH_UNITS: StandardUnit[] = [
  {
    name: 'Sảnh',
    kind: 'bo-phan',
    positions: [
      {
        title: 'Quản lý ca',
        headcount: 2,
        suggestedRole: 'R7',
        duties: [
          'Điều phối sảnh trong ca, phân khu cho phục vụ',
          'Kiểm tra và nghiệm thu checklist mở, đóng ca',
          'Xử lý yêu cầu và phàn nàn tại bàn',
          'Đối soát két cuối ca, ghi sổ giao ca',
        ],
        authorities: [
          'Duyệt huỷ món, giảm giá trong hạn mức',
          'Nghiệm thu việc của nhân viên trong ca',
        ],
        requirements: ['Một năm phục vụ hoặc giám sát', 'Giao tiếp tốt, chịu áp lực giờ cao điểm'],
      },
      {
        title: 'Phục vụ',
        headcount: 8,
        suggestedRole: 'R1',
        duties: [
          'Đón khách, giới thiệu món, gọi món trên máy POS',
          'Mang món, thay vỉ, bổ sung than đúng lúc',
          'Theo dõi yêu cầu từ bàn, giữ bàn sạch',
          'Làm checklist khu được phân công',
        ],
        authorities: ['Gọi món, chuyển và ghép bàn', 'Báo món hết, báo sự cố'],
        requirements: ['Niềm nở, nhanh nhẹn', 'Thuộc thực đơn và các thành phần dễ gây dị ứng'],
      },
      {
        title: 'Thu ngân',
        headcount: 2,
        suggestedRole: 'R2',
        duties: [
          'Thanh toán, xuất hoá đơn cho khách',
          'Mở và đóng ca két, đếm tiền bàn giao',
          'Đối soát VietQR, thẻ, tiền mặt',
        ],
        authorities: ['Áp voucher, giảm giá trong hạn mức (có duyệt khi vượt)'],
        requirements: ['Cẩn thận, trung thực', 'Thành thạo máy POS'],
      },
      {
        title: 'Lễ tân',
        headcount: 2,
        suggestedRole: 'R3',
        duties: [
          'Nhận đặt bàn, gọi nhắc trước giờ đến',
          'Đón khách và xếp chỗ',
          'Ghi chú khách quen, dị ứng, dịp đặc biệt',
        ],
        authorities: ['Xác nhận, huỷ đặt bàn; đánh dấu khách không đến'],
        requirements: ['Giọng nói dễ nghe', 'Tiếng Anh hoặc tiếng Nhật cơ bản là lợi thế'],
      },
      {
        title: 'Điều phối online',
        headcount: 1,
        suggestedRole: 'R12',
        duties: [
          'Xác nhận đơn web và app giao hàng',
          'Gán shipper, theo dõi đơn hẹn giờ',
          'Trả lời khách đặt online',
        ],
        authorities: ['Xác nhận hoặc huỷ đơn online theo quy định'],
        requirements: ['Nhanh nhẹn, thành thạo máy tính'],
      },
    ],
  },
  {
    name: 'Bếp',
    kind: 'bo-phan',
    positions: [
      {
        title: 'Bếp trưởng',
        isHead: true,
        headcount: 1,
        suggestedRole: 'R5',
        duties: [
          'Quản lý công thức, định lượng, trình bày món',
          'Kiểm soát food cost, hao hụt, đặt nguyên liệu',
          'Bảo đảm vệ sinh an toàn thực phẩm, lưu mẫu thức ăn',
          'Đào tạo đầu bếp, phân người theo trạm',
        ],
        authorities: [
          'Báo hết món, huỷ món đã gửi bếp',
          'Sửa công thức (đổi giá bán cần duyệt)',
          'Nghiệm thu checklist của bếp',
        ],
        requirements: [
          'Ba năm bếp Nhật hoặc bếp nướng',
          'Có giấy xác nhận kiến thức an toàn thực phẩm',
          'Quản lý được chi phí nguyên liệu',
        ],
      },
      {
        title: 'Bếp phó',
        headcount: 1,
        suggestedRole: 'R5',
        duties: [
          'Thay bếp trưởng điều hành ca',
          'Kiểm tra sơ chế và hàng nhập',
          'Nộp báo cáo ca bếp',
        ],
        authorities: ['Báo hết món, điều người giữa các trạm trong ca'],
        requirements: ['Hai năm bếp trở lên'],
      },
      {
        title: 'Phụ bếp và rửa',
        headcount: 3,
        suggestedRole: 'R4',
        duties: [
          'Sơ chế theo phiếu của các trạm',
          'Rửa dụng cụ, vỉ nướng; vệ sinh khu bếp cuối ca',
          'Phân loại rác đúng quy định',
        ],
        authorities: ['Báo hỏng dụng cụ, thiết bị'],
        requirements: ['Chăm chỉ, giữ vệ sinh cá nhân'],
      },
    ],
    children: [
      cookTeam('Tổ khai vị lạnh', 'ST-01'),
      cookTeam('Tổ quầy sống', 'ST-02'),
      cookTeam('Tổ chiên xào hấp', 'ST-03'),
      cookTeam('Tổ lẩu cơm mì', 'ST-04'),
      cookTeam('Tổ đồ uống', 'ST-05'),
      cookTeam('Tổ bếp nướng', 'ST-06'),
    ],
  },
  {
    name: 'Kho',
    kind: 'bo-phan',
    positions: [
      {
        title: 'Thủ kho',
        isHead: true,
        headcount: 1,
        suggestedRole: 'R6',
        duties: [
          'Nhận hàng, kiểm chất lượng và hạn dùng',
          'Xuất kho theo phiếu, ghi sổ đúng ngày',
          'Kiểm kê định kỳ, báo chênh lệch',
          'Đề xuất đặt hàng theo tồn tối thiểu',
        ],
        authorities: ['Từ chối nhận hàng kém chất lượng', 'Lập phiếu xuất huỷ (cần duyệt)'],
        requirements: ['Cẩn thận, trung thực', 'Biết nguyên tắc nhập trước xuất trước'],
      },
    ],
  },
]
