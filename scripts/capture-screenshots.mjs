/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const outMainEntry = join(repoRoot, 'out', 'main', 'index.js')
const screenshotDir = join(repoRoot, 'docs', 'screenshots')

function isoDate(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function seedFixture(baseDir, { withModels }) {
  const sessionsDir = join(baseDir, 'sessions')
  const modelsDir = join(baseDir, 'models')
  await ensureDir(sessionsDir)
  await ensureDir(modelsDir)

  const alexId = 'speaker-alex'
  const miraId = 'speaker-mira'
  const hostId = 'speaker-host'
  const transcriptSessionId = 'session-transcript'

  await writeJson(join(baseDir, 'settings.json'), {
    defaultModel: 'medium',
    defaultLanguage: 'auto',
    storagePath: baseDir
  })

  await writeJson(join(baseDir, 'speakers.json'), [
    { id: alexId, name: 'Alex', createdAt: isoDate(-86_400_000 * 4) },
    { id: miraId, name: 'Mira', createdAt: isoDate(-86_400_000 * 3) },
    { id: hostId, name: 'Host', createdAt: isoDate(-86_400_000 * 2) }
  ])

  if (withModels) {
    await writeFile(join(modelsDir, 'ggml-medium.bin'), '')
    await writeFile(join(modelsDir, 'ggml-large.bin'), '')
  }

  const sessions = [
    {
      id: 'session-home-1',
      name: 'Standup review with design',
      createdAt: isoDate(-3 * 60_000),
      audioFile: '',
      model: 'medium',
      language: 'auto',
      status: 'done',
      segments: [
        {
          id: 'seg-home-1',
          start: 12,
          end: 18,
          text: 'We should ship the open-source release this week.',
          speakerId: alexId
        }
      ]
    },
    {
      id: 'session-home-2',
      name: 'Founder call raw import',
      createdAt: isoDate(-17 * 60_000),
      audioFile: '',
      model: 'medium',
      language: 'auto',
      status: 'transcribing',
      segments: [
        {
          id: 'seg-home-2',
          start: 0,
          end: 4,
          text: 'The transcript is still streaming in.',
          speakerId: hostId
        }
      ]
    },
    {
      id: transcriptSessionId,
      name: 'Imported interview transcript',
      createdAt: isoDate(-58 * 60_000),
      audioFile: '',
      model: 'medium',
      language: 'auto',
      status: 'done',
      segments: [
        {
          id: 'seg-1',
          start: 12,
          end: 18,
          text: 'We should ship the open-source release this week.',
          speakerId: alexId
        },
        {
          id: 'seg-2',
          start: 19,
          end: 27,
          text: 'Let us keep it local-first and avoid any cloud dependencies.',
          speakerId: miraId
        },
        {
          id: 'seg-3',
          start: 33,
          end: 42,
          text: 'Double-click to edit transcript text inline and assign speakers from the context menu.',
          speakerId: hostId
        }
      ]
    }
  ]

  await Promise.all(
    sessions.map((session) => writeJson(join(sessionsDir, `${session.id}.json`), session))
  )
}

async function launchApp(userDataDir) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [outMainEntry],
    env: {
      ...process.env,
      GIMME_TRANSCRIPT_USER_DATA_DIR: userDataDir,
      NODE_ENV: 'production'
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

async function setWindowSize(app, bounds) {
  await app.evaluate(async ({ BrowserWindow }, nextBounds) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setBounds(nextBounds)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }, bounds)
}

async function captureFirstLaunch(outputPath) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'gimme-transcript-shot-first-'))
  try {
    await seedFixture(userDataDir, { withModels: false })
    const { app, page } = await launchApp(userDataDir)
    try {
      await setWindowSize(app, { width: 860, height: 680 })
      await page.getByRole('button', { name: 'Download model' }).waitFor({ timeout: 15000 })
      await page.screenshot({ path: outputPath })
    } finally {
      await app.close()
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
}

async function captureMainScreens(outputPaths) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'gimme-transcript-shot-main-'))
  try {
    await seedFixture(userDataDir, { withModels: true })
    const { app, page } = await launchApp(userDataDir)
    try {
      await setWindowSize(app, { width: 1100, height: 760 })
      await page.getByText('Sessions').waitFor({ timeout: 15000 })
      await page.screenshot({ path: outputPaths.home })

      await page.getByText('Imported interview transcript').click()
      await page.getByText('Merge & Export').waitFor({ timeout: 15000 })
      await setWindowSize(app, { width: 1040, height: 780 })
      await page.screenshot({ path: outputPaths.session })

      await page.getByRole('button', { name: '← Home' }).click()
      await page.getByText('Sessions').waitFor({ timeout: 15000 })
      await page.getByTitle('Settings').click()
      await page.getByText('Settings').waitFor({ timeout: 15000 })
      await setWindowSize(app, { width: 1040, height: 780 })
      await page.screenshot({ path: outputPaths.settings })
    } finally {
      await app.close()
    }
  } finally {
    await rm(userDataDir, { recursive: true, force: true })
  }
}

async function main() {
  await ensureDir(screenshotDir)

  const outputs = {
    firstLaunch: join(screenshotDir, 'first-launch.png'),
    home: join(screenshotDir, 'home.png'),
    session: join(screenshotDir, 'session.png'),
    settings: join(screenshotDir, 'settings.png')
  }

  await captureFirstLaunch(outputs.firstLaunch)
  await captureMainScreens(outputs)

  console.log('Generated screenshots:')
  Object.values(outputs).forEach((file) => console.log(`- ${file}`))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
