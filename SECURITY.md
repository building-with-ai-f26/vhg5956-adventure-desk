# Build 3 security audit

## Application and scope

**Lane:** Beginner. Geez is an AI app with a shared group gate and individual session credentials. These are separate sessions behind a common password. Individual accounts have not been implemented. The public deployment uses ChatGPT Sites and Cloudflare D1. D1 access checks are implemented in application code. The course requires a database with native row-level security for saved data, which this deployment does not meet.

## Checks on November 22, 2026

| Check | Observed result |
| --- | --- |
| Public endpoint | The main page returned HTTP 200. Its worker heartbeat endpoint returned HTTP 401 and “Worker authorization required” for an unauthenticated request. |
| Public browser workflow | The existing Site displayed the earlier workflow and reported that Vic-PC was offline or the worker was disconnected. Public inference was unverified. |
| Public browser assets | Scanned the HTML and six linked first-party assets. No matches for the listed private-key patterns or worker/group secret binding names. |
| Tracked source | Scanned the class checkout and the public Site's synced source commit for `sb_secret_`, `service_role`, `sk-or-`, `sk-ant-`, `sk-proj-`, and `sk_live_`. No matches. The PostHog `phc_` project token is browser configuration. |
| Local session isolation | Session A created a thesis job. Session B could sign in and open a distinct session. A direct request for A's job returned HTTP 404 to B, and B's list omitted the job. This is local evidence. |
| Local model launch | A thesis request through the latest Node app was accepted. Ollama reported `geez-scout-deepseek14:latest` loaded with the configured digest. The job was still running at the check. |
| Focused checks | 22 deterministic tests passed in the class checkout for the three-stage model workflow, source admission, analytics payloads, replay privacy, and thesis context. |

## Findings and remaining work

The deployed legacy worker expects a different model contract and uses a ten-minute review deadline. A restored heartbeat on that version would leave the latest DeepSeek, Gemma, and DeepSeek workflow unshipped. The shared gate plus separate session credentials also requires an explicit live isolation test. The production worker credential is unavailable to the local bridge.

No production fixes are recorded here. The new queue and worker, native row-level security, backup, public isolation evidence, rate-limit coverage, hosted dependency audit, live PostHog and replay, and classmate phone verification remain outstanding. Do not reuse the local session check as the live audit screenshot.

Local Ollama inference has no paid model API account. Runtime inference fees are zero per call. Electricity and hardware costs were not metered. The estimated marginal operating cost supplied for the class log is $0.01 per run.
