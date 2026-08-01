-- Phân quyền cấp role — chạy MỘT LẦN cho mỗi môi trường, bằng tài khoản superuser.
-- Đây là lớp thứ hai bảo vệ sổ bất biến (lớp thứ nhất là trigger trong migration).
--
--   psql "$DATABASE_URL" -v app_password="$APP_DB_PASSWORD" -f deploy/db-roles.sql
--
-- Ba role theo kế hoạch:
--   sora_migrator  — chạy migration (DDL). Chỉ dùng lúc triển khai.
--   sora_app       — runtime của API. KHÔNG có UPDATE/DELETE trên bảng sổ.
--   sora_readonly  — báo cáo/BI (dùng từ GĐ5).

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_app') THEN
    CREATE ROLE sora_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_readonly') THEN
    CREATE ROLE sora_readonly LOGIN;
  END IF;
END
$$;

ALTER ROLE sora_app PASSWORD :'app_password';

GRANT USAGE ON SCHEMA public TO sora_app, sora_readonly;

-- Mặc định: app toàn quyền dữ liệu
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sora_app;

-- Rồi THU HỒI quyền sửa/xoá trên các sổ bất biến
REVOKE UPDATE, DELETE ON
  audit_log,
  approvals,
  journal_entries,
  parameter_history
FROM sora_app;

-- outbox_events: được đánh dấu đã phát và dọn retention, nội dung bất biến do
-- trigger sora_outbox_guard canh.
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox_events TO sora_app;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO sora_readonly;

-- Bảng tạo sau này thừa hưởng cùng quy tắc
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sora_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sora_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO sora_readonly;
