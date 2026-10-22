import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

// The rows and the columns of the old Permission Settings matrix.
export const PERMISSION_MODULES = [
  { key: 'customer', label: 'Customer', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'share', label: 'Share Master', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'savings', label: 'Savings Deposit', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'fd', label: 'Fixed Deposit', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'rd', label: 'Recurring Deposit', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'jewelLoan', label: 'Jewel Loan', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'otherLoans', label: 'Other Loans', actions: ['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'] },
  { key: 'journal', label: 'Journal', actions: ['View', 'Save'] },
  { key: 'settings', label: 'Settings', actions: ['View', 'Save', 'Update', 'Delete'] },
  { key: 'transactions', label: 'Transactions', actions: ['View', 'Delete', 'Verify'] },
]

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
    // Employee number from the old User Registration screen.
    empId: { type: String, trim: true, default: '' },
    // module key -> the actions this user may take, e.g. { customer: ['View', 'Save'] }
    permissions: { type: Map, of: [String], default: () => new Map() },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
)

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, ROUNDS)

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash)
}

// An admin may do anything; everyone else needs the action granted.
userSchema.methods.can = function (moduleKey, action) {
  if (this.role === 'admin') return true
  return (this.permissions?.get(moduleKey) || []).includes(action)
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
    empId: this.empId,
    permissions: Object.fromEntries(this.permissions || []),
    branches: this.branches.map((b) => b.toString()),
    active: this.active,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  }
}

export default mongoose.model('User', userSchema)
