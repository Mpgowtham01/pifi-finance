// A plain Error carrying the HTTP status the global handler should answer with.
export function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}
