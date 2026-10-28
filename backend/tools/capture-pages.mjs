// Saves the logged-in HTML of pages from the reference app, so a screen can be
// rebuilt against what it actually looked like rather than from memory.
//
// The 2026-10-21 capture at D:\Github\FinanceProject\reference-pifi\pages holds
// 83 pages but misses these, which is why the Admin module stops short of them:
//   Day_End_Process.aspx   Form_NDH3.aspx
//   Balance_Sheet.aspx?rt=BS|PL|TB   General_Ledger.aspx   Day_Book_Report.aspx?t=RC
//
// Credentials are never stored here — they come from the environment at
// runtime, the same as every other tool in this folder.
//
// Usage (run in YOUR terminal):
//   # PowerShell
//   $env:REF_URL="http://HOST:PORT"; $env:REF_USER="200001"; $env:REF_PASS="<password>"
//   node tools/capture-pages.mjs                 # the pages the capture is missing
//   node tools/capture-pages.mjs Foo.aspx Bar.aspx?x=1    # or name your own
//
// A page is saved under the same name the old capture used: the path with its
// query string flattened, e.g. Balance_Sheet.aspx?rt=BS -> Balance_Sheet.aspx_rt_BS.html
import fs from 'node:fs'
import path from 'node:path'
import { BRANCHES, env, login } from './ref-client.mjs'

// Where the existing capture lives, so new pages land beside the old ones.
const OUT_DIR = process.env.REF_OUT || 'D:/Github/FinanceProject/reference-pifi/pages'

// What the 83-page capture is missing, in the order the Admin menu lists them.
const MISSING = [
  'General_Ledger.aspx',
  'Cash_Book_Reports.aspx?rn=CB',
  'Cash_Book_Reports.aspx?rn=SDB',
  'Day_Book_Report.aspx?t=RC',
  'Balance_Sheet.aspx?rt=BS',
  'Balance_Sheet.aspx?rt=PL',
  'Balance_Sheet.aspx?rt=TB',
  'Form_NDH3.aspx',
  'Day_End_Process.aspx',
]

const fileNameFor = (page) => `${page.replace(/[?=&]/g, '_')}.html`

async function main() {
  const { BASE, USER, PASS } = env()
  const pages = process.argv.slice(2).length ? process.argv.slice(2) : MISSING

  fs.mkdirSync(OUT_DIR, { recursive: true })
  // One branch is enough: these are the same pages whichever branch signs in.
  const branch = BRANCHES[0]
  console.log(`signing in to ${BASE} as ${USER} (branch ${branch.code})`)
  const jar = await login(BASE, USER, PASS, branch)
  console.log('signed in\n')

  let saved = 0
  for (const page of pages) {
    const url = `${BASE}/${page}`
    try {
      const res = await fetch(url, { headers: { Cookie: jar.header() }, redirect: 'manual' })
      const html = await res.text().catch(() => '')

      if (res.status === 302) {
        console.log(`  ${page.padEnd(32)} 302 -> ${res.headers.get('location') || '(somewhere)'}  NOT SAVED`)
        continue
      }
      if (!html.trim()) {
        console.log(`  ${page.padEnd(32)} ${res.status} empty  NOT SAVED`)
        continue
      }

      const out = path.join(OUT_DIR, fileNameFor(page))
      fs.writeFileSync(out, html)
      saved += 1

      // Say what came back, so a server error is obvious rather than silently
      // saved as if it were the page.
      const broken = /Server Error in|Parser Error|Object moved/.test(html.slice(0, 4000))
      const title = (/<title>([^<]*)<\/title>/i.exec(html) || [, ''])[1].trim()
      const fields = (html.match(/<input[^>]+name="ctl00/g) || []).length
      const grids = (html.match(/<th[^>]*>/g) || []).length
      console.log(
        `  ${page.padEnd(32)} ${res.status} ${String(html.length).padStart(7)} bytes  ` +
          `${fields} fields, ${grids} grid headers  ${broken ? 'THE PAGE ITSELF ERRORS' : title}`
      )
    } catch (e) {
      console.log(`  ${page.padEnd(32)} failed: ${e.message}`)
    }
  }

  console.log(`\n${saved} of ${pages.length} saved into ${OUT_DIR}`)
  if (saved) console.log('Nothing here goes into git — reference-pifi/ is ignored.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
