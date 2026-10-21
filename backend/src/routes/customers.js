import { Router } from 'express'
import Customer from '../models/Customer.js'
import Counter from '../models/Counter.js'
import { requireAuth } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'

const router = Router()
router.use(requireAuth)

// Starting customer id per branch, mirroring the old "10100130"-style numbers.
const CUST_ID_START = 10100001

// GET /api/customers?q=&page=&limit=  — searchable, branch-scoped list.
router.get('/', async (req, res) => {
  const { q = '', page = 1, limit = 25 } = req.query
  const find = { branch: req.branchId }
  if (q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i')
    find.$or = [{ name: rx }, { custId: rx }, { mobile: rx }, { phone: rx }, { city: rx }]
  }
  const perPage = Math.min(Number(limit) || 25, 100)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * perPage
  const [rows, total] = await Promise.all([
    Customer.find(find).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    Customer.countDocuments(find),
  ])
  res.json({ customers: rows.map((c) => c.toJSONSafe()), total, page: Number(page) || 1, limit: perPage })
})

// Lightweight lookup used by the "Customer ID → View Details" pattern on forms.
router.get('/lookup/:custId', async (req, res) => {
  const c = await Customer.findOne({ branch: req.branchId, custId: req.params.custId })
  if (!c) return res.status(404).json({ error: 'No customer with that id in this branch.' })
  res.json({
    custId: c.custId,
    name: c.name,
    fatherOrGuardian: c.fatherOrGuardian,
    mobile: c.mobile,
    city: c.city,
    address: c.address,
  })
})

router.get('/:id', async (req, res) => {
  const c = await Customer.findOne({ _id: req.params.id, branch: req.branchId })
  if (!c) return res.status(404).json({ error: 'No such customer.' })
  res.json({ customer: c.toJSONSafe() })
})

router.post('/', async (req, res) => {
  const custId = String(await Counter.next(`${req.branchId}:customer`, CUST_ID_START))
  const c = await Customer.create({
    ...pickCustomerFields(req.body),
    branch: req.branchId,
    custId,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  })
  res.status(201).json({ customer: c.toJSONSafe() })
})

router.put('/:id', async (req, res) => {
  const c = await Customer.findOneAndUpdate(
    { _id: req.params.id, branch: req.branchId },
    { $set: { ...pickCustomerFields(req.body), updatedBy: req.user._id } },
    { new: true, runValidators: true }
  )
  if (!c) return res.status(404).json({ error: 'No such customer.' })
  res.json({ customer: c.toJSONSafe() })
})

// Only an admin may deactivate; staff edit but never remove.
router.patch('/:id/active', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do that.' })
  const c = await Customer.findOneAndUpdate(
    { _id: req.params.id, branch: req.branchId },
    { $set: { active: !!req.body.active, updatedBy: req.user._id } },
    { new: true }
  )
  if (!c) return res.status(404).json({ error: 'No such customer.' })
  res.json({ customer: c.toJSONSafe() })
})

// Whitelist — never trust the client to set branch, custId, audit fields.
function pickCustomerFields(b = {}) {
  const allowed = [
    'name', 'fatherOrGuardian', 'relation', 'gender', 'dob', 'maritalStatus',
    'occupation', 'customerType', 'anniversaryDate', 'address', 'city', 'pincode',
    'phone', 'mobile', 'email', 'permanentAddress', 'permanentCity',
    'permanentPincode', 'sameAsAddress', 'panNo', 'idProofs', 'nominee',
    'introducerId', 'introducerName', 'smsOptIn', 'deductTds', 'photoUrl',
    'signatureUrl', 'remarks',
  ]
  const out = {}
  for (const k of allowed) if (b[k] !== undefined) out[k] = b[k]
  return out
}

export default router
