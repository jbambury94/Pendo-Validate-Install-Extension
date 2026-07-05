# Pendo Install Quality Guide

Definitions of a healthy Pendo installation, used by the validator to assess identity,
metadata, and environment configuration.

## What a healthy install looks like

A fully healthy Pendo install shows all of the following together:

- **Pendo present and initialized.** `window.pendo` exists and `pendo.validateInstall()` runs without errors or warnings.
- **Current agent.** The Web SDK version is recent; very old agents miss features and fixes.
- **Stable identity.** A stable, authenticated Visitor ID and (for multi-tenant apps) an Account ID — not placeholders, and not identical to each other.
- **Enrichment metadata.** At least one meaningful visitor field (e.g. email, name, role) and, when accounts are used, at least one account field (e.g. name, plan).
- **Data flowing.** Network calls to `data.pendo.io` are observed (resource hits present), so events and guide data are being exchanged.
- **No CSP or network blocks.** No console errors about blocked Pendo domains; the required domains are allowlisted.
- **Production data kept clean.** Staging/dev traffic uses prefixed IDs and an Exclude List so it does not pollute production analytics.

To confirm interactively, run `pendo.validateInstall()`, `pendo.getVisitorId()`, and
`pendo.getAccountId()` in the browser console on an authenticated page.

## Visitor ID

**Good:** A stable, unique identifier assigned after user authentication (e.g. database
primary key, email address, or SSO subject). Persists across sessions for the same user.

**Weak / Flag:**
- Placeholder values: `anonymous`, `guest`, `unknown`, `undefined`, `null`, `0`, `test`, `demo`, `user`, `visitor`
- Very short values (fewer than 3 characters)
- Numeric-only values under 100 (often row counters or test data)
- Matches the accountId exactly (common misconfiguration)

**Note:** Email addresses are valid Pendo visitor IDs and should not be flagged.

## Account ID

**Good:** An organisation-level stable identifier (e.g. company UUID, Salesforce account ID,
or tenant slug). Set when the application uses multi-tenant accounts.

**Weak / Flag:**
- Same placeholder values as visitor ID
- Identical to the visitor ID (likely a copy-paste error)
- Not set when the application clearly uses accounts (detected via visitor metadata
  containing `company` or `org` fields)

## Visitor Metadata

**Good:** At least one enrichment field beyond `id`:
- `email` or `full_name` / `fullName` / `name` (for user identification)
- `role` or `title` (for segmentation)
- `createdAt` or `signUpDate` (for cohort analysis)

**Flag:**
- Visitor ID is present but zero non-`id` metadata fields are passed
- None of the recommended fields (`email`, `name`/`fullName`/`full_name`, `role`/`title`) are present

## Account Metadata

**Good:** At least one enrichment field beyond `id`:
- `name` (company display name)
- `plan` or `tier` (subscription level)
- `industry` or `vertical`
- `employeeCount` or `arr`

**Flag:**
- Account ID is set but zero non-`id` account metadata fields are passed
- None of the recommended fields (`name`, `plan`/`tier`) are present

## Environment

**Good:** Production identifiers on production URLs. Staging/dev environments use
prefixed IDs (e.g. `staging_user123`) and are added to the Pendo Exclude List.

**Flag:**
- URL matches staging/dev patterns (`staging.`, `dev.`, `qa.`, `localhost`, `preview.`)
  but IDs lack a recognisable test prefix (`dev_`, `staging_`, `test_`, `qa_`)
- This risks polluting production analytics with test data
