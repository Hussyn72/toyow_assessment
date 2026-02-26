const express = require('express')
const db = require('../db')
const { authRequired } = require('../middleware/auth')

const router = express.Router()
router.use(authRequired)

function canAccess (user, ownerId) {
  return user.role === 'ADMIN' || user.sub === ownerId
}

router.get('/', async (req, res) => {
  const params = []
  let where = ''
  if (req.user.role !== 'ADMIN') {
    params.push(req.user.sub)
    where = 'WHERE owner_id = $1'
  }
  const rows = await db.query(`SELECT * FROM workflows ${where} ORDER BY updated_at DESC`, params)
  res.json(rows.rows)
})

router.get('/:id', async (req, res) => {
  const row = await db.query('SELECT * FROM workflows WHERE id = $1', [req.params.id])
  if (!row.rows.length) return res.status(404).json({ error: 'Not found' })
  if (!canAccess(req.user, row.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
  const versions = await db.query(
    'SELECT version, definition, created_at FROM workflow_versions WHERE workflow_id = $1 ORDER BY version DESC',
    [req.params.id]
  )
  res.json({ ...row.rows[0], versions: versions.rows })
})

router.post('/', async (req, res) => {
  const { name, description, definition } = req.body || {}
  if (!name || !definition) return res.status(400).json({ error: 'name and definition are required' })
  const created = await db.query(
    `INSERT INTO workflows(owner_id, name, description)
     VALUES($1, $2, $3)
     RETURNING *`,
    [req.user.sub, name, description || null]
  )
  const wf = created.rows[0]
  await db.query(
    `INSERT INTO workflow_versions(workflow_id, version, definition, created_by)
     VALUES($1, 1, $2::jsonb, $3)`,
    [wf.id, JSON.stringify(definition), req.user.sub]
  )
  res.status(201).json(wf)
})

router.put('/:id', async (req, res) => {
  const { name, description, definition } = req.body || {}
  const row = await db.query('SELECT * FROM workflows WHERE id = $1', [req.params.id])
  if (!row.rows.length) return res.status(404).json({ error: 'Not found' })
  const wf = row.rows[0]
  if (!canAccess(req.user, wf.owner_id)) return res.status(403).json({ error: 'Forbidden' })

  const version = definition ? wf.latest_version + 1 : wf.latest_version
  await db.query(
    `UPDATE workflows
     SET name = COALESCE($2, name), description = COALESCE($3, description), latest_version = $4, updated_at = now()
     WHERE id = $1`,
    [wf.id, name || null, description || null, version]
  )
  if (definition) {
    await db.query(
      `INSERT INTO workflow_versions(workflow_id, version, definition, created_by)
       VALUES($1, $2, $3::jsonb, $4)`,
      [wf.id, version, JSON.stringify(definition), req.user.sub]
    )
  }
  const updated = await db.query('SELECT * FROM workflows WHERE id = $1', [wf.id])
  res.json(updated.rows[0])
})

router.delete('/:id', async (req, res) => {
  const row = await db.query('SELECT * FROM workflows WHERE id = $1', [req.params.id])
  if (!row.rows.length) return res.status(404).json({ error: 'Not found' })
  if (!canAccess(req.user, row.rows[0].owner_id)) return res.status(403).json({ error: 'Forbidden' })
  await db.query('DELETE FROM workflows WHERE id = $1', [req.params.id])
  res.status(204).send()
})

module.exports = router
