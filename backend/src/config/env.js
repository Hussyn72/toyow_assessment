const dotenv = require('dotenv')

dotenv.config()

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
}
