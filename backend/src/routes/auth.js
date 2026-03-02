const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const env = require('../config/env')
const { authRequired } = require('../middleware/auth')
const { asyncHandler } = require('../middleware/asyncHandler')

const router = express.Router()

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' })
  const user = await db.query('SELECT id, email, password_hash, role FROM users WHERE email = $1', [email])
  if (!user.rows.length) return res.status(401).json({ error: 'Invalid credentials' })
  const row = user.rows[0]
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ sub: row.id, email: row.email, role: row.role }, env.jwtSecret, { expiresIn: '8h' })
  res.json({ token, user: { id: row.id, email: row.email, role: row.role } })
}))

router.get('/me', authRequired, asyncHandler(async (req, res) => {
  const row = await db.query('SELECT id, email, role, created_at FROM users WHERE id = $1', [req.user.sub])
  if (!row.rows.length) return res.status(404).json({ error: 'User not found' })
  res.json(row.rows[0])
}))

module.exports = router
