/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const resourcesDir = path.join(rootDir, 'resources')
const buildDir = path.join(rootDir, 'build')

const masterIconPath = path.join(resourcesDir, 'icon-master.png')
const sourceIcnsPath = path.join(resourcesDir, 'icon.icns')
const outputPngPath = path.join(buildDir, 'icon.png')
const outputIcnsPath = path.join(buildDir, 'icon.icns')
const outputIcoPath = path.join(buildDir, 'icon.ico')

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options
  })

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim()
    const stdout = (result.stdout || '').trim()
    const details = stderr || stdout || `exit code ${result.status}`
    throw new Error(`${command} ${args.join(' ')} failed: ${details}`)
  }
}

const ensureFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`)
  }
}

const ensureCommand = (command) => {
  const result = spawnSync('which', [command], { stdio: 'ignore' })
  if (result.error || result.status !== 0) {
    throw new Error(`Required command not available: ${command}`)
  }
}

const buildPng = () => {
  run('sips', ['-z', '512', '512', masterIconPath, '--out', outputPngPath])
}

const buildIcns = () => {
  if (fs.existsSync(sourceIcnsPath)) {
    fs.copyFileSync(sourceIcnsPath, outputIcnsPath)
    return
  }

  const iconsetDir = path.join(
    os.tmpdir(),
    `gimme-iconset-${Date.now()}-${Math.random().toString(16).slice(2)}.iconset`
  )
  fs.mkdirSync(iconsetDir, { recursive: true })
  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512]
  ]

  for (const [fileName, size] of sizes) {
    run('sips', [
      '-z',
      String(size),
      String(size),
      masterIconPath,
      '--out',
      path.join(iconsetDir, fileName)
    ])
  }

  fs.copyFileSync(masterIconPath, path.join(iconsetDir, 'icon_512x512@2x.png'))

  try {
    run('iconutil', ['--convert', 'icns', '--output', outputIcnsPath, iconsetDir])
  } catch (error) {
    throw new Error(
      `Failed to generate icns from ${path.relative(rootDir, masterIconPath)}. ` +
        `Place a valid ${path.relative(rootDir, sourceIcnsPath)} to use as fallback. ` +
        `Original error: ${error.message}`
    )
  }
}

const buildIco = () => {
  run('magick', [masterIconPath, '-define', 'icon:auto-resize=256,128,64,48,32,16', outputIcoPath])
}

const main = () => {
  ensureFile(masterIconPath)
  ensureCommand('sips')
  ensureCommand('magick')
  ensureCommand('iconutil')

  fs.mkdirSync(buildDir, { recursive: true })

  buildPng()
  buildIcns()
  buildIco()

  console.log(`Built icons from ${path.relative(rootDir, masterIconPath)}`)
  console.log(`- ${path.relative(rootDir, outputPngPath)}`)
  console.log(`- ${path.relative(rootDir, outputIcnsPath)}`)
  console.log(`- ${path.relative(rootDir, outputIcoPath)}`)
}

main()
