import { Router } from 'express'
import mongoose from 'mongoose'
import JewelLoan, { LOAN_TYPES, PURPOSES, TOUCHES } from '../models/JewelLoan.js'
import LoanReceipt from '../models/LoanReceipt.js'
import Repledge from '../models/Repledge.js'
import Customer from '../models/Customer.js'
import Branch from '../models/Branch.js'
import Counter from '../models/Counter.js'
import Scheme from '../models/Scheme.js'
import GlAccount from '../models/GlAccount.js'
import GoldRate from '../models/GoldRate.js'
import Lookup from '../models/Lookup.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { registerAccountSource } from '../lib/accounts.js'
import {
  duesFor, appropriate, addMonths, round2, perGramFromSovereign, at, daysBetween,
} from '../lib/loanMath.js'

const router = Router()
router.use(requireAuth)

// Jewel loan account numbers ran 201600367 — the branch code, then a running
// number of its own that started in the six-hundred-thousands.
const ACC_NO_START = 600001

const branchOf = (req) => Branch.findById(req.branchId)
const num = (v, d = 0) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? d : Number(v))
// Open dates, due dates and transaction dates are days, not moments, and are
// stored at midnight UTC so they read back as the same day everywhere.
const asDate = (v) => (v ? at(v) : null)
const todayUtc = () => at(new Date())

/* ----------------------------------------------------------------- helpers */

async function findLoan(req) {
  const { id } = req.params
  const where = mongoose.isValidObjectId(id) ? { _id: id } : { accNo: id }
  const loan = await JewelLoan.findOne({ ...where, branch: req.branchId })
  if (!loan) throw httpError(404, 'No such loan in this branch.')
  return loan
}

// Everything the master screen needs to open without six separate calls.
async function formDefaults(req) {
  const [schemes, glAccounts, jewelTypes, rate, branch] = await Promise.all([
    Scheme.find({ category: 'JL', status: 'A' }).sort({ code: 1 }),
    GlAccount.find({ active: true, isBankAccount: true }).sort({ name: 1 }),
    Lookup.find({ kind: 'jewel', active: true }).sort({ sort: 1, name: 1 }),
    GoldRate.findOne().sort({ effectDate: -1 }),
    branchOf(req),
  ])
  // Cash on Hand is not flagged as a bank account but is where most of this
  // money actually moves, so it is always offered.
  const cash = await GlAccount.findOne({ active: true, name: /cash on hand/i })
  const gl = [...(cash ? [cash] : []), ...glAccounts.filter((g) => !cash || !g._id.equals(cash._id))]
  return {
    schemes: schemes.map((s) => s.toSafe()),
    glAccounts: gl.map((g) => ({ code: g.code, name: g.name })),
    jewelTypes: jewelTypes.map((j) => j.name),
    goldRate: rate ? rate.toSafe() : null,
    touches: TOUCHES,
    purposes: PURPOSES,
    loanTypes: LOAN_TYPES,
    branch: branch?.toSafe() || null,
  }
}

// Totals rolled up from the jewel rows, so the stored loan and the grid agree.
function rollUpJewels(jewels = []) {
  const rows = jewels.map((j) => {
    const gross = num(j.grossWeight)
    const deduction = num(j.deduction)
    const net = round2(num(j.netWeight) || Math.max(0, gross - deduction))
    return {
      jewelId: j.jewelId || '',
      description: j.description || '',
      items: num(j.items, 1),
      grossWeight: gross,
      deduction,
      netWeight: net,
      touch: j.touch || '22ct',
      ratePerGram: num(j.ratePerGram),
      value: round2(num(j.value) || net * num(j.ratePerGram)),
    }
  })
  return {
    jewels: rows,
    noOfItems: rows.reduce((t, j) => t + j.items, 0),
    grossWeight: round2(rows.reduce((t, j) => t + j.grossWeight, 0)),
    netWeight: round2(rows.reduce((t, j) => t + j.netWeight, 0)),
    jewelValue: round2(rows.reduce((t, j) => t + j.value, 0)),
  }
}

/* -------------------------------------------------------------------- list */

// GET /api/loans/jewel?q=&field=name|accNo|oldAccNo|custId&scheme=&status=&page=
router.get('/jewel', async (req, res) => {
  const { q = '', field = 'name', scheme = '', status = '', page = 1, limit = 25, overdue = '' } = req.query
  const find = { branch: req.branchId }
  if (scheme) find.schemeCode = scheme
  if (status) find.status = status
  if (overdue === '1') {
    find.status = 'A'
    find.dueDate = { $lt: new Date() }
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
    JewelLoan.find(find).sort({ accNo: -1 }).skip(skip).limit(perPage),
    JewelLoan.countDocuments(find),
  ])
  res.json({ loans: rows.map((l) => l.toRow()), total, page: num(page, 1), limit: perPage })
})

// Everything a blank master screen needs: the next numbers and the lists.
router.get('/jewel/new', async (req, res) => {
  const defaults = await formDefaults(req)
  const branch = defaults.branch
  const seq = await Counter.peek(`${req.branchId}:jl`, ACC_NO_START)
  const trans = await Counter.peek(`${req.branchId}:trans`, 1)
  res.json({
    ...defaults,
    accNo: `${branch?.code || ''}${seq}`,
    transId: String(trans),
    ratePerGram: perGramFromSovereign(defaults.goldRate?.marketRate || 0),
  })
})

// The receipt screen's "Account No → View Details" lookup.
router.get('/jewel/lookup/:accNo', async (req, res) => {
  const loan = await JewelLoan.findOne({ branch: req.branchId, accNo: req.params.accNo })
  if (!loan) throw httpError(404, 'No loan with that account number in this branch.')
  res.json({ loan: loan.toJSONSafe(), dues: duesFor(loan, req.query.asOn || new Date()) })
})

/* ------------------------------------------------------------------ create */

router.post('/jewel', async (req, res) => {
  const b = req.body || {}
  const customer = await Customer.findOne({ branch: req.branchId, custId: String(b.custId || '') })
  if (!customer) throw httpError(400, 'Enter a valid customer id.')
  const loanAmount = num(b.loanAmount)
  if (loanAmount <= 0) throw httpError(400, 'Enter the loan amount.')
  const openDate = asDate(b.openDate) || todayUtc()
  const periodMonths = num(b.periodMonths, 6)

  const branch = await branchOf(req)
  const seq = await Counter.next(`${req.branchId}:jl`, ACC_NO_START)
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  const scheme = b.schemeCode ? await Scheme.findOne({ code: b.schemeCode }) : null

  const deductions = round2(
    num(b.appraiserFee) + num(b.serviceTax) + num(b.formsFee) + num(b.insurance) + num(b.otherDeductions)
  )

  const loan = await JewelLoan.create({
    branch: req.branchId,
    accNo: `${branch.code}${seq}`,
    oldAccNo: b.oldAccNo || '',
    transId: String(transSeq),
    transDate: asDate(b.transDate) || openDate,

    customer: customer._id,
    custId: customer.custId,
    customerName: customer.name,

    schemeCode: b.schemeCode || '',
    schemeName: scheme?.name || '',
    glCode: b.glCode || '',
    loanType: LOAN_TYPES.includes(b.loanType) ? b.loanType : 'NE',
    purpose: b.purpose || 'Walk-in',
    status: 'A',

    openDate,
    periodMonths,
    dueDate: asDate(b.dueDate) || addMonths(openDate, periodMonths),

    ...rollUpJewels(b.jewels),
    marketRate: num(b.marketRate),
    ratePerGram: num(b.ratePerGram),

    loanAmount,
    interestRate: num(b.interestRate),
    penalRate: num(b.penalRate),
    insurancePerMonth: num(b.insurancePerMonth),
    appraiserFee: num(b.appraiserFee),
    serviceTax: num(b.serviceTax),
    formsFee: num(b.formsFee),
    deductions,
    disbAmt: round2(num(b.disbAmt) || loanAmount - deductions),
    loanPayable: round2(num(b.loanPayable) || loanAmount),

    lockerAccNo: b.lockerAccNo || '',
    referredById: b.referredById || '',
    referredByName: b.referredByName || '',
    nominee: {
      name: b.nominee?.name || '',
      relation: b.nominee?.relation || '',
      age: num(b.nominee?.age, undefined),
    },
    isStaff: !!b.isStaff,
    narration: b.narration || '',

    principalBalance: loanAmount,
    intRecdUpto: openDate,
    insuranceRecdUpto: openDate,

    createdBy: req.user._id,
  })
  res.status(201).json({ loan: loan.toJSONSafe() })
})

/* --------------------------------------------------------------- one loan */

router.get('/jewel/:id', async (req, res) => {
  const loan = await findLoan(req)
  const [receipts, customer, branch] = await Promise.all([
    LoanReceipt.find({ loan: loan._id }).sort({ transDate: 1, createdAt: 1 }),
    Customer.findById(loan.customer),
    branchOf(req),
  ])
  res.json({
    loan: loan.toJSONSafe(),
    receipts: receipts.map((r) => r.toJSONSafe()),
    dues: duesFor(loan, req.query.asOn || new Date()),
    customer: customer ? customer.toJSONSafe() : null,
    branch: branch?.toSafe() || null,
  })
})

// What is owed on a day, and how a given amount would be split across it.
router.get('/jewel/:id/dues', async (req, res) => {
  const loan = await findLoan(req)
  const dues = duesFor(loan, req.query.asOn || new Date())
  const rebate = num(req.query.rebate)
  const amount = num(req.query.amount, dues.closingAmount)
  res.json({ dues, split: appropriate(amount, dues, { rebate }), suggested: dues.closingAmount })
})

router.put('/jewel/:id', requireAdmin, async (req, res) => {
  const loan = await findLoan(req)
  const paid = await LoanReceipt.countDocuments({ loan: loan._id, status: 'A' })
  if (paid > 0) {
    throw httpError(409, 'Receipts have been collected on this loan, so its terms can no longer be edited.')
  }
  const b = req.body || {}
  const fields = [
    'oldAccNo', 'schemeCode', 'glCode', 'loanType', 'purpose', 'lockerAccNo',
    'referredById', 'referredByName', 'narration',
  ]
  for (const f of fields) if (b[f] !== undefined) loan[f] = b[f]
  const numbers = [
    'marketRate', 'ratePerGram', 'loanAmount', 'interestRate', 'penalRate',
    'insurancePerMonth', 'appraiserFee', 'serviceTax', 'formsFee', 'disbAmt', 'loanPayable',
  ]
  for (const f of numbers) if (b[f] !== undefined) loan[f] = num(b[f])
  if (b.openDate) loan.openDate = asDate(b.openDate)
  if (b.periodMonths !== undefined) loan.periodMonths = num(b.periodMonths, loan.periodMonths)
  loan.dueDate = asDate(b.dueDate) || addMonths(loan.openDate, loan.periodMonths)
  if (b.jewels) Object.assign(loan, rollUpJewels(b.jewels))
  if (b.nominee) {
    loan.nominee = {
      name: b.nominee.name || '',
      relation: b.nominee.relation || '',
      age: num(b.nominee.age, undefined),
    }
  }
  if (b.isStaff !== undefined) loan.isStaff = !!b.isStaff
  // Nothing has been received yet, so the balance still is the loan.
  loan.principalBalance = loan.loanAmount
  loan.intRecdUpto = loan.openDate
  loan.insuranceRecdUpto = loan.openDate
  loan.updatedBy = req.user._id
  await loan.save()
  res.json({ loan: loan.toJSONSafe() })
})

router.delete('/jewel/:id', requireAdmin, async (req, res) => {
  const loan = await findLoan(req)
  const paid = await LoanReceipt.countDocuments({ loan: loan._id, status: 'A' })
  if (paid > 0) throw httpError(409, 'This loan has receipts against it and cannot be deleted.')
  if (loan.repledged) throw httpError(409, 'This pledge is out with a bank. Close the re-pledge first.')
  await loan.deleteOne()
  res.json({ ok: true })
})

/* ---------------------------------------------------------------- receipts */

router.post('/jewel/:id/receipts', async (req, res) => {
  const loan = await findLoan(req)
  if (loan.status === 'C') throw httpError(409, 'This loan is already closed.')
  const b = req.body || {}
  const transDate = asDate(b.transDate) || todayUtc()
  const dues = duesFor(loan, transDate)

  const rebate = num(b.rebate)
  // The clerk may override the split; without one, the standard order applies.
  const given = ['principal', 'interest', 'penal', 'insurance', 'notice'].some((k) => b[k] !== undefined)
  const split = given
    ? {
        principal: num(b.principal),
        interest: num(b.interest),
        penal: num(b.penal),
        insurance: num(b.insurance),
        notice: num(b.notice),
      }
    : appropriate(num(b.amount, dues.closingAmount), dues, { rebate })

  const amount = round2(split.principal + split.interest + split.penal + split.insurance + split.notice)
  if (amount <= 0) throw httpError(400, 'Enter an amount to receive.')
  if (split.principal > dues.principalDue + 0.01) {
    throw httpError(400, `The principal outstanding is only ${dues.principalDue.toFixed(2)}.`)
  }

  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  const closingBalance = round2(dues.principalDue - split.principal)
  const closes = closingBalance <= 0.01

  // Interest is settled up to the date it was paid for, not to the day of the
  // receipt: paying half the interest due moves the date half way.
  const intUpto =
    dues.interestDue > 0
      ? new Date(
          new Date(dues.intFrom).getTime() +
            (new Date(dues.asOn) - new Date(dues.intFrom)) *
              Math.min(1, (split.interest + rebate) / dues.interestDue)
        )
      : dues.asOn
  const insuranceUpto =
    dues.insuranceDue > 0 && loan.insurancePerMonth > 0
      ? addMonths(
          loan.insuranceRecdUpto || loan.openDate,
          Math.floor(split.insurance / loan.insurancePerMonth)
        )
      : loan.insuranceRecdUpto || loan.openDate

  const receipt = await LoanReceipt.create({
    branch: req.branchId,
    loan: loan._id,
    loanKind: 'JL',
    accNo: loan.accNo,
    custId: loan.custId,
    customerName: loan.customerName,
    transId: String(transSeq),
    transDate,
    glCode: b.glCode || '',
    principal: split.principal,
    interest: split.interest,
    penal: split.penal,
    insurance: split.insurance,
    notice: split.notice,
    rebate,
    amount,
    intUpto,
    insuranceUpto,
    closingBalance,
    preClosure: !!b.preClosure,
    closedLoan: closes,
    narration: b.narration || '',
    createdBy: req.user._id,
  })

  loan.principalBalance = closingBalance
  loan.interestRecd = round2(loan.interestRecd + split.interest)
  loan.penalRecd = round2(loan.penalRecd + split.penal)
  loan.insuranceRecd = round2(loan.insuranceRecd + split.insurance)
  loan.noticeRecd = round2(loan.noticeRecd + split.notice)
  loan.intRecdUpto = intUpto
  loan.insuranceRecdUpto = insuranceUpto
  if (closes) {
    loan.status = 'C'
    loan.closedDate = transDate
  }
  await loan.save()

  res.status(201).json({ receipt: receipt.toJSONSafe(), loan: loan.toJSONSafe() })
})

// The day book of loan receipts.
router.get('/receipts', async (req, res) => {
  const { from = '', to = '', accNo = '', status = 'A', limit = 200 } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  if (accNo) find.accNo = accNo
  if (from || to) {
    find.transDate = {}
    if (from) find.transDate.$gte = new Date(from)
    if (to) find.transDate.$lte = new Date(`${to}T23:59:59.999`)
  }
  const rows = await LoanReceipt.find(find).sort({ transDate: -1, createdAt: -1 }).limit(Math.min(num(limit, 200), 1000))
  const total = rows.reduce((t, r) => t + r.amount, 0)
  res.json({ receipts: rows.map((r) => r.toJSONSafe()), total: round2(total), count: rows.length })
})

// A wrong receipt is reversed, never erased — the loan goes back to where it
// was and the cancelled row stays in the book with its reason.
router.post('/receipts/:id/cancel', requireAdmin, async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 4) throw httpError(400, 'Give a reason for cancelling this receipt.')
  const receipt = await LoanReceipt.findOne({ _id: req.params.id, branch: req.branchId })
  if (!receipt) throw httpError(404, 'No such receipt.')
  if (receipt.status === 'cancelled') throw httpError(409, 'That receipt is already cancelled.')

  const loan = await JewelLoan.findById(receipt.loan)
  if (loan) {
    const later = await LoanReceipt.countDocuments({
      loan: loan._id,
      status: 'A',
      _id: { $ne: receipt._id },
      transDate: { $gt: receipt.transDate },
    })
    if (later > 0) {
      throw httpError(409, 'Cancel the later receipts on this loan first.')
    }
    loan.principalBalance = round2(loan.principalBalance + receipt.principal)
    loan.interestRecd = round2(loan.interestRecd - receipt.interest)
    loan.penalRecd = round2(loan.penalRecd - receipt.penal)
    loan.insuranceRecd = round2(loan.insuranceRecd - receipt.insurance)
    loan.noticeRecd = round2(loan.noticeRecd - receipt.notice)
    // Put the interest clock back to where the previous receipt left it.
    const prev = await LoanReceipt.findOne({
      loan: loan._id,
      status: 'A',
      _id: { $ne: receipt._id },
    }).sort({ transDate: -1, createdAt: -1 })
    loan.intRecdUpto = prev?.intUpto || loan.openDate
    loan.insuranceRecdUpto = prev?.insuranceUpto || loan.openDate
    if (receipt.closedLoan) {
      loan.status = 'A'
      loan.closedDate = undefined
    }
    await loan.save()
  }

  receipt.status = 'cancelled'
  receipt.cancelReason = reason
  receipt.cancelledAt = new Date()
  receipt.cancelledBy = req.user._id
  await receipt.save()
  res.json({ receipt: receipt.toJSONSafe(), loan: loan ? loan.toJSONSafe() : null })
})

/* ----------------------------------------------------------------- reports */

// Stock register — what is in the strong room, or what moved in a date range.
router.get('/reports/stock', async (req, res) => {
  const { type = 'held', from = '', to = '' } = req.query
  const find = { branch: req.branchId }
  if (type === 'held') find.status = 'A'
  if (type === 'closed') find.status = 'C'
  if (from || to) {
    const key = type === 'closed' ? 'closedDate' : 'openDate'
    find[key] = {}
    if (from) find[key].$gte = new Date(from)
    if (to) find[key].$lte = new Date(`${to}T23:59:59.999`)
  }
  const loans = await JewelLoan.find(find).sort({ accNo: 1 })
  const rows = loans.map((l) => ({
    ...l.toRow(),
    noOfItems: l.noOfItems,
    grossWeight: l.grossWeight,
    jewelValue: l.jewelValue,
    jewels: l.jewels.map((j) => j.description).filter(Boolean).join(', '),
  }))
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    rows,
    totals: {
      count: rows.length,
      items: rows.reduce((t, r) => t + (r.noOfItems || 0), 0),
      netWeight: round2(rows.reduce((t, r) => t + (r.netWeight || 0), 0)),
      loanAmount: round2(rows.reduce((t, r) => t + (r.loanAmount || 0), 0)),
      balance: round2(rows.reduce((t, r) => t + (r.principalBalance || 0), 0)),
    },
  })
})

// Overdue report — loans past their due date, with what each one owes today.
router.get('/reports/od', async (req, res) => {
  const { scheme = '', dueFrom = '', dueTo = '', asOn = '', withInterest = '1', groupBy = '' } = req.query
  const on = asOn ? at(asOn) : todayUtc()
  const find = { branch: req.branchId, status: 'A', dueDate: { $lt: on } }
  if (scheme) find.schemeCode = scheme
  if (dueFrom) find.dueDate.$gte = new Date(dueFrom)
  if (dueTo) find.dueDate.$lte = new Date(`${dueTo}T23:59:59.999`)

  const loans = await JewelLoan.find(find).sort({ dueDate: 1 })
  const rows = loans.map((l) => {
    const d = withInterest === '0' ? null : duesFor(l, on)
    return {
      ...l.toRow(),
      odDays: daysBetween(l.dueDate, on),
      interestDue: d?.interestDue ?? 0,
      penalDue: d?.penalDue ?? 0,
      totalDue: d?.closingAmount ?? l.principalBalance,
    }
  })
  const groups = groupBy === 'scheme' ? groupRows(rows, (r) => r.schemeCode || '—') : null
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn: on,
    rows,
    groups,
    totals: {
      count: rows.length,
      balance: round2(rows.reduce((t, r) => t + r.principalBalance, 0)),
      totalDue: round2(rows.reduce((t, r) => t + r.totalDue, 0)),
    },
  })
})

// Auction notice list — overdue past a chosen age, which is what gets printed
// on the notices the old JML_Auction_Notification.aspx produced.
router.get('/reports/auction', async (req, res) => {
  const { daysFrom = 0, daysTo = 0, asOn = '', scheme = '', otherCharges = 0 } = req.query
  const on = asOn ? at(asOn) : todayUtc()
  const find = { branch: req.branchId, status: 'A', dueDate: { $lt: on } }
  if (scheme) find.schemeCode = scheme
  const loans = await JewelLoan.find(find).sort({ dueDate: 1 })
  const lo = num(daysFrom, 0)
  const hi = num(daysTo, 0)
  const charges = num(otherCharges, 0)
  const rows = loans
    .map((l) => {
      const dues = duesFor(l, on)
      return {
        ...l.toRow(),
        odDays: daysBetween(l.dueDate, on),
        interestDue: dues.interestDue,
        penalDue: dues.penalDue,
        otherCharges: charges,
        totalDue: round2(dues.closingAmount + charges),
      }
    })
    .filter((r) => r.odDays >= lo && (hi <= 0 || r.odDays <= hi))
  const [branch, customers] = await Promise.all([
    branchOf(req),
    Customer.find({ branch: req.branchId, custId: { $in: rows.map((r) => r.custId) } }),
  ])
  const byId = new Map(customers.map((c) => [c.custId, c]))
  res.json({
    branch: branch?.toSafe() || null,
    asOn: on,
    rows: rows.map((r) => {
      const c = byId.get(r.custId)
      return { ...r, address: c?.address || '', city: c?.city || '', pincode: c?.pincode || '', mobile: c?.mobile || '' }
    }),
    totals: { count: rows.length, totalDue: round2(rows.reduce((t, r) => t + r.totalDue, 0)) },
  })
})

// What each loan still owed on a chosen day. A receipt taken after that day
// had not happened yet, so its principal goes back on; a loan closed after it
// was still open. The old screen called this "O/s as on".
router.get('/reports/outstanding', async (req, res) => {
  const { asOn = '', scheme = '', withInterest = '1' } = req.query
  const on = asOn ? at(asOn) : todayUtc()

  const find = {
    branch: req.branchId,
    openDate: { $lte: on },
    $or: [{ status: 'A' }, { closedDate: { $gt: on } }, { closedDate: null }],
  }
  if (scheme) find.schemeCode = scheme
  const loans = await JewelLoan.find(find).sort({ accNo: 1 })

  // One query for every repayment made after that day, rather than one each.
  const later = await LoanReceipt.find({
    branch: req.branchId,
    status: 'A',
    loan: { $in: loans.map((l) => l._id) },
    transDate: { $gt: on },
  })
  const paidBack = new Map()
  for (const r of later) {
    const k = r.loan.toString()
    paidBack.set(k, round2((paidBack.get(k) || 0) + r.principal))
  }

  const rows = []
  for (const l of loans) {
    const balance = round2(l.principalBalance + (paidBack.get(l._id.toString()) || 0))
    if (balance <= 0) continue // it was already clear on that day
    const dues =
      withInterest === '0'
        ? null
        : duesFor({ ...l.toObject(), principalBalance: balance }, on)
    rows.push({
      ...l.toRow(),
      principalBalance: balance,
      interestDue: dues?.interestDue ?? 0,
      penalDue: dues?.penalDue ?? 0,
      totalDue: dues?.closingAmount ?? balance,
    })
  }
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn: on,
    rows,
    totals: {
      count: rows.length,
      balance: round2(rows.reduce((t, r) => t + r.principalBalance, 0)),
      totalDue: round2(rows.reduce((t, r) => t + r.totalDue, 0)),
      netWeight: round2(rows.reduce((t, r) => t + (r.netWeight || 0), 0)),
    },
  })
})

// One loan's ledger — the old Account Statement, which was one page reused
// for every product. Opening balance, then every receipt, then the balance
// each one left behind.
router.get('/jewel/:id/statement', async (req, res) => {
  const loan = await findLoan(req)
  const { from = '', to = '' } = req.query
  const all = await LoanReceipt.find({ loan: loan._id, status: 'A' }).sort({ transDate: 1, createdAt: 1 })

  const fromDate = from ? at(from) : null
  const toDate = to ? at(to) : null
  // Everything before the window has already happened, so it is the opening.
  const before = fromDate ? all.filter((r) => r.transDate < fromDate) : []
  const inRange = all.filter(
    (r) => (!fromDate || r.transDate >= fromDate) && (!toDate || r.transDate <= toDate)
  )

  let balance = round2(loan.loanAmount - before.reduce((t, r) => t + r.principal, 0))
  const opening = balance
  const lines = inRange.map((r) => {
    balance = round2(balance - r.principal)
    return {
      id: r._id.toString(),
      transId: r.transId,
      transDate: r.transDate,
      particulars: r.narration || 'Receipt',
      principal: r.principal,
      interest: r.interest,
      penal: r.penal,
      other: round2(r.insurance + r.notice),
      amount: r.amount,
      balance,
      imported: r.imported,
    }
  })

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    loan: loan.toJSONSafe(),
    from: fromDate,
    to: toDate,
    opening,
    lines,
    totals: {
      count: lines.length,
      principal: round2(lines.reduce((t, l) => t + l.principal, 0)),
      interest: round2(lines.reduce((t, l) => t + l.interest, 0)),
      amount: round2(lines.reduce((t, l) => t + l.amount, 0)),
      closing: balance,
    },
  })
})

// A number against a condition, the way the old report's two filter rows
// worked: "is greater than 5000", "is between 1000 and 2000", and so on.
function passes(value, cond, v1, v2) {
  if (!cond || cond === '%') return true
  const a = num(v1)
  const b = num(v2)
  if (cond === '>') return value > a
  if (cond === '>=') return value >= a
  if (cond === '<') return value < a
  if (cond === '<=') return value <= a
  if (cond === 'between') return value >= Math.min(a, b) && value <= Math.max(a, b)
  return true
}

// The filtered loan list behind the old Loan_Reports.aspx.
router.get('/reports/loans', async (req, res) => {
  const {
    scheme = '', active = '1', closed = '0',
    accFrom = '', accTo = '',
    openFrom = '', openTo = '', dueFrom = '', dueTo = '', closedFrom = '', closedTo = '',
    balCond = '', balV1 = '', balV2 = '',
    odCond = '', odV1 = '', odV2 = '',
    groupBy = '', asOn = '', gender = '', purpose = '', withInterest = '1',
  } = req.query

  const on = asOn ? at(asOn) : todayUtc()
  const find = { branch: req.branchId }
  if (scheme) find.schemeCode = scheme

  const wanted = []
  if (active === '1') wanted.push('A')
  if (closed === '1') wanted.push('C')
  if (wanted.length === 1) find.status = wanted[0]
  if (wanted.length === 0) return res.json({ rows: [], groups: null, totals: { count: 0 }, asOn: on })

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
  range('dueDate', dueFrom, dueTo)
  range('closedDate', closedFrom, closedTo)
  if (purpose) find.purpose = purpose

  let loans = await JewelLoan.find(find).sort({ accNo: 1 }).limit(10000)

  // Gender lives on the customer, so it is applied after the loans are in.
  if (gender) {
    const customers = await Customer.find({
      branch: req.branchId,
      custId: { $in: [...new Set(loans.map((l) => l.custId))] },
      gender,
    })
    const ok = new Set(customers.map((c) => c.custId))
    loans = loans.filter((l) => ok.has(l.custId))
  }

  const rows = []
  for (const l of loans) {
    if (!passes(l.principalBalance, balCond, balV1, balV2)) continue
    const dues = withInterest === '0' ? null : duesFor(l, on)
    const odDays = l.status === 'A' ? daysBetween(l.dueDate, on) : 0
    if (!passes(odDays, odCond, odV1, odV2)) continue
    rows.push({
      ...l.toRow(),
      purpose: l.purpose,
      odDays,
      interestDue: dues?.interestDue ?? 0,
      penalDue: dues?.penalDue ?? 0,
      totalDue: dues?.closingAmount ?? l.principalBalance,
    })
  }

  const keyOf = {
    scheme: (r) => r.schemeCode || '—',
    rate: (r) => `${r.interestRate}%`,
    period: (r) => `${r.periodMonths} months`,
    customer: (r) => r.customerName || '—',
    purpose: (r) => r.purpose || '—',
  }[groupBy]

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    asOn: on,
    rows,
    groups: keyOf ? groupRows(rows, keyOf) : null,
    totals: {
      count: rows.length,
      loanAmount: round2(rows.reduce((t, r) => t + r.loanAmount, 0)),
      balance: round2(rows.reduce((t, r) => t + r.principalBalance, 0)),
      totalDue: round2(rows.reduce((t, r) => t + r.totalDue, 0)),
      netWeight: round2(rows.reduce((t, r) => t + (r.netWeight || 0), 0)),
    },
  })
})

function groupRows(rows, keyOf) {
  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (!map.has(k)) map.set(k, { key: k, rows: [], total: 0 })
    const g = map.get(k)
    g.rows.push(r)
    g.total = round2(g.total + (r.totalDue ?? r.principalBalance ?? 0))
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/* ---------------------------------------------------------------- repledge */

router.get('/repledge', async (req, res) => {
  const { q = '', field = 'bankName', status = '' } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  if (String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i')
    find[['bankName', 'bankAccNo', 'accNo'].includes(field) ? field : 'bankName'] = rx
  }
  const rows = await Repledge.find(find).sort({ openDate: -1 }).limit(500)
  res.json({ rows: rows.map((r) => r.toJSONSafe()), total: rows.length })
})

router.get('/repledge/lookup/:accNo', async (req, res) => {
  const doc = await Repledge.findOne({ branch: req.branchId, accNo: req.params.accNo })
  if (!doc) throw httpError(404, 'No re-pledge with that reference in this branch.')
  res.json({ repledge: doc.toJSONSafe() })
})

router.post('/repledge', requireAdmin, async (req, res) => {
  const b = req.body || {}
  const loanIds = Array.isArray(b.loans) ? b.loans : []
  const loans = await JewelLoan.find({ _id: { $in: loanIds }, branch: req.branchId, status: 'A' })
  if (loans.length === 0) throw httpError(400, 'Pick at least one live pledge to hand over.')
  const alreadyOut = loans.find((l) => l.repledged)
  if (alreadyOut) throw httpError(409, `Loan ${alreadyOut.accNo} is already out with a bank.`)

  const openDate = asDate(b.openDate) || todayUtc()
  const periodMonths = num(b.periodMonths, 12)
  const branch = await branchOf(req)
  const seq = await Counter.next(`${req.branchId}:repledge`, 1)
  const loanAmount = num(b.loanAmount)
  if (loanAmount <= 0) throw httpError(400, 'Enter the amount borrowed from the bank.')

  const doc = await Repledge.create({
    branch: req.branchId,
    accNo: `RP${branch.code}${String(seq).padStart(5, '0')}`,
    bankName: b.bankName || '',
    bankAccNo: b.bankAccNo || '',
    schemeCode: b.schemeCode || '',
    loans: loans.map((l) => l._id),
    netWeight: round2(loans.reduce((t, l) => t + l.netWeight, 0)),
    noOfItems: loans.reduce((t, l) => t + l.noOfItems, 0),
    openDate,
    periodMonths,
    dueDate: asDate(b.dueDate) || addMonths(openDate, periodMonths),
    loanAmount,
    interestRate: num(b.interestRate),
    compounding: b.compounding || 'Monthly',
    principalBalance: loanAmount,
    intRecdUpto: openDate,
    glCodeDr: b.glCodeDr || '',
    glCodeCr: b.glCodeCr || '',
    narration: b.narration || '',
    createdBy: req.user._id,
  })
  await JewelLoan.updateMany({ _id: { $in: loans.map((l) => l._id) } }, { $set: { repledged: true } })
  res.status(201).json({ repledge: doc.toJSONSafe() })
})

// What it costs to bring the jewels back today.
router.get('/repledge/:id/quote', async (req, res) => {
  const doc = await Repledge.findOne({ _id: req.params.id, branch: req.branchId })
  if (!doc) throw httpError(404, 'No such re-pledge.')
  const on = req.query.asOn ? at(req.query.asOn) : todayUtc()
  const quote = duesFor(
    { principalBalance: doc.principalBalance, interestRate: doc.interestRate, penalRate: 0,
      intRecdUpto: doc.intRecdUpto, openDate: doc.openDate, dueDate: doc.dueDate },
    on
  )
  const loans = await JewelLoan.find({ _id: { $in: doc.loans } })
  res.json({ repledge: doc.toJSONSafe(), quote, loans: loans.map((l) => l.toRow()) })
})

router.post('/repledge/:id/close', requireAdmin, async (req, res) => {
  const doc = await Repledge.findOne({ _id: req.params.id, branch: req.branchId })
  if (!doc) throw httpError(404, 'No such re-pledge.')
  if (doc.status === 'C') throw httpError(409, 'That re-pledge is already closed.')
  const b = req.body || {}
  const closedDate = asDate(b.transDate) || todayUtc()
  doc.principalPaid = num(b.principalPayable, doc.principalBalance)
  doc.interestPaid = num(b.interestPayable)
  doc.closingAmount = round2(doc.principalPaid + doc.interestPaid)
  doc.principalBalance = round2(doc.principalBalance - doc.principalPaid)
  doc.closedDate = closedDate
  doc.status = 'C'
  doc.narration = b.narration || doc.narration
  await doc.save()
  // The jewels are back in our strong room.
  await JewelLoan.updateMany({ _id: { $in: doc.loans } }, { $set: { repledged: false } })
  res.json({ repledge: doc.toJSONSafe() })
})

/* ---------------------------------------------- customer enquiry / reports */

// Jewel loans show up in the customer's account list and in the reports built
// on it, without either of them knowing this module exists.
registerAccountSource({
  accType: 'Jewel Loan',
  schemeType: 'JL',
  load: async ({ branchId, customer }) => {
    const loans = await JewelLoan.find({ branch: branchId, customer: customer._id }).sort({ openDate: -1 })
    return loans.map((l) => ({
      accNo: l.accNo,
      scheme: l.schemeName || l.schemeCode,
      openDate: l.openDate,
      dueDate: l.dueDate,
      period: `${l.periodMonths} months`,
      balance: l.principalBalance,
      status: l.status === 'C' ? 'Closed' : 'Active',
    }))
  },
})

export default router
