# AGENTS.md

Project instructions for agents working in this repo.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` (local markdown, no external tracker). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded on the `Status:` line of each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root, decisions as ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Secrets and personal data

This repository is intended to become public. Treat every file as publishable.

- Never write real credentials, tokens, internal hostnames, or personal details (real names, employer, employment status, personal contact info) into code, docs, comments, tests, fixtures, commit messages, or issue files. Use placeholders and fictional personas.
- Configuration comes from environment variables only. `.env` is gitignored; `.env.example` is the single, committed inventory of settings and must contain placeholders only.
- Only variables prefixed `VITE_` reach the browser bundle — treat them as public. `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `BUILD_EXPORT_TOKEN`, database passwords, and the seeded admin password must never appear in frontend code, `packages/shared`, or any build output.
- Validate required environment variables at startup and fail fast. Never fall back to a hardcoded default secret.
- Never log or return full tokens, passwords, cookies, or connection strings (including in error responses and export snapshots).
- Before committing, scan the diff: no newly added long random strings, no `.env` files, no uploads or database dumps. If a secret does get committed, rotate it and rewrite history — deleting the file in a later commit is not enough.
