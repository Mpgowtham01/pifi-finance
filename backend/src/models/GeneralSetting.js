import mongoose from 'mongoose'

// One row per branch — the old General Settings screen.
const generalSettingSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, unique: true },
    cashAccountNo: { type: String, trim: true, default: '' },
    pandlAccountNo: { type: String, trim: true, default: '' },
    aoAccountNo: { type: String, trim: true, default: '' },
    aoBranchCode: { type: String, trim: true, default: '' },
    cashTranLimit: { type: Number, default: 0 },
    depositLimit: { type: Number, default: 0 },
    tdsLimit: { type: Number, default: 0 },
    tdsPercentage: { type: Number, default: 0 },
    smsEnabled: { type: Boolean, default: true },
    chequeOption: { type: Boolean, default: false },
    directPrint: { type: Boolean, default: false },
    allowOdLoan: { type: Boolean, default: false },
    monthEndPosting: { type: Boolean, default: false },
  },
  { timestamps: true }
)

generalSettingSchema.methods.toSafe = function () {
  const o = this.toObject()
  o.id = this._id.toString()
  o.branch = this.branch.toString()
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('GeneralSetting', generalSettingSchema)
