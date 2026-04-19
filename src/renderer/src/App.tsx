import { useState, useEffect } from 'react'
import type { RecordingPermission, RecordingPermissions } from './types/ipc'
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
      const [perms, currentPlatform, models] = await Promise.all([
        window.api.invoke('recording:check-permissions'),
        window.api.invoke('recording:get-platform'),
        window.api.invoke('models:list')
      ])

      setPermissions(perms)
      setPlatform(currentPlatform)

      const requiresScreenRecording = currentPlatform === 'darwin'
      const hasAllPermissions = perms.mic && (!requiresScreenRecording || perms.screenRecording)

      if (!hasAllPermissions) {
        setScreen({ name: 'permissions' })
        return
      }

      const hasModel = models.some((m) => m.downloaded)
      setScreen(hasModel ? { name: 'home' } : { name: 'firstLaunch' })
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
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  if (!screen) return <div style={{ height: '100vh', background: 'var(--app-shell)' }} />

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
