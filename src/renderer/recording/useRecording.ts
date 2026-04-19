import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrackKind, TrackStatus } from './recordingUtils'
import { createBars, getPreferredMimeType, limitLogs, nowLabel, readBands } from './recordingUtils'

export interface AudioInputOption {
  value: string
  label: string
}

interface TrackState {
  status: TrackStatus
  available: boolean
  level: number
  bars: number[]
  logs: string[]
}

interface RecordingState {
  sessionId: string | null
  isStarting: boolean
  isStopping: boolean
  elapsed: number
  audioInputs: AudioInputOption[]
  selectedInput: string
  microphone: TrackState
  system: TrackState
}

interface TrackRuntime {
  stream: MediaStream
  recorder: MediaRecorder
  audioContext: AudioContext
  analyser: AnalyserNode
}

interface RuntimeState {
  sessionId: string | null
  isMounted: boolean
  isStarting: boolean
  isStopping: boolean
  startedAt: number | null
  rafId: number | null
  microphone: TrackRuntime | null
  system: TrackRuntime | null
}

interface UseRecordingReturn extends RecordingState {
  start: () => Promise<void>
  stop: () => Promise<void>
  cancel: () => Promise<void>
  setSelectedInput: (value: string) => void
}

const createTrackState = (logs: string[]): TrackState => ({
  status: 'idle',
  available: false,
  level: 0,
  bars: createBars(),
  logs
})

const initialState: RecordingState = {
  sessionId: null,
  isStarting: false,
  isStopping: false,
  elapsed: 0,
  audioInputs: [],
  selectedInput: 'default',
  microphone: createTrackState(['Waiting for microphone input...']),
  system: createTrackState(['Waiting for system audio...'])
}

function createTrackLogMessage(message: string): string {
  return `[${nowLabel()}] ${message}`
}

function createMicConstraints(selectedInput: string): MediaStreamConstraints {
  if (selectedInput === 'default') {
    return { audio: true, video: false }
  }

  return {
    audio: {
      deviceId: { exact: selectedInput }
    },
    video: false
  }
}

function getTrackLabel(kind: TrackKind): string {
  return kind === 'microphone' ? 'Microphone' : 'System audio'
}

function stopRuntime(runtime: TrackRuntime | null): Promise<void> {
  if (!runtime) return Promise.resolve()

  const recorderStop =
    runtime.recorder.state === 'inactive'
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          runtime.recorder.addEventListener('stop', () => resolve(), { once: true })
          runtime.recorder.stop()
        })

  runtime.stream.getTracks().forEach((track) => track.stop())

  return recorderStop.finally(() => {
    void runtime.audioContext.close().catch(() => undefined)
  })
}

export function useRecording(): UseRecordingReturn {
  const [state, setState] = useState<RecordingState>(initialState)
  const runtimeRef = useRef<RuntimeState>({
    sessionId: null,
    isMounted: true,
    isStarting: false,
    isStopping: false,
    startedAt: null,
    rafId: null,
    microphone: null,
    system: null
  })
  const selectedInputRef = useRef(initialState.selectedInput)
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const stopPromiseRef = useRef<Promise<void> | null>(null)

  const updateTrack = useCallback(
    (kind: TrackKind, updater: (prev: TrackState) => TrackState): void => {
      setState((prev) => {
        if (kind === 'microphone') {
          return { ...prev, microphone: updater(prev.microphone) }
        }
        return { ...prev, system: updater(prev.system) }
      })
    },
    []
  )

  const setTrackStatus = useCallback(
    (kind: TrackKind, status: TrackStatus, available?: boolean) => {
      updateTrack(kind, (prev) => ({
        ...prev,
        status,
        available: available ?? prev.available
      }))
    },
    [updateTrack]
  )

  const appendTrackLog = useCallback(
    (kind: TrackKind, message: string) => {
      updateTrack(kind, (prev) => ({
        ...prev,
        logs: limitLogs([...prev.logs, createTrackLogMessage(message)])
      }))
    },
    [updateTrack]
  )

  const setTrackMetrics = useCallback(
    (kind: TrackKind, analyser: AnalyserNode | null) => {
      const { level, bars } = readBands(analyser)
      updateTrack(kind, (prev) => ({
        ...prev,
        level,
        bars
      }))
    },
    [updateTrack]
  )

  const sampleMeters = useCallback((): void => {
    if (!runtimeRef.current.isMounted) return

    setTrackMetrics('microphone', runtimeRef.current.microphone?.analyser ?? null)
    setTrackMetrics('system', runtimeRef.current.system?.analyser ?? null)

    runtimeRef.current.rafId = window.requestAnimationFrame(sampleMeters)
  }, [setTrackMetrics])

  const clearRuntime = useCallback(() => {
    const runtime = runtimeRef.current
    runtime.sessionId = null
    runtime.startedAt = null
    runtime.isStarting = false
    runtime.isStopping = false
    if (runtime.rafId !== null) {
      window.cancelAnimationFrame(runtime.rafId)
      runtime.rafId = null
    }
    runtime.microphone = null
    runtime.system = null
  }, [])

  const resetRuntime = useCallback(() => {
    clearRuntime()
    setState((prev) => ({
      ...prev,
      sessionId: null,
      isStarting: false,
      isStopping: false,
      elapsed: 0,
      microphone: createTrackState(['Waiting for microphone input...']),
      system: createTrackState(['Waiting for system audio...'])
    }))
  }, [clearRuntime])

  const cleanupRuntime = useCallback(async () => {
    if (runtimeRef.current.rafId !== null) {
      window.cancelAnimationFrame(runtimeRef.current.rafId)
      runtimeRef.current.rafId = null
    }

    await Promise.all([
      stopRuntime(runtimeRef.current.microphone),
      stopRuntime(runtimeRef.current.system)
    ])

    runtimeRef.current.microphone = null
    runtimeRef.current.system = null
  }, [])

  const enumerateAudioInputs = useCallback(async (): Promise<void> => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        value: device.deviceId || `device-${index}`,
        label: device.label || `Microphone ${index + 1}`
      }))

    const deduped = Array.from(new Map(inputs.map((item) => [item.value, item])).values())
    setState((prev) => {
      const selectedInput =
        deduped.length > 0 && deduped.some((input) => input.value === prev.selectedInput)
          ? prev.selectedInput
          : (deduped[0]?.value ?? 'default')

      return {
        ...prev,
        audioInputs: deduped,
        selectedInput
      }
    })
  }, [])

  const startTrack = useCallback(
    async (
      kind: TrackKind,
      stream: MediaStream,
      sink: 'mic' | 'speaker'
    ): Promise<TrackRuntime> => {
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error(`${getTrackLabel(kind)} track is unavailable`)
      }

      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const mimeType = getPreferredMimeType()
      const recorder =
        mimeType === '' ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0 || !runtimeRef.current.sessionId) return
        void event.data.arrayBuffer().then((buffer) => {
          void window.recordingApi.sendChunk(runtimeRef.current.sessionId!, sink, buffer)
        })
      }

      recorder.onerror = () => {
        const message = `${getTrackLabel(kind)} recorder failed`
        appendTrackLog(kind, message)
        setTrackStatus(kind, 'error', false)
      }

      recorder.start(1000)

      appendTrackLog(kind, `${getTrackLabel(kind)} track started`)
      setTrackStatus(kind, 'recording', true)

      return {
        stream,
        recorder,
        audioContext,
        analyser
      }
    },
    [appendTrackLog, setTrackStatus]
  )

  const start = useCallback(async (): Promise<void> => {
    if (startPromiseRef.current) return startPromiseRef.current
    if (runtimeRef.current.sessionId || runtimeRef.current.isStarting) return

    const promise = (async () => {
      try {
        runtimeRef.current.isStarting = true
        setState((prev) => ({ ...prev, isStarting: true }))

        const { sessionId } = await window.recordingApi.start()
        runtimeRef.current.sessionId = sessionId
        setState((prev) => ({ ...prev, sessionId }))

        try {
          setTrackStatus('microphone', 'starting', false)
          appendTrackLog('microphone', 'Requesting microphone access...')
          const micStream = await navigator.mediaDevices.getUserMedia(
            createMicConstraints(selectedInputRef.current)
          )
          runtimeRef.current.microphone = await startTrack('microphone', micStream, 'mic')
        } catch (error) {
          const err = error instanceof Error ? error : new Error('Failed to start microphone')
          setTrackStatus('microphone', 'error', false)
          appendTrackLog('microphone', `Error: ${err.message}`)
          await window.recordingApi.cancel(sessionId).catch(() => undefined)
          clearRuntime()
          setState((prev) => ({ ...prev, sessionId: null }))
          return
        }

        try {
          setTrackStatus('system', 'starting', false)
          appendTrackLog('system', 'Requesting system audio access...')
          const systemStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false
          })
          runtimeRef.current.system = await startTrack('system', systemStream, 'speaker')
        } catch (error) {
          const err = error instanceof Error ? error : new Error('System audio is not supported')
          setTrackStatus('system', 'error', false)
          appendTrackLog('system', `Error: ${err.message}`)
        }

        runtimeRef.current.startedAt = Date.now()
        runtimeRef.current.rafId = window.requestAnimationFrame(sampleMeters)
        runtimeRef.current.isStarting = false
        setState((prev) => ({ ...prev, isStarting: false }))
      } finally {
        runtimeRef.current.isStarting = false
        setState((prev) => ({ ...prev, isStarting: false }))
      }
    })().finally(() => {
      startPromiseRef.current = null
    })

    startPromiseRef.current = promise
    return promise
  }, [appendTrackLog, resetRuntime, sampleMeters, setTrackStatus, startTrack])

  const stop = useCallback(async (): Promise<void> => {
    if (stopPromiseRef.current) return stopPromiseRef.current
    if (!runtimeRef.current.sessionId) return

    const promise = (async () => {
      const sessionId = runtimeRef.current.sessionId
      const hasSystemAudio = runtimeRef.current.system !== null

      runtimeRef.current.isStopping = true
      setState((prev) => ({ ...prev, isStopping: true }))
      setTrackStatus('microphone', 'stopping')
      setTrackStatus('system', 'stopping')

      if (runtimeRef.current.rafId !== null) {
        window.cancelAnimationFrame(runtimeRef.current.rafId)
        runtimeRef.current.rafId = null
      }

      await cleanupRuntime()

      if (!sessionId) return

      await new Promise((resolve) => window.setTimeout(resolve, 250))
      await window.recordingApi.stop(sessionId, hasSystemAudio)
      resetRuntime()
      window.recordingApi.closeWindow()
    })().finally(() => {
      runtimeRef.current.isStopping = false
      setState((prev) => ({ ...prev, isStopping: false }))
      stopPromiseRef.current = null
    })

    stopPromiseRef.current = promise
    return promise
  }, [cleanupRuntime, resetRuntime, setTrackStatus, state.system.available, state.system.status])

  const cancel = useCallback(async (): Promise<void> => {
    if (stopPromiseRef.current) return stopPromiseRef.current
    if (!runtimeRef.current.sessionId) {
      window.recordingApi.closeWindow()
      return
    }

    const promise = (async () => {
      if (runtimeRef.current.rafId !== null) {
        window.cancelAnimationFrame(runtimeRef.current.rafId)
        runtimeRef.current.rafId = null
      }

      await cleanupRuntime()
      const sessionId = runtimeRef.current.sessionId
      if (sessionId) {
        await window.recordingApi.cancel(sessionId).catch(() => undefined)
      }
      resetRuntime()
      window.recordingApi.closeWindow()
    })().finally(() => {
      stopPromiseRef.current = null
    })

    stopPromiseRef.current = promise
    return promise
  }, [cleanupRuntime, resetRuntime])

  useEffect(() => {
    runtimeRef.current.isMounted = true
    void enumerateAudioInputs()

    const onDeviceChange = (): void => {
      void enumerateAudioInputs()
    }

    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)

    void start().catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to start capture'
      appendTrackLog('microphone', `Error: ${message}`)
      setTrackStatus('microphone', 'error', false)
      appendTrackLog('system', `Error: ${message}`)
      setTrackStatus('system', 'error', false)
    })

    return () => {
      runtimeRef.current.isMounted = false
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
      void cancel()
    }
  }, [appendTrackLog, cancel, enumerateAudioInputs, setTrackStatus, start])

  useEffect(() => {
    if (runtimeRef.current.startedAt === null) return

    const timer = window.setInterval(() => {
      if (runtimeRef.current.startedAt === null) return
      setState((prev) => {
        const nextElapsed = Math.floor((Date.now() - runtimeRef.current.startedAt!) / 1000)
        return prev.elapsed === nextElapsed ? prev : { ...prev, elapsed: nextElapsed }
      })
    }, 250)

    return () => window.clearInterval(timer)
  }, [state.sessionId, state.isStarting, state.isStopping])

  useEffect(() => {
    if (runtimeRef.current.startedAt === null) return
    const ticker = window.setInterval(() => {
      if (!runtimeRef.current.isMounted) return
      if (runtimeRef.current.microphone?.analyser) {
        const { level, bars } = readBands(runtimeRef.current.microphone.analyser)
        updateTrack('microphone', (prev) => ({ ...prev, level, bars }))
      }
      if (runtimeRef.current.system?.analyser) {
        const { level, bars } = readBands(runtimeRef.current.system.analyser)
        updateTrack('system', (prev) => ({ ...prev, level, bars }))
      }
    }, 80)

    return () => window.clearInterval(ticker)
  }, [updateTrack, state.sessionId])

  return {
    ...state,
    start,
    stop,
    cancel,
    setSelectedInput: (value: string) => {
      selectedInputRef.current = value
      setState((prev) => ({ ...prev, selectedInput: value }))
    }
  }
}
