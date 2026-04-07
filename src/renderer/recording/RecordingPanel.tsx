import React, { useState } from 'react'
import { Button } from '@mantine/core'
import { VuMeter } from './VuMeter'
import { useRecording } from './useRecording'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RecordingPanel(): React.JSX.Element {
  const {
    isRecording,
    micLevel,
    micBands,
    speakerLevel,
    speakerBands,
    speakerAvailable,
    elapsed,
    stop
  } = useRecording()
  const [stopping, setStopping] = useState(false)

  const headline = stopping
    ? 'Saving capture…'
    : isRecording
      ? 'Recording in progress'
      : 'Preparing capture'

  async function handleStop(): Promise<void> {
    setStopping(true)
    await stop()
  }

  return (
    <div
      className="w-[420px] overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.6)] bg-[linear-gradient(180deg,rgba(255,248,244,0.96),rgba(255,255,255,0.88))] shadow-[0_28px_80px_rgba(77,42,66,0.18)] backdrop-blur-[24px]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="border-b border-[#f3e5dd] px-5 py-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {isRecording && !stopping && (
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff4d6d] shadow-[0_0_0_6px_rgba(255,77,109,0.14)] animate-pulse" />
              )}
              <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#b57a70]">
                Live capture
              </span>
            </div>
            <p className="mt-2 text-lg font-semibold text-[#24191f]">{headline}</p>
          </div>

          <div
            className="rounded-[22px] bg-white/90 px-4 py-3 text-right shadow-[0_12px_26px_rgba(77,42,66,0.08)]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a38792]">
              Elapsed
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[0.12em] text-[#24191f]">
              {formatTime(elapsed)}
            </p>
          </div>
        </div>
      </div>

      <div
        className="space-y-4 bg-[radial-gradient(circle_at_top,rgba(255,183,161,0.22),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,247,243,0.58))] px-5 py-5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-[26px] border border-[#efdcd3] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div>
            <p className="text-sm font-medium text-[#24191f]">Dual-source capture</p>
            <p className="mt-1 text-xs leading-6 text-[#7f6671]">
              Microphone is always recorded. System audio joins automatically when available.
            </p>
          </div>

          <Button
            size="sm"
            color="sunset"
            radius="xl"
            loading={stopping}
            disabled={!isRecording}
            onClick={handleStop}
          >
            Stop
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <VuMeter level={micLevel} bars={micBands} label="Microphone" icon="🎤" available={true} />
          <VuMeter
            level={speakerLevel}
            bars={speakerBands}
            label="System Audio"
            icon="🔊"
            available={speakerAvailable}
          />
        </div>
      </div>
    </div>
  )
}
