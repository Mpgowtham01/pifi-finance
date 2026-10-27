import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'

// SB_Account_Statement.aspx rebuilt for a jewel loan. Type an account number,
// pick a period, and the ledger comes out: what was owed when the period
// opened, every receipt since, and the balance each one left behind.

const today = () => new Date().toISOString().slice(0, 10)
// Far enough back to cover any loan still on the books.
const START_OF_TIME = '2000-01-01'

export default function JlStatement({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [from, setFrom] = useState(START_OF_TIME)
  const [to, setTo] = useState(today())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [format, setFormat] = useState('PDF')
  const accRef = useRef(null)

  const load = useCallback(
    async (no) => {
      const v = String(no || '').trim()
      if (!v) return
      setBusy(true)
      setError('')
      try {
        const qs = new URLSearchParams({ from, to })
        setData(await api.get(`/loans/jewel/${encodeURIComponent(v)}/statement?${qs}`))
      } catch (e) {
        setData(null)
        setError(e.message)
      } finally {
        setBusy(false)
      }
    },
    [from, to]
  )

  useEffect(() => {
    if (initialAccNo) load(initialAccNo)
    else accRef.current?.focus()
    // Only on arrival; afterwards the Go button decides when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccNo])

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'Jewel Loan Account Statement',
        fileName: `JL_Statement_${data.loan.accNo}`,
        branch: data.branch,
        meta: [
          ['Account No', data.loan.accNo],
          ['Customer', `${data.loan.custId} / ${data.loan.customerName}`],
          ['Scheme', data.loan.schemeName || data.loan.schemeCode],
          ['Open Date', fmtDate(data.loan.openDate)],
          ['Due Date', fmtDate(data.loan.dueDate)],
          ['Period', `${fmtDate(data.from) || 'the beginning'} to ${fmtDate(data.to)}`],
          ['Opening Balance', fmtMoney(data.opening)],
          ['Closing Balance', fmtMoney(data.totals.closing)],
        ],
        columns: [
          { label: 'Trans. Id', value: (r) => r.transId },
          { label: 'Date', value: (r) => fmtDate(r.transDate) },
          { label: 'Particulars', value: (r) => r.particulars },
          { label: 'Principal', align: 'right', value: (r) => fmtMoney(r.principal) },
          { label: 'Interest', align: 'right', value: (r) => fmtMoney(r.interest) },
          { label: 'Amount', align: 'right', value: (r) => fmtMoney(r.amount) },
          { label: 'Balance', align: 'right', value: (r) => fmtMoney(r.balance) },
        ],
        rows: data.lines,
      })
    } catch (e) {
      setError(e.message)
    }
  }

  const loan = data?.loan

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Account Statement</h2>
            <p className="muted">
              {loan ? `${loan.accNo} · ${loan.customerName}` : 'One jewel loan, from the day it opened'}
            </p>
          </div>
          <div className="master-head-right">
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Export format">
              <option>PDF</option>
              <option>Excel</option>
              <option>Word</option>
            </select>
            <button className="btn" onClick={exportIt} disabled={!data}>
              Export
            </button>
            <button className="btn ghost" onClick={() => navigate('jl-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form
            className="frm"
            onSubmit={(e) => {
              e.preventDefault()
              load(accNo)
            }}
          >
            <Row label="Account No" req>
              <div className="input-with-btn">
                <input
                  ref={accRef}
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  placeholder="201600367"
                />
                <button type="submit" className="btn ghost" disabled={busy}>
                  {busy ? 'Loading…' : 'Go'}
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={loan ? `${loan.custId} / ${loan.customerName}` : ''} readOnly />
            </Row>
            <Row label="From Date">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Row>
            <Row label="To Date">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Loan amount" value={fmtMoney(loan.loanAmount)} />
                <Stat label="Opening balance" value={fmtMoney(data.opening)} />
                <Stat label="Received in period" value={fmtMoney(data.totals.amount)} />
                <Stat label="Closing balance" value={fmtMoney(data.totals.closing)} />
              </div>

              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Trans. Id</th>
                      <th style={{ width: 110 }}>Date</th>
                      <th>Particulars</th>
                      <th className="right-align">Principal</th>
                      <th className="right-align">Interest</th>
                      <th className="right-align">Other</th>
                      <th className="right-align">Amount</th>
                      <th className="right-align">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={7} className="muted">
                        Opening balance{data.from ? ` on ${fmtDate(data.from)}` : ''}
                      </td>
                      <td className="right-align">
                        <strong>{fmtMoney(data.opening)}</strong>
                      </td>
                    </tr>
                    {data.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="mono">{l.transId || '—'}</td>
                        <td>{fmtDate(l.transDate)}</td>
                        <td className="clamp">{l.particulars}</td>
                        <td className="right-align">{fmtMoney(l.principal)}</td>
                        <td className="right-align">{fmtMoney(l.interest)}</td>
                        <td className="right-align">{fmtMoney(l.other)}</td>
                        <td className="right-align">{fmtMoney(l.amount)}</td>
                        <td className="right-align">{fmtMoney(l.balance)}</td>
                      </tr>
                    ))}
                    {data.lines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing was collected in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <th className="right-align">{fmtMoney(data.totals.principal)}</th>
                      <th className="right-align">{fmtMoney(data.totals.interest)}</th>
                      <th />
                      <th className="right-align">{fmtMoney(data.totals.amount)}</th>
                      <th className="right-align">{fmtMoney(data.totals.closing)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                <button type="button" className="btn tiny ghost" onClick={() => navigate('jl-view', { id: loan.id })}>
                  Open the loan
                </button>
              </p>
            </>
          )}
        </div>
      </div>
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

function Row({ label, req, children }) {
  return (
    <>
      <label className="lbl">
        {label}
        {req && <span className="req"> *</span>}
      </label>
      <div className="cell">{children}</div>
    </>
  )
}
