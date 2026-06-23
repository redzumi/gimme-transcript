# OpenAI Transcription Integration

Detailed plan for adding OpenAI as a cloud transcription engine.

Date: 2026-04-19
Parent plan: [multi-engine-architecture.md](./multi-engine-architecture.md)

---

## Models

| Model                       | Timestamps       | Diarization | Streaming | Prompt             | Output Formats                     | Notes                    |
| --------------------------- | ---------------- | ----------- | --------- | ------------------ | ---------------------------------- | ------------------------ |
| `whisper-1`                 | ✅ word-level    | ❌          | ✅        | ✅ (224 tok limit) | json, text, srt, vtt, verbose_json | Classic, cheapest        |
| `gpt-4o-mini-transcribe`    | ❌               | ❌          | ✅        | ✅                 | json, text                         | Budget option            |
| `gpt-4o-transcribe`         | ❌               | ❌          | ✅        | ✅                 | json, text                         | Best quality             |
| `gpt-4o-transcribe-diarize` | ✅ segment-level | ✅          | ✅        | ❌                 | json, text, diarized_json          | Speakers + auto-chunking |

### Supported languages (50+)

Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Catalan, Chinese, Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, Galician, German, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi, Maori, Nepali, Norwegian, Persian, Polish, Portuguese, Romanian, **Russian**, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog, Tamil, Thai, Turkish, Ukrainian, Urdu, Vietnamese, and Welsh.

### Supported input formats

mp3, mp4, mpeg, mpga, m4a, wav, webm

---

## API Details

### Transcription endpoint

```
POST https://api.openai.com/v1/audio/transcriptions
Authorization: Bearer {OPENAI_API_KEY}
Content-Type: multipart/form-data

file: @audio.mp3
model: gpt-4o-transcribe
response_format: verbose_json
language: en
```

### Response: verbose_json (whisper-1)

```json
{
  "task": "transcribe",
  "language": "en",
  "duration": 8.17,
  "text": "Hello, how are you?",
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 4.2,
      "text": "Hello, how are you?",
      "no_speech_prob": 0.1
    }
  ],
  "words": [
    {
      "word": "Hello",
      "start": 0.0,
      "end": 0.5,
      "probability": 0.98
    },
    {
      "word": "how",
      "start": 0.6,
      "end": 0.8,
      "probability": 0.95
    }
  ]
}
```

### Response: diarized_json (gpt-4o-transcribe-diarize)

```json
{
  "text": "Full transcription...",
  "segments": [
    {
      "speaker": "Speaker A",
      "start": 0.0,
      "end": 5.2,
      "text": "Hello everyone, let's begin."
    },
    {
      "speaker": "Speaker B",
      "start": 5.5,
      "end": 9.8,
      "text": "Thanks for joining today."
    }
  ]
}
```

### Known speaker references (diarize model)

Up to 4 known speakers can be identified by providing reference audio clips:

```
known_speaker_names[]: ["agent", "customer"]
known_speaker_references[]: ["data:audio/wav;base64,...", "data:audio/wav;base64,..."]
```

Reference clips: 2-10 seconds each, any supported audio format, encoded as data URLs.

### Streaming

```
POST .../v1/audio/transcriptions
stream: true

→ Events: transcript.text.delta, transcript.text.done
→ For diarized_json: also transcript.text.segment (with speaker labels)
```

Not supported for `whisper-1` (use `response_format: verbose_json` instead).

### chunking_strategy (diarize model)

Required for audio > 30 seconds:

```
chunking_strategy: "auto"
```

Server-side chunking with VAD. No client-side splitting needed for diarize model.

---

## 25MB File Limit — Strategy by Model

| Model                       | Strategy                    | Details                                                        |
| --------------------------- | --------------------------- | -------------------------------------------------------------- |
| `whisper-1`                 | VAD split + prompt chain    | Client-side: split by silence, prompt with previous chunk text |
| `gpt-4o-transcribe`         | VAD split + prompt chain    | Same as whisper-1                                              |
| `gpt-4o-mini-transcribe`    | VAD split + prompt chain    | Same                                                           |
| `gpt-4o-transcribe-diarize` | `chunking_strategy: "auto"` | Server handles everything, no client splitting                 |

### VAD-based splitting

Use ffmpeg `silencedetect` to find natural speech boundaries:

```bash
ffmpeg -i audio.mp3 -af silencedetect=noise=-30dB:d=0.5 -f null - 2>&1
# → [silencedetect] silence_start: 12.3 | silence_end: 13.1 | silence_duration: 0.8
```

Split at silence boundaries to avoid mid-sentence cuts.

### Prompt chaining

For each chunk after the first, use previous chunk's transcript as prompt:

```
Chunk 1: (no prompt) → "Hello everyone, welcome to the"
Chunk 2: prompt="Hello everyone, welcome to the" → "meeting today. We're going to discuss"
Chunk 3: prompt="meeting today. We're going to discuss" → "our quarterly results."
```

Limits:

- whisper-1: only considers last 224 tokens of prompt
- gpt-4o models: full prompt context
- Sequential processing (each chunk needs previous transcript)

---

## Runner Implementation

### Flow decision tree

```
transcribeSession(sessionId)
  │
  ├── model = gpt-4o-transcribe-diarize?
  │   ├── audio > 25MB? → compress to MP3
  │   └── POST with chunking_strategy="auto"
  │       └── parse diarized_json → segments with speaker
  │
  ├── audio <= 25MB?
  │   └── POST directly (no chunking)
  │       └── parse response (verbose_json / diarized_json / text)
  │
  └── audio > 25MB?
      ├── Compress to MP3 via ffmpeg
      ├── If MP3 <= 25MB → POST directly
      └── If MP3 > 25MB → VAD split → prompt chain → merge
```

### Progress reporting

For streaming (`stream: true`):

- Emit `whisper:segment` events as `transcript.text.delta` arrives
- Emit `whisper:progress` with estimated percent

For non-streaming:

- Emit `whisper:progress` with 0% → 50% (uploading) → 100% (done)
- No intermediate segments

### Cost estimation

```
whisper-1:                  $0.006/min
gpt-4o-mini-transcribe:     $0.003/min (check current pricing)
gpt-4o-transcribe:          $0.006/min (check current pricing)
gpt-4o-transcribe-diarize:  $0.030/min (check current pricing)
```

Show before transcription: "Estimated cost: ~$X.XX"

### Diarize → Speaker mapping

When `gpt-4o-transcribe-diarize` returns segments with speaker labels:

```
"Speaker A" → auto-create Speaker with name "Speaker A"
"Speaker B" → auto-create Speaker with name "Speaker B"
```

User can rename speakers later in the UI.

### Known speaker references integration

For sessions with recorded dual sources (mic + speaker):

1. After recording, user assigns speakers (e.g., "me", "caller")
2. Short clips (2-10s) extracted from each source as reference
3. Reference clips encoded as data URLs
4. Sent with diarize request as `known_speaker_references[]`
5. Diarize returns segments mapped to "me" and "caller"

This replaces manual speaker assignment after transcription.

---

## Error Handling

| Error              | Code          | Action                                                    |
| ------------------ | ------------- | --------------------------------------------------------- |
| Invalid API key    | 401           | Show dialog: "Invalid API key. Check in Settings."        |
| Rate limited       | 429           | Show dialog: "Rate limited. Try again in {retry_after}s." |
| File too large     | 413           | Auto-chunk (should not happen with our chunking)          |
| No internet        | Network error | Show dialog: "OpenAI requires internet connection."       |
| Insufficient quota | 402           | Show dialog: "OpenAI quota exceeded."                     |

---

## Security

- API key stored in `settings.json` (plaintext)
- Key sent via HTTPS to OpenAI
- Audio sent via HTTPS (multipart form)
- No audio stored on OpenAI servers (per their policy)
- Key never logged or exposed in renderer (main process only)

---

## Pricing Reference

As of April 2026 — verify current prices at https://openai.com/pricing before implementation:

- whisper-1: $0.006 / minute
- gpt-4o-mini-transcribe: TBD
- gpt-4o-transcribe: TBD
- gpt-4o-transcribe-diarize: TBD
