import { useState, useEffect, useCallback } from 'react'
import {
  Title,
  Text,
  Button,
  Stack,
  Group,
  ActionIcon,
  Badge,
  Divider,
  TextInput,
  ScrollArea,
  Select,
  Paper
} from '@mantine/core'
import type { Session, Speaker, WhisperModel } from '../types/ipc'

interface Props {
  onOpenSession: (id: string) => void
  onOpenSettings: () => void
}

const STATUS_COLOR: Record<Session['status'], string> = {
  idle: 'gray',
  transcribing: 'blue',
  done: 'green'
}

const STATUS_LABEL: Record<Session['status'], string> = {
  idle: 'idle',
  transcribing: 'transcribing…',
  done: 'done'
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return `${Math.floor(hrs / 24)} days ago`
}

export default function Home({ onOpenSession, onOpenSettings }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [currentModel, setCurrentModel] = useState<WhisperModel>('medium')
  const [newSpeakerName, setNewSpeakerName] = useState('')
  const [addingSpeaker, setAddingSpeaker] = useState(false)

  const reload = useCallback(async () => {
    const [s, sp, settings] = await Promise.all([
      window.api.invoke('sessions:list'),
      window.api.invoke('speakers:list'),
      window.api.invoke('settings:get')
    ])
    setSessions(s)
    setSpeakers(sp)
    setCurrentModel(settings.defaultModel)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleNewSession(): Promise<void> {
    const files = await window.api.invoke('dialog:open-audio')
    if (!files) return
    for (const file of files) {
      await window.api.invoke('sessions:create', file, currentModel, 'auto')
    }
    reload()
  }

  async function handleAddSpeaker(): Promise<void> {
    const name = newSpeakerName.trim()
    if (!name) return
    await window.api.invoke('speakers:create', name)
    setNewSpeakerName('')
    setAddingSpeaker(false)
    reload()
  }

  async function handleDeleteSpeaker(id: string): Promise<void> {
    await window.api.invoke('speakers:delete', id)
    reload()
  }

  async function handleModelChange(model: string | null): Promise<void> {
    if (!model) return
    await window.api.invoke('settings:update', { defaultModel: model as WhisperModel })
    setCurrentModel(model as WhisperModel)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <Title order={4} fw={600}>
          scribe-my-bitch-up
        </Title>
        <Group gap="sm">
          <Select
            size="xs"
            value={currentModel}
            onChange={handleModelChange}
            data={[
              { value: 'tiny', label: 'tiny' },
              { value: 'base', label: 'base' },
              { value: 'small', label: 'small' },
              { value: 'medium', label: 'medium' },
              { value: 'large', label: 'large' }
            ]}
            styles={{ input: { minWidth: 90 } }}
          />
          <ActionIcon variant="subtle" size="md" onClick={onOpenSettings} title="Settings">
            ⚙️
          </ActionIcon>
        </Group>
      </div>

      {/* Body — two columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sessions */}
        <div className="flex flex-col flex-1 border-r border-white/10">
          <div className="flex items-center justify-between px-5 py-3">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
              Sessions
            </Text>
            <Button size="xs" variant="light" onClick={handleNewSession}>
              + New session
            </Button>
          </div>
          <Divider opacity={0.1} />
          <ScrollArea className="flex-1">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <Text c="dimmed" size="sm">
                  No sessions yet
                </Text>
                <Text c="dimmed" size="xs">
                  Click "+ New session" to add an audio file
                </Text>
              </div>
            ) : (
              <Stack gap={0}>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => onOpenSession(s.id)}
                  >
                    <Group gap="sm">
                      <Text size="sm">📄</Text>
                      <div>
                        <Text size="sm" fw={500}>
                          {s.audioFile.split('/').pop() ?? s.audioFile}
                        </Text>
                        <Group gap="xs" mt={2}>
                          {(() => {
                            const isLabeled = s.status === 'done' && s.segments.length > 0 && s.segments.every(seg => seg.speakerId !== null)
                            const displayStatus = isLabeled ? 'labeled' : s.status
                            const badgeColor = isLabeled ? 'teal' : STATUS_COLOR[s.status]
                            const badgeLabel = isLabeled ? 'labeled' : STATUS_LABEL[s.status]
                            return (
                              <Badge
                                size="xs"
                                color={badgeColor}
                                variant="light"
                                data-display-status={displayStatus}
                              >
                                {badgeLabel}
                              </Badge>
                            )
                          })()}
                          <Text size="xs" c="dimmed">
                            {formatAgo(s.createdAt)}
                          </Text>
                        </Group>
                      </div>
                    </Group>
                  </div>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </div>

        {/* Speakers */}
        <div className="flex flex-col w-56">
          <div className="flex items-center justify-between px-4 py-3">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
              Speakers
            </Text>
            <Button size="xs" variant="light" onClick={() => setAddingSpeaker(true)}>
              + Add
            </Button>
          </div>
          <Divider opacity={0.1} />
          <ScrollArea className="flex-1 px-3 py-2">
            {addingSpeaker && (
              <Paper p="xs" mb="xs" bg="dark.7" radius="sm">
                <Stack gap="xs">
                  <TextInput
                    size="xs"
                    placeholder="Speaker name"
                    value={newSpeakerName}
                    onChange={(e) => setNewSpeakerName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSpeaker()
                      if (e.key === 'Escape') setAddingSpeaker(false)
                    }}
                    autoFocus
                  />
                  <Group gap="xs">
                    <Button size="xs" flex={1} onClick={handleAddSpeaker}>
                      Add
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      flex={1}
                      onClick={() => setAddingSpeaker(false)}
                    >
                      Cancel
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
            {speakers.length === 0 && !addingSpeaker ? (
              <Text c="dimmed" size="xs" ta="center" mt="md">
                No speakers yet
              </Text>
            ) : (
              <Stack gap={2}>
                {speakers.map((sp) => (
                  <Group
                    key={sp.id}
                    justify="space-between"
                    px="xs"
                    py={6}
                    className="rounded hover:bg-white/5 group transition-colors"
                  >
                    <Text size="sm">{sp.name}</Text>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteSpeaker(sp.id)}
                    >
                      ✕
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
