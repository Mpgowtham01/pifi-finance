import mongoose from 'mongoose'

// The opening balance a branch carries on a GL account as at a date.
const openingBalanceSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    glCode: { type: String, required: true, trim: true },
    asOn: { type: Date, required: true },
    amount: { type: Number, default: 0 },
    type: { type: String, enum: ['Cr', 'Dr'], default: 'Cr' },
    sanctionLimit: { type: Number, default: 0 },
  },
  { timestamps: true }
)
openingBalanceSchema.index({ branch: 1, glCode: 1 }, { unique: true })

openingBalanceSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    glCode: this.glCode,
    asOn: this.asOn,
    amount: this.amount,
    type: this.type,
    sanctionLimit: this.sanctionLimit,
  }
}

export default mongoose.model('OpeningBalance', openingBalanceSchema)
