import mongoose from 'mongoose'

// The daily gold market rate the jewel-loan module values pledges against.
const goldRateSchema = new mongoose.Schema(
  {
    effectDate: { type: Date, required: true, unique: true },
    marketRate: { type: Number, required: true }, // per sovereign, as the old screen held it
    ratePerGram: { type: Number, default: 0 },
    createdBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
)

goldRateSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    effectDate: this.effectDate,
    marketRate: this.marketRate,
    ratePerGram: this.ratePerGram,
    createdBy: this.createdBy,
  }
}

export default mongoose.model('GoldRate', goldRateSchema)
