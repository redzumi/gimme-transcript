import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ exists: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('fs', () => ({
  existsSync: mocks.exists,
  readFileSync: mocks.read,
  writeFileSync: mocks.write
}))
vi.mock('electron', () => ({ app: { getPath: () => '/data' } }))
vi.mock('./paths', () => ({ getSettingsPath: () => '/data/settings.json' }))
import { getSettings, updateSettings } from './settings'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.exists.mockReturnValue(true)
  mocks.read.mockReturnValue(JSON.stringify({ defaultEngine: 'openai', openaiApiKey: 'test' }))
})

it('defaults old settings to a direct provider connection', () => {
  expect(getSettings().providerProxyUrl).toBe('')
})

it('persists a normalized proxy while preserving other settings', () => {
  const updated = updateSettings({ providerProxyUrl: ' http://localhost:8080/ ' })
  expect(updated.providerProxyUrl).toBe('http://localhost:8080')
  expect(updated.openaiApiKey).toBe('test')
  expect(JSON.parse(mocks.write.mock.calls[0][1]).providerProxyUrl).toBe(updated.providerProxyUrl)
})

it('rejects an invalid proxy before changing the settings file', () => {
  expect(() => updateSettings({ providerProxyUrl: 'invalid' })).toThrow()
  expect(mocks.write).not.toHaveBeenCalled()
})
