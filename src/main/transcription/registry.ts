import type { EngineDef } from './types'

const WHISPER_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'ca', name: 'Catalan' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ar', name: 'Arabic' },
  { code: 'sv', name: 'Swedish' },
  { code: 'it', name: 'Italian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fi', name: 'Finnish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'he', name: 'Hebrew' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'el', name: 'Greek' },
  { code: 'ms', name: 'Malay' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'da', name: 'Danish' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ta', name: 'Tamil' },
  { code: 'no', name: 'Norwegian' },
  { code: 'th', name: 'Thai' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hr', name: 'Croatian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'la', name: 'Latin' },
  { code: 'mi', name: 'Maori' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'cy', name: 'Welsh' },
  { code: 'sk', name: 'Slovak' },
  { code: 'te', name: 'Telugu' },
  { code: 'fa', name: 'Persian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'sr', name: 'Serbian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'kn', name: 'Kannada' },
  { code: 'et', name: 'Estonian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'br', name: 'Breton' },
  { code: 'eu', name: 'Basque' },
  { code: 'is', name: 'Icelandic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'ne', name: 'Nepali' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'my', name: 'Myanmar' },
  { code: 'tg', name: 'Tajik' },
  { code: 'rw', name: 'Kinyarwanda' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'os', name: 'Ossetian' },
  { code: 'ka', name: 'Georgian' },
  { code: 'sn', name: 'Shona' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'sw', name: 'Swahili' },
  { code: 'gl', name: 'Galician' },
  { code: 'mt', name: 'Maltese' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'si', name: 'Sinhala' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'ku', name: 'Kurdish' }
]

export const ENGINE_REGISTRY: EngineDef[] = [
  {
    id: 'whisper',
    name: 'Whisper.cpp',
    description: 'Local, free, open-source. 99+ languages. Best balance of speed and accuracy.',
    platforms: [
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'darwin', arch: 'x64' },
      { platform: 'linux', arch: 'x64' }
    ],
    binaries: [
      {
        platform: 'darwin',
        arch: 'arm64',
        url: '',
        sizeBytes: 0
      },
      {
        platform: 'darwin',
        arch: 'x64',
        url: '',
        sizeBytes: 0
      },
      {
        platform: 'linux',
        arch: 'x64',
        url: '',
        sizeBytes: 0
      }
    ],
    models: [
      {
        id: 'tiny',
        name: 'Tiny',
        sizeBytes: 75 * 1024 * 1024,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
        latest: true
      },
      {
        id: 'base',
        name: 'Base',
        sizeBytes: 142 * 1024 * 1024,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
        latest: true
      },
      {
        id: 'small',
        name: 'Small',
        sizeBytes: 466 * 1024 * 1024,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
        latest: true
      },
      {
        id: 'medium',
        name: 'Medium',
        sizeBytes: 1500 * 1024 * 1024,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
        latest: true
      },
      {
        id: 'large',
        name: 'Large v3',
        sizeBytes: 2900 * 1024 * 1024,
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
        latest: true
      }
    ],
    languages: WHISPER_LANGUAGES,
    features: {
      timestamps: true,
      autoLanguage: true,
      streamingProgress: true,
      requiresApiKey: false,
      requiresNetwork: false,
      diarization: false
    }
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description:
      'Cloud API. Best accuracy. Word-level timestamps and speaker diarization available.',
    platforms: [
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'darwin', arch: 'x64' },
      { platform: 'linux', arch: 'x64' }
    ],
    binaries: [],
    models: [
      {
        id: 'whisper-1',
        name: 'Whisper 1',
        sizeBytes: 0,
        url: 'https://api.openai.com/v1/audio/transcriptions',
        pricePerMinute: 0.006,
        latest: true
      },
      {
        id: 'gpt-4o-mini-transcribe',
        name: 'GPT-4o Mini Transcribe',
        sizeBytes: 0,
        url: 'https://api.openai.com/v1/audio/transcriptions',
        pricePerMinute: 0.003,
        latest: true
      },
      {
        id: 'gpt-4o-transcribe',
        name: 'GPT-4o Transcribe',
        sizeBytes: 0,
        url: 'https://api.openai.com/v1/audio/transcriptions',
        pricePerMinute: 0.006,
        latest: true
      },
      {
        id: 'gpt-4o-transcribe-diarize',
        name: 'GPT-4o Transcribe + Diarize',
        sizeBytes: 0,
        url: 'https://api.openai.com/v1/audio/transcriptions',
        pricePerMinute: 0.03,
        latest: true
      }
    ],
    languages: [
      { code: 'auto', name: 'Auto-detect' },
      { code: 'en', name: 'English' },
      { code: 'zh', name: 'Chinese' },
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' },
      { code: 'ru', name: 'Russian' },
      { code: 'ko', name: 'Korean' },
      { code: 'fr', name: 'French' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'tr', name: 'Turkish' },
      { code: 'pl', name: 'Polish' },
      { code: 'nl', name: 'Dutch' },
      { code: 'ar', name: 'Arabic' },
      { code: 'sv', name: 'Swedish' },
      { code: 'it', name: 'Italian' },
      { code: 'id', name: 'Indonesian' },
      { code: 'hi', name: 'Hindi' },
      { code: 'fi', name: 'Finnish' },
      { code: 'vi', name: 'Vietnamese' },
      { code: 'he', name: 'Hebrew' },
      { code: 'uk', name: 'Ukrainian' },
      { code: 'el', name: 'Greek' },
      { code: 'ms', name: 'Malay' },
      { code: 'cs', name: 'Czech' },
      { code: 'ro', name: 'Romanian' },
      { code: 'da', name: 'Danish' },
      { code: 'hu', name: 'Hungarian' },
      { code: 'ta', name: 'Tamil' },
      { code: 'no', name: 'Norwegian' },
      { code: 'th', name: 'Thai' },
      { code: 'ur', name: 'Urdu' },
      { code: 'hr', name: 'Croatian' },
      { code: 'bg', name: 'Bulgarian' },
      { code: 'lt', name: 'Lithuanian' },
      { code: 'sk', name: 'Slovak' },
      { code: 'sl', name: 'Slovenian' },
      { code: 'et', name: 'Estonian' },
      { code: 'hy', name: 'Armenian' },
      { code: 'az', name: 'Azerbaijani' },
      { code: 'bn', name: 'Bengali' },
      { code: 'sr', name: 'Serbian' },
      { code: 'ka', name: 'Georgian' },
      { code: 'sn', name: 'Shona' },
      { code: 'af', name: 'Afrikaans' },
      { code: 'sw', name: 'Swahili' },
      { code: 'gl', name: 'Galician' },
      { code: 'mt', name: 'Maltese' },
      { code: 'cy', name: 'Welsh' },
      { code: 'ku', name: 'Kurdish' },
      { code: 'ne', name: 'Nepali' },
      { code: 'bs', name: 'Bosnian' },
      { code: 'kk', name: 'Kazakh' },
      { code: 'my', name: 'Myanmar' },
      { code: 'rw', name: 'Kinyarwanda' },
      { code: 'si', name: 'Sinhala' },
      { code: 'mn', name: 'Mongolian' },
      { code: 'lb', name: 'Luxembourgish' },
      { code: 'mg', name: 'Malagasy' },
      { code: 'eo', name: 'Esperanto' },
      { code: 'sa', name: 'Sanskrit' },
      { code: 'yi', name: 'Yiddish' },
      { code: 'haw', name: 'Hawaiian' },
      { code: 'is', name: 'Icelandic' }
    ],
    features: {
      timestamps: true,
      autoLanguage: true,
      streamingProgress: true,
      requiresApiKey: true,
      requiresNetwork: true,
      diarization: true
    }
  },
  {
    id: 'cohere',
    name: 'Cohere Transcribe',
    description: 'Local, free. Best-in-class accuracy for 14 languages. 2B Conformer model.',
    platforms: [
      { platform: 'darwin', arch: 'arm64', note: 'Apple Silicon (M1+)', minOsVersion: 23 }
    ],
    minRamMB: 6000,
    binaries: [
      {
        platform: 'darwin',
        arch: 'arm64',
        url: 'https://github.com/second-state/cohere_transcribe_rs/releases/download/v0.1.1/transcribe-macos-aarch64.zip',
        sizeBytes: 0
      }
    ],
    models: [
      {
        id: 'cohere-transcribe-03-2026',
        name: 'Cohere Transcribe 2B',
        sizeBytes: 4 * 1024 * 1024 * 1024,
        url: 'CohereLabs/cohere-transcribe-03-2026',
        gated: true,
        isDirectory: true,
        version: '03-2026',
        latest: true
      }
    ],
    languages: [
      { code: 'en', name: 'English' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'nl', name: 'Dutch' },
      { code: 'pl', name: 'Polish' },
      { code: 'el', name: 'Greek' },
      { code: 'ar', name: 'Arabic' },
      { code: 'ja', name: 'Japanese' },
      { code: 'zh', name: 'Chinese' },
      { code: 'vi', name: 'Vietnamese' },
      { code: 'ko', name: 'Korean' }
    ],
    features: {
      timestamps: false,
      autoLanguage: false,
      streamingProgress: false,
      requiresApiKey: false,
      requiresNetwork: false,
      diarization: false
    }
  },
  {
    id: 't-one',
    name: 'T-one (Russian)',
    description:
      'Local, free. Russian-only telephony ASR (T-one by T-Bank). Runs in-process via ONNX Runtime — no Python, no extra binary.',
    platforms: [
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'darwin', arch: 'x64' },
      { platform: 'linux', arch: 'x64' }
    ],
    binaries: [],
    models: [
      {
        id: 't-one',
        name: 'T-one Acoustic (71M)',
        // ~hundreds of MB; downloaded lazily on first transcription.
        sizeBytes: 0,
        url: 'https://huggingface.co/t-tech/T-one/resolve/main/model.onnx',
        latest: true
      }
    ],
    languages: [{ code: 'ru', name: 'Russian' }],
    features: {
      timestamps: true,
      autoLanguage: false,
      streamingProgress: true,
      requiresApiKey: false,
      requiresNetwork: false,
      diarization: false
    }
  }
]
