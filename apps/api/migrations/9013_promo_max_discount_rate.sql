-- Trần giảm giá của khuyến mãi (CLAUDE.md §9.6) — tham số `promo.maxDiscountRate`.
--
-- Seed có khoá này từ 70fdf0a (22/10/2026), khi CSDL thật đã nạp từ trước; mà
-- db:seed từ chối CSDL đã có dữ liệu, nên CSDL đang chạy chỉ nhận được dòng này
-- qua migration. Thiếu dòng thì code vẫn lùi về 0,5 (LEGAL_MAX_DISCOUNT_RATE),
-- nhưng màn A6 chỉ hiện tham số ĐÃ CÓ dòng — chốt chặn pháp lý của B11 không ai
-- xem hay sửa được.
--
-- Dòng phải giống hệt dòng seed nạp (giá trị, đơn vị, nhạy cảm): trên CSDL mới
-- migration chạy TRƯỚC seed nên dòng ở đây là dòng được giữ — seed.test.ts so hai
-- bên. ON CONFLICT DO NOTHING: CSDL đã có dòng (nạp sau 70fdf0a, hoặc đã sửa ở A6)
-- giữ nguyên giá trị.
INSERT INTO parameters (key, branch_id, value, unit, sensitive)
     VALUES ('promo.maxDiscountRate', NULL, '0.5'::jsonb, 'tỉ lệ', true)
ON CONFLICT DO NOTHING;
