import { describe, it, expect } from 'vitest'
import { deriveHeroState } from './helpers.js'

const baseResult = {
  status: { pendoPresent: true, validatePresent: true },
  captured: [],
  snippetOnPage: true,
  launcherPresent: undefined,
  launcherAttempted: false,
  launcherDataValidated: undefined,
  validatedIn: 'page',
}

describe('deriveHeroState', () => {
  it('returns err when snippet missing and launcher not present', () => {
    const res = { ...baseResult, snippetOnPage: false, launcherAttempted: true, launcherPresent: false }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('err')
    expect(hero.title).toBe('Install not detected')
    expect(hero.sub).toContain('Snippet and Pendo Launcher are both missing')
  })

  it('returns warn when launcher installed but no data validated', () => {
    const res = { ...baseResult, snippetOnPage: false, launcherPresent: true, launcherDataValidated: false }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('warn')
    expect(hero.title).toBe('Launcher installed')
    expect(hero.sub).toContain('No agent data on this tab')
  })

  it('returns err when pendoPresent is false', () => {
    const res = { ...baseResult, status: { pendoPresent: false, validatePresent: false } }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('err')
    expect(hero.title).toBe('Pendo not found')
    expect(hero.sub).toContain('window.pendo is missing')
  })

  it('returns warn when validatePresent is false', () => {
    const res = { ...baseResult, status: { pendoPresent: true, validatePresent: false } }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('warn')
    expect(hero.title).toBe('No validateInstall()')
    expect(hero.sub).toContain('validateInstall() helper is unavailable')
  })

  it('returns err with singular when 1 error in captured', () => {
    const res = { ...baseResult, captured: [{ level: 'error', text: 'fail' }] }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('err')
    expect(hero.title).toBe('1 error')
  })

  it('returns err with plural when multiple errors in captured', () => {
    const res = { ...baseResult, captured: [{ level: 'error', text: 'a' }, { level: 'error', text: 'b' }] }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('err')
    expect(hero.title).toBe('2 errors')
  })

  it('returns warn with singular when 1 warning in captured', () => {
    const res = { ...baseResult, captured: [{ level: 'warn', text: 'w' }] }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('warn')
    expect(hero.title).toBe('1 warning')
  })

  it('returns warn with plural when multiple warnings in captured', () => {
    const res = { ...baseResult, captured: [{ level: 'warn', text: 'a' }, { level: 'warn', text: 'b' }, { level: 'warn', text: 'c' }] }
    const hero = deriveHeroState(res)
    expect(hero.state).toBe('warn')
    expect(hero.title).toBe('3 warnings')
  })

  it('returns ok when all checks pass', () => {
    const hero = deriveHeroState(baseResult)
    expect(hero.state).toBe('ok')
    expect(hero.title).toBe('Install validated')
    expect(hero.sub).toContain('All checks passed')
  })

  it('appends "(via Pendo Launcher)" to sub for launcher origin', () => {
    const res = { ...baseResult, validatedIn: 'launcher' }
    const hero = deriveHeroState(res)
    expect(hero.sub).toContain('(via Pendo Launcher)')
  })

  it('appends "(via Pendo Launcher Beta)" to sub for launcher-beta origin', () => {
    const res = { ...baseResult, validatedIn: 'launcher-beta' }
    const hero = deriveHeroState(res)
    expect(hero.sub).toContain('(via Pendo Launcher Beta)')
  })
})
