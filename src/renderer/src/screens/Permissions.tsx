import { useState } from 'react'
import { Button, Badge, Stack } from '@mantine/core'
import type { RecordingPermission, RecordingPermissions } from '../types/ipc'
import { Logo } from '../components/Logo'

interface Props {
  permissions: RecordingPermissions
  platform: string
  checking: boolean
  onOpenSettings: (permission: RecordingPermission) => Promise<void>
  onContinue: () => Promise<void>
}

function PermissionRow({
  icon,
  label,
  note,
  granted,
  actionLabel,
  onAction,
  tone
}: {
  icon: string
  label: string
  note: string
  granted: boolean
  actionLabel: string
  onAction: () => Promise<void>
  tone: 'sunset' | 'lilac'
}): React.JSX.Element {
  return (
    <div className="rounded-3xl border border-[#ecd8cf] bg-[#fffaf7] p-4 shadow-[0_10px_24px_rgba(104,45,69,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl shadow-[0_8px_18px_rgba(104,45,69,0.08)]">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#24191f]">{label}</p>
              <Badge size="xs" color={granted ? 'teal' : tone} variant="light">
                {granted ? 'allowed' : 'required'}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#7f6671]">{note}</p>
          </div>
        </div>

        {granted ? (
          <span className="rounded-full bg-[#ecfff5] px-2.5 py-1 text-[11px] font-medium text-[#1f8f5f]">
            Ready
          </span>
        ) : (
          <Button
            size="xs"
            radius="xl"
            color={tone}
            variant="light"
            onClick={() => void onAction()}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function Permissions({
  permissions,
  platform,
  checking,
  onOpenSettings,
  onContinue
}: Props): React.JSX.Element {
  const [openingPermission, setOpeningPermission] = useState<RecordingPermission | null>(null)

  async function handleOpenSettings(permission: RecordingPermission): Promise<void> {
    setOpeningPermission(permission)
    try {
      await onOpenSettings(permission)
    } finally {
      setOpeningPermission(null)
    }
  }

  const requiresScreenRecording = platform === 'darwin'
  const allGranted = permissions.mic && (!requiresScreenRecording || permissions.screenRecording)

  return (
    <div className="min-h-screen bg-[var(--app-shell)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="overflow-hidden rounded-[36px] border border-[#ead6cd] bg-[linear-gradient(145deg,rgba(255,248,242,0.96),rgba(255,255,255,0.9))] p-8 shadow-[0_28px_90px_rgba(108,39,70,0.14)] backdrop-blur-sm">
            <div className="mb-8 flex items-center gap-4">
              <div className="rounded-[22px] bg-white p-3 shadow-[0_14px_34px_rgba(104,45,69,0.1)]">
                <Logo size={34} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#b57a70]">
                  Startup check
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#24191f]">
                  Разрешения перед записью
                </h1>
              </div>
            </div>

            <p className="max-w-xl text-sm leading-7 text-[#6f5965]">
              Приложение должно получить доступ к микрофону и, на macOS, к захвату экрана для
              системного аудио. Пока права не выданы, запись будет неполной или не запустится.
            </p>

            <div className="mt-8 grid gap-4">
              <PermissionRow
                icon="🎤"
                label="Microphone"
                note="Нужен для записи вашего голоса и локальной расшифровки разговора."
                granted={permissions.mic}
                actionLabel={openingPermission === 'microphone' ? 'Opening…' : 'Open Settings'}
                onAction={() => handleOpenSettings('microphone')}
                tone="sunset"
              />

              {requiresScreenRecording && (
                <PermissionRow
                  icon="🖥️"
                  label="Screen Recording"
                  note="Нужно macOS, чтобы захватывать системный звук собеседника из выбранного экрана."
                  granted={permissions.screenRecording}
                  actionLabel={
                    openingPermission === 'screenRecording' ? 'Opening…' : 'Open Settings'
                  }
                  onAction={() => handleOpenSettings('screenRecording')}
                  tone="lilac"
                />
              )}
            </div>
          </section>

          <aside className="rounded-[36px] border border-[#ead6cd] bg-white/88 p-8 shadow-[0_28px_90px_rgba(108,39,70,0.1)] backdrop-blur-sm">
            <Stack gap="xl" h="100%" justify="space-between">
              <div>
                <div className="rounded-[28px] bg-[linear-gradient(160deg,#fff1e8,#fff9f5)] p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-[#ff5b67] shadow-[0_0_0_8px_rgba(255,91,103,0.12)]" />
                    <p className="text-sm font-semibold text-[#24191f]">
                      {allGranted ? 'Everything looks ready' : 'Waiting for access'}
                    </p>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#7f6671]">
                    После выдачи прав вернитесь в приложение и нажмите кнопку ниже. Проверка
                    выполнится повторно без перезапуска.
                  </p>
                </div>

                <div className="mt-6 space-y-3 text-sm text-[#6f5965]">
                  <div className="rounded-2xl border border-dashed border-[#efd8cf] px-4 py-3">
                    1. Откройте настройки системы по кнопке рядом с нужным доступом.
                  </div>
                  <div className="rounded-2xl border border-dashed border-[#efd8cf] px-4 py-3">
                    2. Разрешите доступ для `Gimme Transcript`.
                  </div>
                  <div className="rounded-2xl border border-dashed border-[#efd8cf] px-4 py-3">
                    3. Вернитесь сюда и запустите повторную проверку.
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                radius="xl"
                color="sunset"
                loading={checking}
                onClick={() => void onContinue()}
              >
                {checking
                  ? 'Checking permissions…'
                  : allGranted
                    ? 'Continue'
                    : 'Recheck permissions'}
              </Button>
            </Stack>
          </aside>
        </div>
      </div>
    </div>
  )
}
