// Seeds the real jewel loans (crawled from the reference app) into MongoDB.
// Prefers jewelloans_<code>_full.json — the register plus each loan's detail
// from account_detail.aspx — and falls back to jewelloans_<code>.json, which
// is the register alone: account number, borrower, dates, amount and rate.
// Idempotent: upserts by (branch, accNo), so running it twice is safe.
//
// Run:  npm run seed-loans     (needs: npm run seed, then npm run seed-customers)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import Customer from './models/Customer.js'
import Counter from './models/Counter.js'
import Scheme from './models/Scheme.js'
import JewelLoan from './models/JewelLoan.js'
import LoanReceipt from './models/LoanReceipt.js'
import { addMonths, round2, at } from './lib/loanMath.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const CODES = ['201', '202', '203']

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? n : 0
}

// The crawler writes dates as yyyy-mm-dd; store them as the day they name.
const toDate = (s) => {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d) ? null : at(d)
}

/* -------------------------------------------------------------- jewels */

// account_detail quotes the collateral as a list of items with counts
// ("RING - 2No.") and the weights for the pledge as a whole, never per item.
// So the items are listed as they were given, and the weight stays on the
// loan rather than being divided up on a guess.
function jewelsOf(row) {
  const items = Array.isArray(row.collateral) ? row.collateral : []
  if (!items.length) return []
  const totalItems = items.reduce((t, j) => t + (num(j.items) || 1), 0) || 1
  const netWeight = num(row.netWeight)
  const value = num(row.appraisedValue)
  return items.map((j) => {
    const count = num(j.items) || 1
    // Spread the pledge's weight and value over the items by count, so the
    // totals still add up. Per-item weights were never recorded.
    const share = count / totalItems
    return {
      jewelId: '',
      description: String(j.description || '').trim(),
      items: count,
      grossWeight: round2(num(row.grossWeight) * share),
      deduction: round2(num(row.deduction) * share),
      netWeight: round2(netWeight * share),
      touch: '22ct',
      ratePerGram: netWeight > 0 ? round2(value / netWeight) : 0,
      value: round2(value * share),
    }
  })
}

/* ------------------------------------------------------------- ledger */

// The ledger is Tran. Id | Date | Particulars | Credit | Debit. A debit is the
// money paid out when the loan opened; a credit is money received back.
const creditsOf = (row) =>
  (Array.isArray(row.ledger) ? row.ledger : []).filter((l) => num(l.credit) > 0)

// Which part of the loan a credit line settles. The old system writes these
// as plain English on the line, one line per part.
function partOf(particulars) {
  const p = String(particulars || '').toLowerCase()
  if (p.includes('principal')) return 'principal'
  if (p.includes('penal')) return 'penal'
  if (p.includes('insurance')) return 'insurance'
  if (p.includes('notice')) return 'notice'
  if (p.includes('interest')) return 'interest'
  return 'principal' // an unlabelled repayment reduces the loan
}

// One receipt per (transaction id, date): the lines under it are its split.
function receiptsOf(row) {
  const byTran = new Map()
  for (const line of creditsOf(row)) {
    const key = `${line.transId}|${line.date}`
    if (!byTran.has(key)) {
      byTran.set(key, {
        transId: String(line.transId || ''),
        date: line.date,
        principal: 0, interest: 0, penal: 0, insurance: 0, notice: 0,
        particulars: [],
      })
    }
    const r = byTran.get(key)
    r[partOf(line.particulars)] += num(line.credit)
    const what = String(line.particulars || '').trim()
    if (what && !r.particulars.includes(what)) r.particulars.push(what)
  }
  return [...byTran.values()]
    .map((r) => ({
      ...r,
      principal: round2(r.principal),
      interest: round2(r.interest),
      penal: round2(r.penal),
      insurance: round2(r.insurance),
      notice: round2(r.notice),
      amount: round2(r.principal + r.interest + r.penal + r.insurance + r.notice),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/* --------------------------------------------------------------- loans */

function toDoc(row, branchId, customer, schemeCodeByName) {
  const openDate = toDate(row.detailOpenDate || row.openDate) || at(new Date())
  const periodMonths = num(row.periodMonths) || 6
  const loanAmount = num(row.loanAmount)
  const jewels = jewelsOf(row)
  const credits = creditsOf(row)
  const closed = String(row.status || 'A').toUpperCase().startsWith('C')
  const hasDetail = !!row.detailAccNo

  // The old system's own closing balance is the truth. Without it, a closed
  // loan owes nothing and a live one is assumed untouched.
  let principalBalance = loanAmount
  if (hasDetail && row.closingBalance !== undefined && row.closingBalance !== null) {
    principalBalance = round2(num(row.closingBalance))
  } else if (closed) {
    principalBalance = 0
  }

  const lastCredit = credits.length ? toDate(credits[credits.length - 1].date) : null
  const schemeName = String(row.schemeName || '').trim()

  return {
    accNo: String(row.accNo),
    transId: credits.length ? '' : String(row.ledger?.[0]?.transId || ''),
    transDate: openDate,
    customer: customer._id,
    custId: customer.custId,
    customerName: customer.name,
    schemeCode: schemeCodeByName.get(schemeName) || '',
    schemeName,
    loanType: 'NE',
    purpose: 'Walk-in',
    status: closed ? 'C' : 'A',
    openDate,
    periodMonths,
    dueDate: toDate(row.detailDueDate || row.dueDate) || addMonths(openDate, periodMonths),
    jewels,
    noOfItems: jewels.reduce((t, j) => t + j.items, 0),
    grossWeight: round2(num(row.grossWeight)),
    netWeight: round2(num(row.netWeight)),
    jewelValue: round2(num(row.appraisedValue)),
    ratePerGram: num(row.netWeight) > 0 ? round2(num(row.appraisedValue) / num(row.netWeight)) : 0,
    loanAmount,
    interestRate: num(row.interestRate),
    loanPayable: loanAmount,
    disbAmt: loanAmount,
    principalBalance,
    // Interest is taken as settled up to the last money received, and
    // otherwise to the day the loan was opened.
    intRecdUpto: lastCredit || openDate,
    insuranceRecdUpto: openDate,
    closedDate: closed ? lastCredit || toDate(row.dueDate) : undefined,
  }
}

/* ----------------------------------------------------------------- run */

async function run() {
  await connectDB()
  const schemes = await Scheme.find({ category: 'JL' })
  const schemeCodeByName = new Map(schemes.map((s) => [s.name, s.code]))
  let grandTotal = 0
  let grandReceipts = 0

  for (const code of CODES) {
    const branch = await Branch.findOne({ code })
    if (!branch) {
      console.log(`Branch ${code} not found — run "npm run seed" first. Skipping.`)
      continue
    }

    const fullPath = path.join(dataDir, `jewelloans_${code}_full.json`)
    const basicPath = path.join(dataDir, `jewelloans_${code}.json`)
    const file = fs.existsSync(fullPath) ? fullPath : basicPath
    if (!fs.existsSync(file)) {
      console.log(`No loan file for branch ${code} — run the crawler first. Skipping.`)
      continue
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    const kind = file === fullPath ? 'with detail' : 'register only'

    // One query for every borrower this file mentions, rather than one each.
    const custIds = [...new Set(rows.map((r) => String(r.custId || '')).filter(Boolean))]
    const customers = await Customer.find({ branch: branch._id, custId: { $in: custIds } })
    const byCustId = new Map(customers.map((c) => [c.custId, c]))

    const ops = []
    const keep = []
    let noCustomer = 0
    let withJewels = 0
    let withLedger = 0
    let noDetail = 0
    for (const row of rows) {
      const customer = byCustId.get(String(row.custId || ''))
      if (!row.accNo || !customer) {
        noCustomer++
        continue
      }
      const doc = toDoc(row, branch._id, customer, schemeCodeByName)
      if (doc.jewels.length) withJewels++
      if (row.ledger?.length) withLedger++
      if (!row.detailAccNo) noDetail++
      keep.push(row)
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
    const res = await JewelLoan.bulkWrite(ops, { ordered: false })

    // Receipts, where the old system recorded any. Its ledger gives the date
    // and the amount but never how the money was split between principal and
    // interest, so the split is left at zero and the row says it was imported.
    const loans = await JewelLoan.find({ branch: branch._id, accNo: { $in: keep.map((r) => r.accNo) } })
    const loanByAcc = new Map(loans.map((l) => [l.accNo, l]))
    const rOps = []
    for (const row of keep) {
      const loan = loanByAcc.get(String(row.accNo))
      if (!loan) continue
      for (const r of receiptsOf(row)) {
        const doc = {
          branch: branch._id,
          loan: loan._id,
          loanKind: 'JL',
          accNo: loan.accNo,
          custId: loan.custId,
          customerName: loan.customerName,
          transId: r.transId,
          transDate: toDate(r.date) || loan.openDate,
          principal: r.principal,
          interest: r.interest,
          penal: r.penal,
          insurance: r.insurance,
          notice: r.notice,
          amount: r.amount,
          narration: r.particulars.join(', '),
          imported: true,
          status: 'A',
        }
        rOps.push({
          updateOne: {
            filter: { loan: loan._id, transId: doc.transId, transDate: doc.transDate },
            update: { $set: doc },
            upsert: true,
          },
        })
      }
    }
    let receipts = 0
    if (rOps.length) {
      const rr = await LoanReceipt.bulkWrite(rOps, { ordered: false })
      receipts = rr.upsertedCount || 0
      grandReceipts += rOps.length
    }

    // Keep new account numbers running on from the imported ones. The number
    // after the branch code is the one the old system incremented.
    const maxSeq = rows.reduce((m, r) => {
      const tail = String(r.accNo || '').slice(String(code).length)
      return Math.max(m, Number(tail) || 0)
    }, 0)
    if (maxSeq > 0) {
      await Counter.findOneAndUpdate({ key: `${branch._id}:jl` }, { $max: { seq: maxSeq } }, { upsert: true })
    }

    // The old system's closing balance is what we store. Checking it against
    // its own ledger is free, and a wide gap means one of the two is wrong.
    let checked = 0
    let offBy = 0
    for (const row of keep) {
      if (!row.detailAccNo || !row.ledger?.length) continue
      // The statement keeps a running balance down its own last column. Where
      // it has one, the check is simply whether it ends where that system
      // says the loan stands.
      const last = row.ledger[row.ledger.length - 1]
      if (last?.balance === null || last?.balance === undefined) continue
      checked++
      if (Math.abs(num(last.balance) - num(row.closingBalance)) > 1) offBy++
    }

    grandTotal += ops.length
    console.log(
      `Branch ${code}-${branch.name} [${kind}]: ${rows.length} rows → ` +
        `${res.upsertedCount || 0} new, ${res.modifiedCount || 0} updated. ` +
        `${withJewels} with jewels, ${withLedger} with a ledger, ${rOps.length} receipts (${receipts} new). ` +
        `Counter at ${maxSeq}.`
    )
    if (noCustomer) {
      console.log(`  ${noCustomer} skipped — no matching customer in this branch (seed customers first).`)
    }
    if (checked) {
      console.log(
        offBy
          ? `  balances checked against that system's own ledger: ${checked - offBy}/${checked} agree ` +
              `(its figure is the one stored either way).`
          : `  balances checked against that system's own ledger: all ${checked} agree.`
      )
    }
    if (noDetail) {
      console.log(
        `  ${noDetail} have no detail, so they carry their full sanctioned amount as the balance. ` +
          'Re-run the crawler with --all for those.'
      )
    }
  }

  console.log(`\nLoan seed done — ${grandTotal} loans, ${grandReceipts} receipts.`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
