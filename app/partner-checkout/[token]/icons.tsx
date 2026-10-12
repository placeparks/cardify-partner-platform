import type { ReactNode } from 'react'

type IconName = 'lock' | 'arrow' | 'back' | 'cards' | 'truck' | 'warning'
export function CheckoutIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    back: <path d="M20 12H5m6-6-6 6 6 6" />,
    cards: <><rect x="8" y="3" width="12" height="17" rx="2" /><path d="M5 6H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10M12 9h4m-4 4h4" /></>,
    truck: <><path d="M3 5h11v12H3zM14 9h4l3 4v4h-3m-4 0h-3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    warning: <><path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3v.1" /></>,
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
