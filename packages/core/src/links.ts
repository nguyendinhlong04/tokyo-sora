/**
 * Đường dẫn do NGƯỜI DÙNG dán vào (đính kèm văn bản, minh chứng việc) chỉ được
 * mở khi là https. Chặn `javascript:`, `data:` và mọi thứ không phải https ngay
 * tại chỗ hiện link — máy chủ đã kiểm lúc lưu, đây là lớp thứ hai cho dữ liệu cũ
 * hoặc dữ liệu đi đường khác.
 *
 * Trả `null` thì nơi gọi hiện chữ thường, không hiện thẻ <a>.
 */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}
