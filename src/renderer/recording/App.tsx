import React, { useState, useEffect } from 'react'
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
    const [perms, plat] = await Promise.all([
      window.recordingApi.checkPermissions(),
      window.recordingApi.getPlatform()
    ])
    setPlatform(plat)
    setPermissions(perms)
    const needsPrompt = !perms.mic || (plat === 'darwin' && !perms.screenRecording)
    if (needsPrompt) {
      setAppState('permissions')
    } else {
      setAppState('recording')
    }
  }

  useEffect(() => {
    checkPermissions().catch(console.error)
  }, [])

  if (appState === 'checking') {
    return (
      <div className="w-[360px] h-[80px] flex items-center justify-center rounded-2xl bg-white/88 backdrop-blur-[18px]">
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
