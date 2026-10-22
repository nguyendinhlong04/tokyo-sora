-- Sơ đồ tổ chức — những ràng buộc Drizzle không diễn đạt được.
--
-- Không dùng extension nào (ltree, btree_gist): PGlite trong test chạy MỌI migration
-- và không có chúng.

--------------------------------------------------------------------------------
-- 1. Cây đơn vị không có vòng.
--
--    Khoá advisory tuần tự hoá mọi lần đổi cha. Không có nó, hai lần chuyển chéo
--    nhau (A vào dưới B, B vào dưới A) chạy song song thì mỗi bên đều nhìn thấy
--    cây CŨ — không vòng — và cả hai cùng qua. Sau khi giữ khoá, câu truy vấn kế
--    tiếp (READ COMMITTED lấy snapshot mới) thấy lần đổi đã commit của bên kia.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_org_units_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NULL OR NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(9007001);
  IF EXISTS (
    WITH RECURSIVE up(id, parent_id, depth) AS (
      SELECT id, parent_id, 1 FROM org_units WHERE id = NEW.parent_id
      UNION ALL
      SELECT u.id, u.parent_id, up.depth + 1
        FROM org_units u JOIN up ON u.id = up.parent_id
       WHERE up.depth < 64
    )
    SELECT 1 FROM up WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Không đặt được đơn vị % vào dưới chính cây con của nó', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'org_units_no_cycle';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_units_no_cycle
  BEFORE UPDATE OF parent_id ON org_units
  FOR EACH ROW EXECUTE FUNCTION sora_org_units_no_cycle();

--------------------------------------------------------------------------------
-- 2. Lịch sử giữ chức danh: không xoá, mỗi dòng chỉ ĐÓNG một lần.
--
--    Đây là "quá trình công tác" của một người — căn cứ cho lương, KPI, cho câu
--    hỏi "tháng 3 ai là bếp trưởng". Sai thì mở khoảng mới, không viết lại cũ.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_position_assignments_close_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lịch sử chức danh không xoá được'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'position_assignments_close_only';
  END IF;
  IF (NEW.staff_id, NEW.position_id, NEW.kind, NEW.from_date, NEW.document_id, NEW.note,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.staff_id, OLD.position_id, OLD.kind, OLD.from_date, OLD.document_id, OLD.note,
      OLD.created_by, OLD.created_at)
  OR (OLD.to_date IS NOT NULL
      AND (NEW.to_date, NEW.end_document_id) IS DISTINCT FROM (OLD.to_date, OLD.end_document_id)) THEN
    RAISE EXCEPTION 'Chức danh chỉ được đóng một lần — sai thì gán khoảng mới'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'position_assignments_close_only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER position_assignments_close_only
  BEFORE UPDATE OR DELETE ON position_assignments
  FOR EACH ROW EXECUTE FUNCTION sora_position_assignments_close_only();

--------------------------------------------------------------------------------
-- 3. Khởi đầu: gốc công ty + một đơn vị cho mỗi chi nhánh ĐÃ CÓ.
--
--    Nạp bằng migration chứ không bằng seed — cùng lý do với 9006: CSDL thật đã
--    seed rồi, chạy lại seed sẽ đặt lại mật khẩu các tài khoản Office mẫu.
--    Chi nhánh tạo sau này hiện trên sơ đồ ở mục "chưa có đơn vị" để thêm vào.
--------------------------------------------------------------------------------
INSERT INTO org_units (kind, name)
SELECT 'cong-ty', 'Tokyo Sora'
 WHERE NOT EXISTS (SELECT 1 FROM org_units WHERE parent_id IS NULL);

INSERT INTO org_units (parent_id, kind, name, branch_id, sort)
SELECT (SELECT id FROM org_units WHERE parent_id IS NULL), 'chi-nhanh', b.name, b.id,
       row_number() OVER (ORDER BY b.id)
  FROM branches b
 WHERE NOT EXISTS (SELECT 1 FROM org_units u WHERE u.branch_id = b.id);

--------------------------------------------------------------------------------
-- 4. Lớp quyền role (môi trường đã chạy deploy/db-roles.sql). Role là cấp
--    cluster nên có thể chưa tồn tại — PGlite và máy dev chưa phân quyền.
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_app') THEN
    REVOKE DELETE ON position_assignments FROM sora_app;
  END IF;
END
$$;
