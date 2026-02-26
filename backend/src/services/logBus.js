const { EventEmitter } = require('events')

class LogBus extends EventEmitter {
  emitLog (runId, logRow) {
    this.emit(`run:${runId}`, logRow)
  }

  onRunLog (runId, fn) {
    this.on(`run:${runId}`, fn)
    return () => this.off(`run:${runId}`, fn)
  }
}

module.exports = { LogBus }
