import React, { useMemo } from 'react'
import { Button } from '@mantine/core'
import { useRecording } from './useRecording'
import type { TrackStatus } from './recordingUtils'

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function shortStatus(status: TrackStatus, available: boolean): string {
  if (status === 'recording') return 'on'
  if (status === 'starting') return '...'
  if (status === 'stopping') return 'saving'
  if (status === 'error') return 'off'
  return available ? 'ready' : 'off'
}

function meterColor(available: boolean, level: number): string {
  if (!available) return 'bg-[#e9d8d0]'
  if (level > 0.6) return 'bg-[#ff4d6d]'
  if (level > 0.25) return 'bg-[#ff9d53]'
  return 'bg-[#d8b9aa]'
}

function CompactTrack(props: {
  title: string
  icon: string
  status: TrackStatus
  level: number
  bars: number[]
  available: boolean
}): React.JSX.Element {
  return (
    <div className="rounded-[11px] border border-[#ead8cf] bg-white px-[4px] py-[3px]">
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-[#fff6f1] text-[9px]">
            {props.icon}
          </span>
          <span className="truncate text-[10px] font-semibold text-[#22181d]">{props.title}</span>
        </div>
        <span className="text-[8px] text-[#8c7580]">
          {shortStatus(props.status, props.available)}
        </span>
      </div>

      <div className="mt-0.5 flex h-[11px] items-end gap-[1px] rounded-[7px] bg-[#fff8f4] px-[1px] py-[2px]">
        {props.bars.slice(0, 3).map((bar, index) => {
          const active = props.available ? Math.max(0.16, bar) : 0.08
          return (
            <div
              key={`${props.title}-${index}`}
              className={`w-[3px] flex-none rounded-full ${meterColor(props.available, props.level)}`}
              style={{
                height: `${Math.max(4, active * 100)}%`,
                opacity: props.available ? 0.35 + active * 0.65 : 0.16
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function RecordingPanel(): React.JSX.Element {
  const { elapsed, isStarting, isStopping, microphone, stop, system } = useRecording()
  const isLive = microphone.status === 'recording' || system.status === 'recording'
  const title = useMemo(() => {
    if (isStopping) return 'Saving'
    if (isStarting) return 'Starting'
    if (isLive) return 'Recording'
    return 'Ready'
  }, [isLive, isStarting, isStopping])

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-[#ead8cf] bg-[#fffaf5] shadow-[0_14px_36px_rgba(77,42,66,0.14)]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <header
        className="flex items-center justify-between gap-1 border-b border-[#f0ded4] bg-white px-[7px] py-[3px]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ff4d6d] shadow-[0_0_0_3px_rgba(255,77,109,0.14)] animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b57a70]">
              Live
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold leading-none text-[#24191f]">{title}</p>
        </div>

        <div
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="rounded-[10px] border border-[#edd9d1] bg-[#fffaf7] px-1.5 py-0.5 text-right">
            <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#a3858f]">
              Time
            </p>
            <p className="mt-0.5 text-[10px] font-semibold tracking-[0.04em] text-[#24191f]">
              {formatTime(elapsed)}
            </p>
          </div>

          <Button
            size="compact-xs"
            color="sunset"
            radius="xl"
            loading={isStopping}
            disabled={isStarting || isStopping || !isLive}
            onClick={() => {
              void stop()
            }}
          >
            Stop
          </Button>
        </div>
      </header>

      <main
        className="grid grid-cols-2 gap-0.5 px-[3px] py-[3px]"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <CompactTrack
          title="Mic"
          icon="🎤"
          status={microphone.status}
          level={microphone.level}
          bars={microphone.bars}
          available={microphone.available}
        />

        <CompactTrack
          title="System"
          icon="🔊"
          status={system.status}
          level={system.level}
          bars={system.bars}
          available={system.status !== 'idle' || system.available}
        />
      </main>
    </div>
  )
}
