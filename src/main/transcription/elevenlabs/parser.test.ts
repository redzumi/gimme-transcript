import { expect, it } from 'vitest'
import type { ElevenLabsWord } from './client'
import { parseWords, speakerLabel } from './parser'

function w(text: string, start: number, end: number, speaker?: string): ElevenLabsWord {
  return { text, start, end, type: 'word', speaker_id: speaker }
}
const sp: ElevenLabsWord = { text: ' ', type: 'spacing' }

it('maps speaker ids to readable labels', () => {
  expect(speakerLabel('speaker_0')).toBe('Speaker 1')
  expect(speakerLabel('speaker_11')).toBe('Speaker 12')
  expect(speakerLabel('agent')).toBe('agent')
})

it('groups words into segments and splits on speaker change', () => {
  const segments = parseWords({
    words: [
      w('Привет,', 0, 0.4, 'speaker_0'),
      sp,
      w('как', 0.5, 0.7, 'speaker_0'),
      sp,
      w('дела?', 0.8, 1.1, 'speaker_0'),
      sp,
      w('Хорошо.', 1.3, 1.8, 'speaker_1')
    ]
  })
  expect(segments).toEqual([
    { start: 0, end: 1.1, text: 'Привет, как дела?', speaker: 'Speaker 1' },
    { start: 1.3, end: 1.8, text: 'Хорошо.', speaker: 'Speaker 2' }
  ])
})

it('splits on long pauses and skips audio events', () => {
  const segments = parseWords({
    words: [
      w('One.', 0, 0.5),
      { text: '(laughter)', start: 0.6, end: 1, type: 'audio_event' },
      sp,
      w('Two.', 3, 3.5)
    ]
  })
  expect(segments.map((s) => s.text)).toEqual(['One.', 'Two.'])
  expect(segments[0].speaker).toBeUndefined()
})

it('splits long monologues at sentence ends', () => {
  const words: ElevenLabsWord[] = []
  for (let i = 0; i < 30; i++) {
    words.push(w(i === 22 ? 'end.' : 'word', i, i + 0.9), sp)
  }
  const segments = parseWords({ words })
  expect(segments).toHaveLength(2)
  expect(segments[0].text.endsWith('end.')).toBe(true)
  expect(segments[1].start).toBe(23)
})

it('falls back to plain text when there are no words', () => {
  expect(parseWords({ text: ' hello ' })).toEqual([{ start: 0, end: 0, text: 'hello' }])
  expect(parseWords({})).toEqual([])
})
