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

export const IconTasks = () => (
  <Icon>
    <rect x="5" y="4" width="14" height="17" rx="1.5" />
    <path d="M9 4V3h6v1M8.5 10.5l1.5 1.5 3-3M8.5 16h7" />
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

export const IconChart = () => (
  <Icon>
    <path d="M4 20h16M7 16.5V12M12 16.5V7M17 16.5v-6.5" />
  </Icon>
)

export const IconBack = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
)
