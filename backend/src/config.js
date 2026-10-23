import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

export const paths = {
  backendRoot,
  frontendDist: path.join(backendRoot, '..', 'frontend', 'dist'),
}

function required(name) {
  const v = process.env[name]
  if (!v) {
    // On a host there is no .env — the value comes from the service's
    // environment settings, so say both.
    console.error(
      `\nMissing ${name}.\n` +
        `  Locally: copy backend/.env.example to backend/.env and fill it in.\n` +
        `  On a host: set ${name} in the service's environment variables.\n`
    )
    process.exit(1)
  }
  return v
}

export const config = {
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),
  port: Number(process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  tokenHours: Number(process.env.TOKEN_HOURS || 12),
  cookieName: 'pifi_session',
}
