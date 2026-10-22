-- Hoá đơn điện tử (NĐ 254/2026/NĐ-CP, TT 91/2026/TT-BTC) — phần Drizzle không
-- diễn đạt được. Cột và ràng buộc thường nằm ở 0033.

--------------------------------------------------------------------------------
-- 1. Hoá đơn đã phát hành là chứng từ: không sửa, không xoá.
--
--    Sai thì lập hoá đơn THAY THẾ (TT 91 Điều 10) — bản cũ chỉ được đổi trạng
--    thái sang `replaced` kèm lý do, mọi nội dung khác giữ nguyên như lúc lên cơ
--    quan thuế. Số đã cấp gắn với ký hiệu và ngày lập mãi mãi, kể cả khi lượt gửi
--    thất bại và phải gửi lại.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sora_invoice_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Không xoá hoá đơn (id=%) — sai thì lập hoá đơn thay thế', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.state IN ('voided', 'replaced') THEN
    RAISE EXCEPTION 'Hoá đơn % đã ở trạng thái "%" — không sửa được nữa', OLD.id, OLD.state
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.invoice_no IS NOT NULL AND (
       NEW.invoice_no   IS DISTINCT FROM OLD.invoice_no
    OR NEW.serial       IS DISTINCT FROM OLD.serial
    OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date) THEN
    RAISE EXCEPTION 'Hoá đơn % đã cấp số % · % — không đổi số, ký hiệu hay ngày lập',
      OLD.id, OLD.serial, OLD.invoice_no
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.state = 'issued' AND (
       NEW.state NOT IN ('issued', 'replaced')
    OR to_jsonb(NEW) - ARRAY['state', 'void_reason', 'approval_id', 'voided_by']
       IS DISTINCT FROM
       to_jsonb(OLD) - ARRAY['state', 'void_reason', 'approval_id', 'voided_by']) THEN
    RAISE EXCEPTION 'Hoá đơn % đã phát hành — sai thì lập hoá đơn thay thế', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_guard
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION sora_invoice_guard();

--------------------------------------------------------------------------------
-- 2. Số đã cấp không được huỷ.
--
--    Dãy số phải liên tục (NĐ 254, Phụ lục mục 2): một số đã cấp mà chưa lên
--    được cơ quan thuế vẫn phải phát hành cho bằng được, huỷ nó là để lại một lỗ.
--    NOT VALID: dữ liệu thử cũ có thể còn bản huỷ mang số — chỉ chặn từ nay.
--------------------------------------------------------------------------------
ALTER TABLE invoices ADD CONSTRAINT invoices_numbered_not_voided
  CHECK (state <> 'voided' OR invoice_no IS NULL) NOT VALID;

--------------------------------------------------------------------------------
-- 3. Thuế suất của bia, rượu (VAT_RATE_PARAMS.alcohol).
--
--    Chép đúng giá trị `sales.vatRate` đang chạy, ở mọi cấp: deploy xong tiền
--    đơn không đổi một đồng. Bật VAT thật (món ăn 8%, bia rượu 10%) là việc kế
--    toán làm ở A6. Nạp bằng migration chứ không bằng seed: chạy lại seed đặt lại
--    mật khẩu các tài khoản Office mẫu (xem 9006).
--------------------------------------------------------------------------------
INSERT INTO parameters (key, branch_id, value, unit, overridable, sensitive)
SELECT 'sales.vatRateAlcohol', branch_id, value, unit, overridable, sensitive
  FROM parameters
 WHERE key = 'sales.vatRate'
ON CONFLICT DO NOTHING;
