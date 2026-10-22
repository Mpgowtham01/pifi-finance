// Reports are built in the browser from one spec, in the three formats the old
// Customer_Reports.aspx offered. The page follows the layout of the Crystal
// reports it replaces: company name and branch address at the top, then the
// page number and date, then an optional "label : value" block about the
// subject, then the table.
//
//   PDF   -> a real PDF built with jsPDF, downloaded under the report name
//   Excel -> an .xls HTML workbook, which Excel opens with the layout intact
//   Word  -> a .doc HTML document

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const today = () =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

// "no- 5A ,PUTHAN BUNGLOW, ..., NAGERCOIL- 629002"
function branchLine(branch) {
  if (!branch) return ''
  const tail = [branch.city, branch.pincode].filter(Boolean).join('- ')
  return [branch.address, tail].filter(Boolean).join(', ')
}

function bodyHtml({ title, branch, meta, columns, rows, pageNo = 1 }) {
  const head = columns.map((c) => `<th align="${c.align || 'left'}">${esc(c.label)}</th>`).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td align="${c.align || 'left'}">${esc(c.value(r))}</td>`).join('')}</tr>`
    )
    .join('')

  const metaRows = (meta || [])
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `<tr><td class="mk">${esc(k)}</td><td class="mc">:</td><td>${esc(v)}</td></tr>`)
    .join('')

  return `
<div class="co">${esc(branch?.companyName || '')}</div>
<div class="addr">${esc(branchLine(branch))}</div>
${branch?.phone ? `<div class="addr">Phone: ${esc(branch.phone)}</div>` : ''}
<table class="bar"><tr><td>${pageNo}</td><td align="right">${esc(today())}</td></tr></table>
<div class="rt">${esc(title)}</div>
${metaRows ? `<table class="meta">${metaRows}</table>` : ''}
<table class="data">
  <thead><tr>${head}</tr></thead>
  <tbody>${body || `<tr><td colspan="${columns.length}">No records.</td></tr>`}</tbody>
</table>
<div class="foot">${rows.length} record${rows.length === 1 ? '' : 's'}</div>`
}

const DOC_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; margin: 22px; }
  .co { font-size: 15px; font-weight: bold; }
  .addr { font-size: 11px; }
  table.bar { width: 100%; font-size: 11px; margin: 6px 0 2px; border-top: 1px solid #000; }
  .rt { font-size: 13px; font-weight: bold; text-align: center; margin: 6px 0 10px; }
  table.meta { font-size: 12px; margin-bottom: 10px; border-collapse: collapse; }
  table.meta td { padding: 1px 4px 1px 0; vertical-align: top; }
  table.meta td.mk { width: 110px; }
  table.meta td.mc { width: 10px; }
  table.data { border-collapse: collapse; width: 100%; }
  table.data th, table.data td { border: 1px solid #999; padding: 3px 6px; }
  table.data th { background: #e9edf5; text-align: left; font-weight: bold; }
  .foot { font-size: 11px; margin-top: 8px; }
`

// Exported so the exact same document can be rendered outside the browser
// (handy for eyeballing a report's layout against the one it replaces).
export function renderReportHtml(spec) {
  const docTitle = spec.fileName || spec.title
  return `<html><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>${DOC_CSS}</style></head><body>${bodyHtml(spec)}</body></html>`
}
const wrap = renderReportHtml

function download(filename, html, mime) {
  const blob = new Blob(['﻿', html], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// A real PDF, laid out the way the Crystal report it replaces is. jsPDF is
// pulled in only when someone actually asks for a PDF, so it stays out of the
// first load.
export async function buildPdfDoc(spec) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const M = 36 // page margin
  const right = doc.internal.pageSize.getWidth() - M
  let y = M + 6

  doc.setFont('helvetica', 'bold').setFontSize(13)
  doc.text(spec.branch?.companyName || '', M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  const addr = branchLine(spec.branch)
  if (addr) {
    for (const line of doc.splitTextToSize(addr, right - M)) {
      y += 11
      doc.text(line, M, y)
    }
  }
  if (spec.branch?.phone) {
    y += 11
    doc.text(`Phone: ${spec.branch.phone}`, M, y)
  }

  y += 8
  doc.setDrawColor(0).setLineWidth(0.6).line(M, y, right, y)
  y += 11
  doc.setFontSize(8.5)
  doc.text(String(spec.pageNo || 1), M, y)
  doc.text(today(), right, y, { align: 'right' })

  y += 20
  doc.setFont('helvetica', 'bold').setFontSize(11)
  doc.text(spec.title, (M + right) / 2, y, { align: 'center' })

  const meta = (spec.meta || []).filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
  if (meta.length) {
    y += 16
    doc.setFont('helvetica', 'normal').setFontSize(9)
    for (const [k, v] of meta) {
      const lines = doc.splitTextToSize(String(v), right - M - 120)
      doc.text(`${k}`, M, y)
      doc.text(':', M + 100, y)
      doc.text(lines, M + 110, y)
      y += 12 * lines.length
    }
  }

  autoTable(doc, {
    startY: y + 10,
    margin: { left: M, right: M },
    head: [spec.columns.map((c) => c.label)],
    body: spec.rows.length
      ? spec.rows.map((r) => spec.columns.map((c) => String(c.value(r) ?? '')))
      : [[{ content: 'No records.', colSpan: spec.columns.length }]],
    styles: { fontSize: 8.5, cellPadding: 3, lineColor: [150, 150, 150], lineWidth: 0.4 },
    headStyles: { fillColor: [233, 237, 245], textColor: 0, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(
      spec.columns.map((c, i) => [i, { halign: c.align || 'left' }])
    ),
  })

  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text(
    `${spec.rows.length} record${spec.rows.length === 1 ? '' : 's'}`,
    M,
    doc.lastAutoTable.finalY + 14
  )
  return doc
}

async function makePdf(spec) {
  const doc = await buildPdfDoc(spec)
  doc.save(`${spec.fileName}.pdf`)
}

/**
 * @param {'PDF'|'Excel'|'Word'} format
 * @param {object} spec
 * @param {string} spec.title      printed heading, e.g. "Customer-wise Accounts"
 * @param {string} [spec.fileName] saved-file name without extension
 * @param {object} [spec.branch]   {companyName, address, city, pincode, phone}
 * @param {Array<[string, string]>} [spec.meta] "label : value" lines above the table
 * @param {Array<{label: string, value: Function, align?: string}>} spec.columns
 * @param {Array} spec.rows
 */
export async function emitReport(format, spec) {
  const name = spec.fileName || spec.title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const full = { ...spec, fileName: name }
  if (format === 'Excel') return download(`${name}.xls`, wrap(full), 'application/vnd.ms-excel')
  if (format === 'Word') return download(`${name}.doc`, wrap(full), 'application/msword')
  return makePdf(full)
}
