const COLORS = {
  accent: 'var(--color-accent)',
  neutral: 'var(--color-neutral-400, #a3a3a3)',
} as const

interface SpinnerProps {
  className?: string
  color?: keyof typeof COLORS
  size?: number
}

export function Spinner({ className, color = 'accent', size = 48 }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke={COLORS[color]}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="94"
        strokeDashoffset="70"
        opacity="0.9"
      />
    </svg>
  )
}
