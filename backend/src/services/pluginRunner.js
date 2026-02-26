const path = require('path')
const { fork } = require('child_process')

function executeSandboxed ({ type, payload, config, context, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, '../sandbox/executor.js'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    })

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Plugin timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    child.on('message', (msg) => {
      clearTimeout(timeout)
      if (msg.ok) resolve(msg.result)
      else reject(new Error(msg.error?.message || 'Plugin execution failed'))
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.send({ type, payload, config, context })
  })
}

module.exports = { executeSandboxed }
