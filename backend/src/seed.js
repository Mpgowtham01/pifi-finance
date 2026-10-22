// One-off seed: creates the three branches and, if no users exist yet, an admin.
// Run with:  npm run seed            (from backend/, or `npm run seed` at root)
// Admin credentials can be overridden with env vars SEED_ADMIN_USER / SEED_ADMIN_PASS.
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import User from './models/User.js'
import mongoose from 'mongoose'

// Addresses are the ones the old system prints at the top of its reports.
// City and pincode are only filled where the source actually states them.
const BRANCHES = [
  {
    code: '201', name: 'Nagercoil',
    address: 'no- 5A ,PUTHAN BUNGLOW, KATTABOMMAN JUNCTION,MANIYADICHANKOVIL',
    city: 'NAGERCOIL', pincode: '629002',
  },
  {
    code: '202', name: 'Aruppukottai',
    address: '279/3,SIVAN KOVIL OPPOSITE,MADURAI ROAD, ARUPPUKOTTAI -626101',
    city: 'ARUPPUKOTTAI', pincode: '626101',
  },
  {
    code: '203', name: 'Kovilpatti',
    address: '135/32,First floor,S.p.complex,Opp kamarajar Statue,IDBI bank upstairs',
    city: '', pincode: '',
  },
]

async function run() {
  await connectDB()

  for (const b of BRANCHES) {
    // Upsert, so re-running the seed also refreshes the printed address.
    const res = await Branch.updateOne({ code: b.code }, { $set: b }, { upsert: true })
    console.log(`Branch ${b.code}-${b.name}: ${res.upsertedCount ? 'created' : 'updated'}.`)
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
