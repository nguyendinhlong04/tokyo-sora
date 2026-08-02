-- Sổ kho là sổ bất biến, cùng luật với sổ doanh thu (§4.3.2).
--
-- Sửa một dòng đã ghi nghĩa là đổi giá vốn hàng bán của một kỳ đã chốt mà không
-- để lại dấu vết — đúng thứ khoá sổ F6 sinh ra để ngăn. Ghi sai thì ghi bút toán
-- ngược (`sale_reversal`, `count_adjust`), không sửa dòng cũ.
--
-- `sora_append_only()` đã được định nghĩa ở 9000_guards.sql.

CREATE TRIGGER stock_moves_append_only
  BEFORE UPDATE OR DELETE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION sora_append_only();
