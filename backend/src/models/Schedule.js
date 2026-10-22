import mongoose from 'mongoose'

// Accounting schedules (A10 Interest Earned, C10 Capital, ...). The chart of
// accounts is the same for every branch, so these are company-wide.
const scheduleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)

scheduleSchema.methods.toSafe = function () {
  return { id: this._id.toString(), code: this.code, name: this.name, active: this.active }
}

export default mongoose.model('Schedule', scheduleSchema)
