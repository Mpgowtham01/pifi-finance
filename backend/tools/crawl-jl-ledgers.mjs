// Tops up the jewel-loan ledgers that came back truncated.
//
// account_detail.aspx renders only the last seven rows of an account's
// ledger, with no pager and no sign that it has stopped. A loan whose ledger
// came back with fewer than seven rows therefore has all of them; one that
// came back with exactly seven may well have more. Those are re-fetched here
// from the account statement, which pages properly.
//
// Usage (run in YOUR terminal):
//   $env:REF_URL='http://HOST:PORT'; $env:REF_USER='theuser'; $env:REF_PASS='thepassword'
//   node tools/crawl-jl-ledgers.mjs          # report how many need topping up
//   node tools/crawl-jl-ledgers.mjs --fix    # fetch them and rewrite the files
//   # then: npm run seed-loans
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env, login, statement, BRANCHES } from './ref-client.mjs'

const { BASE, USER, PASS } = env()
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
// The cap account_detail silently applies.
const CAP = 7
const CONCURRENCY = 4

const fix = process.argv.includes('--fix')
const only = process.argv.find((a) => /^\d{3}$/.test(a))
const todo = only ? BRANCHES.filter((b) => b.code === only) : BRANCHES

for (const branch of todo) {
  const file = path.join(dataDir, `jewelloans_${branch.code}_full.json`)
  if (!fs.existsSync(file)) {
    console.log(`  branch ${branch.code}: no detail file — skipping.`)
    continue
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  const suspect = rows.filter((r) => (r.ledger?.length || 0) >= CAP)
  console.log(
    `  branch ${branch.code}: ${rows.length} loans, ${suspect.length} with a ledger at the ${CAP}-row cap`
  )
  if (!fix || suspect.length === 0) continue

  const jar = await login(BASE, USER, PASS, branch)
  const queue = [...suspect]
  let done = 0
  let grew = 0
  let failed = 0
  async function worker() {
    while (queue.length) {
      const row = queue.shift()
      try {
        const full = await statement(BASE, jar, 'JL', row.accNo)
        if (full.length > (row.ledger?.length || 0)) grew++
        if (full.length) row.ledger = full
      } catch (e) {
        failed++
        row.ledgerTopUpFailed = e.message
      }
      if (++done % 25 === 0) process.stdout.write(`    ${branch.code}: ${done}/${suspect.length}\r`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  fs.writeFileSync(file, JSON.stringify(rows, null, 2))
  const longest = rows.reduce((m, r) => Math.max(m, r.ledger?.length || 0), 0)
  console.log(
    `  branch ${branch.code}: ${grew} ledgers grew, ${failed} could not be re-read; longest is now ${longest} rows`
  )
}

console.log(fix ? '\nDone. Now run:  npm run seed-loans' : '\nRun again with --fix to fetch them.')
