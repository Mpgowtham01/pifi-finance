// Seeds the real savings accounts and their whole transaction history
// (crawled from the reference app) into MongoDB. Needs
// savings_<code>_full.json — a savings account without its ledger has no
// passbook and no basis for interest.
// Idempotent: upserts accounts by (branch, accNo) and transactions by
// (account, transId, date, amount), so running it twice is safe.
//
// Run:  npm run seed-savings   (needs: npm run seed, then npm run seed-customers)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import Customer from './models/Customer.js'
import Counter from './models/Counter.js'
import Scheme from './models/Scheme.js'
import InterestSlab from './models/InterestSlab.js'
import SavingsAccount from './models/SavingsAccount.js'
import SavingsTransaction from './models/SavingsTransaction.js'
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

// The old system writes what a line is in plain English in its particulars.
const kindOf = (particulars) => (/interest/i.test(String(particulars || '')) ? 'interest' : 'normal')

// The ledger in date order, with the balance each line left behind.
function linesOf(row) {
  const ledger = (Array.isArray(row.ledger) ? row.ledger : [])
    .filter((l) => num(l.credit) > 0 || num(l.debit) > 0)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let balance = 0
  return ledger.map((l) => {
    const credit = num(l.credit)
    const debit = num(l.debit)
    balance = round2(balance + credit - debit)
    return {
      transId: String(l.transId || ''),
      date: l.date,
      particulars: String(l.particulars || '').trim(),
      type: credit > 0 ? 'Credit' : 'Debit',
      amount: credit > 0 ? credit : debit,
      balance,
      kind: kindOf(l.particulars),
    }
  })
}

async function run() {
  await connectDB()
  const schemes = await Scheme.find({ category: 'SD' })
  const schemeCodeByName = new Map(schemes.map((s) => [s.name, s.code]))
  const slabs = await InterestSlab.find({ schemeCode: { $in: schemes.map((s) => s.code) } }).sort({
    effectDate: -1,
  })
  const rateByScheme = {}
  for (const s of slabs) if (rateByScheme[s.schemeCode] === undefined) rateByScheme[s.schemeCode] = s.rate

  let grandAccounts = 0
  let grandTxns = 0

  for (const code of CODES) {
    const branch = await Branch.findOne({ code })
    if (!branch) {
      console.log(`Branch ${code} not found — run "npm run seed" first. Skipping.`)
      continue
    }

    const file = path.join(dataDir, `savings_${code}_full.json`)
    if (!fs.existsSync(file)) {
      console.log(`No savings detail file for branch ${code} — run "npm run crawl-savings -- --all". Skipping.`)
      continue
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))

    const custIds = [...new Set(rows.map((r) => String(r.custId || '')).filter(Boolean))]
    const customers = await Customer.find({ branch: branch._id, custId: { $in: custIds } })
    const byCustId = new Map(customers.map((c) => [c.custId, c]))

    const ops = []
    const keep = []
    let noCustomer = 0
    let offBy = 0
    for (const row of rows) {
      const customer = byCustId.get(String(row.custId || ''))
      if (!row.accNo || !customer) {
        noCustomer++
        continue
      }
      const lines = linesOf(row)
      const netted = lines.length ? lines[lines.length - 1].balance : 0
      // Their closing balance is what we store; a disagreement with their own
      // ledger is worth counting but not worth overruling them for.
      const theirs = row.detailAccNo ? round2(num(row.closingBalance)) : round2(num(row.balance))
      if (Math.abs(netted - theirs) > 1) offBy++

      const schemeName = String(row.schemeName || '').trim()
      const schemeCode = schemeCodeByName.get(schemeName) || ''
      const openDate = toDate(row.detailOpenDate || row.openDate) || at(new Date())
      const closed = String(row.status || 'A').toUpperCase().startsWith('C')
      // Interest the old system already paid, so the product run does not
      // pay those months over again.
      const lastInterest = [...lines].reverse().find((l) => l.kind === 'interest')

      keep.push({ row, lines })
      ops.push({
        updateOne: {
          filter: { branch: branch._id, accNo: String(row.accNo) },
          update: {
            $set: {
              accNo: String(row.accNo),
              customer: customer._id,
              custId: customer.custId,
              customerName: customer.name,
              schemeCode,
              schemeName,
              openDate,
              mop: 'S',
              interestRate: num(rateByScheme[schemeCode]),
              interestUpto: lastInterest ? toDate(lastInterest.date) : undefined,
              balance: theirs,
              lastTranDate: toDate(row.lastTranDate) || (lines.length ? toDate(lines[lines.length - 1].date) : null),
              status: closed ? 'C' : 'A',
              closedDate: closed ? toDate(row.lastTranDate) : undefined,
            },
            $setOnInsert: { branch: branch._id },
          },
          upsert: true,
        },
      })
    }

    if (ops.length === 0) {
      console.log(`Branch ${code}: nothing to seed.`)
      continue
    }
    const res = await SavingsAccount.bulkWrite(ops, { ordered: false })

    // The transactions, now that every account has an id.
    const accounts = await SavingsAccount.find({
      branch: branch._id,
      accNo: { $in: keep.map((k) => String(k.row.accNo)) },
    })
    const byAcc = new Map(accounts.map((a) => [a.accNo, a]))
    const tOps = []
    for (const { row, lines } of keep) {
      const acc = byAcc.get(String(row.accNo))
      if (!acc) continue
      for (const l of lines) {
        const transDate = toDate(l.date) || acc.openDate
        tOps.push({
          updateOne: {
            // The old system reuses transaction ids across accounts and even
            // within one, so the key has to include the date and the amount.
            filter: { account: acc._id, transId: l.transId, transDate, amount: l.amount, type: l.type },
            update: {
              $set: {
                branch: branch._id,
                account: acc._id,
                accNo: acc.accNo,
                custId: acc.custId,
                customerName: acc.customerName,
                transId: l.transId,
                transDate,
                type: l.type,
                amount: l.amount,
                kind: l.kind,
                balance: l.balance,
                narration: l.particulars,
                status: 'A',
              },
            },
            upsert: true,
          },
        })
      }
    }
    let newTxns = 0
    if (tOps.length) {
      // Mongo caps how much one bulkWrite may carry, so it goes in slices.
      for (let i = 0; i < tOps.length; i += 1000) {
        const r = await SavingsTransaction.bulkWrite(tOps.slice(i, i + 1000), { ordered: false })
        newTxns += r.upsertedCount || 0
      }
      grandTxns += tOps.length
    }

    const maxSeq = rows.reduce((m, r) => {
      const tail = String(r.accNo || '').slice(String(code).length)
      return Math.max(m, Number(tail) || 0)
    }, 0)
    if (maxSeq > 0) {
      await Counter.findOneAndUpdate({ key: `${branch._id}:savings` }, { $max: { seq: maxSeq } }, { upsert: true })
    }

    grandAccounts += ops.length
    console.log(
      `Branch ${code}-${branch.name}: ${rows.length} rows → ${res.upsertedCount || 0} new accounts, ` +
        `${res.modifiedCount || 0} updated; ${tOps.length} transactions (${newTxns} new). Counter at ${maxSeq}.`
    )
    if (noCustomer) console.log(`  ${noCustomer} skipped — no matching customer in this branch.`)
    console.log(
      offBy
        ? `  ${ops.length - offBy}/${ops.length} balances agree with that system's own ledger (its figure is stored either way).`
        : `  all ${ops.length} balances agree with that system's own ledger.`
    )
  }

  console.log(`\nSavings seed done — ${grandAccounts} accounts, ${grandTxns} transactions.`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
