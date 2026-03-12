interface LogoProps {
  size?: number
}

export function Logo({ size = 24 }: LogoProps): React.JSX.Element {
  const id = `logo-grad-${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${id})`} />
      {/* Wave (audio) transitioning to text lines */}
      <path
        d="M 3 8.5 Q 4.5 6.5 6 8.5 Q 7.5 10.5 9 8.5"
        stroke="white"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="10.5" y1="8.5" x2="21" y2="8.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="3" y1="13.5" x2="21" y2="13.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="3" y1="18.5" x2="15.5" y2="18.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
