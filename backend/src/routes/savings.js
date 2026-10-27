import { Router } from 'express'
import mongoose from 'mongoose'
import SavingsAccount, { MOP } from '../models/SavingsAccount.js'
import SavingsTransaction from '../models/SavingsTransaction.js'
import Customer from '../models/Customer.js'
import Branch from '../models/Branch.js'
import Counter from '../models/Counter.js'
import Scheme from '../models/Scheme.js'
import GlAccount from '../models/GlAccount.js'
import InterestSlab from '../models/InterestSlab.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { registerAccountSource } from '../lib/accounts.js'
import { round2, at, daysBetween } from '../lib/loanMath.js'

const router = Router()
router.use(requireAuth)

// Savings account numbers ran 201200209 — the branch code, then a running
// number of its own that started in the two-hundred-thousands.
const ACC_NO_START = 200001

const branchOf = (req) => Branch.findById(req.branchId)
const num = (v, d = 0) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? d : Number(v))
const asDate = (v) => (v ? at(v) : null)
const todayUtc = () => at(new Date())

async function findAccount(req, id = req.params.id) {
  const where = mongoose.isValidObjectId(id) ? { _id: id } : { accNo: id }
  const acc = await SavingsAccount.findOne({ ...where, branch: req.branchId })
  if (!acc) throw httpError(404, 'No such savings account in this branch.')
  return acc
}

/* --------------------------------------------------------------- interest */

// Interest is worked out on the balance standing each day, which is how a
// savings account has been reckoned since the daily-balance rule came in.
// Returns the rupee-days over the window and the balance it ended on.
function productOver(opening, txns, from, to) {
  let balance = round2(opening)
  let cursor = at(from)
  let product = 0
  for (const t of txns) {
    const on = at(t.transDate)
    if (on > at(to)) break
    const days = daysBetween(cursor, on)
    product += balance * days
    balance = round2(balance + (t.type === 'Credit' ? t.amount : -t.amount))
    cursor = on
  }
  // The last stretch runs to the closing day inclusive.
  product += balance * (daysBetween(cursor, to) + 1)
  return { product: round2(product), closing: balance }
}

const interestOn = (product, rate) => round2((product * (Number(rate) || 0)) / 36500)

// Everything posted on an account inside a window, oldest first.
const txnsOf = (accountId, from, to) =>
  SavingsTransaction.find({
    account: accountId,
    status: 'A',
    ...(from || to
      ? { transDate: { ...(from ? { $gte: at(from) } : {}), ...(to ? { $lte: at(to) } : {}) } }
      : {}),
  }).sort({ transDate: 1, createdAt: 1 })

// The balance at the END of a day — what a statement would show for it,
// including anything paid in or out that same day.
async function balanceAsOn(acc, on) {
  return rollBack(acc, { $gt: at(on) })
}

// The balance BEFORE a day opens. This is what an interest window starts
// from, because the window then replays that day's own transactions.
async function balanceBefore(acc, on) {
  return rollBack(acc, { $gte: at(on) })
}

// Today's balance, with everything matching `when` taken back off it.
async function rollBack(acc, when) {
  const later = await SavingsTransaction.find({ account: acc._id, status: 'A', transDate: when })
  let b = acc.balance
  for (const t of later) b = t.type === 'Credit' ? b - t.amount : b + t.amount
  return round2(b)
}

const dayAfter = (d) => at(new Date(at(d).getTime() + 86400000))

// Where an account's interest window opens: not before the account existed,
// not before the period asked for, and not back over interest already paid.
function windowStart(acc, from) {
  const opened = at(acc.openDate)
  let start = from > opened ? from : opened
  if (acc.interestUpto) {
    const next = dayAfter(acc.interestUpto)
    if (next > start) start = next
  }
  return start
}

/* --------------------------------------------------------------- listing */

router.get('/', async (req, res) => {
  const { q = '', page = 1, limit = 25, status = '', scheme = '' } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  if (scheme) find.schemeCode = scheme
  const term = String(q).trim()
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i')
    find.$or = [{ accNo: rx }, { customerName: rx }, { custId: rx }]
  }
  const perPage = Math.min(num(limit, 25), 200)
  const skip = (Math.max(num(page, 1), 1) - 1) * perPage
  const [rows, total] = await Promise.all([
    SavingsAccount.find(find).sort({ accNo: -1 }).skip(skip).limit(perPage),
    SavingsAccount.countDocuments(find),
  ])
  res.json({ accounts: rows.map((a) => a.toRow()), total, page: num(page, 1), limit: perPage })
})

router.get('/new', async (req, res) => {
  const [schemes, bankAccounts, branch, cash] = await Promise.all([
    Scheme.find({ category: 'SD', status: 'A' }).sort({ code: 1 }),
    GlAccount.find({ active: true, isBankAccount: true }).sort({ name: 1 }),
    branchOf(req),
    GlAccount.findOne({ active: true, name: /cash on hand/i }),
  ])
  const seq = await Counter.peek(`${req.branchId}:savings`, ACC_NO_START)
  const trans = await Counter.peek(`${req.branchId}:trans`, 1)
  // The rate a new account opens on comes from the scheme's latest slab.
  const slabs = await InterestSlab.find({ schemeCode: { $in: schemes.map((s) => s.code) } }).sort({
    effectDate: -1,
  })
  const rateByScheme = {}
  for (const s of slabs) if (rateByScheme[s.schemeCode] === undefined) rateByScheme[s.schemeCode] = s.rate
  res.json({
    accNo: `${branch?.code || ''}${seq}`,
    transId: String(trans),
    schemes: schemes.map((s) => s.toSafe()),
    rateByScheme,
    glAccounts: [...(cash ? [cash] : []), ...bankAccounts.filter((g) => !cash || !g._id.equals(cash._id))].map(
      (g) => ({ code: g.code, name: g.name })
    ),
    mops: MOP,
    branch: branch?.toSafe() || null,
  })
})

router.get('/lookup/:accNo', async (req, res) => {
  const acc = await SavingsAccount.findOne({ branch: req.branchId, accNo: req.params.accNo })
  if (!acc) throw httpError(404, 'No savings account with that number in this branch.')
  res.json({ account: acc.toJSONSafe() })
})

/* -------------------------------------------------------------- creation */

router.post('/', async (req, res) => {
  const b = req.body || {}
  const customer = await Customer.findOne({ branch: req.branchId, custId: String(b.custId || '') })
  if (!customer) throw httpError(400, 'Enter a valid customer id.')

  // Joint holders are looked up too, so a mistyped id is caught at the door.
  const jointIds = (Array.isArray(b.jointCustIds) ? b.jointCustIds : []).map(String).filter(Boolean)
  const joints = jointIds.length
    ? await Customer.find({ branch: req.branchId, custId: { $in: jointIds } })
    : []
  const missing = jointIds.filter((id) => !joints.some((c) => c.custId === id))
  if (missing.length) throw httpError(400, `No customer with id ${missing.join(', ')} in this branch.`)

  const branch = await branchOf(req)
  const seq = await Counter.next(`${req.branchId}:savings`, ACC_NO_START)
  const scheme = b.schemeCode ? await Scheme.findOne({ code: b.schemeCode }) : null
  const openDate = asDate(b.openDate) || todayUtc()

  const acc = await SavingsAccount.create({
    branch: req.branchId,
    accNo: `${branch.code}${seq}`,
    customer: customer._id,
    custId: customer.custId,
    customerName: customer.name,
    jointCustIds: jointIds,
    jointNames: jointIds.map((id) => joints.find((c) => c.custId === id)?.name || ''),
    schemeCode: b.schemeCode || '',
    schemeName: scheme?.name || '',
    openDate,
    mop: MOP.includes(b.mop) ? b.mop : 'S',
    minor: { name: b.minor?.name || '', dob: asDate(b.minor?.dob) },
    nominee: {
      name: b.nominee?.name || '',
      relation: b.nominee?.relation || '',
      age: num(b.nominee?.age, undefined),
      dob: asDate(b.nominee?.dob),
    },
    interestRate: num(b.interestRate),
    // Left unset on purpose: nothing has been paid yet, and setting it to the
    // opening day would say the opening day was already settled.
    interestUpto: undefined,
    balance: 0,
    narration: b.narration || '',
    createdBy: req.user._id,
  })
  res.status(201).json({ account: acc.toJSONSafe() })
})

/* ------------------------------------------------------------ one record */

router.get('/:id', async (req, res) => {
  const acc = await findAccount(req)
  const [customer, txns, branch] = await Promise.all([
    Customer.findById(acc.customer),
    SavingsTransaction.find({ account: acc._id }).sort({ transDate: -1, createdAt: -1 }).limit(100),
    branchOf(req),
  ])
  res.json({
    account: acc.toJSONSafe(),
    customer: customer ? customer.toJSONSafe() : null,
    transactions: txns.map((t) => t.toJSONSafe()),
    branch: branch?.toSafe() || null,
  })
})

router.put('/:id', requireAdmin, async (req, res) => {
  const acc = await findAccount(req)
  const b = req.body || {}
  // The terms can be corrected, but not the money: that only moves through a
  // transaction, so there is always a row behind every rupee.
  for (const f of ['schemeCode', 'narration']) if (b[f] !== undefined) acc[f] = b[f]
  if (b.mop !== undefined && MOP.includes(b.mop)) acc.mop = b.mop
  if (b.openDate) acc.openDate = asDate(b.openDate)
  if (b.interestRate !== undefined) acc.interestRate = num(b.interestRate)
  if (b.minor) acc.minor = { name: b.minor.name || '', dob: asDate(b.minor.dob) }
  if (b.nominee) {
    acc.nominee = {
      name: b.nominee.name || '',
      relation: b.nominee.relation || '',
      age: num(b.nominee.age, undefined),
      dob: asDate(b.nominee.dob),
    }
  }
  if (b.verified !== undefined) acc.verified = !!b.verified
  acc.updatedBy = req.user._id
  await acc.save()
  res.json({ account: acc.toJSONSafe() })
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const acc = await findAccount(req)
  const moved = await SavingsTransaction.countDocuments({ account: acc._id, status: 'A' })
  if (moved > 0) throw httpError(409, 'This account has transactions against it and cannot be deleted.')
  await acc.deleteOne()
  res.json({ ok: true })
})

/* ---------------------------------------------------------- transactions */

async function post(acc, req, { type, amount, transDate, glCode, mop, narration, kind = 'normal' }) {
  const value = round2(amount)
  if (value <= 0) throw httpError(400, 'Enter an amount.')
  if (type === 'Debit' && value > acc.balance + 0.001) {
    throw httpError(400, `There is only ${acc.balance.toFixed(2)} in this account.`)
  }
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  const balance = round2(acc.balance + (type === 'Credit' ? value : -value))

  const txn = await SavingsTransaction.create({
    branch: req.branchId,
    account: acc._id,
    accNo: acc.accNo,
    custId: acc.custId,
    customerName: acc.customerName,
    transId: String(transSeq),
    transDate,
    type,
    amount: value,
    glCode: glCode || '',
    mop: mop || acc.mop,
    kind,
    balance,
    narration: narration || '',
    createdBy: req.user._id,
  })

  acc.balance = balance
  // The list shows the latest movement, so it only ever goes forward.
  if (!acc.lastTranDate || transDate > acc.lastTranDate) acc.lastTranDate = transDate
  await acc.save()
  return txn
}

router.post('/:id/transactions', async (req, res) => {
  const acc = await findAccount(req)
  if (acc.status === 'C') throw httpError(409, 'This account is closed.')
  const b = req.body || {}
  const type = b.type === 'Debit' ? 'Debit' : 'Credit'
  const txn = await post(acc, req, {
    type,
    amount: num(b.amount),
    transDate: asDate(b.transDate) || todayUtc(),
    glCode: b.glCode,
    mop: b.mop,
    narration: b.narration,
  })
  res.status(201).json({ transaction: txn.toJSONSafe(), account: acc.toJSONSafe() })
})

// The day book of savings movements.
router.get('/transactions/list', async (req, res) => {
  const { from = '', to = '', accNo = '', type = '', status = 'A', limit = 200 } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  if (accNo) find.accNo = accNo
  if (type) find.type = type
  if (from || to) {
    find.transDate = {}
    if (from) find.transDate.$gte = at(from)
    if (to) find.transDate.$lte = at(to)
  }
  const rows = await SavingsTransaction.find(find)
    .sort({ transDate: -1, createdAt: -1 })
    .limit(Math.min(num(limit, 200), 1000))
  res.json({
    transactions: rows.map((t) => t.toJSONSafe()),
    count: rows.length,
    credit: round2(rows.filter((t) => t.type === 'Credit').reduce((t, x) => t + x.amount, 0)),
    debit: round2(rows.filter((t) => t.type === 'Debit').reduce((t, x) => t + x.amount, 0)),
  })
})

// A wrong entry is reversed, never erased.
router.post('/transactions/:id/cancel', requireAdmin, async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 4) throw httpError(400, 'Give a reason for cancelling this transaction.')
  const txn = await SavingsTransaction.findOne({ _id: req.params.id, branch: req.branchId })
  if (!txn) throw httpError(404, 'No such transaction.')
  if (txn.status === 'cancelled') throw httpError(409, 'That transaction is already cancelled.')

  const acc = await SavingsAccount.findById(txn.account)
  if (acc) {
    const later = await SavingsTransaction.countDocuments({
      account: acc._id,
      status: 'A',
      _id: { $ne: txn._id },
      transDate: { $gt: txn.transDate },
    })
    if (later > 0) throw httpError(409, 'Cancel the later transactions on this account first.')
    const back = round2(acc.balance + (txn.type === 'Credit' ? -txn.amount : txn.amount))
    if (back < 0) throw httpError(409, 'Reversing this would leave the account overdrawn.')
    acc.balance = back
    const prev = await SavingsTransaction.findOne({
      account: acc._id,
      status: 'A',
      _id: { $ne: txn._id },
    }).sort({ transDate: -1, createdAt: -1 })
    acc.lastTranDate = prev?.transDate || undefined
    if (txn.kind === 'closure') {
      acc.status = 'A'
      acc.closedDate = undefined
      acc.closureCharges = 0
    }
    await acc.save()
  }

  txn.status = 'cancelled'
  txn.cancelReason = reason
  txn.cancelledAt = new Date()
  txn.cancelledBy = req.user._id
  await txn.save()
  res.json({ transaction: txn.toJSONSafe(), account: acc ? acc.toJSONSafe() : null })
})

/* -------------------------------------------------------------- closure */

// What it takes to close an account today: the balance, plus interest earned
// since the last posting, less whatever the branch charges.
router.get('/:id/closure-quote', async (req, res) => {
  const acc = await findAccount(req)
  const on = req.query.asOn ? at(req.query.asOn) : todayUtc()
  const from = windowStart(acc, at(acc.openDate))
  const opening = await balanceBefore(acc, from)
  const txns = await txnsOf(acc._id, from, on)
  const { product } = productOver(opening, txns, from, on)
  const interest = interestOn(product, acc.interestRate)
  res.json({
    account: acc.toJSONSafe(),
    asOn: on,
    interestFrom: from,
    balance: acc.balance,
    interest,
    payable: round2(acc.balance + interest),
  })
})

router.post('/:id/close', async (req, res) => {
  const acc = await findAccount(req)
  if (acc.status === 'C') throw httpError(409, 'That account is already closed.')
  const b = req.body || {}
  const transDate = asDate(b.transDate) || todayUtc()
  const interest = round2(num(b.interest))
  const charges = round2(num(b.closureCharges))

  if (interest > 0) {
    await post(acc, req, {
      type: 'Credit',
      amount: interest,
      transDate,
      glCode: b.glCode,
      narration: 'Interest on closure',
      kind: 'interest',
    })
  }
  if (charges > 0) {
    await post(acc, req, {
      type: 'Debit',
      amount: charges,
      transDate,
      glCode: b.glCode,
      narration: 'Closure charges',
      kind: 'closure',
    })
  }
  // Whatever is left is paid out, which takes the account to nil.
  const payout = acc.balance
  if (payout > 0) {
    await post(acc, req, {
      type: 'Debit',
      amount: payout,
      transDate,
      glCode: b.glCode,
      narration: b.narration || 'Account closed',
      kind: 'closure',
    })
  }

  acc.status = 'C'
  acc.closedDate = transDate
  acc.closureCharges = charges
  acc.interestUpto = transDate
  await acc.save()
  res.json({ account: acc.toJSONSafe(), paidOut: round2(payout) })
})

/* ------------------------------------------------- half-yearly interest */

// Work out what each account has earned over a period, without posting it —
// the Go button of the old Half-yearly Product screen.
router.get('/product/preview', async (req, res) => {
  const { from = '', to = '', scheme = '' } = req.query
  if (!from || !to) throw httpError(400, 'Give the period the interest is for.')
  const fromDate = at(from)
  const toDate = at(to)
  if (toDate < fromDate) throw httpError(400, 'The closing date is before the opening one.')

  const find = { branch: req.branchId, status: 'A' }
  if (scheme) find.schemeCode = scheme
  const accounts = await SavingsAccount.find(find).sort({ accNo: 1 })

  const rows = []
  for (const acc of accounts) {
    // Only the part of the window this account was open for, and not back
    // over interest it has already been paid.
    const start = windowStart(acc, fromDate)
    if (start > toDate) continue
    const opening = await balanceBefore(acc, start)
    const txns = await txnsOf(acc._id, start, toDate)
    const { product, closing } = productOver(opening, txns, start, toDate)
    const interest = interestOn(product, acc.interestRate)
    if (interest <= 0) continue
    rows.push({
      ...acc.toRow(),
      from: start,
      to: toDate,
      opening,
      closing,
      product,
      interest,
      alreadyPaidUpto: acc.interestUpto,
    })
  }

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    from: fromDate,
    to: toDate,
    rows,
    totals: {
      count: rows.length,
      product: round2(rows.reduce((t, r) => t + r.product, 0)),
      interest: round2(rows.reduce((t, r) => t + r.interest, 0)),
    },
  })
})

// Post it. Each account gets one credit, and its interest clock moves on.
router.post('/product/post', requireAdmin, async (req, res) => {
  const b = req.body || {}
  const from = asDate(b.from)
  const to = asDate(b.to)
  if (!from || !to) throw httpError(400, 'Give the period the interest is for.')

  const find = { branch: req.branchId, status: 'A' }
  if (b.scheme) find.schemeCode = b.scheme
  const accounts = await SavingsAccount.find(find).sort({ accNo: 1 })

  let posted = 0
  let total = 0
  let skipped = 0
  for (const acc of accounts) {
    // An account already paid up to this date must not be paid twice.
    if (acc.interestUpto && at(acc.interestUpto) >= to) {
      skipped++
      continue
    }
    const start = windowStart(acc, from)
    if (start > to) {
      skipped++
      continue
    }
    const opening = await balanceBefore(acc, start)
    const txns = await txnsOf(acc._id, start, to)
    const { product } = productOver(opening, txns, start, to)
    const interest = interestOn(product, acc.interestRate)
    if (interest <= 0) {
      acc.interestUpto = to
      await acc.save()
      continue
    }
    await post(acc, req, {
      type: 'Credit',
      amount: interest,
      transDate: to,
      glCode: b.glCode,
      narration: `Interest ${start.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
      kind: 'interest',
    })
    acc.interestUpto = to
    await acc.save()
    posted++
    total = round2(total + interest)
  }

  res.json({ posted, skipped, total })
})

/* -------------------------------------------------------------- reports */

// One account's passbook.
router.get('/:id/statement', async (req, res) => {
  const acc = await findAccount(req)
  const { from = '', to = '' } = req.query
  const fromDate = from ? at(from) : null
  const toDate = to ? at(to) : null

  const all = await SavingsTransaction.find({ account: acc._id, status: 'A' }).sort({
    transDate: 1,
    createdAt: 1,
  })
  const before = fromDate ? all.filter((t) => at(t.transDate) < fromDate) : []
  const inRange = all.filter(
    (t) => (!fromDate || at(t.transDate) >= fromDate) && (!toDate || at(t.transDate) <= toDate)
  )

  let balance = round2(before.reduce((b, t) => b + (t.type === 'Credit' ? t.amount : -t.amount), 0))
  const opening = balance
  const lines = inRange.map((t) => {
    balance = round2(balance + (t.type === 'Credit' ? t.amount : -t.amount))
    return {
      id: t._id.toString(),
      transId: t.transId,
      transDate: t.transDate,
      particulars: t.narration || (t.type === 'Credit' ? 'Deposit' : 'Withdrawal'),
      credit: t.type === 'Credit' ? t.amount : 0,
      debit: t.type === 'Debit' ? t.amount : 0,
      balance,
      kind: t.kind,
    }
  })

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    account: acc.toJSONSafe(),
    from: fromDate,
    to: toDate,
    opening,
    lines,
    totals: {
      count: lines.length,
      credit: round2(lines.reduce((t, l) => t + l.credit, 0)),
      debit: round2(lines.reduce((t, l) => t + l.debit, 0)),
      closing: balance,
    },
  })
})

// O/s as on — what each account held on a chosen day.
router.get('/reports/outstanding', async (req, res) => {
  const { asOn = '', scheme = '' } = req.query
  const on = asOn ? at(asOn) : todayUtc()
  const find = {
    branch: req.branchId,
    openDate: { $lte: on },
    $or: [{ status: 'A' }, { closedDate: { $gt: on } }, { closedDate: null }],
  }
  if (scheme) find.schemeCode = scheme
  const accounts = await SavingsAccount.find(find).sort({ accNo: 1 })

  const rows = []
  for (const acc of accounts) {
    const balance = await balanceAsOn(acc, on)
    if (balance <= 0) continue
    rows.push({ ...acc.toRow(), balance })
  }
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn: on,
    rows,
    totals: { count: rows.length, balance: round2(rows.reduce((t, r) => t + r.balance, 0)) },
  })
})

// The filtered list behind the old Savings_Reports.aspx.
router.get('/reports/list', async (req, res) => {
  const {
    scheme = '', active = '1', closed = '0',
    accFrom = '', accTo = '', openFrom = '', openTo = '',
    balCond = '', balV1 = '', balV2 = '',
  } = req.query

  const find = { branch: req.branchId }
  if (scheme) find.schemeCode = scheme
  const wanted = []
  if (active === '1') wanted.push('A')
  if (closed === '1') wanted.push('C')
  if (wanted.length === 0) return res.json({ rows: [], totals: { count: 0, balance: 0 } })
  if (wanted.length === 1) find.status = wanted[0]
  if (accFrom || accTo) {
    find.accNo = {}
    if (accFrom) find.accNo.$gte = String(accFrom)
    if (accTo) find.accNo.$lte = String(accTo)
  }
  if (openFrom || openTo) {
    find.openDate = {}
    if (openFrom) find.openDate.$gte = at(openFrom)
    if (openTo) find.openDate.$lte = at(openTo)
  }

  const accounts = await SavingsAccount.find(find).sort({ accNo: 1 }).limit(10000)
  const a = num(balV1)
  const c = num(balV2)
  const passes = (v) => {
    if (!balCond) return true
    if (balCond === '>') return v > a
    if (balCond === '>=') return v >= a
    if (balCond === '<') return v < a
    if (balCond === '<=') return v <= a
    if (balCond === 'between') return v >= Math.min(a, c) && v <= Math.max(a, c)
    return true
  }
  const rows = accounts.filter((x) => passes(x.balance)).map((x) => x.toRow())

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    rows,
    totals: { count: rows.length, balance: round2(rows.reduce((t, r) => t + r.balance, 0)) },
  })
})

/* ---------------------------------------------- customer enquiry / reports */

registerAccountSource({
  accType: 'Savings',
  schemeType: 'SD',
  load: async ({ branchId, customer }) => {
    const rows = await SavingsAccount.find({ branch: branchId, customer: customer._id }).sort({ openDate: -1 })
    return rows.map((a) => ({
      accNo: a.accNo,
      scheme: a.schemeName || a.schemeCode,
      openDate: a.openDate,
      dueDate: null,
      period: '',
      balance: a.balance,
      status: a.status === 'C' ? 'Closed' : 'Active',
    }))
  },
})

export default router
