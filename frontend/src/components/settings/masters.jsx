import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import MasterScreen from './MasterScreen.jsx'

// The dropdown sources every settings screen shares (schedules, the chart of
// accounts, the schemes). Fetched once per screen and cached for the session.
let cache = null
export function useSettingsOptions() {
  const [options, setOptions] = useState(cache || {})
  useEffect(() => {
    if (cache) return
    api
      .get('/settings/options')
      .then((r) => {
        cache = r
        setOptions(r)
      })
      .catch(() => setOptions({}))
  }, [])
  return options
}

const YES_NO = [
  { value: 'A', label: 'Active' },
  { value: 'I', label: 'In-active' },
]

/* ------------------------------------------------------------------------ */

export function ScheduleMaster() {
  return (
    <MasterScreen
      title="Schedule Master"
      note="The accounting schedules every GL account is grouped under."
      endpoint="/settings/schedules"
      searchPlaceholder="Account code or name…"
      fields={[
        { name: 'code', label: 'Schedule Code', required: true, maxLength: 6, mono: true },
        { name: 'name', label: 'Schedule Name', required: true, wide: true },
      ]}
      columns={[
        { key: 'code', label: 'Account Code' },
        { key: 'name', label: 'Account Name' },
      ]}
    />
  )
}

export function GlMaster() {
  const options = useSettingsOptions()
  return (
    <MasterScreen
      title="GL Master"
      note="The chart of accounts."
      endpoint="/settings/gl-accounts"
      searchPlaceholder="GL code or name…"
      options={options}
      fields={[
        { name: 'code', label: 'GL Code', required: true, mono: true },
        { name: 'name', label: 'GL Name', required: true },
        { name: 'schedule', label: 'Schedule', type: 'select', options: 'schedules' },
        { name: 'category', label: 'Category', type: 'select', options: 'glCategories', required: true },
      ]}
      columns={[
        { key: 'code', label: 'GL Code' },
        { key: 'name', label: 'GL Name' },
        { key: 'schedule', label: 'Schedule' },
        { key: 'category', label: 'Category' },
      ]}
    />
  )
}

export function SchemeMaster() {
  const options = useSettingsOptions()
  return (
    <MasterScreen
      title="Scheme Master"
      note="The products the branch sells — share, deposits and loans."
      endpoint="/settings/schemes"
      searchPlaceholder="Scheme code or name…"
      options={options}
      fields={[
        { name: 'code', label: 'Scheme Code', required: true, mono: true },
        { name: 'name', label: 'Scheme Name', required: true },
        { name: 'category', label: 'Category', type: 'select', options: 'schemeCategories', required: true },
        { name: 'glCode', label: 'GL Account', type: 'select', options: 'glAccounts' },
        { name: 'interestGlCode', label: 'Interest GL', type: 'select', options: 'glAccounts' },
        { name: 'status', label: 'Status', type: 'select', options: YES_NO },
        { name: 'minAmount', label: 'Min. Amount', type: 'number' },
        { name: 'maxAmount', label: 'Max. Amount', type: 'number' },
      ]}
      columns={[
        { key: 'code', label: 'Scheme Code' },
        { key: 'name', label: 'Scheme Name' },
        { key: 'category', label: 'Category' },
        { key: 'glCode', label: 'GL' },
        { key: 'status', label: 'Status' },
      ]}
    />
  )
}

export function InterestSlabMaster() {
  const options = useSettingsOptions()
  return (
    <MasterScreen
      title="Interest Slab"
      note="A rate per scheme and period band, effective from a date. Old rows are kept as history."
      endpoint="/settings/interest-slabs"
      searchPlaceholder="Scheme code, name or period…"
      options={options}
      fields={[
        { name: 'schemeCode', label: 'Scheme Code', type: 'select', options: 'schemes', required: true },
        { name: 'period', label: 'Period', placeholder: '0-90 Days', required: true },
        { name: 'effectDate', label: 'Effect Date', type: 'date', required: true },
        { name: 'rate', label: 'Interest Rate', type: 'number' },
        { name: 'penalRate', label: 'Penal Rate', type: 'number' },
        { name: 'srCtznRate', label: 'Sr. Ctzn Rate', type: 'number' },
        { name: 'srCtznPenalRate', label: 'Sr. Ctzn Penal', type: 'number' },
      ]}
      columns={[
        { key: 'schemeCode', label: 'Scheme Code' },
        { key: 'schemeName', label: 'Scheme Name' },
        { key: 'period', label: 'Months' },
        { key: 'effectDate', label: 'Effect Date', fmt: 'date' },
        { key: 'rate', label: 'Interest Rate', align: 'right', fmt: 'money' },
        { key: 'penalRate', label: 'Penal Rate', align: 'right', fmt: 'money' },
        { key: 'srCtznRate', label: 'Sr. Ctzn Rate', align: 'right', fmt: 'money' },
        { key: 'srCtznPenalRate', label: 'Sr. Ctzn. Penal', align: 'right', fmt: 'money' },
      ]}
    />
  )
}

export function JewelDescription() {
  return (
    <MasterScreen
      title="Jewel Description"
      note="The kinds of jewellery a pledge can be made up of."
      endpoint="/settings/lookups/jewel"
      searchable={false}
      fields={[{ name: 'name', label: 'Jewel Desc', required: true, wide: true }]}
      columns={[{ key: 'name', label: 'Jewel Description' }]}
    />
  )
}

export function IdProofMaster() {
  return (
    <MasterScreen
      title="Id Proof Master"
      note="The proofs a customer record may cite."
      endpoint="/settings/lookups/idProof"
      searchable={false}
      fields={[{ name: 'name', label: 'Id Proof Description', required: true, wide: true }]}
      columns={[{ key: 'name', label: 'Id Proof' }]}
    />
  )
}

export function BankMaster() {
  return (
    <MasterScreen
      title="Bank Master"
      note="The banks money can be sent to by NEFT."
      endpoint="/settings/lookups/bank"
      searchable={false}
      fields={[{ name: 'name', label: 'Bank Name', required: true, wide: true }]}
      columns={[{ key: 'name', label: 'Bank Name' }]}
    />
  )
}

export function MarketRate() {
  return (
    <MasterScreen
      title="JL Market Rate"
      note="The gold rate jewel loans are valued against."
      endpoint="/settings/gold-rates"
      searchable={false}
      fields={[
        { name: 'effectDate', label: 'Effect Date', type: 'date', required: true },
        { name: 'marketRate', label: 'Gold Market Rate', type: 'number', required: true },
        { name: 'ratePerGram', label: 'Rate Per Gram', type: 'number' },
      ]}
      columns={[
        { key: 'effectDate', label: 'Date', fmt: 'date' },
        { key: 'marketRate', label: 'Gold MKT Rate', align: 'right', fmt: 'money' },
        { key: 'ratePerGram', label: 'Rate Per Gram', align: 'right', fmt: 'money' },
        { key: 'createdBy', label: 'Created by' },
      ]}
    />
  )
}

export function DepositPeriodMaster() {
  const options = useSettingsOptions()
  return (
    <MasterScreen
      title="Deposit Period Master"
      note="The terms each deposit scheme may be opened for."
      endpoint="/settings/deposit-periods"
      searchPlaceholder="Scheme or period…"
      options={options}
      fields={[
        { name: 'schemeCode', label: 'Scheme Code', type: 'select', options: 'schemes', required: true },
        { name: 'period', label: 'Period', placeholder: '12 Months', required: true },
        { name: 'periodCode', label: 'Period Code', placeholder: '12M' },
        { name: 'unit', label: 'Unit', type: 'select', options: ['Months', 'Days'] },
        { name: 'status', label: 'Status', type: 'select', options: YES_NO },
      ]}
      columns={[
        { key: 'schemeName', label: 'Scheme' },
        { key: 'schemeCode', label: 'Scheme Code' },
        { key: 'period', label: 'Period' },
        { key: 'periodCode', label: 'Code' },
        { key: 'status', label: 'Status' },
      ]}
    />
  )
}

export function ReportSettings() {
  const options = useSettingsOptions()
  return (
    <MasterScreen
      title="Report Settings"
      note="Which GL accounts roll up into which group of a management report."
      endpoint="/settings/report-settings"
      searchPlaceholder="Group, GL code or name…"
      options={options}
      fields={[
        { name: 'reportCode', label: 'Report', type: 'select', options: [
          { value: '101', label: '101-Deposit vs Loan Details' },
          { value: '102', label: '102-Funds Position' },
        ] },
        { name: 'groupName', label: 'Group Name', required: true, placeholder: '1.Fixed Deposit' },
        { name: 'glCode', label: 'GL Account', type: 'select', options: 'glAccounts', required: true },
      ]}
      columns={[
        { key: 'groupName', label: 'Group Name' },
        { key: 'glCode', label: 'GL Code' },
        { key: 'glName', label: 'GL Name' },
      ]}
    />
  )
}
