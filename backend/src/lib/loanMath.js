// What a gold loan owes on a given day.
//
// The old JL_Receipt.aspx filled seven read-only boxes — principal due,
// interest due, penal interest due, insurance dues, notice dues, pending
// dues, interest up to — and then let the clerk split the money received
// across them. The sums behind those boxes are here, in one place, so the
// receipt screen, the overdue report and the closure quote all answer the
// same way.
//
// Conventions, matching the way these loans are actually charged in the trade:
//   * interest runs on the principal still outstanding, at the yearly rate,
//     counted in 30-day months from the date interest was last received;
//   * penal interest only starts after the due date, on the same principal,
//     counted in days at the yearly penal rate;
//   * insurance is a flat monthly charge, counted in completed months;
//   * a payment is appropriated notice → insurance → penal → interest →
//     principal, so the charges that do not themselves earn interest are
//     cleared first and the loan keeps shrinking.

const DAY = 86400000

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// A date-only value, pinned to midnight UTC. These dates come in as
// "2026-04-10" and are compared against each other, never against a clock, so
// they must not drift with the server's zone.
export const at = (d) => {
  const x = new Date(d)
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()))
}

export function daysBetween(from, to) {
  if (!from || !to) return 0
  return Math.max(0, Math.round((at(to) - at(from)) / DAY))
}

// Months as this trade counts them: whole 30-day months plus the part month.
export function monthsBetween(from, to) {
  return daysBetween(from, to) / 30
}

// Completed months only — what insurance and notice charges are counted in.
export function wholeMonthsBetween(from, to) {
  return Math.floor(monthsBetween(from, to))
}

/**
 * Everything owed on `asOn`, before anything is paid.
 * @param {object} loan  a JewelLoan document (or anything with the same fields)
 * @param {Date|string} asOn
 */
export function duesFor(loan, asOn) {
  const on = at(asOn || new Date())
  const principal = round2(loan.principalBalance ?? loan.loanAmount)
  const intFrom = loan.intRecdUpto || loan.openDate
  const insFrom = loan.insuranceRecdUpto || loan.openDate

  const interestMonths = monthsBetween(intFrom, on)
  const interest = round2((principal * (loan.interestRate || 0) * interestMonths) / 1200)

  // Penal only bites after the due date, and only for the stretch of that
  // period the customer has not already settled interest for.
  const penalFrom = new Date(Math.max(at(loan.dueDate).getTime(), at(intFrom).getTime()))
  const penalDays = on > at(loan.dueDate) ? daysBetween(penalFrom, on) : 0
  const penal = round2((principal * (loan.penalRate || 0) * penalDays) / 36500)

  const insuranceMonths = wholeMonthsBetween(insFrom, on)
  const insurance = round2((loan.insurancePerMonth || 0) * insuranceMonths)

  const notice = round2((loan.noticeCharges || 0) - (loan.noticeRecd || 0))

  return {
    asOn: on,
    principalDue: principal,
    interestDue: interest,
    penalDue: penal,
    insuranceDue: insurance,
    noticeDue: Math.max(0, notice),
    interestMonths: round2(interestMonths),
    penalDays,
    insuranceMonths,
    intFrom,
    // "Pending dues" on the old screen: everything except the principal.
    pendingDues: round2(interest + penal + insurance + Math.max(0, notice)),
    // What it would take to clear the loan today.
    closingAmount: round2(principal + interest + penal + insurance + Math.max(0, notice)),
  }
}

/**
 * Split an amount across the dues, in the order the charges are cleared.
 * Returns the suggested allocation; the clerk may still override any box.
 */
export function appropriate(amount, dues, { rebate = 0 } = {}) {
  let left = round2(amount)
  const take = (due) => {
    const t = round2(Math.min(left, Math.max(0, due)))
    left = round2(left - t)
    return t
  }
  const notice = take(dues.noticeDue)
  const insurance = take(dues.insuranceDue)
  const penal = take(dues.penalDue)
  const interest = take(round2(dues.interestDue - rebate))
  const principal = take(dues.principalDue)
  return {
    notice,
    insurance,
    penal,
    interest,
    principal,
    // Anything still in hand after the principal is gone is an overpayment.
    excess: round2(left),
    closingBalance: round2(dues.principalDue - principal),
  }
}

// The date `months` on from `from`, clamped to the last day of a short month —
// a loan opened on the 31st falls due on the 30th, not on the 1st.
export function addMonths(from, months) {
  const d = at(from)
  const day = d.getUTCDate()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + Number(months || 0)
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)))
}

// Gold is quoted per sovereign (8 grams) and lent against per gram.
export const SOVEREIGN_GRAMS = 8
export function perGramFromSovereign(marketRate) {
  return round2((Number(marketRate) || 0) / SOVEREIGN_GRAMS)
}

// Purity as a fraction of 22 carat, which is what these rates are quoted on.
export function touchFactor(touch) {
  const ct = Number(String(touch || '22ct').replace(/[^0-9.]/g, '')) || 22
  return ct / 22
}
