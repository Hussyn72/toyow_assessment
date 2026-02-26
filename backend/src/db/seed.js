const bcrypt = require('bcryptjs')
const db = require('./index')

async function upsertUser (email, password, role) {
  const passwordHash = await bcrypt.hash(password, 10)
  await db.query(
    `INSERT INTO users(email, password_hash, role)
     VALUES($1, $2, $3)
     ON CONFLICT(email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    [email, passwordHash, role]
  )
}

async function seedBuiltinPlugins () {
  const admin = await db.query('SELECT id FROM users WHERE email = $1', ['admin@toyow.local'])
  const adminId = admin.rows[0]?.id || null
  const plugins = [
    ['TEXT_TRANSFORM', 'TEXT_TRANSFORM', '1.0.0'],
    ['API_PROXY', 'API_PROXY', '1.0.0'],
    ['DATA_AGGREGATOR', 'DATA_AGGREGATOR', '1.0.0'],
    ['DELAY', 'DELAY', '1.0.0']
  ]
  for (const p of plugins) {
    await db.query(
      `INSERT INTO plugins(name, plugin_type, version, metadata, created_by)
       VALUES($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT(name, version) DO NOTHING`,
      [p[0], p[1], p[2], JSON.stringify({ builtin: true }), adminId]
    )
  }
}

async function main () {
  await upsertUser('admin@toyow.local', 'Admin123!', 'ADMIN')
  await upsertUser('user@toyow.local', 'User123!', 'USER')
  await seedBuiltinPlugins()
  console.log('Seed complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
