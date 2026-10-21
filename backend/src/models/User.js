import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const ROUNDS = 12

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    // Branches this user may sign in to. An admin may access every branch, so
    // an empty list for an admin means "all branches".
    branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
)

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, ROUNDS)

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash)
}

userSchema.methods.canAccessBranch = function (branchId) {
  if (this.role === 'admin') return true
  return this.branches.some((b) => b.toString() === branchId.toString())
}

userSchema.methods.toSafe = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    name: this.name,
    role: this.role,
    branches: this.branches.map((b) => b.toString()),
    active: this.active,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  }
}

export default mongoose.model('User', userSchema)
