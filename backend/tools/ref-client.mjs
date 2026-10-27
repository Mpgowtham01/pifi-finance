// Shared plumbing for talking to the reference app: signing in, posting its
// WebForms pages back properly, and pulling a full account statement.
//
// Why the statement rather than account_detail: that popup only ever renders
// seven ledger rows, with no pager and no sign that it has stopped. Anything
// busier comes back silently short. SB_Account_Statement.aspx takes an
// account number and a date range and gives the lot, with a running balance —
// fifty rows at a time, behind a pager that has to be walked.
//
// Credentials are never stored here — they come from the environment at
// runtime.

export const BRANCHES = [
  { code: '201', ddl: 'Bala ganapathi' },
  { code: '202', ddl: 'Bala_ganapathi_Aruppukottai' },
  { code: '203', ddl: 'Bala_ganapathi_Kovilpatti' },
]

export function env() {
  const BASE = (process.env.REF_URL || '').replace(/\/$/, '')
  const USER = process.env.REF_USER || ''
  const PASS = process.env.REF_PASS || ''
  if (!BASE || !USER || !PASS) {
    console.error('Set REF_URL, REF_USER and REF_PASS environment variables first.')
    process.exit(1)
  }
  for (const [name, value] of [['REF_USER', USER], ['REF_PASS', PASS], ['REF_URL', BASE]]) {
    if (/^<.*>$/.test(value)) {
      console.error(`${name} is still the placeholder ${value} — put the real value in.`)
      process.exit(1)
    }
  }
  return { BASE, USER, PASS }
}

export const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')

export const clean = (s) => decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

export const toIso = (dmy) => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(dmy).trim())
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

export const toNum = (v) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? n : 0
}

export function makeJar() {
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

export const pick = (h, id) => {
  const m = h.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`))
  return m ? m[1] : ''
}

export async function login(BASE, USER, PASS, branch) {
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

// Every field on a form, the way a browser posts it back.
export function formFields(html) {
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

// The control prefix a page's own fields carry. Most pages nest two master
// pages and come out as ctl00$ctl00$…$ChildContent1$, but the statement page
// nests only one and is ctl00$ContentPlaceHolder1$ — assuming either one is
// how a postback ends up changing nothing and reporting success.
export function prefixOf(html, sample = 'txt_Acc_No') {
  const hit = html.indexOf(`$${sample}"`)
  if (hit < 0) return 'ctl00$ctl00$ContentPlaceHolder1$ChildContent1$'
  const nameAt = html.lastIndexOf('name="', hit)
  if (nameAt < 0) return 'ctl00$ctl00$ContentPlaceHolder1$ChildContent1$'
  return html.slice(nameAt + 6, hit + 1)
}

const dd = (d) => String(d).padStart(2, '0')
const dmy = (d) => `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`

/**
 * One account's whole ledger from SB_Account_Statement.aspx.
 * @param {'SD'|'JL'|'SC'|'OTH'} accType which product the page is asked for
 * @returns {Promise<Array<{transId,date,particulars,credit,debit,balance}>>}
 */
export async function statement(BASE, jar, accType, accNo, { from = '01/01/2000', to = dmy(new Date()) } = {}) {
  const page_ = `SB_Account_Statement.aspx?AT=${accType}`
  let res = await fetch(`${BASE}/${page_}`, { headers: { Cookie: jar.header() } })
  jar.store(res)
  const blank = await res.text()
  const P = prefixOf(blank)

  res = await fetch(`${BASE}/${page_}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: new URLSearchParams({
      ...formFields(blank),
      [`${P}ddl_Acc_Type`]: accType,
      [`${P}txt_Acc_No`]: accNo,
      [`${P}txt_From_Date`]: from,
      [`${P}txt_To_Date`]: to,
      [`${P}btn_Go`]: 'Go',
    }),
    redirect: 'manual',
  })
  jar.store(res)
  if (res.status !== 200) throw new Error(`statement HTTP ${res.status}`)
  const html = await res.text()

  const out = []
  const seen = new Set()
  let page = html

  // Fifty rows a page, and the pager is the table's own last row.
  const HARD_CAP = 200
  for (let k = 2; k <= HARD_CAP; k++) {
    const rows = ledgerRows(page)
    let fresh = 0
    for (const r of rows) {
      // The same id can appear twice on one account, so a row is told apart
      // by everything on it.
      const key = `${r.transId}|${r.date}|${r.credit}|${r.debit}|${r.balance}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(r)
      fresh++
    }
    if (fresh === 0) break
    if (!page.includes(`Page$${k}`)) break

    const next = await fetch(`${BASE}/${page_}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
      body: new URLSearchParams({
        ...formFields(page),
        __EVENTTARGET: `${P}grd_Trans`,
        __EVENTARGUMENT: `Page$${k}`,
      }),
      redirect: 'manual',
    })
    jar.store(next)
    if (next.status !== 200) break
    page = await next.text()
  }

  // The pager scrambles nothing, but the pages arrive in order and a date
  // sort keeps the running balance meaningful.
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

// The transaction grid of a rendered statement page.
// Columns: Tran. Id | Tran. Date | Particulars | Credit | Debit | Cl. Bal
function ledgerRows(html) {
  const at = html.indexOf('grd_Trans')
  if (at < 0) return []
  const tableStart = html.lastIndexOf('<table', at)
  const tableEnd = html.indexOf('</table>', at)
  if (tableStart < 0 || tableEnd < 0) return []
  return [...html.slice(tableStart, tableEnd).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => clean(c[1])))
    .filter((cells) => cells.length >= 5 && toIso(cells[1]))
    .map((cells) => ({
      transId: cells[0],
      date: toIso(cells[1]),
      particulars: cells[2],
      credit: toNum(cells[3]),
      debit: toNum(cells[4]),
      balance: cells[5] !== undefined ? toNum(cells[5]) : null,
    }))
}
