-- Một nguồn cho "khách chấm bao nhiêu sao".
--
-- Khách chấm ở HAI chỗ: thẻ chấm sao trên hoá đơn tại bàn (T15 → `table_feedback`,
-- một phiếu mỗi phiên bàn) và thẻ sau thanh toán (B13 → `feedback`, một phiếu mỗi
-- đơn, nguồn 'table' hoặc 'online'). Hai bảng chưa nối với nhau, nên điểm hài lòng
-- của B1, của báo cáo cuối ngày và của KPI mỗi chỗ đếm một kiểu.
--
-- View gộp cả hai, MỘT phiếu cho mỗi bữa ăn: phiên bàn đã có phiếu B13 (gắn đơn
-- của phiên) thì phiếu T15 của phiên đó bỏ — B13 có đơn, có ca, có hàng đợi xử lý.
-- View, không phải bảng: không có dữ liệu thứ ba để lệch với hai nguồn.
CREATE OR REPLACE VIEW customer_ratings AS
SELECT 'feedback'::text      AS origin,
       f.id                  AS origin_id,
       f.branch_id,
       f.business_date,
       f.stars,
       f.comment,
       f.source              AS channel,
       f.order_id,
       o.table_session_id,
       f.shift_id,
       f.created_at
  FROM feedback f
  JOIN orders o ON o.id = f.order_id
UNION ALL
SELECT 'table_feedback'::text,
       tf.id,
       tf.branch_id,
       tf.business_date,
       tf.stars,
       tf.comment,
       'table'::text,
       NULL::bigint,
       tf.table_session_id,
       NULL::bigint,
       tf.created_at
  FROM table_feedback tf
 WHERE NOT EXISTS (
         SELECT 1
           FROM feedback f
           JOIN orders o ON o.id = f.order_id
          WHERE o.table_session_id = tf.table_session_id
       );
