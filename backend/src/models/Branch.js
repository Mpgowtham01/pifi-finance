import mongoose from 'mongoose'

// A branch of the finance company. In the old system each branch was a
// separate database; here every branch lives in one database and scoped
// records carry a `branch` reference.
const branchSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true }, // e.g. "201"
    name: { type: String, required: true, trim: true }, // e.g. "Nagercoil"
    companyName: { type: String, default: 'Thangarathnam Finance', trim: true },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)

branchSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    code: this.code,
    name: this.name,
    label: `${this.code}-${this.name}`,
    companyName: this.companyName,
    active: this.active,
  }
}

export default mongoose.model('Branch', branchSchema)
