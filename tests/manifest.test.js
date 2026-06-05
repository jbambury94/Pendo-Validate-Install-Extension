import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'extension/manifest.json'), 'utf8'),
)

describe('manifest permissions', () => {
  it('declares the identity permissions needed to collect @pendo.io profile emails', () => {
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['identity', 'identity.email']),
    )
  })
})
