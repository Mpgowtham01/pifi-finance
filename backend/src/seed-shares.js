// Seeds the real share holdings (crawled from the reference app) into MongoDB.
// Needs shares_<code>_full.json — the register plus each holding's detail,
// because the list grid carries no customer id and a holding with no member
// is no use. Idempotent: upserts by (branch, accNo).
//
// Run:  npm run seed-shares    (needs: npm run seed, then npm run seed-customers)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import Customer from './models/Customer.js'
import Counter from './models/Counter.js'
import Scheme from './models/Scheme.js'
import ShareAccount from './models/ShareAccount.js'
import { round2, at } from './lib/loanMath.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const CODES = ['201', '202', '203']

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? n : 0
}
const toDate = (s) => {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d) ? null : at(d)
}

function toDoc(row, branchId, customer, schemeCodeByName) {
  const date = toDate(row.detailDate || row.date) || at(new Date())
  const noOfShares = num(row.noOfShares)
  const shareValue = num(row.shareValue)
  const schemeName = String(row.schemeName || '').trim()
  // The ledger's first line is the receipt that paid for the shares.
  const first = Array.isArray(row.ledger) && row.ledger.length ? row.ledger[0] : null
  const closed = String(row.status || 'A').toUpperCase().startsWith('C')

  return {
    accNo: String(row.accNo),
    customer: customer._id,
    custId: customer.custId,
    customerName: customer.name,
    schemeCode: schemeCodeByName.get(schemeName) || '',
    schemeName,
    date,
    noOfShares,
    shareValue,
    shareAmount: round2(num(row.detailShareAmount) || num(row.shareAmount) || noOfShares * shareValue),
    shareNoFrom: num(row.shareNoFrom),
    shareNoTo: num(row.shareNoTo),
    certificateNo: String(row.certificateNo || ''),
    transId: first ? String(first.transId || '') : '',
    transDate: first ? toDate(first.date) || date : date,
    status: closed ? 'C' : 'A',
    closedDate: closed ? date : undefined,
  }
}

async function run() {
  await connectDB()
  const schemes = await Scheme.find({ category: 'SC' })
  const schemeCodeByName = new Map(schemes.map((s) => [s.name, s.code]))
  let grandTotal = 0

  for (const code of CODES) {
    const branch = await Branch.findOne({ code })
    if (!branch) {
      console.log(`Branch ${code} not found — run "npm run seed" first. Skipping.`)
      continue
    }

    const file = path.join(dataDir, `shares_${code}_full.json`)
    if (!fs.existsSync(file)) {
      console.log(`No share detail file for branch ${code} — run "npm run crawl-shares -- --all". Skipping.`)
      continue
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))

    const custIds = [...new Set(rows.map((r) => String(r.custId || '')).filter(Boolean))]
    const customers = await Customer.find({ branch: branch._id, custId: { $in: custIds } })
    const byCustId = new Map(customers.map((c) => [c.custId, c]))

    const ops = []
    let noCustomer = 0
    let noScheme = 0
    for (const row of rows) {
      const customer = byCustId.get(String(row.custId || ''))
      if (!row.accNo || !customer) {
        noCustomer++
        continue
      }
      const doc = toDoc(row, branch._id, customer, schemeCodeByName)
      if (!doc.schemeCode) noScheme++
      ops.push({
        updateOne: {
          filter: { branch: branch._id, accNo: doc.accNo },
          update: { $set: doc, $setOnInsert: { branch: branch._id } },
          upsert: true,
        },
      })
    }

    if (ops.length === 0) {
      console.log(`Branch ${code}: nothing to seed.`)
      continue
    }
    const res = await ShareAccount.bulkWrite(ops, { ordered: false })

    // New allotments carry on from the imported numbers, both the account
    // number and the run of distinctive numbers.
    const maxSeq = rows.reduce((m, r) => {
      const tail = String(r.accNo || '').slice(String(code).length)
      return Math.max(m, Number(tail) || 0)
    }, 0)
    if (maxSeq > 0) {
      await Counter.findOneAndUpdate({ key: `${branch._id}:share` }, { $max: { seq: maxSeq } }, { upsert: true })
    }

    // The distinctive numbers have to be one unbroken sequence, so a gap or
    // an overlap in what came across is worth saying out loud.
    const live = rows
      .filter((r) => !String(r.status || 'A').toUpperCase().startsWith('C'))
      .map((r) => ({ from: num(r.shareNoFrom), to: num(r.shareNoTo) }))
      .filter((r) => r.from > 0)
      .sort((a, b) => a.from - b.from)
    let overlaps = 0
    let gaps = 0
    for (let i = 1; i < live.length; i++) {
      if (live[i].from <= live[i - 1].to) overlaps++
      else if (live[i].from > live[i - 1].to + 1) gaps++
    }

    grandTotal += ops.length
    console.log(
      `Branch ${code}-${branch.name}: ${rows.length} rows → ${res.upsertedCount || 0} new, ` +
        `${res.modifiedCount || 0} updated. Counter at ${maxSeq}.`
    )
    if (noCustomer) console.log(`  ${noCustomer} skipped — no matching customer in this branch.`)
    if (noScheme) console.log(`  ${noScheme} have no scheme code — the share type is not in the scheme master.`)
    if (overlaps) console.log(`  ${overlaps} holdings overlap another's share numbers.`)
    if (gaps) console.log(`  ${gaps} gaps in the run of share numbers (closed or transferred holdings).`)
  }

  console.log(`\nShare seed done — ${grandTotal} holdings.`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
