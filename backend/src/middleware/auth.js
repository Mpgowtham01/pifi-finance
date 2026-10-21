import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import User from '../models/User.js'

export function issueToken(res, user, branchId) {
  const token = jwt.sign({ sub: user._id.toString(), branch: branchId.toString() }, config.jwtSecret, {
    expiresIn: `${config.tokenHours}h`,
  })
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: config.tokenHours * 60 * 60 * 1000,
    path: '/',
  })
}

export function clearToken(res) {
  res.clearCookie(config.cookieName, { path: '/' })
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[config.cookieName]
  if (!token) return res.status(401).json({ error: 'Please sign in.' })

  let payload
  try {
    payload = jwt.verify(token, config.jwtSecret)
  } catch {
    clearToken(res)
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }

  const user = await User.findById(payload.sub)
  if (!user || !user.active) {
    clearToken(res)
    return res.status(401).json({ error: 'This account is no longer active.' })
  }

  // The branch chosen at sign-in travels with the session and scopes every query.
  if (!payload.branch || !user.canAccessBranch(payload.branch)) {
    clearToken(res)
    return res.status(401).json({ error: 'You no longer have access to that branch.' })
  }

  req.user = user
  req.branchId = payload.branch
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can do that.' })
  }
  next()
}
