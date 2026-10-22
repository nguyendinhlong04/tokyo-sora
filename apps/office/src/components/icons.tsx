import type { ReactNode } from 'react'

/**
 * Icon của Office — inline SVG, nét 1.5, khung 24 (§4.7). Icon dùng ở hai màn
 * trở lên thì gom vào đây; các màn cũ còn icon rải rác, chuẩn hoá khi chạm.
 */
function Icon({ size = 20, children }: { size?: 20 | 24; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconClose = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const IconChevron = ({ open = false }: { open?: boolean }) => (
  <Icon>
    <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
  </Icon>
)

export const IconSearch = () => (
  <Icon>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Icon>
)

export const IconPrint = () => (
  <Icon>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
    <path d="M7 14h10v6H7z" />
  </Icon>
)

export const IconBell = () => (
  <Icon>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
)

export const IconUser = () => (
  <Icon>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Icon>
)
