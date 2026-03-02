function errorHandler (err, _req, res, _next) {
  console.error(err)
  if (res.headersSent) return
  res.status(500).json({ error: 'Internal server error' })
}

module.exports = { errorHandler }
