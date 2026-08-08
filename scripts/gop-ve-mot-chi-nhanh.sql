-- Gộp về một chi nhánh: đổi "cg" thành cơ sở Hà Tĩnh, xoá hẳn "ht" và "td".
--
-- CHẠY MỘT LẦN. Xoá xong không hoàn lại được, nên nó nằm ở scripts/ chứ không ở
-- migrations/ — thư mục kia chạy tự động mỗi lần deploy.
--
--   psql "<DATABASE_URL>" -f scripts/gop-ve-mot-chi-nhanh.sql
--
-- Đã đếm trước khi viết: ht + td kéo theo đúng 62 dòng ở 9 bảng, KHÔNG dòng nào
-- là đơn hàng, phiên bàn hay vé bếp. Chi nhánh cg thì giữ nguyên (nó đang mang
-- 21 đơn, 18 bàn, 3 vùng giao) — chỉ đổi tên và địa chỉ.
--
-- Thứ tự xoá đi từ con lên cha vì mọi khoá ngoại trỏ vào branches đều là
-- NO ACTION, không có ON DELETE CASCADE.

BEGIN;

-- Hai tin tuyển dụng đang đăng cho ht/td: chuyển thành "tuyển cả chuỗi" chứ
-- không xoá. Yêu cầu là bỏ chi nhánh, không phải bỏ tin.
UPDATE site_jobs SET branch_id = NULL WHERE branch_id IN ('ht', 'td');

DELETE FROM reservation_holds  WHERE branch_id IN ('ht', 'td');
DELETE FROM reservations       WHERE branch_id IN ('ht', 'td');
DELETE FROM tables             WHERE branch_id IN ('ht', 'td');  -- 42 dòng
DELETE FROM areas              WHERE branch_id IN ('ht', 'td');
DELETE FROM config_bundles     WHERE branch_id IN ('ht', 'td');
DELETE FROM display_counters   WHERE branch_id IN ('ht', 'td');
DELETE FROM parameters         WHERE branch_id IN ('ht', 'td');
DELETE FROM printers           WHERE branch_id IN ('ht', 'td');
DELETE FROM branches           WHERE id        IN ('ht', 'td');

UPDATE branches
   SET name    = 'Hà Tĩnh',
       address = '52 - 54 Hàm Nghi, Hà Tĩnh'
 WHERE id = 'cg';

COMMIT;

-- Kiểm lại: phải còn đúng một dòng.
SELECT id, name, address, phone, active FROM branches ORDER BY id;
