# Pendo Install Quality Guide

Definitions of a healthy Pendo installation, used by the validator to assess identity,
metadata, and environment configuration.

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
