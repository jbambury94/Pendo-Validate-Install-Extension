import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Static guardrails on the Pendo self-instrumentation entry. This source is bundled by esbuild
// into extension/vendor/pendo-agent.bundle.js; we assert on the source text rather than importing
// it so the suite doesn't pull in the ~600KB @pendo/web-sdk agent.
const entrySrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pendo-agent-entry.js'),
  'utf8',
)

describe('pendo-agent-entry (self-instrumentation)', () => {
  it('imports the officially supported @pendo/web-sdk package', () => {
    expect(entrySrc).toMatch(/from ['"]@pendo\/web-sdk['"]/)
  })

  it('self-hosts assets and disables remote code (MV3 compliance)', () => {
    // localOnly: true → the SDK sets preventCodeInjection, so no remotely-hosted code loads.
    expect(entrySrc).toMatch(/localOnly:\s*true/)
    // Assets are served from the extension origin, not a CDN.
    expect(entrySrc).toMatch(/chrome\.runtime\.getURL/)
    expect(entrySrc).toMatch(/path:\s*['"]pendo['"]/)
  })

  it('targets the EU self-instrumentation subscription', () => {
    expect(entrySrc).toMatch(/PENDO_ENV\s*=\s*['"]eu['"]/)
    expect(entrySrc).toContain('928b3d0d-8a3b-48b1-bf35-a6af3565dcc5')
  })

  it('exposes the agent as window.pendo for popup.js', () => {
    expect(entrySrc).toMatch(/globalKey:\s*['"]pendo['"]/)
  })

  it('catches initialize failures so telemetry never leaks unhandled rejections', () => {
    expect(entrySrc).toMatch(/function runStartPendo\(\)/)
    expect(entrySrc).toMatch(/startPendo\(\)\.catch\(/)
    expect(entrySrc).toMatch(/runStartPendo\(\)/)
  })
})

describe('popup.html Pendo load order', () => {
  const popupHtml = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'popup.html'),
    'utf8',
  )

  it('does not synchronously load the agent bundle in head', () => {
    const head = popupHtml.match(/<head>[\s\S]*?<\/head>/i)?.[0] ?? ''
    expect(head).not.toMatch(/pendo-agent\.bundle\.js/)
  })

  it('idle-loads the agent bundle after popup.js', () => {
    expect(popupHtml).toMatch(/<script src="popup\.js"><\/script>[\s\S]*<script src="pendo-agent-loader\.js"><\/script>/)
  })
})
