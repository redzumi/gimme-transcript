import { useState, useEffect, useCallback } from 'react'
import { Button, Select, Group, PasswordInput, Progress } from '@mantine/core'
import type { Settings, EngineInfo, EngineModelInfo } from '../types/ipc'

interface Props {
  onBack: () => void
}

interface DownloadState {
  percent: number
  bytesPerSec: number
}

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps} B/s`
}

const STATUS_DOT: Record<EngineInfo['status'], string> = {
  available: '#34c474',
  'needs-download': '#ff8c3d',
  'needs-key': '#ff8c3d',
  unavailable: '#c0a8b5'
}

const STATUS_LABEL: Record<EngineInfo['status'], string> = {
  available: 'Ready',
  'needs-download': 'Needs model',
  'needs-key': 'Needs API key',
  unavailable: 'Unavailable'
}

const dlKey = (engineId: string, modelId: string): string => `${engineId}:${modelId}`

export default function SettingsScreen({ onBack }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [engines, setEngines] = useState<EngineInfo[]>([])
  const [modelsByEngine, setModelsByEngine] = useState<Record<string, EngineModelInfo[]>>({})
  const [downloading, setDownloading] = useState<Map<string, DownloadState>>(new Map())
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [keyStatus, setKeyStatus] = useState<Record<string, { msg: string; ok: boolean }>>({})
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [s, engineList] = await Promise.all([
      window.api.invoke('settings:get'),
      window.api.invoke('engines:list')
    ])
    setSettings(s)
    setEngines(engineList)
    const entries = await Promise.all(
      engineList.map(async (e) => [e.id, await window.api.invoke('engines:models', e.id)] as const)
    )
    setModelsByEngine(Object.fromEntries(entries))
    setKeyDrafts((prev) => ({ openai: s.openaiApiKey ?? prev.openai ?? '' }))
    setSelectedEngineId((prev) => prev ?? engineList[0]?.id ?? null)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(reload)

    const offProgress = window.api.on(
      'engines:download-progress',
      ({ engineId, modelId, percent, bytesPerSec }) => {
        setDownloading((prev) =>
          new Map(prev).set(dlKey(engineId, modelId), { percent, bytesPerSec })
        )
      }
    )
    const offDone = window.api.on('engines:download-done', ({ engineId, modelId }) => {
      setDownloading((prev) => {
        const next = new Map(prev)
        next.delete(dlKey(engineId, modelId))
        return next
      })
      void Promise.resolve().then(reload)
    })
    const offError = window.api.on('engines:download-error', ({ engineId, modelId }) => {
      setDownloading((prev) => {
        const next = new Map(prev)
        next.delete(dlKey(engineId, modelId))
        return next
      })
    })

    return () => {
      offProgress()
      offDone()
      offError()
    }
  }, [reload])

  async function updateSettings(data: Partial<Settings>): Promise<void> {
    const updated = await window.api.invoke('settings:update', data)
    setSettings(updated)
  }

  async function handleDownload(engineId: string, modelId: string): Promise<void> {
    setDownloading((prev) =>
      new Map(prev).set(dlKey(engineId, modelId), { percent: 0, bytesPerSec: 0 })
    )
    await window.api.invoke('engines:download-model', engineId, modelId)
  }

  async function handleCancel(engineId: string, modelId: string): Promise<void> {
    await window.api.invoke('engines:cancel-download', engineId, modelId)
    setDownloading((prev) => {
      const next = new Map(prev)
      next.delete(dlKey(engineId, modelId))
      return next
    })
  }

  async function handleDelete(engineId: string, modelId: string): Promise<void> {
    await window.api.invoke('engines:delete-model', engineId, modelId)
    await reload()
  }

  async function handleValidateKey(engineId: string): Promise<void> {
    setKeyStatus((p) => ({ ...p, [engineId]: { msg: 'Validating…', ok: true } }))
    const key = keyDrafts[engineId] ?? ''
    if (engineId === 'openai') await updateSettings({ openaiApiKey: key })
    const res = await window.api.invoke('engines:validate-key', engineId, key)
    setKeyStatus((p) => ({
      ...p,
      [engineId]: { msg: res.ok ? 'Valid ✓' : (res.message ?? 'Invalid'), ok: res.ok }
    }))
    await reload()
  }

  if (!settings) return <div className="h-screen" style={{ background: 'var(--app-shell)' }} />

  const selectedEngine = engines.find((e) => e.id === selectedEngineId) ?? null
  const selectedModels = selectedEngineId ? (modelsByEngine[selectedEngineId] ?? []) : []
  const isCloud = !!selectedEngine?.features.requiresNetwork
  const isDefault = settings.defaultEngine === selectedEngineId

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--app-shell)' }}>
      {/* Titlebar */}
      <div
        className="app-titlebar flex h-[44px] shrink-0 items-center gap-2 border-b border-[#e8d4ca]/60 bg-white/80 px-3 backdrop-blur-xl"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#9e8899] transition-colors hover:bg-[#fff0ea] hover:text-[#3d2635]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={onBack}
        >
          <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
            <path
              d="M4 1L1 4.5L4 8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <div className="h-3.5 w-px bg-[#e8d4ca]" />
        <span
          className="text-[13px] font-semibold text-[#1c1117]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          Settings
        </span>
      </div>

      {/* Two-column body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex w-52 shrink-0 flex-col border-r border-[#e8d4ca]/50 bg-white/40 backdrop-blur-sm overflow-y-auto">
          {/* Engines section */}
          <div className="px-3 pt-4 pb-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a08a96]">
              Engines
            </p>
          </div>
          <div className="px-3 pb-3">
            {engines.map((engine) => {
              const isSelected = selectedEngineId === engine.id
              const isDefaultEngine = settings.defaultEngine === engine.id
              return (
                <button
                  key={engine.id}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${
                    isSelected
                      ? 'bg-white/90 shadow-[0_1px_8px_rgba(60,20,40,0.08)]'
                      : 'hover:bg-white/50'
                  }`}
                  onClick={() => setSelectedEngineId(engine.id)}
                >
                  <div
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_DOT[engine.status] }}
                  />
                  <span
                    className={`flex-1 truncate text-[13px] ${
                      isSelected ? 'font-semibold text-[#1c1117]' : 'font-medium text-[#4a3540]'
                    }`}
                  >
                    {engine.name}
                  </span>
                  {isDefaultEngine && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#ff5a3c]">
                      default
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="mx-3 border-t border-[#f0e0d8]/70" />

          {/* General section */}
          <div className="px-3 pt-3 pb-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a08a96]">
              General
            </p>
          </div>
          <div className="px-5 pb-4 flex flex-col gap-4">
            <Select
              label="Default language"
              size="xs"
              value={settings.defaultLanguage}
              onChange={(v) => v && updateSettings({ defaultLanguage: v })}
              data={[
                { value: 'auto', label: 'auto-detect' },
                { value: 'ru', label: 'Russian' },
                { value: 'en', label: 'English' },
                { value: 'de', label: 'German' },
                { value: 'fr', label: 'French' },
                { value: 'es', label: 'Spanish' }
              ]}
            />
            <div>
              <p className="mb-1 text-[11px] font-medium text-[#6b5460]">Storage path</p>
              <p className="truncate rounded-lg border border-[#edd8ce]/60 bg-[#fff8f3]/60 px-2 py-1.5 text-[10px] font-mono text-[#7a6671]">
                {settings.storagePath.replace(/^.*\/([^/]+\/[^/]+)$/, '…/$1')}
              </p>
            </div>
          </div>
        </div>

        {/* Right detail panel */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {selectedEngine ? (
            <div className="p-8">
              {/* Engine header */}
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <h2 className="text-[20px] font-bold text-[#1c1117]">{selectedEngine.name}</h2>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor:
                          selectedEngine.status === 'available'
                            ? 'rgba(52,196,116,0.12)'
                            : 'rgba(255,140,61,0.12)',
                        color: selectedEngine.status === 'available' ? '#1a9e56' : '#c45a00'
                      }}
                    >
                      {STATUS_LABEL[selectedEngine.status]}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#7a6671]">{selectedEngine.description}</p>
                  {selectedEngine.platformNote && (
                    <p className="mt-0.5 text-[11px] text-[#a08a96]">
                      {selectedEngine.platformNote}
                    </p>
                  )}
                </div>
                {!isDefault && (
                  <button
                    className="shrink-0 rounded-xl border border-[#e8d4ca] bg-white/70 px-3 py-1.5 text-[12px] font-medium text-[#4a3540] transition-colors hover:border-[#ff5a3c] hover:text-[#ff5a3c]"
                    onClick={() => updateSettings({ defaultEngine: selectedEngine.id })}
                  >
                    Set as default
                  </button>
                )}
              </div>

              {/* API key section */}
              {selectedEngine.features.requiresApiKey && (
                <div className="mb-6">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a08a96]">
                    API Key
                  </p>
                  <div className="rounded-2xl border border-[#e8d4ca]/60 bg-white/70 p-4 backdrop-blur-sm">
                    <Group align="flex-end" gap="sm">
                      <PasswordInput
                        label="API key"
                        flex={1}
                        placeholder="sk-…"
                        value={keyDrafts[selectedEngine.id] ?? ''}
                        onChange={(e) => {
                          const value = e.currentTarget.value
                          setKeyDrafts((p) => ({ ...p, [selectedEngine.id]: value }))
                        }}
                      />
                      <Button
                        size="sm"
                        variant="light"
                        color="sunset"
                        onClick={() => handleValidateKey(selectedEngine.id)}
                      >
                        Save &amp; verify
                      </Button>
                    </Group>
                    {keyStatus[selectedEngine.id] && (
                      <p
                        className={`mt-2 text-[12px] ${
                          keyStatus[selectedEngine.id].ok ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {keyStatus[selectedEngine.id].msg}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Models section */}
              {selectedModels.length > 0 && (
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a08a96]">
                    Models
                  </p>
                  <div className="flex flex-col gap-2">
                    {selectedModels.map((m) => {
                      const dl = downloading.get(dlKey(selectedEngine.id, m.id))
                      return (
                        <div
                          key={m.id}
                          className="rounded-2xl border border-[#e8d4ca]/60 bg-white/70 p-4 backdrop-blur-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  m.downloaded ? 'bg-emerald-400' : 'bg-[#e0cdd6]'
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-semibold text-[#1c1117]">
                                  {m.name}
                                </p>
                                <p className="text-[11px] text-[#a08a96]">
                                  {[
                                    m.sizeBytes > 0 ? formatBytes(m.sizeBytes) : null,
                                    m.pricePerMinute ? `$${m.pricePerMinute.toFixed(3)}/min` : null,
                                    m.downloaded && !isCloud ? 'Downloaded' : null
                                  ]
                                    .filter(Boolean)
                                    .join('  ')}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {isCloud ? null : dl ? (
                                <>
                                  <span className="text-[11px] text-[#a08a96]">
                                    {formatSpeed(dl.bytesPerSec)}
                                  </span>
                                  <button
                                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-red-500 transition-colors hover:bg-red-50"
                                    onClick={() => handleCancel(selectedEngine.id, m.id)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : m.downloaded ? (
                                <button
                                  className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[#c0a8b5] transition-colors hover:bg-red-50 hover:text-red-500"
                                  onClick={() => handleDelete(selectedEngine.id, m.id)}
                                >
                                  Delete
                                </button>
                              ) : (
                                <button
                                  className="rounded-lg bg-[#ff5a3c] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#ff3d1a]"
                                  onClick={() => handleDownload(selectedEngine.id, m.id)}
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          </div>
                          {dl && (
                            <div className="mt-3">
                              <Progress
                                value={dl.percent}
                                size="xs"
                                color="sunset"
                                animated={dl.percent < 100}
                                radius="xl"
                              />
                              <p className="mt-1 text-[10px] text-[#a08a96]">
                                {dl.percent}% — {formatSpeed(dl.bytesPerSec)}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cloud engine — no models to download */}
              {isCloud && selectedModels.length === 0 && (
                <div className="rounded-2xl border border-[#e8d4ca]/60 bg-white/50 px-5 py-8 text-center">
                  <p className="text-[13px] text-[#a08a96]">
                    Cloud engine — no local models needed.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-[#a08a96]">Select an engine</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
