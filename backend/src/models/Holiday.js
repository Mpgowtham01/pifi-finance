import mongoose from 'mongoose'

// Calendar Settings: the days the branch does not transact on. A holiday with
// no branch applies to every branch.
const holidaySchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    date: { type: Date, required: true },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
)
holidaySchema.index({ branch: 1, date: 1 }, { unique: true })

holidaySchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    branch: this.branch ? this.branch.toString() : null,
    date: this.date,
    description: this.description,
  }
}

export default mongoose.model('Holiday', holidaySchema)
