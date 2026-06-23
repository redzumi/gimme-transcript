# Speaker Color Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see and change the color of each speaker via a 16-color swatch popover in Home.tsx; colors persist on the Speaker record and are used directly in Session.tsx instead of positional index.

**Architecture:** Add `color: number` (palette index 0–15) to the `Speaker` type and storage layer. Auto-assign on create. Expose color change through the existing `speakers:update` IPC. Renderer reads `speaker.color` to look up a shared 16-color palette constant.

**Tech Stack:** TypeScript, React, Tailwind CSS, Electron IPC (ipcMain/ipcRenderer), Vitest

## Global Constraints

- Palette has exactly 16 entries indexed 0–15; access always as `SPEAKER_PALETTE[n % 16]`
- `speaker.color` defaults to `index % 16` when missing from disk (backwards compat — no file rewrite)
- Auto-assign on create: `speakers.length % 16` (count before push)
- No new dependencies — only Tailwind classes already in use and inline styles

---

### Task 1: Shared color palette

**Files:**

- Create: `src/renderer/src/lib/speakerColors.ts`

**Interfaces:**

- Produces: `SPEAKER_PALETTE: ReadonlyArray<{ pill: string; bar: string; swatch: string }>` (16 entries, index 0–15)

- [ ] **Step 1: Create the palette file**

```ts
// src/renderer/src/lib/speakerColors.ts

export interface SpeakerColor {
  pill: string
  bar: string
  swatch: string
}

export const SPEAKER_PALETTE: ReadonlyArray<SpeakerColor> = [
  {
    pill: 'bg-blue-100 text-blue-700',
    bar: 'bg-blue-50 border-l-2 border-blue-300',
    swatch: '#93c5fd'
  },
  {
    pill: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-50 border-l-2 border-emerald-300',
    swatch: '#6ee7b7'
  },
  {
    pill: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-50 border-l-2 border-rose-300',
    swatch: '#fda4af'
  },
  {
    pill: 'bg-violet-100 text-violet-700',
    bar: 'bg-violet-50 border-l-2 border-violet-300',
    swatch: '#c4b5fd'
  },
  {
    pill: 'bg-pink-100 text-pink-700',
    bar: 'bg-pink-50 border-l-2 border-pink-300',
    swatch: '#f9a8d4'
  },
  {
    pill: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-50 border-l-2 border-amber-300',
    swatch: '#fcd34d'
  },
  {
    pill: 'bg-cyan-100 text-cyan-700',
    bar: 'bg-cyan-50 border-l-2 border-cyan-300',
    swatch: '#67e8f9'
  },
  {
    pill: 'bg-orange-100 text-orange-700',
    bar: 'bg-orange-50 border-l-2 border-orange-300',
    swatch: '#fdba74'
  },
  {
    pill: 'bg-teal-100 text-teal-700',
    bar: 'bg-teal-50 border-l-2 border-teal-300',
    swatch: '#5eead4'
  },
  {
    pill: 'bg-indigo-100 text-indigo-700',
    bar: 'bg-indigo-50 border-l-2 border-indigo-300',
    swatch: '#a5b4fc'
  },
  {
    pill: 'bg-lime-100 text-lime-700',
    bar: 'bg-lime-50 border-l-2 border-lime-300',
    swatch: '#bef264'
  },
  {
    pill: 'bg-fuchsia-100 text-fuchsia-700',
    bar: 'bg-fuchsia-50 border-l-2 border-fuchsia-300',
    swatch: '#f0abfc'
  },
  {
    pill: 'bg-sky-100 text-sky-700',
    bar: 'bg-sky-50 border-l-2 border-sky-300',
    swatch: '#7dd3fc'
  },
  {
    pill: 'bg-red-100 text-red-700',
    bar: 'bg-red-50 border-l-2 border-red-300',
    swatch: '#fca5a5'
  },
  {
    pill: 'bg-yellow-100 text-yellow-700',
    bar: 'bg-yellow-50 border-l-2 border-yellow-300',
    swatch: '#fde047'
  },
  {
    pill: 'bg-purple-100 text-purple-700',
    bar: 'bg-purple-50 border-l-2 border-purple-300',
    swatch: '#d8b4fe'
  }
] as const
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
npm run typecheck:web
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
git add src/renderer/src/lib/speakerColors.ts
git commit -m "feat: add 16-color speaker palette"
```

---

### Task 2: Speaker type + IPC contract

**Files:**

- Modify: `src/renderer/src/types/ipc.ts`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `Speaker.color: number`
  - `'speakers:update': { args: [id: string, name: string, color?: number]; return: Speaker }`

- [ ] **Step 1: Add `color` to Speaker interface**

In `src/renderer/src/types/ipc.ts`, change:

```ts
export interface Speaker {
  id: string
  name: string
  createdAt: string
}
```

to:

```ts
export interface Speaker {
  id: string
  name: string
  color: number
  createdAt: string
}
```

- [ ] **Step 2: Extend speakers:update args**

In the `IpcInvokeMap`, change:

```ts
'speakers:update': { args: [id: string, name: string]; return: Speaker }
```

to:

```ts
'speakers:update': { args: [id: string, name: string, color?: number]; return: Speaker }
```

- [ ] **Step 3: Typecheck (expect errors — storage not updated yet)**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
npm run typecheck
```

Expected: errors in `src/main/storage/speakers.ts` about missing `color` field — that's correct, fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
git add src/renderer/src/types/ipc.ts
git commit -m "feat: add color field to Speaker type and extend speakers:update IPC"
```

---

### Task 3: Storage layer

**Files:**

- Modify: `src/main/storage/speakers.ts`

**Interfaces:**

- Consumes: `Speaker.color: number` from Task 2
- Produces:
  - `createSpeaker(name: string): Speaker` — auto-assigns `color`
  - `updateSpeaker(id: string, name: string, color?: number): Speaker`
  - `readAll()` — migrates missing `color` as `index % 16`

- [ ] **Step 1: Update storage/speakers.ts**

Replace the entire file content:

```ts
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Speaker } from '../../renderer/src/types/ipc'
import { getSpeakersPath } from './paths'

function readAll(): Speaker[] {
  const p = getSpeakersPath()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Array<
      Omit<Speaker, 'color'> & { color?: number }
    >
    return raw.map((sp, i) => ({ ...sp, color: sp.color ?? i % 16 }))
  } catch {
    return []
  }
}

function writeAll(speakers: Speaker[]): void {
  writeFileSync(getSpeakersPath(), JSON.stringify(speakers, null, 2), 'utf8')
}

export function listSpeakers(): Speaker[] {
  return readAll()
}

export function createSpeaker(name: string): Speaker {
  const speakers = readAll()
  const speaker: Speaker = {
    id: randomUUID(),
    name,
    color: speakers.length % 16,
    createdAt: new Date().toISOString()
  }
  speakers.push(speaker)
  writeAll(speakers)
  return speaker
}

export function updateSpeaker(id: string, name: string, color?: number): Speaker {
  const speakers = readAll()
  const idx = speakers.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`Speaker not found: ${id}`)
  speakers[idx] = {
    ...speakers[idx],
    name,
    ...(color !== undefined ? { color } : {})
  }
  writeAll(speakers)
  return speakers[idx]
}

export function deleteSpeaker(id: string): void {
  const speakers = readAll().filter((s) => s.id !== id)
  writeAll(speakers)
}
```

- [ ] **Step 2: Update IPC handler to pass color through**

In `src/main/ipc/speakers.ts`, change:

```ts
ipcMain.handle('speakers:update', (_e, id: string, name: string) => updateSpeaker(id, name))
```

to:

```ts
ipcMain.handle('speakers:update', (_e, id: string, name: string, color?: number) =>
  updateSpeaker(id, name, color)
)
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
npm run typecheck
```

Expected: no errors (Session.tsx and Home.tsx may still warn — fix in Tasks 4–5)

- [ ] **Step 4: Commit**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
git add src/main/storage/speakers.ts src/main/ipc/speakers.ts
git commit -m "feat: auto-assign speaker color on create, persist color in storage"
```

---

### Task 4: Session.tsx — use speaker.color

**Files:**

- Modify: `src/renderer/src/screens/Session.tsx`

**Interfaces:**

- Consumes:
  - `SPEAKER_PALETTE` from `../lib/speakerColors`
  - `Speaker.color: number` from Task 2

- [ ] **Step 1: Replace palette import and remove speakerColorMap**

At the top of `Session.tsx`, remove the existing `SPEAKER_COLORS` constant:

```ts
// DELETE this entire block:
const SPEAKER_COLORS = [
  { pill: 'bg-blue-100 text-blue-700', bar: 'bg-blue-50 border-l-2 border-blue-300' },
  { pill: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-50 border-l-2 border-emerald-300' },
  { pill: 'bg-[#ffe3dc] text-[#d4375b]', bar: 'bg-[#fff5f1] border-l-2 border-[#ff7e77]' },
  { pill: 'bg-violet-100 text-violet-700', bar: 'bg-violet-50 border-l-2 border-violet-300' },
  { pill: 'bg-pink-100 text-pink-700', bar: 'bg-pink-50 border-l-2 border-pink-300' },
  { pill: 'bg-amber-100 text-amber-700', bar: 'bg-amber-50 border-l-2 border-amber-300' },
  { pill: 'bg-cyan-100 text-cyan-700', bar: 'bg-cyan-50 border-l-2 border-cyan-300' },
  { pill: 'bg-rose-100 text-rose-700', bar: 'bg-rose-50 border-l-2 border-rose-300' }
]
```

Add import at the top of the file (after existing imports):

```ts
import { SPEAKER_PALETTE } from '../lib/speakerColors'
```

- [ ] **Step 2: Remove speakerColorMap useMemo**

Delete this entire `useMemo`:

```ts
const speakerColorMap = useMemo(() => {
  const map = new Map<string, number>()
  speakers.forEach((sp, i) => map.set(sp.id, i))
  return map
}, [speakers])
```

- [ ] **Step 3: Update context menu speaker pill lookup**

Find the context menu block (around line 426). Change:

```ts
const colorIdx = speakerColorMap.get(sp.id) ?? 0
const colors = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]
```

to:

```ts
const colors = SPEAKER_PALETTE[sp.color % 16]
```

- [ ] **Step 4: Update segment rendering color lookup**

Find the virtualizer segment render block (around line 776–779). Change:

```ts
const colorIdx = speaker ? (speakerColorMap.get(speaker.id) ?? 0) : -1
const colors = colorIdx >= 0 ? SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length] : null
```

to:

```ts
const colors = speaker ? SPEAKER_PALETTE[speaker.color % 16] : null
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
npm run typecheck:web
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
git add src/renderer/src/screens/Session.tsx
git commit -m "feat: use speaker.color for segment colors in Session"
```

---

### Task 5: Home.tsx — color swatch + picker popover

**Files:**

- Modify: `src/renderer/src/screens/Home.tsx`

**Interfaces:**

- Consumes:
  - `SPEAKER_PALETTE` from `../lib/speakerColors`
  - `Speaker.color: number` from Task 2
  - `speakers:update(id, name, color?)` IPC from Task 3

- [ ] **Step 1: Add SPEAKER_PALETTE import**

In `src/renderer/src/screens/Home.tsx`, add after existing imports:

```ts
import { SPEAKER_PALETTE } from '../lib/speakerColors'
```

- [ ] **Step 2: Add colorPickerId state**

Inside the `Home` component, alongside the other `useState` declarations, add:

```ts
const [colorPickerId, setColorPickerId] = useState<string | null>(null)
```

- [ ] **Step 3: Add handleSetColor function**

After `handleDeleteSpeaker`, add:

```ts
async function handleSetColor(sp: Speaker, colorIdx: number): Promise<void> {
  const updated = await window.api.invoke('speakers:update', sp.id, sp.name, colorIdx)
  setSpeakers((prev) => prev.map((s) => (s.id === sp.id ? updated : s)))
  setColorPickerId(null)
}
```

- [ ] **Step 4: Close color picker on root div click**

The root `<div>` in `Home` already has an `onClick` that closes the context menu and new menu:

```ts
onClick={() => {
  closeContextMenu()
  setNewMenuOpen(false)
}}
```

Add `setColorPickerId(null)` there:

```ts
onClick={() => {
  closeContextMenu()
  setNewMenuOpen(false)
  setColorPickerId(null)
}}
```

- [ ] **Step 5: Replace speaker row avatar with color circle + popover**

Find the speaker row in the speakers panel (around line 511–535). Replace the current speaker row `<div>` contents:

Current inner structure:

```tsx
<div className="flex min-w-0 items-center gap-2">
  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ffb090] to-[#ff5a3c]">
    <span className="text-[9px] font-bold uppercase text-white">{sp.name.charAt(0)}</span>
  </div>
  <span className="truncate text-[12px] font-medium text-[#3d2635]">{sp.name}</span>
</div>
```

Replace with:

```tsx
<div className="flex min-w-0 items-center gap-2">
  <div className="relative shrink-0">
    <button
      className="h-5 w-5 rounded-full border border-white/60 shadow-sm transition-transform hover:scale-110 focus:outline-none"
      style={{ backgroundColor: SPEAKER_PALETTE[sp.color % 16].swatch }}
      onClick={(e) => {
        e.stopPropagation()
        setColorPickerId((prev) => (prev === sp.id ? null : sp.id))
      }}
      title="Change color"
    />
    {colorPickerId === sp.id && (
      <div
        className="absolute left-0 top-6 z-50 grid grid-cols-4 gap-1 rounded-xl border border-[#edd8ce] bg-white/96 p-2 shadow-[0_18px_48px_rgba(77,42,66,0.14)] backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {SPEAKER_PALETTE.map((c, i) => (
          <button
            key={i}
            className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 focus:outline-none ${
              sp.color % 16 === i
                ? 'border-[#ff5a3c] ring-2 ring-[#ff5a3c] ring-offset-1'
                : 'border-white/60'
            }`}
            style={{ backgroundColor: c.swatch }}
            onClick={() => handleSetColor(sp, i)}
          />
        ))}
      </div>
    )}
  </div>
  <span className="truncate text-[12px] font-medium text-[#3d2635]">{sp.name}</span>
</div>
```

- [ ] **Step 6: Typecheck**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
npm run typecheck:web
```

Expected: no errors

- [ ] **Step 7: Full typecheck + tests**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
npm run typecheck && npm test
```

Expected: typecheck clean, vitest all pass

- [ ] **Step 8: Commit**

```bash
cd /Users/redzumi/Desktop/projects/gimme-transcript
git add src/renderer/src/screens/Home.tsx
git commit -m "feat: speaker color swatch and picker popover in Home"
```

---

## Manual verification checklist

After all tasks complete:

1. Run `npm run check` — must be clean
2. Open app (`npm run dev` or electron build)
3. Add a new speaker in Home — gets a colored circle (not orange gradient)
4. Add 2 more speakers — each gets a different auto-assigned color
5. Click a speaker's color circle — 4×4 color grid appears
6. Pick a different color — circle updates immediately, popover closes
7. Navigate to a session with those speakers — pill badges use the chosen colors, not positional
8. Delete speaker #1, check speaker #2 color didn't change
9. Click elsewhere while popover is open — popover closes
