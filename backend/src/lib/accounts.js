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
