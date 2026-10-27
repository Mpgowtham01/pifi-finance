import mongoose from 'mongoose'

// A pledge. The old JL_Master.aspx let the clerk add jewels one at a time into
// a grid and totalled them, so the items live here as a sub-document list
// rather than as one flattened weight.
const jewelSchema = new mongoose.Schema(
  {
    jewelId: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    items: { type: Number, default: 1 },
    grossWeight: { type: Number, default: 0 }, // grams
    deduction: { type: Number, default: 0 }, // stones, lac, thread
    netWeight: { type: Number, default: 0 },
    touch: { type: String, trim: true, default: '22ct' },
    ratePerGram: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
  },
  { _id: false }
)

export const LOAN_TYPES = ['NE', 'E'] // Non-EMI, EMI
export const LOAN_STATUS = ['A', 'C'] // Active, Closed
export const PURPOSES = [
  'Walk-in', 'Re-Loan', 'Renewal', 'Take Over',
  'Door Step Marketing', 'Personal Marketing', 'Referral',
]
export const TOUCHES = ['18ct', '19ct', '20ct', '21ct', '22ct']

const jewelLoanSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    accNo: { type: String, required: true, trim: true, index: true },
    oldAccNo: { type: String, trim: true, default: '' },
    transId: { type: String, trim: true, default: '' },
    transDate: Date,

    // Borrower. The name is copied in so a list of 350 loans is one query.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    custId: { type: String, required: true, trim: true, index: true },
    customerName: { type: String, trim: true, default: '' },

    schemeCode: { type: String, trim: true, default: '' },
    schemeName: { type: String, trim: true, default: '' },
    glCode: { type: String, trim: true, default: '' },
    loanType: { type: String, enum: LOAN_TYPES, default: 'NE' },
    purpose: { type: String, trim: true, default: 'Walk-in' },
    status: { type: String, enum: LOAN_STATUS, default: 'A', index: true },

    openDate: { type: Date, required: true },
    periodMonths: { type: Number, default: 6 },
    dueDate: { type: Date, required: true },

    // Valuation
    jewels: { type: [jewelSchema], default: [] },
    noOfItems: { type: Number, default: 0 },
    grossWeight: { type: Number, default: 0 },
    netWeight: { type: Number, default: 0 },
    jewelValue: { type: Number, default: 0 },
    marketRate: { type: Number, default: 0 }, // per sovereign, on the day
    ratePerGram: { type: Number, default: 0 }, // the lending rate used

    // Money
    loanAmount: { type: Number, required: true },
    interestRate: { type: Number, default: 0 }, // % per year
    penalRate: { type: Number, default: 0 }, // % per year, after the due date
    insurancePerMonth: { type: Number, default: 0 },
    appraiserFee: { type: Number, default: 0 },
    serviceTax: { type: Number, default: 0 },
    formsFee: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 }, // everything held back at disbursal
    disbAmt: { type: Number, default: 0 }, // what the customer walked out with
    loanPayable: { type: Number, default: 0 },

    lockerAccNo: { type: String, trim: true, default: '' },
    referredById: { type: String, trim: true, default: '' },
    referredByName: { type: String, trim: true, default: '' },
    nominee: {
      name: { type: String, trim: true, default: '' },
      relation: { type: String, trim: true, default: '' },
      age: Number,
    },
    isStaff: { type: Boolean, default: false },
    narration: { type: String, trim: true, default: '' },

    // Running state. Receipts move these, so the receipt screen never has to
    // replay a loan's whole history to know what is owed today.
    principalBalance: { type: Number, default: 0 },
    interestRecd: { type: Number, default: 0 },
    penalRecd: { type: Number, default: 0 },
    insuranceRecd: { type: Number, default: 0 },
    noticeCharges: { type: Number, default: 0 },
    noticeRecd: { type: Number, default: 0 },
    // Interest and insurance are charged up to a date, not up to an amount.
    intRecdUpto: Date,
    insuranceRecdUpto: Date,

    closedDate: Date,
    // Set when the pledge is handed on to a bank (Repledge).
    repledged: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

jewelLoanSchema.index({ branch: 1, accNo: 1 }, { unique: true })
jewelLoanSchema.index({ branch: 1, status: 1, dueDate: 1 })
jewelLoanSchema.index({ branch: 1, customerName: 1 })

jewelLoanSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.customer = this.customer?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

// The short shape the grids and the account-enquiry list use.
jewelLoanSchema.methods.toRow = function () {
  return {
    id: this._id.toString(),
    accNo: this.accNo,
    customerName: this.customerName,
    custId: this.custId,
    schemeCode: this.schemeCode,
    openDate: this.openDate,
    dueDate: this.dueDate,
    loanAmount: this.loanAmount,
    periodMonths: this.periodMonths,
    interestRate: this.interestRate,
    principalBalance: this.principalBalance,
    netWeight: this.netWeight,
    status: this.status,
    repledged: this.repledged,
  }
}

export default mongoose.model('JewelLoan', jewelLoanSchema)
