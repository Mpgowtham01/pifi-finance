import mongoose from 'mongoose'

// One interest rate for a scheme over a period band, effective from a date.
// The old Interest Slab screen kept a history, so rows are never overwritten.
const interestSlabSchema = new mongoose.Schema(
  {
    schemeCode: { type: String, required: true, trim: true, index: true },
    schemeName: { type: String, trim: true, default: '' },
    period: { type: String, trim: true, default: '' }, // "0-90 Days"
    effectDate: { type: Date, required: true },
    rate: { type: Number, default: 0 },
    penalRate: { type: Number, default: 0 },
    srCtznRate: { type: Number, default: 0 },
    srCtznPenalRate: { type: Number, default: 0 },
  },
  { timestamps: true }
)
interestSlabSchema.index({ schemeCode: 1, period: 1, effectDate: -1 })

interestSlabSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    schemeCode: this.schemeCode,
    schemeName: this.schemeName,
    period: this.period,
    effectDate: this.effectDate,
    rate: this.rate,
    penalRate: this.penalRate,
    srCtznRate: this.srCtznRate,
    srCtznPenalRate: this.srCtznPenalRate,
  }
}

export default mongoose.model('InterestSlab', interestSlabSchema)
