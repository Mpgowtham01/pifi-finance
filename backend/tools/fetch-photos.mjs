// Pulls each customer's photo and pledged-jewel photo out of the reference app
// and stores them on our own customer records, so the rebuilt Customer Master
// and Enquiry screens show the real images.
//
// The reference serves them as plain JPEG from two handlers:
//   Profile_Picture.aspx?Cus_Id=<id>     -> photo
//   Profile_Signature.aspx?Cus_Id=<id>   -> the pledged jewel; the old app calls
//                                          it a signature, but the branches
//                                          photograph the gold there
//
// The target URL and credentials are NOT stored here — pass them at runtime so
// nothing sensitive lives in the repo.
//
// Usage (run in YOUR terminal, from backend/):
//   # PowerShell
//   $env:REF_URL="http://HOST:PORT"; $env:REF_USER="<user>"; $env:REF_PASS="<password>"
//   node tools/fetch-photos.mjs 10100130          # these customer ids (branch 201)
//   node tools/fetch-photos.mjs --branch 202 --all
//   node tools/fetch-photos.mjs --branch 203 --all --refresh   # redo stored ones
//
// The originals are ~150 KB each; sharp re-encodes them to roughly 20-40 KB so
// the whole book of customers costs tens of megabytes rather than hundreds.
import sharp from 'sharp'
import mongoose from 'mongoose'
import { connectDB } from '../src/db.js'
import Branch from '../src/models/Branch.js'
import Customer from '../src/models/Customer.js'

const BASE = (process.env.REF_URL || '').replace(/\/$/, '')
const USER = process.env.REF_USER || ''
const PASS = process.env.REF_PASS || ''
if (!BASE || !USER || !PASS) {
  console.error('Set REF_URL, REF_USER and REF_PASS first. See the header of this file.')
  process.exit(1)
}

// The branch dropdown value the reference login needs, per branch code.
const BRANCH_DDL = {
  201: 'Bala ganapathi',
  202: 'Bala_ganapathi_Aruppukottai',
  203: 'Bala_ganapathi_Kovilpatti',
}
// What we accept from the reference, and what we keep after re-encoding.
const MAX_SOURCE_BYTES = 12 * 1024 * 1024
const MAX_STORED_BYTES = 600 * 1024
const PHOTO_SIDE = 560
const JEWEL_SIDE = 700
const JPEG_QUALITY = 78
const CONCURRENCY = 4

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const code = String(flag('branch', '201'))
const all = argv.includes('--all')
const refresh = argv.includes('--refresh')
const limit = Number(flag('limit', 0)) || 0
const ids = argv.filter((a) => /^\d{6,}$/.test(a))

function makeJar() {
  const jar = {}
  return {
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
    store: (res) => {
      for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
        const [pair] = c.split(';')
        const i = pair.indexOf('=')
        jar[pair.slice(0, i)] = pair.slice(i + 1)
      }
    },
  }
}
const pick = (h, id) => (h.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`)) || [])[1] || ''

async function login(ddl) {
  const jar = makeJar()
  let res = await fetch(`${BASE}/Login.aspx`)
  jar.store(res)
  const html = await res.text()
  res = await fetch(`${BASE}/Login.aspx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    redirect: 'manual',
    body: new URLSearchParams({
      __VIEWSTATE: pick(html, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: pick(html, '__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: pick(html, '__EVENTVALIDATION'),
      antiforgery: pick(html, 'antiforgery'),
      ddl_Branch: ddl,
      txt_Username: USER,
      txt_Password: PASS,
      btn_Login: 'Login',
    }),
  })
  jar.store(res)
  if (res.status !== 302) throw new Error(`login failed: HTTP ${res.status}`)
  return jar
}

// Returns {data, contentType, sourceBytes} when the handler really served an
// image. A missing image comes back as an HTML error page, so sniff the magic
// bytes before handing anything to sharp.
async function grab(jar, page, custId, maxSide) {
  const res = await fetch(`${BASE}/${page}?Cus_Id=${custId}`, { headers: { Cookie: jar.header() } })
  if (!res.ok) return null
  const source = Buffer.from(await res.arrayBuffer())
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) return null
  const head = source.subarray(0, 4).toString('hex')
  if (!head.startsWith('ffd8ff') && head !== '89504e47') return null

  // Re-encode: honour the EXIF orientation, scale the long edge down to
  // maxSide (never up), and store progressive JPEG.
  const data = await sharp(source)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
    .toBuffer()
  if (data.length === 0 || data.length > MAX_STORED_BYTES) return null
  return { data, contentType: 'image/jpeg', sourceBytes: source.length }
}

async function run() {
  const ddl = BRANCH_DDL[code]
  if (!ddl) throw new Error(`Unknown branch code ${code}. Known: ${Object.keys(BRANCH_DDL).join(', ')}`)

  await connectDB()
  const branch = await Branch.findOne({ code })
  if (!branch) throw new Error(`Branch ${code} is not seeded here — run "npm run seed" first.`)

  const find = { branch: branch._id }
  if (!all) {
    if (ids.length === 0) throw new Error('Give one or more customer ids, or pass --all.')
    find.custId = { $in: ids }
  }
  // A re-run only picks up what is still missing, unless told otherwise.
  if (!refresh) find.$or = [{ hasPhoto: { $ne: true } }, { hasJewelPhoto: { $ne: true } }]
  let query = Customer.find(find).select('_id custId name').sort({ custId: 1 })
  if (limit) query = query.limit(limit)
  const targets = await query

  if (targets.length === 0) {
    console.log(
      refresh
        ? 'Nothing to do — no matching customer in this branch.'
        : 'Nothing to do — every matching customer already has both images. Pass --refresh to redo them.'
    )
    await mongoose.disconnect()
    return
  }
  console.log(`Branch ${code}-${branch.name}: fetching images for ${targets.length} customer(s)…`)

  const jar = await login(ddl)
  const queue = [...targets]
  const started = Date.now()
  let photos = 0
  let jewelPhotos = 0
  let done = 0
  let sourceBytes = 0
  let storedBytes = 0

  async function worker() {
    while (queue.length) {
      const c = queue.shift()
      try {
        const [photo, jewelPhoto] = await Promise.all([
          grab(jar, 'Profile_Picture.aspx', c.custId, PHOTO_SIDE),
          grab(jar, 'Profile_Signature.aspx', c.custId, JEWEL_SIDE),
        ])
        const $set = {}
        for (const [field, img] of [['photo', photo], ['jewelPhoto', jewelPhoto]]) {
          if (!img) continue
          $set[field] = { data: img.data, contentType: img.contentType }
          $set[field === 'photo' ? 'hasPhoto' : 'hasJewelPhoto'] = true
          sourceBytes += img.sourceBytes
          storedBytes += img.data.length
          if (field === 'photo') photos++
          else jewelPhotos++
        }
        if (Object.keys($set).length) await Customer.updateOne({ _id: c._id }, { $set })
      } catch (err) {
        console.log(`  ${c.custId}: ${err.message}`)
      }
      if (++done % 25 === 0 || done === targets.length) {
        process.stdout.write(`  ${done}/${targets.length} · ${mb(storedBytes)} stored\r`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const secs = Math.round((Date.now() - started) / 1000)
  console.log(
    `\nBranch ${code}: ${photos} photo(s), ${jewelPhotos} jewel photo(s) in ${secs}s. ` +
      `${mb(sourceBytes)} downloaded, ${mb(storedBytes)} stored.`
  )
  await mongoose.disconnect()
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`

run().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
