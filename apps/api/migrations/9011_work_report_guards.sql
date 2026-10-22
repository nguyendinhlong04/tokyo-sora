-- Báo cáo công việc và sự cố — những ràng buộc Drizzle không diễn đạt được.

--------------------------------------------------------------------------------
-- 1. Báo cáo ĐÃ NỘP là hồ sơ: số tự điền, giá trị, mốc nộp không đổi. Chỉ còn
--    một bước: cấp trên / ca sau xác nhận (submitted → reviewed). Sai thì viết
--    BỔ SUNG, không sửa bản đã nộp. Nháp thì sửa, xoá thoải mái.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_work_reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'Báo cáo % đã nộp — không xoá được', OLD.id
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'work_reports_immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF (NEW.template_id, NEW.template_version, NEW.fields_snapshot, NEW.branch_id, NEW.business_date,
      NEW.shift_template_id, NEW.period_key, NEW.values, NEW.auto_values, NEW.author_id,
      NEW.channel, NEW.due_at, NEW.submitted_at, NEW.on_time, NEW.created_at)
     IS DISTINCT FROM
     (OLD.template_id, OLD.template_version, OLD.fields_snapshot, OLD.branch_id, OLD.business_date,
      OLD.shift_template_id, OLD.period_key, OLD.values, OLD.auto_values, OLD.author_id,
      OLD.channel, OLD.due_at, OLD.submitted_at, OLD.on_time, OLD.created_at)
  OR NOT (OLD.state = 'submitted' AND NEW.state = 'reviewed') THEN
    RAISE EXCEPTION 'Báo cáo % đã nộp — chỉ xác nhận hoặc viết bổ sung được', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'work_reports_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_reports_guard
  BEFORE UPDATE OR DELETE ON work_reports
  FOR EACH ROW EXECUTE FUNCTION sora_work_reports_guard();

CREATE OR REPLACE FUNCTION sora_append_only_addenda() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bổ sung báo cáo chỉ được thêm, không sửa, không xoá'
    USING ERRCODE = 'restrict_violation', CONSTRAINT = 'work_report_addenda_append_only';
END;
$$;

CREATE TRIGGER work_report_addenda_append_only
  BEFORE UPDATE OR DELETE ON work_report_addenda
  FOR EACH ROW EXECUTE FUNCTION sora_append_only_addenda();

--------------------------------------------------------------------------------
-- 2. Sự cố không xoá; sự cố đã đóng không sửa. Báo nhầm thì đóng kèm ghi chú.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_incidents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sự cố % không xoá được', OLD.code
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'incidents_immutable';
  END IF;
  IF OLD.state = 'closed' THEN
    RAISE EXCEPTION 'Sự cố % đã đóng — không sửa được', OLD.code
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'incidents_immutable';
  END IF;
  IF (NEW.code, NEW.branch_id, NEW.reported_by, NEW.reported_at, NEW.created_at)
     IS DISTINCT FROM (OLD.code, OLD.branch_id, OLD.reported_by, OLD.reported_at, OLD.created_at)
  THEN
    RAISE EXCEPTION 'Sự cố % — mã, chi nhánh, người báo, mốc báo không đổi được', OLD.code
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'incidents_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER incidents_guard
  BEFORE UPDATE OR DELETE ON incidents
  FOR EACH ROW EXECUTE FUNCTION sora_incidents_guard();

--------------------------------------------------------------------------------
-- 3. Tham số (A6). Nạp bằng migration chứ không bằng seed: chạy lại seed đặt lại
--    mật khẩu tài khoản Office mẫu — xem 9006.
--------------------------------------------------------------------------------
INSERT INTO parameters (key, branch_id, value, unit)
     VALUES ('workreport.graceMinutes', NULL, '15'::jsonb, 'phút'),
            ('workreport.incidentReportHours', NULL, '24'::jsonb, 'giờ'),
            ('workreport.incidentCorrectiveDays', NULL, '7'::jsonb, 'ngày')
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 4. Lớp quyền role (môi trường đã chạy deploy/db-roles.sql).
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_app') THEN
    REVOKE DELETE ON work_report_addenda, incidents FROM sora_app;
  END IF;
END
$$;
