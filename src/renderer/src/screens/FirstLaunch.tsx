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
  medium: { size: '1.5 GB', note: 'recommended for Russian' },
  large: { size: '2.9 GB', note: 'slow, most accurate' },
}

export default function FirstLaunch({ onDone }: Props): React.JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selected, setSelected] = useState<WhisperModel>('medium')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)

  useEffect(() => {
    window.api.invoke('models:list').then(setModels)

    const offProgress = window.api.on('models:download-progress', ({ model, percent, bytesPerSec }) => {
      if (model === selected) {
        setProgress(percent)
        setSpeed(bytesPerSec)
      }
    })
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

  function handleCancel(): void {
    setDownloading(false)
    setProgress(0)
    window.api.invoke('models:cancel-download', selected)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <Stack gap="xl">
          <div>
            <div className="mb-4">
              <Logo size={44} />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
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
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelected(m)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-orange-500' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">{m}</span>
                        <span className="text-xs text-gray-400 ml-2">{MODEL_LABELS[m].note}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{MODEL_LABELS[m].size}</span>
                      {isDownloaded && (
                        <Badge size="xs" color="teal" variant="light">
                          ready
                        </Badge>
                      )}
                      {m === 'medium' && !isDownloaded && (
                        <Badge size="xs" color="orange" variant="light">
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
              <Progress value={progress} animated size="sm" color="orange" radius="xl" />
              <Group justify="space-between">
                <span className="text-xs text-gray-400">
                  {Math.round(progress)}%
                  {speed > 0 && (
                    <span className="ml-2 text-gray-300">{formatSpeed(speed)}</span>
                  )}
                </span>
                <Button size="xs" variant="subtle" color="red" onClick={handleCancel}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          )}

          {/* Action */}
          {selectedDownloaded ? (
            <Button color="orange" size="md" radius="xl" onClick={onDone}>
              Get started
            </Button>
          ) : (
            <Button
              color="orange"
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
