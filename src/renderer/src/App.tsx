import { useState } from 'react'
import { Button, Group, Stack, Text, TextInput, Title, Switch, Paper } from '@mantine/core'
import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App(): React.JSX.Element {
  const [note, setNote] = useState('')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [autoSave, setAutoSave] = useState(false)

  const handleSave = (): void => {
    setSavedNote(note.trim() || null)
  }

  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 bg-slate-950">
      <Paper shadow="lg" radius="md" p="lg" className="w-full max-w-xl bg-slate-900/80 backdrop-blur">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="sm" align="center">
              <img alt="logo" className="h-10 w-10" src={electronLogo} />
              <div>
                <Title order={3}>Scribe my bitch up</Title>
                <Text size="sm" c="dimmed">
                  Маленький пример интерфейса на Mantine + Tailwind
                </Text>
              </div>
            </Group>
            <Switch
              checked={autoSave}
              onChange={(event) => setAutoSave(event.currentTarget.checked)}
              label="Auto‑save"
              size="sm"
            />
          </Group>

          <TextInput
            label="Заметка"
            placeholder="Напиши что-нибудь..."
            value={note}
            onChange={(event) => {
              const value = event.currentTarget.value
              setNote(value)
              if (autoSave) {
                setSavedNote(value.trim() || null)
              }
            }}
            className="mt-2"
          />

          <Group justify="space-between" mt="sm">
            <Button variant="default" onClick={ipcHandle}>
              Отправить IPC
            </Button>
            <Button onClick={handleSave} className="bg-blue-500 hover:bg-blue-600">
              Сохранить заметку
            </Button>
          </Group>

          {savedNote && (
            <div className="mt-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
              <Text size="xs" c="dimmed">
                Сохранённая заметка:
              </Text>
              <Text size="sm" className="mt-1">
                {savedNote}
              </Text>
            </div>
          )}

          <div className="mt-4">
            <Versions />
          </div>
        </Stack>
      </Paper>
    </div>
  )
}

export default App
