import { useState, useEffect, useCallback, useRef } from 'react'
import { Text, Button, Group, ActionIcon, TextInput, Select, ScrollArea } from '@mantine/core'
import type { Session, Speaker, WhisperModel } from '../types/ipc'
import { Logo } from '../components/Logo'

interface ContextMenu {
  sessionId: string
  x: number
  y: number
}

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
  transcribing: 'bg-[#ffb33d]',
  done: 'bg-emerald-400',
  labeled: 'bg-[#a05dff]'
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'idle',
  transcribing: 'transcribing…',
  done: 'done',
  labeled: 'labeled'
}

function getSessionName(s: Session): string {
  return s.name ?? s.audioSources[0]?.path.split('/').pop() ?? 'Session'
}

export default function Home({ onOpenSession, onOpenSettings }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [currentModel, setCurrentModel] = useState<WhisperModel>('medium')
  const [downloadedModels, setDownloadedModels] = useState<WhisperModel[]>([])
  const [newSpeakerName, setNewSpeakerName] = useState('')
  const [addingSpeaker, setAddingSpeaker] = useState(false)
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [sessionProgress, setSessionProgress] = useState<Map<string, number>>(new Map())
  const renameInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const [s, sp, settings, modelList] = await Promise.all([
      window.api.invoke('sessions:list'),
      window.api.invoke('speakers:list'),
      window.api.invoke('settings:get'),
      window.api.invoke('models:list')
    ])
    const availableModels = modelList.filter((m) => m.downloaded).map((m) => m.model)
    const resolvedModel = availableModels.includes(settings.defaultModel)
      ? settings.defaultModel
      : (availableModels[0] ?? settings.defaultModel)
    setSessions(s)
    setSpeakers(sp)
    setCurrentModel(resolvedModel)
    setDownloadedModels(availableModels)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(reload)

    const offProgress = window.api.on('whisper:progress', ({ sessionId, percent }) => {
      setSessionProgress((prev) => new Map(prev).set(sessionId, percent))
    })
    const offDone = window.api.on('whisper:done', ({ sessionId }) => {
      setSessionProgress((prev) => {
        const next = new Map(prev)
        next.delete(sessionId)
        return next
      })
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'done' } : s)))
    })

    return () => {
      offProgress()
      offDone()
    }
  }, [reload])

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  async function handleNewSession(): Promise<void> {
    setNewMenuOpen(false)
    const files = await window.api.invoke('dialog:open-audio')
    if (!files) return
    const created: Session[] = []
    for (const file of files) {
      created.push(await window.api.invoke('sessions:create', file, currentModel, 'auto'))
    }
    setSessions((prev) => [...created.reverse(), ...prev])
  }

  async function handleImportText(): Promise<void> {
    setNewMenuOpen(false)
    const result = await window.api.invoke('dialog:open-text')
    if (!result) return
    const { path, content } = result
    const blocks = content.includes('\n\n') ? content.split(/\n\n+/) : content.split(/\n/)
    const segments = blocks
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
      .map((b, i) => ({
        id: `imported-${i}-${Math.random().toString(36).slice(2)}`,
        start: 0,
        end: 0,
        text: b,
        speakerId: null
      }))
    const firstWords = segments[0]?.text.slice(0, 40) ?? 'Imported text'
    const name = firstWords.length < (segments[0]?.text.length ?? 0) ? firstWords + '…' : firstWords
    const session = await window.api.invoke('sessions:create', path, currentModel, 'auto')
    const updated = await window.api.invoke('sessions:update', session.id, {
      segments,
      status: 'done',
      name
    })
    setSessions((prev) => [updated, ...prev])
  }

  async function handleEmptySession(): Promise<void> {
    setNewMenuOpen(false)
    const session = await window.api.invoke('sessions:create', '', currentModel, 'auto')
    const updated = await window.api.invoke('sessions:update', session.id, {
      name: 'New session',
      status: 'done'
    })
    setSessions((prev) => [updated, ...prev])
  }

  async function handleDeleteSession(e: React.MouseEvent, id: string): Promise<void> {
    e.stopPropagation()
    setSessions((prev) => prev.filter((s) => s.id !== id))
    await window.api.invoke('sessions:delete', id)
  }

  function handleStartRename(e: React.MouseEvent, session: Session): void {
    e.stopPropagation()
    setContextMenu(null)
    setRenamingId(session.id)
    setRenameValue(getSessionName(session))
  }

  function handleContextMenu(e: React.MouseEvent, sessionId: string): void {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY })
  }

  function closeContextMenu(): void {
    setContextMenu(null)
  }

  async function handleRenameSubmit(id: string): Promise<void> {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (trimmed) {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)))
      await window.api.invoke('sessions:update', id, { name: trimmed })
    }
  }

  async function handleAddSpeaker(): Promise<void> {
    const name = newSpeakerName.trim()
    if (!name) return
    const speaker = await window.api.invoke('speakers:create', name)
    setSpeakers((prev) => [...prev, speaker])
    setNewSpeakerName('')
    setAddingSpeaker(false)
  }

  async function handleDeleteSpeaker(id: string): Promise<void> {
    setSpeakers((prev) => prev.filter((s) => s.id !== id))
    await window.api.invoke('speakers:delete', id)
  }

  async function handleModelChange(model: string | null): Promise<void> {
    if (!model) return
    await window.api.invoke('settings:update', { defaultModel: model as WhisperModel })
    setCurrentModel(model as WhisperModel)
  }

  const filteredSessions = search.trim()
    ? sessions.filter((s) => getSessionName(s).toLowerCase().includes(search.trim().toLowerCase()))
    : sessions

  return (
    <div
      className="flex h-screen flex-col bg-[var(--app-shell)]"
      onClick={() => {
        closeContextMenu()
        setNewMenuOpen(false)
      }}
    >
      {contextMenu &&
        (() => {
          const session = sessions.find((s) => s.id === contextMenu.sessionId)
          if (!session) return null
          return (
            <div
              className="fixed z-50 min-w-[140px] rounded-xl border border-[#edd8ce] bg-white/95 py-1 shadow-[0_18px_48px_rgba(77,42,66,0.14)] backdrop-blur-sm"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
                onClick={(e) => handleStartRename(e, session)}
              >
                <span className="text-base">✎</span> Rename
              </button>
              <div className="my-1 border-t border-[#f3e5dd]" />
              <button
                className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
                onClick={(e) => {
                  handleDeleteSession(e, contextMenu.sessionId)
                  closeContextMenu()
                }}
              >
                <span className="text-base">✕</span> Delete
              </button>
            </div>
          )
        })()}

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#ead7cf] bg-white/70 px-5 backdrop-blur-sm">
        <div className="flex items-center">
          <Logo size={28} />
        </div>
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
          <ActionIcon
            variant="subtle"
            size="sm"
            color="lilac"
            onClick={onOpenSettings}
            title="Settings"
          >
            <span style={{ fontSize: 14 }}>⚙</span>
          </ActionIcon>
        </Group>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col border-r border-[#ead7cf] bg-white/72 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-[#f3e5dd] px-5 py-2.5">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Sessions
            </Text>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Button
                size="xs"
                variant="subtle"
                color="sunset"
                onClick={() => setNewMenuOpen((o) => !o)}
              >
                + New ▾
              </Button>
              {newMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-[#edd8ce] bg-white/95 py-1 shadow-[0_18px_48px_rgba(77,42,66,0.14)] backdrop-blur-sm">
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleNewSession}
                  >
                    Import audio
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleImportText}
                  >
                    Import text
                  </button>
                  <div className="my-1 border-t border-[#f3e5dd]" />
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleEmptySession}
                  >
                    Empty session
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border-b border-[#f3e5dd] px-5 py-2">
            <TextInput
              size="xs"
              placeholder="Search sessions…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              styles={{ input: { backgroundColor: '#fff8f3', borderColor: '#edd8ce' } }}
            />
          </div>

          <ScrollArea className="flex-1">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-1">
                {sessions.length === 0 ? (
                  <>
                    <Text size="sm" c="dimmed">
                      No sessions yet
                    </Text>
                    <Text size="xs" c="dimmed">
                      Click "+ New" to import an audio file
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    No sessions match your search
                  </Text>
                )}
              </div>
            ) : (
              <div>
                {filteredSessions.map((s) => {
                  const isLabeled =
                    s.status === 'done' &&
                    s.segments.length > 0 &&
                    s.segments.every((seg) => seg.speakerId !== null)
                  const key = isLabeled ? 'labeled' : s.status
                  const isRenaming = renamingId === s.id

                  return (
                    <div
                      key={s.id}
                      className="group flex cursor-pointer items-center gap-3 border-b border-[#f6ebe5] px-5 py-3 transition-colors hover:bg-[#fff6f0]"
                      onClick={() => !isRenaming && onOpenSession(s.id)}
                      onContextMenu={(e) => handleContextMenu(e, s.id)}
                    >
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            className="w-full rounded border border-[#ffb7a1] px-1 text-sm font-medium text-[#24191f] outline-none"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit(s.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => handleRenameSubmit(s.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <p className="m-0 truncate text-sm font-medium text-[#24191f]">
                            {getSessionName(s)}
                          </p>
                        )}
                        <p className="m-0 mt-0.5 flex items-center gap-1.5">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[key]}`}
                          />
                          <span className="text-xs text-[#7f6671]">{STATUS_LABEL[key]}</span>
                          {key === 'transcribing' && sessionProgress.has(s.id) && (
                            <span className="text-xs font-medium text-[#ff8a3d]">
                              {Math.round(sessionProgress.get(s.id) ?? 0)}%
                            </span>
                          )}
                          <span className="text-xs text-[#ccb8c1]">·</span>
                          <span className="text-xs text-[#8f7982]">{formatAgo(s.createdAt)}</span>
                        </p>
                      </div>

                      <span className="shrink-0 text-sm text-[#ccb8c1]">›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex w-52 shrink-0 flex-col bg-[#fffdfb]/78 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-[#f3e5dd] px-4 py-2.5">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Speakers
            </Text>
            <Button
              size="xs"
              variant="subtle"
              color="sunset"
              onClick={() => setAddingSpeaker(true)}
            >
              + Add
            </Button>
          </div>

          <ScrollArea className="flex-1 px-3 py-2">
            {addingSpeaker && (
              <div className="mb-2 rounded-xl border border-[#edd8ce] bg-[#fff8f3] p-2">
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
                  <Button size="xs" flex={1} color="sunset" onClick={handleAddSpeaker}>
                    Add
                  </Button>
                  <Button
                    size="xs"
                    flex={1}
                    variant="subtle"
                    color="lilac"
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
                    className="group flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-[#fff4ee]"
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
