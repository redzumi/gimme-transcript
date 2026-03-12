import { useState, useEffect } from 'react'
import {
  Title,
  Text,
  Button,
  Stack,
  Radio,
  Progress,
  Group,
  Badge,
  Paper
} from '@mantine/core'
import type { WhisperModel, ModelInfo } from '../types/ipc'

interface Props {
  onDone: () => void
}

const MODEL_LABELS: Record<WhisperModel, { size: string; note: string }> = {
  tiny:   { size: '75 MB',   note: 'fast, less accurate' },
  base:   { size: '142 MB',  note: 'fast, decent quality' },
  small:  { size: '466 MB',  note: 'good balance' },
  medium: { size: '1.5 GB',  note: 'recommended' },
  large:  { size: '2.9 GB',  note: 'slow, most accurate' }
}

export default function FirstLaunch({ onDone }: Props): React.JSX.Element {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selected, setSelected] = useState<WhisperModel>('medium')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    window.api.invoke('models:list').then(setModels)

    const off = window.api.on('models:download-progress', ({ model, percent }) => {
      if (model === selected) setProgress(percent)
    })

    const offDone = window.api.on('models:download-done', ({ model }) => {
      if (model === selected) {
        setDownloading(false)
        setProgress(100)
        window.api.invoke('models:list').then(setModels)
      }
    })

    return () => {
      off()
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
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <Paper p="xl" radius="md" className="w-full max-w-md" bg="dark.8">
        <Stack gap="xl">
          <Stack gap={4}>
            <Title order={2} fw={600}>
              scribe-my-bitch-up
            </Title>
            <Text c="dimmed" size="sm">
              To get started, download a Whisper model.
              <br />
              Models run locally — no internet after this.
            </Text>
          </Stack>

          <Radio.Group value={selected} onChange={(v) => setSelected(v as WhisperModel)}>
            <Stack gap="xs">
              {(['tiny', 'base', 'small', 'medium', 'large'] as WhisperModel[]).map((m) => (
                <Paper
                  key={m}
                  p="sm"
                  radius="sm"
                  bg={selected === m ? 'dark.6' : 'dark.7'}
                  className="cursor-pointer"
                  onClick={() => setSelected(m)}
                >
                  <Group justify="space-between">
                    <Group gap="sm">
                      <Radio value={m} />
                      <div>
                        <Text fw={500} size="sm">
                          {m}
                        </Text>
                        <Text c="dimmed" size="xs">
                          {MODEL_LABELS[m].note}
                        </Text>
                      </div>
                    </Group>
                    <Group gap="xs">
                      <Text c="dimmed" size="xs">
                        {MODEL_LABELS[m].size}
                      </Text>
                      {downloadedModels.includes(m) && (
                        <Badge size="xs" color="green" variant="light">
                          downloaded
                        </Badge>
                      )}
                      {m === 'medium' && !downloadedModels.includes(m) && (
                        <Badge size="xs" color="blue" variant="light">
                          recommended
                        </Badge>
                      )}
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Radio.Group>

          {downloading && (
            <Stack gap="xs">
              <Progress value={progress} animated size="md" radius="sm" />
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  Downloading {selected}… {Math.round(progress)}%
                </Text>
                <Button size="xs" variant="subtle" color="red" onClick={handleCancel}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          )}

          {selectedDownloaded ? (
            <Button size="md" onClick={onDone}>
              Get started
            </Button>
          ) : (
            <Button
              size="md"
              onClick={handleDownload}
              loading={downloading}
              disabled={downloading}
            >
              Download model
            </Button>
          )}
        </Stack>
      </Paper>
    </div>
  )
}
