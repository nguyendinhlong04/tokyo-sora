-- Việc và checklist — những ràng buộc Drizzle không diễn đạt được.

--------------------------------------------------------------------------------
-- 1. Việc đã XONG hoặc đã HUỶ là hồ sơ: không sửa, không xoá. Tỉ lệ việc đúng
--    hạn (KPI) đếm trên những dòng này — sửa lùi được thì con số vô nghĩa.
--
--    Việc chưa đóng cũng không xoá được: không giao nữa thì HUỶ kèm lý do.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_tasks_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Việc % không xoá được — huỷ kèm lý do', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'tasks_closed_immutable';
  END IF;
  IF OLD.state IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Việc % đã đóng — không sửa được', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'tasks_closed_immutable';
  END IF;
  -- Nguồn và gốc của việc không đổi sau khi giao
  IF (NEW.template_id, NEW.occurrence_date, NEW.entity, NEW.entity_id, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.template_id, OLD.occurrence_date, OLD.entity, OLD.entity_id, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'Việc % — không đổi được nguồn giao', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'tasks_closed_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_guard
  BEFORE UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION sora_tasks_guard();

--------------------------------------------------------------------------------
-- 2. Checklist chỉ tích/bỏ tích khi việc còn đang làm; nhãn mục đóng băng từ lúc
--    sinh việc, mục không xoá.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_task_check_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Mục checklist không xoá được'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'task_check_items_frozen';
  END IF;
  IF (NEW.task_id, NEW.idx, NEW.label) IS DISTINCT FROM (OLD.task_id, OLD.idx, OLD.label) THEN
    RAISE EXCEPTION 'Nhãn mục checklist đóng băng từ lúc giao việc'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'task_check_items_frozen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND state = 'open') THEN
    RAISE EXCEPTION 'Việc % không còn đang làm — checklist đã chốt', NEW.task_id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'task_check_items_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_check_items_guard
  BEFORE UPDATE OR DELETE ON task_check_items
  FOR EACH ROW EXECUTE FUNCTION sora_task_check_items_guard();

--------------------------------------------------------------------------------
-- 3. Lớp quyền role (môi trường đã chạy deploy/db-roles.sql).
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_app') THEN
    REVOKE DELETE ON tasks, task_check_items FROM sora_app;
  END IF;
END
$$;
