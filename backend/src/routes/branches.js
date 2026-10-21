import { Router } from 'express'
import Branch from '../models/Branch.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (_req, res) => {
  const branches = await Branch.find().sort({ code: 1 })
  res.json({ branches: branches.map((b) => b.toSafe()) })
})

router.post('/', requireAdmin, async (req, res) => {
  const { code, name, companyName, address, phone } = req.body || {}
  if (!code || !name) return res.status(400).json({ error: 'Branch code and name are required.' })
  const branch = await Branch.create({ code, name, companyName, address, phone })
  res.status(201).json({ branch: branch.toSafe() })
})

router.patch('/:id', requireAdmin, async (req, res) => {
  const { name, companyName, address, phone, active } = req.body || {}
  const branch = await Branch.findByIdAndUpdate(
    req.params.id,
    { $set: { name, companyName, address, phone, active } },
    { new: true, runValidators: true }
  )
  if (!branch) return res.status(404).json({ error: 'No such branch.' })
  res.json({ branch: branch.toSafe() })
})

export default router
