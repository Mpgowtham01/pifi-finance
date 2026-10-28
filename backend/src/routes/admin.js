import { Router } from 'express'
import Branch from '../models/Branch.js'
import User from '../models/User.js'
import GlAccount from '../models/GlAccount.js'
import OpeningBalance from '../models/OpeningBalance.js'
import ReportSetting from '../models/ReportSetting.js'
import JewelLoan from '../models/JewelLoan.js'
import DayEnd, { DENOMINATIONS } from '../models/DayEnd.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { round2, at } from '../lib/loanMath.js'
import { entriesBetween, flatten, byHead, gapsIn, registeredSources } from '../lib/glLedger.js'
import { outstandingAsOn, outstandingTypes } from '../lib/accounts.js'

// The Admin side of the old app: View Transactions, the Cash Book, the Sub
// Day Book, Receipts & Payments, the General Ledger and the Trial Balance.
// Every one of them is a different cut of the same day book, which
// lib/glLedger.js works out from the product modules.

const router = Router()
router.use(requireAuth)

const branchOf = (req) => Branch.findById(req.branchId)
const num = (v, d = 0) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? d : Number(v))
const todayUtc = () => at(new Date())
const asDate = (v) => (v ? at(v) : null)
const dayKey = (d) => new Date(d).toISOString().slice(0, 10)

// A window the caller did not fully give us: default to today, both ends.
function windowOf(q) {
  const to = asDate(q.to) || todayUtc()
  const from = asDate(q.from) || to
  if (from > to) throw httpError(400, 'The From date is after the To date.')
  return { from, to }
}

// Every report says in one line what it could not place, so none of them
// looks complete when it is not.
const noteFor = (entries) => gapsIn(entries)

/* ----------------------------------------------------------------- the chart */

router.get('/heads', async (_req, res) => {
  const heads = await GlAccount.find({ active: true }).sort({ code: 1 })
  res.json({ glAccounts: heads.map((g) => g.toSafe()), sources: registeredSources() })
})

/* ------------------------------------------------------- outstanding report */

// SB_Os.aspx with the account type left open, which is what the Admin menu
// points at. The product menus open the same report with their type chosen.
router.get('/outstanding', async (req, res) => {
  const asOn = asDate(req.query.asOn) || todayUtc()
  const accType = String(req.query.accType || '').trim()
  const rows = await outstandingAsOn({ branchId: req.branchId, asOn, accType })

  const groups = new Map()
  for (const r of rows) {
    const g = groups.get(r.accType) || groups.set(r.accType, { accType: r.accType, count: 0, balance: 0 }).get(r.accType)
    g.count += 1
    g.balance = round2(g.balance + r.balance)
  }

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn,
    accType,
    accTypes: outstandingTypes(),
    rows,
    groups: [...groups.values()].sort((a, b) => b.balance - a.balance),
    totals: { count: rows.length, balance: round2(rows.reduce((t, r) => t + r.balance, 0)) },
  })
})

/* ---------------------------------------------------------- view transactions */

// View_Transactions.aspx: everything that moved in a window, newest first,
// each row opening onto the ledger heads it touched.
router.get('/transactions', async (req, res) => {
  const { from, to } = windowOf(req.query)
  const { q = '', source = '', accNo = '', status = '', page = 1, limit = 100 } = req.query
  const only = source ? [source] : undefined
  const { entries } = await entriesBetween({ branchId: req.branchId, from, to, only })

  let rows = entries
  const term = String(q).trim()
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i')
    rows = rows.filter((e) => rx.test(e.transId) || rx.test(e.particulars) || rx.test(e.accNo))
  }
  if (accNo) rows = rows.filter((e) => e.accNo === String(accNo).trim())
  if (status) rows = rows.filter((e) => e.status === status)

  const total = rows.length
  const totals = {
    count: total,
    amount: round2(rows.filter((e) => e.status === 'A').reduce((t, e) => t + e.amount, 0)),
    cancelled: rows.filter((e) => e.status !== 'A').length,
  }
  const perPage = Math.min(num(limit, 100), 500)
  const skip = (Math.max(num(page, 1), 1) - 1) * perPage
  // Newest first on screen, the way the old grid showed the day.
  const pageRows = [...rows].reverse().slice(skip, skip + perPage)

  // Only the page on screen needs its clerks named.
  const ids = [...new Set(pageRows.map((e) => e.createdBy).filter(Boolean))]
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('username name') : []
  const nameOf = new Map(users.map((u) => [u._id.toString(), u.username]))
  for (const e of pageRows) e.createdByName = nameOf.get(e.createdBy) || ''

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    from,
    to,
    sources: registeredSources(),
    transactions: pageRows,
    total,
    totals,
    page: num(page, 1),
    limit: perPage,
    note: noteFor(rows),
  })
})

/* ------------------------------------------------------------------ cash book */

// Cash_Book_Reports.aspx?rn=CB. The cash head, day by day: what it opened on,
// what came in, what went out, what it closed on.
router.get('/cash-book', async (req, res) => {
  const { from, to } = windowOf(req.query)
  const { chart, entries } = await entriesBetween({ branchId: req.branchId, to })
  const head = String(req.query.glCode || '').trim() || chart.cashCode
  if (!head) throw httpError(409, 'There is no Cash on Hand account in the GL Master.')

  const opened = await openingFor(req.branchId, head)
  const postings = flatten(entries).filter((p) => p.glCode === head)

  // Everything before the window opens is the balance it starts from.
  let balance = opened.amount
  const before = postings.filter((p) => at(p.date) < from)
  for (const p of before) balance = round2(balance + p.dr - p.cr)
  const opening = balance

  const inWindow = postings.filter((p) => at(p.date) >= from)
  const days = new Map()
  for (const p of inWindow) {
    const key = dayKey(p.date)
    const day = days.get(key) || days.set(key, { date: at(p.date), receipts: 0, payments: 0, rows: [] }).get(key)
    day.receipts = round2(day.receipts + p.dr)
    day.payments = round2(day.payments + p.cr)
    day.rows.push(p)
  }

  const rows = [...days.values()].sort((a, b) => a.date - b.date)
  for (const day of rows) {
    day.opening = balance
    balance = round2(balance + day.receipts - day.payments)
    day.closing = balance
  }

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    from,
    to,
    head: { code: head, name: chart.glName(head) || head },
    openingSource: opened.source,
    opening,
    closing: balance,
    days: rows,
    totals: {
      receipts: round2(rows.reduce((t, d) => t + d.receipts, 0)),
      payments: round2(rows.reduce((t, d) => t + d.payments, 0)),
    },
    note: noteFor(entries.filter((e) => at(e.date) >= from)),
  })
})

/* --------------------------------------------------------------- sub day book */

// Cash_Book_Reports.aspx?rn=SDB. The day's work, grouped by the book it came
// from, with every ledger head it touched totalled underneath.
router.get('/sub-day-book', async (req, res) => {
  const { from, to } = windowOf(req.query)
  const { entries } = await entriesBetween({ branchId: req.branchId, from, to })

  const groups = new Map()
  for (const e of entries) {
    const g =
      groups.get(e.source) ||
      groups.set(e.source, { source: e.source, count: 0, amount: 0, entries: [] }).get(e.source)
    g.count += 1
    if (e.status === 'A') g.amount = round2(g.amount + e.amount)
    g.entries.push(e)
  }

  const postings = flatten(entries)
  const heads = byHead(postings)
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    from,
    to,
    groups: [...groups.values()].sort((a, b) => a.source.localeCompare(b.source)),
    heads,
    totals: {
      count: entries.length,
      dr: round2(heads.reduce((t, h) => t + h.dr, 0)),
      cr: round2(heads.reduce((t, h) => t + h.cr, 0)),
    },
    note: noteFor(entries),
  })
})

/* --------------------------------------------------------- receipts & payments */

// Day_Book_Report.aspx?t=RC. What the branch took in and what it paid out,
// each side grouped by what it was for — which is the other leg of the entry.
router.get('/day-book', async (req, res) => {
  const { from, to } = windowOf(req.query)
  const { chart, entries } = await entriesBetween({ branchId: req.branchId, from, to })

  const receipts = new Map()
  const payments = new Map()
  let received = 0
  let paid = 0
  let untraced = 0

  const add = (map, key, name, amount, pending) => {
    const row = map.get(key) || map.set(key, { glCode: pending ? '' : key, glName: name, pending, amount: 0, count: 0 }).get(key)
    row.amount = round2(row.amount + amount)
    row.count += 1
  }

  for (const e of entries) {
    if (e.status !== 'A') continue
    const tills = e.postings.filter((p) => chart.isCashOrBank(p.glCode))
    if (tills.length === 0) {
      // The money moved, but nothing in this entry says through which till.
      if (e.postings.some((p) => p.pending === 'mop.unknown')) untraced = round2(untraced + e.amount)
      continue
    }
    const inAmount = round2(tills.reduce((t, p) => t + p.dr, 0))
    const outAmount = round2(tills.reduce((t, p) => t + p.cr, 0))
    // The other legs say what the money was for.
    const others = e.postings.filter((p) => !chart.isCashOrBank(p.glCode))
    for (const p of others) {
      const key = p.glCode || `pending:${p.pending}`
      if (inAmount > 0 && p.cr > 0) add(receipts, key, p.glName, p.cr, p.pending)
      if (outAmount > 0 && p.dr > 0) add(payments, key, p.glName, p.dr, p.pending)
    }
    received = round2(received + inAmount)
    paid = round2(paid + outAmount)
  }

  const sort = (m) => [...m.values()].sort((a, b) => b.amount - a.amount)
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    from,
    to,
    receipts: sort(receipts),
    payments: sort(payments),
    totals: { received, paid, net: round2(received - paid), untraced },
    note: noteFor(entries),
  })
})

/* ------------------------------------------------------------ general ledger */

// General_Ledger.aspx. One head, what it opened on, every posting against it
// with a running balance, what it closed on.
router.get('/general-ledger', async (req, res) => {
  const { from, to } = windowOf(req.query)
  const code = String(req.query.glCode || '').trim()
  if (!code) throw httpError(400, 'Pick a GL account.')
  const gl = await GlAccount.findOne({ code })
  if (!gl) throw httpError(404, 'No GL account with that code.')

  const { entries } = await entriesBetween({ branchId: req.branchId, to })
  const postings = flatten(entries).filter((p) => p.glCode === code)

  const opened = await openingFor(req.branchId, code)
  let balance = opened.amount
  for (const p of postings.filter((x) => at(x.date) < from)) balance = round2(balance + p.dr - p.cr)
  const opening = balance

  const rows = postings
    .filter((p) => at(p.date) >= from)
    .map((p) => {
      balance = round2(balance + p.dr - p.cr)
      return { ...p, balance }
    })

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    from,
    to,
    head: gl.toSafe(),
    openingSource: opened.source,
    opening,
    closing: balance,
    rows,
    totals: {
      dr: round2(rows.reduce((t, r) => t + r.dr, 0)),
      cr: round2(rows.reduce((t, r) => t + r.cr, 0)),
    },
  })
})

/* ------------------------------------------------------------- trial balance */

// Balance_Sheet.aspx?rt=TB. Every head from inception to a date, with what it
// could not place shown as its own line rather than folded away.
router.get('/trial-balance', async (req, res) => {
  const asOn = asDate(req.query.asOn) || todayUtc()
  const { chart, entries } = await entriesBetween({ branchId: req.branchId, to: asOn })
  const postings = flatten(entries)
  const heads = byHead(postings)
  const openings = await OpeningBalance.find({ branch: req.branchId })
  const openingOf = new Map(openings.map((o) => [o.glCode, o.type === 'Dr' ? o.amount : -o.amount]))

  const rows = heads
    .filter((h) => h.glCode)
    .map((h) => {
      const opening = openingOf.get(h.glCode) || 0
      const net = round2(opening + h.dr - h.cr)
      return {
        glCode: h.glCode,
        glName: h.glName,
        category: chart.glCategory(h.glCode),
        opening: round2(opening),
        dr: h.dr,
        cr: h.cr,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? round2(-net) : 0,
      }
    })

  // Heads that only carry an opening balance still belong on a trial balance.
  for (const o of openings) {
    if (rows.some((r) => r.glCode === o.glCode)) continue
    const net = round2(o.type === 'Dr' ? o.amount : -o.amount)
    if (net === 0) continue
    rows.push({
      glCode: o.glCode,
      glName: chart.glName(o.glCode) || o.glCode,
      category: chart.glCategory(o.glCode),
      opening: net,
      dr: 0,
      cr: 0,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? round2(-net) : 0,
    })
  }
  rows.sort((a, b) => String(a.glCode).localeCompare(String(b.glCode)))

  const unplaced = heads
    .filter((h) => h.pending)
    .map((h) => ({ kind: h.pending, glName: h.glName, dr: h.dr, cr: h.cr }))

  const totals = {
    debit: round2(rows.reduce((t, r) => t + r.debit, 0)),
    credit: round2(rows.reduce((t, r) => t + r.credit, 0)),
    unplacedDr: round2(unplaced.reduce((t, r) => t + r.dr, 0)),
    unplacedCr: round2(unplaced.reduce((t, r) => t + r.cr, 0)),
  }
  totals.difference = round2(totals.debit - totals.credit)

  const byCategory = {}
  for (const r of rows) {
    const c = r.category || 'Unclassified'
    byCategory[c] = round2((byCategory[c] || 0) + r.debit - r.credit)
  }

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn,
    rows,
    unplaced,
    totals,
    byCategory,
    openingBalances: openings.length,
    note: noteFor(entries),
  })
})

/* -------------------------------------------------- balance sheet / profit & loss */

// Where each head belongs on a statement. The chart's own category is what
// decides it: a balance sheet is the assets against the liabilities, a profit
// and loss is the income against the expenditure.
const BS_SIDES = { Asset: 'assets', Liability: 'liabilities' }
const PL_SIDES = { Expenditure: 'expenditure', Income: 'income' }

router.get('/statement', async (req, res) => {
  const kind = String(req.query.rt || 'BS').toUpperCase()
  if (!['BS', 'PL'].includes(kind)) throw httpError(400, 'That is not a statement this screen draws.')
  const asOn = asDate(req.query.asOn) || todayUtc()

  const { chart, entries } = await entriesBetween({ branchId: req.branchId, to: asOn })
  const heads = byHead(flatten(entries))
  const openings = await OpeningBalance.find({ branch: req.branchId })
  const openingOf = new Map(openings.map((o) => [o.glCode, o.type === 'Dr' ? o.amount : -o.amount]))

  // Every head with a closing figure, from inception to the date.
  const closing = new Map()
  for (const h of heads) {
    if (!h.glCode) continue
    closing.set(h.glCode, round2((openingOf.get(h.glCode) || 0) + h.dr - h.cr))
  }
  for (const o of openings) {
    if (closing.has(o.glCode)) continue
    closing.set(o.glCode, round2(o.type === 'Dr' ? o.amount : -o.amount))
  }

  // The report groups from Settings, where a branch says which heads roll up
  // under which line. A head nobody grouped stands on its own.
  const settings = await ReportSetting.find({})
  const groupOf = new Map(settings.map((s) => [s.glCode, s.groupName]))

  const sides = kind === 'BS' ? BS_SIDES : PL_SIDES
  const built = {}
  for (const key of Object.values(sides)) built[key] = new Map()

  for (const [glCode, net] of closing) {
    const category = chart.glCategory(glCode)
    const side = sides[category]
    if (!side) continue
    // An asset or an expense stands as a debit, a liability or income as a
    // credit; a head sitting the other way round is shown as a negative on
    // its own side rather than quietly moved across.
    const sign = side === 'assets' || side === 'expenditure' ? 1 : -1
    const amount = round2(net * sign)
    if (amount === 0) continue
    const group = groupOf.get(glCode) || 'Not grouped'
    const rows = built[side]
    const row = rows.get(group) || rows.set(group, { group, amount: 0, heads: [] }).get(group)
    row.amount = round2(row.amount + amount)
    row.heads.push({ glCode, glName: chart.glName(glCode) || glCode, amount })
  }

  const asList = (side) =>
    [...built[side].values()]
      .map((g) => ({ ...g, heads: g.heads.sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.amount - a.amount)

  const out = {}
  const totals = {}
  for (const [category, side] of Object.entries(sides)) {
    out[side] = asList(side)
    totals[side] = round2(out[side].reduce((s, g) => s + g.amount, 0))
    out[`${side}Category`] = category
  }

  const left = kind === 'BS' ? totals.assets : totals.expenditure
  const right = kind === 'BS' ? totals.liabilities : totals.income
  // A balance sheet closes on the difference between the two sides; a profit
  // and loss closes on what is left of the income.
  totals.difference = round2(left - right)
  totals.result = kind === 'BS' ? totals.difference : round2(right - left)

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    kind,
    title: kind === 'BS' ? 'Balance Sheet' : 'Profit & Loss',
    asOn,
    ...out,
    totals,
    openingBalances: openings.length,
    groupedHeads: settings.length,
    note: noteFor(entries),
  })
})

/* --------------------------------------------------------------- form ndh3 */

// What moved on each product over a period, read off the day book: a deposit
// taken in is a credit to the product's own head, one paid back is a debit,
// and a loan is the other way round.
function movementOf(entries, chart, source, head) {
  let inAmount = 0
  let outAmount = 0
  for (const e of entries) {
    if (e.status !== 'A' || e.source !== source) continue
    for (const pp of e.postings) {
      if (!pp.glCode || pp.glCode !== head) continue
      inAmount = round2(inAmount + pp.cr)
      outAmount = round2(outAmount + pp.dr)
    }
  }
  return { in: inAmount, out: outAmount }
}

router.get('/ndh3', async (req, res) => {
  const { from, to } = windowOf(req.query)
  const dayBefore = at(new Date(from.getTime() - 86400000))

  const [branch, opening, closing, { chart, entries }] = await Promise.all([
    branchOf(req),
    outstandingAsOn({ branchId: req.branchId, asOn: dayBefore }),
    outstandingAsOn({ branchId: req.branchId, asOn: to }),
    entriesBetween({ branchId: req.branchId, from, to }),
  ])

  const sum = (rows, type) => ({
    count: rows.filter((r) => r.osType === type).length,
    amount: round2(rows.filter((r) => r.osType === type).reduce((s, r) => s + r.balance, 0)),
  })

  // Each product's own ledger head, so the movement can be read off the book.
  const headFor = (schemeCategory) => {
    const codes = new Set()
    for (const e of entries) {
      if (e.source !== schemeCategory) continue
      for (const pp of e.postings) if (pp.glCode) codes.add(pp.glCode)
    }
    return codes
  }

  const sections = []

  // Members. A Nidhi's members are its share holders.
  const membersOpen = sum(opening, 'SC')
  const membersClose = sum(closing, 'SC')
  sections.push({
    title: 'Members',
    rows: [
      { label: 'Members at the start of the period', value: membersOpen.count, kind: 'count' },
      { label: 'Members at the end of the period', value: membersClose.count, kind: 'count' },
      { label: 'Admitted during the period', value: membersClose.count - membersOpen.count, kind: 'count' },
      { label: 'Share capital held by members', value: membersClose.amount, kind: 'money' },
    ],
  })

  // Deposits — savings and term, each with what came in and went out.
  for (const [label, type, source] of [
    ['Savings deposits', 'SD', 'Savings'],
    ['Term deposits', 'FD', 'Term Deposit'],
  ]) {
    const o = sum(opening, type)
    const c = sum(closing, type)
    const heads = headFor(source)
    let moved = { in: 0, out: 0 }
    for (const h of heads) {
      if (chart.glCategory(h) !== 'Liability') continue
      const m = movementOf(entries, chart, source, h)
      moved = { in: round2(moved.in + m.in), out: round2(moved.out + m.out) }
    }
    sections.push({
      title: label,
      rows: [
        { label: 'Accounts at the start of the period', value: o.count, kind: 'count' },
        { label: 'Balance at the start of the period', value: o.amount, kind: 'money' },
        { label: 'Taken in during the period', value: moved.in, kind: 'money' },
        { label: 'Paid back during the period', value: moved.out, kind: 'money' },
        { label: 'Accounts at the end of the period', value: c.count, kind: 'count' },
        { label: 'Balance at the end of the period', value: c.amount, kind: 'money' },
      ],
    })
  }

  // Loans against gold, which is the whole of this branch's lending.
  {
    const o = sum(opening, 'JL')
    const c = sum(closing, 'JL')
    const granted = entries.filter((e) => e.status === 'A' && e.kind === 'disbursal')
    let repaid = 0
    for (const e of entries) {
      if (e.status !== 'A' || e.source !== 'Jewel Loan') continue
      for (const pp of e.postings) if (pp.label === 'Principal') repaid = round2(repaid + pp.cr)
    }
    sections.push({
      title: 'Loans against jewels',
      rows: [
        { label: 'Loans outstanding at the start of the period', value: o.count, kind: 'count' },
        { label: 'Amount outstanding at the start of the period', value: o.amount, kind: 'money' },
        { label: 'Loans granted during the period', value: granted.length, kind: 'count' },
        { label: 'Amount granted during the period', value: round2(granted.reduce((s, e) => s + e.amount, 0)), kind: 'money' },
        { label: 'Principal repaid during the period', value: repaid, kind: 'money' },
        { label: 'Loans outstanding at the end of the period', value: c.count, kind: 'count' },
        { label: 'Amount outstanding at the end of the period', value: c.amount, kind: 'money' },
      ],
    })
  }

  // What the return asks for that these books cannot answer yet, named rather
  // than guessed at.
  const openings = await OpeningBalance.countDocuments({ branch: req.branchId })
  const cannot = []
  if (openings === 0) {
    cannot.push(
      'Net Owned Funds, and every ratio built on it, needs the reserves and accumulated balances the old system closed on — enter them under Settings → GL Opening Balance.'
    )
  }
  cannot.push('The prescribed line numbering of NDH-3 is not reproduced here; check these figures against the form before filing.')

  res.json({
    branch: branch?.toSafe() || null,
    from,
    to,
    sections,
    cannot,
    note: noteFor(entries),
  })
})

/* ----------------------------------------------------------------- day end */

// What the books make of one day, and the drawer count set against it.
// Day_End_Process.aspx showed the day's receipts, payments and transaction
// count, how many jewel loans had run past their due date, and a panel to
// count the notes in the till.
async function dayEndFigures(req, on) {
  const { chart, entries } = await entriesBetween({ branchId: req.branchId, to: on })
  const cash = chart.cashCode
  const postings = flatten(entries)

  // The till as the books leave it at the close of that day.
  const opened = await openingFor(req.branchId, cash)
  let bookClosing = opened.amount
  for (const p2 of postings) if (p2.glCode === cash) bookClosing = round2(bookClosing + p2.dr - p2.cr)

  const sameDay = postings.filter((p2) => at(p2.date).getTime() === on.getTime())
  const ofDay = entries.filter((e) => at(e.date).getTime() === on.getTime())
  const receipts = round2(sameDay.filter((p2) => chart.isCashOrBank(p2.glCode)).reduce((s, p2) => s + p2.dr, 0))
  const payments = round2(sameDay.filter((p2) => chart.isCashOrBank(p2.glCode)).reduce((s, p2) => s + p2.cr, 0))

  // Jewel loans past their due date on that day, which is what the old
  // screen's "JL OD" pair counted.
  const overdue = await JewelLoan.find({ branch: req.branchId, status: 'A', dueDate: { $lt: on } }).select(
    'principalBalance'
  )

  return {
    cash: { code: cash, name: chart.cashName },
    openingSource: opened.source,
    bookClosing,
    receipts,
    payments,
    transactions: ofDay.filter((e) => e.status === 'A').length,
    cancelled: ofDay.filter((e) => e.status !== 'A').length,
    jlOdCount: overdue.length,
    jlOdAmount: round2(overdue.reduce((s, l) => s + l.principalBalance, 0)),
    note: noteFor(ofDay),
  }
}

router.get('/day-end', async (req, res) => {
  const on = asDate(req.query.on) || todayUtc()
  const [figures, closed, branch] = await Promise.all([
    dayEndFigures(req, on),
    DayEnd.findOne({ branch: req.branchId, on }),
    branchOf(req),
  ])
  res.json({
    branch: branch?.toSafe() || null,
    on,
    ...figures,
    denominations: DENOMINATIONS,
    closed: closed ? closed.toJSONSafe() : null,
    // Nothing verifies transactions yet, so this is not a figure we can give.
    pendingApproval: null,
  })
})

router.post('/day-end', requireAdmin, async (req, res) => {
  const b = req.body || {}
  const on = asDate(b.on) || todayUtc()
  if (on > todayUtc()) throw httpError(400, 'A day cannot be closed before it has happened.')

  const counted = []
  for (const d of DENOMINATIONS) {
    const count = Math.max(0, Math.floor(num(b.counts?.[d.key])))
    counted.push({ key: d.key, value: d.value, count, total: round2(count * d.value) })
  }
  const countedTotal = round2(counted.reduce((s, c) => s + c.total, 0))

  const figures = await dayEndFigures(req, on)
  const doc = await DayEnd.findOneAndUpdate(
    { branch: req.branchId, on },
    {
      $set: {
        denominations: counted,
        countedTotal,
        bookClosing: figures.bookClosing,
        difference: round2(countedTotal - figures.bookClosing),
        receipts: figures.receipts,
        payments: figures.payments,
        transactions: figures.transactions,
        jlOdCount: figures.jlOdCount,
        jlOdAmount: figures.jlOdAmount,
        narration: String(b.narration || '').trim(),
        closedBy: req.user?._id,
      },
      $setOnInsert: { branch: req.branchId, on },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  res.json({ dayEnd: doc.toJSONSafe() })
})

/* ------------------------------------------------------------------- helpers */

// Where a head's running balance starts. The old system's closing figures were
// never brought across, so for now this is almost always nothing — and the
// screens say which it is rather than letting a zero pass for a fact.
async function openingFor(branchId, glCode) {
  const ob = await OpeningBalance.findOne({ branch: branchId, glCode })
  if (!ob) return { amount: 0, source: 'none' }
  return { amount: round2(ob.type === 'Dr' ? ob.amount : -ob.amount), source: 'opening-balance' }
}

export default router
