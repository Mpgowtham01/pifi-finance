// The Customer Enquiry screen and the "List of A/c's for Customer" report both
// show one flat table of every account a customer holds, exactly like the old
// Customer_Enquiry.aspx grid:
//   Acc. Type | Acc. No | Open Date | Due Date | Period | Cl. Balance
//
// Each product module registers itself here as it is built, so the enquiry and
// the report pick it up without either of them changing. Scheme categories match
// the old report filter: JL (jewel loan), SD (savings/deposits), OTH (everything
// else, incl. shares).
const sources = []

/**
 * @param {object} source
 * @param {string} source.accType     label shown in the "Acc. Type" column
 * @param {string} source.schemeType  'JL' | 'SD' | 'OTH'
 * @param {(ctx: {branchId: string, customer: object}) => Promise<Array>} source.load
 *        must resolve to rows of { accNo, scheme, openDate, dueDate, period, balance, status }
 * @param {string} [source.osType]  the old Outstanding Report's account-type code
 * @param {(ctx: {branchId: string, asOn: Date}) => Promise<Array>} [source.outstanding]
 *        every account of this product still carrying a balance on a date,
 *        as rows of { accNo, custId, customerName, scheme, openDate, balance }
 * @param {(ctx: {branchId: string}, accNo: string) => Promise<object|null>} [source.lookup]
 *        one account by its number, for `accountByNo` below; resolve to
 *        { accNo, custId, customerName, scheme, balance, status } or null
 */
export function registerAccountSource(source) {
  sources.push(source)
}

export function registeredAccountTypes() {
  return sources.map((s) => s.accType)
}

// Collect every account for one customer, newest first.
export async function accountsForCustomer(ctx, { schemeTypes, statuses } = {}) {
  const wanted = sources.filter((s) => !schemeTypes?.length || schemeTypes.includes(s.schemeType))
  const lists = await Promise.all(
    wanted.map(async (s) =>
      (await s.load(ctx)).map((row) => ({
        accType: s.accType,
        schemeType: s.schemeType,
        accNo: row.accNo ?? '',
        scheme: row.scheme ?? '', // the product/scheme name, printed by the reports
        openDate: row.openDate ?? null,
        dueDate: row.dueDate ?? null,
        period: row.period ?? '',
        balance: Number(row.balance) || 0,
        status: row.status || 'Active',
      }))
    )
  )
  let rows = lists.flat()
  if (statuses?.length) rows = rows.filter((r) => statuses.includes(r.status))
  return rows.sort((a, b) => new Date(b.openDate || 0) - new Date(a.openDate || 0))
}

// The Outstanding Report: what every product still has on its books as at a
// date. `accType` narrows it to one of the old dropdown's codes; left out, it
// is the "All" the Admin menu opens on.
export async function outstandingAsOn({ branchId, asOn, accType }) {
  const wanted = sources.filter((s) => s.outstanding && (!accType || s.osType === accType))
  const lists = await Promise.all(
    wanted.map(async (s) =>
      (await s.outstanding({ branchId, asOn })).map((row) => ({
        accType: s.accType,
        osType: s.osType || '',
        accNo: row.accNo ?? '',
        custId: row.custId ?? '',
        customerName: row.customerName ?? '',
        scheme: row.scheme ?? '',
        openDate: row.openDate ?? null,
        balance: Number(row.balance) || 0,
      }))
    )
  )
  return lists.flat().sort((a, b) => String(a.accNo).localeCompare(String(b.accNo)))
}

// Which account types any module can report on, for the screen's dropdown.
export function outstandingTypes() {
  return sources
    .filter((s) => s.outstanding)
    .map((s) => ({ code: s.osType || '', label: s.accType }))
}

// One account by its number, whichever product it belongs to. The Vouchers
// "+" panel takes a bare nine-digit account number and has to say whose it
// is, so each module hands over a `lookup` alongside its `load` and neither
// side has to know about the other.
export async function accountByNo(ctx, accNo) {
  const no = String(accNo || '').trim()
  if (!no) return null
  for (const s of sources) {
    if (!s.lookup) continue
    const row = await s.lookup(ctx, no)
    if (row) {
      return {
        accType: s.accType,
        schemeType: s.schemeType,
        accNo: row.accNo ?? no,
        custId: row.custId ?? '',
        customerName: row.customerName ?? '',
        scheme: row.scheme ?? '',
        balance: Number(row.balance) || 0,
        status: row.status || 'Active',
      }
    }
  }
  return null
}
