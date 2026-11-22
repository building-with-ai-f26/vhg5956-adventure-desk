# Build 3 security audit

## Application and storage

**Lane: Beginner.** Geez is a local-model AI app. A shared group password opens the desk, then a separate, opaque session credential scopes each visitor's jobs. The app does not issue individual accounts. The latest thesis and scouting queue uses Supabase Postgres on the free plan. RLS is enabled and forced on all three application tables. The active group gate and saved-session credentials still use Cloudflare D1, along with the older desk. D1 is scoped in application code. The legacy and authentication tables therefore remain a gap against the rubric's native-RLS requirement for every table that stores data.

The browser calls only the Site for application operations. The database gateway requires a separate server-side proof. Supabase's publishable key alone cannot read or change private job rows. Vic-PC claims jobs over authenticated outbound HTTPS. The local Node server and Ollama both listen on loopback. Hosted inputs and results transit the Site and the queue, and only inference stays on Vic-PC. There is no cloud model fallback.

## Tests on November 22, 2026

| Check | Observed result |
| --- | --- |
| Public session isolation | Session A started a real thesis run from the public desk. A separately signed-in temporary Session B received HTTP 404 when requesting that same job. B's saved-run list omitted it. This is session isolation behind the group gate, not a test of two individual user accounts. |
| Supabase RLS | SQL catalog checks showed RLS enabled and forced on config, jobs, and workers. The anonymous role had neither INSERT nor DELETE on any of those tables. A live request with the publishable key alone received HTTP 401 when attempting a blank test insert or trying to modify that test row. An authorized but different session received no row. |
| Live client key patterns | Scanned the new desk HTML, app JS, state JS, analytics JS and CSS. The required private-key patterns and internal worker/group binding names did not match. The PostHog `phc_` project token is public browser configuration. |
| Tracked source | Scanned both the class source and corresponding Site source for `sb_secret_`, `service_role`, `sk-or-`, `sk-ant-`, `sk-proj-`, and `sk_live_`. The initial scan found no matches in code. This audit intentionally lists those pattern strings. |
| Local execution | A real thesis turn returned a draft and reply from DeepSeek, Gemma and DeepSeek. All three calls completed on the pinned CPU models. Total model time was approximately 23 minutes. |
| Public execution | The latest Site signed in, showed Vic-PC connected and accepted a nonblank request. Ollama on Vic-PC reported the exact pinned DeepSeek tag loaded. The public job was still in progress at this checkpoint. |
| Analytics and recording | PostHog accepted a live QA pageview. The live replay script responded, advertised input masking and private-region blocking, and the desk displayed the opt-in recording state. A received dashboard replay has not been viewed. |
| Backup | Exported a private logical JSON snapshot of all three Supabase application tables. The checked-in migration describes the schema. No restore rehearsal was performed. The older D1 records were outside this export. |
| Dependencies | The deployed production dependency scan showed zero high or critical findings after patching. A further staging-only pass updated the development dependencies and the locked React server component. Its full audit also showed zero high or critical findings. |
| Regressions | Focused tests cover queue authorization, distinct-session reads, retries, worker claims, cancellation, lease progress and late completion. Local source, model process and analytics checks also passed. |

## Findings and fixes

- The old Site depended on a disconnected worker and a different model contract. The latest Site uses a separately scoped worker credential, lease renewal, idempotent enqueueing, visible offline status and the pinned local DeepSeek, Gemma and DeepSeek sequence.
- The hosting runtime rejected the initial redirect setting for outbound requests. The fix uses manual redirect handling and rejects non-success responses, so credentials are never sent to redirected destinations.
- New production requests are limited per visitor and per session. Queue capacity is bounded and a worker can lease only one model job at a time. No paid AI provider or file-bucket integration is configured. The estimated marginal operating cost is $0.01 per run, with $0 in model API fees and no metered electricity estimate.

## Open verification

Finish the real public thesis run and test the classmate's phone through the complete core workflow. Verify the replay in PostHog, resolve or disclose the remaining D1 and shared-gate rubric gap, and record work on a second actual day before claiming completion. No assignment submission is recorded here.
