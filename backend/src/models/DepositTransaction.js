import mongoose from 'mongoose'

// Money moving on a term deposit: what was paid in when it was opened, each
// interest payout, and the closing settlement. Like every other book here, a
// wrong row is cancelled rather than erased.
export const DEPOSIT_TRAN_KINDS = ['opening', 'interest', 'closure', 'renewal']

const depositTransactionSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    deposit: { type: mongoose.Schema.Types.ObjectId, ref: 'FixedDeposit', required: true, index: true },
    accNo: { type: String, trim: true, index: true },
    custId: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },

    transId: { type: String, trim: true, default: '' },
    transDate: { type: Date, required: true },
    // Credit is money the deposit takes in, Debit is money paid out of it.
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    amount: { type: Number, required: true },
    kind: { type: String, enum: DEPOSIT_TRAN_KINDS, default: 'interest' },

    // What an interest payout covered, so a period is never paid twice.
    fromDate: Date,
    toDate: Date,
    tds: { type: Number, default: 0 },

    glCode: { type: String, trim: true, default: '' },
    narration: { type: String, trim: true, default: '' },

    status: { type: String, enum: ['A', 'cancelled'], default: 'A', index: true },
    cancelReason: { type: String, trim: true, default: '' },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

depositTransactionSchema.index({ branch: 1, transDate: -1 })
depositTransactionSchema.index({ deposit: 1, transDate: 1 })

depositTransactionSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.deposit = this.deposit?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('DepositTransaction', depositTransactionSchema)
