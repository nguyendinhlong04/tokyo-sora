-- Phân quyền kênh Realtime.
--
-- Với Socket.IO, server gán phòng lúc handshake nên client không tự join bừa được.
-- Client giờ nối THẲNG tới Supabase nên việc kiểm soát đó phải nằm ở CSDL: API ký
-- JWT mang phạm vi của người dùng (chi nhánh · trạm · phiên bàn), chính sách dưới
-- đây đối chiếu tên kênh với các claim ấy.
--
-- Bỏ qua êm trên Postgres tự dựng (không có schema `realtime`) để cùng một bộ
-- migration chạy được ở cả dev lẫn Supabase.

CREATE OR REPLACE FUNCTION sora_claim(name text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> name,
    ''
  );
$$;

/**
 * Người đang nghe có được vào kênh này không.
 * Quy tắc bám đúng bảng kênh ở TRIEN-KHAI §6.
 */
CREATE OR REPLACE FUNCTION sora_can_listen(room text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  actor   text := sora_claim('sora_actor');
  branch  text := sora_claim('sora_branch');
  station text := sora_claim('sora_station');
  session text := sora_claim('sora_session');
BEGIN
  IF actor IS NULL OR branch IS NULL THEN
    RETURN false;
  END IF;

  -- Kênh riêng của một lượt khách ngồi bàn: chỉ đúng phiên đó
  IF room LIKE 'table-session:%' THEN
    RETURN session IS NOT NULL AND room = 'table-session:' || session;
  END IF;

  -- Mọi kênh còn lại đều thuộc một chi nhánh
  IF room NOT LIKE 'branch:' || branch || ':%' THEN
    RETURN false;
  END IF;

  -- Màn bếp ghim cứng một trạm: chỉ nghe vé của trạm mình
  IF room LIKE 'branch:%:station:%' THEN
    RETURN station IS NOT NULL
       AND room = 'branch:' || branch || ':station:' || station;
  END IF;

  -- Cấu hình phát cho mọi thiết bị trong chi nhánh
  IF room = 'branch:' || branch || ':config' THEN
    RETURN true;
  END IF;

  -- Khách không bao giờ nghe được luồng vận hành
  IF actor = 'customer' THEN
    RETURN false;
  END IF;

  RETURN room IN (
    'branch:' || branch || ':orders',
    'branch:' || branch || ':tables',
    'branch:' || branch || ':expo',
    'branch:' || branch || ':print'
  );
END;
$$;

DO $$
BEGIN
  IF to_regnamespace('realtime') IS NULL THEN
    RAISE NOTICE 'RLS Realtime: BỎ QUA (Postgres tự dựng, không có schema realtime)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS sora_listen ON realtime.messages';
  EXECUTE 'CREATE POLICY sora_listen ON realtime.messages FOR SELECT TO authenticated '
       || 'USING (sora_can_listen(realtime.topic()))';

  -- Không ai được TỰ PHÁT vào kênh: sự kiện chỉ sinh từ trigger trên outbox_events,
  -- chạy dưới quyền định nghĩa hàm nên không bị policy này chặn.
  EXECUTE 'DROP POLICY IF EXISTS sora_no_client_broadcast ON realtime.messages';
  EXECUTE 'CREATE POLICY sora_no_client_broadcast ON realtime.messages FOR INSERT TO authenticated '
       || 'WITH CHECK (false)';

  RAISE NOTICE 'RLS Realtime: đã bật';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS Realtime: BỎ QUA (thiếu quyền trên realtime.messages)';
  WHEN OTHERS THEN
    RAISE NOTICE 'RLS Realtime: BỎ QUA (%)', SQLERRM;
END
$$;
