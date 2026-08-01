-- Guard viết tay: những ràng buộc Drizzle không diễn đạt được.
-- Chạy sau 0000_init.sql. Phân quyền cấp role nằm ở deploy/db-roles.sql (theo môi
-- trường), đây là lớp cưỡng chế PORTABLE chạy ở mọi nơi kể cả test.

--------------------------------------------------------------------------------
-- 1. Sổ bất biến: chỉ INSERT. Sửa sai = bút toán ngược (quy tắc cứng 4.3.2).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Bảng % là sổ bất biến: chỉ được INSERT. Sửa sai bằng bút toán ngược.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION sora_append_only();

CREATE TRIGGER approvals_append_only
  BEFORE UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION sora_append_only();

CREATE TRIGGER journal_entries_append_only
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION sora_append_only();

CREATE TRIGGER parameter_history_append_only
  BEFORE UPDATE OR DELETE ON parameter_history
  FOR EACH ROW EXECUTE FUNCTION sora_append_only();

--------------------------------------------------------------------------------
-- 2. outbox_events: nội dung sự kiện bất biến; chỉ được đánh dấu đã phát.
--    Cho phép DELETE để dọn retention 7 ngày, nhưng chỉ với sự kiện đã phát.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_outbox_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.dispatched_at IS NULL THEN
      RAISE EXCEPTION 'Không xoá sự kiện outbox chưa phát (id=%)', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id         IS DISTINCT FROM OLD.id
  OR NEW.branch_id  IS DISTINCT FROM OLD.branch_id
  OR NEW.topic      IS DISTINCT FROM OLD.topic
  OR NEW.payload    IS DISTINCT FROM OLD.payload
  OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outbox_events chỉ được cập nhật cột dispatched_at'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_events_guard
  BEFORE UPDATE OR DELETE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION sora_outbox_guard();

--------------------------------------------------------------------------------
-- 3. Chống trả trùng khi chia bill (T12).
--    `payment_lines.live` phản chiếu trạng thái lượt trả để partial unique index
--    `payment_lines_one_live_claim` tự nhả món khi lượt trả hỏng/hết hạn.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_sync_payment_line_claims() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    UPDATE payment_lines
       SET live = CASE WHEN NEW.state IN ('pending', 'paid') THEN 'yes' ELSE 'no' END
     WHERE payment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_sync_claims
  AFTER UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION sora_sync_payment_line_claims();

--------------------------------------------------------------------------------
-- 4. Vé bếp không bao giờ biết giá. Chặn ở tầng schema thay vì trông vào kỷ luật
--    code: thêm cột có tên gợi ý tiền vào tickets/ticket_items sẽ bị từ chối.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_no_money_in_kitchen() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%I.%I', c.relname, a.attname), ', ')
    INTO offending
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname IN ('tickets', 'ticket_items')
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND (a.attname ~ '(price|amount|money|total|cost|discount|vat)');

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'Vé bếp không được mang thông tin tiền: %', offending
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;

CREATE EVENT TRIGGER sora_kitchen_money_guard
  ON ddl_command_end
  WHEN TAG IN ('ALTER TABLE', 'CREATE TABLE')
  EXECUTE FUNCTION sora_no_money_in_kitchen();
