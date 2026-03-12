import { useState, useEffect } from 'react'
import { Text, Button, Stack, Select, Group, Badge, TextInput } from '@mantine/core'
import type { Settings, ModelInfo, WhisperModel } from '../types/ipc'

interface Props {
  onBack: () => void
}

const MODEL_SIZES: Record<WhisperModel, string> = {
  tiny: '75 MB',
  base: '142 MB',
  small: '466 MB',
  medium: '1.5 GB',
  large: '2.9 GB',
}

export default function SettingsScreen({ onBack }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [downloading, setDownloading] = useState<WhisperModel | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  async function reload(): Promise<void> {
    const [s, m] = await Promise.all([
      window.api.invoke('settings:get'),
      window.api.invoke('models:list'),
    ])
    setSettings(s)
    setModels(m)
  }

  useEffect(() => {
    reload()

    const offProgress = window.api.on('models:download-progress', ({ model, percent }) => {
      setDownloading(model)
      setDownloadProgress(percent)
    })
    const offDone = window.api.on('models:download-done', () => {
      setDownloading(null)
      setDownloadProgress(0)
      reload()
    })

    return () => {
      offProgress()
      offDone()
    }
  }, [])

  async function handleUpdate(data: Partial<Settings>): Promise<void> {
    const updated = await window.api.invoke('settings:update', data)
    setSettings(updated)
  }

  async function handleDownload(model: WhisperModel): Promise<void> {
    setDownloading(model)
    setDownloadProgress(0)
    await window.api.invoke('models:download', model)
  }

  async function handleDelete(model: WhisperModel): Promise<void> {
    await window.api.invoke('models:delete', model)
    reload()
  }

  if (!settings) return <div className="h-screen bg-white" />

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-200 shrink-0">
        <button
          className="text-xs text-gray-400 hover:text-gray-800 transition-colors px-1.5 py-1 rounded hover:bg-gray-100"
          onClick={onBack}
        >
          ← Back
        </button>
        <div className="w-px h-3.5 bg-gray-200" />
        <span className="text-sm font-semibold text-gray-900">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Stack gap="xl" maw={480}>
          {/* Defaults */}
          <Stack gap="md">
            <Select
              label="Default model"
              value={settings.defaultModel}
              onChange={(v) => v && handleUpdate({ defaultModel: v as WhisperModel })}
              data={[
                { value: 'tiny', label: 'tiny (75 MB)' },
                { value: 'base', label: 'base (142 MB)' },
                { value: 'small', label: 'small (466 MB)' },
                { value: 'medium', label: 'medium (1.5 GB)' },
                { value: 'large', label: 'large (2.9 GB)' },
              ]}
            />
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
                { value: 'es', label: 'Spanish' },
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

          {/* Divider */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200" />
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                Models
              </Text>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <Stack gap="sm">
              {models.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Text fw={500} size="sm" w={60}>
                      {m.model}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {MODEL_SIZES[m.model]}
                    </Text>
                    {m.model === settings.defaultModel && (
                      <Badge size="xs" color="indigo" variant="light">
                        default
                      </Badge>
                    )}
                  </div>
                  <Group gap="xs">
                    {m.downloaded ? (
                      <>
                        <Badge size="xs" color="teal" variant="light">
                          downloaded
                        </Badge>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(m.model)}
                        >
                          Delete
                        </Button>
                      </>
                    ) : downloading === m.model ? (
                      <Group gap="xs">
                        <Text size="xs" c="dimmed">
                          {Math.round(downloadProgress)}%
                        </Text>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => {
                            setDownloading(null)
                            window.api.invoke('models:cancel-download', m.model)
                          }}
                        >
                          Cancel
                        </Button>
                      </Group>
                    ) : (
                      <Button
                        size="xs"
                        variant="light"
                        color="indigo"
                        onClick={() => handleDownload(m.model)}
                        disabled={downloading !== null}
                      >
                        Download
                      </Button>
                    )}
                  </Group>
                </div>
              ))}
            </Stack>
          </div>
        </Stack>
      </div>
    </div>
  )
}
