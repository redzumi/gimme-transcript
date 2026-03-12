# scribe-my-bitch-up

![SMBU logo](./docs/branding/logo-variants/logo.png)

Local desktop transcription for multi-speaker audio. No cloud, no API keys, no data leaves your machine.

`scribe-my-bitch-up` is an Electron app built around `whisper.cpp`:

- import one or more audio files
- transcribe locally with Whisper models
- label speakers manually per segment or in bulk
- export clean transcripts as Markdown or plain text

The current branding source lives in [docs/branding/logo-variants/logo.svg](./docs/branding/logo-variants/logo.svg).

## Features

- local transcription via bundled `whisper.cpp`
- live transcript segment streaming during transcription
- manual speaker labeling with a reusable global speaker list
- bulk speaker assignment
- local JSON storage for sessions, speakers, and settings
- export to Markdown and plain text
- downloadable Whisper models from inside the app

## Tech Stack

- Electron
- Electron Vite
- React
- Mantine
- Tailwind CSS
- TypeScript (`strict`)
- `whisper.cpp`

## Supported Audio Formats

- `.mp3`
- `.m4a`
- `.wav`
- `.ogg`

## Getting Started

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Checks

```bash
npm run typecheck
npm run lint
```

### Build

```bash
npm run build
npm run build:mac
```

## Project Status

The MVP implementation is tracked in [tasks.md](./tasks.md), and product scope is defined in [spec.md](./spec.md).

## Contributing

Start with:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)
- [AGENTS.md](./AGENTS.md)

## License

MIT. See [LICENSE](./LICENSE).
