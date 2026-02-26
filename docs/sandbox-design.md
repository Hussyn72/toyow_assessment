# Sandbox Design

## Approach

Sandboxing uses Node subprocess isolation (`child_process.fork`) per step execution.

## Isolation Guarantees

- Plugin code runs in child process and communicates only through IPC messages.
- Parent enforces timeout and kills child on overrun (`SIGKILL`).
- Child exits after one plugin invocation.

## Security Controls

- Strict allowlist of plugin types handled by runtime.
- No dynamic eval for built-in plugins.
- API_PROXY honors explicit header injection and method constraints.
- Future hardening path:
  - seccomp/AppArmor via container runtime
  - per-plugin micro-container executor
  - WASM runtime for untrusted third-party plugins

## Versioning & Artifacts

- Plugin metadata and versions persisted in `plugins` table.
- `artifact_url` supports external object storage (e.g., MinIO/S3) for custom plugin bundles.
