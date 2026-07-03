import { describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BUNDLE = join(ROOT, 'extension', 'vendor', 'pendo-agent.bundle.js')
const PENDO_DIR = join(ROOT, 'extension', 'pendo')

function hashAgentOutputs() {
  const parts = [createHash('sha256').update(readFileSync(BUNDLE)).digest('hex')]

  for (const name of readdirSync(PENDO_DIR).sort()) {
    const path = join(PENDO_DIR, name)
    if (statSync(path).isFile()) {
      parts.push(createHash('sha256').update(readFileSync(path)).digest('hex'))
    }
  }

  return parts.join(':')
}

describe('pendo-agent bundle freshness', () => {
  it('committed agent outputs match a fresh npm run build:agent', () => {
    const before = hashAgentOutputs()
    execSync('npm run build:agent', { cwd: ROOT, stdio: 'pipe' })
    const after = hashAgentOutputs()

    if (before !== after) {
      throw new Error(
        'Committed Pendo agent outputs are stale. Run `npm run build:agent` and commit the result.',
      )
    }
  })
})
