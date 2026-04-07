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
  const { isRecording, micLevel, speakerLevel, speakerAvailable, elapsed, stop } = useRecording()
  const [stopping, setStopping] = useState(false)

  async function handleStop(): Promise<void> {
    setStopping(true)
    await stop()
  }

  return (
    <div
      className="w-[360px] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/88 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-[18px]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#f3e5dd]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isRecording && !stopping && (
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          <span className="text-xs font-semibold text-[#24191f]">
            {stopping ? 'Saving…' : 'Recording'}
          </span>
        </div>
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-xs font-mono text-[#8f7982]">{formatTime(elapsed)}</span>
          <Button
            size="xs"
            color="sunset"
            loading={stopping}
            disabled={!isRecording}
            onClick={handleStop}
          >
            Stop
          </Button>
        </div>
      </div>

      {/* VU meters */}
      <div
        className="flex flex-col gap-3 px-3 py-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <VuMeter level={micLevel} label="Microphone" icon="🎤" available={true} />
        <VuMeter level={speakerLevel} label="System Audio" icon="🔊" available={speakerAvailable} />
      </div>
    </div>
  )
}
