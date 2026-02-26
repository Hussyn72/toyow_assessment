# System Architecture

```mermaid
flowchart LR
  UI[React Frontend] -->|REST| API[Express API]
  UI -->|WS /ws| WS[WebSocket Hub]
  API --> AUTH[JWT Auth + RBAC]
  API --> PG[(PostgreSQL)]
  API --> Q[Redis + BullMQ]
  Q --> ENGINE[DAG Workflow Engine]
  ENGINE --> SANDBOX[Plugin Sandbox Subprocess]
  ENGINE --> LOGS[Log Bus]
  LOGS --> WS
  API --> NDJSON[/runs/:id/logs/stream]
  SANDBOX --> EXT[External APIs]
  ENGINE --> CACHE[(In-memory/Redis Cache)]
  API --> MINIO[(MinIO Plugin Artifacts)]
```

## Components

- Frontend: workflow builder, execution monitor, history/log viewer.
- API: auth, workflow CRUD/versioning, runs control, plugins registry.
- DAG Engine: deterministic run scheduling, branching, retries, and idempotency.
- Sandbox: subprocess-per-step execution boundary.
- Persistence: Postgres for users/workflows/versions/runs/step states/logs.
- Queue: Redis + BullMQ for run dispatch.
