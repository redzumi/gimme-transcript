import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Text, Button, Group, Progress, Select, Modal, Checkbox } from '@mantine/core'
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
  { pill: 'bg-[#ffe3dc] text-[#d4375b]', bar: 'bg-[#fff5f1] border-l-2 border-[#ff7e77]' },
  { pill: 'bg-violet-100 text-violet-700', bar: 'bg-violet-50 border-l-2 border-violet-300' },
  { pill: 'bg-pink-100 text-pink-700', bar: 'bg-pink-50 border-l-2 border-pink-300' },
  { pill: 'bg-amber-100 text-amber-700', bar: 'bg-amber-50 border-l-2 border-amber-300' },
  { pill: 'bg-cyan-100 text-cyan-700', bar: 'bg-cyan-50 border-l-2 border-cyan-300' },
  { pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-50 border-l-2 border-rose-300' }
]

const SUPPORTED_EXTS = new Set(['mp3', 'm4a', 'mp4', 'wav', 'ogg', 'flac', 'aac', 'opus', 'webm'])

export default function SessionScreen({ sessionId, onBack }: Props): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [downloadedModels, setDownloadedModels] = useState<WhisperModel[]>([])
  const [progress, setProgress] = useState(0)
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [segCtxMenu, setSegCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [convertProgress, setConvertProgress] = useState(0)
  const [pendingSeg, setPendingSeg] = useState<Segment | null>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const segmentScrollRef = useRef<HTMLDivElement>(null)
  const playEndRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const didDragRef = useRef(false)

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: session?.segments.length ?? 0,
    getScrollElement: () => segmentScrollRef.current,
    estimateSize: () => 60,
    overscan: 5
  })

  const reload = useCallback(async () => {
    const [s, sp, modelList] = await Promise.all([
      window.api.invoke('sessions:get', sessionId),
      window.api.invoke('speakers:list'),
      window.api.invoke('models:list')
    ])
    if (s?.convertedAudioPath && !s.audioConvertedCBR) {
      await window.api.invoke('audio:reset-converted', sessionId)
      s.convertedAudioPath = undefined
    }
    setSession(s)
    setSpeakers(sp)
    setDownloadedModels(modelList.filter((m) => m.downloaded).map((m) => m.model))
  }, [sessionId])

  useEffect(() => {
    void Promise.resolve().then(reload)

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
    const offConvertProgress = window.api.on(
      'audio:convert-progress',
      ({ sessionId: sid, percent }) => {
        if (sid !== sessionId) return
        setConvertProgress(percent)
      }
    )
    const offConvertDone = window.api.on(
      'audio:convert-done',
      ({ sessionId: sid, convertedAudioPath }) => {
        if (sid !== sessionId) return
        setConverting(false)
        setConvertProgress(0)
        setSession((prev) => (prev ? { ...prev, convertedAudioPath } : prev))
      }
    )
    const offConvertError = window.api.on('audio:convert-error', ({ sessionId: sid, message }) => {
      if (sid !== sessionId) return
      setConverting(false)
      setPendingSeg(null)
      console.error('[convert] error:', message)
    })

    return () => {
      offSegment()
      offProgress()
      offDone()
      offError()
      offConvertProgress()
      offConvertDone()
      offConvertError()
    }
  }, [sessionId, reload])

  useEffect(() => {
    const onMouseUp = (): void => {
      isDraggingRef.current = false
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
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

  function handleSegmentClick(idx: number, shiftKey: boolean): void {
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

  async function handleMergeSelected(): Promise<void> {
    if (!session || selectedIds.size < 2) return
    setSegCtxMenu(null)
    const selected = session.segments.filter((s) => selectedIds.has(s.id))
    const merged: Segment = {
      id: selected[0].id,
      start: selected[0].start,
      end: selected[selected.length - 1].end,
      text: selected.map((s) => s.text.trim()).join(' '),
      speakerId: selected[0].speakerId
    }
    const segments = session.segments
      .filter((s) => !selectedIds.has(s.id) || s.id === merged.id)
      .map((s) => (s.id === merged.id ? merged : s))
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    clearSelection()
  }

  async function handleAssignSelected(speakerId: string | null): Promise<void> {
    if (!session || selectedIds.size === 0) return
    const resolvedId = speakerId === '__none__' ? null : speakerId
    const segments = session.segments.map((seg) =>
      selectedIds.has(seg.id) ? { ...seg, speakerId: resolvedId } : seg
    )
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    clearSelection()
  }

  function handleEditStart(seg: Segment): void {
    setEditingId(seg.id)
    setEditValue(seg.text.trim())
    clearSelection()
    setTimeout(() => {
      editRef.current?.focus()
      editRef.current?.select()
    }, 0)
  }

  async function handleEditSave(segId: string): Promise<void> {
    if (!session) return
    const text = editValue.trim()
    if (!text) {
      setEditingId(null)
      return
    }
    const segments = session.segments.map((s) => (s.id === segId ? { ...s, text } : s))
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    setEditingId(null)
  }

  function handleEditCancel(): void {
    setEditingId(null)
  }

  const hasAudio = (session?.audioSources?.[0]?.path ?? '') !== ''
  const audioSrc = hasAudio
    ? 'file://' + encodeURI(session?.convertedAudioPath ?? session?.audioSources?.[0]?.path ?? '')
    : undefined

  function playSegment(seg: Segment): void {
    const audio = audioRef.current
    if (!audio) return
    if (playingId === seg.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    playEndRef.current = seg.end
    audio.currentTime = seg.start
    audio
      .play()
      .then(() => setPlayingId(seg.id))
      .catch((err) => console.error('[audio] play failed:', err))
  }

  function handlePlaySegment(seg: Segment): void {
    if (!session) return
    if (session.convertedAudioPath) {
      playSegment(seg)
      return
    }
    const ext = (session.audioSources[0]?.path ?? '').split('.').pop()?.toLowerCase() ?? ''
    if (SUPPORTED_EXTS.has(ext)) {
      playSegment(seg)
      return
    }
    setPendingSeg(seg)
    setConvertProgress(0)
    setConverting(true)
    void window.api.invoke('audio:convert', sessionId)
  }

  useEffect(() => {
    if (!pendingSeg || !session?.convertedAudioPath) return
    const audio = audioRef.current
    if (!audio) return
    const onCanPlay = (): void => {
      playSegment(pendingSeg)
      setPendingSeg(null)
    }
    audio.addEventListener('canplay', onCanPlay, { once: true })
    return () => audio.removeEventListener('canplay', onCanPlay)
  }, [pendingSeg, session?.convertedAudioPath])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTimeUpdate = (): void => {
      if (audio.currentTime >= playEndRef.current) {
        audio.pause()
        setPlayingId(null)
      }
    }
    const onEnded = (): void => setPlayingId(null)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioSrc])

  async function handleTranscribe(): Promise<void> {
    setError(null)
    setSession((prev) => (prev ? { ...prev, status: 'transcribing' } : prev))
    await window.api.invoke('whisper:transcribe', sessionId)
  }

  if (!session) return <div className="h-screen bg-[var(--app-shell)]" />

  const sessionName = session.name ?? session.audioSources[0]?.path.split('/').pop() ?? 'Session'
  const showTranscript = session.status === 'transcribing' || session.status === 'done'

  return (
    <div
      className="flex h-screen flex-col bg-[var(--app-shell)]"
      onClick={(e) => {
        if (didDragRef.current) {
          didDragRef.current = false
          return
        }
        setSegCtxMenu(null)
        if (!(e.target as Element).closest('[data-segment]')) clearSelection()
      }}
    >
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
          style={{ display: 'none' }}
          onError={(e) =>
            console.error('[audio] load error:', (e.target as HTMLAudioElement).error)
          }
        />
      )}

      {segCtxMenu && selectedIds.size >= 1 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSegCtxMenu(null)} />
          <div
            className="fixed z-50 min-w-[180px] rounded-xl border border-[#edd8ce] bg-white/95 py-1 shadow-[0_18px_48px_rgba(77,42,66,0.14)] backdrop-blur-sm"
            style={{ top: segCtxMenu.y, left: segCtxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[#8f7982]">
              {selectedIds.size} segment{selectedIds.size > 1 ? 's' : ''}
            </div>
            <div className="my-1 border-t border-[#f3e5dd]" />
            {speakers.map((sp) => {
              const colorIdx = speakerColorMap.get(sp.id) ?? 0
              const colors = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]
              return (
                <button
                  key={sp.id}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
                  onClick={() => {
                    handleAssignSelected(sp.id)
                    setSegCtxMenu(null)
                  }}
                >
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors.pill}`}
                  >
                    {sp.name}
                  </span>
                </button>
              )
            })}
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-[#8f7982] transition-colors hover:bg-[#fff4ee]"
              onClick={() => {
                handleAssignSelected('__none__')
                setSegCtxMenu(null)
              }}
            >
              — unassign
            </button>
            {selectedIds.size >= 2 && (
              <>
                <div className="my-1 border-t border-[#f3e5dd]" />
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
                  onClick={handleMergeSelected}
                >
                  Merge {selectedIds.size} segments
                </button>
              </>
            )}
          </div>
        </>
      )}

      <Modal opened={converting} onClose={() => {}} withCloseButton={false} centered size="sm">
        <div className="flex flex-col gap-4 py-2">
          <Text size="sm" fw={500}>
            Converting audio for playback…
          </Text>
          <Progress value={convertProgress} animated size="sm" color="sunset" />
          <Text size="xs" c="dimmed" ta="right">
            {Math.round(convertProgress)}%
          </Text>
        </div>
      </Modal>

      <div className="relative z-[60] flex h-12 shrink-0 items-center gap-2 border-b border-[#ead7cf] bg-white/70 px-4 backdrop-blur-sm">
        <button
          className="rounded px-1.5 py-1 text-xs text-[#8f7982] transition-colors hover:bg-[#fff2eb] hover:text-[#24191f]"
          onClick={onBack}
        >
          ← Home
        </button>
        <div className="w-px h-3.5 bg-gray-200" />
        <span className="flex-1 truncate text-sm font-medium text-[#5b4653]">{sessionName}</span>
        {session.status === 'done' && (
          <Group gap="xs">
            <CopyButton session={session} speakers={speakers} />
            <ExportButton session={session} speakers={speakers} />
            <Button
              size="xs"
              variant="subtle"
              color="lilac"
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

      {session.status === 'transcribing' && (
        <div className="shrink-0 border-b border-[#f3e5dd] bg-white/70 px-4 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <Text size="xs" c="dimmed">
              Transcribing… {Math.round(progress)}%
            </Text>
            <button
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              onClick={async () => {
                await window.api.invoke('whisper:cancel', sessionId)
                reload()
              }}
            >
              Cancel
            </button>
          </div>
          <Progress value={progress} animated size="xs" color="sunset" />
        </div>
      )}

      {session.status === 'idle' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-8">
          <div className="text-center">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-[#8f7982]">
              Ready to transcribe
            </p>
            <p className="text-base font-semibold text-[#24191f]">{sessionName}</p>
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
                value={
                  downloadedModels.includes(session.model) ? session.model : downloadedModels[0]
                }
                onChange={async (v) => {
                  if (!v) return
                  const updated = await window.api.invoke('sessions:update', sessionId, {
                    model: v as WhisperModel
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
                    language: v
                  })
                  setSession(updated)
                }}
                data={[
                  { value: 'auto', label: 'auto-detect' },
                  { value: 'ru', label: 'Russian' },
                  { value: 'en', label: 'English' },
                  { value: 'de', label: 'German' },
                  { value: 'fr', label: 'French' },
                  { value: 'es', label: 'Spanish' }
                ]}
              />
            </div>
          )}
          <Button
            color="sunset"
            disabled={downloadedModels.length === 0}
            onClick={handleTranscribe}
          >
            Transcribe
          </Button>
          {error && <p className="text-xs text-red-500 text-center max-w-xs px-4">{error}</p>}
        </div>
      )}

      {showTranscript && (
        <>
          {session.segments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              {session.status === 'transcribing' ? (
                <Text size="sm" c="dimmed">
                  Waiting for first segment…
                </Text>
              ) : (
                <PasteArea
                  onSubmit={async (text) => {
                    const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/\n/)
                    const segments = blocks
                      .map((b) => b.trim())
                      .filter((b) => b.length > 0)
                      .map((b, i) => ({
                        id: `pasted-${i}-${Math.random().toString(36).slice(2)}`,
                        start: 0,
                        end: 0,
                        text: b,
                        speakerId: null
                      }))
                    const updated = await window.api.invoke('sessions:update', sessionId, {
                      segments
                    })
                    setSession(updated)
                  }}
                />
              )}
            </div>
          ) : (
            <div ref={segmentScrollRef} className="flex-1 overflow-y-auto">
              <div
                style={{
                  height: rowVirtualizer.getTotalSize() + 48,
                  position: 'relative'
                }}
              >
                {rowVirtualizer.getVirtualItems().map((vItem) => {
                  const seg = session.segments[vItem.index]
                  const idx = vItem.index
                  const speaker = speakers.find((s) => s.id === seg.speakerId)
                  const colorIdx = speaker ? (speakerColorMap.get(speaker.id) ?? 0) : -1
                  const colors =
                    colorIdx >= 0 ? SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length] : null
                  const isSelected = selectedIds.has(seg.id)
                  const isEditing = editingId === seg.id

                  return (
                    <div
                      key={vItem.key}
                      data-index={vItem.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vItem.start + 24}px)`
                      }}
                      data-segment
                      className={`flex gap-0 py-2 transition-colors ${
                        isEditing
                          ? 'bg-white px-10'
                          : `cursor-pointer select-none ${
                              isSelected
                                ? 'bg-[#ffe8e1] pl-[calc(2.5rem-3px)] pr-10 border-l-[3px] border-[#ff7e77]'
                                : 'px-10 hover:bg-[#fff6f0]'
                            }`
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!isSelected) {
                          setAnchorIdx(idx)
                          setFocusIdx(idx)
                        }
                        setSegCtxMenu({ x: e.clientX, y: e.clientY })
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0 || isEditing) return
                        isDraggingRef.current = true
                        didDragRef.current = false
                        if (!e.shiftKey) {
                          setAnchorIdx(idx)
                          setFocusIdx(idx)
                        }
                      }}
                      onMouseEnter={() => {
                        if (!isDraggingRef.current) return
                        didDragRef.current = true
                        setFocusIdx(idx)
                      }}
                      onClick={(e) => {
                        if (isEditing) return
                        if (didDragRef.current) {
                          didDragRef.current = false
                          return
                        }
                        e.stopPropagation()
                        handleSegmentClick(idx, e.shiftKey)
                      }}
                    >
                      <div className="w-32 shrink-0 flex flex-col items-end gap-0.5 pr-4 pt-0.5">
                        {speaker ? (
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors?.pill ?? ''}`}
                          >
                            {speaker.name}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-[#ccb8c1]">—</span>
                        )}
                        <span className="text-[10px] font-mono text-[#ccb8c1]">
                          {formatTime(seg.start)}
                        </span>
                        {hasAudio && seg.end > seg.start && (
                          <button
                            className={`text-[11px] leading-none transition-colors mt-0.5 ${
                              playingId === seg.id
                                ? 'text-[#ff4d6d]'
                                : 'text-[#ccb8c1] hover:text-[#ff7a18]'
                            }`}
                            title={playingId === seg.id ? 'Pause' : 'Play segment'}
                            onClick={(e) => {
                              e.stopPropagation()
                              handlePlaySegment(seg)
                            }}
                          >
                            {playingId === seg.id ? '⏸' : '▶'}
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <textarea
                          ref={editRef}
                          className="flex-1 resize-none rounded border border-[#ffb7a1] bg-[#fff4ee] px-2 py-0.5 text-sm leading-relaxed text-[#24191f] outline-none transition-colors focus:bg-white"
                          value={editValue}
                          rows={Math.max(2, editValue.split('\n').length)}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleEditSave(seg.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              handleEditCancel()
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleEditSave(seg.id)
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <p
                          className="m-0 flex-1 text-sm leading-relaxed text-[#24191f]"
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            handleEditStart(seg)
                          }}
                        >
                          {seg.text.trim()}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {session.status === 'transcribing' && session.segments.length > 0 && (
            <div className="shrink-0 border-t border-[#f6ebe5] px-10 py-2 pl-[8.5rem]">
              <span className="inline-block h-4 w-0.5 rounded bg-[#ff7a18] animate-pulse" />
            </div>
          )}
        </>
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

function PasteArea({ onSubmit }: { onSubmit: (text: string) => Promise<void> }): React.JSX.Element {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(): Promise<void> {
    const text = value.trim()
    if (!text) return
    setLoading(true)
    await onSubmit(text)
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full px-10 py-8 gap-4" onClick={(e) => e.stopPropagation()}>
      <textarea
        className="min-h-[300px] w-full flex-1 resize-none rounded-xl border border-[#edd8ce] bg-white/80 p-4 text-sm leading-relaxed text-[#24191f] outline-none transition-colors placeholder:text-[#ccb8c1] focus:border-[#ffb7a1]"
        placeholder="Paste your text here…&#10;&#10;Each paragraph will become a separate segment."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <div className="flex justify-end">
        <Button
          color="sunset"
          size="sm"
          disabled={!value.trim() || loading}
          loading={loading}
          onClick={handleSubmit}
        >
          Split into segments
        </Button>
      </div>
    </div>
  )
}

interface ExportButtonProps {
  session: Session
  speakers: Speaker[]
}

function buildMarkdown(segments: Segment[], speakers: Speaker[]): string {
  const lines: string[] = []
  for (const seg of segments) {
    const sp = speakers.find((s) => s.id === seg.speakerId)
    const time = ` [${formatTime(seg.start)}]`
    lines.push(`**${sp?.name ?? 'Unknown'}**${time}`)
    lines.push(seg.text.trim())
    lines.push('')
  }
  return lines.join('\n')
}

function buildPlainText(segments: Segment[], speakers: Speaker[]): string {
  return segments
    .map((seg) => {
      const sp = speakers.find((s) => s.id === seg.speakerId)
      return `[${formatTime(seg.start)}] ${sp?.name ?? 'Unknown'}: ${seg.text.trim()}`
    })
    .join('\n')
}

function CopyButton({ session, speakers }: ExportButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(buildPlainText(session.segments, speakers))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Button size="xs" variant="light" color="sunset" onClick={() => void handleCopy()}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function ExportButton({ session, speakers }: ExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  async function handleExport(format: 'md' | 'txt'): Promise<void> {
    setOpen(false)
    const base =
      session.name ??
      (session.audioSources[0]?.path ?? '')
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ??
      'transcript'
    const savePath = await window.api.invoke('dialog:save', `${base}.${format}`, format)
    if (!savePath) return
    await window.api.invoke(
      'export:write',
      savePath,
      format === 'md'
        ? buildMarkdown(session.segments, speakers)
        : buildPlainText(session.segments, speakers)
    )
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Button size="xs" variant="light" color="sunset" onClick={() => setOpen((o) => !o)}>
        Export ▾
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 min-w-[140px] rounded-xl border border-[#edd8ce] bg-white/95 py-1 shadow-[0_18px_48px_rgba(77,42,66,0.14)] backdrop-blur-sm">
          <button
            className="w-full px-3 py-2 text-left text-xs text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
            onClick={() => handleExport('md')}
          >
            Markdown (.md)
          </button>
          <button
            className="w-full px-3 py-2 text-left text-xs text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
            onClick={() => handleExport('txt')}
          >
            Plain text (.txt)
          </button>
        </div>
      )}
    </div>
  )
}

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
  speakers
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

  async function handleExport(format: 'md' | 'txt'): Promise<void> {
    onClose()
    const savePath = await window.api.invoke('dialog:save', `merged.${format}`, format)
    if (!savePath) return
    const segments = mergedSegments()
    await window.api.invoke(
      'export:write',
      savePath,
      format === 'md' ? buildMarkdown(segments, speakers) : buildPlainText(segments, speakers)
    )
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
              <Text size="sm">
                {s.name ?? s.audioSources[0]?.path.split('/').pop() ?? 'Session'}
              </Text>
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
            color="sunset"
            disabled={checkedIds.size === 0}
            onClick={() => handleExport('md')}
          >
            Markdown
          </Button>
          <Button
            size="sm"
            variant="light"
            color="sunset"
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
