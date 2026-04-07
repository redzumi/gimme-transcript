import React, { useState } from 'react'
import { Button } from '@mantine/core'

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

  async function openSettings(permission: string): Promise<void> {
    await window.recordingApi.openSettings(permission)
  }

  async function recheck(): Promise<void> {
    setChecking(true)
    await new Promise((r) => setTimeout(r, 500))
    onRecheck()
    setChecking(false)
  }

  return (
    <div
      className="w-[360px] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/88 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-[18px] p-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <p className="text-xs font-semibold text-[#24191f] mb-3">Permissions needed to record</p>

        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
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
            <div className="flex items-center justify-between">
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
            size="xs"
            flex={1}
            color="sunset"
            disabled={!permissions.mic || checking}
            loading={checking}
            onClick={recheck}
          >
            {permissions.mic ? (checking ? 'Checking…' : 'Start Recording') : 'Recheck'}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={() => window.recordingApi.closeWindow()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
