import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function getWhisperBinaryPath(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const binaryName = `whisper-${platform}-${arch}${process.platform === 'win32' ? '.exe' : ''}`
  if (is.dev) {
    return join(process.cwd(), 'resources', 'whisper.cpp', binaryName)
  }
  return join(process.resourcesPath, 'whisper.cpp', binaryName)
}
