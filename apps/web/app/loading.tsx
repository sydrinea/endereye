export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <svg
        className="animate-spin"
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="94"
          strokeDashoffset="70"
          opacity="0.9"
        />
      </svg>
    </div>
  )
}
