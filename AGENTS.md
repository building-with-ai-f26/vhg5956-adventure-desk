# AGENTS.md — Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** [1–2 sentence summary]
- **Primary user & core workflow:** See the living PRD in `docs/index.html`.
- **Tech stack:** Python 3.12 standard library for the original prototype; Node.js 24 standard library and SQLite for geez-scout; local Ollama for scout inference; PostHog Capture API for anonymous product events.

## 2. Commands
- **Install dependencies:** `No dependency install required.`
- **Run locally:** `python prototype/app.py`
- **Run deterministic tests:** `python -m unittest discover -s prototype -p "test_*.py" -v`
- **Run model evals:** `No general model evaluation suite yet; use the UI for an optional local review.`

## 3. Non-Negotiable Engineering Rules
1. **Plan before coding:** Before touching multiple files, propose a brief plan and wait for approval.
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations; follow the selected Build 4 evaluation track.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop, summarize what failed, and ask the human before trying a third approach.

## Geez scouting module
- Run: `cd geez-scout`, `npm run models:register`, `npm start`. See its README for the pinned local-model prerequisite and `.env.example` for optional PostHog configuration.
- Verify: `cd geez-scout` then `npm test`. HTTP and actual-model checks have separately documented scopes.
- Product rule: never infer revenue/MRR from headcount, pricing, locations or industry. Preserve unknown sale status. Never send user text, credentials or research content in analytics.
- Publish source only. Exclude `.env`, state databases, raw logs, model weights and private installation receipts. A final DeepSeek revision is not an independently approved result.
