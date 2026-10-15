import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prepareAudio: vi.fn(),
  spawn: vi.fn(),
  write: vi.fn(),
  writeAsync: vi.fn(),
  save: vi.fn(),
  send: vi.fn(),
  model: vi.fn(),
  remove: vi.fn(),
  session: {
    id: 's',
    engine: 'whisper',
    model: 'base',
    language: 'auto',
    status: 'idle',
    segments: [],
    audioSources: [
      { path: '/first.wav', speakerId: 'speaker-1' },
      { path: '/second.wav', speakerId: 'speaker-2' }
    ]
  }
}))
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }]
  }
}))
vi.mock('fs', () => ({ existsSync: () => true, rmSync: mocks.remove, writeFileSync: mocks.write }))
vi.mock('fs/promises', () => ({ writeFile: mocks.writeAsync }))
vi.mock('./binary', () => ({ getWhisperBinaryPath: () => '/whisper' }))
vi.mock('./convert', () => ({ prepareAudio: mocks.prepareAudio }))
vi.mock('../ipc/models', () => ({ resolveDownloadedModel: mocks.model, modelPath: () => '/model' }))
vi.mock('../storage', () => ({
  getSession: () => structuredClone(mocks.session),
  updateSession: mocks.save
}))
vi.mock('../storage/paths', () => ({ getSessionPath: () => '/s.json' }))
vi.mock('../transcription/process', () => ({ spawnCancellable: mocks.spawn }))

import { transcribeSession, transcribeAllSources, cancelTranscription } from './runner'

function child(): EventEmitter & { stdout: PassThrough; stderr: PassThrough } {
  return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.model.mockReturnValue('base')
  mocks.writeAsync.mockResolvedValue(undefined)
  mocks.prepareAudio.mockResolvedValue({ audioPath: '/temp.wav', tempFile: true })
})

function saved(): { status: string; segments: { speakerId: string }[] } {
  return JSON.parse(mocks.write.mock.lastCall?.[1] as string)
}

describe('Whisper cancellation', () => {
  it('cancels audio preparation before launching Whisper', async () => {
    mocks.prepareAudio.mockImplementation(
      (_path: string, signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    )
    const running = transcribeSession('s')
    cancelTranscription('s')
    await running
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(saved().status).toBe('idle')
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:error', expect.anything())
  })

  it('cancels the first of multiple sources without launching the next', async () => {
    const proc = child()
    mocks.spawn.mockReturnValue(proc)
    const running = transcribeAllSources('s')
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1))
    const signal = mocks.spawn.mock.calls[0][2] as AbortSignal
    cancelTranscription('s')
    expect(signal.aborted).toBe(true)
    proc.emit('close', null)
    await running
    expect(mocks.prepareAudio).toHaveBeenCalledTimes(1)
    expect(mocks.remove).toHaveBeenCalledWith('/temp.wav', { force: true })
    expect(saved().status).toBe('idle')
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:done', expect.anything())
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:error', expect.anything())
  })

  it('streams segments and completes normally', async () => {
    const proc = child()
    mocks.spawn.mockReturnValue(proc)
    const running = transcribeSession('s')
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1))
    proc.stdout.write('[00:00:00.000 --> 00:00:01.000] hello\n')
    proc.emit('close', 0)
    await running
    expect(saved().status).toBe('done')
    expect(saved().segments).toHaveLength(1)
    expect(mocks.send).toHaveBeenCalledWith(
      'whisper:segment',
      expect.objectContaining({ sessionId: 's' })
    )
    expect(mocks.send).toHaveBeenCalledWith('whisper:done', { sessionId: 's' })
  })

  it('finishes pending saves before persisting cancellation and retains partial segments', async () => {
    let finishSave!: () => void
    mocks.writeAsync.mockImplementation(
      () => new Promise<void>((resolve) => (finishSave = resolve))
    )
    const proc = child()
    mocks.spawn.mockReturnValue(proc)
    const running = transcribeSession('s')
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1))
    proc.stdout.write('[00:00:00.000 --> 00:00:01.000] hello\n'.repeat(10))
    proc.emit('close', 0)
    await vi.waitFor(() => expect(mocks.writeAsync).toHaveBeenCalledOnce())
    cancelTranscription('s')
    expect(mocks.write).not.toHaveBeenCalled()
    finishSave()
    await running
    expect(saved().status).toBe('idle')
    expect(saved().segments).toHaveLength(10)
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:done', expect.anything())
  })

  it('processes all sources and preserves their speaker assignments', async () => {
    const first = child()
    const second = child()
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const running = transcribeAllSources('s')
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1))
    first.stdout.write('[00:00:01.000 --> 00:00:02.000] first\n')
    first.emit('close', 0)
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(2))
    second.stdout.write('[00:00:00.000 --> 00:00:01.000] second\n')
    second.emit('close', 0)
    await running
    expect(saved().status).toBe('done')
    expect(saved().segments.map((s) => s.speakerId)).toEqual(['speaker-2', 'speaker-1'])
  })

  it('resets status after failure and releases the job for retry', async () => {
    mocks.model.mockReturnValue(null)
    await expect(transcribeSession('s')).rejects.toThrow('not downloaded')
    expect(saved().status).toBe('idle')
    await expect(transcribeSession('s')).rejects.toThrow('not downloaded')
  })
})
