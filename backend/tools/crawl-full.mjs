// Enriches each customer with the FULL field set from the reference app's
// Customer_Master page (father, mobile, DOB, gender, PAN, nominee, ...).
//
// The target URL and credentials are NOT stored here — pass them at runtime so
// nothing sensitive lives in the repo. Reads the id lists in
// ../src/data/customers_<code>.json and writes ../src/data/customers_<code>_full.json.
//
// Usage (run in YOUR terminal):
//   # PowerShell
//   $env:REF_URL="http://HOST:PORT"; $env:REF_USER="200001"; $env:REF_PASS="qwert"
//   node tools/crawl-full.mjs            # PROBE: fetch 1 customer, print the fields
//   node tools/crawl-full.mjs --all      # enrich every customer in every branch
//   # then: npm run seed-customers
//
// The three branch dropdown values map to the reference databases; adjust if needed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.REF_URL || '').replace(/\/$/, '')
const USER = process.env.REF_USER || ''
const PASS = process.env.REF_PASS || ''
if (!BASE || !USER || !PASS) {
  console.error('Set REF_URL, REF_USER and REF_PASS environment variables first. See the header of this file.')
  process.exit(1)
}

const BRANCHES = [
  { code: '201', ddl: 'Bala ganapathi' },
  { code: '202', ddl: 'Bala_ganapathi_Aruppukottai' },
  { code: '203', ddl: 'Bala_ganapathi_Kovilpatti' },
]
const CONCURRENCY = 4
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

function makeJar() {
  const jar = {}
  return {
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
    store: (res) => {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : []
      for (const c of raw) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1) }
    },
  }
}
const pick = (h, id) => { const m = h.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`)); return m ? m[1] : '' }

async function login(branch) {
  const jar = makeJar()
  let res = await fetch(`${BASE}/Login.aspx`); jar.store(res); let html = await res.text()
  const body = new URLSearchParams({
    __VIEWSTATE: pick(html, '__VIEWSTATE'), __VIEWSTATEGENERATOR: pick(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: pick(html, '__EVENTVALIDATION'), antiforgery: pick(html, 'antiforgery'),
    ddl_Branch: branch.ddl, txt_Username: USER, txt_Password: PASS, btn_Login: 'Login',
  })
  res = await fetch(`${BASE}/Login.aspx`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() }, body, redirect: 'manual' })
  jar.store(res)
  if (res.status !== 302) throw new Error(`login failed (${branch.code}): HTTP ${res.status}`)
  return jar
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
// Read a label span whose id ends with `suffix` (Customer_Enquiry renders data
// as <span id="...suffix">value</span>).
const span = (html, suffix) => {
  const m = html.match(new RegExp(`<span[^>]*id="[^"]*${suffix}"[^>]*>([^<]*)</span>`, 'i'))
  return m ? decode(m[1]).trim() : ''
}

// Extract from Customer_Enquiry.aspx. Keeps the basic list fields
// (address/city/pincode) passed in `basic`, which the enquiry page omits.
function extract(html, basic = {}) {
  const idType = span(html, 'Id_Type')
  const idNo = span(html, 'Proof_No')
  const idProofs = idType || idNo ? [{ type: idType, number: idNo }] : []
  return {
    name: span(html, 'Cust_Name') || basic.name || '',
    fatherOrGuardian: span(html, 'lbl_Father'),
    dob: span(html, 'lbl_DOB'),
    occupation: span(html, 'lbl_Occupation'),
    phone: span(html, 'lbl_Phone'),
    mobile: span(html, 'lbl_Mobile'),
    idProofs,
    address: basic.address || '',
    city: basic.city || '',
    pincode: basic.pincode || '',
  }
}

async function fetchCustomer(jar, basic) {
  const res = await fetch(`${BASE}/Customer_Enquiry.aspx?Cus_id=${basic.custId}`, { headers: { Cookie: jar.header() } })
  return extract(await res.text(), basic)
}

// Diagnostic: dump where the real data lives for one customer.
function dump(label, html) {
  console.log(`\n===== ${label}  (size ${html.length}) =====`)
  const vals = [...html.matchAll(/id="[^"]*_(txt_[A-Za-z0-9_]+)"[^>]*value="([^"]*)"/g)]
    .filter((m) => m[2].trim())
  console.log('-- non-empty inputs --')
  for (const m of vals.slice(0, 40)) console.log('  ', m[1].padEnd(24), '=', decode(m[2]).trim())
  const spans = [...html.matchAll(/<span[^>]*id="([^"]*(?:lbl|Label)[^"]*)"[^>]*>([^<]{1,60})<\/span>/gi)]
    .filter((m) => m[2].trim() && !/^&nbsp;$/.test(m[2]))
  console.log('-- label spans --')
  for (const m of spans.slice(0, 40)) console.log('  ', m[1].split('_').slice(-2).join('_').padEnd(24), '=', decode(m[2]).trim())
}

async function probe() {
  const jar = await login(BRANCHES[0])
  const ids = JSON.parse(fs.readFileSync(path.join(dataDir, 'customers_201.json'), 'utf8'))
  const basic = ids[0]
  console.log(`Probing branch 201, customer ${basic.custId} ...\n`)
  console.log(JSON.stringify({ custId: basic.custId, ...(await fetchCustomer(jar, basic)) }, null, 2))
  console.log('\nIf father/mobile/dob/occupation now have values, run:  node tools/crawl-full.mjs --all')
}

async function enrichBranch(branch) {
  const jar = await login(branch)
  const ids = JSON.parse(fs.readFileSync(path.join(dataDir, `customers_${branch.code}.json`), 'utf8'))
  const out = []
  const queue = [...ids]
  let done = 0
  async function worker() {
    while (queue.length) {
      const row = queue.shift()
      try { out.push({ custId: row.custId, ...(await fetchCustomer(jar, row)) }) }
      catch { out.push({ ...row }) }
      if (++done % 50 === 0) process.stdout.write(`  ${branch.code}: ${done}/${ids.length}\r`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  fs.writeFileSync(path.join(dataDir, `customers_${branch.code}_full.json`), JSON.stringify(out, null, 2))
  console.log(`  branch ${branch.code}: ${out.length} enriched -> customers_${branch.code}_full.json`)
}

if (process.argv.includes('--all')) {
  for (const b of BRANCHES) await enrichBranch(b)
  console.log('\nAll branches enriched. Now run:  npm run seed-customers')
} else {
  await probe()
}
