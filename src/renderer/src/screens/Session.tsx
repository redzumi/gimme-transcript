import { useState, useEffect, useCallback } from 'react'
import {
  Text,
  Button,
  Group,
  Stack,
  Select,
  Progress,
  ActionIcon,
  ScrollArea,
  Popover,
  Badge,
  Divider,
  Checkbox
} from '@mantine/core'
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

export default function SessionScreen({ sessionId, onBack }: Props): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [progress, setProgress] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const reload = useCallback(async () => {
    const [s, sp] = await Promise.all([
      window.api.invoke('sessions:get', sessionId),
      window.api.invoke('speakers:list')
    ])
    setSession(s)
    setSpeakers(sp)
  }, [sessionId])

  useEffect(() => {
    reload()

    const offSegment = window.api.on('whisper:segment', ({ sessionId: sid, segment }) => {
      if (sid !== sessionId) return
      setSession((prev) =>
        prev ? { ...prev, segments: [...prev.segments, segment] } : prev
      )
    })

    const offProgress = window.api.on('whisper:progress', ({ sessionId: sid, percent }) => {
      if (sid !== sessionId) return
      setProgress(percent)
    })

    const offDone = window.api.on('whisper:done', ({ sessionId: sid }) => {
      if (sid !== sessionId) return
      reload()
    })

    return () => {
      offSegment()
      offProgress()
      offDone()
    }
  }, [sessionId, reload])

  async function handleTranscribe(): Promise<void> {
    await window.api.invoke('whisper:transcribe', sessionId)
    reload()
  }

  async function handleCancel(): Promise<void> {
    await window.api.invoke('whisper:cancel', sessionId)
    reload()
  }

  async function handleAssignSpeaker(segmentId: string, speakerId: string | null): Promise<void> {
    if (!session) return
    const segments = session.segments.map((seg) =>
      seg.id === segmentId ? { ...seg, speakerId } : seg
    )
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
  }

  async function handleBulkAssign(speakerId: string | null): Promise<void> {
    if (!session || selected.size === 0) return
    const segments = session.segments.map((seg) =>
      selected.has(seg.id) ? { ...seg, speakerId } : seg
    )
    const updated = await window.api.invoke('sessions:update', sessionId, { segments })
    setSession(updated)
    setSelected(new Set())
  }

  async function handleAddSpeaker(name: string): Promise<Speaker> {
    const sp = await window.api.invoke('speakers:create', name)
    setSpeakers((prev) => [...prev, sp])
    return sp
  }

  function toggleSelect(segId: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(segId)) next.delete(segId)
      else next.add(segId)
      return next
    })
  }

  if (!session) return <div className="flex items-center justify-center h-screen text-white">Loading…</div>

  const fileName = session.audioFile.split('/').pop() ?? session.audioFile

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10">
        <Button size="xs" variant="subtle" onClick={onBack}>
          ← Home
        </Button>
        <Text fw={600} className="flex-1 truncate">
          {fileName}
        </Text>
        <Badge color={session.status === 'done' ? 'green' : session.status === 'transcribing' ? 'blue' : 'gray'} variant="light" size="sm">
          {session.status}
        </Badge>
      </div>

      {/* Idle state */}
      {session.status === 'idle' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-6">
          <Stack gap="xs" align="center">
            <Text size="sm" c="dimmed">
              Audio file:
            </Text>
            <Text fw={500}>{fileName}</Text>
          </Stack>
          <Group gap="md">
            <Select
              label="Model"
              size="sm"
              value={session.model}
              onChange={async (v) => {
                if (!v) return
                const updated = await window.api.invoke('sessions:update', sessionId, {
                  model: v as WhisperModel
                })
                setSession(updated)
              }}
              data={['tiny', 'base', 'small', 'medium', 'large']}
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
          </Group>
          <Button size="md" onClick={handleTranscribe}>
            Transcribe
          </Button>
        </div>
      )}

      {/* Transcribing state */}
      {session.status === 'transcribing' && (
        <>
          <div className="px-5 py-3 border-b border-white/10">
            <Group justify="space-between" mb="xs">
              <Text size="sm" c="dimmed">
                {Math.round(progress)}%
              </Text>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={handleCancel}>
                ✕
              </ActionIcon>
            </Group>
            <Progress value={progress} animated size="sm" radius="sm" />
          </div>
          <ScrollAreaSegments
            segments={session.segments}
            speakers={speakers}
            selected={selected}
            onToggle={toggleSelect}
            onAssign={handleAssignSpeaker}
            onAddSpeaker={handleAddSpeaker}
            streaming
          />
        </>
      )}

      {/* Done state */}
      {session.status === 'done' && (
        <>
          {selected.size > 0 && (
            <BulkBar
              speakers={speakers}
              count={selected.size}
              onAssign={handleBulkAssign}
              onClear={() => setSelected(new Set())}
            />
          )}
          <ScrollAreaSegments
            segments={session.segments}
            speakers={speakers}
            selected={selected}
            onToggle={toggleSelect}
            onAssign={handleAssignSpeaker}
            onAddSpeaker={handleAddSpeaker}
          />
          <div className="border-t border-white/10 px-5 py-3">
            <Group justify="space-between">
              <ExportButton sessionId={sessionId} session={session} speakers={speakers} label="Export this file" />
            </Group>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SegmentsProps {
  segments: Segment[]
  speakers: Speaker[]
  selected: Set<string>
  onToggle: (id: string) => void
  onAssign: (segId: string, speakerId: string | null) => void
  onAddSpeaker: (name: string) => Promise<Speaker>
  streaming?: boolean
}

function ScrollAreaSegments({
  segments,
  speakers,
  selected,
  onToggle,
  onAssign,
  onAddSpeaker,
  streaming
}: SegmentsProps): React.JSX.Element {
  return (
    <ScrollArea className="flex-1">
      <Stack gap={0}>
        {segments.map((seg) => (
          <SegmentRow
            key={seg.id}
            segment={seg}
            speakers={speakers}
            isSelected={selected.has(seg.id)}
            onToggle={() => onToggle(seg.id)}
            onAssign={(spId) => onAssign(seg.id, spId)}
            onAddSpeaker={onAddSpeaker}
          />
        ))}
        {streaming && (
          <div className="px-5 py-2">
            <Text size="xs" c="dimmed">
              ▌ streaming…
            </Text>
          </div>
        )}
      </Stack>
    </ScrollArea>
  )
}

interface SegmentRowProps {
  segment: Segment
  speakers: Speaker[]
  isSelected: boolean
  onToggle: () => void
  onAssign: (speakerId: string | null) => void
  onAddSpeaker: (name: string) => Promise<Speaker>
}

function SegmentRow({
  segment,
  speakers,
  isSelected,
  onToggle,
  onAssign,
  onAddSpeaker
}: SegmentRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const speaker = speakers.find((s) => s.id === segment.speakerId)

  async function handleAddNew(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    const sp = await onAddSpeaker(name)
    onAssign(sp.id)
    setNewName('')
    setOpen(false)
  }

  return (
    <div
      className={`flex items-start gap-3 px-5 py-2 hover:bg-white/5 transition-colors ${isSelected ? 'bg-blue-900/20' : ''}`}
    >
      <Checkbox
        size="xs"
        checked={isSelected}
        onChange={onToggle}
        mt={3}
        className="opacity-30 hover:opacity-100 transition-opacity"
      />
      <Text size="xs" c="dimmed" className="w-14 shrink-0 mt-0.5 font-mono">
        {formatTime(segment.start)}
      </Text>

      <Popover opened={open} onClose={() => setOpen(false)} width={180} position="bottom-start">
        <Popover.Target>
          <Button
            size="xs"
            variant={speaker ? 'light' : 'subtle'}
            color={speaker ? 'blue' : 'gray'}
            className="shrink-0"
            onClick={() => setOpen((o) => !o)}
          >
            {speaker?.name ?? 'Speaker ?'}
          </Button>
        </Popover.Target>
        <Popover.Dropdown p={4}>
          <Stack gap={2}>
            {speakers.map((sp) => (
              <Button
                key={sp.id}
                size="xs"
                variant={sp.id === segment.speakerId ? 'filled' : 'subtle'}
                fullWidth
                justify="start"
                onClick={() => {
                  onAssign(sp.id)
                  setOpen(false)
                }}
              >
                {sp.name}
              </Button>
            ))}
            {speakers.length > 0 && <Divider opacity={0.3} my={2} />}
            <div className="px-1 py-1">
              <input
                className="w-full bg-transparent text-xs text-white border-b border-white/20 outline-none pb-1 placeholder-gray-500"
                placeholder="+ New speaker"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNew()
                  if (e.key === 'Escape') setOpen(false)
                }}
                autoFocus
              />
            </div>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Text size="sm" className="flex-1">
        {segment.text}
      </Text>
    </div>
  )
}

interface BulkBarProps {
  speakers: Speaker[]
  count: number
  onAssign: (speakerId: string | null) => void
  onClear: () => void
}

function BulkBar({ speakers, count, onAssign, onClear }: BulkBarProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-blue-900/30 border-b border-blue-500/30">
      <Text size="sm" c="blue.3">
        {count} selected
      </Text>
      <div className="flex-1" />
      {speakers.map((sp) => (
        <Button
          key={sp.id}
          size="xs"
          variant="light"
          color="blue"
          onClick={() => onAssign(sp.id)}
        >
          → {sp.name}
        </Button>
      ))}
      <Button size="xs" variant="subtle" onClick={onClear}>
        Clear
      </Button>
    </div>
  )
}

interface ExportButtonProps {
  sessionId: string
  session: Session
  speakers: Speaker[]
  label: string
}

function ExportButton({ session, speakers, label }: ExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  function buildMd(): string {
    const lines: string[] = []
    for (const seg of session.segments) {
      const sp = speakers.find((s) => s.id === seg.speakerId)
      const name = sp?.name ?? 'Unknown'
      lines.push(`**${name}** [${formatTime(seg.start)}]`)
      lines.push(seg.text.trim())
      lines.push('')
    }
    return lines.join('\n')
  }

  function buildTxt(): string {
    return session.segments
      .map((seg) => {
        const sp = speakers.find((s) => s.id === seg.speakerId)
        return `[${formatTime(seg.start)}] ${sp?.name ?? 'Unknown'}: ${seg.text.trim()}`
      })
      .join('\n')
  }

  async function handleExport(format: 'md' | 'txt'): Promise<void> {
    setOpen(false)
    const fileName = session.audioFile.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'transcript'
    const savePath = await window.api.invoke('dialog:save', `${fileName}.${format}`)
    if (!savePath) return
    const content = format === 'md' ? buildMd() : buildTxt()
    // Write via IPC is not wired yet — use Electron's fs from main
    // For now log; T-050/T-051 will wire this properly
    console.log('Export to:', savePath, content.length, 'chars')
  }

  return (
    <Popover opened={open} onClose={() => setOpen(false)} position="top-start">
      <Popover.Target>
        <Button size="sm" variant="light" onClick={() => setOpen((o) => !o)}>
          {label} ▾
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={4}>
        <Stack gap={2}>
          <Button size="xs" variant="subtle" fullWidth justify="start" onClick={() => handleExport('md')}>
            Markdown (.md)
          </Button>
          <Button size="xs" variant="subtle" fullWidth justify="start" onClick={() => handleExport('txt')}>
            Plain text (.txt)
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
