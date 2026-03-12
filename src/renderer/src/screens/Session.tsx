import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Text, Button, Group, Progress, ScrollArea, Select, Modal, Checkbox } from '@mantine/core'
import type { Session, Segment, Speaker, WhisperModel } from '../types/ipc'

interface Props {
  sessionId: string
  onBack: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const SPEAKER_COLORS = [
  { pill: 'bg-blue-100 text-blue-700', bar: 'bg-blue-50 border-l-2 border-blue-300' },
  { pill: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-50 border-l-2 border-emerald-300' },
  { pill: 'bg-orange-100 text-orange-700', bar: 'bg-orange-50 border-l-2 border-orange-300' },
  { pill: 'bg-violet-100 text-violet-700', bar: 'bg-violet-50 border-l-2 border-violet-300' },
  { pill: 'bg-pink-100 text-pink-700', bar: 'bg-pink-50 border-l-2 border-pink-300' },
  { pill: 'bg-amber-100 text-amber-700', bar: 'bg-amber-50 border-l-2 border-amber-300' },
  { pill: 'bg-cyan-100 text-cyan-700', bar: 'bg-cyan-50 border-l-2 border-cyan-300' },
  { pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-50 border-l-2 border-rose-300' },
]


export default function SessionScreen({ sessionId, onBack }: Props): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [downloadedModels, setDownloadedModels] = useState<WhisperModel[]>([])
  const [progress, setProgress] = useState(0)
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const didDragRef = useRef(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [segCtxMenu, setSegCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [newSpeakerName, setNewSpeakerName] = useState('')
  const newSpeakerInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    const [s, sp, modelList] = await Promise.all([
      window.api.invoke('sessions:get', sessionId),
      window.api.invoke('speakers:list'),
      window.api.invoke('models:list'),
    ])
    setSession(s)
    setSpeakers(sp)
    setDownloadedModels(modelList.filter((m) => m.downloaded).map((m) => m.model))
  }, [sessionId])

  useEffect(() => {
    reload()

    const offSegment = window.api.on('whisper:segment', ({ sessionId: sid, segment }) => {
      if (sid !== sessionId) return
      setSession((prev) => (prev ? { ...prev, segments: [...prev.segments, segment] } : prev))
    })
    const offProgress = window.api.on('whisper:progress', ({ sessionId: sid, percent }) => {
      if (sid !== sessionId) return
      setProgress(percent)
    })
    const offDone = window.api.on('whisper:done', ({ sessionId: sid }) => {
      if (sid !== sessionId) return
      reload()
    })
    const offError = window.api.on('whisper:error', ({ sessionId: sid, message }) => {
      if (sid !== sessionId) return
      setSession((prev) => (prev ? { ...prev, status: 'idle' } : prev))
      setError(message)
    })

    return () => {
      offSegment()
      offProgress()
      offDone()
      offError()
    }
  }, [sessionId, reload])

  // Stop drag on mouseup anywhere
  useEffect(() => {
    const stop = (): void => setIsDragging(false)
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const speakerColorMap = useMemo(() => {
    const map = new Map<string, number>()
    speakers.forEach((sp, i) => map.set(sp.id, i))
    return map
  }, [speakers])

  const selectedIds = useMemo((): Set<string> => {
    if (!session || anchorIdx === null) return new Set()
    const fi = focusIdx ?? anchorIdx
    const from = Math.min(anchorIdx, fi)
    const to = Math.max(anchorIdx, fi)
    return new Set(session.segments.slice(from, to + 1).map((s) => s.id))
  }, [anchorIdx, focusIdx, session])

  function handleSegmentMouseDown(e: React.MouseEvent, idx: number): void {
    if (e.button !== 0) return // только ЛКМ
    e.preventDefault()
    didDragRef.current = false
    setIsDragging(true)
    // Shift: расширяем от текущего anchor, не двигаем его
    if (!e.shiftKey) {
      setAnchorIdx(idx)
    }
    setFocusIdx(idx)
  }

  function handleSegmentMouseEnter(idx: number): void {
    if (isDragging) {
      didDragRef.current = true
      setFocusIdx(idx)
    }
  }

  function handleSegmentClick(idx: number, shiftKey: boolean): void {
    // Если был реальный drag — click не должен сбрасывать выделение
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    if (shiftKey && anchorIdx !== null) {
      setFocusIdx(idx)
    } else {
      setAnchorIdx(idx)
      setFocusIdx(idx)
    }
  }

  function clearSelection(): void {
    setAnchorIdx(null)
    setFocusIdx(null)
  }

  async function handleTranscribe(): Promise<void> {
    setError(null)
    setSession((prev) => (prev ? { ...prev, status: 'transcribing' } : prev))
    await window.api.invoke('whisper:transcribe', sessionId)
    reload()
  }

  async function handleCancel(): Promise<void> {
    await window.api.invoke('whisper:cancel', sessionId)
    reload()
  }

  async function handleMergeSelected(): Promise<void> {
    if (!session || selectedIds.size < 2) return
    setSegCtxMenu(null)
    const ordered = session.segments.filter((seg) => selectedIds.has(seg.id))
    const merged: Segment = {
      id: ordered[0].id,
      start: ordered[0].start,
      end: ordered[ordered.length - 1].end,
      text: ordered.map((s) => s.text.trim()).join(' '),
      speakerId: ordered[0].speakerId,
    }
    const segments = session.segments
      .filter((seg) => !selectedIds.has(seg.id) || seg.id === ordered[0].id)
      .map((seg) => (seg.id === ordered[0].id ? merged : seg))
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    clearSelection()
  }

  async function handleAssignSelected(speakerId: string | null): Promise<void> {
    if (!session || selectedIds.size === 0) return
    const segments = session.segments.map((seg) =>
      selectedIds.has(seg.id) ? { ...seg, speakerId } : seg
    )
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    clearSelection()
  }

  async function handleCreateAndAssign(name: string): Promise<void> {
    if (!session) return
    const sp = await window.api.invoke('speakers:create', name)
    setSpeakers((prev) => [...prev, sp])
    setNewSpeakerName('')
    if (selectedIds.size === 0) return
    const segments = session.segments.map((seg) =>
      selectedIds.has(seg.id) ? { ...seg, speakerId: sp.id } : seg
    )
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    clearSelection()
  }

  if (!session) return <div className="h-screen bg-white" />

  const sessionName = session.name ?? session.audioFile.split('/').pop() ?? session.audioFile
  const showTranscript = session.status === 'transcribing' || session.status === 'done'

  return (
    <div
      className="flex flex-col h-screen bg-white"
      onClick={(e) => {
        // Поглощаем клик после drag — выделение не сбрасываем
        if (didDragRef.current) {
          didDragRef.current = false
          return
        }
        if (!(e.target as Element).closest('[data-segment]') &&
            !(e.target as Element).closest('[data-sidebar]')) {
          clearSelection()
        }
        setSegCtxMenu(null)
      }}
    >
      {/* Segment context menu */}
      {segCtxMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ top: segCtxMenu.y, left: segCtxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
              selectedIds.size >= 2
                ? 'text-gray-700 hover:bg-gray-50'
                : 'text-gray-300 cursor-default'
            }`}
            disabled={selectedIds.size < 2}
            onClick={handleMergeSelected}
          >
            Merge {selectedIds.size >= 2 ? `${selectedIds.size} segments` : 'segments'}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-gray-200 shrink-0">
        <button
          className="text-xs text-gray-400 hover:text-gray-800 transition-colors px-1.5 py-1 rounded hover:bg-gray-100"
          onClick={onBack}
        >
          ← Home
        </button>
        <div className="w-px h-3.5 bg-gray-200" />
        <span className="text-sm text-gray-700 font-medium truncate flex-1">{sessionName}</span>
        {session.status === 'done' && (
          <Group gap="xs">
            <ExportButton session={session} speakers={speakers} />
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation()
                setMergeOpen(true)
              }}
            >
              Merge & Export
            </Button>
          </Group>
        )}
      </div>

      {/* Transcribing: progress bar */}
      {session.status === 'transcribing' && (
        <div className="px-4 py-2 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <Text size="xs" c="dimmed">
              Transcribing… {Math.round(progress)}%
            </Text>
            <button
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
          <Progress value={progress} animated size="xs" color="orange" />
        </div>
      )}

      {/* Idle state */}
      {session.status === 'idle' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-8">
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-2">
              Ready to transcribe
            </p>
            <p className="text-base font-semibold text-gray-800">{sessionName}</p>
          </div>
          {downloadedModels.length === 0 ? (
            <p className="text-xs text-amber-600 text-center max-w-xs">
              No models downloaded. Go to Settings to download one.
            </p>
          ) : (
            <div className="flex gap-4 items-end">
              <Select
                label="Model"
                size="sm"
                value={downloadedModels.includes(session.model) ? session.model : downloadedModels[0]}
                onChange={async (v) => {
                  if (!v) return
                  const updated = await window.api.invoke('sessions:update', sessionId, {
                    model: v as WhisperModel,
                  })
                  setSession(updated)
                }}
                data={downloadedModels.map((m) => ({ value: m, label: m }))}
              />
              <Select
                label="Language"
                size="sm"
                value={session.language}
                onChange={async (v) => {
                  if (!v) return
                  const updated = await window.api.invoke('sessions:update', sessionId, {
                    language: v,
                  })
                  setSession(updated)
                }}
                data={[
                  { value: 'auto', label: 'auto-detect' },
                  { value: 'ru', label: 'Russian' },
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'German' },
                  { value: 'fr', label: 'French' },
                  { value: 'es', label: 'Spanish' },
                ]}
              />
            </div>
          )}
          <Button color="orange" disabled={downloadedModels.length === 0} onClick={handleTranscribe}>
            Transcribe
          </Button>
          {error && (
            <p className="text-xs text-red-500 text-center max-w-xs px-4">{error}</p>
          )}
        </div>
      )}

      {/* Transcript + sidebar */}
      {showTranscript && (
        <div className="flex flex-1 overflow-hidden">
          {/* Transcript */}
          <ScrollArea className="flex-1">
            <div className="py-6" style={{ userSelect: 'none' }}>
              {session.segments.length === 0 && session.status === 'transcribing' && (
                <div className="flex items-center justify-center h-20">
                  <Text size="sm" c="dimmed">Waiting for first segment…</Text>
                </div>
              )}

              {session.segments.map((seg, idx) => {
                const speaker = speakers.find((s) => s.id === seg.speakerId)
                const colorIdx = speaker ? (speakerColorMap.get(speaker.id) ?? 0) : -1
                const colors = colorIdx >= 0 ? SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length] : null
                const isSelected = selectedIds.has(seg.id)

                return (
                  <div
                    key={seg.id}
                    data-segment
                    className={`flex gap-0 px-10 py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'
                    }`}
                    onMouseDown={(e) => handleSegmentMouseDown(e, idx)}
                    onMouseEnter={() => handleSegmentMouseEnter(idx)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSegCtxMenu(null)
                      handleSegmentClick(idx, e.shiftKey)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSegCtxMenu({ x: e.clientX, y: e.clientY })
                    }}
                  >
                    {/* Left: speaker + timestamp */}
                    <div className="w-32 shrink-0 flex flex-col items-end gap-0.5 pr-4 pt-0.5">
                      {speaker ? (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors?.pill ?? ''}`}
                        >
                          {speaker.name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-300 font-medium">—</span>
                      )}
                      {seg.start > 0 && (
                        <span className="text-[10px] font-mono text-gray-300">
                          {formatTime(seg.start)}
                        </span>
                      )}
                    </div>

                    {/* Right: text */}
                    <p className="flex-1 text-sm text-gray-800 leading-relaxed m-0">
                      {seg.text.trim()}
                    </p>
                  </div>
                )
              })}

              {session.status === 'transcribing' && session.segments.length > 0 && (
                <div className="px-10 py-2 pl-[8.5rem]">
                  <span className="inline-block w-0.5 h-4 bg-orange-400 animate-pulse rounded" />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Speakers sidebar */}
          <div
            data-sidebar
            className="w-44 shrink-0 border-l border-gray-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky header */}
            <div className="sticky top-0 bg-white px-3 py-2.5 border-b border-gray-100 z-10">
              {selectedIds.size > 0 ? (
                <div className="flex items-center justify-between">
                  <Text size="xs" fw={600} c="orange">
                    {selectedIds.size} {selectedIds.size === 1 ? 'segment' : 'segments'}
                  </Text>
                  <button
                    className="text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
                    onClick={clearSelection}
                  >
                    clear
                  </button>
                </div>
              ) : (
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                  Speakers
                </Text>
              )}
            </div>

            {/* Speaker list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
              <button
                className={`text-xs px-3 py-2 rounded-lg text-left font-medium transition-colors ${
                  selectedIds.size > 0
                    ? 'text-gray-400 bg-gray-100 hover:bg-red-50 hover:text-red-400 cursor-pointer'
                    : 'text-gray-300 bg-gray-50 cursor-default opacity-60'
                }`}
                disabled={selectedIds.size === 0}
                onClick={() => handleAssignSelected(null)}
              >
                — none
              </button>
              {speakers.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" mt="lg">
                  No speakers yet
                </Text>
              )}
              {speakers.map((sp) => {
                const colorIdx = speakerColorMap.get(sp.id) ?? 0
                const colors = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]
                return (
                  <button
                    key={sp.id}
                    className={`text-xs px-3 py-2 rounded-lg text-left font-medium transition-colors ${
                      selectedIds.size > 0
                        ? `${colors.pill} hover:opacity-80 cursor-pointer`
                        : 'text-gray-600 bg-gray-50 cursor-default opacity-60'
                    }`}
                    disabled={selectedIds.size === 0}
                    onClick={() => handleAssignSelected(sp.id)}
                  >
                    {sp.name}
                  </button>
                )
              })}
            </div>

            {/* New speaker input */}
            <div className="px-3 pb-3 pt-1 border-t border-gray-100">
              <input
                ref={newSpeakerInputRef}
                className="text-xs px-2.5 py-1.5 w-full bg-gray-50 rounded-lg outline-none placeholder-gray-400 text-gray-700 focus:bg-orange-50 focus:placeholder-orange-300 transition-colors border border-transparent focus:border-orange-200"
                placeholder="+ new speaker"
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateAndAssign(newSpeakerName.trim())
                  if (e.key === 'Escape') setNewSpeakerName('')
                }}
              />
            </div>
          </div>
        </div>
      )}

      <MergeExportModal
        opened={mergeOpen}
        onClose={() => setMergeOpen(false)}
        currentSessionId={sessionId}
        speakers={speakers}
      />
    </div>
  )
}

// ─── ExportButton ─────────────────────────────────────────────────────────────

interface ExportButtonProps {
  session: Session
  speakers: Speaker[]
}

function ExportButton({ session, speakers }: ExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  function buildMd(): string {
    const lines: string[] = []
    for (const seg of session.segments) {
      const sp = speakers.find((s) => s.id === seg.speakerId)
      const time = seg.start > 0 ? ` [${formatTime(seg.start)}]` : ''
      lines.push(`**${sp?.name ?? 'Unknown'}**${time}`)
      lines.push(seg.text.trim())
      lines.push('')
    }
    return lines.join('\n')
  }

  function buildTxt(): string {
    return session.segments
      .map((seg) => {
        const sp = speakers.find((s) => s.id === seg.speakerId)
        const time = seg.start > 0 ? `[${formatTime(seg.start)}] ` : ''
        return `${time}${sp?.name ?? 'Unknown'}: ${seg.text.trim()}`
      })
      .join('\n')
  }

  async function handleExport(format: 'md' | 'txt'): Promise<void> {
    setOpen(false)
    const base = (session.name ?? session.audioFile.split('/').pop()?.replace(/\.[^.]+$/, '')) ?? 'transcript'
    const savePath = await window.api.invoke('dialog:save', `${base}.${format}`)
    if (!savePath) return
    await window.api.invoke('export:write', savePath, format === 'md' ? buildMd() : buildTxt())
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Button size="xs" variant="light" color="orange" onClick={() => setOpen((o) => !o)}>
        Export ▾
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
          <button
            className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700 transition-colors"
            onClick={() => handleExport('md')}
          >
            Markdown (.md)
          </button>
          <button
            className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700 transition-colors"
            onClick={() => handleExport('txt')}
          >
            Plain text (.txt)
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MergeExportModal ─────────────────────────────────────────────────────────

interface MergeExportModalProps {
  opened: boolean
  onClose: () => void
  currentSessionId: string
  speakers: Speaker[]
}

function MergeExportModal({
  opened,
  onClose,
  currentSessionId,
  speakers,
}: MergeExportModalProps): React.JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!opened) return
    window.api.invoke('sessions:list').then((all) => {
      const done = all.filter((s) => s.status === 'done')
      setSessions(done)
      setCheckedIds(new Set(done.map((s) => s.id).filter((id) => id === currentSessionId)))
    })
  }, [opened, currentSessionId])

  function toggle(id: string): void {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function mergedSegments(): Segment[] {
    return sessions.filter((s) => checkedIds.has(s.id)).flatMap((s) => s.segments)
  }

  function buildMd(): string {
    const lines: string[] = []
    for (const seg of mergedSegments()) {
      const sp = speakers.find((s) => s.id === seg.speakerId)
      const time = seg.start > 0 ? ` [${formatTime(seg.start)}]` : ''
      lines.push(`**${sp?.name ?? 'Unknown'}**${time}`)
      lines.push(seg.text.trim())
      lines.push('')
    }
    return lines.join('\n')
  }

  function buildTxt(): string {
    return mergedSegments()
      .map((seg) => {
        const sp = speakers.find((s) => s.id === seg.speakerId)
        const time = seg.start > 0 ? `[${formatTime(seg.start)}] ` : ''
        return `${time}${sp?.name ?? 'Unknown'}: ${seg.text.trim()}`
      })
      .join('\n')
  }

  async function handleExport(format: 'md' | 'txt'): Promise<void> {
    onClose()
    const savePath = await window.api.invoke('dialog:save', `merged.${format}`)
    if (!savePath) return
    await window.api.invoke('export:write', savePath, format === 'md' ? buildMd() : buildTxt())
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Merge & Export" centered size="sm">
      <div className="flex flex-col gap-3">
        <Text size="sm" c="dimmed">
          Select sessions to merge:
        </Text>
        {sessions.map((s) => (
          <Checkbox
            key={s.id}
            checked={checkedIds.has(s.id)}
            onChange={() => toggle(s.id)}
            label={
              <Text size="sm">{s.name ?? s.audioFile.split('/').pop() ?? s.audioFile}</Text>
            }
          />
        ))}
        {sessions.length === 0 && (
          <Text size="sm" c="dimmed" ta="center">
            No completed sessions found.
          </Text>
        )}
        <Group justify="flex-end" mt="xs">
          <Button
            size="sm"
            variant="light"
            color="orange"
            disabled={checkedIds.size === 0}
            onClick={() => handleExport('md')}
          >
            Markdown
          </Button>
          <Button
            size="sm"
            variant="light"
            color="orange"
            disabled={checkedIds.size === 0}
            onClick={() => handleExport('txt')}
          >
            Plain text
          </Button>
        </Group>
      </div>
    </Modal>
  )
}
