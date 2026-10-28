import mongoose from 'mongoose'

// A general-ledger entry made by hand — the old Journal.aspx, which was one
// screen serving three menu entries through its PT query string. A journal is
// free on both sides; a payment voucher pays cash out, so its credit side is
// cash; a receipt voucher takes cash in, so its debit side is cash. Nothing
// else about them differs, which is why they share a table.
export const VOUCHER_TYPES = ['JNL', 'VP', 'VR']

export const VOUCHER_TITLES = {
  JNL: 'Journal',
  VP: 'Voucher Payment',
  VR: 'Voucher Receipt',
}

// The side that is fixed to cash, if any. The old screen filled that box in
// for you and left it open to change.
export const CASH_SIDE = { JNL: null, VP: 'credit', VR: 'debit' }

// A row of the "+" panel on the old screen: part of the entry carried against
// a customer's own account rather than left on the ledger head.
const allocationSchema = new mongoose.Schema(
  {
    accNo: { type: String, trim: true, required: true },
    accType: { type: String, trim: true, default: '' }, // 'Savings', 'Jewel Loan', ...
    custId: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
)

const voucherSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    voucherType: { type: String, enum: VOUCHER_TYPES, required: true, index: true },

    transId: { type: String, trim: true, default: '' },
    transDate: { type: Date, required: true },

    // Both sides are kept by code and by name. The name is copied in so a
    // voucher still reads the same years later, after a GL head is renamed.
    debitGlCode: { type: String, trim: true, required: true },
    debitGlName: { type: String, trim: true, default: '' },
    creditGlCode: { type: String, trim: true, required: true },
    creditGlName: { type: String, trim: true, default: '' },

    amount: { type: Number, required: true },
    narration: { type: String, trim: true, default: '' },
    allocations: { type: [allocationSchema], default: [] },

    // A wrong voucher is cancelled, never erased: the row stays in the day
    // book with its reason, the same as every other posting in this app.
    status: { type: String, enum: ['A', 'cancelled'], default: 'A', index: true },
    cancelReason: { type: String, trim: true, default: '' },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

voucherSchema.index({ branch: 1, transDate: -1 })
voucherSchema.index({ branch: 1, transId: 1 })

// The shape the voucher list and the day book print.
voucherSchema.methods.toRow = function () {
  return {
    id: this._id.toString(),
    voucherType: this.voucherType,
    title: VOUCHER_TITLES[this.voucherType],
    transId: this.transId,
    transDate: this.transDate,
    debitGlCode: this.debitGlCode,
    debitGlName: this.debitGlName,
    creditGlCode: this.creditGlCode,
    creditGlName: this.creditGlName,
    amount: this.amount,
    narration: this.narration,
    status: this.status,
  }
}

voucherSchema.methods.toJSONSafe = function () {
  return {
    ...this.toRow(),
    allocations: this.allocations.map((a) => ({
      accNo: a.accNo,
      accType: a.accType,
      custId: a.custId,
      customerName: a.customerName,
      type: a.type,
      amount: a.amount,
    })),
    cancelReason: this.cancelReason,
    cancelledAt: this.cancelledAt || null,
    createdAt: this.createdAt,
  }
}

export default mongoose.model('Voucher', voucherSchema)
