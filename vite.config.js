import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * A tiny local API so the app can refresh its own data. Runs inside the dev server —
 * there is no second process to start and nothing is exposed beyond localhost.
 *
 * Tasks are a fixed whitelist. The browser sends a task name, never arguments, so a
 * stray request can't turn this into a way to run arbitrary commands.
 */
const TASKS = {
  prices: ['scripts/riftbound_import.py', '--prices-only'],
  catalog: ['scripts/riftbound_import.py', '--cards-only'],
  images: ['scripts/riftbound_import.py', '--images-only'],
}

let running = null

function localApi() {
  return {
    name: 'riftbound-local-api',
    configureServer(server) {
      // Writes a public snapshot of the collection for the hosted build to read.
      // Data only — this endpoint runs nothing.
      server.middlewares.use('/api/publish', (req, res) => {
        const send = (code, body) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { error: 'POST only' })

        let raw = ''
        req.on('data', (c) => { raw += c })
        req.on('end', () => {
          try {
            const { quantities, decks, title } = JSON.parse(raw || '{}')
            if (!quantities || typeof quantities !== 'object') {
              return send(400, { error: 'Expected a quantities object' })
            }
            const doc = {
              format: 'riftbound-public',
              version: 1,
              generated: new Date().toISOString(),
              title: typeof title === 'string' ? title : '',
              quantities,
              decks: Array.isArray(decks) ? decks : [],
            }
            const path = resolve(process.cwd(), 'public', 'collection.json')
            writeFileSync(path, JSON.stringify(doc, null, 1))
            const owned = Object.values(quantities).filter((n) => n > 0).length
            send(200, { ok: true, output: `Wrote public/collection.json — ${owned} entries.` })
          } catch (e) {
            send(500, { error: `Could not write snapshot: ${e.message}` })
          }
        })
      })

      server.middlewares.use('/api/task', (req, res) => {
        const send = (code, body) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        if (req.method !== 'POST') return send(405, { error: 'POST only' })

        let raw = ''
        req.on('data', (c) => { raw += c })
        req.on('end', () => {
          let task
          try {
            task = JSON.parse(raw || '{}').task
          } catch {
            return send(400, { error: 'Body must be JSON' })
          }

          const args = TASKS[task]
          if (!args) return send(400, { error: `Unknown task: ${task}` })

          // One at a time. Two importers writing catalog.json at once would race,
          // and the whole point of the temp-file rename is to never be half-written.
          if (running) return send(409, { error: `Already running: ${running}` })
          running = task

          const py = spawn('python3', args, { cwd: process.cwd() })
          let out = ''
          const cap = (chunk) => {
            out += chunk
            if (out.length > 200_000) out = out.slice(-200_000)
          }
          py.stdout.on('data', cap)
          py.stderr.on('data', cap)

          py.on('error', (e) => {
            running = null
            send(500, { error: `Could not start python3: ${e.message}`, output: out })
          })
          py.on('close', (code) => {
            running = null
            send(code === 0 ? 200 : 500, {
              ok: code === 0,
              task,
              output: out.trim() || '(no output)',
              ...(code === 0 ? {} : { error: `Exited with code ${code}` }),
            })
          })
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: { port: 5180 },
  // GitHub Pages serves a project site from /<repo>/, so asset URLs need that prefix.
  // Set VITE_BASE in CI; locally it stays at the root.
  base: process.env.VITE_BASE || '/',
})
