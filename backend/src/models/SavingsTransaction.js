import mongoose from 'mongoose'

// One movement on a savings account — the old SB_Tran.aspx. A wrong entry is
// cancelled, never erased: the row stays in the day book with its reason and
// the balance goes back.
export const TRAN_KINDS = ['normal', 'interest', 'closure']

const savingsTransactionSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SavingsAccount', required: true, index: true },
    accNo: { type: String, trim: true, index: true },
    custId: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },

    transId: { type: String, trim: true, default: '' },
    transDate: { type: Date, required: true },
    // Credit puts money in, Debit takes it out, as the old dropdown had it.
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    amount: { type: Number, required: true },

    glCode: { type: String, trim: true, default: '' },
    mop: { type: String, trim: true, default: '' },
    // Interest postings and the closing entry are told apart from counter
    // work, because a report of deposits should not count them.
    kind: { type: String, enum: TRAN_KINDS, default: 'normal' },

    // Where the account stood once this was posted.
    balance: { type: Number, default: 0 },
    narration: { type: String, trim: true, default: '' },

    status: { type: String, enum: ['A', 'cancelled'], default: 'A', index: true },
    cancelReason: { type: String, trim: true, default: '' },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

savingsTransactionSchema.index({ branch: 1, transDate: -1 })
savingsTransactionSchema.index({ account: 1, transDate: 1 })

savingsTransactionSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.account = this.account?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('SavingsTransaction', savingsTransactionSchema)
