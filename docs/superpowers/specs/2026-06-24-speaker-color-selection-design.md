# Speaker Color Selection

**Date:** 2026-06-24  
**Status:** Approved

## Problem

Speaker colors in `Session.tsx` are assigned by position in the `speakers` array. Deleting or reordering speakers shifts colors. Users have no control over which color a speaker gets.

## Solution

Store `color: number` (palette index 0–15) on each `Speaker`. Auto-assign on create. Allow changing via a color-swatch popover in `Home.tsx`. `Session.tsx` reads `speaker.color` directly.

---

## Data

### Type change — `src/renderer/src/types/ipc.ts`

```ts
export interface Speaker {
  id: string
  name: string
  color: number // 0–15, index into SPEAKER_PALETTE
  createdAt: string
}
```

`speakers:update` args extended:

```ts
'speakers:update': { args: [id: string, name: string, color?: number]; return: Speaker }
```

### Palette — `src/renderer/src/lib/speakerColors.ts` (new file)

16-entry array, each entry:

```ts
{
  pill: string
  bar: string
  swatch: string
}
```

- `pill` — Tailwind classes for the badge in Session.tsx
- `bar` — Tailwind classes for the segment left border
- `swatch` — hex for the small circle in Home.tsx

| #   | Color   | swatch hex |
| --- | ------- | ---------- |
| 0   | blue    | #93c5fd    |
| 1   | emerald | #6ee7b7    |
| 2   | rose    | #fda4af    |
| 3   | violet  | #c4b5fd    |
| 4   | pink    | #f9a8d4    |
| 5   | amber   | #fcd34d    |
| 6   | cyan    | #67e8f9    |
| 7   | orange  | #fdba74    |
| 8   | teal    | #5eead4    |
| 9   | indigo  | #a5b4fc    |
| 10  | lime    | #bef264    |
| 11  | fuchsia | #f0abfc    |
| 12  | sky     | #7dd3fc    |
| 13  | red     | #fca5a5    |
| 14  | yellow  | #fde047    |
| 15  | purple  | #d8b4fe    |

### Storage — `src/main/storage/speakers.ts`

- `readAll()`: for speakers missing `color`, assign `index % 16` (migration, no file rewrite)
- `createSpeaker(name)`: reads list, assigns `speakers.length % 16` as color
- `updateSpeaker(id, name, color?)`: updates name always, updates color if provided

### IPC — `src/main/ipc/speakers.ts`

`speakers:update` handler: `(_e, id, name, color?) => updateSpeaker(id, name, color)`

---

## UI

### Home.tsx — Speaker row

Replace the fixed orange gradient avatar with a colored circle using `SPEAKER_PALETTE[sp.color].swatch`.

Add color-picker popover state: `colorPickerId: string | null`.

**Speaker row structure:**

```
[color-circle] Name            [✕]
```

Color circle (`w-5 h-5 rounded-full`, inline `backgroundColor: swatch`):

- Click → sets `colorPickerId = sp.id` (opens popover)
- `WebkitUserDrag: none` to not interfere with row

**Popover** (renders when `colorPickerId === sp.id`):

- `absolute` positioned below the circle, `z-50`
- 4×4 grid of `w-5 h-5` swatch circles
- Current color: ring outline (`ring-2 ring-offset-1 ring-[#ff5a3c]`)
- Click swatch → `speakers:update(id, name, newColor)` → update `speakers` state → close popover
- Close on outside click (existing pattern: `onClick` on root div)

### Session.tsx

- Move `SPEAKER_COLORS` → import `SPEAKER_PALETTE` from `../lib/speakerColors`
- Remove `speakerColorMap` (positional index map — no longer needed)
- Lookup: `const colors = SPEAKER_PALETTE[speaker.color % 16]`
- Context menu speaker pills: same lookup

---

## Files changed

| File                                    | Change                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `src/renderer/src/lib/speakerColors.ts` | New — 16-color palette                                                         |
| `src/renderer/src/types/ipc.ts`         | `Speaker.color: number`, extend `speakers:update` args                         |
| `src/main/storage/speakers.ts`          | Auto-assign color on create, migration in readAll, updateSpeaker accepts color |
| `src/main/ipc/speakers.ts`              | Pass color arg through to updateSpeaker                                        |
| `src/renderer/src/screens/Home.tsx`     | Color circle, color-picker popover                                             |
| `src/renderer/src/screens/Session.tsx`  | Import palette, use speaker.color directly                                     |

---

## Out of scope

- Free-form hex color picker
- Per-session color overrides
- Color shown on Home session list items
