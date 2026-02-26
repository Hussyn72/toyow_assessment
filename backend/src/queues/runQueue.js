const { Queue, Worker } = require('bullmq')
const IORedis = require('ioredis')
const env = require('../config/env')

const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null })
const queueName = 'workflow-runs'

const runQueue = new Queue(queueName, { connection })

function createRunWorker (processor) {
  return new Worker(queueName, processor, { connection, concurrency: 5 })
}

module.exports = { runQueue, createRunWorker }
