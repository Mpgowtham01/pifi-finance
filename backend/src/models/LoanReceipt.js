import mongoose from 'mongoose'

// One repayment against a loan — the old JL_Receipt.aspx / OL_Receipt.aspx.
// A receipt is never edited or deleted once saved; a wrong one is cancelled,
// which puts the money back on the loan and leaves the row in the day book.
const loanReceiptSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    loan: { type: mongoose.Schema.Types.ObjectId, ref: 'JewelLoan', required: true, index: true },
    loanKind: { type: String, enum: ['JL', 'OL'], default: 'JL' },

    accNo: { type: String, trim: true, index: true },
    custId: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },

    transId: { type: String, trim: true, default: '' },
    transDate: { type: Date, required: true },
    glCode: { type: String, trim: true, default: '' }, // where the cash landed

    // The split. These add up to `amount` plus the rebate allowed.
    principal: { type: Number, default: 0 },
    interest: { type: Number, default: 0 },
    penal: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    notice: { type: Number, default: 0 },
    rebate: { type: Number, default: 0 }, // interest written off, not received
    amount: { type: Number, required: true },

    // Where the loan stood after this receipt was posted.
    intUpto: Date,
    insuranceUpto: Date,
    closingBalance: { type: Number, default: 0 },
    preClosure: { type: Boolean, default: false },
    closedLoan: { type: Boolean, default: false },

    narration: { type: String, trim: true, default: '' },
    // Brought over from the old system's ledger, which recorded the amount
    // but not the split. Such a row is history, not a receipt we issued.
    imported: { type: Boolean, default: false },
    status: { type: String, enum: ['A', 'cancelled'], default: 'A', index: true },
    cancelReason: { type: String, trim: true, default: '' },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

loanReceiptSchema.index({ branch: 1, transDate: -1 })
loanReceiptSchema.index({ loan: 1, transDate: 1 })

loanReceiptSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.loan = this.loan?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('LoanReceipt', loanReceiptSchema)
