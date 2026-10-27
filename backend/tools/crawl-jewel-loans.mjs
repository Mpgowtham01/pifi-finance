// Pulls the jewel-loan register out of the reference app (JL_List.aspx) and,
// for each loan, its detail from account_detail.aspx.
//
// The target URL and credentials are NOT stored here — pass them at runtime so
// nothing sensitive lives in the repo. Writes ../src/data/jewelloans_<code>.json
// and ../src/data/jewelloans_<code>_full.json.
//
// Usage (run in YOUR terminal):
//   # PowerShell
//   $env:REF_URL='http://HOST:PORT'; $env:REF_USER='theuser'; $env:REF_PASS='thepassword'
//   node tools/crawl-jewel-loans.mjs             # PROBE: one page + one loan, printed
//   node tools/crawl-jewel-loans.mjs --list      # the register only, all branches
//   node tools/crawl-jewel-loans.mjs --all       # the register, then every loan's detail
//   node tools/crawl-jewel-loans.mjs --all 201   # just one branch
//   # then: npm run seed-loans
//
// Two stages. The register comes straight out of the JL_List grid and carries
// the account number, borrower, dates, amount and rate. The detail comes from
// account_detail.aspx — the little popup the "View Details" button opens,
// which takes the account number on the query string and holds the scheme,
// the pledged jewels, the weights, the closing balance and the ledger.
//
// The pledge form itself (JL_Master) cannot be opened from outside the app: it
// is driven from the session, its View link redirects to a blank form, and any
// query string makes it answer 500. account_detail is the way in.
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
// Pasted straight from a usage line, "<password>" reaches the server and
// ASP.NET answers 500 before the login page runs — which reads like a server
// fault and is not. Catch it here instead.
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

// The control prefix every field on these nested master pages carries.
const P = 'ctl00$ctl00$ContentPlaceHolder1$ChildContent1$'
const GRID = `${P}GridView1`
// How many account_detail pages to ask for at once. It is someone's live
// branch server; four at a time is brisk without leaning on it.
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

  // Not a redirect, so it did not sign in. Say why, from what came back.
  const text = await res.text().catch(() => '')
  if (/potentially dangerous Request/i.test(text)) {
    throw new Error(
      `login failed (${branch.code}): the server rejected a character in the username or password. ` +
        'ASP.NET refuses < and > outright — check REF_USER and REF_PASS are the real values.'
    )
  }
  const status = text.match(/id="[^"]*lbl_Status"[^>]*>([^<]{1,200})</i)
  if (status && status[1].trim()) {
    throw new Error(`login failed (${branch.code}): the site said "${decode(status[1]).trim()}"`)
  }
  const title = text.match(/<title>([^<]{1,160})<\/title>/i)
  throw new Error(
    `login failed (${branch.code}): HTTP ${res.status}${title ? ` — ${decode(title[1]).trim()}` : ''}`
  )
}

const stateOf = (html) => ({
  __VIEWSTATE: pick(html, '__VIEWSTATE'),
  __VIEWSTATEGENERATOR: pick(html, '__VIEWSTATEGENERATOR'),
  __EVENTVALIDATION: pick(html, '__EVENTVALIDATION'),
})

// Every field currently on the form, the way a browser would post it back.
// JL_List filters on its scheme radio and search dropdown, so leaving those
// out asks the server for page two of nothing.
function formFields(html) {
  const out = {}
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = m[1]
    const name = (attrs.match(/\bname="([^"]*)"/i) || [])[1]
    if (!name) continue
    const type = ((attrs.match(/\btype="?([a-zA-Z]+)"?/) || [])[1] || 'text').toLowerCase()
    // A submit button only travels when it is the thing clicked.
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

/* --------------------------------------------------------- the register */

// The grid renders each cell as a <span id="...GridView1_LabelXY_<row>">.
const cell = (html, label, row) => {
  const m = html.match(new RegExp(`id="[^"]*GridView1_${label}_${row}"[^>]*>(?:<b>)?([^<]*)`, 'i'))
  return m ? decode(m[1]).trim() : ''
}

// "21/10/2026" -> "2026-10-21"
const toIso = (dmy) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(dmy).trim())
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}
const toNum = (v) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? n : 0
}

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
      dueDate: toIso(cell(html, 'Label4d', i)),
      loanAmount: toNum(cell(html, 'Label3a', i)),
      periodMonths: toNum(cell(html, 'Label3b', i)),
      interestRate: toNum(cell(html, 'Label4b', i)),
      status: cell(html, 'Label4c', i) || 'A',
    })
  }
  return out
}

const recordCount = (html) => {
  const m = html.match(/(\d[\d,]*)\s+records found/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

// Walk the pager and collect every row. The pager only shows a window of page
// numbers, so the highest one on page one is not the last page — keep asking
// until the rows stop coming or the page's own count is reached.
async function register(jar, { quiet = false } = {}) {
  let res = await fetch(`${BASE}/JL_List.aspx`, { headers: { Cookie: jar.header() } })
  jar.store(res)
  let html = await res.text()
  const expected = recordCount(html)
  const rows = rowsOf(html)
  const seen = new Set(rows.map((r) => r.accNo))

  const HARD_CAP = 400
  for (let k = 2; k <= HARD_CAP; k++) {
    if (expected != null && seen.size >= expected) break
    const r = await postBack(jar, 'JL_List.aspx', html, GRID, `Page$${k}`)
    const page = rowsOf(r.html)
    if (page.length === 0) {
      if (!quiet) console.warn(`  page ${k} came back with no rows (${r.html.length} bytes) — stopping there`)
      break
    }
    // A pager that has run off the end re-serves the last page it has.
    if (page.every((row) => seen.has(row.accNo))) {
      if (!quiet) console.warn(`  page ${k} repeated rows already read — stopping there`)
      break
    }
    html = r.html
    for (const row of page) {
      seen.add(row.accNo)
      rows.push(row)
    }
    if (!quiet && k % 10 === 0) process.stdout.write(`    page ${k}, ${rows.length} rows\r`)
  }
  return { rows, expected }
}

/* -------------------------------------------------------- pledge detail */

// account_detail.aspx renders everything as <span id="...">value</span>.
const span = (html, id) => {
  const m = html.match(new RegExp(`id="[^"]*${id}"[^>]*>([\\s\\S]{0,400}?)</span>`, 'i'))
  return m ? decode(m[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : ''
}

// "Gross Wt. 30.600; Deduction 2.200; App. Value 164720.00"
function weightsOf(text) {
  const n = (label) => {
    const m = new RegExp(`${label}[^0-9-]*([0-9.,]+)`, 'i').exec(text || '')
    return m ? toNum(m[1]) : 0
  }
  const grossWeight = n('Gross\\s*Wt\\.?')
  const deduction = n('Deduction')
  return {
    grossWeight,
    deduction,
    netWeight: Math.round((grossWeight - deduction) * 1000) / 1000,
    appraisedValue: n('App\\.?\\s*Value'),
  }
}

// "RING - 2No. , , BRESLET - 1No. , , DOLLAR STONE NECKLASE - 1No. ,"
// Only the count is given per item; the weights are quoted for the pledge as
// a whole, so they stay on the loan rather than being split across jewels.
function collateralOf(text) {
  return String(text || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.*?)\s*-\s*([0-9]+)\s*No\.?$/i.exec(part)
      return m ? { description: m[1].trim(), items: Number(m[2]) || 1 } : { description: part, items: 1 }
    })
    .filter((j) => j.description && !/^no\.?$/i.test(j.description))
}

// The ledger under the details: Tran. Id | Tran. Date | Particulars | Credit | Debit
function ledgerOf(html) {
  const rows = []
  for (let i = 0; i < 400; i++) {
    const id = span(html, `Label1a_${i}`)
    if (!id) break
    rows.push({
      transId: id,
      date: toIso(span(html, `Label1b_${i}`)),
      particulars: span(html, `Label2a_${i}`),
      credit: toNum(span(html, `Label4a_${i}`)),
      debit: toNum(span(html, `Label4b_${i}`)),
    })
  }
  return rows
}

function detailOf(html) {
  // "10100130 / SELVAM J"
  const who = span(html, 'lbl_name')
  const slash = who.indexOf('/')
  return {
    schemeName: span(html, 'lbl_Scheme'),
    schemeCategory: span(html, 'Scheme_Category'),
    detailAccNo: span(html, 'account_no'),
    detailCustId: slash > 0 ? who.slice(0, slash).trim() : '',
    detailCustomerName: slash > 0 ? who.slice(slash + 1).trim() : who,
    address: span(html, 'lbl_address'),
    detailOpenDate: toIso(span(html, 'open_date')),
    detailDueDate: toIso(span(html, 'due_date')),
    intPaymentMode: span(html, 'int_payment'),
    ...weightsOf(span(html, 'jl_wt')),
    collateral: collateralOf(span(html, 'Collateral_Details')),
    closingBalance: toNum(span(html, 'closing_balance')),
    ledger: ledgerOf(html),
  }
}

async function fetchDetail(jar, accNo) {
  const res = await fetch(`${BASE}/account_detail.aspx?account_id=${encodeURIComponent(accNo)}`, {
    headers: { Cookie: jar.header() },
  })
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const d = detailOf(await res.text())
  // The popup takes the number off the query string, so a mismatch means the
  // page fell back to something else and the row must not be trusted.
  if (d.detailAccNo && d.detailAccNo !== accNo) throw new Error(`asked for ${accNo}, got ${d.detailAccNo}`)
  if (!d.detailAccNo) throw new Error('the detail page came back empty')
  return d
}

/* ------------------------------------------------------------- commands */

async function probe() {
  const branch = BRANCHES[0]
  console.log(`Probing branch ${branch.code} ...\n`)
  const jar = await login(branch)
  const { rows, expected } = await register(jar)
  console.log(`register: ${rows.length} rows read`)
  if (expected != null) {
    console.log(`the page itself says: ${expected} records found`)
    if (expected !== rows.length) console.log('  ^ these differ — check the pager before running --all')
  }
  console.log('\nfirst three rows:')
  for (const r of rows.slice(0, 3)) console.log('  ', JSON.stringify(r))

  console.log(`\ndetail for ${rows[0].accNo}:`)
  const d = await fetchDetail(jar, rows[0].accNo)
  for (const [k, v] of Object.entries(d)) {
    if (k === 'ledger' || k === 'collateral') continue
    if (v !== '' && v !== 0) console.log('  ', k.padEnd(20), '=', v)
  }
  console.log('   collateral          =', JSON.stringify(d.collateral))
  console.log(`   ledger              = ${d.ledger.length} rows`)
  for (const l of d.ledger.slice(0, 5)) console.log('      ', JSON.stringify(l))

  console.log('\nIf that looks right:  node tools/crawl-jewel-loans.mjs --all')
}

async function crawlBranch(branch, withDetail) {
  const jar = await login(branch)
  const { rows, expected } = await register(jar)
  fs.writeFileSync(path.join(dataDir, `jewelloans_${branch.code}.json`), JSON.stringify(rows, null, 2))
  console.log(
    `  branch ${branch.code}: ${rows.length} loans` +
      `${expected != null ? ` (page says ${expected})` : ''} -> jewelloans_${branch.code}.json`
  )
  if (!withDetail) return

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
      if (++done % 50 === 0) process.stdout.write(`    ${branch.code}: ${done}/${rows.length}\r`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  fs.writeFileSync(path.join(dataDir, `jewelloans_${branch.code}_full.json`), JSON.stringify(out, null, 2))
  const withLedger = out.filter((r) => r.ledger?.length).length
  const withJewels = out.filter((r) => r.collateral?.length).length
  console.log(
    `  branch ${branch.code}: ${rows.length - misses}/${rows.length} with detail, ` +
      `${withJewels} with jewels, ${withLedger} with a ledger -> jewelloans_${branch.code}_full.json`
  )
  if (misses) console.log(`    ${misses} could not be read — they still carry their register row.`)
}

const args = process.argv.slice(2)

try {
  if (args.includes('--all') || args.includes('--list')) {
    const withDetail = args.includes('--all')
    const only = args.find((a) => /^\d{3}$/.test(a))
    const todo = only ? BRANCHES.filter((b) => b.code === only) : BRANCHES
    if (!todo.length) throw new Error(`No branch ${only}. Known: ${BRANCHES.map((b) => b.code).join(', ')}`)
    for (const b of todo) await crawlBranch(b, withDetail)
    console.log('\nDone. Now run:  npm run seed-loans')
  } else {
    await probe()
  }
} catch (e) {
  // A stack trace helps nobody here; the operator needs the one line that says
  // what to change.
  if (e?.cause?.code === 'ECONNREFUSED' || e?.cause?.code === 'ENOTFOUND' || /fetch failed/i.test(e?.message || '')) {
    console.error(`\nCould not reach ${BASE} — check REF_URL, and that you are on a network that can see it.`)
  } else {
    console.error('\n' + (e?.message || e))
  }
  process.exit(1)
}
