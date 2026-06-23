import { useState, useEffect } from 'react'
import type { RecordingPermission, RecordingPermissions } from './types/ipc'
import { Logo } from './components/Logo'
import Permissions from './screens/Permissions'
import FirstLaunch from './screens/FirstLaunch'
import Home from './screens/Home'
import Session from './screens/Session'
import Settings from './screens/Settings'

type Screen =
  | { name: 'permissions' }
  | { name: 'firstLaunch' }
  | { name: 'home' }
  | { name: 'session'; id: string }
  | { name: 'settings' }

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen | null>(null)
  const [permissions, setPermissions] = useState<RecordingPermissions>({
    mic: false,
    screenRecording: false
  })
  const [platform, setPlatform] = useState('')
  const [checkingPermissions, setCheckingPermissions] = useState(false)

  async function checkStartupState(): Promise<void> {
    setCheckingPermissions(true)
    try {
      const [perms, currentPlatform, engines] = await Promise.all([
        window.api.invoke('recording:check-permissions'),
        window.api.invoke('recording:get-platform'),
        window.api.invoke('engines:list')
      ])

      setPermissions(perms)
      setPlatform(currentPlatform)

      const requiresScreenRecording = currentPlatform === 'darwin'
      const hasAllPermissions = perms.mic && (!requiresScreenRecording || perms.screenRecording)

      if (!hasAllPermissions) {
        setScreen({ name: 'permissions' })
        return
      }

      // Ready if any engine can transcribe now (model downloaded or API key set).
      const hasReadyEngine = engines.some((e) => e.status === 'available')
      setScreen(hasReadyEngine ? { name: 'home' } : { name: 'firstLaunch' })
    } finally {
      setCheckingPermissions(false)
    }
  }

  async function openPermissionSettings(permission: RecordingPermission): Promise<void> {
    await window.api.invoke('recording:open-settings', permission)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void checkStartupState()
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [])

  if (!screen)
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-6"
        style={{ background: 'var(--app-shell)' }}
      >
        <div className="animate-[fadeIn_0.4s_ease-out]">
          <Logo size={48} />
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#ffb090]"
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
      `}</style>
      </div>
    )

  if (screen.name === 'permissions') {
    return (
      <Permissions
        permissions={permissions}
        platform={platform}
        checking={checkingPermissions}
        onOpenSettings={openPermissionSettings}
        onContinue={checkStartupState}
      />
    )
  }

  if (screen.name === 'firstLaunch') {
    return <FirstLaunch onDone={() => setScreen({ name: 'home' })} />
  }

  if (screen.name === 'home') {
    return (
      <Home
        onOpenSession={(id) => setScreen({ name: 'session', id })}
        onOpenSettings={() => setScreen({ name: 'settings' })}
      />
    )
  }

  if (screen.name === 'session') {
    return <Session sessionId={screen.id} onBack={() => setScreen({ name: 'home' })} />
  }

  if (screen.name === 'settings') {
    return <Settings onBack={() => setScreen({ name: 'home' })} />
  }

  return <div />
}
