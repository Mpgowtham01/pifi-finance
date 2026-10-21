// Escape a user-typed string so it is safe inside a RegExp.
export function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
