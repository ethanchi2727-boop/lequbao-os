# Controlled pre-production performance acceptance

This runbook produces the required evidence for `PERF-001` and `PERF-002`. It must run only against a disposable or controlled pre-production environment with production-shaped topology and data volume. The harness rejects production-shaped targets and never writes credentials into its report.

## Preconditions

- Deploy the exact release-candidate commit to `controlled-preproduction` or `staging`.
- Prepare a dedicated performance tenant, an active customer-service conversation and a bounded core-write fixture. Do not use customer or production data.
- Use separate least-privilege bearer identities for employee context reads, consumer message writes and the bounded core-write fixture. A shared identity is allowed only when the selected endpoints genuinely accept the same identity boundary. Use a database identity that can read PostgreSQL statistics, `outbox_events` and the acknowledged `conversation_messages` rows but cannot mutate schema or business data.
- Choose a new report path for every run. The harness refuses to overwrite an existing report.
- Record release commit, deployment identifier, instance/database topology and fixture volume alongside the generated JSON artifact. The topology evidence must contain exactly API, Worker and Web; each records an opaque deployment-reference hash, positive expected/ready replica counts and has every replica ready. PostgreSQL and object-store records are mandatory; any optional cache/search/vector records use a unique kind and endpoint-reference hash, and every store must prove TLS.
- Copy the protected publisher's `candidate-image-digests.json` into the suite directory and prove the running API, Worker and Web use those exact digest references. A matching Git SHA in an image label is insufficient if the deployed digest differs.

## Required runtime configuration

Set these only in the controlled runner's secret/environment store:

- `PERFORMANCE_BASE_URL`: credential-free HTTPS origin of the candidate deployment, with no path, query or fragment.
- `PERFORMANCE_READ_BEARER_TOKEN`: runtime-only employee identity for `/api/v1/context`.
- `PERFORMANCE_MESSAGE_BEARER_TOKEN`: runtime-only consumer identity bound to the prepared conversation.
- `PERFORMANCE_WRITE_BEARER_TOKEN`: runtime-only identity with only the selected bounded-write permission.
- Alternatively, `PERFORMANCE_BEARER_TOKEN` may supply all three only when one identity is valid for every selected endpoint; do not broaden permissions merely to use this shortcut.
- `PERFORMANCE_DATABASE_URL`: read-only evidence connection; never committed or copied into the report.
- `PERFORMANCE_ENVIRONMENT`: exactly `controlled-preproduction` or `staging`.
- `PERFORMANCE_CONVERSATION_PATH`: canonical `/api/.../messages` path for the prepared conversation, with no dot-segment, query or fragment.
- `PERFORMANCE_CONVERSATION_BODY_JSON`: nonsensitive body fields such as `{"messageType":"TEXT"}`. The harness supplies a unique content marker.
- `PERFORMANCE_WRITE_PATH` and `PERFORMANCE_WRITE_BODY_JSON`: canonical `/api/...` path for the bounded core-write fixture, with no dot-segment, query or fragment, and its nonsensitive valid request body.
- `PERFORMANCE_REPORT_PATH`: a new absolute `.json` artifact path whose existing physical parent directory is outside the source tree.
- `RELEASE_COMMIT`: the exact 40-character candidate SHA.
- `PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON`: unmodified JSON from the protected publisher's digest manifest; its positive numeric `workflowRunId` is retained in the performance report and cross-checked during evidence assembly.
- `PERFORMANCE_DEPLOYED_IMAGES_JSON`: deployment-platform snapshot containing exactly the running `api`, `worker` and `web` digest references. They must be the `lequbao-v6-api`, `lequbao-v6-worker` and `lequbao-v6-web` packages under one GHCR owner, and each must exactly equal the candidate manifest; tags and image labels are rejected as substitutes.

The controlled Stage 49 preflight calls this same configuration validator as soon as the complete performance subset is present. Dispatch it with the successful protected candidate-image publisher run ID: the workflow requires that run to use the current trusted-policy SHA, rejects a truncated Artifact API page, resolves exactly one unexpired candidate/run-named Artifact, downloads it by immutable Artifact ID, verifies GitHub's SHA-256, safely extracts its sole root manifest and compares the normalized bytes with the configured candidate manifest. Republish images after any trusted publisher-policy change. Resolve any provenance, candidate/digest, origin/path, secret-shaped body or report-path rejection before approving a load run. A green preflight does not measure latency, persistence, database saturation or Outbox health and therefore is not acceptance evidence.

- Optional `PERFORMANCE_CONCURRENCY` and `PERFORMANCE_REQUESTS`: defaults are 20 and 200 per scenario; record any higher production-shaped values in the release record.

Run `pnpm performance:gate` from the repository root. Preserve the command exit code, generated JSON and deployment/monitoring snapshots in the release evidence store.

The separate `monitoring-snapshot.json` must bind the same release commit and deployment ID, declare a canonical UTC `windowStartedAt`, `windowCompletedAt` and later `capturedAt`, and cover the performance report's complete start/end interval. PASS requires CPU and memory maxima at or below 85%, database-connection use at or below 80%, zero dead-Outbox delta, zero unacknowledged messages, unique alert IDs with observed timestamps and no open stop-release condition.

## Automatic pass criteria

- Core read P95 is at most 500 ms.
- Core write P95 is at most 800 ms.
- Customer-message persistence P95 is at most 500 ms.
- Each scenario has at most 1% non-2xx/3xx responses.
- Each scenario contains 20 to 100,000 requests; request, success and error counts are non-negative integers, reconcile exactly, and reproduce the recorded error rate.
- P50, P95 and P99 are non-negative and ordered; concurrency is an integer from 1 to 200.
- Every acknowledged customer-message ID is unique and exists in PostgreSQL after the run.
- No new dead Outbox event appears during the run.
- The report contains P50/P95/P99, errors, duration, concurrency, request count, database name, size/live-row estimate, transaction/block/temp/deadlock counters and Outbox backlog before and after. Each aggregate query must return exactly one row; missing or imprecise counters fail instead of becoming zero.

Any missing or repeated response ID, persistence mismatch, threshold breach, new dead event, unreachable database or missing report is a failed gate. The launch verifier parses the generated report rather than trusting its `PASS` label: it requires exactly `core-read`, `customer-message-write` and `core-write`, reconciles requests/successes/errors, enforces the frozen per-scenario threshold and one-percent error ceiling, requires every acknowledged message ID to be unique and persist, and compares the before/after Outbox and complete 164-table database snapshots. Do not rerun with lower load to replace a failure; retain the failed artifact, investigate, deploy a new candidate and create a separate report.
