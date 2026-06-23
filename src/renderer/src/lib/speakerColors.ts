export interface SpeakerColor {
  pill: string
  bar: string
  swatch: string
}

export const SPEAKER_PALETTE: ReadonlyArray<SpeakerColor> = [
  {
    pill: 'bg-blue-200 text-blue-800',
    bar: 'bg-blue-50 border-l-2 border-blue-400',
    swatch: '#93c5fd'
  },
  {
    pill: 'bg-emerald-200 text-emerald-800',
    bar: 'bg-emerald-50 border-l-2 border-emerald-400',
    swatch: '#6ee7b7'
  },
  {
    pill: 'bg-rose-200 text-rose-800',
    bar: 'bg-rose-50 border-l-2 border-rose-400',
    swatch: '#fda4af'
  },
  {
    pill: 'bg-violet-200 text-violet-800',
    bar: 'bg-violet-50 border-l-2 border-violet-400',
    swatch: '#c4b5fd'
  },
  {
    pill: 'bg-pink-200 text-pink-800',
    bar: 'bg-pink-50 border-l-2 border-pink-400',
    swatch: '#f9a8d4'
  },
  {
    pill: 'bg-amber-200 text-amber-800',
    bar: 'bg-amber-50 border-l-2 border-amber-400',
    swatch: '#fcd34d'
  },
  {
    pill: 'bg-cyan-200 text-cyan-800',
    bar: 'bg-cyan-50 border-l-2 border-cyan-400',
    swatch: '#67e8f9'
  },
  {
    pill: 'bg-orange-200 text-orange-800',
    bar: 'bg-orange-50 border-l-2 border-orange-400',
    swatch: '#fdba74'
  },
  {
    pill: 'bg-teal-200 text-teal-800',
    bar: 'bg-teal-50 border-l-2 border-teal-400',
    swatch: '#5eead4'
  },
  {
    pill: 'bg-indigo-200 text-indigo-800',
    bar: 'bg-indigo-50 border-l-2 border-indigo-400',
    swatch: '#a5b4fc'
  },
  {
    pill: 'bg-lime-200 text-lime-800',
    bar: 'bg-lime-50 border-l-2 border-lime-400',
    swatch: '#bef264'
  },
  {
    pill: 'bg-fuchsia-200 text-fuchsia-800',
    bar: 'bg-fuchsia-50 border-l-2 border-fuchsia-400',
    swatch: '#f0abfc'
  },
  {
    pill: 'bg-sky-200 text-sky-800',
    bar: 'bg-sky-50 border-l-2 border-sky-400',
    swatch: '#7dd3fc'
  },
  {
    pill: 'bg-red-200 text-red-800',
    bar: 'bg-red-50 border-l-2 border-red-400',
    swatch: '#fca5a5'
  },
  {
    pill: 'bg-yellow-200 text-yellow-800',
    bar: 'bg-yellow-50 border-l-2 border-yellow-400',
    swatch: '#fde047'
  },
  {
    pill: 'bg-purple-200 text-purple-800',
    bar: 'bg-purple-50 border-l-2 border-purple-400',
    swatch: '#d8b4fe'
  }
] as const
