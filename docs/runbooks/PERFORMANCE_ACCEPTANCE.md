# Controlled pre-production performance acceptance

This runbook produces the required evidence for `PERF-001` and `PERF-002`. It must run only against a disposable or controlled pre-production environment with production-shaped topology and data volume. The harness rejects production-shaped targets and never writes credentials into its report.

## Preconditions

- Deploy the exact release-candidate commit to `controlled-preproduction` or `staging`.
- Prepare a dedicated performance tenant, an active customer-service conversation and a bounded core-write fixture. Do not use customer or production data.
- Use separate least-privilege bearer identities for employee context reads, consumer message writes and the bounded core-write fixture. A shared identity is allowed only when the selected endpoints genuinely accept the same identity boundary. Use a database identity that can read PostgreSQL statistics, `outbox_events` and the acknowledged `conversation_messages` rows but cannot mutate schema or business data.
- Choose a new report path for every run. The harness refuses to overwrite an existing report.
- Record release commit, deployment identifier, instance/database topology and fixture volume alongside the generated JSON artifact.
- Copy the protected publisher's `candidate-image-digests.json` into the suite directory and prove the running API, Worker and Web use those exact digest references. A matching Git SHA in an image label is insufficient if the deployed digest differs.

## Required runtime configuration

Set these only in the controlled runner's secret/environment store:

- `PERFORMANCE_BASE_URL`: HTTPS origin of the candidate deployment.
- `PERFORMANCE_READ_BEARER_TOKEN`: runtime-only employee identity for `/api/v1/context`.
- `PERFORMANCE_MESSAGE_BEARER_TOKEN`: runtime-only consumer identity bound to the prepared conversation.
- `PERFORMANCE_WRITE_BEARER_TOKEN`: runtime-only identity with only the selected bounded-write permission.
- Alternatively, `PERFORMANCE_BEARER_TOKEN` may supply all three only when one identity is valid for every selected endpoint; do not broaden permissions merely to use this shortcut.
- `PERFORMANCE_DATABASE_URL`: read-only evidence connection; never committed or copied into the report.
- `PERFORMANCE_ENVIRONMENT`: exactly `controlled-preproduction` or `staging`.
- `PERFORMANCE_CONVERSATION_PATH`: `/api/.../messages` path for the prepared conversation.
- `PERFORMANCE_CONVERSATION_BODY_JSON`: nonsensitive body fields such as `{"messageType":"TEXT"}`. The harness supplies a unique content marker.
- `PERFORMANCE_WRITE_PATH` and `PERFORMANCE_WRITE_BODY_JSON`: bounded core-write fixture and its nonsensitive, valid request body.
- `PERFORMANCE_REPORT_PATH`: a new `.json` artifact path outside the source tree when practical.
- `RELEASE_COMMIT`: the exact 40-character candidate SHA.
- `PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON`: unmodified JSON from the protected publisher's digest manifest.
- `PERFORMANCE_DEPLOYED_IMAGES_JSON`: deployment-platform snapshot containing exactly the running `api`, `worker` and `web` digest references. Each must exactly equal the candidate manifest; tags and image labels are rejected as substitutes.
- Optional `PERFORMANCE_CONCURRENCY` and `PERFORMANCE_REQUESTS`: defaults are 20 and 200 per scenario; record any higher production-shaped values in the release record.

Run `pnpm performance:gate` from the repository root. Preserve the command exit code, generated JSON and deployment/monitoring snapshots in the release evidence store.

## Automatic pass criteria

- Core read P95 is at most 500 ms.
- Core write P95 is at most 800 ms.
- Customer-message persistence P95 is at most 500 ms.
- Each scenario has at most 1% non-2xx/3xx responses.
- Every acknowledged customer-message ID exists in PostgreSQL after the run.
- No new dead Outbox event appears during the run.
- The report contains P50/P95/P99, errors, duration, concurrency, request count, database size/live-row estimate, transaction/block/temp/deadlock counters and Outbox backlog before and after.

Any missing response ID, persistence mismatch, threshold breach, new dead event, unreachable database or missing report is a failed gate. Do not rerun with lower load to replace a failure; retain the failed artifact, investigate, deploy a new candidate and create a separate report.
