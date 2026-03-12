import { useState, useEffect } from 'react'
import { Text, Button, Stack, Select, Group, TextInput, Progress } from '@mantine/core'
import type { Settings, ModelInfo, WhisperModel } from '../types/ipc'

interface Props {
  onBack: () => void
}

const MODEL_META: Record<WhisperModel, { size: string; note: string; bytes: number }> = {
  tiny: { size: '75 MB', note: 'fast, lower accuracy', bytes: 75 * 1024 * 1024 },
  base: { size: '142 MB', note: 'fast, decent quality', bytes: 142 * 1024 * 1024 },
  small: { size: '466 MB', note: 'good balance', bytes: 466 * 1024 * 1024 },
  medium: { size: '1.5 GB', note: 'recommended', bytes: 1500 * 1024 * 1024 },
  large: { size: '2.9 GB', note: 'most accurate, slow', bytes: 2900 * 1024 * 1024 }
}

interface DownloadState {
  percent: number
  bytesPerSec: number
}

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps} B/s`
}

export default function SettingsScreen({ onBack }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [downloading, setDownloading] = useState<Map<WhisperModel, DownloadState>>(new Map())

  async function reload(): Promise<void> {
    const [s, m] = await Promise.all([
      window.api.invoke('settings:get'),
      window.api.invoke('models:list')
    ])
    setSettings(s)
    setModels(m)
  }

  useEffect(() => {
    void Promise.resolve().then(reload)

    const offProgress = window.api.on(
      'models:download-progress',
      ({ model, percent, bytesPerSec }) => {
        setDownloading((prev) => {
          const next = new Map(prev)
          next.set(model, { percent, bytesPerSec })
          return next
        })
      }
    )

    const offDone = window.api.on('models:download-done', ({ model }) => {
      setDownloading((prev) => {
        const next = new Map(prev)
        next.delete(model)
        return next
      })
      void Promise.resolve().then(reload)
    })

    const offError = window.api.on('models:download-error', ({ model }) => {
      setDownloading((prev) => {
        const next = new Map(prev)
        next.delete(model)
        return next
      })
    })

    return () => {
      offProgress()
      offDone()
      offError()
    }
  }, [])

  async function handleUpdate(data: Partial<Settings>): Promise<void> {
    const updated = await window.api.invoke('settings:update', data)
    setSettings(updated)
  }

  async function handleDownload(model: WhisperModel): Promise<void> {
    setDownloading((prev) => new Map(prev).set(model, { percent: 0, bytesPerSec: 0 }))
    await window.api.invoke('models:download', model)
  }

  async function handleCancel(model: WhisperModel): Promise<void> {
    await window.api.invoke('models:cancel-download', model)
    setDownloading((prev) => {
      const next = new Map(prev)
      next.delete(model)
      return next
    })
  }

  async function handleDelete(model: WhisperModel): Promise<void> {
    await window.api.invoke('models:delete', model)
    reload()
  }

  if (!settings) return <div className="h-screen bg-[var(--app-shell)]" />

  const isAnyDownloading = downloading.size > 0

  return (
    <div className="flex h-screen flex-col bg-[var(--app-shell)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#ead7cf] bg-white/70 px-4 backdrop-blur-sm">
        <button
          className="rounded px-1.5 py-1 text-xs text-[#8f7982] transition-colors hover:bg-[#fff2eb] hover:text-[#24191f]"
          onClick={onBack}
        >
          ← Back
        </button>
        <div className="h-3.5 w-px bg-[#ead7cf]" />
        <span className="text-sm font-semibold text-[#24191f]">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Stack gap="xl" maw={520}>
          {/* General */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#8f7982]">
              General
            </p>
            <Stack gap="md">
              <Select
                label="Default language"
                value={settings.defaultLanguage}
                onChange={(v) => v && handleUpdate({ defaultLanguage: v })}
                data={[
                  { value: 'auto', label: 'auto-detect' },
                  { value: 'ru', label: 'Russian' },
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'German' },
                  { value: 'fr', label: 'French' },
                  { value: 'es', label: 'Spanish' }
                ]}
              />
              <Group align="flex-end" gap="sm">
                <TextInput
                  label="Storage path"
                  value={settings.storagePath}
                  readOnly
                  flex={1}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
                <Button size="sm" variant="default">
                  Change
                </Button>
              </Group>
            </Stack>
          </div>

          {/* Models */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#8f7982]">
              Models
            </p>
            <div className="overflow-hidden rounded-2xl border border-[#ead7cf] bg-white/78 backdrop-blur-sm">
              {(['tiny', 'base', 'small', 'medium', 'large'] as WhisperModel[]).map(
                (m, idx, arr) => {
                  const info = models.find((x) => x.model === m)
                  const dl = downloading.get(m)
                  const isDownloaded = info?.downloaded ?? false
                  const isDownloading = !!dl
                  const isDefault = settings.defaultModel === m
                  const isLast = idx === arr.length - 1

                  return (
                    <div
                      key={m}
                      className={`px-4 py-3 ${!isLast ? 'border-b border-[#f3e5dd]' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Left: name + meta */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Status indicator */}
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isDownloaded
                                ? 'bg-emerald-400'
                                : isDownloading
                                  ? 'bg-[#ffb33d] animate-pulse'
                                  : 'bg-[#ead7cf]'
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[#24191f]">{m}</span>
                              <span className="text-xs text-[#8f7982]">{MODEL_META[m].size}</span>
                              {isDefault && isDownloaded && (
                                <span className="rounded-full bg-[#fff0eb] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#e53b61]">
                                  default
                                </span>
                              )}
                            </div>
                            <p className="m-0 text-xs text-[#8f7982]">{MODEL_META[m].note}</p>
                          </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isDownloading ? (
                            <>
                              <Text size="xs" c="dimmed">
                                {formatSpeed(dl.bytesPerSec)}
                              </Text>
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => handleCancel(m)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : isDownloaded ? (
                            <Group gap="xs">
                              {!isDefault && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="sunset"
                                  onClick={() => handleUpdate({ defaultModel: m })}
                                >
                                  Set default
                                </Button>
                              )}
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => handleDelete(m)}
                              >
                                Delete
                              </Button>
                            </Group>
                          ) : (
                            <Button
                              size="xs"
                              variant="light"
                              color="sunset"
                              disabled={isAnyDownloading}
                              onClick={() => handleDownload(m)}
                            >
                              Download
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {isDownloading && (
                        <div className="mt-2.5">
                          <Progress
                            value={dl.percent}
                            size="xs"
                            color="sunset"
                            animated={dl.percent < 100}
                            radius="xl"
                          />
                          <p className="m-0 mt-1 text-[10px] text-[#8f7982]">
                            {dl.percent}% downloaded
                          </p>
                        </div>
                      )}
                    </div>
                  )
                }
              )}
            </div>
          </div>
        </Stack>
      </div>
    </div>
  )
}
