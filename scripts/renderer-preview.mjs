import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const rendererRoot = resolve(projectRoot, 'src/renderer')

const server = await createServer({
  root: rendererRoot,
  base: '/',
  host: '0.0.0.0',
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    strictPort: false
  },
  resolve: {
    alias: {
      '@renderer': resolve(rendererRoot, 'src'),
      '@shared': resolve(projectRoot, 'src/shared')
    }
  },
  plugins: [react(), tailwindcss()]
})

await server.listen()
server.printUrls()
console.log('[PeakFlow] Renderer preview is ready')

process.once('SIGTERM', () => server.close())
process.once('SIGINT', () => server.close())
