import mongoose from 'mongoose'

// Re-pledge: the jewels a customer pledged with us are handed on to a bank and
// we borrow against them. It is our own borrowing, so it carries a bank, a
// rate and a closure — the old Repledge_List.aspx / Repledge_Closure.aspx.
const repledgeSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    accNo: { type: String, required: true, trim: true, index: true }, // our reference
    bankName: { type: String, trim: true, default: '' },
    bankAccNo: { type: String, trim: true, default: '' }, // the bank's loan number
    schemeCode: { type: String, trim: true, default: '' },

    // The pledges handed over. Each one is marked `repledged` while it is out.
    loans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'JewelLoan' }],
    netWeight: { type: Number, default: 0 },
    noOfItems: { type: Number, default: 0 },

    openDate: { type: Date, required: true },
    periodMonths: { type: Number, default: 12 },
    dueDate: Date,
    loanAmount: { type: Number, required: true },
    interestRate: { type: Number, default: 0 },
    compounding: { type: String, trim: true, default: 'Monthly' },

    principalBalance: { type: Number, default: 0 },
    intRecdUpto: Date,

    glCodeDr: { type: String, trim: true, default: '' },
    glCodeCr: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['A', 'C'], default: 'A', index: true },

    closedDate: Date,
    closingAmount: { type: Number, default: 0 },
    principalPaid: { type: Number, default: 0 },
    interestPaid: { type: Number, default: 0 },
    narration: { type: String, trim: true, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

repledgeSchema.index({ branch: 1, accNo: 1 }, { unique: true })

repledgeSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.branch = this.branch?.toString()
  o.loans = (this.loans || []).map((l) => l.toString())
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('Repledge', repledgeSchema)
