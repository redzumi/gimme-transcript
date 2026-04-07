import React from 'react'

interface Props {
  level: number // 0–1
  label: string
  icon: string
  available: boolean
}

export function VuMeter({ level, label, icon, available }: Props): React.JSX.Element {
  const barWidth = available ? Math.round(level * 100) : 0

  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-base w-5 text-center">{icon}</span>
      <div className="flex-1">
        <p className="text-[10px] font-medium text-[#5b4653] mb-0.5 uppercase tracking-wide leading-none">
          {label}
        </p>
        <div className="h-1.5 w-full rounded-full bg-[#f3e5dd] overflow-hidden">
          {available ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ff7458] to-[#ff4d6d] transition-all duration-75"
              style={{ width: `${barWidth}%` }}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-[#e0d0d8]" />
          )}
        </div>
      </div>
      {!available && (
        <span className="text-[9px] text-[#ccb8c1] whitespace-nowrap">unavailable</span>
      )}
    </div>
  )
}
