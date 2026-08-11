-- Xếp lại "Trần Phú" và "Hà Huy Tập" theo NGHĨA MỚI sau sáp nhập 01-07-2025.
--
--   psql "<DATABASE_URL>" -f scripts/vung-giao-ten-phuong-moi.sql
--
-- Vì sao cần: hai cái tên này tồn tại ở CẢ HAI hệ hành chính nhưng chỉ những
-- vùng đất khác hẳn nhau, mà bảng vùng giao đang xếp chúng theo nghĩa CŨ —
-- tức theo hai phường nhỏ ở trung tâm thành phố. Khách ở vùng mới gõ đúng tên
-- phường của mình thì được tính giá của một chỗ khác, gần hơn nhiều.
--
-- Vòng đích KHÔNG phải tôi đoán, mà suy từ chính bảng giá này: mỗi phường mới
-- gồm những phường cũ nào, những phường cũ đó quán đang xếp ở vòng nào.
--
--   Trần Phú (mới)   = Thạch Trung + Đồng Môn + Thạch Hạ + Hộ Độ
--                      → cả BỐN đang ở Vòng 3, nên Trần Phú về Vòng 3.
--   Hà Huy Tập (mới) = Tân Lâm Hương + Thạch Đài + phần còn lại Đại Nài
--                      → chỉ Đại Nài có giá, ở Vòng 2, nên theo Vòng 2.
--
-- LƯU Ý một hệ quả: Tân Lâm Hương và Thạch Đài hiện KHÔNG nằm trong vùng nào.
-- Sau script này, khách ở đó gõ "Hà Huy Tập" sẽ được nhận giao với giá Vòng 2
-- (25.000đ, 35 phút). Nếu quán chưa muốn giao tới đó, bỏ hẳn "Hà Huy Tập" khỏi
-- mọi vùng thay vì chạy nửa dưới của script.
--
-- Trung tâm thành phố KHÔNG mất vùng phủ: những phường cũ hợp thành Thành Sen
-- đều đang được khai bằng chính tên của chúng (Bắc Hà, Nam Hà, Tân Giang,
-- Thạch Quý, Văn Yên, Thạch Hưng), nên chỗ đó vẫn tra ra vùng như trước.
--
-- Chạy lại được nhiều lần: gỡ khỏi MỌI vùng trước rồi mới thêm vào đúng một
-- vùng, nên lần chạy thứ hai ra cùng kết quả chứ không nhân đôi tên.

BEGIN;

-- Trần Phú → Vòng 3
UPDATE delivery_zones SET wards = array_remove(wards, 'Trần Phú')
 WHERE branch_id = 'td';
UPDATE delivery_zones SET wards = wards || ARRAY['Trần Phú']::text[]
 WHERE branch_id = 'td' AND name = 'Vòng 3 · Ven Thành Phố';

-- Hà Huy Tập → Vòng 2
UPDATE delivery_zones SET wards = array_remove(wards, 'Hà Huy Tập')
 WHERE branch_id = 'td';
UPDATE delivery_zones SET wards = wards || ARRAY['Hà Huy Tập']::text[]
 WHERE branch_id = 'td' AND name = 'Vòng 2 · Nội Thành';

COMMIT;

-- Kiểm lại: mỗi tên phải xuất hiện ở ĐÚNG MỘT vùng. Nằm ở hai vùng thì
-- `quote()` ném lỗi zone_overlap và khách không đặt được đơn nào.
SELECT name, fee_vnd, wards FROM delivery_zones
 WHERE branch_id = 'td' ORDER BY sort;
