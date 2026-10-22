import type { ReactNode } from 'react'

/**
 * Icon của Sora Table — một chỗ cho mọi nét vẽ dùng từ hai nơi trở lên (§4.7).
 *
 * Nét mặc định 1.5 theo hệ thiết kế. Riêng dấu cộng/trừ trên nút vàng đặc dày hơn
 * (1.8–2.4): vẽ 14–16px trên nền vàng, nét 1.5 nhoè thành một vệt mờ ở khoảng
 * cách một cánh tay.
 */
function Icon({
  size = 18,
  stroke = 1.5,
  className,
  children,
}: {
  size?: number
  stroke?: number
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  )
}

type P = { size?: number; stroke?: number; className?: string }

export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
)

export const IconMinus = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Icon>
)

export const IconFilter = (p: P) => (
  <Icon {...p}>
    <path d="M3 6h18" />
    <path d="M6 12h12" />
    <path d="M10 18h4" />
  </Icon>
)

export const IconBell = (p: P) => (
  <Icon {...p}>
    <path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
)

export const IconReceipt = (p: P) => (
  <Icon {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
  </Icon>
)

export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Icon>
)

export const IconBack = (p: P) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)

export const IconArrowRight = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Icon>
)

export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const IconWarning = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 9.5v5" />
    <path d="M12 17.5v.01" />
  </Icon>
)

export const IconOffline = (p: P) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M8.5 12.5a5 5 0 0 1 5.6-.9" />
    <path d="M5 9a10 10 0 0 1 3.6-2.2" />
    <path d="M13 6.1A10 10 0 0 1 19 9" />
    <path d="M12 17.5v.01" />
  </Icon>
)

export const IconPencil = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
)

export const IconBook = (p: P) => (
  <Icon {...p}>
    <path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2" />
    <path d="M12 6.5c1.5-1.5 4-2 8-2v13c-4 0-6.5.5-8 2" />
    <path d="M12 6.5v13" />
  </Icon>
)

export const IconCopy = (p: P) => (
  <Icon {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icon>
)

export const IconQr = (p: P) => (
  <Icon {...p}>
    <path d="M4 4h6v6H4z" />
    <path d="M14 4h6v6h-6z" />
    <path d="M4 14h6v6H4z" />
    <path d="M14 14h2v2h-2z" />
    <path d="M18 18h2v2h-2z" />
    <path d="M18 14h2" />
    <path d="M14 18h2" />
  </Icon>
)

export const IconLock = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)

export const IconStar = ({ filled = false, ...p }: P & { filled?: boolean }) => (
  <svg
    width={p.size ?? 26}
    height={p.size ?? 26}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={p.stroke ?? 1.5}
    strokeLinejoin="round"
    aria-hidden
    className={p.className}
  >
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </svg>
)

/**
 * Ngọn lửa của nhãn khuyến mãi — tô ĐẶC chứ không vẽ nét như các icon khác: vẽ
 * 12px trên nền cam than, nét 1.5 chỉ còn là một vệt (cùng lý do dấu +/− nét dày).
 */
export const IconFlame = ({ size = 12, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    className={className}
  >
    <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.2.3 1.8 1.2 2.8 2.2 3.2-.6-3.4.3-6.4.3-9Z" />
  </svg>
)
