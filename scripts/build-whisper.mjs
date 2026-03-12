#!/usr/bin/env node
// Build whisper.cpp from source for the current platform.
// Usage: node scripts/build-whisper.mjs

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'resources', 'whisper.cpp')

const PLATFORM = process.platform === 'darwin' ? 'mac'
  : process.platform === 'win32' ? 'win'
  : 'linux'
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const EXT = process.platform === 'win32' ? '.exe' : ''
const BINARY_NAME = `whisper-${PLATFORM}-${ARCH}${EXT}`
const BINARY_PATH = path.join(OUT_DIR, BINARY_NAME)

if (fs.existsSync(BINARY_PATH)) {
  console.log(`✓ ${BINARY_NAME} already exists, skipping.`)
  process.exit(0)
}

const tmpDir = path.join(os.tmpdir(), `whisper-src-${Date.now()}`)

console.log(`→ Cloning whisper.cpp...`)
execSync(`git clone --depth 1 https://github.com/ggerganov/whisper.cpp "${tmpDir}"`, { stdio: 'inherit' })

console.log(`→ Building for ${PLATFORM}/${ARCH}...`)
const buildDir = path.join(tmpDir, 'build')

execSync(`cmake -S "${tmpDir}" -B "${buildDir}" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF`, { stdio: 'inherit' })
execSync(`cmake --build "${buildDir}" --config Release -j ${os.cpus().length}`, { stdio: 'inherit' })

// cmake output location varies by platform/version.
// New whisper.cpp (v1.7+) uses 'whisper-cli', older versions used 'main'.
const candidates = [
  path.join(buildDir, 'bin', `whisper-cli${EXT}`),
  path.join(buildDir, 'bin', 'Release', `whisper-cli${EXT}`),
  path.join(buildDir, 'bin', `main${EXT}`),
  path.join(buildDir, 'bin', 'Release', `main${EXT}`),
  path.join(buildDir, `whisper-cli${EXT}`),
  path.join(buildDir, `main${EXT}`),
]
const srcBin = candidates.find(fs.existsSync)
if (!srcBin) throw new Error(`Built binary not found. Checked:\n${candidates.join('\n')}`)
console.log(`  Found binary: ${srcBin}`)

fs.copyFileSync(srcBin, BINARY_PATH)
if (process.platform !== 'win32') fs.chmodSync(BINARY_PATH, 0o755)

fs.rmSync(tmpDir, { recursive: true })
console.log(`✓ ${BINARY_NAME}`)
