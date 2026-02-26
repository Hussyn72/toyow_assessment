class WsHub {
  constructor () {
    this.clientsByRun = new Map()
  }

  subscribe (runId, ws) {
    if (!this.clientsByRun.has(runId)) {
      this.clientsByRun.set(runId, new Set())
    }
    this.clientsByRun.get(runId).add(ws)
  }

  unsubscribeAll (ws) {
    for (const set of this.clientsByRun.values()) {
      set.delete(ws)
    }
  }

  broadcastRunLog (runId, payload) {
    const set = this.clientsByRun.get(runId)
    if (!set) return
    const msg = JSON.stringify({ type: 'run.log', runId, payload })
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(msg)
      }
    }
  }
}

module.exports = { WsHub }
