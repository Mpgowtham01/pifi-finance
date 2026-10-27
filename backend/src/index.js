import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config, paths } from './config.js'
import { connectDB } from './db.js'
import authRoutes from './routes/auth.js'
import branchRoutes from './routes/branches.js'
import customerRoutes from './routes/customers.js'
import dashboardRoutes from './routes/dashboard.js'
import settingsRoutes from './routes/settings.js'
import loanRoutes from './routes/loans.js'
import shareRoutes from './routes/shares.js'
import savingsRoutes from './routes/savings.js'
import depositRoutes from './routes/deposits.js'

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(
  helmet({
    contentSecurityPolicy: config.isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  })
)

// Customer photo + signature travel as data URLs inside the JSON body.
app.use(express.json({ limit: '4mb' }))
app.use(cookieParser())
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }))

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.use('/api/auth', authRoutes)
app.use('/api/branches', branchRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/loans', loanRoutes)
app.use('/api/shares', shareRoutes)
app.use('/api/savings', savingsRoutes)
app.use('/api/deposits', depositRoutes)

app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint.' }))

if (config.isProd) {
  app.use(express.static(paths.frontendDist))
  app.use((_req, res) => res.sendFile(path.join(paths.frontendDist, 'index.html')))
}

app.use((err, _req, res, _next) => {
  // Routes raise httpError(status, message) for everything the user can fix.
  if (err?.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error(err)
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Invalid data.' })
  }
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Bad id.' })
  if (err?.code === 11000) return res.status(409).json({ error: 'That already exists.' })
  res.status(500).json({ error: 'Something went wrong on the server.' })
})

connectDB()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`API listening on http://localhost:${config.port}`)
      if (!config.isProd) console.log('React dev server: npm run dev (proxies /api here)')
    })
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message)
    process.exit(1)
  })
