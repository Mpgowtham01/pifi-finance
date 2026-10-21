import mongoose from 'mongoose'

// Field model mirrors the old Customer_Master.aspx (see reference-pifi/ANALYSIS.md
// in the sibling repo), modernised: one database, scoped by `branch`.
const idProofSchema = new mongoose.Schema(
  {
    type: { type: String, trim: true, default: '' }, // Voter ID / Licence / Aadhaar / PAN ...
    number: { type: String, trim: true, default: '' },
    issueDate: Date,
    issuePlace: { type: String, trim: true, default: '' },
  },
  { _id: false }
)

const customerSchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    // Human id shown in the UI, unique within a branch (e.g. "10100130").
    custId: { type: String, required: true, trim: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    fatherOrGuardian: { type: String, trim: true, default: '' },
    relation: { type: String, trim: true, default: '' }, // Father/Mother/Husband/Wife/Son/...
    gender: { type: String, enum: ['M', 'F', 'U'], default: 'U' },
    dob: Date,
    maritalStatus: { type: String, trim: true, default: '' },
    occupation: { type: String, trim: true, default: '' },
    customerType: { type: String, trim: true, default: 'Individual' },
    anniversaryDate: Date,

    // Contact
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    mobile: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },

    permanentAddress: { type: String, trim: true, default: '' },
    permanentCity: { type: String, trim: true, default: '' },
    permanentPincode: { type: String, trim: true, default: '' },
    sameAsAddress: { type: Boolean, default: false },

    // Identity
    panNo: { type: String, trim: true, uppercase: true, default: '' },
    idProofs: { type: [idProofSchema], default: [] },

    // Nominee
    nominee: {
      name: { type: String, trim: true, default: '' },
      dob: Date,
      age: Number,
      relation: { type: String, trim: true, default: '' },
    },

    // Introducer / referral
    introducerId: { type: String, trim: true, default: '' },
    introducerName: { type: String, trim: true, default: '' },

    // Flags
    smsOptIn: { type: Boolean, default: true },
    deductTds: { type: Boolean, default: false },

    photoUrl: { type: String, default: '' },
    signatureUrl: { type: String, default: '' },
    remarks: { type: String, trim: true, default: '' },

    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

// custId is unique inside a branch (different branches may reuse numbers).
customerSchema.index({ branch: 1, custId: 1 }, { unique: true })
// Free-text search fields.
customerSchema.index({ branch: 1, name: 1 })
customerSchema.index({ branch: 1, mobile: 1 })

customerSchema.methods.toJSONSafe = function () {
  const o = this.toObject({ virtuals: false })
  o.id = this._id.toString()
  delete o._id
  delete o.__v
  return o
}

export default mongoose.model('Customer', customerSchema)
