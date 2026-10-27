import mongoose from 'mongoose'

// Mode of operation, as the old Savings_Master.aspx coded it.
export const MOP = ['S', 'E', 'F', 'A', 'J', 'M']
export const MOP_LABELS = {
  S: 'S-Single',
  E: 'E-EorS',
  F: 'F-ForS',
  A: 'A-AorS',
  J: 'Joint',
  M: 'M-Minor',
}

// A savings deposit account. The balance is kept on the account rather than
// replayed from the transactions every time a list is drawn — a branch has
// thousands of them and the list shows a closing balance for each.
const savingsAccountSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    accNo: { type: String, required: true, trim: true, index: true },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    custId: { type: String, required: true, trim: true, index: true },
    customerName: { type: String, trim: true, default: '' },
    // Up to three more names on the account, as the old form allowed.
    jointCustIds: { type: [String], default: [] },
    jointNames: { type: [String], default: [] },

    schemeCode: { type: String, trim: true, default: '' },
    schemeName: { type: String, trim: true, default: '' },
    openDate: { type: Date, required: true },
    mop: { type: String, enum: MOP, default: 'S' },

    minor: {
      name: { type: String, trim: true, default: '' },
      dob: Date,
    },
    nominee: {
      name: { type: String, trim: true, default: '' },
      relation: { type: String, trim: true, default: '' },
      age: Number,
      dob: Date,
    },

    interestRate: { type: Number, default: 0 }, // % per year
    // Interest is worked out from here forward when the product is run.
    interestUpto: Date,

    balance: { type: Number, default: 0 },
    lastTranDate: Date,

    status: { type: String, enum: ['A', 'C'], default: 'A', index: true },
    closedDate: Date,
    closureCharges: { type: Number, default: 0 },

    verified: { type: Boolean, default: false },
    narration: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

savingsAccountSchema.index({ branch: 1, accNo: 1 }, { unique: true })
savingsAccountSchema.index({ branch: 1, customerName: 1 })

savingsAccountSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.customer = this.customer?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

// The columns the old Savings Deposit List showed.
savingsAccountSchema.methods.toRow = function () {
  return {
    id: this._id.toString(),
    accNo: this.accNo,
    customerName: this.customerName,
    custId: this.custId,
    schemeCode: this.schemeCode,
    openDate: this.openDate,
    lastTranDate: this.lastTranDate,
    status: this.status,
    balance: this.balance,
    interestRate: this.interestRate,
  }
}

export default mongoose.model('SavingsAccount', savingsAccountSchema)
