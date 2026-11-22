# AGENTS.md — Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** Adventure Desk helps an acquisition researcher develop a thesis, run local-model scouting and inspect source-backed leads. The original next-action prototype remains available.
- **Primary user & core workflow:** See the living PRD in `docs/index.html`.
- **Tech stack:** Python 3.12 standard library for the original prototype; Node.js 24 standard library and SQLite for geez-scout; local Ollama for scout inference; ChatGPT Sites with a Supabase queue for the public desk; PostHog Capture API for anonymous product events.

## 2. Commands
- **Install dependencies:** `No dependency install required.`
- **Run locally:** `python prototype/app.py`
- **Run deterministic tests:** `python -m unittest discover -s prototype -p "test_*.py" -v`
- **Run model evals:** `No general model evaluation suite yet; use the UI for an optional local review.`

## 3. Non-Negotiable Engineering Rules
1. **Plan before coding:** Before touching multiple files, propose a brief plan and wait for approval.
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations; follow the selected Build 3 verification lane.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop, summarize what failed, and ask the human before trying a third approach.

## Geez scouting module
- Run: `cd geez-scout`, `npm run models:register`, `npm start`. See its README for the pinned local-model prerequisite and `.env.example` for optional PostHog configuration.
- Verify: `cd geez-scout` then `npm test`. HTTP and actual-model checks have separately documented scopes.
- Product rule: never infer revenue/MRR from headcount, pricing, locations or industry. Preserve unknown sale status. Never send user text, credentials or research content in analytics.
- Publish source only. Exclude `.env`, state databases, raw logs, model weights and private installation receipts. A final DeepSeek revision is not an independently approved result.

## Project structure
- `docs/`: public Product Page, PRD v3, build log, public-page analytics and evidence screenshots.
- `geez-scout/demo/`: browser UI and loopback-only Node server.
- `geez-scout/research/`: source admission, local model pins, thesis/scout workflow, VQA guidance and analytics/replay boundaries.
- `geez-scout/lib/geez/` and `geez-scout/drizzle/`: session/auth helpers and SQLite schema.
- `geez-scout/scripts/`: verify/register existing pinned local models; no automatic download.
- `geez-scout/tests/`: focused deterministic regression checks.
- `prototype/`: preserved earlier Python next-action app.
- PostHog browser project tokens are intentionally public; private personal API keys and local environment files must never be committed. Replay is opt-in, inputs are masked and private dynamic regions are blocked.


## Shipping

1. Verify both pinned Ollama tags and local registrations from `geez-scout`. Run `npm test` and start the loopback app with `node demo/start-scouting.mjs`. Check `/api/health` for `scouting_pivot_v1`.
2. Open the existing Geez Group Site source through the Sites workflow. Preserve its project ID, public audience, and existing group password. Use the source-only browser files, the scoped outbound worker protocol, and the checked-in Supabase migration. For a fresh database, replace the verifier marker through private deployment configuration before applying the migration. Back up the target database before production schema changes and verify RLS on all application tables after migration.
3. Set Site runtime configuration for the Supabase project origin and publishable key, the server-side worker verifier, and PostHog. Keep raw worker credentials in encrypted local storage. Launch the Node worker on Vic-PC, sending its credential through standard input. Never expose either loopback port or put a secret in Git, browser code, screenshots, or command arguments.
4. Run the Site's deterministic tests and dependency audit. Build, package, push and deploy the exact source revision through Sites. Verify the public URL, worker heartbeat, one real public thesis run, isolation from a second session, and PostHog capture and opt-in replay. Record the classmate's phone test separately. A reachable host and a healthy Ollama process are separate checks. A run counts only when the public request reaches the PC and the result returns to the same visitor.
5. Submit from Icerynk only after checking the public URL and the evidence. Include the class repo, Beginner lane, SECURITY.md and an applicable security test image. Verify the submission receipt.

## Ask me first

- Deleting records, running destructive commands, or changing production database schema or permissions.
- Creating, rotating, or changing keys, secrets, sign-in, or sharing permissions.
- Anything that costs money or changes the free plan or billing setup.
