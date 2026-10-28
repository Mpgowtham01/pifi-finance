import { Router } from 'express'
import mongoose from 'mongoose'
import Voucher, { VOUCHER_TYPES, VOUCHER_TITLES, CASH_SIDE } from '../models/Voucher.js'
import Branch from '../models/Branch.js'
import Counter from '../models/Counter.js'
import GlAccount from '../models/GlAccount.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { accountByNo } from '../lib/accounts.js'
import { registerPostingSource, dr, cr, pendingDr, pendingCr } from '../lib/glLedger.js'
import { round2, at } from '../lib/loanMath.js'

const router = Router()
router.use(requireAuth)

const branchOf = (req) => Branch.findById(req.branchId)
const num = (v, d = 0) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? d : Number(v))
const todayUtc = () => at(new Date())

const typeOf = (v) => {
  const t = String(v || 'JNL').toUpperCase()
  if (!VOUCHER_TYPES.includes(t)) throw httpError(400, 'That is not a kind of voucher.')
  return t
}

// Cash on Hand is the fixed side of a payment or receipt voucher. It is found
// by name, the same way the other modules find it for their mode of payment.
const cashGl = () => GlAccount.findOne({ active: true, name: /cash on hand/i })

async function glByCode(code) {
  const c = String(code || '').trim()
  if (!c) return null
  return GlAccount.findOne({ code: c })
}

/* ------------------------------------------------------------- blank form */

router.get('/new', async (req, res) => {
  const voucherType = typeOf(req.query.type)
  const [branch, cash, glAccounts] = await Promise.all([
    branchOf(req),
    cashGl(),
    GlAccount.find({ active: true }).sort({ code: 1 }),
  ])
  const transId = await Counter.peek(`${req.branchId}:trans`, 1)
  const side = CASH_SIDE[voucherType]
  res.json({
    voucherType,
    title: VOUCHER_TITLES[voucherType],
    transId: String(transId),
    transDate: todayUtc(),
    // The old screen filled the cash side in and left it open to change.
    cashSide: side,
    debitGlCode: side === 'debit' ? cash?.code || '' : '',
    debitGlName: side === 'debit' ? cash?.name || '' : '',
    creditGlCode: side === 'credit' ? cash?.code || '' : '',
    creditGlName: side === 'credit' ? cash?.name || '' : '',
    glAccounts: glAccounts.map((g) => g.toSafe()),
    branch: branch?.toSafe() || null,
  })
})

/* ---------------------------------------------------------------- lookups */

// The Search button beside each account box: the old screen opened a popup
// grid of the GL heads that matched.
router.get('/gl', async (req, res) => {
  const term = String(req.query.q || '').trim()
  const find = { active: true }
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i')
    find.$or = [{ code: rx }, { name: rx }]
  }
  const rows = await GlAccount.find(find).sort({ code: 1 }).limit(100)
  res.json({ glAccounts: rows.map((g) => g.toSafe()) })
})

router.get('/gl/:code', async (req, res) => {
  const gl = await glByCode(req.params.code)
  if (!gl) throw httpError(404, 'No GL account with that code.')
  if (!gl.active) throw httpError(409, `${gl.code} — ${gl.name} is closed.`)
  res.json({ glAccount: gl.toSafe() })
})

// The "+" panel's account box. It takes any customer account number — savings,
// deposit, jewel loan, share — and says whose it is.
router.get('/account/:accNo', async (req, res) => {
  const account = await accountByNo({ branchId: req.branchId }, req.params.accNo)
  if (!account) throw httpError(404, 'No account with that number in this branch.')
  res.json({ account })
})

/* ---------------------------------------------------------------- listing */

router.get('/', async (req, res) => {
  const { type = '', from = '', to = '', q = '', page = 1, limit = 25 } = req.query
  const find = { branch: req.branchId }
  if (type) find.voucherType = typeOf(type)
  if (from || to) {
    find.transDate = { ...(from ? { $gte: at(from) } : {}), ...(to ? { $lte: at(to) } : {}) }
  }
  const term = String(q).trim()
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i')
    find.$or = [
      { transId: rx },
      { narration: rx },
      { debitGlCode: rx },
      { debitGlName: rx },
      { creditGlCode: rx },
      { creditGlName: rx },
    ]
  }
  const perPage = Math.min(num(limit, 25), 200)
  const skip = (Math.max(num(page, 1), 1) - 1) * perPage
  const [rows, total] = await Promise.all([
    Voucher.find(find).sort({ transDate: -1, createdAt: -1 }).skip(skip).limit(perPage),
    Voucher.countDocuments(find),
  ])
  res.json({ vouchers: rows.map((v) => v.toRow()), total, page: num(page, 1), limit: perPage })
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'No such voucher.')
  const v = await Voucher.findOne({ _id: req.params.id, branch: req.branchId })
  if (!v) throw httpError(404, 'No such voucher.')
  res.json({ voucher: v.toJSONSafe() })
})

/* ----------------------------------------------------------------- saving */

// The allocation rows of the "+" panel, each checked against the product
// modules so a voucher cannot be carried against an account that is not there.
async function readAllocations(req, list, amount) {
  if (!Array.isArray(list) || list.length === 0) return []
  const out = []
  for (const row of list) {
    const value = round2(num(row?.amount))
    if (value <= 0) throw httpError(400, 'Every account row needs an amount.')
    const type = row?.type === 'Debit' ? 'Debit' : 'Credit'
    const account = await accountByNo({ branchId: req.branchId }, row?.accNo)
    if (!account) throw httpError(400, `No account ${row?.accNo} in this branch.`)
    out.push({
      accNo: account.accNo,
      accType: account.accType,
      custId: account.custId,
      customerName: account.customerName,
      type,
      amount: value,
    })
  }
  // A split has to add up to the voucher, or it is not a split of it.
  const sum = round2(out.reduce((t, a) => t + a.amount, 0))
  if (sum !== round2(amount)) {
    throw httpError(400, `The account rows come to ${sum}, but the voucher is for ${round2(amount)}.`)
  }
  return out
}

router.post('/', async (req, res) => {
  const b = req.body || {}
  const voucherType = typeOf(b.voucherType)
  const amount = round2(num(b.amount))
  if (amount <= 0) throw httpError(400, 'Enter an amount.')

  const [debit, credit] = await Promise.all([glByCode(b.debitGlCode), glByCode(b.creditGlCode)])
  if (!debit) throw httpError(400, 'Pick the debit account.')
  if (!credit) throw httpError(400, 'Pick the credit account.')
  if (!debit.active) throw httpError(409, `${debit.code} — ${debit.name} is closed.`)
  if (!credit.active) throw httpError(409, `${credit.code} — ${credit.name} is closed.`)
  if (debit.code === credit.code) throw httpError(400, 'The two sides have to be different accounts.')

  const allocations = await readAllocations(req, b.allocations, amount)
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)

  const voucher = await Voucher.create({
    branch: req.branchId,
    voucherType,
    transId: String(transSeq),
    // The old screen's date box was read-only: a voucher is dated the day it
    // is written.
    transDate: todayUtc(),
    debitGlCode: debit.code,
    debitGlName: debit.name,
    creditGlCode: credit.code,
    creditGlName: credit.name,
    amount,
    narration: String(b.narration || '').trim(),
    allocations,
    createdBy: req.user?._id,
  })
  res.status(201).json({ voucher: voucher.toJSONSafe() })
})

router.post('/:id/cancel', requireAdmin, async (req, res) => {
  const reason = String(req.body?.reason || '').trim()
  if (reason.length < 4) throw httpError(400, 'Give a reason for cancelling this voucher.')
  const v = await Voucher.findOne({ _id: req.params.id, branch: req.branchId })
  if (!v) throw httpError(404, 'No such voucher.')
  if (v.status === 'cancelled') throw httpError(409, 'That voucher is already cancelled.')
  v.status = 'cancelled'
  v.cancelReason = reason
  v.cancelledAt = new Date()
  v.cancelledBy = req.user?._id
  await v.save()
  res.json({ voucher: v.toJSONSafe() })
})

/* ----------------------------------------------------------- the day book */

// The one kind of entry in this app that was written as a ledger entry to
// begin with, so both its sides are simply what the clerk typed.
registerPostingSource({
  source: 'Voucher',
  load: async ({ branchId, from, to }) => {
    const vouchers = await Voucher.find({
      branch: branchId,
      ...(from || to
        ? { transDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } }
        : {}),
    })
    return vouchers.map((v) => ({
      transId: v.transId,
      date: v.transDate,
      particulars: `${VOUCHER_TITLES[v.voucherType]} - ${v.narration || v.debitGlName}`,
      amount: v.amount,
      accNo: v.allocations[0]?.accNo || '',
      custId: v.allocations[0]?.custId || '',
      customerName: v.allocations[0]?.customerName || '',
      kind: v.voucherType,
      refId: v._id.toString(),
      status: v.status,
      createdBy: v.createdBy?.toString() || '',
      postings: [dr(v.debitGlCode, v.amount, 'Debit'), cr(v.creditGlCode, v.amount, 'Credit')],
    }))
  },
})

export default router
