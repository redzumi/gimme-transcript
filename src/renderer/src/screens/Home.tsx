import { useState, useEffect, useCallback } from 'react'
import { Text, Button, Group, ActionIcon, TextInput, Select, ScrollArea } from '@mantine/core'
import type { Session, Speaker, WhisperModel } from '../types/ipc'

interface Props {
  onOpenSession: (id: string) => void
  onOpenSettings: () => void
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-gray-300',
  transcribing: 'bg-blue-400',
  done: 'bg-emerald-400',
  labeled: 'bg-violet-400',
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'idle',
  transcribing: 'transcribing…',
  done: 'done',
  labeled: 'labeled',
}

export default function Home({ onOpenSession, onOpenSettings }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [currentModel, setCurrentModel] = useState<WhisperModel>('medium')
  const [downloadedModels, setDownloadedModels] = useState<WhisperModel[]>([])
  const [newSpeakerName, setNewSpeakerName] = useState('')
  const [addingSpeaker, setAddingSpeaker] = useState(false)

  const reload = useCallback(async () => {
    const [s, sp, settings, modelList] = await Promise.all([
      window.api.invoke('sessions:list'),
      window.api.invoke('speakers:list'),
      window.api.invoke('settings:get'),
      window.api.invoke('models:list'),
    ])
    setSessions(s)
    setSpeakers(sp)
    setCurrentModel(settings.defaultModel)
    setDownloadedModels(modelList.filter((m) => m.downloaded).map((m) => m.model))
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
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-11 border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-900 tracking-tight">scribe</span>
        <Group gap="xs">
          {downloadedModels.length > 0 && (
            <Select
              size="xs"
              value={downloadedModels.includes(currentModel) ? currentModel : downloadedModels[0]}
              onChange={handleModelChange}
              data={downloadedModels.map((m) => ({ value: m, label: m }))}
              styles={{ input: { minWidth: 80 } }}
            />
          )}
          <ActionIcon variant="subtle" size="sm" color="gray" onClick={onOpenSettings} title="Settings">
            <span style={{ fontSize: 14 }}>⚙</span>
          </ActionIcon>
        </Group>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sessions */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200">
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Sessions
            </Text>
            <Button size="xs" variant="subtle" color="indigo" onClick={handleNewSession}>
              + New
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-1">
                <Text size="sm" c="dimmed">No sessions yet</Text>
                <Text size="xs" c="dimmed">Click "+ New" to import an audio file</Text>
              </div>
            ) : (
              <div>
                {sessions.map((s) => {
                  const isLabeled =
                    s.status === 'done' &&
                    s.segments.length > 0 &&
                    s.segments.every((seg) => seg.speakerId !== null)
                  const key = isLabeled ? 'labeled' : s.status
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50"
                      onClick={() => onOpenSession(s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate m-0">
                          {s.audioFile.split('/').pop() ?? s.audioFile}
                        </p>
                        <p className="m-0 mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[key]}`} />
                          <span className="text-xs text-gray-500">{STATUS_LABEL[key]}</span>
                          <span className="text-gray-300 text-xs">·</span>
                          <span className="text-xs text-gray-400">{formatAgo(s.createdAt)}</span>
                        </p>
                      </div>
                      <span className="text-gray-300 text-sm shrink-0">›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Speakers */}
        <div className="flex flex-col w-52 shrink-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Speakers
            </Text>
            <Button size="xs" variant="subtle" color="indigo" onClick={() => setAddingSpeaker(true)}>
              + Add
            </Button>
          </div>

          <ScrollArea className="flex-1 px-3 py-2">
            {addingSpeaker && (
              <div className="mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
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
                <Group gap="xs" mt="xs">
                  <Button size="xs" flex={1} color="indigo" onClick={handleAddSpeaker}>
                    Add
                  </Button>
                  <Button
                    size="xs"
                    flex={1}
                    variant="subtle"
                    color="gray"
                    onClick={() => setAddingSpeaker(false)}
                  >
                    Cancel
                  </Button>
                </Group>
              </div>
            )}
            {speakers.length === 0 && !addingSpeaker ? (
              <Text c="dimmed" size="xs" ta="center" mt="lg">
                No speakers yet
              </Text>
            ) : (
              <div>
                {speakers.map((sp) => (
                  <div
                    key={sp.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-gray-50 group transition-colors"
                  >
                    <Text size="sm" c="gray.8">
                      {sp.name}
                    </Text>
                    <button
                      className="text-xs text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={() => handleDeleteSpeaker(sp.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
