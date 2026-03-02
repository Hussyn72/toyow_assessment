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

function demoDefinitions () {
  return {
    parallelAggregator: {
      nodes: [
        {
          id: 'text_transform',
          type: 'TEXT_TRANSFORM',
          config: { shift: 2 },
          payload: {},
          inputMode: 'RUN_INPUT',
          retry: { maxRetries: 1, baseBackoffMs: 200 },
          timeoutMs: 30000
        },
        {
          id: 'api_fetch',
          type: 'API_PROXY',
          config: {
            url: 'https://jsonplaceholder.typicode.com/todos/1',
            method: 'GET',
            headers: {},
            useCache: true
          },
          payload: { useCache: true },
          inputMode: 'STATIC',
          retry: { maxRetries: 2, baseBackoffMs: 300 },
          timeoutMs: 30000
        },
        {
          id: 'delay_short',
          type: 'DELAY',
          config: { ms: 800, blocking: true },
          payload: {},
          inputMode: 'STATIC',
          retry: { maxRetries: 0, baseBackoffMs: 200 },
          timeoutMs: 30000
        },
        {
          id: 'aggregate',
          type: 'DATA_AGGREGATOR',
          config: {
            includeStepIds: ['text_transform', 'api_fetch', 'delay_short']
          },
          payload: {},
          inputMode: 'STATIC',
          retry: { maxRetries: 1, baseBackoffMs: 250 },
          timeoutMs: 30000
        }
      ],
      edges: [
        { from: 'text_transform', to: 'aggregate', condition: null },
        { from: 'api_fetch', to: 'aggregate', condition: null },
        { from: 'delay_short', to: 'aggregate', condition: null }
      ]
    },
    branching: {
      nodes: [
        {
          id: 'text_transform',
          type: 'TEXT_TRANSFORM',
          config: { shift: 2 },
          payload: { text: 'hello' },
          inputMode: 'STATIC',
          retry: { maxRetries: 1, baseBackoffMs: 200 },
          timeoutMs: 30000
        },
        {
          id: 'if_check',
          type: 'IF',
          config: { sourceStepId: 'text_transform', path: 'shifted', equals: 'jgnnq' },
          payload: {},
          inputMode: 'STATIC',
          retry: { maxRetries: 0, baseBackoffMs: 200 },
          timeoutMs: 30000
        },
        {
          id: 'api_true',
          type: 'API_PROXY',
          config: {
            url: 'https://jsonplaceholder.typicode.com/todos/2',
            method: 'GET',
            headers: {},
            useCache: false
          },
          payload: { useCache: false },
          inputMode: 'STATIC',
          retry: { maxRetries: 2, baseBackoffMs: 300 },
          timeoutMs: 30000
        },
        {
          id: 'delay_false',
          type: 'DELAY',
          config: { ms: 1200, blocking: true },
          payload: {},
          inputMode: 'STATIC',
          retry: { maxRetries: 0, baseBackoffMs: 200 },
          timeoutMs: 30000
        },
        {
          id: 'aggregate',
          type: 'DATA_AGGREGATOR',
          config: { includeStepIds: ['text_transform', 'if_check', 'api_true', 'delay_false'] },
          payload: {},
          inputMode: 'STATIC',
          retry: { maxRetries: 1, baseBackoffMs: 250 },
          timeoutMs: 30000
        }
      ],
      edges: [
        { from: 'text_transform', to: 'if_check', condition: null },
        { from: 'if_check', to: 'api_true', condition: true },
        { from: 'if_check', to: 'delay_false', condition: false },
        { from: 'api_true', to: 'aggregate', condition: null },
        { from: 'delay_false', to: 'aggregate', condition: null },
        { from: 'text_transform', to: 'aggregate', condition: null }
      ]
    },
    userStarter: {
      nodes: [
        {
          id: 'text_transform',
          type: 'TEXT_TRANSFORM',
          config: { shift: 3 },
          payload: {},
          inputMode: 'RUN_INPUT',
          retry: { maxRetries: 1, baseBackoffMs: 250 },
          timeoutMs: 30000
        },
        {
          id: 'aggregate',
          type: 'DATA_AGGREGATOR',
          config: { includeStepIds: ['text_transform'] },
          payload: {},
          inputMode: 'STATIC',
          retry: { maxRetries: 0, baseBackoffMs: 250 },
          timeoutMs: 30000
        }
      ],
      edges: [
        { from: 'text_transform', to: 'aggregate', condition: null }
      ]
    }
  }
}

async function ensureWorkflowWithVersion1 (ownerId, name, description, definition) {
  const existing = await db.query(
    'SELECT id FROM workflows WHERE owner_id = $1 AND lower(name) = lower($2) LIMIT 1',
    [ownerId, name]
  )

  let workflowId
  if (existing.rows.length) {
    workflowId = existing.rows[0].id
  } else {
    const inserted = await db.query(
      `INSERT INTO workflows(owner_id, name, description, latest_version)
       VALUES($1, $2, $3, 1)
       RETURNING id`,
      [ownerId, name, description]
    )
    workflowId = inserted.rows[0].id
  }

  await db.query(
    `INSERT INTO workflow_versions(workflow_id, version, definition, created_by)
     VALUES($1, 1, $2::jsonb, $3)
     ON CONFLICT(workflow_id, version)
     DO UPDATE SET definition = EXCLUDED.definition`,
    [workflowId, JSON.stringify(definition), ownerId]
  )
}

async function seedDemoWorkflows () {
  const defs = demoDefinitions()
  const admin = await db.query('SELECT id FROM users WHERE email = $1', ['admin@toyow.local'])
  const user = await db.query('SELECT id FROM users WHERE email = $1', ['user@toyow.local'])
  const adminId = admin.rows[0]?.id
  const userId = user.rows[0]?.id
  if (!adminId || !userId) return

  await ensureWorkflowWithVersion1(
    adminId,
    'Demo - Parallel Aggregation',
    'Parallel TEXT_TRANSFORM + API_PROXY + DELAY, then DATA_AGGREGATOR',
    defs.parallelAggregator
  )
  await ensureWorkflowWithVersion1(
    adminId,
    'Demo - IF Branching',
    'Branch on IF result: true -> API_PROXY, false -> DELAY',
    defs.branching
  )
  await ensureWorkflowWithVersion1(
    userId,
    'Demo - User Starter',
    'Simple run-input text transform pipeline',
    defs.userStarter
  )
}

async function main () {
  await upsertUser('admin@toyow.local', 'Admin123!', 'ADMIN')
  await upsertUser('user@toyow.local', 'User123!', 'USER')
  await seedBuiltinPlugins()
  await seedDemoWorkflows()
  console.log('Seed complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
