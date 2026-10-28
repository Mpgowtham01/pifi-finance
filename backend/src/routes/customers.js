import { Router } from 'express'
import Customer from '../models/Customer.js'
import Branch from '../models/Branch.js'
import Counter from '../models/Counter.js'
import { requireAuth } from '../middleware/auth.js'
import { escapeRegex } from '../lib/escapeRegex.js'
import { httpError } from '../lib/httpError.js'
import { accountsForCustomer, registeredAccountTypes } from '../lib/accounts.js'
import { parseImage, sendImage } from '../lib/image.js'

const router = Router()
router.use(requireAuth)

// Starting customer id per branch, mirroring the old "10100130"-style numbers.
const CUST_ID_START = 10100001

/* ------------------------------------------------------------------ list */

// GET /api/customers?q=&page=&limit=&status=all|active|inactive
// The old Customer_List.aspx searched one keyword across the whole row.
router.get('/', async (req, res) => {
  const { q = '', page = 1, limit = 25, status = 'all' } = req.query
  const find = { branch: req.branchId }
  if (status === 'active') find.active = true
  if (status === 'inactive') find.active = false
  if (q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i')
    find.$or = [
      { custId: rx }, { name: rx }, { address: rx }, { city: rx },
      { pincode: rx }, { mobile: rx }, { phone: rx }, { fatherOrGuardian: rx },
    ]
  }
  const perPage = Math.min(Number(limit) || 25, 100)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * perPage
  const [rows, total] = await Promise.all([
    Customer.find(find).sort({ custId: -1 }).skip(skip).limit(perPage),
    Customer.countDocuments(find),
  ])
  res.json({ customers: rows.map((c) => c.toJSONSafe()), total, page: Number(page) || 1, limit: perPage })
})

/* ---------------------------------------------------------------- lookup */

// The "Customer ID -> View Details" pattern every entry form in the old app used.
router.get('/lookup/:custId', async (req, res) => {
  const c = await Customer.findOne({ branch: req.branchId, custId: req.params.custId })
  if (!c) throw httpError(404, 'No customer with that id in this branch.')
  res.json({ customer: summary(c) })
})

// Type-ahead behind the Introducer "Search" button.
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ customers: [] })
  const rx = new RegExp(escapeRegex(q), 'i')
  const rows = await Customer.find({
    branch: req.branchId,
    $or: [{ custId: rx }, { name: rx }, { mobile: rx }, { city: rx }],
  })
    .sort({ name: 1 })
    .limit(15)
  res.json({ customers: rows.map(summary) })
})

/* --------------------------------------------------------------- reports */

// "List of A/c's for Customer" - accounts of one customer, filtered the same way
// the old Customer_Reports.aspx filtered them (A/c status + scheme type).
router.get('/reports/accounts', async (req, res) => {
  const { custId, schemeType = '', status = '' } = req.query
  const customer = await Customer.findOne({ branch: req.branchId, custId: String(custId || '') })
  if (!customer) throw httpError(404, 'Enter a valid customer id first.')
  const schemeTypes = splitList(schemeType)
  const statuses = splitList(status)
  const accounts = await accountsForCustomer({ branchId: req.branchId, customer }, { schemeTypes, statuses })
  res.json({ branch: await branchOf(req), customer: summary(customer), accounts, accountTypes: registeredAccountTypes() })
})

// The customer "Card" report - everything held about one customer.
router.get('/reports/card', async (req, res) => {
  const customer = await Customer.findOne({ branch: req.branchId, custId: String(req.query.custId || '') })
  if (!customer) throw httpError(404, 'Enter a valid customer id first.')
  const accounts = await accountsForCustomer({ branchId: req.branchId, customer })
  res.json({ branch: await branchOf(req), customer: customer.toJSONSafe(), accounts })
})

// Staff A/c List - customers recorded as Staff, with their accounts.
router.get('/reports/staff-accounts', async (req, res) => {
  const staff = await Customer.find({ branch: req.branchId, customerType: 'Staff' }).sort({ custId: 1 })
  const rows = []
  for (const customer of staff) {
    const accounts = await accountsForCustomer({ branchId: req.branchId, customer })
    if (accounts.length === 0) {
      rows.push({ ...summary(customer), accType: '', accNo: '', openDate: null, dueDate: null, period: '', balance: null })
    }
    for (const a of accounts) rows.push({ ...summary(customer), ...a })
  }
  res.json({ branch: await branchOf(req), rows, total: rows.length })
})

// In-Active Customers.
router.get('/reports/inactive', async (req, res) => {
  const rows = await Customer.find({ branch: req.branchId, active: false }).sort({ custId: 1 })
  res.json({ branch: await branchOf(req), rows: rows.map((c) => c.toJSONSafe()), total: rows.length })
})

/* ------------------------------------------------------------ one record */

router.get('/:id', async (req, res) => {
  const c = await findOne(req)
  res.json({ customer: c.toJSONSafe() })
})

// The accounts grid on the Customer Enquiry screen.
router.get('/:id/accounts', async (req, res) => {
  const customer = await findOne(req)
  const accounts = await accountsForCustomer({ branchId: req.branchId, customer })
  res.json({ accounts, accountTypes: registeredAccountTypes() })
})

router.get('/:id/photo', (req, res) => sendImage(Customer, req, res, 'photo'))
router.get('/:id/jewel-photo', (req, res) => sendImage(Customer, req, res, 'jewelPhoto'))
router.get('/:id/signature', (req, res) => sendImage(Customer, req, res, 'signature'))

/* --------------------------------------------------------------- writing */

router.post('/', async (req, res) => {
  const custId = String(await Counter.next(`${req.branchId}:customer`, CUST_ID_START))
  const c = await Customer.create({
    ...pickCustomerFields(req.body),
    ...pickImages(req.body),
    branch: req.branchId,
    custId,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  })
  res.status(201).json({ customer: c.toJSONSafe() })
})

router.put('/:id', async (req, res) => {
  const images = pickImages(req.body)
  const unset = {}
  for (const k of ['photo', 'jewelPhoto', 'signature']) {
    if (images[k] === null) {
      delete images[k]
      unset[k] = ''
    }
  }
  const update = { $set: { ...pickCustomerFields(req.body), ...images, updatedBy: req.user._id } }
  if (Object.keys(unset).length) update.$unset = unset
  const c = await Customer.findOneAndUpdate({ _id: req.params.id, branch: req.branchId }, update, {
    new: true,
    runValidators: true,
  })
  if (!c) throw httpError(404, 'No such customer.')
  res.json({ customer: c.toJSONSafe() })
})

// Only an admin may deactivate; staff edit but never remove.
router.patch('/:id/active', async (req, res) => {
  if (req.user.role !== 'admin') throw httpError(403, 'Only an admin can do that.')
  const c = await Customer.findOneAndUpdate(
    { _id: req.params.id, branch: req.branchId },
    { $set: { active: !!req.body.active, updatedBy: req.user._id } },
    { new: true }
  )
  if (!c) throw httpError(404, 'No such customer.')
  res.json({ customer: c.toJSONSafe() })
})

// Delete, as the old Customer_List.aspx offered - refused once the customer
// holds accounts, which is what the old app's referential checks did.
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') throw httpError(403, 'Only an admin can delete a customer.')
  const customer = await findOne(req)
  const accounts = await accountsForCustomer({ branchId: req.branchId, customer })
  if (accounts.length) {
    throw httpError(409, `${customer.name} holds ${accounts.length} account(s). Mark the customer in-active instead.`)
  }
  await customer.deleteOne()
  res.json({ ok: true, custId: customer.custId })
})

/* ----------------------------------------------------------------- utils */

const splitList = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean)

// Reports print the branch name and address in their header.
async function branchOf(req) {
  const b = await Branch.findById(req.branchId)
  return b ? b.toSafe() : null
}

async function findOne(req) {
  const c = await Customer.findOne({ _id: req.params.id, branch: req.branchId })
  if (!c) throw httpError(404, 'No such customer.')
  return c
}

function summary(c) {
  return {
    id: c._id.toString(),
    custId: c.custId,
    name: c.name,
    fatherOrGuardian: c.fatherOrGuardian,
    address: c.address,
    city: c.city,
    pincode: c.pincode,
    mobile: c.mobile,
    customerType: c.customerType,
    active: c.active,
  }
}

function pickImages(b = {}) {
  const out = {}
  const HAS = { photo: 'hasPhoto', jewelPhoto: 'hasJewelPhoto', signature: 'hasSignature' }
  for (const field of Object.keys(HAS)) {
    const img = parseImage(b[field])
    if (img === undefined) continue
    out[field] = img
    out[HAS[field]] = !!img
  }
  return out
}

// Whitelist - never trust the client to set branch, custId, audit fields.
function pickCustomerFields(b = {}) {
  const allowed = [
    'name', 'fatherOrGuardian', 'relation', 'gender', 'dob', 'maritalStatus',
    'occupation', 'customerType', 'anniversaryDate', 'address', 'city', 'pincode',
    'phone', 'mobile', 'email', 'permanentAddress', 'permanentCity',
    'permanentPincode', 'sameAsAddress', 'panNo', 'idProofs', 'nominee',
    'introducerId', 'introducerName', 'smsOptIn', 'deductTds', 'remarks', 'active',
  ]
  const out = {}
  for (const k of allowed) if (b[k] !== undefined) out[k] = b[k]
  return out
}

export default router
