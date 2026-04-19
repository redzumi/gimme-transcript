import { useEffect, useState } from 'react'
import { PermissionsGate } from './PermissionsGate'
import { RecordingPanel } from './RecordingPanel'
import type { RecordingPermissions } from '../src/types/ipc'

type AppState = 'checking' | 'permissions' | 'recording'

export default function App(): React.JSX.Element {
  const [appState, setAppState] = useState<AppState>('checking')
  const [permissions, setPermissions] = useState<RecordingPermissions>({
    mic: false,
    screenRecording: false
  })
  const [platform, setPlatform] = useState('')

  async function checkPermissions(): Promise<void> {
    const [perms, currentPlatform] = await Promise.all([
      window.recordingApi.checkPermissions(),
      window.recordingApi.getPlatform()
    ])

    setPermissions(perms)
    setPlatform(currentPlatform)

    const requiresScreenRecording = currentPlatform === 'darwin'
    const hasRequiredPermissions = perms.mic && (!requiresScreenRecording || perms.screenRecording)

    setAppState(hasRequiredPermissions ? 'recording' : 'permissions')
  }

  useEffect(() => {
    void checkPermissions().catch(console.error)
  }, [])

  if (appState === 'checking') {
    return (
      <div className="flex h-[180px] w-[640px] items-center justify-center rounded-[30px] border border-[rgba(255,255,255,0.6)] bg-[linear-gradient(180deg,rgba(255,248,244,0.96),rgba(255,255,255,0.88))] shadow-[0_28px_80px_rgba(77,42,66,0.18)] backdrop-blur-[24px]">
        <span className="text-xs text-[#8f7982]">Checking permissions…</span>
      </div>
    )
  }

  if (appState === 'permissions') {
    return (
      <PermissionsGate permissions={permissions} platform={platform} onRecheck={checkPermissions} />
    )
  }

  return <RecordingPanel />
}
