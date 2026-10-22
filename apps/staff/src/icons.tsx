import type { ReactNode } from 'react'

/** Icon của Kênh nhân viên — inline SVG, nét 1.5, khung 24 (§4.7) */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
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

export const IconCalendar = () => (
  <Icon>
    <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
    <path d="M8 3.5v4M16 3.5v4M4 10h16" />
  </Icon>
)

export const IconBell = () => (
  <Icon>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
)

export const IconWallet = () => (
  <Icon>
    <path d="M4 7.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M4 7.5 15 4.5v3M16 13.5h1.5" />
  </Icon>
)

export const IconBack = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)
