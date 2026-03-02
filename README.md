# Toyow Assessment - Distributed Workflow Builder (PERN, JavaScript)

This repository contains a mini SaaS workflow platform with:

- DAG-based workflow execution
- Sandboxed plugin runtime (subprocess isolation)
- Real-time logs over WebSocket
- NDJSON log streaming endpoint
- Retry with exponential backoff
- Pause/resume/cancel execution controls
- RBAC (Admin/User)
- Workflow and plugin versioning

## Monorepo Layout

- `backend/` Express + PostgreSQL + Redis + BullMQ + WebSocket
- `frontend/` React + Vite + React Flow dashboard
- `docs/` architecture/design documents and diagrams
- `openapi/` API contract
- `scripts/` deployment and utility scripts

## Quick Start

1. Set env file:
   - `backend/.env`
2. Run with Docker:
   - `docker compose up --build`
3. Apply database schema:
   - `docker compose exec backend npm run db:init`
4. Seed users:
   - `docker compose exec backend npm run db:seed`

Frontend:

- http://localhost:5173

Backend:

- http://localhost:4000

Default users after seeding:

- Admin: `admin@toyow.local` / `Admin123!`
- User: `user@toyow.local` / `User123!`

## Core Endpoints

- `POST /auth/login`
- `GET /workflows`
- `POST /workflows`
- `POST /runs/:workflowId/start`
- `POST /runs/:runId/pause`
- `POST /runs/:runId/resume`
- `POST /runs/:runId/cancel`
- `GET /runs/:runId/logs/stream` (NDJSON)
- `WS /ws` (live run logs)
