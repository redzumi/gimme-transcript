// ONNX acoustic model wrapper — port of tone/onnx_wrapper.py::StreamingCTCModel.
//
//   logprobs, new_state = ort_sess.run(None, {"signal": chunk, "state": state})
//
// signal: int32 (1, 2400, 1); state: float16 (1, STATE_SIZE), zeros on first
// call. Outputs are [logprobs float32 (1, frames, 35), state float16
// (1, STATE_SIZE)]. The state is opaque — we carry the raw Uint16Array forward.

import * as ort from 'onnxruntime-node'
import { AUDIO_CHUNK_SAMPLES, NUM_CLASSES, STATE_SIZE } from './constants'
import { ensureToneModel } from './model'
import { halfArrayToFloat32 } from './float16'

// onnxruntime-node 1.27's native binding cannot consume V8's newer Float16Array
// (it expects a Uint16Array for float16 tensors, "type 4"). When the runtime
// (Electron's V8) exposes a global Float16Array, onnxruntime-common silently
// converts our Uint16Array state into it and native run() throws
// "Tensor.data must be a typed array (4 or Float16Array) ... got typed array (0)".
// Remove the global so the float16 path stays on Uint16Array. This must run
// before the first ort.Tensor is constructed (module load is well before that).
{
  const g = globalThis as Record<string, unknown>
  if (typeof g.Float16Array !== 'undefined') delete g.Float16Array
}

let sessionPromise: Promise<ort.InferenceSession> | null = null

export async function getAcousticSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const modelPath = await ensureToneModel()
      return ort.InferenceSession.create(modelPath)
    })().catch((err) => {
      sessionPromise = null
      throw err
    })
  }
  return sessionPromise
}

export interface AcousticOutput {
  logprobs: Float32Array // row-major (frames, NUM_CLASSES)
  frames: number
  state: Uint16Array // opaque float16 hidden state
}

// Inference is serialized (single in-flight run) to mirror the Python pipeline's
// inference lock and avoid concurrent runs on the shared session.
let inferenceChain: Promise<unknown> = Promise.resolve()

function classifyOutputs(results: ort.InferenceSession.ReturnType): {
  logprobs: ort.Tensor
  state: ort.Tensor
} {
  const tensors = Object.values(results) as ort.Tensor[]
  let logprobs: ort.Tensor | undefined
  let state: ort.Tensor | undefined
  for (const t of tensors) {
    const dims = t.dims
    if (dims.length >= 1 && dims[dims.length - 1] === NUM_CLASSES) logprobs = t
    else if (t.data.length === STATE_SIZE || dims[dims.length - 1] === STATE_SIZE) state = t
  }
  // Fall back to positional order ([logprobs, state]) if shapes were ambiguous.
  if (!logprobs) logprobs = tensors[0]
  if (!state) state = tensors[1]
  if (!logprobs || !state) throw new Error('[t-one] unexpected ONNX output shape')
  return { logprobs, state }
}

export function acousticForward(
  chunk: Int32Array,
  state: Uint16Array | null
): Promise<AcousticOutput> {
  const run = inferenceChain.then(async () => {
    const session = await getAcousticSession()
    const signal = new ort.Tensor('int32', chunk, [1, AUDIO_CHUNK_SAMPLES, 1])
    const stateData = state ?? new Uint16Array(STATE_SIZE) // zeros == float16 0.0
    const stateTensor = new ort.Tensor('float16', stateData, [1, STATE_SIZE])

    const results = await session.run({ signal, state: stateTensor })
    const out = classifyOutputs(results)

    const dims = out.logprobs.dims
    const frames = dims.length >= 2 ? dims[dims.length - 2] : 0
    const logprobs =
      out.logprobs.type === 'float16'
        ? halfArrayToFloat32(out.logprobs.data as Uint16Array)
        : // Copy out of the (reusable) native buffer.
          (out.logprobs.data as Float32Array).slice()
    // Copy the raw 16-bit pattern (not numeric values) so the opaque float16
    // state round-trips exactly, regardless of the backing typed array kind.
    const stateView = out.state.data as Uint16Array
    const nextState = new Uint16Array(
      stateView.buffer.slice(stateView.byteOffset, stateView.byteOffset + stateView.byteLength)
    )
    return { logprobs, frames, state: nextState }
  })
  // Keep the chain alive regardless of individual call outcome.
  inferenceChain = run.catch(() => undefined)
  return run
}
