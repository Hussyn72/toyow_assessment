const http = require('http')
const { WebSocketServer } = require('ws')
const env = require('./config/env')
const { createApp } = require('./app')
const { runQueue, createRunWorker } = require('./queues/runQueue')
const { WorkflowEngine } = require('./services/workflowEngine')
const { LogBus } = require('./services/logBus')
const { WsHub } = require('./services/wsHub')
const { MemoryCache } = require('./services/cache')

const logBus = new LogBus()
const wsHub = new WsHub()
const cache = new MemoryCache()
const engine = new WorkflowEngine({ logBus, wsHub, cache })
const app = createApp({ engine, runQueue, logBus })
const server = http.createServer(app)

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw))
      if (msg.type === 'subscribe' && msg.runId) {
        wsHub.subscribe(msg.runId, ws)
      }
    } catch (_) {}
  })
  ws.on('close', () => wsHub.unsubscribeAll(ws))
})

createRunWorker(async (job) => {
  await engine.processRun(job.data.runId)
})

server.listen(env.port, () => {
  console.log(`Backend listening on ${env.port}`)
})
