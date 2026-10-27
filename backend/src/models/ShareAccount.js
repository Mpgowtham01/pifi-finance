import mongoose from 'mongoose'

// A member's share holding — the old Share_Master.aspx. Shares are issued in
// a run of distinctive numbers, and that run is what a transfer moves, so the
// from/to pair matters as much as the count.
const shareAccountSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    accNo: { type: String, required: true, trim: true, index: true },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    custId: { type: String, required: true, trim: true, index: true },
    customerName: { type: String, trim: true, default: '' },

    schemeCode: { type: String, trim: true, default: '' }, // the share type
    schemeName: { type: String, trim: true, default: '' },

    date: { type: Date, required: true }, // the allotment date
    noOfShares: { type: Number, required: true },
    shareValue: { type: Number, default: 0 }, // face value of one share
    shareAmount: { type: Number, default: 0 }, // noOfShares x shareValue

    // The distinctive numbers of the shares held, inclusive at both ends.
    shareNoFrom: { type: Number, default: 0 },
    shareNoTo: { type: Number, default: 0 },
    certificateNo: { type: String, trim: true, default: '' },
    duplicateNo: { type: String, trim: true, default: '' },
    // Who the holding came from, when it was transferred rather than issued.
    transferee: { type: String, trim: true, default: '' },

    transId: { type: String, trim: true, default: '' },
    transDate: Date,
    glCode: { type: String, trim: true, default: '' }, // mode of receipt
    entranceFees: { type: Number, default: 0 },

    nominee: {
      name: { type: String, trim: true, default: '' },
      relation: { type: String, trim: true, default: '' },
      age: Number,
      dob: Date,
    },

    // Shares the branch itself holds, rather than a member.
    branchShare: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    narration: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['A', 'C'], default: 'A', index: true },
    closedDate: Date,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

shareAccountSchema.index({ branch: 1, accNo: 1 }, { unique: true })
shareAccountSchema.index({ branch: 1, customerName: 1 })
shareAccountSchema.index({ branch: 1, shareNoFrom: 1 })

shareAccountSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  o.customer = this.customer?.toString()
  o.branch = this.branch?.toString()
  delete o._id
  delete o.__v
  return o
}

// The columns the old Share Master List showed.
shareAccountSchema.methods.toRow = function () {
  return {
    id: this._id.toString(),
    accNo: this.accNo,
    customerName: this.customerName,
    custId: this.custId,
    date: this.date,
    noOfShares: this.noOfShares,
    shareValue: this.shareValue,
    shareAmount: this.shareAmount,
    shareNoFrom: this.shareNoFrom,
    shareNoTo: this.shareNoTo,
    certificateNo: this.certificateNo,
    status: this.status,
  }
}

export default mongoose.model('ShareAccount', shareAccountSchema)
