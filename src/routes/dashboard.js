import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

// Admin email - only this account sees demo data
const ADMIN_EMAIL = 'ash.williams7@icloud.com'

// Demo stats for admin only
const DEMO_STATS = {
  invoicesGenerated: 156,
  totalRevenue: 48752.64,
  hoursProcessed: 722,
  complianceScore: 94,
  activeWorkers: 12,
  openShifts: 2,
  shiftsThisWeek: 48,
}

// Empty stats for new users
const EMPTY_STATS = {
  invoicesGenerated: 0,
  totalRevenue: 0,
  hoursProcessed: 0,
  complianceScore: 100,
  activeWorkers: 0,
  openShifts: 0,
  shiftsThisWeek: 0,
}

// Check if user is admin
const isAdmin = (user) => user?.email === ADMIN_EMAIL

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.id
    const userEmail = req.user?.email
    
    // If admin, show demo stats
    if (isAdmin(req.user)) {
      return res.json(DEMO_STATS)
    }
    
    // For other users, get their real data
    if (!userId) {
      return res.json(EMPTY_STATS)
    }
    
    const [invoicesResult, workersResult] = await Promise.all([
      supabase.from('invoices').select('total_amount, total_hours', { count: 'exact' }).eq('user_id', userId),
      supabase.from('workers').select('*', { count: 'exact' }).eq('user_id', userId),
    ])

    const invoices = invoicesResult.data || []
    const workers = workersResult.data || []

    const stats = {
      invoicesGenerated: invoicesResult.count || 0,
      totalRevenue: invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
      hoursProcessed: invoices.reduce((sum, inv) => sum + (inv.total_hours || 0), 0),
      complianceScore: 100, // New users start at 100%
      activeWorkers: workersResult.count || 0,
      openShifts: 0,
      shiftsThisWeek: 0,
    }

    res.json(stats)
  } catch (err) {
    console.log('Stats error:', err.message)
    res.json(EMPTY_STATS)
  }
})

// Get weekly revenue
router.get('/weekly-revenue', (req, res) => {
  // Admin sees demo data
  if (isAdmin(req.user)) {
    return res.json([
      { day: 'Mon', amount: 1842.50, target: 2000 },
      { day: 'Tue', amount: 2156.80, target: 2000 },
      { day: 'Wed', amount: 1523.40, target: 2000 },
      { day: 'Thu', amount: 2845.60, target: 2000 },
      { day: 'Fri', amount: 2234.20, target: 2000 },
      { day: 'Sat', amount: 1156.30, target: 1500 },
      { day: 'Sun', amount: 698.00, target: 1000 },
    ])
  }
  
  // Other users see empty/zero data
  res.json([
    { day: 'Mon', amount: 0, target: 2000 },
    { day: 'Tue', amount: 0, target: 2000 },
    { day: 'Wed', amount: 0, target: 2000 },
    { day: 'Thu', amount: 0, target: 2000 },
    { day: 'Fri', amount: 0, target: 2000 },
    { day: 'Sat', amount: 0, target: 1500 },
    { day: 'Sun', amount: 0, target: 1000 },
  ])
})

// Get monthly trend
router.get('/monthly-trend', (req, res) => {
  // Admin sees demo data
  if (isAdmin(req.user)) {
    return res.json([
      { month: 'Jun', amount: 32450 },
      { month: 'Jul', amount: 38200 },
      { month: 'Aug', amount: 35800 },
      { month: 'Sep', amount: 42100 },
      { month: 'Oct', amount: 45600 },
      { month: 'Nov', amount: 48752 },
    ])
  }
  
  // Other users see empty data
  res.json([
    { month: 'Jun', amount: 0 },
    { month: 'Jul', amount: 0 },
    { month: 'Aug', amount: 0 },
    { month: 'Sep', amount: 0 },
    { month: 'Oct', amount: 0 },
    { month: 'Nov', amount: 0 },
  ])
})

export default router

