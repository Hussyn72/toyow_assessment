const express = require('express')
const db = require('../db')
const { authRequired } = require('../middleware/auth')
const { requireRole } = require('../middleware/rbac')

const router = express.Router()
router.use(authRequired)

router.get('/', async (req, res) => {
  const rows = await db.query('SELECT * FROM plugins ORDER BY name, version DESC')
  res.json(rows.rows)
})

router.post('/', requireRole(['ADMIN']), async (req, res) => {
  const { name, pluginType, version, artifactUrl, metadata } = req.body || {}
  if (!name || !pluginType || !version) {
    return res.status(400).json({ error: 'name, pluginType, version are required' })
  }
  const row = await db.query(
    `INSERT INTO plugins(name, plugin_type, version, artifact_url, metadata, created_by)
     VALUES($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [name, pluginType, version, artifactUrl || null, JSON.stringify(metadata || {}), req.user.sub]
  )
  res.status(201).json(row.rows[0])
})

module.exports = router
