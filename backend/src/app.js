const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const env = require('./config/env')
const authRoutes = require('./routes/auth')
const workflowRoutes = require('./routes/workflows')
const pluginRoutes = require('./routes/plugins')
const runsRoutes = require('./routes/runs')

function createApp ({ engine, runQueue, logBus }) {
  const app = express()
  app.use(helmet())
  app.use(cors({ origin: env.frontendOrigin }))
  app.use(express.json({ limit: '1mb' }))
  app.use(morgan('dev'))

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.use('/auth', authRoutes)
  app.use('/workflows', workflowRoutes)
  app.use('/plugins', pluginRoutes)
  app.use('/runs', runsRoutes({ engine, runQueue, logBus }))

  return app
}

module.exports = { createApp }
