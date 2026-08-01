import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

interface QrCodeProps {
  /** Chuỗi VietQR (EMVCo) ở T13, hoặc địa chỉ mở app bàn ở P3 */
  value: string
  /** Cạnh mã in ra màn hình, px */
  size?: number
  label: string
}

/** Lề trắng tối thiểu quanh mã theo chuẩn — thiếu nó máy quét bắt rất chậm */
const QUIET_ZONE = 4

/**
 * Mã QR vẽ thẳng bằng SVG trong tiến trình.
 *
 * Không dùng dịch vụ sinh ảnh QR bên ngoài: CSP của cả ba app chặn ảnh khác miền,
 * và chuỗi VietQR mang số tài khoản lẫn số tiền của khách — không có lý do gì đem
 * sang máy chủ người khác chỉ để lấy một tấm ảnh đen trắng.
 *
 * Nền LUÔN sáng và module LUÔN tối, kể cả trong chủ đề tối của app: máy quét đọc
 * theo tương phản, mã trắng trên nền đen là mã không quét được trên nhiều máy.
 */
export function QrCode({ value, size = 260, label }: QrCodeProps) {
  const { path, span } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()

    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
      }
    }
    return { path: d, span: count + QUIET_ZONE * 2 }
  }, [value])

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      // Không khử răng cưa: viền module nhoè làm máy quét đọc sai ở cỡ nhỏ
      shapeRendering="crispEdges"
      className="rounded-sm"
    >
      <rect width={span} height={span} fill="var(--sora-washi-100)" />
      <path d={path} fill="var(--sora-bg-base)" />
    </svg>
  )
}
