import { useState, useEffect } from 'react'
import FirstLaunch from './screens/FirstLaunch'
import Home from './screens/Home'
import Session from './screens/Session'
import Settings from './screens/Settings'

type Screen =
  | { name: 'firstLaunch' }
  | { name: 'home' }
  | { name: 'session'; id: string }
  | { name: 'settings' }

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen | null>(null)

  useEffect(() => {
    // Determine starting screen: show firstLaunch if no model is downloaded
    window.api.invoke('models:list').then((models) => {
      const hasModel = models.some((m) => m.downloaded)
      setScreen(hasModel ? { name: 'home' } : { name: 'firstLaunch' })
    })
  }, [])

  if (!screen) return <div className="h-screen bg-[#0f1117]" />

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
    return (
      <Session
        sessionId={screen.id}
        onBack={() => setScreen({ name: 'home' })}
      />
    )
  }

  if (screen.name === 'settings') {
    return <Settings onBack={() => setScreen({ name: 'home' })} />
  }

  return <div />
}
