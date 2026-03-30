import { useState, useEffect } from 'react'
import { Button, Stack, Progress, Group, Badge } from '@mantine/core'
import type { WhisperModel, ModelInfo } from '../types/ipc'
import { Logo } from '../components/Logo'

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps} B/s`
}

interface Props {
  onDone: () => void
}

const MODEL_LABELS: Record<WhisperModel, { size: string; note: string }> = {
  tiny: { size: '75 MB', note: 'fast, less accurate' },
  base: { size: '142 MB', note: 'fast, decent quality' },
  small: { size: '466 MB', note: 'good balance' },
  medium: { size: '1.5 GB', note: 'recommended' },
  large: { size: '2.9 GB', note: 'slow, most accurate' }
}

export default function FirstLaunch({ onDone }: Props): React.JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selected, setSelected] = useState<WhisperModel>('medium')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)

  useEffect(() => {
    window.api.invoke('models:list').then(setModels)

    const offProgress = window.api.on(
      'models:download-progress',
      ({ model, percent, bytesPerSec }) => {
        if (model === selected) {
          setProgress(percent)
          setSpeed(bytesPerSec)
        }
      }
    )
    const offDone = window.api.on('models:download-done', ({ model }) => {
      if (model === selected) {
        setDownloading(false)
        setProgress(100)
        setSpeed(0)
        window.api.invoke('models:list').then(setModels)
      }
    })

    return () => {
      offProgress()
      offDone()
    }
  }, [selected])

  const downloadedModels = models.filter((m) => m.downloaded).map((m) => m.model)
  const selectedDownloaded = downloadedModels.includes(selected)

  async function handleDownload(): Promise<void> {
    setDownloading(true)
    setProgress(0)
    await window.api.invoke('models:download', selected)
  }

  async function handleGetStarted(): Promise<void> {
    await window.api.invoke('settings:update', { defaultModel: selected })
    onDone()
  }

  function handleCancel(): void {
    setDownloading(false)
    setProgress(0)
    window.api.invoke('models:cancel-download', selected)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--app-shell)] px-4">
      <div className="w-full max-w-sm rounded-[28px] border border-[#edd8ce] bg-white/90 p-8 shadow-[0_24px_80px_rgba(108,39,70,0.12)] backdrop-blur-sm">
        <Stack gap="xl">
          <div>
            <div className="mb-4">
              <Logo size={44} />
            </div>
            <p className="text-sm leading-relaxed text-[#7f6671]">
              To get started, download a Whisper model.
              <br />
              Everything runs locally — no internet after this.
            </p>
          </div>

          {/* Model picker */}
          <Stack gap="xs">
            {(['tiny', 'base', 'small', 'medium', 'large'] as WhisperModel[]).map((m) => {
              const isSelected = selected === m
              const isDownloaded = downloadedModels.includes(m)
              return (
                <button
                  key={m}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[#ffb7a1] bg-[#fff0eb]'
                      : 'border-[#edd8ce] hover:border-[#dcbacb] hover:bg-[#fff8f3]'
                  }`}
                  onClick={() => setSelected(m)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-[#ff4d6d]' : 'border-[#d6c4bb]'
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-[#ff4d6d]" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-[#24191f]">{m}</span>
                        <span className="ml-2 text-xs text-[#8f7982]">{MODEL_LABELS[m].note}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8f7982]">{MODEL_LABELS[m].size}</span>
                      {isDownloaded && (
                        <Badge size="xs" color="lilac" variant="light">
                          ready
                        </Badge>
                      )}
                      {m === 'medium' && !isDownloaded && (
                        <Badge size="xs" color="sunset" variant="light">
                          recommended
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </Stack>

          {/* Progress */}
          {downloading && (
            <Stack gap="xs">
              <Progress value={progress} animated size="sm" color="sunset" radius="xl" />
              <Group justify="space-between">
                <span className="text-xs text-[#8f7982]">
                  {Math.round(progress)}%
                  {speed > 0 && <span className="ml-2 text-[#b19ca5]">{formatSpeed(speed)}</span>}
                </span>
                <Button size="xs" variant="subtle" color="red" onClick={handleCancel}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          )}

          {/* Action */}
          {selectedDownloaded ? (
            <Button color="sunset" size="md" radius="xl" onClick={handleGetStarted}>
              Get started
            </Button>
          ) : (
            <Button
              color="sunset"
              size="md"
              radius="xl"
              onClick={handleDownload}
              loading={downloading}
              disabled={downloading}
            >
              Download model
            </Button>
          )}
        </Stack>
      </div>
    </div>
  )
}
