# Build 3 security audit

## Application and storage

**Lane: Beginner.** Geez is a local-model AI app. A shared group password opens the desk, then a separate, opaque session credential scopes each visitor's jobs. The app does not issue individual accounts. The current desk uses Supabase Postgres on the free plan for jobs, worker state, visitor tickets, write limits and gateway configuration. RLS is enabled and forced on all five application tables. The group password verifier remains server-side configuration. The older desk and its historical session/data store use Cloudflare D1 with application-level checks. An already valid historical login can be read to restore the same session to the current desk. Legacy D1 has no native RLS.

The November 23 live release is Site version 22 from source commit 0011b09dcc97272b6dacc4d0016f2d349daf4c3f. It adds an elapsed-time cue to the waiting view. The browser calls only the Site for application operations. The database gateway requires a separate server-side proof. Supabase's publishable key alone cannot read or change private job rows. Vic-PC claims jobs over authenticated outbound HTTPS. The local Node server and Ollama both listen on loopback. Hosted inputs and results transit the Site and the queue, and only inference stays on Vic-PC. There is no cloud model fallback.

## Tests on November 22, 2026

| Check | Observed result |
| --- | --- |
| Public session isolation | Session A started a real thesis run from the public desk. A separately signed-in temporary Session B received HTTP 404 when requesting that same job. B's saved-run list omitted it. A repeat on the Supabase-authenticated release gave the same denial for the in-progress scout. Revoked access returned 401 after sign-out. This is session isolation behind the group gate, not a test of two individual user accounts. |
| Supabase RLS | SQL catalog checks showed RLS enabled and forced on config, jobs, workers, visitor sessions and visitor limits. The anonymous role had neither INSERT nor DELETE on any of them. A live request with the publishable key alone received HTTP 401 when attempting a blank test insert or trying to modify that test row. An authorized but different session received no row. |
| Live client key patterns | Scanned the new desk HTML, app JS, state JS, analytics JS and CSS. The required private-key patterns and internal worker/group binding names did not match. The PostHog `phc_` project token is public browser configuration. |
| Tracked source | Scanned both the class source and corresponding Site source for `sb_secret_`, `service_role`, `sk-or-`, `sk-ant-`, `sk-proj-`, and `sk_live_`. The initial scan found no matches in code. This audit intentionally lists those pattern strings. |
| Local execution | A real thesis turn returned a draft and reply from DeepSeek, Gemma and DeepSeek. All three calls completed on the pinned CPU models. Total model time was approximately 23 minutes. |
| Public execution | The public browser submitted a nonblank thesis. Vic-PC loaded the exact DeepSeek pin, then the Gemma pin, then DeepSeek again. The three real calls finished in 24.9 minutes of model time and returned a proposal and reply to the browser. The working thesis applied the draft only when accepted. The advertised-listing scout completed on Vic-PC with ten real local model calls in 59.7 minutes of model time. Two source-backed cards appeared automatically in the browser. Four displayed excerpts matched the locally admitted broker evidence. |
| Analytics and recording | PostHog accepted a live QA pageview. The live replay script responded, advertised input masking and private-region blocking, and the desk displayed the opt-in recording state. The 25:43 recording for the public desk was received and rendered in PostHog. The synthetic thesis prompt was absent from the rendered view checked. |
| Backup | Exported a private logical JSON snapshot of all five Supabase application tables. The checked-in migration describes the schema. No restore rehearsal was performed. The older D1 records were outside this export. |
| Dependencies | The deployed production dependency scan showed zero high or critical findings after patching. The subsequent deployed update patched the development dependencies and the locked React server component. The full lockfile audit showed zero high or critical findings. The 72 focused Site checks and a build passed with the updated dependencies. A separate npm audit of the shipped local runtime manifest reported zero findings. |
| Regressions | Focused tests cover queue authorization, distinct-session reads, retries, worker claims, cancellation, lease progress and late completion. Local source, model process and analytics checks also passed. |

## Findings and fixes

- The old Site depended on a disconnected worker and a different model contract. The latest Site uses a separately scoped worker credential, lease renewal, idempotent enqueueing, visible offline status and the pinned local DeepSeek, Gemma and DeepSeek sequence.
- One diagnostic printed the previous worker-only credential in tool output. The worker and database proof were rotated. The old credential was rejected for new work, and the limited lease permission was removed after the scout returned. The replacement worker is running.
- The hosting runtime rejected the initial redirect setting for outbound requests. The fix uses manual redirect handling and rejects non-success responses, so credentials are never sent to redirected destinations.
- New production requests are limited per visitor and per session. Supabase checks service-only access and hashes opaque visitor tickets. An expired or revoked ticket does not get access to its session. Queue capacity is bounded and a worker can lease only one model job at a time. No paid AI provider or file-bucket integration is configured. The estimated marginal operating cost is $0.01 per run, with $0 in model API fees and no metered electricity estimate.

## Class feedback

Vic reports that a classmate used Geez during Tuesday’s class and pointed out bugs. This build addresses the public worker connection and workflow problems found during that testing. The earlier test’s device and completion of the full workflow have not been confirmed.

## November 23 live testing

November 23 morning check: Duncan emailed at 9:40 AM Eastern that he was running a thesis. An anonymous research run began at 9:39:51 and reached the pinned local models. The timing is consistent with his test. He has not yet reported a result, device, or completed phone workflow.

## Open verification

A classmate still needs to complete the core workflow on a phone. Disclose the separate legacy D1 area and shared group gate, and preserve the actual November 22 and November 23 commit evidence. Icerynk has a draft with the required link, note and live isolation image, and shows that it has not been submitted.
