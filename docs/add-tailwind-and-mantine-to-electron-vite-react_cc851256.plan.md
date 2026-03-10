---
name: add-tailwind-and-mantine-to-electron-vite-react
overview: Подключить Tailwind CSS и Mantine в существующее Electron + Vite + React приложение, используя Tailwind как утилитарный слой, а Mantine как основной набор UI-компонентов.
todos: []
isProject: false
---

### Цели

- **Добавить Tailwind CSS** в фронтенд-часть (`src/renderer`) Electron-Vite-React приложения.
- **Добавить Mantine (последнюю стабильную версию)** и обернуть приложение в провайдеры Mantine.
- **Настроить совместную работу** Tailwind и Mantine так, чтобы Tailwind использовался в основном для утилитарных классов и layout, а Mantine — для UI-компонентов.

### 1. Анализ структуры проекта

- **Фронтенд-часть**: Vite + React находится в каталоге `[src/renderer/src](src/renderer/src)` с входом в `[src/renderer/src/main.tsx](src/renderer/src/main.tsx)` и корневым HTML в `[src/renderer/index.html](src/renderer/index.html)`.
- **Глобальные стили сейчас**: используются обычные CSS-файлы `[src/renderer/src/assets/base.css](src/renderer/src/assets/base.css)` и `[src/renderer/src/assets/main.css](src/renderer/src/assets/main.css)`, импорт `main.css` выполняется в `main.tsx`.

### 2. Подключение Tailwind CSS к Vite-рендереру

- **Зависимости** (добавить через `devDependencies`):
  - `tailwindcss`
  - `postcss`
  - `autoprefixer`
- **Инициализация Tailwind**:
  - Создать файлы `tailwind.config.js` и `postcss.config.js` в корне проекта.
  - В `tailwind.config.js` указать `content` пути, ориентируясь на структуру Electron-Vite:
    - `./src/renderer/index.html`
    - `./src/renderer/src/**/*.{ts,tsx,js,jsx}`
- **Подключение директив Tailwind**:
  - Создать новый файл, например `[src/renderer/src/assets/tailwind.css](src/renderer/src/assets/tailwind.css)` с директивами:
    - `@tailwind base;`
    - `@tailwind components;`
    - `@tailwind utilities;`
  - В `[src/renderer/src/main.tsx](src/renderer/src/main.tsx)` заменить / дополнить импорт стилей так, чтобы импортировать и Tailwind-файл (при необходимости оставить часть существующих CSS или перенести их в слои Tailwind).
- **Опционально**: перенести часть глобальных стилей из `main.css`/`base.css` в Tailwind-конфиг (custom colors, fontFamily) или в `@layer base` внутри `tailwind.css`, сохранив существующий визуальный стиль.

### 3. Установка и базовая настройка Mantine

- **Добавить зависимости Mantine** (как обычные dependencies):
  - `@mantine/core`
  - `@mantine/hooks`
  - `@mantine/notifications` (если нужны уведомления)
  - `@mantine/emotion` (для стилизации через emotion, если требуется Mantine v7/новые версии)
- **Обёртка приложения в провайдеры**:
  - В `[src/renderer/src/main.tsx](src/renderer/src/main.tsx)` импортировать:
    - `MantineProvider` из `@mantine/core`.
    - При необходимости `Notifications` из `@mantine/notifications`.
  - Обернуть компонент `App` в `MantineProvider` (и `Notifications`) в дереве React.
  - Задать базовую тему (например, `defaultColorScheme: 'dark'` или `auto`), оставить остальное по умолчанию для минимального вмешательства.

### 4. Совместное использование Tailwind и Mantine

- **Стратегия использования**:
  - **Mantine**: компоненты UI (кнопки, модалки, инпуты, навигация).
  - **Tailwind**: layout (flex/grid), отступы, размеры, responsive-utility классы.
- **Практические изменения**:
  - В `[src/renderer/src/App.tsx](src/renderer/src/App.tsx)` начать использовать Tailwind-классы для контейнеров (например, заменить/дополнить `.actions`, `#root` и др. utility-классами Tailwind).
  - Постепенно заменять существующие кастомные CSS-классы на Tailwind там, где это удобно, сохраняя рабочее состояние приложения.
  - Добавить один-два Mantine-компонента (например, `Button`, `Card`) в `App.tsx` или отдельный компонент (новый файл в `components/`), чтобы проверить корректность интеграции.

### 5. Учёт особенностей Electron + CSP

- **Проверить CSP в `[src/renderer/index.html](src/renderer/index.html)`**:
  - Сейчас `style-src` включает `'self' 'unsafe-inline'`, что позволяет Tailwind-инлайновым стилям работать.
  - Убедиться, что добавление Mantine (emotion) не конфликтует с CSP (при необходимости при дальнейших шагах скорректировать `style-src` или включить nonce, но на первом шаге оставить как есть, так как конфигурация уже разрешает inline-стили).

### 6. Минимальная верификация и отладка

- **Локальный запуск**:
  - Запустить `npm run dev` для старта Electron-Vite.
  - Проверить, что Tailwind-классы применяются (например, задать простой класс `bg-red-500` на обёрточный `div`).
  - Проверить, что компоненты Mantine отображаются без ошибок (нет ошибок в консоли по теме Emotion или стилям).
- **Дальнейшие шаги (опционально)**:
  - Вынести тему Mantine в отдельный файл (например, `theme.ts`) для удобства настройки.
  - Определить свои

