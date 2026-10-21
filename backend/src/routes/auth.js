import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import Branch from '../models/Branch.js'
import User from '../models/User.js'
import { issueToken, clearToken, requireAuth } from '../middleware/auth.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
})

// Which branches a user may sign in to (drives the login dropdown too).
async function branchesForUser(user) {
  const all = await Branch.find({ active: true }).sort({ code: 1 })
  if (user.role === 'admin' || !user.branches?.length) return all
  const allowed = new Set(user.branches.map((b) => b.toString()))
  return all.filter((b) => allowed.has(b._id.toString()))
}

// The login screen needs the branch list before anyone has signed in.
router.get('/branches', async (_req, res) => {
  const branches = await Branch.find({ active: true }).sort({ code: 1 })
  res.json({ branches: branches.map((b) => b.toSafe()) })
})

// First-run: no users yet → the UI shows "create the owner account".
router.get('/needs-setup', async (_req, res) => {
  const count = await User.estimatedDocumentCount()
  res.json({ needsSetup: count === 0 })
})

router.post('/bootstrap', loginLimiter, async (req, res) => {
  const count = await User.estimatedDocumentCount()
  if (count > 0) return res.status(409).json({ error: 'Setup is already done.' })

  const { username, name, password } = req.body || {}
  if (!username || !name || !password || password.length < 5) {
    return res.status(400).json({ error: 'Name, username and a password of at least 5 characters are required.' })
  }
  const user = await User.create({
    username,
    name,
    role: 'admin',
    branches: [], // admin → every branch
    passwordHash: await User.hashPassword(password),
  })
  res.status(201).json({ ok: true, user: user.toSafe() })
})

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, branch } = req.body || {}
  if (!username || !password || !branch) {
    return res.status(400).json({ error: 'Username, password and branch are all required.' })
  }

  const user = await User.findOne({ username: String(username).toLowerCase().trim() })
  if (!user || !user.active || !(await user.checkPassword(password))) {
    return res.status(401).json({ error: 'Wrong username or password.' })
  }

  const branchDoc = await Branch.findOne({ _id: branch, active: true }).catch(() => null)
  if (!branchDoc) return res.status(400).json({ error: 'Unknown branch.' })
  if (!user.canAccessBranch(branchDoc._id)) {
    return res.status(403).json({ error: 'You do not have access to that branch.' })
  }

  user.lastLoginAt = new Date()
  await user.save()
  issueToken(res, user, branchDoc._id)
  res.json({ user: user.toSafe(), branch: branchDoc.toSafe() })
})

router.get('/me', requireAuth, async (req, res) => {
  const branch = await Branch.findById(req.branchId)
  const branches = await branchesForUser(req.user)
  res.json({
    user: req.user.toSafe(),
    branch: branch ? branch.toSafe() : null,
    branches: branches.map((b) => b.toSafe()),
  })
})

// Switch to another branch without signing out.
router.post('/switch-branch', requireAuth, async (req, res) => {
  const { branch } = req.body || {}
  const branchDoc = await Branch.findOne({ _id: branch, active: true }).catch(() => null)
  if (!branchDoc) return res.status(400).json({ error: 'Unknown branch.' })
  if (!req.user.canAccessBranch(branchDoc._id)) {
    return res.status(403).json({ error: 'You do not have access to that branch.' })
  }
  issueToken(res, req.user, branchDoc._id)
  res.json({ branch: branchDoc.toSafe() })
})

router.post('/logout', (_req, res) => {
  clearToken(res)
  res.json({ ok: true })
})

export default router
