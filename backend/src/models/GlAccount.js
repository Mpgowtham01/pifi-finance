import mongoose from 'mongoose'

export const GL_CATEGORIES = ['Asset', 'Liability', 'Income', 'Expenditure']

// A general-ledger account. `isBankAccount` is what the old "List of Bank
// Accounts" screen maintained: a flag on an existing GL account, not a
// separate table.
const glAccountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    schedule: { type: String, trim: true, uppercase: true, default: '' }, // Schedule.code
    category: { type: String, enum: GL_CATEGORIES, default: 'Asset' },
    isBankAccount: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)
glAccountSchema.index({ name: 1 })

glAccountSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    code: this.code,
    name: this.name,
    schedule: this.schedule,
    category: this.category,
    isBankAccount: this.isBankAccount,
    active: this.active,
  }
}

export default mongoose.model('GlAccount', glAccountSchema)
