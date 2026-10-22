import mongoose from 'mongoose'

// Which GL accounts roll up into which group of a management report.
const reportSettingSchema = new mongoose.Schema(
  {
    reportCode: { type: String, trim: true, default: '101' },
    groupName: { type: String, required: true, trim: true }, // "1.Fixed Deposit"
    glCode: { type: String, required: true, trim: true },
    glName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
)
reportSettingSchema.index({ reportCode: 1, groupName: 1, glCode: 1 }, { unique: true })

reportSettingSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    reportCode: this.reportCode,
    groupName: this.groupName,
    glCode: this.glCode,
    glName: this.glName,
  }
}

export default mongoose.model('ReportSetting', reportSettingSchema)
