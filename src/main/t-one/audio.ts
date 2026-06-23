// Audio preparation for the T-one engine: decode any input to 8 kHz mono PCM
// via ffmpeg, read it into int32 samples, and chunk it the way
// StreamingCTCPipeline.forward_offline does (PADDING on both sides, then padded
// up to a whole number of CHUNK_SIZE chunks).

import { readFileSync } from 'fs'
import { prepareAudioResampled, type ConvertResult } from '../whisper/convert'
import { CHUNK_SIZE, PADDING, SAMPLE_RATE } from './constants'

export function prepareAudio8k(inputPath: string): Promise<ConvertResult> {
  return prepareAudioResampled(inputPath, SAMPLE_RATE)
}

// Parse a canonical PCM16 WAV (as produced by our ffmpeg call) into int32
// samples. Handles arbitrary chunk ordering; averages channels if >1.
export function decodeWavToInt32(path: string): Int32Array {
  const buf = readFileSync(path)
  if (
    buf.length < 12 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('[t-one] not a WAV file')
  }

  let channels = 1
  let bitsPerSample = 16
  let dataOffset = -1
  let dataLength = 0

  let offset = 12
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2)
      bitsPerSample = buf.readUInt16LE(body + 14)
    } else if (id === 'data') {
      dataOffset = body
      dataLength = size
    }
    offset = body + size + (size % 2) // chunks are word-aligned
  }

  if (dataOffset < 0) throw new Error('[t-one] WAV has no data chunk')
  if (bitsPerSample !== 16) throw new Error(`[t-one] expected 16-bit PCM, got ${bitsPerSample}`)

  const end = Math.min(dataOffset + dataLength, buf.length)
  const totalSamples = Math.floor((end - dataOffset) / 2)
  const frames = Math.floor(totalSamples / channels)
  const out = new Int32Array(frames)

  if (channels === 1) {
    for (let i = 0; i < frames; i++) out[i] = buf.readInt16LE(dataOffset + i * 2)
  } else {
    for (let f = 0; f < frames; f++) {
      let sum = 0
      for (let c = 0; c < channels; c++) sum += buf.readInt16LE(dataOffset + (f * channels + c) * 2)
      out[f] = Math.round(sum / channels)
    }
  }
  return out
}

// Pad with PADDING zeros on both sides, then up to a whole number of chunks, and
// split into CHUNK_SIZE-length chunks (copies, so each is a standalone buffer).
export function buildChunks(samples: Int32Array): Int32Array[] {
  const withPad = samples.length + 2 * PADDING
  const totalLen = Math.ceil(withPad / CHUNK_SIZE) * CHUNK_SIZE
  const padded = new Int32Array(totalLen)
  padded.set(samples, PADDING)

  const chunks: Int32Array[] = []
  for (let i = 0; i < totalLen; i += CHUNK_SIZE) {
    chunks.push(padded.slice(i, i + CHUNK_SIZE))
  }
  return chunks
}
