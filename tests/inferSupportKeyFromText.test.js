import { describe, it, expect } from 'vitest'
import { inferSupportKeyFromText } from './helpers.js'

describe('inferSupportKeyFromText', () => {
  it('returns null for empty/null input', () => {
    expect(inferSupportKeyFromText('')).toBeNull()
    expect(inferSupportKeyFromText(null)).toBeNull()
    expect(inferSupportKeyFromText(undefined)).toBeNull()
  })

  it('matches "no matching api key" → installComponents', () => {
    expect(inferSupportKeyFromText('no matching api key found')).toBe('installComponents')
  })

  it('matches "api key" → installComponents', () => {
    expect(inferSupportKeyFromText('Check your API key is correct')).toBe('installComponents')
  })

  it('matches VISITOR_UNIQUE_ID → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('VISITOR-UNIQUE-ID placeholder detected')).toBe('chooseIdsMetadata')
  })

  it('matches "treated as anonymous" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('visitor treated as anonymous')).toBe('chooseIdsMetadata')
  })

  it('matches "not identified" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('user is not identified')).toBe('chooseIdsMetadata')
  })

  it('matches "not associated with an account" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('visitor is not associated with an account')).toBe('chooseIdsMetadata')
  })

  it('matches "accountId is not set" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('accountId is not set')).toBe('chooseIdsMetadata')
  })

  it('matches "account not found" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('account not found for this visitor')).toBe('chooseIdsMetadata')
  })

  it('matches "no account metadata" → configureMetadata', () => {
    expect(inferSupportKeyFromText('no account metadata fields sent')).toBe('configureMetadata')
  })

  it('matches "no visitor metadata" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('no visitor metadata detected')).toBe('chooseIdsMetadata')
  })

  it('matches "visitor metadata fields" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('visitor metadata fields are empty')).toBe('chooseIdsMetadata')
  })

  it('matches "metadata field" → chooseIdsMetadata', () => {
    expect(inferSupportKeyFromText('Add a metadata field for email')).toBe('chooseIdsMetadata')
  })

  it('matches "jwt" → signedMetadata', () => {
    expect(inferSupportKeyFromText('Use JWT for signed metadata')).toBe('signedMetadata')
  })

  it('matches "signed metadata" → signedMetadata', () => {
    expect(inferSupportKeyFromText('Enable signed metadata for security')).toBe('signedMetadata')
  })

  it('matches "content security policy" → csp', () => {
    expect(inferSupportKeyFromText('Content Security Policy is blocking requests')).toBe('csp')
  })

  it('matches "csp" abbreviation → csp', () => {
    expect(inferSupportKeyFromText('CSP header missing pendo.io')).toBe('csp')
  })

  it('matches "refused to connect.*pendo" → csp', () => {
    expect(inferSupportKeyFromText("refused to connect to 'https://data.pendo.io'")).toBe('csp')
  })

  it('matches "blocked by csp" → csp', () => {
    expect(inferSupportKeyFromText('Request blocked by CSP')).toBe('csp')
  })

  it('matches "iframe" → iframe', () => {
    expect(inferSupportKeyFromText('Pendo snippet inside an iframe')).toBe('iframe')
  })

  it('matches "frame-src" → iframe (when CSP keyword is absent)', () => {
    expect(inferSupportKeyFromText('frame-src directive missing')).toBe('iframe')
  })

  it('matches "child frame" → iframe', () => {
    expect(inferSupportKeyFromText('content loaded in a child frame')).toBe('iframe')
  })

  it('matches "single-page" → spa', () => {
    expect(inferSupportKeyFromText('single-page application install')).toBe('spa')
  })

  it('matches "spa" → spa', () => {
    expect(inferSupportKeyFromText('SPA route tracking')).toBe('spa')
  })

  it('matches "route change" → spa', () => {
    expect(inferSupportKeyFromText('route change not tracked by Pendo')).toBe('spa')
  })

  it('matches "router" → spa', () => {
    expect(inferSupportKeyFromText('React router integration')).toBe('spa')
  })

  it('matches "google tag manager" → gtm', () => {
    expect(inferSupportKeyFromText('installed via Google Tag Manager')).toBe('gtm')
  })

  it('matches "gtm" abbreviation → gtm', () => {
    expect(inferSupportKeyFromText('GTM custom HTML tag not firing')).toBe('gtm')
  })

  it('matches "segment" → segment', () => {
    expect(inferSupportKeyFromText('Twilio Segment integration')).toBe('segment')
  })

  it('matches "twilio" → segment', () => {
    expect(inferSupportKeyFromText('Twilio sources not configured')).toBe('segment')
  })

  it('matches "staging" → sandbox', () => {
    expect(inferSupportKeyFromText('staging environment detected')).toBe('sandbox')
  })

  it('matches "sandbox" → sandbox', () => {
    expect(inferSupportKeyFromText('sandbox data polluting production')).toBe('sandbox')
  })

  it('matches "dev environment" → sandbox', () => {
    expect(inferSupportKeyFromText('dev environment should be excluded')).toBe('sandbox')
  })

  it('matches "test environment" → sandbox', () => {
    expect(inferSupportKeyFromText('test environment traffic')).toBe('sandbox')
  })

  it('matches "exclude list" → sandbox', () => {
    expect(inferSupportKeyFromText('configure an exclude list for test pages')).toBe('sandbox')
  })

  it('matches "pendo.enableDebugging" → agentDebug', () => {
    expect(inferSupportKeyFromText('call pendo.enableDebugging() first')).toBe('agentDebug')
  })

  it('matches "sdk debugger" → agentDebug', () => {
    expect(inferSupportKeyFromText('Open the SDK debugger')).toBe('agentDebug')
  })

  it('matches "debugging" → agentDebug', () => {
    expect(inferSupportKeyFromText('Enable debugging mode')).toBe('agentDebug')
  })

  it('matches "pendo is not defined" → troubleshooting', () => {
    expect(inferSupportKeyFromText('ReferenceError: pendo is not defined')).toBe('troubleshooting')
  })

  it('matches "pendo.validateInstall is not a function" → troubleshooting', () => {
    expect(inferSupportKeyFromText('pendo.validateInstall is not a function')).toBe('troubleshooting')
  })

  it('matches "isn\'t displaying" → troubleshooting', () => {
    expect(inferSupportKeyFromText("Pendo isn't displaying on my site")).toBe('troubleshooting')
  })

  it('matches "pendo.initialize" → installGuide', () => {
    expect(inferSupportKeyFromText('call pendo.initialize after auth')).toBe('installGuide')
  })

  it('matches "initialize() was not called" → installGuide', () => {
    expect(inferSupportKeyFromText('initialize() was not called')).toBe('installGuide')
  })

  it('matches "initialize is not called" → installGuide', () => {
    expect(inferSupportKeyFromText('initialize is not called before page load')).toBe('installGuide')
  })

  it('matches "agent version" → agentSettings', () => {
    expect(inferSupportKeyFromText('agent version is outdated')).toBe('agentSettings')
  })

  it('matches "outdated agent" → agentSettings', () => {
    expect(inferSupportKeyFromText('outdated agent detected')).toBe('agentSettings')
  })

  it('matches "update.*agent" → agentSettings', () => {
    expect(inferSupportKeyFromText('please update your agent to v2.3')).toBe('agentSettings')
  })

  it('matches "launcher" → launcherPlan', () => {
    expect(inferSupportKeyFromText('Pendo Launcher extension is installed')).toBe('launcherPlan')
  })

  it('matches "firewall" → hostnameAllowlist', () => {
    expect(inferSupportKeyFromText('firewall blocking requests to Pendo')).toBe('hostnameAllowlist')
  })

  it('matches "allowlist" → hostnameAllowlist', () => {
    expect(inferSupportKeyFromText('add to the allowlist')).toBe('hostnameAllowlist')
  })

  it('matches "whitelist" → hostnameAllowlist', () => {
    expect(inferSupportKeyFromText('whitelist Pendo domains')).toBe('hostnameAllowlist')
  })

  it('matches "hostname" → hostnameAllowlist', () => {
    expect(inferSupportKeyFromText('hostname not in allowed list')).toBe('hostnameAllowlist')
  })

  it('matches "multi-domain" → multiDomain', () => {
    expect(inferSupportKeyFromText('multi-domain Pendo setup')).toBe('multiDomain')
  })

  it('matches "subdomain" → multiDomain', () => {
    expect(inferSupportKeyFromText('subdomain tracking configuration')).toBe('multiDomain')
  })

  it('returns null for unrelated text', () => {
    expect(inferSupportKeyFromText('Everything looks great')).toBeNull()
    expect(inferSupportKeyFromText('Pendo is running fine')).toBeNull()
  })

  it('matches earliest rule when multiple could match', () => {
    expect(inferSupportKeyFromText('no matching api key in CSP header')).toBe('installComponents')
  })
})
