import mongoose from 'mongoose'

// A holding, or part of one, moving from one member to another — the old
// Share_Transfer.aspx. What moves is a run of distinctive numbers, so the
// transfer records that run rather than just a count.
const shareTransferSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    transId: { type: String, trim: true, default: '' },
    transDate: { type: Date, required: true },

    fromAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'ShareAccount', required: true, index: true },
    fromAccNo: { type: String, trim: true, default: '' },
    fromCustId: { type: String, trim: true, default: '' },
    fromCustomerName: { type: String, trim: true, default: '' },

    // The holding the shares landed in. One is opened if the new holder had
    // none, which is why this is filled in after the transfer is worked out.
    toAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'ShareAccount', index: true },
    toAccNo: { type: String, trim: true, default: '' },
    toCustId: { type: String, trim: true, default: '' },
    toCustomerName: { type: String, trim: true, default: '' },

    schemeCode: { type: String, trim: true, default: '' },
    noOfShares: { type: Number, required: true },
    shareValue: { type: Number, default: 0 },
    shareAmount: { type: Number, default: 0 },
    // The run that moved, inclusive at both ends.
    distFrom: { type: Number, default: 0 },
    distTo: { type: Number, default: 0 },

    nominee: { type: String, trim: true, default: '' },
    narration: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

shareTransferSchema.index({ branch: 1, transDate: -1 })

shareTransferSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.branch = this.branch?.toString()
  o.fromAccount = this.fromAccount?.toString()
  o.toAccount = this.toAccount?.toString()
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('ShareTransfer', shareTransferSchema)
