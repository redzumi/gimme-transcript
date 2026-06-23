// IEEE-754 half-precision (float16) → float32 decode.
//
// The T-one acoustic model emits float32 log-probabilities (the Python splitter
// and decoder both assert float32), so this is only a defensive fallback in case
// a given ONNX export returns float16 logprobs. The opaque hidden state stays a
// raw Uint16Array and never passes through here.

export function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15
  const exponent = (h & 0x7c00) >> 10
  const fraction = h & 0x03ff

  if (exponent === 0) {
    // Subnormal / zero.
    return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024)
  }
  if (exponent === 0x1f) {
    return fraction ? NaN : (sign ? -1 : 1) * Infinity
  }
  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024)
}

export function halfArrayToFloat32(u16: Uint16Array): Float32Array {
  const out = new Float32Array(u16.length)
  for (let i = 0; i < u16.length; i++) out[i] = halfToFloat(u16[i])
  return out
}
