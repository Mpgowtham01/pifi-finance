import { Router } from 'express'
import mongoose from 'mongoose'
import Customer from '../models/Customer.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Branch overview. Real numbers come from the Customer module today; the other
// modules report a zeroed shape (same fields as the reference dashboard cards)
// so each one fills in automatically as it is built.
router.get('/', async (req, res) => {
  const branch = req.branchId
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [total, active, newThisMonth, byMonth] = await Promise.all([
    Customer.countDocuments({ branch }),
    Customer.countDocuments({ branch, active: true }),
    Customer.countDocuments({ branch, createdAt: { $gte: startOfMonth } }),
    Customer.aggregate([
      { $match: { branch: toObjectId(branch), createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
  ])

  // Build a dense last-6-months trend (fill gaps with 0).
  const trend = []
  const map = new Map(byMonth.map((b) => [`${b._id.y}-${b._id.m}`, b.count]))
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    trend.push({ label: MONTHS[d.getMonth()], count: map.get(`${d.getFullYear()}-${d.getMonth() + 1}`) || 0 })
  }

  const recent = (await Customer.find({ branch }).sort({ createdAt: -1 }).limit(6)).map((c) => ({
    id: c._id.toString(),
    custId: c.custId,
    name: c.name,
    mobile: c.mobile,
    city: c.city,
    hasPhoto: c.hasPhoto,
    createdAt: c.createdAt,
  }))

  res.json({
    kpis: [
      { key: 'customers', label: 'Total Customers', value: total, hint: `${active} active`, icon: '👥' },
      { key: 'deposits', label: 'Total Deposits', value: 0, money: true, hint: 'SB + FD + RD', icon: '🏦' },
      { key: 'loans', label: 'Loans Outstanding', value: 0, money: true, hint: 'Jewel + Other', icon: '💍' },
      { key: 'cash', label: 'Cash & Bank', value: 0, money: true, hint: 'On hand + bank', icon: '🏧' },
    ],
    modules: [
      { key: 'customer', title: 'Customer', tone: 'sky', stats: [['Customers', total], ['Share A/cs', 0], ['Net Balance', money(0)]] },
      { key: 'savings', title: 'Savings', tone: 'red', stats: [['Accounts', 0], ['Net Balance', money(0)], ['Customers', 0]] },
      { key: 'fd', title: 'Fixed Deposit', tone: 'teal', stats: [['FD', 0], ['CD', 0], ['Customers', 0]] },
      { key: 'rd', title: 'Recurring Deposit', tone: 'cyan', stats: [['Accounts', 0], ['Net Balance', money(0)], ['Customers', 0]] },
      { key: 'jewel', title: 'Jewel Loan', tone: 'green', stats: [['Accounts', 0], ['Net Balance', money(0)], ['Customers', 0]] },
      { key: 'loans', title: 'Other Loans', tone: 'pink', stats: [['DL', 0], ['ML', 0], ['Customers', 0]] },
      { key: 'cashbank', title: 'Cash & Bank', tone: 'coral', stats: [['Cash Balance', money(0)], ['Bank A/c', money(0)]] },
      { key: 'reminders', title: 'Reminders', tone: 'indigo', stats: [['Maturity', 0], ['Overdue', 0], ['SMS', 0]] },
    ],
    trend,
    recent,
  })
})

function money(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

// Aggregation needs a real ObjectId for the branch match.
function toObjectId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
}

export default router
