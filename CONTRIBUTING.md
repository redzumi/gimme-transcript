# Contributing

## Before you start

This repository is opinionated. Read these files first:

- `AGENTS.md`
- `spec.md`
- `tasks.md`

They define project scope, architecture, and current priorities. If a contribution conflicts with them, the docs win.

## Development setup

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
```

## Ground rules

- Keep TypeScript in `strict` mode.
- Do not introduce `any`.
- Keep filesystem access in the Electron main process only.
- Keep IPC typed through `src/renderer/src/types/ipc.ts`.
- Prefer Mantine for standard UI controls.
- Use Tailwind for layout and custom styling.
- Do not add cloud services, API keys, or account systems.
- Do not add automatic diarization to MVP work.
- Do not add `react-router` for MVP navigation.
- Avoid new dependencies unless they are clearly necessary.

## How to pick work

1. Open `tasks.md`.
2. Take the first unchecked task from the current phase.
3. Read the relevant section in `spec.md`.
4. Implement the change.
5. Update `tasks.md` only if the task is actually complete.

## Pull requests

Please keep pull requests small and easy to review.

Include:

- what changed
- why it changed
- screenshots or recordings for UI changes
- testing notes
- any known limitations

If your change affects app behavior, storage format, or packaging, call that out explicitly in the PR description.

## Commit style

Conventional commit prefixes are preferred:

- `feat:`
- `fix:`
- `chore:`
- `docs:`
- `refactor:`
- `test:`

## Reporting bugs

Use the GitHub issue templates when possible. Include:

- OS and architecture
- app version or commit SHA
- steps to reproduce
- expected result
- actual result
- logs or screenshots if relevant
