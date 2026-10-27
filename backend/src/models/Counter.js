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

// What the next number WOULD be, without taking it. The master screen shows
// the account number before anything is saved, and two clerks opening a blank
// form must not burn two numbers between them.
counterSchema.statics.peek = async function (key, start = 1) {
  const doc = await this.findOne({ key })
  return Math.max(doc ? doc.seq + 1 : 1, start)
}

export default mongoose.model('Counter', counterSchema)
