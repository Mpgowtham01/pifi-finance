// Pulls the savings deposit book out of the reference app (SBCA_List.aspx)
// and, for each account, its detail and full ledger from account_detail.aspx.
//
// The target URL and credentials are NOT stored here — pass them at runtime so
// nothing sensitive lives in the repo. Writes ../src/data/savings_<code>.json
// and ../src/data/savings_<code>_full.json.
//
// Usage (run in YOUR terminal):
//   # PowerShell
//   $env:REF_URL='http://HOST:PORT'; $env:REF_USER='theuser'; $env:REF_PASS='thepassword'
//   node tools/crawl-savings.mjs             # PROBE: one page + one account, printed
//   node tools/crawl-savings.mjs --all       # the book, then every account's ledger
//   node tools/crawl-savings.mjs --all 201   # just one branch
//   # then: npm run seed-savings
//
// The ledger is the point of the detail pass: a savings account is nothing
// but its transactions, and without them there is no passbook and no way to
// work out interest. It comes from the account statement rather than from the
// account_detail popup, because that popup silently stops after seven rows.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { statement } from './ref-client.mjs'

const BASE = (process.env.REF_URL || '').replace(/\/$/, '')
const USER = process.env.REF_USER || ''
const PASS = process.env.REF_PASS || ''
if (!BASE || !USER || !PASS) {
  console.error('Set REF_URL, REF_USER and REF_PASS environment variables first. See the header of this file.')
  process.exit(1)
}
for (const [name, value] of [['REF_USER', USER], ['REF_PASS', PASS], ['REF_URL', BASE]]) {
  if (/^<.*>$/.test(value)) {
    console.error(`${name} is still the placeholder ${value} — put the real value in.`)
    process.exit(1)
  }
}

const BRANCHES = [
  { code: '201', ddl: 'Bala ganapathi' },
  { code: '202', ddl: 'Bala_ganapathi_Aruppukottai' },
  { code: '203', ddl: 'Bala_ganapathi_Kovilpatti' },
]
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

const P = 'ctl00$ctl00$ContentPlaceHolder1$ChildContent1$'
const GRID = `${P}GridView1`
const CONCURRENCY = 4

/* ------------------------------------------------------------- plumbing */

const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')

function makeJar() {
  const jar = {}
  return {
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
    store: (res) => {
      for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
        const [p] = c.split(';')
        const i = p.indexOf('=')
        jar[p.slice(0, i)] = p.slice(i + 1)
      }
    },
  }
}

const pick = (h, id) => {
  const m = h.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`))
  return m ? m[1] : ''
}

async function login(branch) {
  const jar = makeJar()
  let res = await fetch(`${BASE}/Login.aspx`)
  jar.store(res)
  const html = await res.text()
  res = await fetch(`${BASE}/Login.aspx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: new URLSearchParams({
      __VIEWSTATE: pick(html, '__VIEWSTATE'),
      __VIEWSTATEGENERATOR: pick(html, '__VIEWSTATEGENERATOR'),
      __EVENTVALIDATION: pick(html, '__EVENTVALIDATION'),
      antiforgery: pick(html, 'antiforgery'),
      ddl_Branch: branch.ddl,
      txt_Username: USER,
      txt_Password: PASS,
      btn_Login: 'Login',
    }),
    redirect: 'manual',
  })
  jar.store(res)
  if (res.status === 302) return jar
  const text = await res.text().catch(() => '')
  if (/potentially dangerous Request/i.test(text)) {
    throw new Error(`login failed (${branch.code}): the server rejected a character in the credentials.`)
  }
  const status = text.match(/id="[^"]*lbl_Status"[^>]*>([^<]{1,200})</i)
  if (status && status[1].trim()) {
    throw new Error(`login failed (${branch.code}): the site said "${decode(status[1]).trim()}"`)
  }
  throw new Error(`login failed (${branch.code}): HTTP ${res.status}`)
}

const stateOf = (html) => ({
  __VIEWSTATE: pick(html, '__VIEWSTATE'),
  __VIEWSTATEGENERATOR: pick(html, '__VIEWSTATEGENERATOR'),
  __EVENTVALIDATION: pick(html, '__EVENTVALIDATION'),
})

function formFields(html) {
  const out = {}
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = m[1]
    const name = (attrs.match(/\bname="([^"]*)"/i) || [])[1]
    if (!name) continue
    const type = ((attrs.match(/\btype="?([a-zA-Z]+)"?/) || [])[1] || 'text').toLowerCase()
    if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(attrs)) continue
    out[name] = decode((attrs.match(/\bvalue="([^"]*)"/i) || [])[1] ?? '')
  }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = (m[1].match(/\bname="([^"]*)"/i) || [])[1]
    if (!name) continue
    const chosen =
      m[2].match(/<option[^>]*\bselected\b[^>]*\bvalue="([^"]*)"/i) ||
      m[2].match(/<option[^>]*\bvalue="([^"]*)"/i)
    if (chosen) out[name] = decode(chosen[1])
  }
  return out
}

async function postBack(jar, page, html, target, argument = '') {
  const res = await fetch(`${BASE}/${page}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: new URLSearchParams({
      ...formFields(html),
      __EVENTTARGET: target,
      __EVENTARGUMENT: argument,
      ...stateOf(html),
    }),
    redirect: 'manual',
  })
  jar.store(res)
  return { html: res.status === 302 ? '' : await res.text(), status: res.status }
}

/* --------------------------------------------------------- the deposit book */

// This grid wraps its values in <b><font> …, so the cell is read by taking
// the whole span and stripping the tags out of it rather than by matching
// the text directly after the opening tag.
function spanText(html, id) {
  const start = html.indexOf(`${id}"`)
  if (start < 0) return ''
  const open = html.indexOf('>', start)
  const close = html.indexOf('</span>', open)
  if (open < 0 || close < 0) return ''
  return decode(html.slice(open + 1, close).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}
const cell = (html, label, row) => spanText(html, `GridView1_${label}_${row}`)

const toIso = (dmy) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(dmy).trim())
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}
const toNum = (v) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? n : 0
}

// SBCA_List columns: Account No | Customer Name | Customer Id | Open Date |
// Last Tran Dt | Status | Cl. Bal.
function rowsOf(html) {
  const out = []
  for (let i = 0; i < 50; i++) {
    const accNo = cell(html, 'Label1a', i)
    if (!accNo) break
    out.push({
      accNo,
      customerName: cell(html, 'Label1b', i),
      custId: cell(html, 'Label2a', i),
      openDate: toIso(cell(html, 'Label2b', i)),
      lastTranDate: toIso(cell(html, 'Label3a', i)),
      status: cell(html, 'Label3b', i) || 'A',
      balance: toNum(cell(html, 'Label4b', i)),
    })
  }
  return out
}

const recordCount = (html) => {
  const m = html.match(/(\d[\d,]*)\s+records found/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

async function register(jar) {
  let res = await fetch(`${BASE}/SBCA_List.aspx`, { headers: { Cookie: jar.header() } })
  jar.store(res)
  let html = await res.text()
  const expected = recordCount(html)
  const rows = rowsOf(html)
  const seen = new Set(rows.map((r) => r.accNo))

  for (let k = 2; k <= 400; k++) {
    if (expected != null && seen.size >= expected) break
    const r = await postBack(jar, 'SBCA_List.aspx', html, GRID, `Page$${k}`)
    const page = rowsOf(r.html)
    if (page.length === 0) {
      console.warn(`  page ${k} came back with no rows (${r.html.length} bytes) — stopping there`)
      break
    }
    if (page.every((row) => seen.has(row.accNo))) {
      console.warn(`  page ${k} repeated rows already read — stopping there`)
      break
    }
    html = r.html
    for (const row of page) {
      seen.add(row.accNo)
      rows.push(row)
    }
    if (k % 10 === 0) process.stdout.write(`    page ${k}, ${rows.length} rows\r`)
  }
  return { rows, expected }
}

/* ------------------------------------------------------ account detail */

function ledgerOf(html) {
  const rows = []
  for (let i = 0; i < 2000; i++) {
    const id = spanText(html, `Label1a_${i}`)
    if (!id) break
    rows.push({
      transId: id,
      date: toIso(spanText(html, `Label1b_${i}`)),
      particulars: spanText(html, `Label2a_${i}`),
      credit: toNum(spanText(html, `Label4a_${i}`)),
      debit: toNum(spanText(html, `Label4b_${i}`)),
    })
  }
  return rows
}

function detailOf(html) {
  const who = spanText(html, 'lbl_name')
  const slash = who.indexOf('/')
  return {
    schemeName: spanText(html, 'lbl_Scheme'),
    schemeCategory: spanText(html, 'Scheme_Category'),
    detailAccNo: spanText(html, 'account_no'),
    detailCustId: slash > 0 ? who.slice(0, slash).trim() : '',
    detailCustomerName: slash > 0 ? who.slice(slash + 1).trim() : who,
    address: spanText(html, 'lbl_address'),
    detailOpenDate: toIso(spanText(html, 'open_date')),
    intPaymentMode: spanText(html, 'int_payment'),
    detailBalance: toNum(spanText(html, 'deposit_loan')),
    closingBalance: toNum(spanText(html, 'closing_balance')),
    ledger: ledgerOf(html),
  }
}

async function fetchDetail(jar, accNo) {
  // The popup for the header fields — scheme, customer, opening date and the
  // system's own closing balance — and the statement for the ledger.
  const res = await fetch(`${BASE}/account_detail.aspx?account_id=${encodeURIComponent(accNo)}`, {
    headers: { Cookie: jar.header() },
  })
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const d = detailOf(await res.text())
  if (d.detailAccNo && d.detailAccNo !== accNo) throw new Error(`asked for ${accNo}, got ${d.detailAccNo}`)
  if (!d.detailAccNo) throw new Error('the detail page came back empty')
  d.ledger = await statement(BASE, jar, 'SD', accNo)
  return d
}

/* ------------------------------------------------------------- commands */

async function probe() {
  const branch = BRANCHES[0]
  console.log(`Probing branch ${branch.code} ...\n`)
  const jar = await login(branch)
  const { rows, expected } = await register(jar)
  console.log(`deposit book: ${rows.length} rows read`)
  if (expected != null) {
    console.log(`the page itself says: ${expected} records found`)
    if (expected !== rows.length) console.log('  ^ these differ — check the pager before running --all')
  }
  console.log('\nfirst three rows:')
  for (const r of rows.slice(0, 3)) console.log('  ', JSON.stringify(r))

  // Pick one with some history, so the ledger is worth looking at.
  const busiest = rows.find((r) => r.balance > 0) || rows[0]
  console.log(`\ndetail for ${busiest.accNo}:`)
  const d = await fetchDetail(jar, busiest.accNo)
  for (const [k, v] of Object.entries(d)) {
    if (k === 'ledger') continue
    if (v !== '' && v !== 0) console.log('  ', k.padEnd(20), '=', v)
  }
  console.log(`   ledger              = ${d.ledger.length} rows`)
  for (const l of d.ledger.slice(0, 6)) console.log('      ', JSON.stringify(l))
  const net = d.ledger.reduce((t, l) => t + l.credit - l.debit, 0)
  console.log(
    `   ledger nets to ${net.toFixed(2)}, their closing balance is ${d.closingBalance.toFixed(2)}` +
      `${Math.abs(net - d.closingBalance) <= 1 ? ' — agrees' : ' — DOES NOT AGREE'}`
  )
  console.log('\nIf that looks right:  node tools/crawl-savings.mjs --all')
}

async function crawlBranch(branch) {
  const jar = await login(branch)
  const { rows, expected } = await register(jar)
  fs.writeFileSync(path.join(dataDir, `savings_${branch.code}.json`), JSON.stringify(rows, null, 2))
  console.log(
    `  branch ${branch.code}: ${rows.length} accounts` +
      `${expected != null ? ` (page says ${expected})` : ''} -> savings_${branch.code}.json`
  )
  if (rows.length === 0) return

  const out = new Array(rows.length)
  const queue = rows.map((row, i) => ({ row, i }))
  let done = 0
  let misses = 0
  async function worker() {
    while (queue.length) {
      const { row, i } = queue.shift()
      try {
        out[i] = { ...row, ...(await fetchDetail(jar, row.accNo)) }
      } catch (e) {
        misses++
        out[i] = { ...row, detailFailed: e.message }
      }
      if (++done % 25 === 0) process.stdout.write(`    ${branch.code}: ${done}/${rows.length}\r`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  fs.writeFileSync(path.join(dataDir, `savings_${branch.code}_full.json`), JSON.stringify(out, null, 2))
  const txns = out.reduce((t, r) => t + (r.ledger?.length || 0), 0)
  console.log(
    `  branch ${branch.code}: ${rows.length - misses}/${rows.length} with detail, ` +
      `${txns} transactions -> savings_${branch.code}_full.json`
  )
  if (misses) console.log(`    ${misses} could not be read — they still carry their list row.`)
}

const args = process.argv.slice(2)

try {
  if (args.includes('--all')) {
    const only = args.find((a) => /^\d{3}$/.test(a))
    const todo = only ? BRANCHES.filter((b) => b.code === only) : BRANCHES
    if (!todo.length) throw new Error(`No branch ${only}. Known: ${BRANCHES.map((b) => b.code).join(', ')}`)
    for (const b of todo) await crawlBranch(b)
    console.log('\nDone. Now run:  npm run seed-savings')
  } else {
    await probe()
  }
} catch (e) {
  if (e?.cause?.code === 'ECONNREFUSED' || e?.cause?.code === 'ENOTFOUND' || /fetch failed/i.test(e?.message || '')) {
    console.error(`\nCould not reach ${BASE} — check REF_URL, and that you are on a network that can see it.`)
  } else {
    console.error('\n' + (e?.message || e))
  }
  process.exit(1)
}
