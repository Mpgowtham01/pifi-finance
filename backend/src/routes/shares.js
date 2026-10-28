import { Router } from 'express'
import mongoose from 'mongoose'
import ShareAccount from '../models/ShareAccount.js'
import ShareTransfer from '../models/ShareTransfer.js'
import Customer from '../models/Customer.js'
import Branch from '../models/Branch.js'
import Counter from '../models/Counter.js'
import Scheme from '../models/Scheme.js'
import GlAccount from '../models/GlAccount.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { registerAccountSource } from '../lib/accounts.js'
import { registerPostingSource, dr, cr, pendingDr, pendingCr } from '../lib/glLedger.js'
import { round2, at } from '../lib/loanMath.js'

const router = Router()
router.use(requireAuth)

// Share account numbers ran 201100123 — the branch code, then a running
// number of its own that started in the hundred-thousands. The certificate
// carries that same running number.
const ACC_NO_START = 100001

const branchOf = (req) => Branch.findById(req.branchId)
const num = (v, d = 0) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? d : Number(v))
const asDate = (v) => (v ? at(v) : null)
const todayUtc = () => at(new Date())

async function findAccount(req, id = req.params.id) {
  const where = mongoose.isValidObjectId(id) ? { _id: id } : { accNo: id }
  const acc = await ShareAccount.findOne({ ...where, branch: req.branchId })
  if (!acc) throw httpError(404, 'No such share account in this branch.')
  return acc
}

// The next free distinctive number in this branch. Shares are issued in one
// unbroken sequence, so a new allotment carries on from the highest issued.
async function nextShareNo(branchId) {
  const highest = await ShareAccount.findOne({ branch: branchId }).sort({ shareNoTo: -1 }).select('shareNoTo')
  return (highest?.shareNoTo || 0) + 1
}

/* -------------------------------------------------------------- listing */

// GET /api/shares?q=&page=&limit=&status=
router.get('/', async (req, res) => {
  const { q = '', page = 1, limit = 25, status = '' } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  const term = String(q).trim()
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i')
    find.$or = [{ accNo: rx }, { customerName: rx }, { custId: rx }, { certificateNo: rx }]
  }
  const perPage = Math.min(num(limit, 25), 200)
  const skip = (Math.max(num(page, 1), 1) - 1) * perPage
  const [rows, total] = await Promise.all([
    ShareAccount.find(find).sort({ accNo: -1 }).skip(skip).limit(perPage),
    ShareAccount.countDocuments(find),
  ])
  res.json({ shares: rows.map((s) => s.toRow()), total, page: num(page, 1), limit: perPage })
})

// Everything a blank Share Master needs, including the numbers it will take.
router.get('/new', async (req, res) => {
  const [schemes, glAccounts, branch, cash] = await Promise.all([
    Scheme.find({ category: 'SC', status: 'A' }).sort({ code: 1 }),
    GlAccount.find({ active: true, isBankAccount: true }).sort({ name: 1 }),
    branchOf(req),
    GlAccount.findOne({ active: true, name: /cash on hand/i }),
  ])
  const seq = await Counter.peek(`${req.branchId}:share`, ACC_NO_START)
  const trans = await Counter.peek(`${req.branchId}:trans`, 1)
  const from = await nextShareNo(req.branchId)
  res.json({
    accNo: `${branch?.code || ''}${seq}`,
    certificateNo: String(seq),
    transId: String(trans),
    shareNoFrom: from,
    schemes: schemes.map((s) => s.toSafe()),
    glAccounts: [...(cash ? [cash] : []), ...glAccounts.filter((g) => !cash || !g._id.equals(cash._id))].map((g) => ({
      code: g.code,
      name: g.name,
    })),
    branch: branch?.toSafe() || null,
  })
})

// The "Account No -> View Details" lookup the transfer screen uses.
router.get('/lookup/:accNo', async (req, res) => {
  const acc = await ShareAccount.findOne({ branch: req.branchId, accNo: req.params.accNo })
  if (!acc) throw httpError(404, 'No share account with that number in this branch.')
  res.json({ share: acc.toJSONSafe() })
})

/* ------------------------------------------------------------- creation */

router.post('/', async (req, res) => {
  const b = req.body || {}
  const customer = await Customer.findOne({ branch: req.branchId, custId: String(b.custId || '') })
  if (!customer) throw httpError(400, 'Enter a valid customer id.')
  const noOfShares = num(b.noOfShares)
  if (noOfShares <= 0) throw httpError(400, 'Enter how many shares are being issued.')
  const shareValue = num(b.shareValue)

  const branch = await branchOf(req)
  const seq = await Counter.next(`${req.branchId}:share`, ACC_NO_START)
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  const scheme = b.schemeCode ? await Scheme.findOne({ code: b.schemeCode }) : null

  // The run is taken fresh off the end of the branch's sequence, so two
  // allotments can never be given the same distinctive numbers.
  const shareNoFrom = await nextShareNo(req.branchId)
  const shareNoTo = shareNoFrom + noOfShares - 1

  const acc = await ShareAccount.create({
    branch: req.branchId,
    accNo: `${branch.code}${seq}`,
    customer: customer._id,
    custId: customer.custId,
    customerName: customer.name,
    schemeCode: b.schemeCode || '',
    schemeName: scheme?.name || '',
    date: asDate(b.date) || todayUtc(),
    noOfShares,
    shareValue,
    shareAmount: round2(num(b.shareAmount) || noOfShares * shareValue),
    shareNoFrom,
    shareNoTo,
    certificateNo: String(b.certificateNo || seq),
    duplicateNo: b.duplicateNo || '',
    transferee: b.transferee || '',
    transId: String(transSeq),
    transDate: asDate(b.transDate) || todayUtc(),
    glCode: b.glCode || '',
    entranceFees: num(b.entranceFees),
    nominee: {
      name: b.nominee?.name || '',
      relation: b.nominee?.relation || '',
      age: num(b.nominee?.age, undefined),
      dob: asDate(b.nominee?.dob),
    },
    branchShare: !!b.branchShare,
    narration: b.narration || '',
    createdBy: req.user._id,
  })
  res.status(201).json({ share: acc.toJSONSafe() })
})

/* ------------------------------------------------------------ one record */

router.get('/:id', async (req, res) => {
  const acc = await findAccount(req)
  const [customer, transfers, branch] = await Promise.all([
    Customer.findById(acc.customer),
    ShareTransfer.find({ $or: [{ fromAccount: acc._id }, { toAccount: acc._id }] }).sort({ transDate: 1 }),
    branchOf(req),
  ])
  res.json({
    share: acc.toJSONSafe(),
    customer: customer ? customer.toJSONSafe() : null,
    transfers: transfers.map((t) => t.toJSONSafe()),
    branch: branch?.toSafe() || null,
  })
})

router.put('/:id', requireAdmin, async (req, res) => {
  const acc = await findAccount(req)
  const moved = await ShareTransfer.countDocuments({ $or: [{ fromAccount: acc._id }, { toAccount: acc._id }] })
  if (moved > 0) throw httpError(409, 'Shares have been transferred on this holding, so it can no longer be edited.')
  const b = req.body || {}
  for (const f of ['schemeCode', 'certificateNo', 'duplicateNo', 'transferee', 'glCode', 'narration']) {
    if (b[f] !== undefined) acc[f] = b[f]
  }
  if (b.date) acc.date = asDate(b.date)
  if (b.transDate) acc.transDate = asDate(b.transDate)
  if (b.entranceFees !== undefined) acc.entranceFees = num(b.entranceFees)
  if (b.shareValue !== undefined) acc.shareValue = num(b.shareValue)
  if (b.noOfShares !== undefined) {
    acc.noOfShares = num(b.noOfShares)
    // The run starts where it always did and is as long as the count says.
    acc.shareNoTo = acc.shareNoFrom + acc.noOfShares - 1
  }
  acc.shareAmount = round2(num(b.shareAmount) || acc.noOfShares * acc.shareValue)
  if (b.nominee) {
    acc.nominee = {
      name: b.nominee.name || '',
      relation: b.nominee.relation || '',
      age: num(b.nominee.age, undefined),
      dob: asDate(b.nominee.dob),
    }
  }
  if (b.branchShare !== undefined) acc.branchShare = !!b.branchShare
  if (b.verified !== undefined) acc.verified = !!b.verified
  acc.updatedBy = req.user._id
  await acc.save()
  res.json({ share: acc.toJSONSafe() })
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const acc = await findAccount(req)
  const moved = await ShareTransfer.countDocuments({ $or: [{ fromAccount: acc._id }, { toAccount: acc._id }] })
  if (moved > 0) throw httpError(409, 'This holding has transfers against it and cannot be deleted.')
  await acc.deleteOne()
  res.json({ ok: true })
})

/* ------------------------------------------------------------ transfers */

router.get('/transfers/list', async (req, res) => {
  const { from = '', to = '', limit = 200 } = req.query
  const find = { branch: req.branchId }
  if (from || to) {
    find.transDate = {}
    if (from) find.transDate.$gte = at(from)
    if (to) find.transDate.$lte = at(to)
  }
  const rows = await ShareTransfer.find(find).sort({ transDate: -1, createdAt: -1 }).limit(Math.min(num(limit, 200), 1000))
  res.json({ transfers: rows.map((t) => t.toJSONSafe()), total: rows.length })
})

// Moving shares does not merge them into whatever the new holder already
// owns: a run of distinctive numbers is what a certificate covers, so the
// transferred run becomes a holding — and a certificate — of its own.
router.post('/transfers', async (req, res) => {
  const b = req.body || {}
  const fromAcc = await findAccount(req, String(b.fromAccNo || b.fromAccount || ''))
  if (fromAcc.status === 'C') throw httpError(409, 'That holding has already been transferred away in full.')

  const toCustomer = await Customer.findOne({ branch: req.branchId, custId: String(b.toCustId || '') })
  if (!toCustomer) throw httpError(400, 'Enter a valid customer id to transfer the shares to.')
  if (toCustomer.custId === fromAcc.custId) throw httpError(400, 'The shares are already with that member.')

  const count = num(b.noOfShares)
  if (count <= 0) throw httpError(400, 'Enter how many shares are moving.')
  if (count > fromAcc.noOfShares) {
    throw httpError(400, `That holding has only ${fromAcc.noOfShares} shares.`)
  }

  // Shares move off the end of the run, so what is left behind stays one
  // unbroken block rather than becoming two.
  const distTo = fromAcc.shareNoTo
  const distFrom = distTo - count + 1

  const branch = await branchOf(req)
  const seq = await Counter.next(`${req.branchId}:share`, ACC_NO_START)
  const transSeq = await Counter.next(`${req.branchId}:trans`, 1)
  const transDate = asDate(b.transDate) || todayUtc()

  const toAcc = await ShareAccount.create({
    branch: req.branchId,
    accNo: `${branch.code}${seq}`,
    customer: toCustomer._id,
    custId: toCustomer.custId,
    customerName: toCustomer.name,
    schemeCode: fromAcc.schemeCode,
    schemeName: fromAcc.schemeName,
    date: transDate,
    noOfShares: count,
    shareValue: fromAcc.shareValue,
    shareAmount: round2(count * fromAcc.shareValue),
    shareNoFrom: distFrom,
    shareNoTo: distTo,
    certificateNo: String(seq),
    transferee: `${fromAcc.custId} / ${fromAcc.customerName}`,
    transId: String(transSeq),
    transDate,
    nominee: { name: b.nominee || '', relation: '', age: undefined, dob: null },
    narration: b.narration || '',
    createdBy: req.user._id,
  })

  fromAcc.noOfShares = fromAcc.noOfShares - count
  fromAcc.shareNoTo = distFrom - 1
  fromAcc.shareAmount = round2(fromAcc.noOfShares * fromAcc.shareValue)
  if (fromAcc.noOfShares === 0) {
    fromAcc.status = 'C'
    fromAcc.closedDate = transDate
    fromAcc.shareNoFrom = 0
    fromAcc.shareNoTo = 0
  }
  await fromAcc.save()

  const transfer = await ShareTransfer.create({
    branch: req.branchId,
    transId: String(transSeq),
    transDate,
    fromAccount: fromAcc._id,
    fromAccNo: fromAcc.accNo,
    fromCustId: fromAcc.custId,
    fromCustomerName: fromAcc.customerName,
    toAccount: toAcc._id,
    toAccNo: toAcc.accNo,
    toCustId: toAcc.custId,
    toCustomerName: toAcc.customerName,
    schemeCode: fromAcc.schemeCode,
    noOfShares: count,
    shareValue: fromAcc.shareValue,
    shareAmount: round2(count * fromAcc.shareValue),
    distFrom,
    distTo,
    nominee: b.nominee || '',
    narration: b.narration || '',
    createdBy: req.user._id,
  })

  res.status(201).json({
    transfer: transfer.toJSONSafe(),
    from: fromAcc.toJSONSafe(),
    to: toAcc.toJSONSafe(),
  })
})

/* ------------------------------------------------------------- reports */

// Share Allotment Report — what was issued between two dates.
router.get('/reports/allotment', async (req, res) => {
  const { from = '', to = '', custId = '' } = req.query
  const find = { branch: req.branchId }
  if (from || to) {
    find.date = {}
    if (from) find.date.$gte = at(from)
    if (to) find.date.$lte = at(to)
  }
  if (custId) find.custId = String(custId)
  const rows = await ShareAccount.find(find).sort({ date: 1, accNo: 1 })
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    rows: rows.map((s) => s.toRow()),
    totals: {
      count: rows.length,
      shares: rows.reduce((t, s) => t + s.noOfShares, 0),
      amount: round2(rows.reduce((t, s) => t + s.shareAmount, 0)),
      entranceFees: round2(rows.reduce((t, s) => t + s.entranceFees, 0)),
    },
  })
})

// Share Register — every live holding, in distinctive-number order, which is
// how a share register is kept.
router.get('/reports/register', async (req, res) => {
  const { status = 'A' } = req.query
  const find = { branch: req.branchId }
  if (status) find.status = status
  const rows = await ShareAccount.find(find).sort({ shareNoFrom: 1 })
  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    rows: rows.map((s) => s.toRow()),
    totals: {
      count: rows.length,
      shares: rows.reduce((t, s) => t + s.noOfShares, 0),
      amount: round2(rows.reduce((t, s) => t + s.shareAmount, 0)),
    },
  })
})

// One holding's history: the allotment, then anything that moved in or out.
router.get('/:id/statement', async (req, res) => {
  const acc = await findAccount(req)
  const transfers = await ShareTransfer.find({
    $or: [{ fromAccount: acc._id }, { toAccount: acc._id }],
  }).sort({ transDate: 1, createdAt: 1 })

  const lines = []
  let held = 0
  const openedByTransfer = transfers.find((t) => t.toAccount?.equals(acc._id))
  held = acc.noOfShares
  // Work the history forwards from the allotment rather than backwards from
  // today, so the running count is right even mid-way through.
  let running = 0
  const first = {
    date: acc.date,
    transId: acc.transId,
    particulars: openedByTransfer ? `Transferred in from ${openedByTransfer.fromAccNo}` : 'Shares allotted',
    inShares: openedByTransfer ? openedByTransfer.noOfShares : acc.noOfShares + sumOut(transfers, acc),
    outShares: 0,
  }
  running += first.inShares
  lines.push({ ...first, held: running })

  for (const t of transfers) {
    if (t.toAccount?.equals(acc._id)) continue // that is the opening line
    running -= t.noOfShares
    lines.push({
      date: t.transDate,
      transId: t.transId,
      particulars: `Transferred to ${t.toCustId} / ${t.toCustomerName}`,
      inShares: 0,
      outShares: t.noOfShares,
      held: running,
    })
  }

  res.json({
    branch: (await branchOf(req))?.toSafe() || null,
    share: acc.toJSONSafe(),
    lines,
    totals: { held, amount: acc.shareAmount },
  })
})

// How many shares have left this holding since it was opened.
function sumOut(transfers, acc) {
  return transfers.filter((t) => t.fromAccount?.equals(acc._id)).reduce((t, x) => t + x.noOfShares, 0)
}

/* ---------------------------------------------- customer enquiry / reports */

/* ----------------------------------------------------------- the day book */

registerPostingSource({
  source: 'Share',
  load: async ({ branchId, from, to, chart }) => {
    const window = (field) =>
      from || to ? { [field]: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}

    const [issues, transfers] = await Promise.all([
      ShareAccount.find({ branch: branchId, ...window('date') }),
      ShareTransfer.find({ branch: branchId, ...window('transDate') }),
    ])

    const entries = issues.map((s) => {
      const head = chart.schemeGl(s.schemeCode)
      const fees = round2(s.entranceFees)
      const taken = round2(s.shareAmount + fees)
      const postings = [s.glCode ? dr(s.glCode, taken, 'Received') : pendingDr('mop.unknown', taken, 'Received')]
      postings.push(cr(head, s.shareAmount, 'Share capital'))
      if (fees > 0) postings.push(pendingCr('share.entrance', fees, 'Entrance fees'))
      return {
        transId: s.transId,
        date: s.date,
        particulars: `Share Allotment - ${s.accNo} - ${s.customerName}`,
        amount: taken,
        accNo: s.accNo,
        custId: s.custId,
        customerName: s.customerName,
        kind: 'allotment',
        refId: s._id.toString(),
        status: s.status === 'C' ? 'closed' : 'A',
        createdBy: s.createdBy?.toString() || '',
        postings,
      }
    })

    // A transfer moves a run of share numbers between two members. The share
    // capital is unchanged and no money crosses the counter, so it belongs in
    // the transaction list without a posting of its own.
    for (const t of transfers) {
      entries.push({
        transId: t.transId,
        date: t.transDate,
        particulars: `Share Transfer - ${t.fromAccNo} to ${t.toAccNo || '—'} - ${t.noOfShares} shares`,
        amount: t.shareAmount,
        accNo: t.fromAccNo,
        custId: t.fromCustId,
        customerName: t.fromCustomerName,
        kind: 'transfer',
        refId: t._id.toString(),
        status: 'A',
        createdBy: t.createdBy?.toString() || '',
        postings: [],
      })
    }

    return entries
  },
})

registerAccountSource({
  accType: 'Share',
  schemeType: 'OTH',
  osType: 'SC',
  outstanding: async ({ branchId, asOn }) => {
    const rows = await ShareAccount.find({
      branch: branchId,
      date: { $lte: asOn },
      status: 'A',
    }).sort({ accNo: 1 })
    return rows.map((s) => ({
      accNo: s.accNo,
      custId: s.custId,
      customerName: s.customerName,
      scheme: s.schemeName || s.schemeCode,
      openDate: s.date,
      balance: s.shareAmount,
    }))
  },
  lookup: async ({ branchId }, accNo) => {
    const s = await ShareAccount.findOne({ branch: branchId, accNo })
    if (!s) return null
    return {
      accNo: s.accNo,
      custId: s.custId,
      customerName: s.customerName,
      scheme: s.schemeName || s.schemeCode,
      balance: s.shareAmount,
      status: s.status === 'C' ? 'Closed' : 'Active',
    }
  },
  load: async ({ branchId, customer }) => {
    const rows = await ShareAccount.find({ branch: branchId, customer: customer._id }).sort({ date: -1 })
    return rows.map((s) => ({
      accNo: s.accNo,
      scheme: s.schemeName || s.schemeCode,
      openDate: s.date,
      dueDate: null,
      period: `${s.noOfShares} shares`,
      balance: s.shareAmount,
      status: s.status === 'C' ? 'Closed' : 'Active',
    }))
  },
})

export default router
