import { execFileSync, spawn } from 'node:child_process'

const hasVirtualDisplay = (() => {
  if (process.platform !== 'linux' || process.env.DISPLAY) return false

  try {
    execFileSync('which', ['xvfb-run'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const command = hasVirtualDisplay ? 'xvfb-run' : 'electron-vite'
const args = hasVirtualDisplay ? ['-a', 'electron-vite', 'dev'] : ['dev']
const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env
})

child.on('error', (error) => {
  console.error(`[PeakFlow] Failed to start ${command}: ${error.message}`)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
