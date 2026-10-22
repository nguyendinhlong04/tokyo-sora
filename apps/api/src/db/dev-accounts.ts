/**
 * Tài khoản mẫu của máy dev: năm tài khoản Office (email + mật khẩu) và năm nhân
 * viên quán của prototype POS (PIN). Chỉ `db:dev-bootstrap` dùng các tài khoản này;
 * `db:seed --ghi-de` mượn `assertLocalDatabase`.
 *
 * Chúng từng nằm trong `seed.ts` — mà `db:seed` chạy cả lên production theo
 * DEPLOY.md, nạp bằng UPSERT: mỗi lượt seed đặt lại mật khẩu chủ quán CHU01 về một
 * hằng nằm công khai trong repo. Mật khẩu và PIN dưới đây công khai trong DEV.md,
 * nên chúng chỉ được sống trên CSDL ở chính máy dev — `assertLocalDatabase` canh
 * cửa đó.
 */
import { hash } from '@node-rs/argon2'
import { Client } from 'pg'
import type { Db } from './client'
import { staff, staffRoles } from './schema'

export const DEV_OFFICE_PASSWORD = 'sora-dev-2026'

/**
 * Tài khoản Office — vai trò gán ở phạm vi TOÀN CHUỖI (branch_id NULL) đúng như §5.
 *
 * Bộ nhân viên trong prototype dừng ở cấp chi nhánh nên không ai mở được màn quản
 * trị. Có kế toán và quản lý nhân sự vì hai luồng ĐÒI HỎI nhiều người: phiếu chi
 * trên hạn mức phải người khác duyệt (§4.3.1 không ai tự duyệt việc của mình), và
 * kỳ lương đi qua ba vai — R13 trình, R8 kiểm, R10 duyệt. Chỉ có một tài khoản chủ
 * thì hai luồng đó không chạy thử được trên máy dev.
 */
const OFFICE_ACCOUNTS: { code: string; fullName: string; email: string; roles: string[] }[] = [
  { code: 'CHU01', fullName: 'Chủ quán', email: 'chu@tokyosora.vn', roles: ['R10'] },
  { code: 'CHUOI01', fullName: 'Quản lý chuỗi', email: 'chuoi@tokyosora.vn', roles: ['R11'] },
  { code: 'KETOAN01', fullName: 'Kế toán', email: 'ketoan@tokyosora.vn', roles: ['R8'] },
  { code: 'NHANSU01', fullName: 'Quản lý nhân sự', email: 'nhansu@tokyosora.vn', roles: ['R13'] },
  // R9 chỉ mở được đúng một màn — A8 nội dung website. Có tài khoản này thì thử
  // được ranh giới đó thật, thay vì tin rằng nó hẹp.
  { code: 'MARKETING01', fullName: 'Marketing', email: 'marketing@tokyosora.vn', roles: ['R9'] },
]

/**
 * Nhân viên quán của prototype POS — Thu ngân → R2, Phục vụ → R1, Trưởng ca → R7
 * theo ma trận §4.2. Mỗi người một PIN 4 số khác nhau, vai trò ở chi nhánh dev.
 */
const POS_STAFF: { code: string; fullName: string; role: string; pin: string }[] = [
  { code: 'HOA', fullName: 'Hoa', role: 'R2', pin: '1101' },
  { code: 'MINH', fullName: 'Minh', role: 'R1', pin: '1102' },
  { code: 'TUAN', fullName: 'Tuấn', role: 'R1', pin: '1103' },
  { code: 'LAN', fullName: 'Lan', role: 'R7', pin: '1104' },
  { code: 'DUC', fullName: 'Đức', role: 'R1', pin: '1105' },
]

/**
 * Tạo tài khoản dev CÒN THIẾU; trả về mã vừa tạo và mã giữ nguyên.
 *
 * Tài khoản đã có — trùng mã HOẶC trùng email — thì không đụng tới: không đặt lại
 * mật khẩu, PIN hay vai trò. Nó có thể là người thật, hoặc tài khoản dev mà người
 * dùng đã đổi mật khẩu; đặt lại chính là lỗi của seed cũ.
 */
export async function seedDevAccounts(db: Db, branchId: string) {
  const created: string[] = []
  const kept: string[] = []

  const addIfMissing = async (
    person: typeof staff.$inferInsert,
    roles: { roleCode: string; branchId: string | null }[],
  ) => {
    const isNew = await db.transaction(async (tx) => {
      // DO NOTHING không chỉ đích: chặn cả trùng mã lẫn trùng email
      const [row] = await tx
        .insert(staff)
        .values(person)
        .onConflictDoNothing()
        .returning({ id: staff.id })
      if (!row) return false
      await tx.insert(staffRoles).values(roles.map((r) => ({ staffId: row.id, ...r })))
      return true
    })
    if (isNew) created.push(person.code)
    else kept.push(person.code)
  }

  for (const a of OFFICE_ACCOUNTS) {
    await addIfMissing(
      {
        code: a.code,
        fullName: a.fullName,
        email: a.email,
        passwordHash: await hash(DEV_OFFICE_PASSWORD),
      },
      // branchId NULL = phạm vi toàn chuỗi
      a.roles.map((roleCode) => ({ roleCode, branchId: null })),
    )
  }
  for (const p of POS_STAFF) {
    await addIfMissing({ code: p.code, fullName: p.fullName, pinHash: await hash(p.pin) }, [
      { roleCode: p.role, branchId },
    ])
  }
  return { created, kept }
}

/**
 * Dừng nếu CSDL không nằm trên chính máy đang chạy.
 *
 * Chặn theo `NODE_ENV=production` là chưa đủ: DEPLOY.md chạy các lệnh `db:*` từ máy
 * dev với `DATABASE_URL` của Supabase, `.env.example` mẫu sẵn đúng URL đó, và lúc ấy
 * NODE_ENV để trống. Thứ phải xét là nơi kết nối TỚI — hỏi chính `pg` (đã tính `?host=` lẫn
 * PGHOST) thay vì tự đọc URL, để không lệch với chỗ Pool sẽ nối thật. Đường hầm SSH
 * trỏ localhost về CSDL thật thì không chặn được.
 *
 * Rào này canh cả `db:seed --ghi-de` (seed.ts) — `command` và `reason` chỉ đổi lời báo.
 */
export function assertLocalDatabase(
  connectionString: string | undefined,
  command = 'dev-bootstrap',
  reason = 'Mật khẩu, PIN và token thiết bị dev công khai trong repo.',
): void {
  const host = new Client({ connectionString }).host.toLowerCase()
  const local =
    host.startsWith('/') || // socket Unix — chỉ có trên chính máy này
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    /^127(\.\d{1,3}){3}$/.test(host)
  if (!local) {
    throw new Error(
      `${command} chỉ chạy trên CSDL ở máy này (localhost, 127.x, ::1, socket) — DATABASE_URL đang trỏ tới ${host}. ${reason}`,
    )
  }
}
