-- KPI — những ràng buộc Drizzle không diễn đạt được.

--------------------------------------------------------------------------------
-- 1. Kỳ đã mở thì luật chấm đóng băng (Điều 104: quy chế công bố trước); kỳ đã
--    chốt không sửa, không xoá. Kỳ chỉ đi tới: draft → open → review → closed.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_kpi_cycles_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'Kỳ KPI % đã mở — không xoá được', OLD.id
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_cycles_frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.state = 'closed' THEN
    RAISE EXCEPTION 'Kỳ KPI % đã chốt — không sửa được', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_cycles_frozen';
  END IF;
  IF OLD.state <> 'draft' AND (NEW.rules, NEW.policy_url, NEW.period_start, NEW.period_end,
                               NEW.branch_id)
     IS DISTINCT FROM (OLD.rules, OLD.policy_url, OLD.period_start, OLD.period_end, OLD.branch_id)
  THEN
    RAISE EXCEPTION 'Kỳ KPI % đã mở — luật chấm và quy chế thưởng không đổi được', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_cycles_frozen';
  END IF;
  IF array_position(ARRAY['draft','open','review','closed'], NEW.state)
     < array_position(ARRAY['draft','open','review','closed'], OLD.state) THEN
    RAISE EXCEPTION 'Kỳ KPI % chỉ đi tới, không lùi trạng thái', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_cycles_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_cycles_guard
  BEFORE UPDATE OR DELETE ON kpi_cycles
  FOR EACH ROW EXECUTE FUNCTION sora_kpi_cycles_guard();

--------------------------------------------------------------------------------
-- 2. Kỳ đã chốt thì phiếu đóng băng: chỉ nhân viên ghi được MỘT lần "đã xem kết
--    quả" và ý kiến của mình. Chỉ số trên phiếu cũng không đổi.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_kpi_reviews_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cycle_state text;
BEGIN
  SELECT state INTO cycle_state FROM kpi_cycles WHERE id = OLD.cycle_id;
  IF TG_OP = 'DELETE' THEN
    IF cycle_state <> 'draft' THEN
      RAISE EXCEPTION 'Phiếu KPI của kỳ đã mở không xoá được'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_reviews_frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF cycle_state = 'closed' THEN
    IF (to_jsonb(NEW) - 'employee_ack_at' - 'employee_feedback' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'employee_ack_at' - 'employee_feedback' - 'updated_at')
    OR (OLD.employee_ack_at IS NOT NULL
        AND (NEW.employee_ack_at, NEW.employee_feedback)
            IS DISTINCT FROM (OLD.employee_ack_at, OLD.employee_feedback)) THEN
      RAISE EXCEPTION 'Kỳ KPI đã chốt — phiếu chỉ còn nhận ý kiến của người được chấm, một lần'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_reviews_frozen';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_reviews_guard
  BEFORE UPDATE OR DELETE ON kpi_reviews
  FOR EACH ROW EXECUTE FUNCTION sora_kpi_reviews_guard();

CREATE OR REPLACE FUNCTION sora_kpi_review_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM kpi_reviews r JOIN kpi_cycles c ON c.id = r.cycle_id
     WHERE r.id = OLD.review_id AND c.state = 'closed'
  ) THEN
    RAISE EXCEPTION 'Kỳ KPI đã chốt — chỉ số trên phiếu không đổi được'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_reviews_frozen';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_review_items_guard
  BEFORE UPDATE OR DELETE ON kpi_review_items
  FOR EACH ROW EXECUTE FUNCTION sora_kpi_review_items_guard();

--------------------------------------------------------------------------------
-- 3. Phiếu kiểm tra: không xoá, huỷ đúng một lần kèm lý do.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_kpi_observations_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Phiếu kiểm tra không xoá được — huỷ kèm lý do'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_observations_frozen';
  END IF;
  IF OLD.voided_at IS NOT NULL
  OR (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason') THEN
    RAISE EXCEPTION 'Phiếu kiểm tra chỉ huỷ được, một lần, không sửa điểm'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'kpi_observations_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kpi_observations_guard
  BEFORE UPDATE OR DELETE ON kpi_observations
  FOR EACH ROW EXECUTE FUNCTION sora_kpi_observations_guard();

--------------------------------------------------------------------------------
-- 4. Tham số (A6). Thang chấm và mức thưởng MỘT cho cả chuỗi (overridable =
--    false); mức thưởng là số nhạy cảm. Nạp bằng migration, không bằng seed (9006).
--------------------------------------------------------------------------------
INSERT INTO parameters (key, branch_id, value, unit, overridable, sensitive)
     VALUES ('kpi.gradeA', NULL, '105'::jsonb, 'điểm', false, false),
            ('kpi.gradeB', NULL, '95'::jsonb, 'điểm', false, false),
            ('kpi.gradeC', NULL, '80'::jsonb, 'điểm', false, false),
            ('kpi.achievementCapPct', NULL, '120'::jsonb, '%', false, false),
            ('kpi.zeroTargetPenaltyPct', NULL, '50'::jsonb, '%', false, false),
            ('kpi.minCoveragePct', NULL, '70'::jsonb, '%', false, false),
            ('kpi.minSampleTickets', NULL, '30'::jsonb, 'vé', false, false),
            ('kpi.minSampleRatings', NULL, '10'::jsonb, 'lượt chấm', false, false),
            ('kpi.minSampleEvents', NULL, '10'::jsonb, 'sự kiện', false, false),
            ('kpi.minSampleTasks', NULL, '3'::jsonb, 'việc', false, false),
            ('kpi.bonusAVnd', NULL, '1000000'::jsonb, 'đồng', false, true),
            ('kpi.bonusBVnd', NULL, '600000'::jsonb, 'đồng', false, true),
            ('kpi.bonusCVnd', NULL, '200000'::jsonb, 'đồng', false, true),
            ('kpi.bonusDVnd', NULL, '0'::jsonb, 'đồng', false, true),
            ('kpi.bonusProrateByHours', NULL, 'true'::jsonb, NULL, false, false),
            ('kpi.cashToleranceVnd', NULL, '20000'::jsonb, 'đồng', false, false),
            ('kpi.recomputeMinMinutes', NULL, '5'::jsonb, 'phút', true, false),
            ('kpi.selfReviewDays', NULL, '5'::jsonb, 'ngày', true, false)
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 5. Lớp quyền role (môi trường đã chạy deploy/db-roles.sql).
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_app') THEN
    REVOKE DELETE ON kpi_observations FROM sora_app;
  END IF;
END
$$;
