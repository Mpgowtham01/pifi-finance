import { Router } from 'express'
import mongoose from 'mongoose'
import FixedDeposit, { REPAYMENT, MOP, COMPOUNDING } from '../models/FixedDeposit.js'
import DepositTransaction from '../models/DepositTransaction.js'
import Customer from '../models/Customer.js'
import Branch from '../models/Branch.js'
import Counter from '../models/Counter.js'
import Scheme from '../models/Scheme.js'
import GlAccount from '../models/GlAccount.js'
import InterestSlab from '../models/InterestSlab.js'
import DepositPeriod from '../models/DepositPeriod.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { registerAccountSource } from '../lib/accounts.js'
import { registerPostingSource, dr, cr, pendingDr, pendingCr } from '../lib/glLedger.js'
import { round2, at, addMonths, daysBetween } from '../lib/loanMath.js'

const router = Router()
router.use(requireAuth)

// Term deposit account numbers follow the house pattern: the branch code,
// then a running number of its own. Savings started in the two-hundred
// thousands, shares in the hundred thousands; deposits take the three.
const ACC_NO_START = 300001

const branchOf = (req) => Branch.findById(req.branchId)
const num = (v, d = 0) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? d : Number(v))
const asDate = (v) => (v ? at(v) : null)
const todayUtc = () => at(new Date())

async function findDeposit(req, id = req.params.id) {
  const where = mongoose.isValidObjectId(id) ? { _id: id } : { accNo: id }
  const fd = await FixedDeposit.findOne({ ...where, branch: req.branchId })
  if (!fd) throw httpError(404, 'No such deposit in this branch.')
  return fd
}

/* ------------------------------------------------------------- the maths */

// How many times a year interest is added to itself.
const TIMES_A_YEAR = { M: 12, Q: 4, H: 2, Y: 1 }

/**
 * What a deposit grows to over its term.
 * Simple where the scheme does not compound — which is how the old screen
 * had it, offering "N-No" and nothing else — and compounded where it does,
 * as a cumulative deposit must be.
 */
export function maturityOf({ amount, rate, months, compounding = 'N' }) {
  const principal = round2(amount)
  const years = num(months) / 12
  if (!TIMES_A_YEAR[compounding]) {
    const interest = round2((principal * num(rate) * num(months)) / 1200)
    return { interest, maturity: round2(principal + interest) }
  }
  const n = TIMES_A_YEAR[compounding]
  const maturity = round2(principal * (1 + num(rate) / (100 * n)) ** (n * years))
  return { interest: round2(maturity - principal), maturity }
}

// Interest over a stretch of days, simple, on the deposit itself. This is
// what a payout covers, so it never compounds.
const accruedBetween = (amount, rate, from, to) =>
  round2((num(amount) * num(rate) * daysBetween(from, to)) / 36500)

// Where an interest payout starts: the day after the last one, and otherwise
// the day the deposit started earning.
function payoutStart(fd) {
  const began = at(fd.effectDate || fd.openDate)
  if (!fd.interestUpto) return began
  const next = at(new Date(at(fd.interestUpto).getTime() + 86400000))
  return next > began ? next : began
}

/* --------------------------------------------------------------- listing */

router.get('/', async (req, res) => {
  const { q = '', field = 'name', scheme = '', status = '', page = 1, limit = 25, maturing = '' } = req.query
  const find = { branch: req.branchId }
  if (scheme) find.schemeCode = scheme
  if (status) find.status = status
  if (maturing === '1') {
    find.status = 'A'
    find.maturityDate = { $lte: todayUtc() }
  }
  const term = String(q).trim()
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i')
    const byField = { name: 'customerName', accNo: 'accNo', oldAccNo: 'oldAccNo', custId: 'custId' }
    find[byField[field] || 'customerName'] = rx
  }
  const perPage = Math.min(num(limit, 25), 200)
  const skip = (Math.max(num(page, 1), 1) - 1) * perPage
  const [rows, total] = await Promise.all([
    FixedDeposit.find(find).sort({ accNo: -1 }).skip(skip).limit(perPage),
    FixedDeposit.countDocuments(find),
  ])
  res.json({ deposits: rows.map((d) => d.toRow()), total, page: num(page, 1), limit: perPage })
})

router.get('/new', async (req, res) => {
  const [schemes, bankAccounts, periods, branch, cash] = await Promise.all([
    Scheme.find({ category: 'FD', status: 'A' }).sort({ code: 1 }),
    GlAccount.find({ active: true, isBankAccount: true }).sort({ name: 1 }),
    DepositPeriod.find().sort({ createdAt: 1 }),
    branchOf(req),
    GlAccount.findOne({ active: true, name: /cash on hand/i }),
  ])
  const seq = await Counter.peek(`${req.branchId}:deposit`, ACC_NO_START)
  const trans = await Counter.peek(`${req.branchId}:trans`, 1)

  // The rate a deposit opens on comes from its scheme's slabs, which are
  // kept per period band.
  const slabs = await InterestSlab.find({ schemeCode: { $in: schemes.map((s) => s.code) } }).sort({
    effectDate: -1,
  })
  const ratesByScheme = {}
  for (const s of slabs) {
    if (!ratesByScheme[s.schemeCode]) ratesByScheme[s.schemeCode] = []
    // Only the newest slab per period band.
    if (!ratesByScheme[s.schemeCode].some((x) => x.period === s.period)) {
      ratesByScheme[s.schemeCode].push({
        period: s.period,
        rate: s.rate,
        srCtznRate: s.srCtznRate,
      })
    }
  }

  res.json({
    accNo: `${branch?.code || ''}${seq}`,
    transId: String(trans),
    schemes: schemes.map((s) => s.toSafe()),
    ratesByScheme,
    periods: periods.map((p) => (p.toSafe ? p.toSafe() : p)),
    glAccounts: [...(cash ? [cash] : []), ...bankAccounts.filter((g) => !cash || !g._id.equals(cash._id))].map(
      (g) => ({ code: g.code, name: g.name })
    ),
    mops: MOP,
    repayments: REPAYMENT,
    compoundings: COMPOUNDING,
    branch: branch?.toSafe() || null,
  })
})

// What a deposit of this shape would be worth, before anything is saved.
router.get('/quote', async (req, res) => {
  const amount = num(req.query.amount)
  const rate = num(req.query.rate)
  const months = num(req.query.months)
  const compounding = COMPOUNDING.includes(req.query.compounding) ? req.query.compounding : 'N'
  const repayment = REPAYMENT.includes(req.query.repayment) ? req.query.repayment : 'M'
  const openDate = asDate(req.query.openDate) || todayUtc()

  const grown = maturityOf({ amount, rate, months, compounding })
  // Interest taken out along the way never gets the chance to grow, so the
  // deposit matures at what was put in.
  const paidOut = repayment !== 'M'
  res.json({
    maturityDate: addMonths(openDate, months),
    projectedInterest: paidOut ? round2((amount * rate * months) / 1200) : grown.interest,
    maturityAmount: paidOut ? round2(amount) : grown.maturity,
    perPayout: paidOut
      ? round2((amount * rate * (repayment === '1A' ? 1 : 3)) / 1200)
      : 0,
  })
})

router.get('/lookup/:accNo', async (req, res) => {
  const fd = await FixedDeposit.findOne({ branch: req.branchId, accNo: req.params.accNo })
  if (!fd) throw httpError(404, 'No deposit with that number in this branch.')
  res.json({ deposit: fd.toJSONSafe() })
})

/* -------------------------------------------------------------- creation */

async function openDeposit(req, b, { renewedFrom = '' } = {}) {
  const customer = await Customer.findOne({ branch: req.branchId, custId: String(b.custId || '') })
  if (!customer) throw httpError(400, 'Enter a valid customer id.')

  const jointIds = (Array.isArray(b.jointCustIds) ? b.jointCustIds : []).map(String).filter(Boolean)
  const joints = jointIds.length
    ? await Customer.find({ branch: req.branchId, custId: { $in: jointIds } })
    : []
  const missing = jointIds.filter((id) => !joints.some((c) => c.custId === id))
  if (missing.length) throw httpError(400, `No customer with id ${missing.join(', ')} in this branch.`)

  const depositAmount = num(b.depositAmount)
  if (depositAmount <= 0) throw httpError(400, 'Enter the deposit amount.')
  const periodMonths = num(b.periodMonths)
  if (periodMonths <= 0) throw httpError(400, 'Choose how long the deposit runs for.')

  const openDate = asDate(b.openDate) || todayUtc()
  const effectDate = asDate(b.effectDate) || openDate
  const compounding = COMPOUNDING.includes(b.compounding) ? b.compounding : 'N'
  const interestRepayment = REPAYMENT.includes(b.interestRepayment) ? b.interestRepayment : 'M'
  const rate = num(b.interestRate)

  const grown = maturityOf({ amount: depositAmount, rate, months: periodMonths, compounding })
  const paidOut = interestRepayment !== 'M'

  const branch = await branchOf(req)
  const seq = await Counter.next(`${req.branchId}:deposit`, ACC_NO_START)
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  const scheme = b.schemeCode ? await Scheme.findOne({ code: b.schemeCode }) : null

  const fd = await FixedDeposit.create({
    branch: req.branchId,
    accNo: `${branch.code}${seq}`,
    oldAccNo: b.oldAccNo || '',
    customer: customer._id,
    custId: customer.custId,
    customerName: customer.name,
    jointCustIds: jointIds,
    jointNames: jointIds.map((id) => joints.find((c) => c.custId === id)?.name || ''),
    schemeCode: b.schemeCode || '',
    schemeName: scheme?.name || '',
    mop: MOP.includes(b.mop) ? b.mop : 'S',
    openDate,
    effectDate,
    periodMonths,
    maturityDate: asDate(b.maturityDate) || addMonths(effectDate, periodMonths),
    depositAmount,
    interestRate: rate,
    compounding,
    interestRepayment,
    intPaymentMode: b.intPaymentMode || 'Cash',
    intPayoutMode: b.intPayoutMode || 'D2D',
    neftBank: b.neftBank || '',
    neftBranch: b.neftBranch || '',
    neftIfsc: b.neftIfsc || '',
    neftAccNo: b.neftAccNo || '',
    maturityAmount: paidOut ? depositAmount : grown.maturity,
    projectedInterest: paidOut ? round2((depositAmount * rate * periodMonths) / 1200) : grown.interest,
    interestUpto: undefined,
    glCode: b.glCode || '',
    minor: { name: b.minor?.name || '', dob: asDate(b.minor?.dob) },
    nominee: {
      name: b.nominee?.name || '',
      relation: b.nominee?.relation || '',
      age: num(b.nominee?.age, undefined),
      dob: asDate(b.nominee?.dob),
    },
    referredBy: b.referredBy || '',
    isSeniorCitizen: !!b.isSeniorCitizen,
    isSuperSenior: !!b.isSuperSenior,
    isStaff: !!b.isStaff,
    deductTds: !!b.deductTds,
    withoutTransaction: !!b.withoutTransaction,
    renewedFrom,
    transId: String(transSeq),
    transDate: asDate(b.transDate) || openDate,
    narration: b.narration || '',
    createdBy: req.user._id,
  })

  // The money coming in, unless it came from somewhere inside the books.
  if (!fd.withoutTransaction) {
    await DepositTransaction.create({
      branch: req.branchId,
      deposit: fd._id,
      accNo: fd.accNo,
      custId: fd.custId,
      customerName: fd.customerName,
      transId: fd.transId,
      transDate: fd.transDate,
      type: 'Credit',
      amount: depositAmount,
      kind: renewedFrom ? 'renewal' : 'opening',
      glCode: fd.glCode,
      narration: renewedFrom ? `Renewed from ${renewedFrom}` : 'Deposit received',
      createdBy: req.user._id,
    })
  }
  return fd
}

router.post('/', async (req, res) => {
  const fd = await openDeposit(req, req.body || {})
  res.status(201).json({ deposit: fd.toJSONSafe() })
})

/* ------------------------------------------------------------ one record */

router.get('/:id', async (req, res) => {
  const fd = await findDeposit(req)
  const [customer, txns, branch] = await Promise.all([
    Customer.findById(fd.customer),
    DepositTransaction.find({ deposit: fd._id }).sort({ transDate: -1, createdAt: -1 }),
    branchOf(req),
  ])
  res.json({
    deposit: fd.toJSONSafe(),
    customer: customer ? customer.toJSONSafe() : null,
    transactions: txns.map((t) => t.toJSONSafe()),
    branch: branch?.toSafe() || null,
  })
})

router.put('/:id', requireAdmin, async (req, res) => {
  const fd = await findDeposit(req)
  if (fd.status === 'C') throw httpError(409, 'That deposit is closed.')
  const paid = await DepositTransaction.countDocuments({ deposit: fd._id, status: 'A', kind: 'interest' })
  if (paid > 0) {
    throw httpError(409, 'Interest has been paid on this deposit, so its terms can no longer be edited.')
  }
  const b = req.body || {}
  for (const f of ['schemeCode', 'oldAccNo', 'intPaymentMode', 'intPayoutMode', 'referredBy', 'glCode',
    'neftBank', 'neftBranch', 'neftIfsc', 'neftAccNo', 'narration']) {
    if (b[f] !== undefined) fd[f] = b[f]
  }
  if (b.mop !== undefined && MOP.includes(b.mop)) fd.mop = b.mop
  if (b.compounding !== undefined && COMPOUNDING.includes(b.compounding)) fd.compounding = b.compounding
  if (b.interestRepayment !== undefined && REPAYMENT.includes(b.interestRepayment)) {
    fd.interestRepayment = b.interestRepayment
  }
  if (b.openDate) fd.openDate = asDate(b.openDate)
  if (b.effectDate) fd.effectDate = asDate(b.effectDate)
  if (b.periodMonths !== undefined) fd.periodMonths = num(b.periodMonths, fd.periodMonths)
  if (b.depositAmount !== undefined) fd.depositAmount = num(b.depositAmount, fd.depositAmount)
  if (b.interestRate !== undefined) fd.interestRate = num(b.interestRate)
  for (const f of ['isSeniorCitizen', 'isSuperSenior', 'isStaff', 'deductTds']) {
    if (b[f] !== undefined) fd[f] = !!b[f]
  }
  if (b.minor) fd.minor = { name: b.minor.name || '', dob: asDate(b.minor.dob) }
  if (b.nominee) {
    fd.nominee = {
      name: b.nominee.name || '',
      relation: b.nominee.relation || '',
      age: num(b.nominee.age, undefined),
      dob: asDate(b.nominee.dob),
    }
  }

  // The terms moved, so what it is worth at the end moves with them.
  fd.maturityDate = asDate(b.maturityDate) || addMonths(fd.effectDate || fd.openDate, fd.periodMonths)
  const grown = maturityOf({
    amount: fd.depositAmount,
    rate: fd.interestRate,
    months: fd.periodMonths,
    compounding: fd.compounding,
  })
  const paidOut = fd.interestRepayment !== 'M'
  fd.maturityAmount = paidOut ? fd.depositAmount : grown.maturity
  fd.projectedInterest = paidOut
    ? round2((fd.depositAmount * fd.interestRate * fd.periodMonths) / 1200)
    : grown.interest
  fd.updatedBy = req.user._id
  await fd.save()
  res.json({ deposit: fd.toJSONSafe() })
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const fd = await findDeposit(req)
  const moved = await DepositTransaction.countDocuments({
    deposit: fd._id,
    status: 'A',
    kind: { $ne: 'opening' },
  })
  if (moved > 0) throw httpError(409, 'This deposit has interest or closure entries and cannot be deleted.')
  if (fd.lienAmount > 0) throw httpError(409, 'A loan is held against this deposit. Release the lien first.')
  await DepositTransaction.deleteMany({ deposit: fd._id })
  await fd.deleteOne()
  res.json({ ok: true })
})

/* ----------------------------------------------------- interest payment */

router.get('/:id/interest-quote', async (req, res) => {
  const fd = await findDeposit(req)
  const on = req.query.asOn ? at(req.query.asOn) : todayUtc()
  const from = payoutStart(fd)
  // Interest stops growing at maturity; after that the deposit simply waits.
  const upto = on > at(fd.maturityDate) ? at(fd.maturityDate) : on
  const interest = upto > from ? accruedBetween(fd.depositAmount, fd.interestRate, from, upto) : 0
  const tds = fd.deductTds ? round2(interest * 0.1) : 0
  res.json({
    deposit: fd.toJSONSafe(),
    from,
    to: upto,
    asOn: on,
    interest,
    tds,
    payable: round2(interest - tds),
  })
})

router.post('/:id/interest-payment', async (req, res) => {
  const fd = await findDeposit(req)
  if (fd.status === 'C') throw httpError(409, 'That deposit is closed.')
  if (fd.interestRepayment === 'M') {
    throw httpError(409, 'This deposit pays its interest on maturity, so there is nothing to pay out now.')
  }
  const b = req.body || {}
  const to = asDate(b.to) || todayUtc()
  const from = payoutStart(fd)
  if (to <= from) throw httpError(400, 'No interest has accrued since the last payment.')

  const amount = round2(num(b.amount, accruedBetween(fd.depositAmount, fd.interestRate, from, to)))
  if (amount <= 0) throw httpError(400, 'Enter the interest being paid.')
  const tds = round2(num(b.tds))
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)

  const txn = await DepositTransaction.create({
    branch: req.branchId,
    deposit: fd._id,
    accNo: fd.accNo,
    custId: fd.custId,
    customerName: fd.customerName,
    transId: String(transSeq),
    transDate: asDate(b.transDate) || to,
    type: 'Debit',
    amount,
    kind: 'interest',
    fromDate: from,
    toDate: to,
    tds,
    glCode: b.glCode || '',
    narration: b.narration || `Interest ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    createdBy: req.user._id,
  })

  fd.interestPaid = round2(fd.interestPaid + amount)
  fd.interestUpto = to
  await fd.save()
  res.status(201).json({ transaction: txn.toJSONSafe(), deposit: fd.toJSONSafe() })
})

router.get('/transactions/list', async (req, res) => {
  const { from = '', to = '', accNo = '', kind = '', status = 'A', limit = 200 } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  if (accNo) find.accNo = accNo
  if (kind) find.kind = kind
  if (from || to) {
    find.transDate = {}
    if (from) find.transDate.$gte = at(from)
    if (to) find.transDate.$lte = at(to)
  }
  const rows = await DepositTransaction.find(find)
    .sort({ transDate: -1, createdAt: -1 })
    .limit(Math.min(num(limit, 200), 1000))
  res.json({
    transactions: rows.map((t) => t.toJSONSafe()),
    count: rows.length,
    credit: round2(rows.filter((t) => t.type === 'Credit').reduce((t, x) => t + x.amount, 0)),
    debit: round2(rows.filter((t) => t.type === 'Debit').reduce((t, x) => t + x.amount, 0)),
  })
})

router.post('/transactions/:id/cancel', requireAdmin, async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 4) throw httpError(400, 'Give a reason for cancelling this entry.')
  const txn = await DepositTransaction.findOne({ _id: req.params.id, branch: req.branchId })
  if (!txn) throw httpError(404, 'No such entry.')
  if (txn.status === 'cancelled') throw httpError(409, 'That entry is already cancelled.')

  const fd = await FixedDeposit.findById(txn.deposit)
  if (fd) {
    const later = await DepositTransaction.countDocuments({
      deposit: fd._id,
      status: 'A',
      _id: { $ne: txn._id },
      transDate: { $gt: txn.transDate },
    })
    if (later > 0) throw httpError(409, 'Cancel the later entries on this deposit first.')
    if (txn.kind === 'interest') {
      fd.interestPaid = round2(fd.interestPaid - txn.amount)
      const prev = await DepositTransaction.findOne({
        deposit: fd._id,
        status: 'A',
        kind: 'interest',
        _id: { $ne: txn._id },
      }).sort({ transDate: -1, createdAt: -1 })
      fd.interestUpto = prev?.toDate || undefined
    }
    if (txn.kind === 'closure') {
      fd.status = 'A'
      fd.closedDate = undefined
      fd.closureAmount = 0
      fd.renewedInto = ''
    }
    await fd.save()
  }

  txn.status = 'cancelled'
  txn.cancelReason = reason
  txn.cancelledAt = new Date()
  txn.cancelledBy = req.user._id
  await txn.save()
  res.json({ transaction: txn.toJSONSafe(), deposit: fd ? fd.toJSONSafe() : null })
})

/* --------------------------------------------------------------- closure */

router.get('/:id/closure-quote', async (req, res) => {
  const fd = await findDeposit(req)
  const on = req.query.asOn ? at(req.query.asOn) : todayUtc()
  const matured = on >= at(fd.maturityDate)
  const upto = matured ? at(fd.maturityDate) : on

  // Interest is reckoned from the start for a deposit that keeps it, and
  // from the last payout for one that hands it over as it goes.
  const from = fd.interestRepayment === 'M' ? at(fd.effectDate || fd.openDate) : payoutStart(fd)
  let interest
  if (matured && fd.interestRepayment === 'M') {
    // At maturity it is worth exactly what the certificate promised.
    interest = round2(fd.maturityAmount - fd.depositAmount - fd.interestPaid)
  } else {
    interest = upto > from ? accruedBetween(fd.depositAmount, fd.interestRate, from, upto) : 0
  }
  const tds = fd.deductTds ? round2(interest * 0.1) : 0

  res.json({
    deposit: fd.toJSONSafe(),
    asOn: on,
    matured,
    premature: !matured,
    interestFrom: from,
    interestTo: upto,
    principalPayable: fd.depositAmount,
    interestPayable: interest,
    interestAlreadyPaid: fd.interestPaid,
    tds,
    lienAmount: fd.lienAmount,
    payable: round2(fd.depositAmount + interest - tds - fd.lienAmount),
  })
})

async function closeDeposit(req, fd, b, { renewedInto = '' } = {}) {
  const transDate = asDate(b.transDate) || todayUtc()
  const principal = round2(num(b.principalPayable, fd.depositAmount))
  const interest = round2(num(b.interestPayable))
  const tds = round2(num(b.tds))
  const payable = round2(principal + interest - tds)

  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  await DepositTransaction.create({
    branch: req.branchId,
    deposit: fd._id,
    accNo: fd.accNo,
    custId: fd.custId,
    customerName: fd.customerName,
    transId: String(transSeq),
    transDate,
    type: 'Debit',
    amount: payable,
    kind: 'closure',
    tds,
    glCode: b.glCode || '',
    narration: renewedInto ? `Closed on renewal into ${renewedInto}` : b.narration || 'Deposit closed',
    createdBy: req.user._id,
  })

  fd.interestPaid = round2(fd.interestPaid + interest)
  fd.interestUpto = transDate
  fd.status = 'C'
  fd.closedDate = transDate
  fd.closureAmount = payable
  fd.renewedInto = renewedInto
  await fd.save()
  return payable
}

router.post('/:id/close', async (req, res) => {
  const fd = await findDeposit(req)
  if (fd.status === 'C') throw httpError(409, 'That deposit is already closed.')
  if (fd.lienAmount > 0) {
    throw httpError(409, 'A loan is held against this deposit. Release the lien before closing it.')
  }
  const payable = await closeDeposit(req, fd, req.body || {})
  res.json({ deposit: fd.toJSONSafe(), paidOut: payable })
})

/* --------------------------------------------------------------- renewal */

// Closing one deposit and opening another with what came out of it, which is
// what the old FD_Renewal screen did in a single step.
router.post('/:id/renew', async (req, res) => {
  const fd = await findDeposit(req)
  if (fd.status === 'C') throw httpError(409, 'That deposit is already closed.')
  if (fd.lienAmount > 0) {
    throw httpError(409, 'A loan is held against this deposit. Release the lien before renewing it.')
  }
  const b = req.body || {}
  const principal = round2(num(b.principalPayable, fd.depositAmount))
  const interest = round2(num(b.interestPayable))
  const tds = round2(num(b.tds))
  const additional = round2(num(b.additionalAmount))
  const withdrawn = round2(num(b.withdrawalAmount))

  const renewal = round2(principal + interest - tds + additional - withdrawn)
  if (renewal <= 0) {
    throw httpError(400, 'Nothing would be left to put into the new deposit.')
  }
  if (withdrawn > round2(principal + interest - tds + additional)) {
    throw httpError(400, 'More is being taken out than the deposit is worth.')
  }

  // The new one first, so its number can be named on the old one's closure.
  const fresh = await openDeposit(
    req,
    {
      ...b,
      custId: b.custId || fd.custId,
      jointCustIds: b.jointCustIds || fd.jointCustIds,
      schemeCode: b.schemeCode || fd.schemeCode,
      mop: b.mop || fd.mop,
      depositAmount: renewal,
      openDate: b.transDate,
      effectDate: b.effectDate || b.transDate,
      interestRate: b.interestRate !== undefined ? b.interestRate : fd.interestRate,
      compounding: b.compounding || fd.compounding,
      interestRepayment: b.interestRepayment || fd.interestRepayment,
      nominee: b.nominee || fd.nominee,
      minor: b.minor || fd.minor,
      deductTds: b.deductTds !== undefined ? b.deductTds : fd.deductTds,
      isSeniorCitizen: b.isSeniorCitizen !== undefined ? b.isSeniorCitizen : fd.isSeniorCitizen,
      // The money moves between two deposits, not across the counter.
      withoutTransaction: true,
      narration: `Renewed from ${fd.accNo}`,
    },
    { renewedFrom: fd.accNo }
  )

  await closeDeposit(req, fd, { ...b, principalPayable: principal, interestPayable: interest, tds }, {
    renewedInto: fresh.accNo,
  })

  res.status(201).json({
    closed: fd.toJSONSafe(),
    opened: fresh.toJSONSafe(),
    renewalAmount: renewal,
    withdrawn,
  })
})

/* --------------------------------------------------------------- reports */

// FD Maturity — what falls due between two dates.
router.get('/reports/maturity', async (req, res) => {
  const { from = '', to = '', scheme = '' } = req.query
  const find = { branch: req.branchId, status: 'A' }
  if (scheme) find.schemeCode = scheme
  if (from || to) {
    find.maturityDate = {}
    if (from) find.maturityDate.$gte = at(from)
    if (to) find.maturityDate.$lte = at(to)
  }
  const rows = await FixedDeposit.find(find).sort({ maturityDate: 1 })
  const on = todayUtc()
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    rows: rows.map((d) => ({
      ...d.toRow(),
      daysToGo: at(d.maturityDate) >= on ? daysBetween(on, d.maturityDate) : -daysBetween(d.maturityDate, on),
      mobile: undefined,
    })),
    totals: {
      count: rows.length,
      deposit: round2(rows.reduce((t, d) => t + d.depositAmount, 0)),
      maturity: round2(rows.reduce((t, d) => t + d.maturityAmount, 0)),
    },
  })
})

// O/s as on — deposits standing on a chosen day.
router.get('/reports/outstanding', async (req, res) => {
  const { asOn = '', scheme = '' } = req.query
  const on = asOn ? at(asOn) : todayUtc()
  const find = {
    branch: req.branchId,
    openDate: { $lte: on },
    $or: [{ status: 'A' }, { closedDate: { $gt: on } }, { closedDate: null }],
  }
  if (scheme) find.schemeCode = scheme
  const rows = await FixedDeposit.find(find).sort({ accNo: 1 })
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn: on,
    rows: rows.map((d) => d.toRow()),
    totals: {
      count: rows.length,
      deposit: round2(rows.reduce((t, d) => t + d.depositAmount, 0)),
      maturity: round2(rows.reduce((t, d) => t + d.maturityAmount, 0)),
    },
  })
})

// The filtered list behind the old FD_Reports.aspx.
router.get('/reports/list', async (req, res) => {
  const {
    scheme = '', active = '1', closed = '0',
    accFrom = '', accTo = '', openFrom = '', openTo = '',
    matFrom = '', matTo = '', closedFrom = '', closedTo = '',
    amtCond = '', amtV1 = '', amtV2 = '', groupBy = '',
  } = req.query

  const find = { branch: req.branchId }
  if (scheme) find.schemeCode = scheme
  const wanted = []
  if (active === '1') wanted.push('A')
  if (closed === '1') wanted.push('C')
  if (wanted.length === 0) return res.json({ rows: [], groups: null, totals: { count: 0, deposit: 0, maturity: 0 } })
  if (wanted.length === 1) find.status = wanted[0]
  if (accFrom || accTo) {
    find.accNo = {}
    if (accFrom) find.accNo.$gte = String(accFrom)
    if (accTo) find.accNo.$lte = String(accTo)
  }
  const range = (field, lo, hi) => {
    if (!lo && !hi) return
    find[field] = {}
    if (lo) find[field].$gte = at(lo)
    if (hi) find[field].$lte = at(hi)
  }
  range('openDate', openFrom, openTo)
  range('maturityDate', matFrom, matTo)
  range('closedDate', closedFrom, closedTo)

  const all = await FixedDeposit.find(find).sort({ accNo: 1 }).limit(10000)
  const a = num(amtV1)
  const c = num(amtV2)
  const passes = (v) => {
    if (!amtCond) return true
    if (amtCond === '>') return v > a
    if (amtCond === '>=') return v >= a
    if (amtCond === '<') return v < a
    if (amtCond === '<=') return v <= a
    if (amtCond === 'between') return v >= Math.min(a, c) && v <= Math.max(a, c)
    return true
  }
  const rows = all.filter((d) => passes(d.depositAmount)).map((d) => d.toRow())

  const keyOf = {
    scheme: (r) => r.schemeCode || '—',
    rate: (r) => `${r.interestRate}%`,
    period: (r) => `${r.periodMonths} months`,
    customer: (r) => r.customerName || '—',
  }[groupBy]
  let groups = null
  if (keyOf) {
    const map = new Map()
    for (const r of rows) {
      const k = keyOf(r)
      if (!map.has(k)) map.set(k, { key: k, rows: [], total: 0 })
      const g = map.get(k)
      g.rows.push(r)
      g.total = round2(g.total + r.depositAmount)
    }
    groups = [...map.values()].sort((x, y) => x.key.localeCompare(y.key))
  }

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    rows,
    groups,
    totals: {
      count: rows.length,
      deposit: round2(rows.reduce((t, r) => t + r.depositAmount, 0)),
      maturity: round2(rows.reduce((t, r) => t + r.maturityAmount, 0)),
    },
  })
})

// One deposit's history.
router.get('/:id/statement', async (req, res) => {
  const fd = await findDeposit(req)
  const rows = await DepositTransaction.find({ deposit: fd._id, status: 'A' }).sort({
    transDate: 1,
    createdAt: 1,
  })
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    deposit: fd.toJSONSafe(),
    lines: rows.map((t) => ({
      id: t._id.toString(),
      transId: t.transId,
      transDate: t.transDate,
      particulars: t.narration || t.kind,
      kind: t.kind,
      credit: t.type === 'Credit' ? t.amount : 0,
      debit: t.type === 'Debit' ? t.amount : 0,
      tds: t.tds,
    })),
    totals: {
      count: rows.length,
      credit: round2(rows.filter((t) => t.type === 'Credit').reduce((t, x) => t + x.amount, 0)),
      debit: round2(rows.filter((t) => t.type === 'Debit').reduce((t, x) => t + x.amount, 0)),
      interestPaid: fd.interestPaid,
    },
  })
})

/* ---------------------------------------------- customer enquiry / reports */

/* ----------------------------------------------------------- the day book */

registerPostingSource({
  source: 'Term Deposit',
  load: async ({ branchId, from, to, chart }) => {
    const txns = await DepositTransaction.find({
      branch: branchId,
      ...(from || to
        ? { transDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } }
        : {}),
    })
    if (txns.length === 0) return []

    const ids = [...new Set(txns.map((t) => t.deposit?.toString()).filter(Boolean))]
    const deposits = await FixedDeposit.find({ _id: { $in: ids } }).select('schemeCode depositAmount')
    const byId = new Map(deposits.map((d) => [d._id.toString(), d]))

    const WORDS = {
      opening: 'Deposit Received',
      interest: 'Deposit Interest',
      closure: 'Deposit Closed',
      renewal: 'Deposit Renewed',
    }

    return txns.map((t) => {
      const deposit = byId.get(t.deposit?.toString())
      const head = chart.schemeGl(deposit?.schemeCode)
      const intHead = chart.schemeInterestGl(deposit?.schemeCode)
      const tds = round2(t.tds)
      const postings = []

      if (t.kind === 'opening') {
        postings.push(t.glCode ? dr(t.glCode, t.amount, 'Received') : pendingDr('mop.unknown', t.amount, 'Received'))
        postings.push(cr(head, t.amount, 'Deposit'))
      } else if (t.kind === 'interest') {
        // The amount stored is the gross interest; TDS is held back out of it.
        const paid = round2(t.amount - tds)
        postings.push(
          intHead ? dr(intHead, t.amount, 'Interest paid') : pendingDr('fd.interest', t.amount, 'Interest paid')
        )
        postings.push(t.glCode ? cr(t.glCode, paid, 'Paid out') : pendingCr('mop.unknown', paid, 'Paid out'))
        if (tds > 0) postings.push(pendingCr('fd.tds', tds, 'TDS withheld'))
      } else if (t.kind === 'closure') {
        // The settlement is the face value plus whatever interest had run,
        // less TDS. The face value is what the deposit itself says.
        const principal = Math.min(round2(t.amount + tds), round2(deposit?.depositAmount || t.amount + tds))
        const interest = round2(t.amount + tds - principal)
        postings.push(dr(head, principal, 'Deposit repaid'))
        if (interest > 0) {
          postings.push(
            intHead ? dr(intHead, interest, 'Interest paid') : pendingDr('fd.interest', interest, 'Interest paid')
          )
        }
        postings.push(t.glCode ? cr(t.glCode, t.amount, 'Paid out') : pendingCr('mop.unknown', t.amount, 'Paid out'))
        if (tds > 0) postings.push(pendingCr('fd.tds', tds, 'TDS withheld'))
      }
      // A renewal moves nothing across the counter — the old deposit closes
      // and the new one opens, each with its own entry — so it carries no
      // postings of its own and shows in the transaction list alone.

      return {
        transId: t.transId,
        date: t.transDate,
        particulars: `${WORDS[t.kind] || 'Deposit'} - ${t.accNo} - ${t.customerName}`,
        amount: t.amount,
        accNo: t.accNo,
        custId: t.custId,
        customerName: t.customerName,
        kind: t.kind,
        refId: t._id.toString(),
        status: t.status,
        createdBy: t.createdBy?.toString() || '',
        postings,
      }
    })
  },
})

registerAccountSource({
  accType: 'Fixed Deposit',
  schemeType: 'SD',
  osType: 'FD',
  outstanding: async ({ branchId, asOn }) => {
    const rows = await FixedDeposit.find({
      branch: branchId,
      openDate: { $lte: asOn },
      $or: [{ status: 'A' }, { closedDate: { $gt: asOn } }, { closedDate: null }],
    }).sort({ accNo: 1 })
    return rows.map((d) => ({
      accNo: d.accNo,
      custId: d.custId,
      customerName: d.customerName,
      scheme: d.schemeName || d.schemeCode,
      openDate: d.openDate,
      balance: d.depositAmount,
    }))
  },
  lookup: async ({ branchId }, accNo) => {
    const d = await FixedDeposit.findOne({ branch: branchId, accNo })
    if (!d) return null
    return {
      accNo: d.accNo,
      custId: d.custId,
      customerName: d.customerName,
      scheme: d.schemeName || d.schemeCode,
      balance: d.status === 'C' ? 0 : d.depositAmount,
      status: d.status === 'C' ? 'Closed' : 'Active',
    }
  },
  load: async ({ branchId, customer }) => {
    const rows = await FixedDeposit.find({ branch: branchId, customer: customer._id }).sort({ openDate: -1 })
    return rows.map((d) => ({
      accNo: d.accNo,
      scheme: d.schemeName || d.schemeCode,
      openDate: d.openDate,
      dueDate: d.maturityDate,
      period: `${d.periodMonths} months`,
      balance: d.status === 'C' ? 0 : d.depositAmount,
      status: d.status === 'C' ? 'Closed' : 'Active',
    }))
  },
})

export default router
