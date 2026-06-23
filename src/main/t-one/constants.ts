// Constants ported verbatim from T-one (github.com/voicekit-team/T-one).
// Sources: tone/onnx_wrapper.py (StreamingCTCModel), tone/pipeline.py
// (StreamingCTCPipeline), tone/logprob_splitter.py, tone/decoder.py.

// tone/decoder.py — 34 symbols (33 Cyrillic letters + space); blank is the
// implicit 35th class (index 34) and is dropped during decoding.
export const LABELS = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя '
export const NUM_CLASSES = 35

// tone/onnx_wrapper.py — StreamingCTCModel
export const STATE_SIZE = 219729
export const AUDIO_CHUNK_SAMPLES = 2400 // 300 ms @ 8 kHz
export const SAMPLE_RATE = 8000
export const FRAME_SIZE = 0.03 // seconds per acoustic frame
export const MEAN_TIME_BIAS = 0.33 // seconds

// tone/pipeline.py — StreamingCTCPipeline
export const CHUNK_SIZE = AUDIO_CHUNK_SAMPLES
export const PADDING = 2400 // 300 ms left/right padding for recognition quality

// tone/logprob_splitter.py — StreamingLogprobSplitter
export const SILENCE_THRESHOLD = 0.9
export const MIN_SILENCE_DURATION = 20 // acoustic frames
export const SPEECH_EXPAND_SIZE = 3 // acoustic frames
export const MAX_PHRASE_DURATION = 2000 // acoustic frames

// HuggingFace artifact (acoustic model only; KenLM/beam-search is skipped).
export const HF_MODEL_URL = 'https://huggingface.co/t-tech/T-one/resolve/main/model.onnx'
export const MODEL_DIR_NAME = 't-one'
export const MODEL_FILE_NAME = 'model.onnx'
