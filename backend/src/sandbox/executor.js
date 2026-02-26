const { executePlugin } = require('../services/pluginRuntime')

process.on('message', async (msg) => {
  try {
    const result = await executePlugin(msg.type, msg.payload, msg.config, msg.context)
    process.send({ ok: true, result })
  } catch (err) {
    process.send({ ok: false, error: { message: err.message, stack: err.stack } })
  } finally {
    process.exit(0)
  }
})
