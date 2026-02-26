class MemoryCache {
  constructor () {
    this.store = new Map()
  }

  get (key) {
    const row = this.store.get(key)
    if (!row) return null
    if (row.expireAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    return row.value
  }

  has (key) {
    return this.get(key) != null
  }

  set (key, value, ttlSeconds = 60) {
    this.store.set(key, {
      value,
      expireAt: Date.now() + ttlSeconds * 1000
    })
  }
}

module.exports = { MemoryCache }
