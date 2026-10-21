// One-off seed: creates the three branches and, if no users exist yet, an admin.
// Run with:  npm run seed            (from backend/, or `npm run seed` at root)
// Admin credentials can be overridden with env vars SEED_ADMIN_USER / SEED_ADMIN_PASS.
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import User from './models/User.js'
import mongoose from 'mongoose'

const BRANCHES = [
  { code: '201', name: 'Nagercoil' },
  { code: '202', name: 'Aruppukottai' },
  { code: '203', name: 'Kovilpatti' },
]

async function run() {
  await connectDB()

  for (const b of BRANCHES) {
    const existing = await Branch.findOne({ code: b.code })
    if (existing) {
      console.log(`Branch ${b.code}-${b.name} already exists.`)
    } else {
      await Branch.create(b)
      console.log(`Created branch ${b.code}-${b.name}.`)
    }
  }

  const userCount = await User.estimatedDocumentCount()
  if (userCount === 0) {
    const username = (process.env.SEED_ADMIN_USER || 'admin').toLowerCase()
    const password = process.env.SEED_ADMIN_PASS || 'admin123'
    await User.create({
      username,
      name: 'Administrator',
      role: 'admin',
      branches: [],
      passwordHash: await User.hashPassword(password),
    })
    console.log(`Created admin "${username}" with password "${password}" — change it after first login.`)
  } else {
    console.log(`${userCount} user(s) already exist — skipping admin creation.`)
  }

  await mongoose.disconnect()
  console.log('Seed done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
