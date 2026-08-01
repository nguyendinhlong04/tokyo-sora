-- Phát sự kiện qua Supabase Realtime.
--
-- Thay cho Socket.IO + tiến trình dispatcher: mỗi dòng ghi vào `outbox_events` sẽ
-- được trigger này phát vào từng phòng trong cột `rooms`. Nhờ vậy:
--   · Giữ nguyên đảm bảo "ghi sự kiện CÙNG transaction với thay đổi nghiệp vụ" —
--     rollback thì không có gì bay đi, commit thì chắc chắn có người phát.
--   · Không cần tiến trình chạy nền, nên chạy được trên nền serverless (Vercel).
--
-- `realtime.send()` là hàm của Supabase. Trên Postgres tự dựng (dev, test) schema
-- `realtime` không tồn tại nên trigger tự bỏ qua — cùng một bộ migration chạy được
-- ở cả hai nơi, không có nhánh riêng cho môi trường.

CREATE OR REPLACE FUNCTION sora_broadcast_outbox() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  room text;
BEGIN
  IF to_regnamespace('realtime') IS NULL THEN
    RETURN NEW;  -- Postgres tự dựng: không có Realtime, bỏ qua
  END IF;

  FOREACH room IN ARRAY NEW.rooms LOOP
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'seq',     NEW.id,
          'topic',   NEW.topic,
          'branchId', NEW.branch_id,
          'payload', NEW.payload,
          'at',      NEW.created_at
        ),
        NEW.topic,   -- tên sự kiện
        room,        -- tên kênh = tên phòng
        true         -- kênh riêng tư: buộc qua RLS, không ai nghe lỏm
      );
    EXCEPTION WHEN OTHERS THEN
      -- Phát hỏng KHÔNG được làm hỏng giao dịch nghiệp vụ. Sự kiện vẫn nằm trong
      -- outbox với dispatched_at NULL nên client bắt kịp được bằng GET /api/events.
      RAISE WARNING 'Không phát được sự kiện % vào phòng %: %', NEW.id, room, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbox_events_broadcast ON outbox_events;
CREATE TRIGGER outbox_events_broadcast
  AFTER INSERT ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION sora_broadcast_outbox();
