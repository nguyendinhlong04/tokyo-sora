-- Địa chỉ mạng của quán — lớp 2 của LUONG-QR-BAN.md.
--
-- Màn A6 chỉ hiện những tham số ĐÃ CÓ dòng trong bảng này, nên không có dòng này
-- thì người vận hành không có chỗ nào để khai địa chỉ Wi-Fi của quán, và lớp 2
-- vĩnh viễn coi như không ai đang ngồi trong quán.
--
-- Nạp bằng migration chứ không bằng seed: CSDL thật đã seed rồi, mà chạy lại seed
-- sẽ ĐẶT LẠI mật khẩu của các tài khoản Office mẫu — cái giá quá lớn để thêm một
-- dòng cấu hình.
--
-- Giá trị là CHUỖI ngăn bằng dấu phẩy, không phải mảng: ô nhập của A6 chỉ nhận
-- một giá trị đơn. Để trống ở cấp chuỗi là có chủ ý — mỗi chi nhánh một đường
-- truyền nên phải tự khai đè, và chưa khai thì sai theo hướng an toàn.
INSERT INTO parameters (key, branch_id, value, unit)
     VALUES ('table.branchNetworks', NULL, '""'::jsonb, 'địa chỉ, ngăn bằng dấu phẩy')
ON CONFLICT DO NOTHING;
