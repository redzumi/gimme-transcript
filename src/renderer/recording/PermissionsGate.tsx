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
      className="w-[460px] rounded-[34px] border border-[rgba(255,255,255,0.7)] bg-[linear-gradient(180deg,rgba(255,249,245,0.98),rgba(255,255,255,0.9))] p-5 shadow-[0_28px_90px_rgba(77,42,66,0.18)] backdrop-blur-[24px]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b57a70]">
          Access check
        </p>
        <p className="mt-2 text-2xl font-semibold text-[#24191f]">Enable recording access</p>
        <p className="mt-2 text-sm leading-6 text-[#7f6671]">
          Grant the microphone first. On macOS, screen recording is also needed for system audio.
        </p>

        <div className="mb-4 mt-5 flex flex-col gap-3">
          <div className="rounded-[26px] border border-[#ecd8cf] bg-white/78 px-4 py-4 shadow-[0_12px_24px_rgba(77,42,66,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎤</span>
                <div>
                  <p className="text-sm font-semibold text-[#24191f]">Microphone</p>
                  <p className="text-xs text-[#7f6671]">Required to start recording.</p>
                </div>
              </div>
              {permissions.mic ? (
                <span className="rounded-full border border-[#bfe9cf] bg-[#e9fff3] px-2.5 py-1 text-[11px] font-semibold text-[#1a8f57]">
                  Granted
                </span>
              ) : (
                <Button
                  size="xs"
                  radius="xl"
                  color="sunset"
                  variant="light"
                  onClick={() => openSettings('microphone')}
                >
                  Open Settings
                </Button>
              )}
            </div>
          </div>

          {platform === 'darwin' && (
            <div className="rounded-[26px] border border-[#ecd8cf] bg-white/78 px-4 py-4 shadow-[0_12px_24px_rgba(77,42,66,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🖥</span>
                  <div>
                    <p className="text-sm font-semibold text-[#24191f]">Screen Recording</p>
                    <p className="text-xs text-[#7f6671]">Needed only for system audio.</p>
                  </div>
                </div>
                {permissions.screenRecording ? (
                  <span className="rounded-full border border-[#bfe9cf] bg-[#e9fff3] px-2.5 py-1 text-[11px] font-semibold text-[#1a8f57]">
                    Granted
                  </span>
                ) : (
                  <Button
                    size="xs"
                    radius="xl"
                    color="lilac"
                    variant="light"
                    onClick={() => openSettings('screenRecording')}
                  >
                    Open Settings
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="md"
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
            size="md"
            variant="light"
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
