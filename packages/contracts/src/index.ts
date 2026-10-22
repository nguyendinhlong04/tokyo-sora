// Đuôi `.js` là BẮT BUỘC: package này là ESM thuần, và Node ESM không tự đoán
// đuôi file như bundler. Thiếu nó thì Vite vẫn chạy nhưng bản build của API chết
// khi khởi động — lỗi chỉ lộ ra lúc chạy thật, không lộ lúc typecheck.
export * from './money.js'
export * from './phone.js'
export * from './domain.js'
export * from './events.js'
export * from './invoice.js'
export * from './permissions.js'
export * from './promotions.js'
export * from './site.js'
export * from './org.js'
export * from './org-standards.js'
export * from './tasks.js'
export * from './work-reports.js'
export * from './kpi.js'
