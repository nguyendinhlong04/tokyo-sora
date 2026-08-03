-- Kỳ đánh số mã hiển thị: đổi từ NGÀY sang THÁNG cho khớp phần `yyMM` in trên mã.
--
-- Trước bản này số đếm chạy theo `business_date` (một dòng mỗi ngày) nhưng mã in ra
-- chỉ mang năm và tháng, nên hai đơn khác ngày trong cùng tháng cùng nhận
-- `ON-2608-0001`. Đặt bàn dính nặng nhất: ngày làm việc của một suất là ngày khách
-- ĐẾN ĂN, nên hai người cùng đặt hôm nay cho hai tối khác nhau tranh nhau đúng một
-- mã, và người thứ hai lãnh lỗi ràng buộc duy nhất ngay khi bấm xác nhận trên W6.
--
-- Mã đã đọc cho khách qua điện thoại thì không phát lại được, nên mốc mới lấy từ
-- SỐ LỚN NHẤT ĐÃ PHÁT trong tháng đó — đọc thẳng từ mã trong sổ, không suy từ số
-- đếm cũ (số đếm cũ là "đơn thứ mấy trong NGÀY", không dùng lại được).

INSERT INTO display_counters (branch_id, kind, business_date, counter)
SELECT
  branch_id,
  'order',
  make_date(2000 + substring(display_code, 4, 2)::int, substring(display_code, 6, 2)::int, 1),
  max(right(display_code, 4)::int)
FROM orders
WHERE display_code ~ '^[A-Z]{2}-[0-9]{4}-[0-9]{4}$'
GROUP BY 1, 2, 3
ON CONFLICT (branch_id, kind, business_date)
DO UPDATE SET counter = greatest(display_counters.counter, excluded.counter);

INSERT INTO display_counters (branch_id, kind, business_date, counter)
SELECT
  branch_id,
  'reservation',
  make_date(2000 + substring(display_code, 4, 2)::int, substring(display_code, 6, 2)::int, 1),
  max(right(display_code, 4)::int)
FROM reservations
WHERE display_code ~ '^[A-Z]{2}-[0-9]{4}-[0-9]{4}$'
GROUP BY 1, 2, 3
ON CONFLICT (branch_id, kind, business_date)
DO UPDATE SET counter = greatest(display_counters.counter, excluded.counter);

-- Dòng đếm theo ngày không còn ai đọc; để lại thì lần đầu của tháng sau vẫn cấp
-- trùng số đã phát.
DELETE FROM display_counters WHERE extract(day FROM business_date) <> 1;
