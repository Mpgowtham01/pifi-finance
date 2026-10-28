import GlAccount from '../models/GlAccount.js'
import Scheme from '../models/Scheme.js'
import { at, round2 } from './loanMath.js'

// The day book. Every Admin report in the old app — View Transactions, Cash
// Book, Sub Day Book, Receipts & Payments, the General Ledger, the Trial
// Balance — reads one stream: every movement of money in the branch, each
// with the ledger heads it touched.
//
// That stream is WORKED OUT, not stored. The books we took over from the old
// system came across as loans, receipts and account transactions; they were
// never posted through this app, so there is no postings table to read and
// never will be for that history. Each product module instead says how to
// read its own documents as entries, the same arrangement as
// `lib/accounts.js`, so neither side has to know about the other.

const sources = []

/**
 * @param {object} source
 * @param {string} source.source  what the entry is called in the day book
 * @param {(ctx: LedgerCtx) => Promise<Entry[]>} source.load
 *
 * An Entry is one transaction:
 *   { transId, date, particulars, amount, accNo, custId, customerName,
 *     kind, refId, status, postings: Posting[] }
 * A Posting is one side of it:
 *   { glCode, dr, cr, label }  — or, where the head is not configured yet,
 *   { pending: '<charge kind>', dr, cr, label }
 */
export function registerPostingSource(source) {
  sources.push(source)
}

export function registeredSources() {
  return sources.map((s) => s.source)
}

/* ------------------------------------------------------------ posting helpers */

export const dr = (glCode, amount, label = '') => ({ glCode: String(glCode || ''), dr: round2(amount), cr: 0, label })
export const cr = (glCode, amount, label = '') => ({ glCode: String(glCode || ''), dr: 0, cr: round2(amount), label })

// A leg whose ledger head nobody has told us yet. It is carried through the
// reports under its own name rather than quietly dropped, because a trial
// balance that hides what it could not place is worse than one that says so.
export const pendingDr = (kind, amount, label = '') => ({ pending: kind, glCode: '', dr: round2(amount), cr: 0, label })
export const pendingCr = (kind, amount, label = '') => ({ pending: kind, glCode: '', dr: 0, cr: round2(amount), label })

// The charge kinds that have nowhere to post to yet. Each one names the screen
// that would fix it, which is what the reports tell the user.
export const PENDING_KINDS = {
  'jl.interest': { label: 'Jewel loan interest', fix: 'Scheme Master — Interest GL Code' },
  'jl.penal': { label: 'Jewel loan penal interest', fix: 'Scheme Master — Interest GL Code' },
  'jl.insurance': { label: 'Jewel loan insurance', fix: 'Scheme Master — Interest GL Code' },
  'jl.notice': { label: 'Notice charges', fix: 'Scheme Master — Interest GL Code' },
  'jl.rebate': { label: 'Interest waived', fix: 'Scheme Master — Interest GL Code' },
  'jl.deductions': { label: 'Deductions held back at disbursal', fix: 'Scheme Master — Interest GL Code' },
  'sb.interest': { label: 'Savings interest paid', fix: 'Scheme Master — Interest GL Code' },
  'fd.interest': { label: 'Deposit interest paid', fix: 'Scheme Master — Interest GL Code' },
  'fd.tds': { label: 'TDS withheld', fix: 'General Settings — TDS' },
  'share.entrance': { label: 'Entrance fees', fix: 'Scheme Master — Interest GL Code' },
  'mop.unknown': { label: 'Mode of payment not recorded', fix: 'carried over from the old system' },
  // A product whose scheme is not in the Scheme Master, or is there without a
  // GL code. Its own ledger head is unknown, which is different from a charge
  // having nowhere to go.
  'gl.missing': { label: 'Scheme has no GL head', fix: 'Scheme Master — GL Code' },
}

/* ------------------------------------------------------------------ the chart */

// The chart of accounts and the product schemes, read once per report.
async function readChart() {
  const [heads, schemes] = await Promise.all([GlAccount.find({}), Scheme.find({})])
  const byCode = new Map(heads.map((h) => [h.code, h]))
  const bySchemeCode = new Map(schemes.map((s) => [s.code, s]))
  const cash = heads.find((h) => h.active && /cash on hand/i.test(h.name))
  return {
    heads,
    glName: (code) => byCode.get(String(code || ''))?.name || '',
    glCategory: (code) => byCode.get(String(code || ''))?.category || '',
    // A product's own ledger head, from the scheme it was opened under.
    schemeGl: (code) => bySchemeCode.get(String(code || ''))?.glCode || '',
    // Where its interest goes. Nothing in the books we took over filled this
    // in, so it is usually blank and the leg comes back as pending.
    schemeInterestGl: (code) => bySchemeCode.get(String(code || ''))?.interestGlCode || '',
    cashCode: cash?.code || '',
    cashName: cash?.name || 'Cash on Hand',
    isCashOrBank: (code) => {
      const h = byCode.get(String(code || ''))
      return !!h && (h.isBankAccount || h.code === cash?.code)
    },
  }
}

/* ------------------------------------------------------------------- the read */

// Every entry in the window, oldest first. `only` narrows it to named sources.
export async function entriesBetween({ branchId, from, to, only } = {}) {
  const chart = await readChart()
  const ctx = { branchId, from: from ? at(from) : null, to: to ? at(to) : null, chart }
  const wanted = sources.filter((s) => !only?.length || only.includes(s.source))
  const lists = await Promise.all(
    wanted.map(async (s) => (await s.load(ctx)).map((e) => normalise(e, s.source, chart)))
  )
  return { chart, entries: lists.flat().sort(oldestFirst) }
}

const oldestFirst = (a, b) =>
  new Date(a.date) - new Date(b.date) || String(a.transId).localeCompare(String(b.transId), undefined, { numeric: true })

function normalise(entry, source, chart) {
  const postings = (entry.postings || [])
    .filter((p) => round2(p.dr) !== 0 || round2(p.cr) !== 0)
    .map((p) => {
      // A head that resolved to nothing is named, not dropped: every rollup
      // here skips what carries neither a head nor a reason.
      const pending = p.pending || (p.glCode ? '' : 'gl.missing')
      return {
      glCode: p.glCode || '',
      glName: p.glCode ? chart.glName(p.glCode) || p.glCode : PENDING_KINDS[pending]?.label || 'Unallocated',
      pending,
      dr: round2(p.dr),
      cr: round2(p.cr),
      label: p.label || '',
      }
    })
  const totalDr = round2(postings.reduce((t, p) => t + p.dr, 0))
  const totalCr = round2(postings.reduce((t, p) => t + p.cr, 0))
  return {
    source,
    transId: entry.transId || '',
    date: entry.date,
    particulars: entry.particulars || '',
    amount: round2(entry.amount),
    accNo: entry.accNo || '',
    custId: entry.custId || '',
    customerName: entry.customerName || '',
    kind: entry.kind || '',
    refId: entry.refId || '',
    status: entry.status || 'A',
    createdBy: entry.createdBy || '',
    postings,
    totalDr,
    totalCr,
    // An entry whose two sides do not agree is a bug, not a rounding slip, so
    // the reports show it rather than silently absorbing the difference.
    balanced: totalDr === totalCr,
  }
}

/* ------------------------------------------------------------------ rollups */

// Every posting in the window, flattened, with its entry alongside it.
export function flatten(entries, { includeCancelled = false } = {}) {
  const rows = []
  for (const e of entries) {
    if (!includeCancelled && e.status !== 'A') continue
    for (const p of e.postings) {
      rows.push({
        date: e.date,
        transId: e.transId,
        source: e.source,
        particulars: e.particulars,
        accNo: e.accNo,
        customerName: e.customerName,
        glCode: p.glCode,
        glName: p.glName,
        pending: p.pending,
        dr: p.dr,
        cr: p.cr,
        label: p.label,
      })
    }
  }
  return rows
}

// Postings added up per ledger head. Pending legs are kept apart under their
// own kind so a report can name what it could not place.
export function byHead(postings) {
  const heads = new Map()
  for (const p of postings) {
    const key = p.glCode || `pending:${p.pending}`
    const row =
      heads.get(key) ||
      heads.set(key, {
        glCode: p.glCode,
        glName: p.glName,
        pending: p.pending,
        dr: 0,
        cr: 0,
        count: 0,
      }).get(key)
    row.dr = round2(row.dr + p.dr)
    row.cr = round2(row.cr + p.cr)
    row.count += 1
  }
  return [...heads.values()].sort(
    (a, b) => Number(!!a.pending) - Number(!!b.pending) || String(a.glCode).localeCompare(String(b.glCode))
  )
}

// How much of a window could not be placed, so every report can say so in one
// line instead of looking complete when it is not.
export function gapsIn(entries) {
  const kinds = new Map()
  let unbalanced = 0
  for (const e of entries) {
    if (e.status !== 'A') continue
    if (!e.balanced) unbalanced += 1
    for (const p of e.postings) {
      if (!p.pending) continue
      const row = kinds.get(p.pending) || kinds.set(p.pending, { kind: p.pending, amount: 0, count: 0 }).get(p.pending)
      row.amount = round2(row.amount + p.dr + p.cr)
      row.count += 1
    }
  }
  return {
    unbalanced,
    pending: [...kinds.values()]
      .map((r) => ({ ...r, label: PENDING_KINDS[r.kind]?.label || r.kind, fix: PENDING_KINDS[r.kind]?.fix || '' }))
      .sort((a, b) => b.amount - a.amount),
  }
}
