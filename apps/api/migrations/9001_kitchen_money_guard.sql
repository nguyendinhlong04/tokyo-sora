-- Vé bếp không bao giờ biết giá (TRIEN-KHAI nguyên tắc 3).
--
-- Lược đồ đã không có cột tiền nào trong tickets/ticket_items. Event trigger dưới
-- đây chặn luôn việc THÊM cột tiền về sau — biến quy tắc nghiệp vụ thành ràng buộc
-- CSDL thay vì trông vào kỷ luật code.
--
-- Tách riêng file vì `CREATE EVENT TRIGGER` cần quyền superuser mà Supabase không
-- cấp (họ có `supautils` với privileged role nhưng không đảm bảo mọi gói). Bọc DO
-- block để migration BỎ QUA ÊM khi thiếu quyền: hai lớp bảo vệ còn lại — trigger
-- append-only và quyền role — vẫn chạy bình thường.

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

DO $$
BEGIN
  EXECUTE 'DROP EVENT TRIGGER IF EXISTS sora_kitchen_money_guard';
  EXECUTE 'CREATE EVENT TRIGGER sora_kitchen_money_guard '
       || 'ON ddl_command_end WHEN TAG IN (''ALTER TABLE'', ''CREATE TABLE'') '
       || 'EXECUTE FUNCTION sora_no_money_in_kitchen()';
  RAISE NOTICE 'sora_kitchen_money_guard: đã bật';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'sora_kitchen_money_guard: BỎ QUA (thiếu quyền superuser — bình thường trên Supabase)';
  WHEN OTHERS THEN
    RAISE NOTICE 'sora_kitchen_money_guard: BỎ QUA (%)', SQLERRM;
END
$$;
