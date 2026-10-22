-- iPad gắn bàn (CLAUDE.md §9.1) — phần drizzle không sinh được.
--
-- Khoá ngoại từ thiết bị và mã ghép tới bàn: cột khai ở `identity.ts`, còn bảng
-- `tables` ở `floorplan.ts` — file đó đã nhập `branches`/`staff` từ `identity.ts`,
-- khai khoá ngoại trong schema là hai file nhập vòng nhau. Bàn không bị xoá cứng
-- (chỉ tắt `active`), nên khoá ngoại chỉ chặn một mã ghép trỏ vào bàn không tồn tại.
ALTER TABLE devices
  ADD CONSTRAINT devices_table_id_tables_id_fk FOREIGN KEY (table_id) REFERENCES tables (id);

ALTER TABLE pairing_codes
  ADD CONSTRAINT pairing_codes_table_id_tables_id_fk FOREIGN KEY (table_id) REFERENCES tables (id);

-- Gỡ luồng QR điện thoại: lớp "đang ngồi trong Wi-Fi quán" đi theo nó. Xoá ở 9007
-- chứ không ở 0031 vì trên CSDL mới 9006 chạy SAU 0031 và sẽ nạp lại dòng này.
-- `parameter_history` giữ nguyên — sổ bất biến.
DELETE FROM parameters WHERE key = 'table.branchNetworks';
