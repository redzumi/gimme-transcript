import { useState, useEffect, useCallback, useRef } from 'react'
import type { Session, Speaker } from '../types/ipc'
import { Logo } from '../components/Logo'
import logoSvg from '../assets/logo.svg'
import { SPEAKER_PALETTE } from '../lib/speakerColors'

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

function getSessionName(s: Session): string {
  return s.name ?? s.audioSources[0]?.path.split('/').pop() ?? 'Session'
}

const STATUS_COLOR: Record<string, string> = {
  idle: '#c0a8b5',
  transcribing: '#ff8c3d',
  done: '#34c474',
  labeled: '#a05dff'
}

export default function Home({ onOpenSession, onOpenSettings }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [currentModel, setCurrentModel] = useState<string>('medium')
  const [currentEngine, setCurrentEngine] = useState<string>('whisper')
  const [newSpeakerName, setNewSpeakerName] = useState('')
  const [addingSpeaker, setAddingSpeaker] = useState(false)
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [sessionProgress, setSessionProgress] = useState<Map<string, number>>(new Map())
  const renameInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const [s, sp, settings] = await Promise.all([
      window.api.invoke('sessions:list'),
      window.api.invoke('speakers:list'),
      window.api.invoke('settings:get')
    ])
    setSessions(s)
    setSpeakers(sp)
    setCurrentModel(settings.defaultModel)
    setCurrentEngine(settings.defaultEngine)
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

    const offRecorded = window.api.on('recording:session-created', ({ session }) => {
      setSessions((prev) => [session, ...prev])
      onOpenSession(session.id)
    })

    return () => {
      offProgress()
      offDone()
      offRecorded()
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
      created.push(
        await window.api.invoke('sessions:create', file, currentModel, 'auto', currentEngine)
      )
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
    const session = await window.api.invoke(
      'sessions:create',
      path,
      currentModel,
      'auto',
      currentEngine
    )
    const updated = await window.api.invoke('sessions:update', session.id, {
      segments,
      status: 'done',
      name
    })
    setSessions((prev) => [updated, ...prev])
  }

  async function handleEmptySession(): Promise<void> {
    setNewMenuOpen(false)
    const session = await window.api.invoke(
      'sessions:create',
      '',
      currentModel,
      'auto',
      currentEngine
    )
    const updated = await window.api.invoke('sessions:update', session.id, {
      name: 'New session',
      status: 'done'
    })
    setSessions((prev) => [updated, ...prev])
  }

  async function handleRecord(): Promise<void> {
    setNewMenuOpen(false)
    await window.api.invoke('recording:open')
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

  async function handleSetColor(sp: Speaker, colorIdx: number): Promise<void> {
    const updated = await window.api.invoke('speakers:update', sp.id, sp.name, colorIdx)
    setSpeakers((prev) => prev.map((s) => (s.id === sp.id ? updated : s)))
    setColorPickerId(null)
  }

  const filteredSessions = search.trim()
    ? sessions.filter((s) => getSessionName(s).toLowerCase().includes(search.trim().toLowerCase()))
    : sessions

  return (
    <div
      className="flex h-screen flex-col"
      style={{ background: 'var(--app-shell)' }}
      onClick={() => {
        closeContextMenu()
        setNewMenuOpen(false)
        setColorPickerId(null)
      }}
    >
      {/* Context menu */}
      {contextMenu &&
        (() => {
          const session = sessions.find((s) => s.id === contextMenu.sessionId)
          if (!session) return null
          return (
            <div
              className="fixed z-50 min-w-[148px] rounded-xl border border-[#e8d4ca] bg-white/96 py-1.5 shadow-[0_20px_60px_rgba(60,20,40,0.18),0_4px_12px_rgba(60,20,40,0.08)] backdrop-blur-md"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-[#3d2635] transition-colors hover:bg-[#fff4ee]"
                onClick={(e) => handleStartRename(e, session)}
              >
                Rename
              </button>
              <div className="mx-2 my-1 border-t border-[#f3e5dd]" />
              <button
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-red-500 transition-colors hover:bg-red-50"
                onClick={(e) => {
                  handleDeleteSession(e, contextMenu.sessionId)
                  closeContextMenu()
                }}
              >
                Delete
              </button>
            </div>
          )
        })()}

      {/* Titlebar */}
      <div
        className="app-titlebar relative z-10 flex h-[44px] shrink-0 items-center justify-between border-b border-[#e8d4ca]/60 bg-white/80 backdrop-blur-xl"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sessions panel */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-[#e8d4ca]/50 bg-white/50 backdrop-blur-sm">
          {/* Sessions header */}
          <div className="flex items-center justify-between border-b border-[#f0e0d8]/70 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a08a96]">
              Sessions
            </span>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-[#ff5a3c] transition-colors hover:bg-[#fff0ea]"
                onClick={() => setNewMenuOpen((o) => !o)}
              >
                + New
                <svg width="8" height="5" viewBox="0 0 8 5" fill="none" className="mt-px">
                  <path
                    d="M1 1l3 3 3-3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {newMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[168px] rounded-xl border border-[#e8d4ca] bg-white/96 py-1.5 shadow-[0_20px_60px_rgba(60,20,40,0.16),0_4px_12px_rgba(60,20,40,0.08)] backdrop-blur-md">
                  <button
                    className="w-full px-3.5 py-2 text-left text-[13px] text-[#3d2635] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleNewSession}
                  >
                    Import audio file
                  </button>
                  <button
                    className="w-full px-3.5 py-2 text-left text-[13px] text-[#3d2635] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleImportText}
                  >
                    Import text
                  </button>
                  <div className="mx-2 my-1 border-t border-[#f3e5dd]" />
                  <button
                    className="w-full px-3.5 py-2 text-left text-[13px] text-[#3d2635] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleEmptySession}
                  >
                    Empty session
                  </button>
                  <div className="mx-2 my-1 border-t border-[#f3e5dd]" />
                  <button
                    className="w-full px-3.5 py-2 text-left text-[13px] text-[#3d2635] transition-colors hover:bg-[#fff4ee]"
                    onClick={handleRecord}
                  >
                    Record conversation
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="border-b border-[#f0e0d8]/70 px-3 py-2">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c0a8b5]"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M8.5 8.5L10.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                className="w-full rounded-lg border border-[#edd8ce]/60 bg-[#fff8f3]/80 py-1.5 pl-7 pr-3 text-[12px] text-[#3d2635] placeholder:text-[#c0a8b5] outline-none transition-colors focus:border-[#ffb7a1] focus:bg-white"
                placeholder="Search sessions…"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
              />
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-8 py-12">
                {sessions.length === 0 ? (
                  <>
                    <Logo size={52} className="opacity-90" />
                    <div className="mt-1 text-center">
                      <p className="text-[14px] font-semibold text-[#2e1f28]">Gimme Transcript</p>
                      <p className="mt-0.5 text-[12px] text-[#a08a96]">
                        Local offline transcription
                      </p>
                    </div>
                    <div className="mt-3 h-px w-12 bg-[#f0e0d8]" />
                    <p className="text-center text-[12px] text-[#b09aa6]">
                      Click <span className="font-semibold text-[#ff5a3c]">+ New</span> to import
                      audio or start recording
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-[#a08a96]">No sessions match your search</p>
                )}
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isLabeled =
                  s.status === 'done' &&
                  s.segments.length > 0 &&
                  s.segments.every((seg) => seg.speakerId !== null)
                const statusKey = isLabeled ? 'labeled' : s.status
                const isRenaming = renamingId === s.id
                const prog = sessionProgress.get(s.id)

                const statusLabel: string =
                  statusKey === 'transcribing'
                    ? prog !== undefined
                      ? `${Math.round(prog)}%`
                      : 'transcribing…'
                    : statusKey === 'done'
                      ? s.segments.length > 0
                        ? `${s.segments.length} segments`
                        : 'done'
                      : statusKey === 'labeled'
                        ? 'labeled'
                        : 'idle'

                return (
                  <div
                    key={s.id}
                    className="group flex cursor-pointer items-center gap-3 border-b border-[#f5e4de]/50 px-4 py-3 transition-colors hover:bg-white/55"
                    onClick={() => !isRenaming && onOpenSession(s.id)}
                    onContextMenu={(e) => handleContextMenu(e, s.id)}
                  >
                    <div
                      className="mt-px h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLOR[statusKey] ?? '#c0a8b5' }}
                    />
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          className="w-full rounded border border-[#ffb7a1] px-1 text-[14px] font-medium text-[#1c1117] outline-none"
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
                        <p className="m-0 truncate text-[14px] font-medium leading-snug text-[#1c1117]">
                          {getSessionName(s)}
                        </p>
                      )}
                      <p className="m-0 mt-0.5 text-[11px] text-[#a08a96]">
                        {statusLabel}
                        <span className="mx-1 text-[#d4c0cb]">·</span>
                        {formatAgo(s.createdAt)}
                      </p>
                    </div>
                    <svg
                      className="shrink-0 text-[#d4c0cb] transition-colors group-hover:text-[#b09aa6]"
                      width="5"
                      height="9"
                      viewBox="0 0 5 9"
                      fill="none"
                    >
                      <path
                        d="M1 1l3 3.5L1 8"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Speakers panel */}
        <div className="flex w-56 shrink-0 flex-col bg-white/30 backdrop-blur-sm">
          {/* Brand block */}
          <div className="flex flex-col items-center gap-2 border-b border-[#f0e0d8]/70 px-3 py-7">
            <img
              src={logoSvg}
              alt="Gimme Transcript"
              className="w-full object-contain"
              style={{ maxHeight: 64 }}
            />
            <p className="text-[12px] font-bold tracking-tight text-[#2e1f28]">Gimme Transcript</p>
          </div>
          <div className="flex items-center justify-between border-b border-[#f0e0d8]/70 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a08a96]">
              Speakers
            </span>
            <button
              className="text-[12px] font-semibold text-[#ff5a3c] transition-colors hover:text-[#ff3d1a]"
              onClick={() => setAddingSpeaker(true)}
            >
              + Add
            </button>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {addingSpeaker && (
                <div className="mb-3 rounded-xl border border-[#edd8ce] bg-white/80 p-2.5">
                  <input
                    className="w-full rounded-lg border border-[#edd8ce]/60 bg-[#fff8f3] px-2.5 py-1.5 text-[12px] text-[#3d2635] placeholder:text-[#c0a8b5] outline-none transition-colors focus:border-[#ffb7a1]"
                    placeholder="Speaker name"
                    value={newSpeakerName}
                    onChange={(e) => setNewSpeakerName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSpeaker()
                      if (e.key === 'Escape') setAddingSpeaker(false)
                    }}
                    autoFocus
                  />
                  <div className="mt-2 flex gap-1.5">
                    <button
                      className="flex-1 rounded-lg bg-[#ff5a3c] py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#ff3d1a]"
                      onClick={handleAddSpeaker}
                    >
                      Add
                    </button>
                    <button
                      className="flex-1 rounded-lg border border-[#edd8ce] py-1.5 text-[11px] font-medium text-[#7a6671] transition-colors hover:bg-[#fff0ea]"
                      onClick={() => setAddingSpeaker(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {speakers.length === 0 && !addingSpeaker ? (
                <p className="mt-6 text-center text-[11px] text-[#c0a8b5]">No speakers yet</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {speakers.map((sp) => (
                    <div
                      key={sp.id}
                      className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-white/60"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative shrink-0">
                          <button
                            className="h-5 w-5 rounded-full border border-white/60 shadow-sm transition-transform hover:scale-110 focus:outline-none"
                            style={{ backgroundColor: SPEAKER_PALETTE[sp.color % 16].swatch }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setColorPickerId((prev) => (prev === sp.id ? null : sp.id))
                            }}
                            title="Change color"
                          />
                          {colorPickerId === sp.id && (
                            <div
                              className="absolute left-0 top-6 z-50 grid grid-cols-4 gap-1 rounded-xl border border-[#edd8ce] bg-white/96 p-2 shadow-[0_18px_48px_rgba(77,42,66,0.14)] backdrop-blur-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {SPEAKER_PALETTE.map((c, i) => (
                                <button
                                  key={i}
                                  className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 focus:outline-none ${
                                    sp.color % 16 === i
                                      ? 'border-[#ff5a3c] ring-2 ring-[#ff5a3c] ring-offset-1'
                                      : 'border-white/60'
                                  }`}
                                  style={{ backgroundColor: c.swatch }}
                                  onClick={() => handleSetColor(sp, i)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="truncate text-[12px] font-medium text-[#3d2635]">
                          {sp.name}
                        </span>
                      </div>
                      <button
                        className="text-[10px] text-[#d4c0cb] opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                        onClick={() => handleDeleteSpeaker(sp.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Settings button */}
            <div className="shrink-0 border-t border-[#f0e0d8]/70 p-3">
              <button
                className="flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#fff0ea] to-[#fde8f8] px-3 py-2.5 text-left transition-all hover:from-[#ffe4d9] hover:to-[#f9d8f4] hover:shadow-[0_2px_8px_rgba(255,90,60,0.12)]"
                onClick={onOpenSettings}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 18 18"
                  fill="none"
                  className="text-[#ff5a3c]"
                >
                  <path
                    d="M9 1a1 1 0 0 1 1 1v.64a5.5 5.5 0 0 1 1.59.66l.45-.45a1 1 0 1 1 1.41 1.41l-.45.45A5.5 5.5 0 0 1 13.66 6H14.3a1 1 0 0 1 0 2h-.64a5.5 5.5 0 0 1-.66 1.59l.45.45a1 1 0 1 1-1.41 1.41l-.45-.45A5.5 5.5 0 0 1 10 11.64V12.3a1 1 0 0 1-2 0v-.64a5.5 5.5 0 0 1-1.59-.66l-.45.45a1 1 0 0 1-1.41-1.41l.45-.45A5.5 5.5 0 0 1 4.34 8H3.7a1 1 0 0 1 0-2h.64a5.5 5.5 0 0 1 .66-1.59l-.45-.45a1 1 0 1 1 1.41-1.41l.45.45A5.5 5.5 0 0 1 8 2.64V2a1 1 0 0 1 1-1zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                    fill="currentColor"
                  />
                </svg>
                <span className="text-[13px] font-semibold text-[#c03a20]">Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
