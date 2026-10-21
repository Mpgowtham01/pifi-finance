// Seeds real customers (crawled from the reference app) into our MongoDB.
// Prefers the enriched file customers_<code>_full.json (full master fields);
// falls back to customers_<code>.json (id + name + address + city + pincode).
// Idempotent: upserts by (branch, custId), so running it twice is safe.
// Run:  npm run seed-customers      (needs branches seeded first: npm run seed)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import Branch from './models/Branch.js'
import Customer from './models/Customer.js'
import Counter from './models/Counter.js'

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const CODES = ['201', '202', '203']

// Reference app uses en-GB day/month/year, e.g. "21/10/2026".
function parseDate(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return isNaN(d) ? null : d
}

function toDoc(r) {
  const idProofs = Array.isArray(r.idProofs)
    ? r.idProofs
        .filter((p) => p && (p.type || p.number))
        .map((p) => ({ type: p.type || '', number: p.number || '', issueDate: parseDate(p.issueDate), issuePlace: p.issuePlace || '' }))
    : []
  const nomineeAge = r.nominee?.age ? Number(String(r.nominee.age).replace(/\D/g, '')) || undefined : undefined
  return {
    name: (r.name || '').trim(),
    fatherOrGuardian: (r.fatherOrGuardian || '').trim(),
    relation: (r.relation || '').trim(),
    gender: ['M', 'F', 'U'].includes(r.gender) ? r.gender : 'U',
    dob: parseDate(r.dob),
    maritalStatus: (r.maritalStatus || '').trim(),
    occupation: (r.occupation || '').trim(),
    customerType: (r.customerType || 'Individual').trim(),
    anniversaryDate: parseDate(r.anniversaryDate),
    address: (r.address || '').trim(),
    city: (r.city || '').trim(),
    pincode: (r.pincode || '').trim(),
    phone: (r.phone || '').trim(),
    mobile: (r.mobile || '').trim(),
    email: (r.email || '').trim(),
    permanentAddress: (r.permanentAddress || '').trim(),
    permanentCity: (r.permanentCity || '').trim(),
    permanentPincode: (r.permanentPincode || '').trim(),
    panNo: (r.panNo || '').trim().toUpperCase(),
    idProofs,
    nominee: {
      name: (r.nominee?.name || '').trim(),
      dob: parseDate(r.nominee?.dob),
      age: nomineeAge,
      relation: (r.nominee?.relation || '').trim(),
    },
    introducerId: (r.introducerId || '').trim(),
    introducerName: (r.introducerName || '').trim(),
    deductTds: !!r.deductTds,
    remarks: (r.remarks || '').trim(),
  }
}

async function run() {
  await connectDB()

  for (const code of CODES) {
    const branch = await Branch.findOne({ code })
    if (!branch) { console.log(`Branch ${code} not found — run "npm run seed" first. Skipping.`); continue }

    const fullPath = path.join(dataDir, `customers_${code}_full.json`)
    const basicPath = path.join(dataDir, `customers_${code}.json`)
    const file = fs.existsSync(fullPath) ? fullPath : basicPath
    if (!fs.existsSync(file)) { console.log(`No data file for branch ${code} — skipping.`); continue }

    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    const kind = file === fullPath ? 'full' : 'basic'

    const ops = rows
      .filter((r) => r.custId && r.name)
      .map((r) => ({
        updateOne: {
          filter: { branch: branch._id, custId: String(r.custId) },
          update: { $set: toDoc(r), $setOnInsert: { branch: branch._id, custId: String(r.custId), active: true } },
          upsert: true,
        },
      }))

    const res = await Customer.bulkWrite(ops, { ordered: false })
    const maxId = rows.reduce((m, r) => Math.max(m, Number(r.custId) || 0), 0)
    if (maxId > 0) {
      await Counter.findOneAndUpdate({ key: `${branch._id}:customer` }, { $max: { seq: maxId } }, { upsert: true })
    }
    console.log(`Branch ${code}-${branch.name} [${kind}]: ${rows.length} rows → ${res.upsertedCount || 0} new, ${res.modifiedCount || 0} updated. Counter at ${maxId}.`)
  }

  await mongoose.disconnect()
  console.log('Customer seed done.')
}

run().catch((err) => { console.error(err); process.exit(1) })
