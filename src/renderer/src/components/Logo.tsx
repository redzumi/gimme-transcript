import logoSvg from '../assets/logo.svg'

interface LogoProps {
  size?: number
  className?: string
}

export function Logo({ size = 28, className = '' }: LogoProps): React.JSX.Element {
  const width = Math.round(size * 3)

  return (
    <img
      src={logoSvg}
      alt="Gimme Transcript logo"
      width={width}
      height={size}
      className={`object-cover object-center shrink-0 ${className}`.trim()}
      style={{ width, height: size }}
    />
  )
}
