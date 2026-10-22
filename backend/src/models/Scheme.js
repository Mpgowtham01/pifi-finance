import mongoose from 'mongoose'

// Scheme categories as the old system coded them.
export const SCHEME_CATEGORIES = ['SC', 'SD', 'FD', 'RD', 'JL', 'OL', 'OTH']

// A product: share capital, savings deposit, a jewel-loan product, and so on.
const schemeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: SCHEME_CATEGORIES, default: 'OTH' },
    glCode: { type: String, trim: true, default: '' }, // GlAccount.code
    interestGlCode: { type: String, trim: true, default: '' },
    minAmount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['A', 'I'], default: 'A' },
  },
  { timestamps: true }
)

schemeSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    code: this.code,
    name: this.name,
    category: this.category,
    glCode: this.glCode,
    interestGlCode: this.interestGlCode,
    minAmount: this.minAmount,
    maxAmount: this.maxAmount,
    status: this.status,
  }
}

export default mongoose.model('Scheme', schemeSchema)
