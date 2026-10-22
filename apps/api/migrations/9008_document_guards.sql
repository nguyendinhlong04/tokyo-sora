-- Văn bản nội bộ — những ràng buộc Drizzle không diễn đạt được.

--------------------------------------------------------------------------------
-- 1. Từ lúc TRÌNH KÝ, nội dung và nơi nhận đóng băng: người ký ký đúng thứ đã đọc.
--
--    Chỉ ba bước chuyển: trả lại (pending → draft), ký (pending/draft → issued —
--    tác giả có quyền ký thì ký thẳng từ nháp), thu hồi (issued → revoked). Văn
--    bản đã trình không xoá được; nháp thì xoá thoải mái.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_org_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state <> 'draft' THEN
      RAISE EXCEPTION 'Văn bản % đã trình ký — không xoá được', OLD.id
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'org_documents_immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.state = 'draft' THEN
    RETURN NEW;
  END IF;

  IF (NEW.kind, NEW.decision_type, NEW.title, NEW.body, NEW.attachments, NEW.targets, NEW.changes,
      NEW.requires_ack, NEW.effective_from, NEW.effective_to, NEW.author_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.kind, OLD.decision_type, OLD.title, OLD.body, OLD.attachments, OLD.targets, OLD.changes,
      OLD.requires_ack, OLD.effective_from, OLD.effective_to, OLD.author_id, OLD.created_at)
  OR NOT (
       (OLD.state = 'pending' AND NEW.state IN ('draft', 'issued'))
    OR (OLD.state = 'issued' AND NEW.state = 'revoked'
        AND (NEW.number, NEW.signed_at, NEW.signer_id)
            IS NOT DISTINCT FROM (OLD.number, OLD.signed_at, OLD.signer_id))
  ) THEN
    RAISE EXCEPTION 'Văn bản % đã trình ký — nội dung không sửa được', OLD.id
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'org_documents_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_documents_guard
  BEFORE UPDATE OR DELETE ON org_documents
  FOR EACH ROW EXECUTE FUNCTION sora_org_documents_guard();

--------------------------------------------------------------------------------
-- 2. Biên nhận: mốc đọc / xác nhận ghi ĐÚNG MỘT LẦN, không xoá — đây là bằng
--    chứng "đã phổ biến quy định tới người lao động".
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_org_receipts_write_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Biên nhận văn bản không xoá được'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'org_document_receipts_write_once';
  END IF;
  IF (NEW.document_id, NEW.staff_id, NEW.created_at)
     IS DISTINCT FROM (OLD.document_id, OLD.staff_id, OLD.created_at)
  OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
  OR (OLD.acked_at IS NOT NULL AND NEW.acked_at IS DISTINCT FROM OLD.acked_at) THEN
    RAISE EXCEPTION 'Biên nhận chỉ được ghi thêm mốc đọc / xác nhận'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'org_document_receipts_write_once';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_document_receipts_write_once
  BEFORE UPDATE OR DELETE ON org_document_receipts
  FOR EACH ROW EXECUTE FUNCTION sora_org_receipts_write_once();

--------------------------------------------------------------------------------
-- 3. Lớp quyền role (môi trường đã chạy deploy/db-roles.sql).
--------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sora_app') THEN
    REVOKE DELETE ON org_document_receipts FROM sora_app;
  END IF;
END
$$;
