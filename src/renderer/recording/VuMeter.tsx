import React from 'react'

interface Props {
  level: number // 0–1
  bars: number[]
  label: string
  icon: string
  available: boolean
}

export function VuMeter({ level, bars, label, icon, available }: Props): React.JSX.Element {
  const intensity = available ? Math.max(0.18, level) : 0.12

  return (
    <div className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,248,244,0.86))] p-4 shadow-[0_12px_28px_rgba(77,42,66,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-[0_10px_22px_rgba(77,42,66,0.08)]">
            {icon}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f7982]">
              {label}
            </p>
            <p className="mt-1 text-sm font-medium text-[#24191f]">
              {available ? 'Input detected' : 'Input unavailable'}
            </p>
          </div>
        </div>

        <div className="rounded-full bg-[#fff1ea] px-2.5 py-1 text-[11px] font-semibold text-[#ff6d5a]">
          {Math.round(level * 100)}%
        </div>
      </div>

      <div className="flex h-20 items-end gap-1.5 overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,#fff7f2,#fff1ea)] px-3 py-3">
        {bars.map((bar, index) => {
          const active = available ? Math.max(0.12, bar) : 0.08

          return (
            <div
              key={`${label}-${index}`}
              className="min-w-0 flex-1 rounded-full bg-gradient-to-t from-[#ff6a59] via-[#ff7d63] to-[#ffb59d] transition-[height,opacity,transform] duration-100"
              style={{
                height: `${Math.max(12, active * 100)}%`,
                opacity: available ? 0.45 + active * 0.55 : 0.22,
                transform: `scaleY(${0.92 + active * 0.08})`
              }}
            />
          )
        })}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f1dfd8]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#ff8a66] via-[#ff6a59] to-[#ff4d6d] transition-all duration-100"
          style={{ width: `${Math.round(intensity * 100)}%` }}
        />
      </div>

      {!available && (
        <p className="mt-2 text-[11px] text-[#ac96a0]">
          Разрешение не выдано или источник сейчас недоступен.
        </p>
      )}
    </div>
  )
}
