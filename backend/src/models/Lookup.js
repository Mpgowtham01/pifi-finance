import mongoose from 'mongoose'

// The old system had three screens that each maintained one list of names:
// Jewel Description, Id Proof Master and Bank Master. They share a shape, so
// they share a collection, told apart by `kind`.
export const LOOKUP_KINDS = ['jewel', 'idProof', 'bank']

const lookupSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: LOOKUP_KINDS, required: true, index: true },
    name: { type: String, required: true, trim: true },
    sort: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)
lookupSchema.index({ kind: 1, name: 1 }, { unique: true })

lookupSchema.methods.toSafe = function () {
  return { id: this._id.toString(), kind: this.kind, name: this.name, sort: this.sort, active: this.active }
}

export default mongoose.model('Lookup', lookupSchema)
