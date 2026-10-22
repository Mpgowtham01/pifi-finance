// Seeds the Settings masters with the values the system being replaced holds:
// schedules, the chart of accounts, schemes, interest slabs, deposit periods,
// jewel descriptions, id proofs, banks, the gold rate and the report groups.
// The data was read out of the captured reference pages into
// seed-data/settings.json — no live crawl is needed.
//
// Idempotent: everything upserts on its natural key, so re-running is safe.
// Run:  npm run seed-settings       (needs branches seeded first: npm run seed)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import Schedule from './models/Schedule.js'
import GlAccount from './models/GlAccount.js'
import Scheme from './models/Scheme.js'
import InterestSlab from './models/InterestSlab.js'
import DepositPeriod from './models/DepositPeriod.js'
import GoldRate from './models/GoldRate.js'
import ReportSetting from './models/ReportSetting.js'
import Lookup from './models/Lookup.js'
import GeneralSetting from './models/GeneralSetting.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(fs.readFileSync(path.join(here, 'seed-data', 'settings.json'), 'utf8'))

// The reference writes dates as dd/mm/yyyy.
function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return isNaN(d) ? null : d
}
const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0

// A GL code's leading digit tells you which side of the books it sits on,
// the same way the old chart of accounts was numbered.
function categoryFor(code) {
  const n = Number(code)
  if (n >= 40000) return 'Expenditure'
  if (n >= 30000) return 'Income'
  if (n >= 20000) return 'Asset'
  return 'Liability'
}

async function upsertMany(model, rows, keyOf, label) {
  if (!rows.length) return console.log(`${label}: nothing to seed.`)
  const ops = rows.map((row) => ({
    updateOne: { filter: keyOf(row), update: { $set: row }, upsert: true },
  }))
  const res = await model.bulkWrite(ops, { ordered: false })
  console.log(`${label}: ${rows.length} rows → ${res.upsertedCount || 0} new, ${res.modifiedCount || 0} updated.`)
}

async function run() {
  await connectDB()

  await upsertMany(Schedule, data.schedules, (r) => ({ code: r.code }), 'Schedules')

  const bankCodes = new Set((data.bankAccounts || []).map((b) => b.glCode))
  await upsertMany(
    GlAccount,
    data.glAccounts.map((g) => ({
      code: g.code,
      name: g.name,
      category: categoryFor(g.code),
      isBankAccount: bankCodes.has(g.code),
    })),
    (r) => ({ code: r.code }),
    'GL accounts'
  )

  await upsertMany(
    Scheme,
    data.schemes.map((s) => ({
      code: s.code,
      name: s.name,
      category: s.category,
      glCode: s.glCode,
      status: s.status === 'I' ? 'I' : 'A',
    })),
    (r) => ({ code: r.code }),
    'Schemes'
  )

  await upsertMany(
    InterestSlab,
    data.interestSlabs
      .map((s) => ({
        schemeCode: s.schemeCode,
        schemeName: s.schemeName,
        period: s.period,
        effectDate: parseDate(s.effectDate),
        rate: num(s.rate),
        penalRate: num(s.penalRate),
        srCtznRate: num(s.srCtznRate),
        srCtznPenalRate: num(s.srCtznPenalRate),
      }))
      .filter((s) => s.effectDate),
    (r) => ({ schemeCode: r.schemeCode, period: r.period, effectDate: r.effectDate }),
    'Interest slabs'
  )

  await upsertMany(
    DepositPeriod,
    data.depositPeriods.map((p) => ({
      schemeCode: p.schemeCode,
      schemeName: p.schemeName,
      period: p.period,
      periodCode: p.periodCode,
      unit: /day/i.test(p.period) ? 'Days' : 'Months',
      status: p.status === 'I' ? 'I' : 'A',
    })),
    (r) => ({ schemeCode: r.schemeCode, periodCode: r.periodCode }),
    'Deposit periods'
  )

  await upsertMany(
    GoldRate,
    data.goldRates
      .map((g) => ({
        effectDate: parseDate(g.effectDate),
        marketRate: num(g.marketRate),
        ratePerGram: Math.round((num(g.marketRate) / 8) * 100) / 100, // 8 g to a sovereign
        createdBy: g.createdBy,
      }))
      .filter((g) => g.effectDate),
    (r) => ({ effectDate: r.effectDate }),
    'Gold rates'
  )

  await upsertMany(
    ReportSetting,
    data.reportSettings.map((r) => ({
      reportCode: '101',
      groupName: r.groupName,
      glCode: r.glCode,
      glName: r.glName,
    })),
    (r) => ({ reportCode: r.reportCode, groupName: r.groupName, glCode: r.glCode }),
    'Report settings'
  )

  for (const [kind, names, label] of [
    ['jewel', data.jewelTypes, 'Jewel descriptions'],
    ['idProof', data.idProofs, 'Id proofs'],
    ['bank', data.banks, 'Banks'],
  ]) {
    await upsertMany(
      Lookup,
      names.map((name, i) => ({ kind, name, sort: i })),
      (r) => ({ kind: r.kind, name: r.name }),
      label
    )
  }

  // Every branch starts with a General Settings row so the screen opens filled.
  for (const branch of await Branch.find()) {
    await GeneralSetting.updateOne(
      { branch: branch._id },
      { $setOnInsert: { branch: branch._id, smsEnabled: true } },
      { upsert: true }
    )
  }
  console.log(`General settings: one row per branch.`)

  await mongoose.disconnect()
  console.log('Settings seed done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
