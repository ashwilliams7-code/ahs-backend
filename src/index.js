import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

// Supabase client (shared)
import { supabase } from './lib/supabase.js'
export { supabase }

// Routes
import invoiceRoutes from './routes/invoices.js'
import workerRoutes from './routes/workers.js'
import activityRoutes from './routes/activity.js'
import dashboardRoutes from './routes/dashboard.js'
import complianceRoutes from './routes/compliance.js'
import applymateRoutes from './routes/applymate.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware - CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://app.autoaihub.io',
  'https://ahs-frontend.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean)

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc)
    if (!origin) return callback(null, true)
    
    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => origin.includes('autoaihub') || origin.includes('localhost') || origin.includes('vercel.app'))) {
      // Return the actual requesting origin, not a fixed value
      callback(null, origin)
    } else {
      console.log('CORS blocked origin:', origin)
      callback(null, origin) // Allow anyway for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}))
app.use(express.json())

// Auth middleware to extract user from token
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (!error && user) {
        req.user = user
      }
    } catch (err) {
      console.log('Auth error:', err.message)
    }
  }
  next()
})

// Routes
app.use('/api/invoices', invoiceRoutes)
app.use('/api/workers', workerRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/compliance', complianceRoutes)
app.use('/api/applymate', applymateRoutes)

// Admin email for demo data
const ADMIN_EMAIL = 'ash.williams7@icloud.com'
const isAdmin = (user) => user?.email === ADMIN_EMAIL

// Service breakdown endpoint
app.get('/api/service-breakdown', (req, res) => {
  // Admin sees demo data
  if (isAdmin(req.user)) {
    return res.json([
      { name: 'Personal Care', percentage: 45, color: 'primary' },
      { name: 'Community Access', percentage: 25, color: 'accent' },
      { name: 'Domestic Assistance', percentage: 18, color: 'blue' },
      { name: 'Transport', percentage: 12, color: 'purple' },
    ])
  }
  
  // New users see empty breakdown
  res.json([
    { name: 'Personal Care', percentage: 0, color: 'primary' },
    { name: 'Community Access', percentage: 0, color: 'accent' },
    { name: 'Domestic Assistance', percentage: 0, color: 'blue' },
    { name: 'Transport', percentage: 0, color: 'purple' },
  ])
})

// Top performers endpoint
app.get('/api/top-performers', (req, res) => {
  // Admin sees demo data
  if (isAdmin(req.user)) {
    return res.json([
      { name: 'Sarah Mitchell', initials: 'SM', color: 'blue', hours: 40, shifts: 8, earnings: 2702.40, trend: 12 },
      { name: 'Emily Roberts', initials: 'ER', color: 'green', hours: 38, shifts: 7, earnings: 2567.28, trend: 8 },
      { name: 'Angela Patel', initials: 'AP', color: 'pink', hours: 36, shifts: 6, earnings: 2432.16, trend: 5 },
      { name: 'Tom Nguyen', initials: 'TN', color: 'cyan', hours: 34, shifts: 6, earnings: 2297.04, trend: 0 },
      { name: 'Daniel Wilson', initials: 'DW', color: 'indigo', hours: 32, shifts: 5, earnings: 2161.92, trend: 0 },
    ])
  }
  
  // New users see empty list
  res.json([])
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(`🚀 AHS Backend running on http://localhost:${PORT}`)
})

