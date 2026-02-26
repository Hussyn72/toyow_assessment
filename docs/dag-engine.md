# DAG Engine Design

```mermaid
flowchart TD
  A[Load Run + Workflow Version] --> B[Validate DAG / Topological Order]
  B --> C[Initialize Step State]
  C --> D{Run Status}
  D -->|PAUSED| D
  D -->|CANCELLED| Z[Stop]
  D -->|RUNNING| E[Select Ready Nodes]
  E --> F{Any Ready?}
  F -->|No| G{Pending/Running Exists}
  G -->|Yes| D
  G -->|No| H[Finalize Run Status]
  F -->|Yes| I[Execute Ready Nodes in Parallel]
  I --> J[Sandbox Execution per Node]
  J --> K{Success?}
  K -->|Yes| L[Persist Output + Logs]
  K -->|No| M{Retries Left?}
  M -->|Yes| N[Exp Backoff + Retry]
  M -->|No| O[Mark Step Failed]
  L --> D
  N --> J
  O --> D
```

## Determinism & Idempotency

- Deterministic ordering: ready steps sorted lexicographically by `step.id`.
- Idempotency: persisted `step_states` allows safe resume and prevents duplicate success handling.
- Replay-safe logs: every attempt is persisted with timestamp and duration.
