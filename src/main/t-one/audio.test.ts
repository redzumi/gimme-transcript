import { describe, it, expect } from 'vitest'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { decodeWavToInt32, buildChunks } from './audio'
import { CHUNK_SIZE, PADDING } from './constants'

// Minimal canonical PCM16 mono WAV with the given samples.
function writeWav(samples: number[], sampleRate = 8000): string {
  const dataBytes = samples.length * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16) // fmt chunk size
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataBytes, 40)
  samples.forEach((s, i) => buf.writeInt16LE(s, 44 + i * 2))
  const path = join(tmpdir(), `tone-test-${randomUUID()}.wav`)
  writeFileSync(path, buf)
  return path
}

describe('decodeWavToInt32', () => {
  it('reads mono PCM16 samples as int32', () => {
    const samples = [0, 1, -1, 32767, -32768, 1234]
    const path = writeWav(samples)
    try {
      const out = decodeWavToInt32(path)
      expect(Array.from(out)).toEqual(samples)
    } finally {
      unlinkSync(path)
    }
  })
})

describe('buildChunks', () => {
  it('pads PADDING on both sides and splits into whole CHUNK_SIZE chunks', () => {
    const samples = new Int32Array(1000).fill(7)
    const chunks = buildChunks(samples)
    // total = ceil((1000 + 2*PADDING) / CHUNK_SIZE) * CHUNK_SIZE
    const expectedTotal = Math.ceil((1000 + 2 * PADDING) / CHUNK_SIZE) * CHUNK_SIZE
    expect(chunks.length).toBe(expectedTotal / CHUNK_SIZE)
    chunks.forEach((c) => expect(c.length).toBe(CHUNK_SIZE))
    // Leading PADDING samples are zero; the original data sits after it.
    // (PADDING === CHUNK_SIZE here, so the first data sample is chunk #1, pos 0.)
    expect(chunks[0][0]).toBe(0)
    const firstDataChunk = Math.floor(PADDING / CHUNK_SIZE)
    expect(chunks[firstDataChunk][PADDING % CHUNK_SIZE]).toBe(7)
  })
})
