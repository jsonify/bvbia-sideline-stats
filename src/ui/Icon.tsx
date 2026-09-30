import type { SVGProps } from 'react'

const paths = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  ball: <><circle cx="12" cy="12" r="9" /><path d="M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z" /><path d="M12 3v5M15.5 10.5L20 9M14.2 14.5l2.8 3.7M9.8 14.5L7 18.2M8.5 10.5L4 9" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  share: <><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></>,
  chevron: <path d="M9 5l7 7-7 7" />,
} as const

export type IconName = keyof typeof paths
export const iconNames = Object.keys(paths) as IconName[]

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  /** Accessible label; if omitted the icon is decorative. */
  title?: string
}

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title}
      aria-hidden={title ? undefined : true} focusable="false" {...rest}>
      {paths[name]}
    </svg>
  )
}
