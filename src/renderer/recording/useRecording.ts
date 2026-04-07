import { useState, useEffect, useRef, useCallback } from 'react'

interface RecordingState {
  sessionId: string | null
  isRecording: boolean
  micLevel: number
  speakerLevel: number
  speakerAvailable: boolean
  elapsed: number
}

interface UseRecordingReturn extends RecordingState {
  stop: () => Promise<void>
}

export function useRecording(): UseRecordingReturn {
  const [state, setState] = useState<RecordingState>({
    sessionId: null,
    isRecording: false,
    micLevel: 0,
    speakerLevel: 0,
    speakerAvailable: false,
    elapsed: 0
  })

  const micRecorderRef = useRef<MediaRecorder | null>(null)
  const speakerRecorderRef = useRef<MediaRecorder | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const sessionIdRef = useRef<string | null>(null)
  const speakerAvailableRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function startRecording(): Promise<void> {
      const { sessionId } = await window.recordingApi.start()
      if (cancelled) {
        await window.recordingApi.cancel(sessionId)
        return
      }
      sessionIdRef.current = sessionId

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      // Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const micSrc = audioCtx.createMediaStreamSource(micStream)
      const micAnalyser = audioCtx.createAnalyser()
      micAnalyser.fftSize = 256
      micSrc.connect(micAnalyser)
      micAnalyserRef.current = micAnalyser

      const micRecorder = new MediaRecorder(micStream)
      micRecorderRef.current = micRecorder
      micRecorder.ondataavailable = async (e): Promise<void> => {
        if (e.data.size > 0 && sessionIdRef.current) {
          const buf = await e.data.arrayBuffer()
          await window.recordingApi.sendChunk(sessionIdRef.current, 'mic', buf)
        }
      }
      micRecorder.start(1000)

      // System audio
      try {
        const sources = await window.recordingApi.getDesktopSources()
        if (sources.length > 0) {
          const speakerStream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop' } },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sources[0].id,
                minWidth: 1,
                maxWidth: 1,
                minHeight: 1,
                maxHeight: 1
              }
            }
          } as MediaStreamConstraints)

          speakerStream.getVideoTracks().forEach((t) => t.stop())
          const audioOnly = new MediaStream(speakerStream.getAudioTracks())

          const speakerSrc = audioCtx.createMediaStreamSource(audioOnly)
          const speakerAnalyser = audioCtx.createAnalyser()
          speakerAnalyser.fftSize = 256
          speakerSrc.connect(speakerAnalyser)
          speakerAnalyserRef.current = speakerAnalyser

          const speakerRecorder = new MediaRecorder(audioOnly)
          speakerRecorderRef.current = speakerRecorder
          speakerRecorder.ondataavailable = async (e): Promise<void> => {
            if (e.data.size > 0 && sessionIdRef.current) {
              const buf = await e.data.arrayBuffer()
              await window.recordingApi.sendChunk(sessionIdRef.current, 'speaker', buf)
            }
          }
          speakerRecorder.start(1000)
          speakerAvailableRef.current = true
        }
      } catch {
        speakerAvailableRef.current = false
      }

      startTimeRef.current = Date.now()

      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          sessionId,
          isRecording: true,
          speakerAvailable: speakerAvailableRef.current
        }))
      }

      const dataArr = new Uint8Array(128)

      function animate(): void {
        rafRef.current = requestAnimationFrame(animate)

        setState((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000)
        }))

        if (micAnalyserRef.current) {
          micAnalyserRef.current.getByteFrequencyData(dataArr)
          const avg = dataArr.reduce((s, v) => s + v, 0) / dataArr.length / 255
          setState((prev) => ({ ...prev, micLevel: avg }))
        }

        if (speakerAnalyserRef.current) {
          speakerAnalyserRef.current.getByteFrequencyData(dataArr)
          const avg = dataArr.reduce((s, v) => s + v, 0) / dataArr.length / 255
          setState((prev) => ({ ...prev, speakerLevel: avg }))
        }
      }
      animate()
    }

    startRecording().catch(console.error)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      micRecorderRef.current?.stop()
      speakerRecorderRef.current?.stop()
      audioCtxRef.current?.close()
    }
  }, [])

  const stop = useCallback(async (): Promise<void> => {
    if (!sessionIdRef.current) return

    cancelAnimationFrame(rafRef.current)

    await Promise.all([
      micRecorderRef.current
        ? new Promise<void>((res) => {
            micRecorderRef.current!.addEventListener('stop', () => res(), { once: true })
            micRecorderRef.current!.stop()
          })
        : Promise.resolve(),
      speakerRecorderRef.current
        ? new Promise<void>((res) => {
            speakerRecorderRef.current!.addEventListener('stop', () => res(), { once: true })
            speakerRecorderRef.current!.stop()
          })
        : Promise.resolve()
    ])

    // Allow final IPC writes to complete
    await new Promise((r) => setTimeout(r, 300))

    await window.recordingApi.stop(sessionIdRef.current, speakerAvailableRef.current)
    audioCtxRef.current?.close()
    window.recordingApi.closeWindow()
  }, [])

  return { ...state, stop }
}
