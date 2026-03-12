# Agent Instructions — scribe-my-bitch-up

Читай этот файл перед любой работой над проектом.

---

## Что это

Desktop-приложение для транскрибации аудио с разметкой спикеров.
Локальное, бесплатное, open-source. Никаких облаков, никаких API-ключей.

Полная спецификация: `spec.md`
Список задач: `tasks.md`

---

## Стек

| Слой | Технология |
|---|---|
| App | Electron |
| Build | Electron Vite |
| UI | React + Mantine + Tailwind CSS |
| Language | TypeScript (strict) |
| Transcription | whisper.cpp binary (bundled) |
| Storage | JSON files (AppData) |

---

## Структура проекта

```
scribe-my-bitch-up/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # Entry point
│   │   ├── ipc/        # IPC handlers
│   │   ├── whisper/    # whisper.cpp runner + model manager
│   │   └── storage/    # sessions, speakers, settings
│   ├── preload/
│   │   └── index.ts    # contextBridge, typed IPC
│   └── renderer/
│       ├── main.tsx    # React entry
│       ├── screens/    # One file per screen
│       ├── components/ # Shared components
│       ├── hooks/      # Custom hooks
│       └── types/      # Shared TypeScript types
├── resources/
│   └── whisper.cpp/    # Bundled binary (arm64 + x64)
└── electron.vite.config.ts
```

---

## Правила

### Общие
- TypeScript strict mode, никаких `any`
- Все IPC-каналы типизированы через общий `types/ipc.ts`
- Компоненты — функциональные, hooks-only
- Mantine для компонентов (inputs, modals, dropzone и т.д.) — не изобретать там где есть готовые
- Tailwind для layout и кастомных стилей

### Main process
- Вся работа с файловой системой — только в main
- Никакого прямого fs в renderer
- Каждый IPC handler в отдельном файле в `main/ipc/`

### Storage
- Сессии: `{AppData}/sessions/{uuid}.json`
- Спикеры: `{AppData}/speakers.json`
- Настройки: `{AppData}/settings.json`
- Модели: `{AppData}/models/`
- AppData path: `app.getPath('userData')`

### Whisper
- Бинарник в `resources/whisper.cpp/`
- Запуск через `child_process.spawn`
- Сегменты парсятся из stdout по мере появления
- Каждый сегмент сразу отправляется в renderer через IPC (`whisper:segment`)
- Прогресс через IPC (`whisper:progress`)

### Экраны
- Один файл на экран в `renderer/screens/`
- Навигация через простой state в App.tsx (не react-router для MVP)
- Экран определяется типом: `'firstLaunch' | 'home' | 'session' | 'settings'`

---

## Session JSON Schema

```typescript
interface Session {
  id: string           // uuid
  createdAt: string    // ISO8601
  audioFile: string    // absolute path
  model: WhisperModel  // 'tiny' | 'base' | 'small' | 'medium' | 'large'
  language: string     // 'auto' | 'ru' | 'en' | ...
  status: 'idle' | 'transcribing' | 'done'
  segments: Segment[]
}

interface Segment {
  id: string
  start: number        // seconds
  end: number          // seconds
  text: string
  speakerId: string | null
}
```

## Speaker JSON Schema

```typescript
interface Speaker {
  id: string           // uuid
  name: string
  createdAt: string
}
```

## Settings JSON Schema

```typescript
interface Settings {
  defaultModel: WhisperModel
  defaultLanguage: string
  storagePath: string  // custom path or default AppData
}
```

---

## Как брать задачу

1. Открой `tasks.md`
2. Возьми первую незакрытую задачу из текущей фазы
3. Прочитай соответствующий раздел в `spec.md` для деталей
4. Реализуй
5. Отметь задачу как `[x]` в `tasks.md`

Фазы выполняются по порядку. Внутри фазы задачи можно параллелить если нет явной зависимости.

---

## Что не делать

- Не добавлять зависимости без необходимости
- Не делать автоматическую diarization — это v2
- Не добавлять облачные функции
- Не поддерживать Windows в MVP
- Не усложнять навигацию (react-router не нужен для MVP)
