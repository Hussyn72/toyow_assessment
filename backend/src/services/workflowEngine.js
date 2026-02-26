const db = require('../db')
const { sortedTopologicalGroups, buildDependencyMap } = require('../utils/graph')
const { executeSandboxed } = require('./pluginRunner')

class WorkflowEngine {
  constructor ({ logBus, wsHub, cache }) {
    this.logBus = logBus
    this.wsHub = wsHub
    this.cache = cache
    this.activeRuns = new Set()
  }

  async enqueueRun (runQueue, workflow, ownerId, runInput) {
    const versionRow = await db.query(
      `SELECT version, definition
       FROM workflow_versions
       WHERE workflow_id = $1
       ORDER BY version DESC LIMIT 1`,
      [workflow.id]
    )
    if (!versionRow.rows.length) throw new Error('Workflow version not found')

    const run = await db.query(
      `INSERT INTO runs(workflow_id, workflow_version, owner_id, status, started_at, input)
       VALUES($1, $2, $3, 'PENDING', NULL, $4::jsonb)
       RETURNING *`,
      [workflow.id, versionRow.rows[0].version, ownerId, JSON.stringify(runInput || {})]
    )
    await runQueue.add('execute-run', { runId: run.rows[0].id }, { removeOnComplete: 1000, removeOnFail: 1000 })
    return run.rows[0]
  }

  async processRun (runId) {
    if (this.activeRuns.has(runId)) return
    this.activeRuns.add(runId)
    try {
    const runRow = await db.query('SELECT * FROM runs WHERE id = $1', [runId])
    if (!runRow.rows.length) throw new Error('Run not found')
    const run = runRow.rows[0]
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return

    await db.query("UPDATE runs SET status='RUNNING', started_at = COALESCE(started_at, now()) WHERE id = $1", [runId])

    const workflowVersion = await db.query(
      `SELECT definition
       FROM workflow_versions
       WHERE workflow_id = $1 AND version = $2`,
      [run.workflow_id, run.workflow_version]
    )
    const definition = workflowVersion.rows[0].definition
    const nodes = definition.nodes || []
    const edges = definition.edges || []
    sortedTopologicalGroups(nodes, edges)

    const dependencies = buildDependencyMap(nodes, edges)
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const state = new Map(nodes.map(n => [n.id, { status: 'PENDING', attempts: 0, output: null }]))

    const previous = await db.query('SELECT step_id, status, attempts, output FROM step_states WHERE run_id = $1', [runId])
    for (const row of previous.rows) {
      state.set(row.step_id, { status: row.status, attempts: row.attempts, output: row.output })
    }

    const context = { runInput: run.input, stepOutputs: {}, cache: this.cache }
    for (const [stepId, st] of state.entries()) {
      if (st.status === 'COMPLETED') context.stepOutputs[stepId] = st.output
    }

    while (true) {
      const control = await db.query('SELECT status FROM runs WHERE id = $1', [runId])
      const status = control.rows[0].status
      if (status === 'CANCELLED') return
      if (status === 'PAUSED') {
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }

      await this.reconcileSkips(runId, nodes, state, dependencies, context.stepOutputs)

      const ready = nodes
        .filter(n => state.get(n.id).status === 'PENDING')
        .filter(n => this.canRunNode(n, state, dependencies, context.stepOutputs))
        .sort((a, b) => a.id.localeCompare(b.id))

      if (!ready.length) {
        const failed = [...state.values()].some(s => s.status === 'FAILED')
        const pending = [...state.values()].some(s => s.status === 'PENDING' || s.status === 'RUNNING')
        if (!pending) {
          await db.query(
            `UPDATE runs
             SET status = $2, ended_at = now(), output = $3::jsonb
             WHERE id = $1`,
            [runId, failed ? 'FAILED' : 'COMPLETED', JSON.stringify(context.stepOutputs)]
          )
          return
        }
        await new Promise(resolve => setTimeout(resolve, 200))
        continue
      }

      await Promise.all(ready.map(node => this.executeNode(runId, node, state, context)))
    }
    } finally {
      this.activeRuns.delete(runId)
    }
  }

  canRunNode (node, state, dependencies, stepOutputs) {
    const incoming = dependencies.get(node.id) || []
    for (const edge of incoming) {
      const depState = state.get(edge.from)
      if (depState.status !== 'COMPLETED' && depState.status !== 'SKIPPED') return false
      if (edge.condition != null) {
        const output = stepOutputs[edge.from]
        const result = Boolean(output?.result)
        if (result !== Boolean(edge.condition)) return false
      }
    }
    return true
  }

  async reconcileSkips (runId, nodes, state, dependencies, stepOutputs) {
    for (const node of nodes) {
      const st = state.get(node.id)
      if (st.status !== 'PENDING') continue
      const incoming = dependencies.get(node.id) || []
      if (!incoming.length) continue

      let terminal = true
      let mustSkip = false
      for (const edge of incoming) {
        const dep = state.get(edge.from)
        if (dep.status === 'PENDING' || dep.status === 'RUNNING') terminal = false
        if (dep.status === 'FAILED' || dep.status === 'SKIPPED') mustSkip = true
        if (edge.condition != null && dep.status === 'COMPLETED') {
          const output = stepOutputs[edge.from]
          const result = Boolean(output?.result)
          if (result !== Boolean(edge.condition)) mustSkip = true
        }
      }
      if (terminal && mustSkip) {
        st.status = 'SKIPPED'
        await db.query(
          `INSERT INTO step_states(run_id, step_id, status, attempts, ended_at)
           VALUES($1, $2, 'SKIPPED', $3, now())
           ON CONFLICT(run_id, step_id)
           DO UPDATE SET status='SKIPPED', attempts=$3, ended_at=now()`,
          [runId, node.id, st.attempts]
        )
      }
    }
  }

  async executeNode (runId, node, state, context) {
    state.get(node.id).status = 'RUNNING'
    await db.query(
      `INSERT INTO step_states(run_id, step_id, status, attempts, started_at)
       VALUES($1, $2, 'RUNNING', $3, now())
       ON CONFLICT(run_id, step_id)
       DO UPDATE SET status='RUNNING', started_at=now()`,
      [runId, node.id, state.get(node.id).attempts]
    )

    const maxRetries = Number(node.retry?.maxRetries ?? 2)
    const baseBackoffMs = Number(node.retry?.baseBackoffMs ?? 250)
    const input = this.buildNodeInput(node, context)

    for (let attempt = state.get(node.id).attempts + 1; attempt <= maxRetries + 1; attempt++) {
      const started = Date.now()
      state.get(node.id).attempts = attempt
      try {
        await this.writeLog(runId, node.id, attempt, 'INFO', 'STEP_START', `Starting ${node.type}`, input, null, null, null)
        const output = await executeSandboxed({
          type: node.type,
          payload: input,
          config: node.config || {},
          context: { runInput: context.runInput, stepOutputs: context.stepOutputs, cache: context.cache },
          timeoutMs: Number(node.timeoutMs || 30000)
        })
        const duration = Date.now() - started
        state.get(node.id).status = 'COMPLETED'
        state.get(node.id).output = output
        context.stepOutputs[node.id] = output

        await db.query(
          `INSERT INTO step_states(run_id, step_id, status, attempts, output, ended_at)
           VALUES($1, $2, 'COMPLETED', $3, $4::jsonb, now())
           ON CONFLICT(run_id, step_id)
           DO UPDATE SET status='COMPLETED', attempts=$3, output=$4::jsonb, ended_at=now(), error=NULL`,
          [runId, node.id, attempt, JSON.stringify(output)]
        )
        await this.writeLog(runId, node.id, attempt, 'INFO', 'STEP_SUCCESS', 'Step completed', input, output, null, duration)
        return
      } catch (err) {
        const duration = Date.now() - started
        const canRetry = attempt <= maxRetries
        await this.writeLog(runId, node.id, attempt, 'ERROR', 'STEP_ERROR', err.message, input, null, { message: err.message }, duration)
        if (canRetry) {
          const delay = baseBackoffMs * Math.pow(2, attempt - 1)
          await this.writeLog(runId, node.id, attempt, 'INFO', 'STEP_RETRY', `Retrying in ${delay}ms`, input, null, null, null)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        state.get(node.id).status = 'FAILED'
        await db.query(
          `INSERT INTO step_states(run_id, step_id, status, attempts, error, ended_at)
           VALUES($1, $2, 'FAILED', $3, $4::jsonb, now())
           ON CONFLICT(run_id, step_id)
           DO UPDATE SET status='FAILED', attempts=$3, error=$4::jsonb, ended_at=now()`,
          [runId, node.id, attempt, JSON.stringify({ message: err.message })]
        )
        return
      }
    }
  }

  buildNodeInput (node, context) {
    if (node.inputMode === 'RUN_INPUT') return context.runInput
    if (node.inputMode === 'STEP_OUTPUT' && node.inputFromStepId) {
      return context.stepOutputs[node.inputFromStepId] || {}
    }
    return node.payload || {}
  }

  async writeLog (runId, stepId, attempt, level, eventType, message, input, output, error, durationMs) {
    const row = await db.query(
      `INSERT INTO step_logs(run_id, step_id, attempt, level, event_type, message, input, output, error, duration_ms)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
       RETURNING *`,
      [
        runId,
        stepId,
        attempt,
        level,
        eventType,
        message,
        input != null ? JSON.stringify(input) : null,
        output != null ? JSON.stringify(output) : null,
        error != null ? JSON.stringify(error) : null,
        durationMs
      ]
    )
    const payload = row.rows[0]
    this.logBus.emitLog(runId, payload)
    this.wsHub.broadcastRunLog(runId, payload)
  }
}

module.exports = { WorkflowEngine }
