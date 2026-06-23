import { describe, it, expect } from 'vitest'
import { halfToFloat, halfArrayToFloat32 } from './float16'

describe('halfToFloat', () => {
  it('decodes known half-precision bit patterns', () => {
    expect(halfToFloat(0x0000)).toBe(0)
    expect(halfToFloat(0x3c00)).toBe(1)
    expect(halfToFloat(0x4000)).toBe(2)
    expect(halfToFloat(0xc000)).toBe(-2)
    expect(halfToFloat(0x3800)).toBeCloseTo(0.5, 6)
  })

  it('decodes an array', () => {
    const out = halfArrayToFloat32(new Uint16Array([0x3c00, 0xc000]))
    expect(Array.from(out)).toEqual([1, -2])
  })
})
