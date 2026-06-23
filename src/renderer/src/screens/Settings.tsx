import { useState, useEffect, useCallback } from 'react'
import {
  Text,
  Button,
  Stack,
  Select,
  Group,
  TextInput,
  PasswordInput,
  Progress,
  Badge
} from '@mantine/core'
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

const STATUS_BADGE: Record<EngineInfo['status'], { label: string; color: string }> = {
  available: { label: 'ready', color: 'teal' },
  'needs-download': { label: 'needs model', color: 'orange' },
  'needs-key': { label: 'needs key', color: 'orange' },
  unavailable: { label: 'unavailable', color: 'gray' }
}

const dlKey = (engineId: string, modelId: string): string => `${engineId}:${modelId}`

export default function SettingsScreen({ onBack }: Props): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [engines, setEngines] = useState<EngineInfo[]>([])
  const [modelsByEngine, setModelsByEngine] = useState<Record<string, EngineModelInfo[]>>({})
  const [downloading, setDownloading] = useState<Map<string, DownloadState>>(new Map())
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [keyStatus, setKeyStatus] = useState<Record<string, { msg: string; ok: boolean }>>({})

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

  if (!settings) return <div className="h-screen bg-[var(--app-shell)]" />

  return (
    <div className="flex h-screen flex-col bg-[var(--app-shell)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#ead7cf] bg-white/70 px-4 backdrop-blur-sm">
        <button
          className="rounded px-1.5 py-1 text-xs text-[#8f7982] transition-colors hover:bg-[#fff2eb] hover:text-[#24191f]"
          onClick={onBack}
        >
          ← Back
        </button>
        <div className="h-3.5 w-px bg-[#ead7cf]" />
        <span className="text-sm font-semibold text-[#24191f]">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Stack gap="xl" maw={560}>
          {/* General */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#8f7982]">
              General
            </p>
            <Stack gap="md">
              <Select
                label="Default language"
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
              <Group align="flex-end" gap="sm">
                <TextInput
                  label="Storage path"
                  value={settings.storagePath}
                  readOnly
                  flex={1}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
                <Button size="sm" variant="default">
                  Change
                </Button>
              </Group>
            </Stack>
          </div>

          {/* Engines */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#8f7982]">
              Engines
            </p>
            <Stack gap="md">
              {engines.map((engine) => {
                const isCloud = engine.features.requiresNetwork
                const models = modelsByEngine[engine.id] ?? []
                const badge = STATUS_BADGE[engine.status]
                const isDefault = settings.defaultEngine === engine.id
                return (
                  <div
                    key={engine.id}
                    className="overflow-hidden rounded-2xl border border-[#ead7cf] bg-white/78 backdrop-blur-sm"
                  >
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#24191f]">
                            {engine.name}
                          </span>
                          <Badge size="xs" color={badge.color} variant="light">
                            {badge.label}
                          </Badge>
                          {isDefault && (
                            <Badge size="xs" color="grape" variant="light">
                              default
                            </Badge>
                          )}
                        </div>
                        <p className="m-0 mt-0.5 text-xs text-[#8f7982]">{engine.description}</p>
                        {engine.platformNote && (
                          <p className="m-0 mt-0.5 text-[10px] text-[#b19ca5]">
                            {engine.platformNote}
                          </p>
                        )}
                      </div>
                      {!isDefault && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="sunset"
                          onClick={() => updateSettings({ defaultEngine: engine.id })}
                        >
                          Set default
                        </Button>
                      )}
                    </div>

                    {/* API key (cloud engines) */}
                    {engine.features.requiresApiKey && (
                      <div className="border-t border-[#f3e5dd] px-4 py-3">
                        <Group align="flex-end" gap="sm">
                          <PasswordInput
                            label="API key"
                            flex={1}
                            placeholder="sk-…"
                            value={keyDrafts[engine.id] ?? ''}
                            onChange={(e) => {
                              const value = e.currentTarget.value
                              setKeyDrafts((p) => ({ ...p, [engine.id]: value }))
                            }}
                          />
                          <Button
                            size="sm"
                            variant="light"
                            color="sunset"
                            onClick={() => handleValidateKey(engine.id)}
                          >
                            Save &amp; verify
                          </Button>
                        </Group>
                        {keyStatus[engine.id] && (
                          <p
                            className={`m-0 mt-1 text-xs ${
                              keyStatus[engine.id].ok ? 'text-emerald-600' : 'text-red-500'
                            }`}
                          >
                            {keyStatus[engine.id].msg}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Models */}
                    {models.length > 0 && (
                      <div className="border-t border-[#f3e5dd]">
                        {models.map((m, idx) => {
                          const dl = downloading.get(dlKey(engine.id, m.id))
                          const isLast = idx === models.length - 1
                          return (
                            <div
                              key={m.id}
                              className={`px-4 py-2.5 ${!isLast ? 'border-b border-[#f3e5dd]' : ''}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#24191f]">
                                      {m.name}
                                    </span>
                                    {m.sizeBytes > 0 && (
                                      <span className="text-xs text-[#8f7982]">
                                        {formatBytes(m.sizeBytes)}
                                      </span>
                                    )}
                                    {m.pricePerMinute ? (
                                      <span className="text-xs text-[#8f7982]">
                                        ${m.pricePerMinute.toFixed(3)}/min
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isCloud ? null : dl ? (
                                    <>
                                      <Text size="xs" c="dimmed">
                                        {formatSpeed(dl.bytesPerSec)}
                                      </Text>
                                      <Button
                                        size="xs"
                                        variant="subtle"
                                        color="red"
                                        onClick={() => handleCancel(engine.id, m.id)}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  ) : m.downloaded ? (
                                    <Button
                                      size="xs"
                                      variant="subtle"
                                      color="red"
                                      onClick={() => handleDelete(engine.id, m.id)}
                                    >
                                      Delete
                                    </Button>
                                  ) : (
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="sunset"
                                      onClick={() => handleDownload(engine.id, m.id)}
                                    >
                                      Download
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {dl && (
                                <div className="mt-2">
                                  <Progress
                                    value={dl.percent}
                                    size="xs"
                                    color="sunset"
                                    animated={dl.percent < 100}
                                    radius="xl"
                                  />
                                  <p className="m-0 mt-1 text-[10px] text-[#8f7982]">
                                    {dl.percent}% downloaded
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </Stack>
          </div>
        </Stack>
      </div>
    </div>
  )
}
