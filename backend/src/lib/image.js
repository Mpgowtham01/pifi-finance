import mongoose from 'mongoose'
import { httpError } from './httpError.js'

// Small images kept in the document itself — a customer's photo and specimen
// signature, and the photo of the jewels a loan is pledged against. They are
// never sent with a normal read; each is served by its own endpoint.

export const MAX_IMAGE_BYTES = 600 * 1024

export const imageSchema = new mongoose.Schema(
  { data: Buffer, contentType: { type: String, default: 'image/jpeg' } },
  { _id: false }
)

// Turn a browser data URL into the stored image, or null to clear it.
// `undefined` means "the client did not mention this field" — leave it alone.
export function parseImage(v) {
  if (v === undefined) return undefined
  if (!v) return null
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(v))
  if (!m) throw httpError(400, 'That image could not be read. Use a PNG or JPEG.')
  const data = Buffer.from(m[2], 'base64')
  if (data.length > MAX_IMAGE_BYTES) throw httpError(413, 'That image is too large - keep it under 600 KB.')
  return { data, contentType: m[1] }
}

// Serve one image field off one document of `Model`, scoped to the branch.
export async function sendImage(Model, req, res, field) {
  const doc = await Model.findOne({ _id: req.params.id, branch: req.branchId }).select(`+${field}`)
  const img = doc?.[field]
  if (!img?.data) throw httpError(404, 'No image on file.')
  res.set('Content-Type', img.contentType || 'image/jpeg')
  res.set('Cache-Control', 'private, max-age=60')
  res.send(img.data)
}
