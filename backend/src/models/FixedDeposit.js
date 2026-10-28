import mongoose from 'mongoose'

// How interest leaves the deposit, as the old Fixed_Deposit_Master coded it.
export const REPAYMENT = ['1A', '3A', 'M'] // monthly, quarterly, on maturity
export const REPAYMENT_LABELS = { '1A': '1A-Monthly', '3A': '3A-Quarterly', M: 'M-On Maturity' }
export const MOP = ['S', 'E', 'F', 'A', 'J', 'M']
export const MOP_LABELS = {
  S: 'S-Single', E: 'E-EorS', F: 'F-ForS', A: 'A-AorS', J: 'J-Joint', M: 'M-Minor',
}
// 'N' is the only one the old screen offered, but a cumulative deposit needs
// the others, and that product exists in their scheme master.
export const COMPOUNDING = ['N', 'M', 'Q', 'H', 'Y']
export const COMPOUNDING_LABELS = {
  N: 'N-No', M: 'Monthly', Q: 'Quarterly', H: 'Half-yearly', Y: 'Yearly',
}

const fixedDepositSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    accNo: { type: String, required: true, trim: true, index: true },
    oldAccNo: { type: String, trim: true, default: '' },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    custId: { type: String, required: true, trim: true, index: true },
    customerName: { type: String, trim: true, default: '' },
    jointCustIds: { type: [String], default: [] },
    jointNames: { type: [String], default: [] },

    schemeCode: { type: String, trim: true, default: '' },
    schemeName: { type: String, trim: true, default: '' },
    mop: { type: String, enum: MOP, default: 'S' },

    openDate: { type: Date, required: true },
    // The day the deposit starts earning, which is not always the day the
    // paperwork was done.
    effectDate: Date,
    periodMonths: { type: Number, required: true },
    maturityDate: { type: Date, required: true },

    depositAmount: { type: Number, required: true },
    interestRate: { type: Number, default: 0 }, // % per year
    compounding: { type: String, enum: COMPOUNDING, default: 'N' },
    interestRepayment: { type: String, enum: REPAYMENT, default: 'M' },
    intPaymentMode: { type: String, trim: true, default: 'Cash' },
    // ME = paid on the first of the month, D2D = on the anniversary of the day.
    intPayoutMode: { type: String, trim: true, default: 'D2D' },
    neftBank: { type: String, trim: true, default: '' },
    neftBranch: { type: String, trim: true, default: '' },
    neftIfsc: { type: String, trim: true, default: '', uppercase: true },
    neftAccNo: { type: String, trim: true, default: '' },
    // What it will be worth at the end, and the interest inside that.
    maturityAmount: { type: Number, default: 0 },
    projectedInterest: { type: Number, default: 0 },

    // Interest already handed over, and the date it is settled to.
    interestPaid: { type: Number, default: 0 },
    interestUpto: Date,

    glCode: { type: String, trim: true, default: '' },
    minor: { name: { type: String, trim: true, default: '' }, dob: Date },
    nominee: {
      name: { type: String, trim: true, default: '' },
      relation: { type: String, trim: true, default: '' },
      age: Number,
      dob: Date,
    },
    referredBy: { type: String, trim: true, default: '' },

    isSeniorCitizen: { type: Boolean, default: false },
    isSuperSenior: { type: Boolean, default: false },
    isStaff: { type: Boolean, default: false },
    deductTds: { type: Boolean, default: false },
    // Opened without a cash movement, because the money came from elsewhere.
    withoutTransaction: { type: Boolean, default: false },

    // A deposit pledged against a loan cannot be closed while the lien stands.
    lienAccNo: { type: String, trim: true, default: '' },
    lienAmount: { type: Number, default: 0 },

    status: { type: String, enum: ['A', 'C'], default: 'A', index: true },
    closedDate: Date,
    closureAmount: { type: Number, default: 0 },
    // Set when the deposit was closed by being renewed into a new one.
    renewedInto: { type: String, trim: true, default: '' },
    renewedFrom: { type: String, trim: true, default: '' },

    transId: { type: String, trim: true, default: '' },
    transDate: Date,
    narration: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

fixedDepositSchema.index({ branch: 1, accNo: 1 }, { unique: true })
fixedDepositSchema.index({ branch: 1, maturityDate: 1 })
fixedDepositSchema.index({ branch: 1, customerName: 1 })

fixedDepositSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.customer = this.customer?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

fixedDepositSchema.methods.toRow = function () {
  return {
    id: this._id.toString(),
    accNo: this.accNo,
    customerName: this.customerName,
    custId: this.custId,
    schemeCode: this.schemeCode,
    openDate: this.openDate,
    maturityDate: this.maturityDate,
    periodMonths: this.periodMonths,
    depositAmount: this.depositAmount,
    interestRate: this.interestRate,
    maturityAmount: this.maturityAmount,
    interestRepayment: this.interestRepayment,
    status: this.status,
    lienAmount: this.lienAmount,
  }
}

export default mongoose.model('FixedDeposit', fixedDepositSchema)
