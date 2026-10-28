import mongoose from 'mongoose'

// The close of a branch's day — the old Day_End_Process.aspx. The clerk counts
// what is in the drawer note by note, the screen adds it up, and the total is
// set against what the books say should be there. The count is kept, so a
// difference can be looked at afterwards rather than argued about.

// Every row of the old screen's "Denomination of Notes/Currency" panel, in its
// order. Adjustment and Coins are entered as rupees rather than as a count of
// notes, which is why their value is one.
export const DENOMINATIONS = [
  { key: '2000', label: '2000', value: 2000 },
  { key: '1000', label: '1000', value: 1000 },
  { key: '500', label: '500', value: 500 },
  { key: '200', label: '200', value: 200 },
  { key: '100', label: '100', value: 100 },
  { key: '50', label: '50', value: 50 },
  { key: '20', label: '20', value: 20 },
  { key: '10', label: '10', value: 10 },
  { key: '5', label: '5', value: 5 },
  { key: 'adj', label: 'Adjustment', value: 1 },
  { key: 'coins', label: 'Coins', value: 1 },
]

const countSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: Number, required: true }, // what one of them is worth
    count: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
)

const dayEndSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    on: { type: Date, required: true },

    denominations: { type: [countSchema], default: [] },
    countedTotal: { type: Number, default: 0 },
    // What the books said the till held at the close of that day.
    bookClosing: { type: Number, default: 0 },
    difference: { type: Number, default: 0 },

    // The day as the books saw it, kept with the count so the record stands on
    // its own later, whatever happens to the books afterwards.
    receipts: { type: Number, default: 0 },
    payments: { type: Number, default: 0 },
    transactions: { type: Number, default: 0 },
    jlOdCount: { type: Number, default: 0 },
    jlOdAmount: { type: Number, default: 0 },

    narration: { type: String, trim: true, default: '' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

// One close per branch per day; closing it again replaces the count.
dayEndSchema.index({ branch: 1, on: 1 }, { unique: true })

dayEndSchema.methods.toJSONSafe = function () {
  return {
    id: this._id.toString(),
    on: this.on,
    denominations: this.denominations.map((d) => ({
      key: d.key,
      value: d.value,
      count: d.count,
      total: d.total,
    })),
    countedTotal: this.countedTotal,
    bookClosing: this.bookClosing,
    difference: this.difference,
    receipts: this.receipts,
    payments: this.payments,
    transactions: this.transactions,
    jlOdCount: this.jlOdCount,
    jlOdAmount: this.jlOdAmount,
    narration: this.narration,
    closedAt: this.createdAt,
  }
}

export default mongoose.model('DayEnd', dayEndSchema)
