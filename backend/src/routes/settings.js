import { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import Branch from '../models/Branch.js'
import Schedule from '../models/Schedule.js'
import GlAccount, { GL_CATEGORIES } from '../models/GlAccount.js'
import Scheme, { SCHEME_CATEGORIES } from '../models/Scheme.js'
import InterestSlab from '../models/InterestSlab.js'
import DepositPeriod from '../models/DepositPeriod.js'
import GoldRate from '../models/GoldRate.js'
import ReportSetting from '../models/ReportSetting.js'
import Lookup, { LOOKUP_KINDS } from '../models/Lookup.js'
import GeneralSetting from '../models/GeneralSetting.js'
import OpeningBalance from '../models/OpeningBalance.js'
import Holiday from '../models/Holiday.js'
import User, { PERMISSION_MODULES } from '../models/User.js'

const router = Router()
router.use(requireAuth)

/* ------------------------------------------------------------------ utils */

// Most settings screens are the same screen: a form on top, a searchable list
// under it, and update / delete per row. One builder covers all of them.
function crud(model, { fields, searchable = [], sort = { createdAt: -1 }, label = 'record' }) {
  const r = Router()

  r.get('/', async (req, res) => {
    const q = String(req.query.q || '').trim()
    const find = {}
    if (q && searchable.length) {
      const rx = new RegExp(escapeRegex(q), 'i')
      find.$or = searchable.map((f) => ({ [f]: rx }))
    }
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'q' && k !== 'limit' && fields.includes(k) && v !== '') find[k] = v
    }
    const limit = Math.min(Number(req.query.limit) || 500, 2000)
    const rows = await model.find(find).sort(sort).limit(limit)
    res.json({ rows: rows.map((d) => d.toSafe()), total: await model.countDocuments(find) })
  })

  r.post('/', requireAdmin, async (req, res) => {
    const doc = await model.create(pick(req.body, fields))
    res.status(201).json({ row: doc.toSafe() })
  })

  r.put('/:id', requireAdmin, async (req, res) => {
    const doc = await model.findByIdAndUpdate(req.params.id, { $set: pick(req.body, fields) }, {
      new: true,
      runValidators: true,
    })
    if (!doc) throw httpError(404, `No such ${label}.`)
    res.json({ row: doc.toSafe() })
  })

  r.delete('/:id', requireAdmin, async (req, res) => {
    const doc = await model.findByIdAndDelete(req.params.id)
    if (!doc) throw httpError(404, `No such ${label}.`)
    res.json({ ok: true })
  })

  return r
}

function pick(body = {}, fields) {
  const out = {}
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f]
  return out
}

const oid = (v) => new mongoose.Types.ObjectId(String(v))

/* ------------------------------------------------------------- the masters */

router.use('/schedules', crud(Schedule, {
  fields: ['code', 'name', 'active'],
  searchable: ['code', 'name'],
  sort: { code: 1 },
  label: 'schedule',
}))

router.use('/gl-accounts', crud(GlAccount, {
  fields: ['code', 'name', 'schedule', 'category', 'isBankAccount', 'active'],
  searchable: ['code', 'name'],
  sort: { code: 1 },
  label: 'GL account',
}))

router.use('/schemes', crud(Scheme, {
  fields: ['code', 'name', 'category', 'glCode', 'interestGlCode', 'minAmount', 'maxAmount', 'status'],
  searchable: ['code', 'name'],
  sort: { code: 1 },
  label: 'scheme',
}))

router.use('/interest-slabs', crud(InterestSlab, {
  fields: ['schemeCode', 'schemeName', 'period', 'effectDate', 'rate', 'penalRate', 'srCtznRate', 'srCtznPenalRate'],
  searchable: ['schemeCode', 'schemeName', 'period'],
  sort: { effectDate: -1, schemeCode: 1 },
  label: 'interest slab',
}))

router.use('/deposit-periods', crud(DepositPeriod, {
  fields: ['schemeCode', 'schemeName', 'period', 'periodCode', 'unit', 'status'],
  searchable: ['schemeCode', 'schemeName', 'period'],
  sort: { schemeCode: 1, periodCode: 1 },
  label: 'deposit period',
}))

router.use('/gold-rates', crud(GoldRate, {
  fields: ['effectDate', 'marketRate', 'ratePerGram', 'createdBy'],
  searchable: [],
  sort: { effectDate: -1 },
  label: 'gold rate',
}))

router.use('/report-settings', crud(ReportSetting, {
  fields: ['reportCode', 'groupName', 'glCode', 'glName'],
  searchable: ['groupName', 'glCode', 'glName'],
  sort: { groupName: 1, glCode: 1 },
  label: 'report setting',
}))

/* ------------------------------------------- the three one-column masters */

// /lookups/jewel, /lookups/idProof, /lookups/bank
router.get('/lookups/:kind', async (req, res) => {
  const kind = lookupKind(req)
  const rows = await Lookup.find({ kind }).sort({ sort: 1, name: 1 })
  res.json({ rows: rows.map((d) => d.toSafe()), total: rows.length })
})

router.post('/lookups/:kind', requireAdmin, async (req, res) => {
  const kind = lookupKind(req)
  const name = String(req.body.name || '').trim()
  if (!name) throw httpError(400, 'Enter a name.')
  const doc = await Lookup.create({ kind, name })
  res.status(201).json({ row: doc.toSafe() })
})

router.put('/lookups/:kind/:id', requireAdmin, async (req, res) => {
  const kind = lookupKind(req)
  const doc = await Lookup.findOneAndUpdate(
    { _id: req.params.id, kind },
    { $set: pick(req.body, ['name', 'sort', 'active']) },
    { new: true, runValidators: true }
  )
  if (!doc) throw httpError(404, 'No such entry.')
  res.json({ row: doc.toSafe() })
})

router.delete('/lookups/:kind/:id', requireAdmin, async (req, res) => {
  const doc = await Lookup.findOneAndDelete({ _id: req.params.id, kind: lookupKind(req) })
  if (!doc) throw httpError(404, 'No such entry.')
  res.json({ ok: true })
})

function lookupKind(req) {
  const kind = req.params.kind
  if (!LOOKUP_KINDS.includes(kind)) throw httpError(404, 'No such list.')
  return kind
}

/* ------------------------------------------------------- branch + general */

// Branch Master edits the branch the user is signed in to.
router.get('/branch', async (req, res) => {
  const b = await Branch.findById(req.branchId)
  if (!b) throw httpError(404, 'No such branch.')
  res.json({ branch: b.toSafe() })
})

router.put('/branch', requireAdmin, async (req, res) => {
  const b = await Branch.findByIdAndUpdate(
    req.branchId,
    { $set: pick(req.body, ['name', 'companyName', 'address', 'city', 'pincode', 'phone', 'active']) },
    { new: true, runValidators: true }
  )
  if (!b) throw httpError(404, 'No such branch.')
  res.json({ branch: b.toSafe() })
})

const GENERAL_FIELDS = [
  'cashAccountNo', 'pandlAccountNo', 'aoAccountNo', 'aoBranchCode',
  'cashTranLimit', 'depositLimit', 'tdsLimit', 'tdsPercentage',
  'smsEnabled', 'chequeOption', 'directPrint', 'allowOdLoan', 'monthEndPosting',
]

router.get('/general', async (req, res) => {
  const doc =
    (await GeneralSetting.findOne({ branch: req.branchId })) ||
    new GeneralSetting({ branch: oid(req.branchId) })
  res.json({ settings: doc.toSafe() })
})

router.put('/general', requireAdmin, async (req, res) => {
  const doc = await GeneralSetting.findOneAndUpdate(
    { branch: req.branchId },
    { $set: pick(req.body, GENERAL_FIELDS) },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  )
  res.json({ settings: doc.toSafe() })
})

/* ------------------------------------------------------- opening balances */

// Every GL account, with this branch's opening balance beside it.
router.get('/opening-balances', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const find = {}
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i')
    find.$or = [{ code: rx }, { name: rx }]
  }
  const [accounts, balances] = await Promise.all([
    GlAccount.find(find).sort({ code: 1 }).limit(1000),
    OpeningBalance.find({ branch: req.branchId }),
  ])
  const byCode = new Map(balances.map((b) => [b.glCode, b]))
  res.json({
    rows: accounts.map((a) => {
      const b = byCode.get(a.code)
      return {
        glCode: a.code,
        glName: a.name,
        amount: b?.amount ?? 0,
        type: b?.type ?? 'Cr',
        sanctionLimit: b?.sanctionLimit ?? 0,
        asOn: b?.asOn ?? null,
      }
    }),
  })
})

// Saves only the rows the screen actually changed.
router.put('/opening-balances', requireAdmin, async (req, res) => {
  const asOn = req.body.asOn ? new Date(req.body.asOn) : new Date()
  if (isNaN(asOn)) throw httpError(400, 'Enter a valid date.')
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  if (!rows.length) return res.json({ saved: 0 })

  const ops = rows
    .filter((r) => r.glCode)
    .map((r) => ({
      updateOne: {
        filter: { branch: oid(req.branchId), glCode: String(r.glCode) },
        update: {
          $set: {
            amount: Number(r.amount) || 0,
            type: r.type === 'Dr' ? 'Dr' : 'Cr',
            sanctionLimit: Number(r.sanctionLimit) || 0,
            asOn,
          },
          $setOnInsert: { branch: oid(req.branchId), glCode: String(r.glCode) },
        },
        upsert: true,
      },
    }))
  await OpeningBalance.bulkWrite(ops, { ordered: false })
  res.json({ saved: ops.length })
})

/* --------------------------------------------------------------- calendar */

router.get('/holidays', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear()
  const from = new Date(year, 0, 1)
  const to = new Date(year + 1, 0, 1)
  const rows = await Holiday.find({
    date: { $gte: from, $lt: to },
    $or: [{ branch: null }, { branch: req.branchId }],
  }).sort({ date: 1 })
  res.json({ rows: rows.map((d) => d.toSafe()), year })
})

router.post('/holidays', requireAdmin, async (req, res) => {
  const date = new Date(req.body.date)
  if (isNaN(date)) throw httpError(400, 'Pick a date.')
  date.setHours(0, 0, 0, 0)
  const branch = req.body.allBranches ? null : oid(req.branchId)
  const doc = await Holiday.findOneAndUpdate(
    { branch, date },
    { $set: { description: String(req.body.description || '').trim() } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  res.status(201).json({ row: doc.toSafe() })
})

router.delete('/holidays/:id', requireAdmin, async (req, res) => {
  const doc = await Holiday.findByIdAndDelete(req.params.id)
  if (!doc) throw httpError(404, 'No such holiday.')
  res.json({ ok: true })
})

/* ------------------------------------------------------------------ users */

router.get('/permission-modules', (_req, res) => res.json({ modules: PERMISSION_MODULES }))

router.get('/users', requireAdmin, async (_req, res) => {
  const rows = await User.find().sort({ username: 1 })
  res.json({ rows: rows.map((u) => u.toSafe()) })
})

router.post('/users', requireAdmin, async (req, res) => {
  const { empId = '', name = '', username = '', password = '', confirm = '' } = req.body
  if (!String(name).trim()) throw httpError(400, 'Enter the employee name.')
  if (String(username).trim().length < 3) throw httpError(400, 'The user id needs at least 3 characters.')
  if (String(password).length < 6) throw httpError(400, 'The password needs at least 6 characters.')
  if (password !== confirm) throw httpError(400, 'The two passwords do not match.')
  if (await User.findOne({ username: String(username).toLowerCase().trim() })) {
    throw httpError(409, 'That user id is taken.')
  }
  const user = await User.create({
    empId: String(empId).trim(),
    name: String(name).trim(),
    username: String(username).toLowerCase().trim(),
    passwordHash: await User.hashPassword(password),
    role: 'staff',
    branches: [oid(req.branchId)],
  })
  res.status(201).json({ row: user.toSafe() })
})

router.put('/users/:id', requireAdmin, async (req, res) => {
  const update = pick(req.body, ['empId', 'name', 'active'])
  if (req.body.branches) update.branches = req.body.branches.map(oid)
  if (req.body.permissions) update.permissions = req.body.permissions
  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true })
  if (!user) throw httpError(404, 'No such user.')
  res.json({ row: user.toSafe() })
})

// Anyone may change their own password; an admin may change anyone's.
router.post('/change-password', async (req, res) => {
  const { username = '', currentPassword = '', password = '', confirm = '' } = req.body
  const target = String(username).toLowerCase().trim() || req.user.username
  const self = target === req.user.username
  if (!self && req.user.role !== 'admin') throw httpError(403, 'You can only change your own password.')
  if (String(password).length < 6) throw httpError(400, 'The new password needs at least 6 characters.')
  if (password !== confirm) throw httpError(400, 'The two passwords do not match.')

  const user = self ? req.user : await User.findOne({ username: target })
  if (!user) throw httpError(404, 'No such user.')
  if (self && !(await user.checkPassword(currentPassword))) {
    throw httpError(400, 'That is not your current password.')
  }
  user.passwordHash = await User.hashPassword(password)
  await user.save()
  res.json({ ok: true })
})

/* ----------------------------------------------------- interest provision */

// The old month-end run posts interest for every deposit and loan product.
// There is nothing to post until those modules exist, so say so plainly
// rather than pretending the run happened.
router.post('/interest-provision', requireAdmin, async (req, res) => {
  const products = Array.isArray(req.body.products) ? req.body.products : []
  throw httpError(
    409,
    `Nothing to provision${products.length ? ` for ${products.join(', ')}` : ''} — the deposit and loan modules are not built yet.`
  )
})

/* ----------------------------------------------------------------- shared */

// Small reference lists the settings screens fill their dropdowns from.
router.get('/options', async (_req, res) => {
  const [schedules, glAccounts, schemes] = await Promise.all([
    Schedule.find().sort({ code: 1 }),
    GlAccount.find().sort({ code: 1 }).limit(1000),
    Scheme.find().sort({ code: 1 }),
  ])
  res.json({
    schedules: schedules.map((s) => ({ code: s.code, name: s.name })),
    glAccounts: glAccounts.map((g) => ({ code: g.code, name: g.name })),
    schemes: schemes.map((s) => ({ code: s.code, name: s.name, category: s.category })),
    glCategories: GL_CATEGORIES,
    schemeCategories: SCHEME_CATEGORIES,
  })
})

export default router
