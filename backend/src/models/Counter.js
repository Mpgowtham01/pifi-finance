import mongoose from 'mongoose'

// Per-branch, per-kind running numbers (customer id, account no, ...).
// `next()` atomically increments and returns the new value.
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // e.g. "<branchId>:customer"
  seq: { type: Number, default: 0 },
})

counterSchema.statics.next = async function (key, start = 1) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 }, $setOnInsert: { key } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  // If the counter was just created, bring it up to the desired start value.
  if (doc.seq < start) {
    doc.seq = start
    await doc.save()
  }
  return doc.seq
}

export default mongoose.model('Counter', counterSchema)
