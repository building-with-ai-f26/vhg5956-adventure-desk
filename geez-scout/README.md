# Geez: local company scouting prototype

This is the new investment-scouting module for Adventure Desk. The earlier Python next-action prototype remains available in `../prototype`. This module develops an editable thesis and reads public company websites and broker advertisements. It runs on localhost; the GitHub Product Page is a showcase, not a hosted AI application.

## Run on the configured development computer

Requires Node.js 24+, an existing local Ollama service on port 11434, and the two pinned, preinstalled model profiles in `research/scout-local-models.mjs`: DeepSeek 14.8B and Gemma 11.9B. It does not download models or select a smaller/cloud fallback. Other computers need matching model setup; this is not a one-click portable installer.

```sh
cd geez-scout
npm run models:register
npm start
```

Open http://127.0.0.1:8792 and use the public local demonstration password `Geez-demo-2026`. Set `GEEZ_DEMO_PASSWORD` in the environment for a different local password. Stop with Ctrl+C. If the port is occupied, stop your earlier instance explicitly or set `PORT=8794` before starting. Do not expose the server to the internet.

Every investor field is optional. Write a working thesis directly or develop one in chat, review the proposal, select **Use this thesis**, then **Research this thesis**. Research never starts automatically. Completed and failed requests remain in the local session's saved runs. Blank input offers guidance without inference or web requests.

DeepSeek works, Gemma gives diagnostic VQA feedback on its saved initial work, then DeepSeek revises. Both receive distinct saved VQA instruction files. This is runtime guidance, not weight training. The final revision has not been independently rechecked. Models run sequentially on CPU; the demonstrated full scouting run took substantially longer than an ordinary web request. No artificial speed claim is made.

## PostHog

Copy `.env.example` to `.env` and enter your **PostHog project token** and US/EU ingestion host. Do not use a personal API key. The app loads this local file at startup. This computer's existing project is configured privately; the configuration is deliberately excluded from GitHub.

The app uses PostHog's official Capture API through a same-origin server endpoint. Explicit events cover `desk_opened`, `thesis_started`, `thesis_completed`, `thesis_accepted`, `research_started`, `research_completed`, `research_failed`, `results_viewed`, and `source_opened`. Suggested research funnel: desk opened → research started → research completed → results viewed → source opened. Filter `onboarding=true` out of completed-run quality analysis; blank requests are not generated research. `qa_run=true` identifies explicit HTTP verification events. Local manual testing is not evidence of customer adoption.

Only an anonymous analytics UUID, fixed app/build labels, result/model-call counts and onboarding/QA flags are sent. No thesis, notes, credentials, company names, research excerpts, source URLs, free-text errors, DOM content or session recordings are captured. IP geolocation/person-profile processing are disabled. Analytics failure does not replace or block research. With no project token, analytics is disabled. Verified delivery occurred on the capped free plan; no payment method or paid plan was added.

## Evidence and current limits

- 20 focused source, workflow, context and analytics checks pass: `npm test`.
- 16 actual release-copy HTTP checks passed, including sign-in, session isolation, blank-input flows and a real PostHog event. Chrome confirmed optional inputs and received events in PostHog's Activity stream.
- One actual mixed-source scouting run completed with 11 calls to the pinned local models, two public search queries, 60 broker titles and three fetched company-site prospects. All 59 mechanical provenance/workflow assertions passed. Two prospects had useful B2B electronics-wholesale descriptions. The third had fragmented quotes; paragraph-preserving extraction and a focused regression check fixed that parser defect. No full model rerun of that fix is claimed.
- Gemma identified unsupported operating-size clues in DeepSeek's initial selections. DeepSeek removed them in its final revision. Revenue/MRR and company willingness to sell remained unknown. Website descriptions and company identity were not independently verified.
- Results remain uneven. Full nonblank browser chat-to-research integration, broad sector coverage and the original exhaustive QA plan are not qualified. The user explicitly chose a functional weekly prototype and deferred result tuning. There is no measured “4/10” accuracy claim.

Coverage is a bounded public search and one broker office, mainly Upper Midwest listings. Operating-company prospects have unknown sale status; advertisements have unconfirmed availability. Financial size stays unverified. Any explicitly broker-reported financial figure retains its exact source label and reporting-period limitation; no revenue/MRR estimates are inferred from operating clues. Source statements are not investment diligence.

Risk narratives, outreach, financial underwriting, automatic lesson promotion, the bulk experimental skill library, AirLLM full-answer execution and FlashAttention acceleration are outside this active baseline. Older support modules are retained as development source, not advertised as qualified features. Only `demo/start-scouting.mjs` is the product entry point.

Runtime databases, weights, private installation receipts, model/source logs and local `.env` are excluded. The registration command creates fresh local model metadata without publishing an existing private receipt.
