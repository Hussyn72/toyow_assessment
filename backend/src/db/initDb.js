const fs = require('fs')
const path = require('path')
const db = require('./index')

async function main () {
  const schemaPath = path.join(__dirname, 'schema.sql')
  const sql = fs.readFileSync(schemaPath, 'utf8')
  await db.query(sql)
  console.log('Database schema initialized.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
