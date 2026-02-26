# Trade-off Analysis

## Chosen

- Express + BullMQ + Postgres + React (PERN JS): fast delivery, clear operational model.
- Subprocess sandbox: simpler than WASM/container-per-step while still isolating crashes.
- Postgres log persistence + NDJSON stream: durable observability and easy replay.

## Trade-offs

- Subprocess isolation is weaker than micro-VM/container isolation for hostile plugins.
- In-memory cache fallback is not shared across backend replicas.
- Resume behavior is process-safe but not fully crash-recovery complete for mid-step execution.
- React Flow builder is practical but not full-feature BPMN editor.

## Why This Is Acceptable

- Covers all requested capabilities in a compact assessment-ready implementation.
- Leaves explicit upgrade paths for enterprise hardening without redesigning APIs/data model.
