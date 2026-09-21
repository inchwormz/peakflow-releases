import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)

function ensureElectronExecutable() {
  let electronModulePath

  try {
    electronModulePath = dirname(require.resolve('electron/package.json'))
  } catch {
    return null
  }

  const executableName = process.platform === 'win32' ? 'electron.exe' : 'electron'
  const executablePath = join(electronModulePath, 'dist', executableName)
  const pathFile = join(electronModulePath, 'path.txt')

  if (!existsSync(executablePath)) {
    const installer = join(electronModulePath, 'install.js')
    if (existsSync(installer)) {
      spawnSync(process.execPath, [installer], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env
      })
    }
  }

  if (!existsSync(executablePath)) return null

  if (!existsSync(pathFile) || readFileSync(pathFile, 'utf8').trim() !== executableName) {
    writeFileSync(pathFile, executableName)
  }

  return executablePath
}

let browserPreviewProcess = null

function startRendererPreview(reason, exitWithPreview = true) {
  if (browserPreviewProcess) return browserPreviewProcess

  console.error(`[PeakFlow] ${reason}; serving the renderer preview instead.`)
  browserPreviewProcess = spawn(process.execPath, [resolve('scripts/renderer-preview.mjs')], {
    stdio: 'inherit',
    env: process.env
  })

  browserPreviewProcess.on('error', (error) => {
    console.error(`[PeakFlow] Failed to start renderer preview: ${error.message}`)
    if (exitWithPreview) process.exitCode = 1
  })

  browserPreviewProcess.on('exit', (code, signal) => {
    browserPreviewProcess = null
    if (!exitWithPreview) return
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 1)
  })

  return browserPreviewProcess
}

process.once('exit', () => {
  if (browserPreviewProcess) browserPreviewProcess.kill()
})

const electronExecutable = ensureElectronExecutable()
if (electronExecutable) process.env.ELECTRON_EXEC_PATH = electronExecutable

const hasVirtualDisplay = (() => {
  if (process.platform !== 'linux' || process.env.DISPLAY) return false

  try {
    execFileSync('which', ['xvfb-run'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

if (process.platform === 'linux' && !process.env.DISPLAY) {
  startRendererPreview('Headless Linux preview detected', false)
}

if (!electronExecutable) {
  startRendererPreview('Electron is not installed correctly')
} else {
  const command = hasVirtualDisplay ? 'xvfb-run' : 'electron-vite'
  const args = hasVirtualDisplay ? ['-a', 'electron-vite', 'dev'] : ['dev']
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env
  })

  child.on('error', (error) => {
    console.error(`[PeakFlow] Failed to start ${command}: ${error.message}`)
    startRendererPreview('The Electron development process failed')
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    if (code && code !== 0) {
      startRendererPreview(`Electron exited with code ${code}`)
      return
    }

    process.exit(code ?? 0)
  })
}
