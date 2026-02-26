const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const env = require('../config/env')

const router = express.Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' })
  const user = await db.query('SELECT id, email, password_hash, role FROM users WHERE email = $1', [email])
  if (!user.rows.length) return res.status(401).json({ error: 'Invalid credentials' })
  const row = user.rows[0]
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ sub: row.id, email: row.email, role: row.role }, env.jwtSecret, { expiresIn: '8h' })
  res.json({ token, user: { id: row.id, email: row.email, role: row.role } })
})

module.exports = router
