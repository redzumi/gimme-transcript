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
