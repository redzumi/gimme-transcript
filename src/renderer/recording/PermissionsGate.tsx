import React, { useState } from 'react'
import { Button } from '@mantine/core'
import type { RecordingPermission } from '../src/types/ipc'

interface Permissions {
  mic: boolean
  screenRecording: boolean
}

interface Props {
  permissions: Permissions
  platform: string
  onRecheck: () => void
}

export function PermissionsGate({ permissions, platform, onRecheck }: Props): React.JSX.Element {
  const [checking, setChecking] = useState(false)

  async function openSettings(permission: RecordingPermission): Promise<void> {
    await window.recordingApi.openSettings(permission)
  }

  async function recheck(): Promise<void> {
    setChecking(true)
    await new Promise((r) => setTimeout(r, 500))
    onRecheck()
    setChecking(false)
  }

  const requiresScreenRecording = platform === 'darwin'
  const canContinue = permissions.mic && (!requiresScreenRecording || permissions.screenRecording)

  return (
    <div
      className="w-[420px] rounded-[30px] border border-[rgba(255,255,255,0.6)] bg-[linear-gradient(180deg,rgba(255,248,244,0.96),rgba(255,255,255,0.88))] p-5 shadow-[0_28px_80px_rgba(77,42,66,0.18)] backdrop-blur-[24px]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b57a70]">
          Access check
        </p>
        <p className="mt-2 text-lg font-semibold text-[#24191f]">Permissions needed to record</p>
        <p className="mt-2 text-sm leading-6 text-[#7f6671]">
          Enable both inputs before starting so the recording window can capture voice and system
          audio correctly.
        </p>

        <div className="mb-4 mt-5 flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-[24px] border border-[#ecd8cf] bg-[#fffaf7] px-4 py-4">
            <div className="flex items-center gap-2">
              <span>🎤</span>
              <span className="text-xs text-[#5b4653]">Microphone</span>
              <span className="text-[9px] uppercase font-medium text-red-400 bg-red-50 px-1.5 py-0.5 rounded">
                required
              </span>
            </div>
            {permissions.mic ? (
              <span className="text-xs text-emerald-500">✓ granted</span>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                color="sunset"
                onClick={() => openSettings('microphone')}
              >
                Open Settings
              </Button>
            )}
          </div>

          {platform === 'darwin' && (
            <div className="flex items-center justify-between rounded-[24px] border border-[#ecd8cf] bg-[#fffaf7] px-4 py-4">
              <div className="flex items-center gap-2">
                <span>🖥</span>
                <span className="text-xs text-[#5b4653]">Screen Recording</span>
                <span className="text-[9px] uppercase font-medium text-[#ccb8c1] bg-[#f8f0f5] px-1.5 py-0.5 rounded">
                  for system audio
                </span>
              </div>
              {permissions.screenRecording ? (
                <span className="text-xs text-emerald-500">✓ granted</span>
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  color="lilac"
                  onClick={() => openSettings('screenRecording')}
                >
                  Open Settings
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            flex={1}
            color="sunset"
            radius="xl"
            disabled={checking}
            loading={checking}
            onClick={recheck}
          >
            {canContinue ? (checking ? 'Checking…' : 'Start Recording') : 'Recheck'}
          </Button>
          <Button
            size="sm"
            variant="subtle"
            color="gray"
            radius="xl"
            onClick={() => window.recordingApi.closeWindow()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
