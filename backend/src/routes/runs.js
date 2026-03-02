const express = require('express')
const db = require('../db')
const { authRequired } = require('../middleware/auth')
const { asyncHandler } = require('../middleware/asyncHandler')

function canAccess (user, ownerId) {
  return user.role === 'ADMIN' || user.sub === ownerId
}

module.exports = function runsRoutes ({ engine, runQueue, logBus }) {
  const router = express.Router()
  router.use(authRequired)

  router.get('/', asyncHandler(async (req, res) => {
    const params = []
    let where = ''
    if (req.user.role !== 'ADMIN') {
      where = 'WHERE owner_id = $1'
      params.push(req.user.sub)
    }
    const rows = await db.query(`SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT 200`, params)
    res.json(rows.rows)
  }))

  router.post('/:workflowId/start', asyncHandler(async (req, res) => {
    const wf = await db.query('SELECT * FROM workflows WHERE id = $1', [req.params.workflowId])
    if (!wf.rows.length) return res.status(404).json({ error: 'Workflow not found' })
    if (!canAccess(req.user, wf.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
    const run = await engine.enqueueRun(runQueue, wf.rows[0], req.user.sub, req.body?.input || {})
    res.status(201).json(run)
  }))

  router.post('/:runId/pause', asyncHandler(async (req, res) => {
    const run = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.runId])
    if (!run.rows.length) return res.status(404).json({ error: 'Not found' })
    if (!canAccess(req.user, run.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
    await db.query("UPDATE runs SET status='PAUSED' WHERE id = $1 AND status='RUNNING'", [req.params.runId])
    res.json({ status: 'PAUSED' })
  }))

  router.post('/:runId/resume', asyncHandler(async (req, res) => {
    const run = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.runId])
    if (!run.rows.length) return res.status(404).json({ error: 'Not found' })
    if (!canAccess(req.user, run.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
    await db.query("UPDATE runs SET status='RUNNING' WHERE id = $1 AND status='PAUSED'", [req.params.runId])
    await runQueue.add('execute-run', { runId: req.params.runId }, { removeOnComplete: 1000, removeOnFail: 1000 })
    res.json({ status: 'RUNNING' })
  }))

  router.post('/:runId/cancel', asyncHandler(async (req, res) => {
    const run = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.runId])
    if (!run.rows.length) return res.status(404).json({ error: 'Not found' })
    if (!canAccess(req.user, run.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
    await db.query("UPDATE runs SET status='CANCELLED', ended_at=now() WHERE id = $1", [req.params.runId])
    res.json({ status: 'CANCELLED' })
  }))

  router.get('/:runId', asyncHandler(async (req, res) => {
    const row = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.runId])
    if (!row.rows.length) return res.status(404).json({ error: 'Not found' })
    if (!canAccess(req.user, row.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
    const steps = await db.query('SELECT * FROM step_states WHERE run_id = $1 ORDER BY step_id', [req.params.runId])
    res.json({ ...row.rows[0], steps: steps.rows })
  }))

  router.get('/:runId/logs', asyncHandler(async (req, res) => {
    const run = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.runId])
    if (!run.rows.length) return res.status(404).json({ error: 'Not found' })
    if (!canAccess(req.user, run.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
    const logs = await db.query('SELECT * FROM step_logs WHERE run_id = $1 ORDER BY id ASC LIMIT 5000', [req.params.runId])
    res.json(logs.rows)
  }))

  router.get('/:runId/logs/stream', asyncHandler(async (req, res) => {
    const run = await db.query('SELECT * FROM runs WHERE id = $1', [req.params.runId])
    if (!run.rows.length) return res.status(404).json({ error: 'Not found' })
    if (!canAccess(req.user, run.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })

    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const existing = await db.query('SELECT * FROM step_logs WHERE run_id = $1 ORDER BY id ASC', [req.params.runId])
    for (const row of existing.rows) {
      res.write(`${JSON.stringify(row)}\n`)
    }

    const unbind = logBus.onRunLog(req.params.runId, (row) => {
      res.write(`${JSON.stringify(row)}\n`)
    })

    req.on('close', () => {
      unbind()
      res.end()
    })
  }))

  return router
}
