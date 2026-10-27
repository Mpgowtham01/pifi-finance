import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// The "View" link on JL_List.aspx: the pledge, what it owes today, the jewels
// held against it and every receipt collected on it.
export default function JewelLoanView({ navigate, id, session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(null) // a receipt row
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/loans/jewel/${id}`))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function doCancel() {
    setBusy(true)
    try {
      await api.post(`/loans/receipts/${cancelling.id}/cancel`, { reason })
      setCancelling(null)
      setReason('')
      load()
    } catch (e) {
      setError(e.message)
      setCancelling(null)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <div className="notice error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>

  const { loan, receipts, dues, customer } = data
  const isAdmin = session?.user?.role === 'admin'

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>
              {loan.accNo} <span className={`badge ${loan.status === 'A' ? 'ok' : 'neutral'}`}>{loan.status}</span>
              {loan.repledged && <span className="badge warn" style={{ marginLeft: 6 }}>Re-pledged</span>}
            </h2>
            <p className="muted">
              {loan.customerName} · {loan.custId}
              {customer?.mobile ? ` · ${customer.mobile}` : ''}
            </p>
          </div>
          <div className="master-head-right">
            {loan.status === 'A' && (
              <button className="btn primary" onClick={() => navigate('jl-receipt', { accNo: loan.accNo })}>
                Collect
              </button>
            )}
            <button className="btn" onClick={() => window.print()}>
              Print
            </button>
            {isAdmin && receipts.filter((r) => r.status === 'A').length === 0 && (
              <button className="btn ghost" onClick={() => navigate('jl-edit', { id: loan.id })}>
                Edit
              </button>
            )}
            <button className="btn ghost" onClick={() => navigate('jl-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="stat-grid">
            <Stat label="Loan amount" value={fmtMoney(loan.loanAmount)} />
            <Stat label="Principal outstanding" value={fmtMoney(loan.principalBalance)} />
            <Stat label="Interest due" value={fmtMoney(dues.interestDue)} />
            <Stat label="Penal due" value={fmtMoney(dues.penalDue)} />
            <Stat label="To close today" value={fmtMoney(dues.closingAmount)} />
            <Stat label="Net weight" value={`${loan.netWeight} g`} />
          </div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="Scheme">{loan.schemeCode} {loan.schemeName && `— ${loan.schemeName}`}</Row>
            <Row label="Loan type">{loan.loanType === 'E' ? 'EMI' : 'Non-EMI'}</Row>
            <Row label="Open date">{fmtDate(loan.openDate)}</Row>
            <Row label="Due date">
              {fmtDate(loan.dueDate)}
              {loan.status === 'A' && new Date(loan.dueDate) < new Date() && (
                <span className="badge warn" style={{ marginLeft: 8 }}>Overdue</span>
              )}
            </Row>
            <Row label="Period">{loan.periodMonths} months</Row>
            <Row label="Interest / Penal">{loan.interestRate}% / {loan.penalRate}% a year</Row>
            <Row label="Interest paid up to">{fmtDate(loan.intRecdUpto)}</Row>
            <Row label="Disbursed">{fmtMoney(loan.disbAmt)} (deductions {fmtMoney(loan.deductions)})</Row>
            {loan.narration && <Row label="Narration" span={3}>{loan.narration}</Row>}
          </div>

          <Sep>Jewels held ({loan.noOfItems} items, {loan.netWeight} g net)</Sep>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Jewel</th>
                  <th style={{ width: 70 }}>Items</th>
                  <th style={{ width: 100 }}>Gross (g)</th>
                  <th style={{ width: 100 }}>Net (g)</th>
                  <th style={{ width: 90 }}>Touch</th>
                  <th style={{ width: 110 }} className="right-align">Rate / g</th>
                  <th style={{ width: 120 }} className="right-align">Value</th>
                </tr>
              </thead>
              <tbody>
                {loan.jewels.map((j, i) => (
                  <tr key={i}>
                    <td>{j.description}</td>
                    <td>{j.items}</td>
                    <td>{j.grossWeight}</td>
                    <td>{j.netWeight}</td>
                    <td>{j.touch}</td>
                    <td className="right-align">{fmtMoney(j.ratePerGram)}</td>
                    <td className="right-align">{fmtMoney(j.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Sep>Receipts</Sep>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Trans. Id</th>
                  <th style={{ width: 100 }}>Date</th>
                  <th className="right-align">Principal</th>
                  <th className="right-align">Interest</th>
                  <th className="right-align">Penal</th>
                  <th className="right-align">Other</th>
                  <th className="right-align">Amount</th>
                  <th className="right-align">Balance</th>
                  <th style={{ width: 90 }} className="right-align" />
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                      Nothing collected yet.
                    </td>
                  </tr>
                )}
                {receipts.map((r) => (
                  <tr key={r.id} style={r.status === 'cancelled' ? { opacity: 0.55 } : undefined}>
                    <td className="mono">{r.transId}</td>
                    <td>{fmtDate(r.transDate)}</td>
                    <td className="right-align">{fmtMoney(r.principal)}</td>
                    <td className="right-align">{fmtMoney(r.interest)}</td>
                    <td className="right-align">{fmtMoney(r.penal)}</td>
                    <td className="right-align">{fmtMoney(r.insurance + r.notice)}</td>
                    <td className="right-align">
                      <strong>{fmtMoney(r.amount)}</strong>
                      {r.imported && (
                        <span className="badge neutral" style={{ marginLeft: 6 }} title="Brought over from the old system">
                          Imported
                        </span>
                      )}
                      {r.status === 'cancelled' && (
                        <span className="badge off" style={{ marginLeft: 6 }}>Cancelled</span>
                      )}
                    </td>
                    <td className="right-align">{r.imported ? '—' : fmtMoney(r.closingBalance)}</td>
                    <td className="right-align">
                      {isAdmin && r.status === 'A' && !r.imported && (
                        <button className="btn tiny ghost" onClick={() => setCancelling(r)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {cancelling && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setCancelling(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">Cancel receipt {cancelling.transId}</div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                {fmtMoney(cancelling.amount)} on {fmtDate(cancelling.transDate)} goes back onto the loan. The row
                stays in the book with the reason against it.
              </p>
              <label className="lbl" htmlFor="cancel-reason">
                Reason
              </label>
              <input
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being reversed?"
                autoFocus
              />
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setCancelling(null)} disabled={busy}>
                Keep it
              </button>
              <button className="btn danger" onClick={doCancel} disabled={busy || reason.trim().length < 4}>
                {busy ? 'Cancelling…' : 'Cancel receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

function Row({ label, span = 1, children }) {
  return (
    <>
      <label className="lbl">{label}</label>
      <div className={`cell${span > 1 ? ` span-${span}` : ''}`}>{children}</div>
    </>
  )
}

function Sep({ children }) {
  return (
    <div className="frm-sep">
      <span>{children}</span>
    </div>
  )
}
