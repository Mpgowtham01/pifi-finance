import mongoose from 'mongoose'

// The deposit terms a scheme may be opened for ("12 Months" / code 12M).
const depositPeriodSchema = new mongoose.Schema(
  {
    schemeCode: { type: String, required: true, trim: true, index: true },
    schemeName: { type: String, trim: true, default: '' },
    period: { type: String, required: true, trim: true }, // "12 Months"
    periodCode: { type: String, trim: true, default: '' }, // "12M"
    unit: { type: String, enum: ['Months', 'Days'], default: 'Months' },
    status: { type: String, enum: ['A', 'I'], default: 'A' },
  },
  { timestamps: true }
)
depositPeriodSchema.index({ schemeCode: 1, periodCode: 1 }, { unique: true })

depositPeriodSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    schemeCode: this.schemeCode,
    schemeName: this.schemeName,
    period: this.period,
    periodCode: this.periodCode,
    unit: this.unit,
    status: this.status,
  }
}

export default mongoose.model('DepositPeriod', depositPeriodSchema)
