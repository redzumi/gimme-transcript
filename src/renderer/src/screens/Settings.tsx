import { useState, useEffect } from 'react'
import {
  Title,
  Text,
  Button,
  Stack,
  Select,
  Group,
  Badge,
  Divider,
  TextInput
} from '@mantine/core'
import type { Settings, ModelInfo, WhisperModel } from '../types/ipc'

interface Props {
  onBack: () => void
}

const MODEL_SIZES: Record<WhisperModel, string> = {
  tiny: '75 MB',
  base: '142 MB',
  small: '466 MB',
  medium: '1.5 GB',
  large: '2.9 GB'
}

export default function SettingsScreen({ onBack }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [downloading, setDownloading] = useState<WhisperModel | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  async function reload(): Promise<void> {
    const [s, m] = await Promise.all([
      window.api.invoke('settings:get'),
      window.api.invoke('models:list')
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

  async function handleChangePath(): Promise<void> {
    // Use dialog to pick directory — wired in T-010 via dialog:open-audio stub
    // For now just show the current path
  }

  if (!settings) return <div className="h-screen flex items-center justify-center text-white">Loading…</div>

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10">
        <Button size="xs" variant="subtle" onClick={onBack}>
          ← Back
        </Button>
        <Title order={4} fw={600}>
          Settings
        </Title>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
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
                { value: 'large', label: 'large (2.9 GB)' }
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
              <Button size="sm" variant="default" onClick={handleChangePath}>
                Change
              </Button>
            </Group>
          </Stack>

          <Divider opacity={0.15} label="Models" labelPosition="left" />

          {/* Models */}
          <Stack gap="sm">
            {models.map((m) => (
              <Group key={m.model} justify="space-between">
                <Group gap="sm">
                  <Text fw={500} size="sm" w={60}>
                    {m.model}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {MODEL_SIZES[m.model]}
                  </Text>
                  {m.model === settings.defaultModel && (
                    <Badge size="xs" color="blue" variant="light">
                      default
                    </Badge>
                  )}
                </Group>
                <Group gap="xs">
                  {m.downloaded ? (
                    <>
                      <Badge size="xs" color="green" variant="light">
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
                      onClick={() => handleDownload(m.model)}
                      disabled={downloading !== null}
                    >
                      Download
                    </Button>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        </Stack>
      </div>
    </div>
  )
}
