import express from 'express'
import { supabase } from '../index.js'

const router = express.Router()

// Demo stats
const DEMO_STATS = {
  invoicesGenerated: 156,
  totalRevenue: 48752.64,
  hoursProcessed: 722,
  complianceScore: 94,
  activeWorkers: 12,
  openShifts: 2,
  shiftsThisWeek: 48,
}

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    // Try to get real data from Supabase
    const [invoicesResult, workersResult] = await Promise.all([
      supabase.from('invoices').select('total_amount, total_hours', { count: 'exact' }),
      supabase.from('workers').select('*', { count: 'exact' }),
    ])

    const invoices = invoicesResult.data || []
    const workers = workersResult.data || []

    const stats = {
      invoicesGenerated: (invoicesResult.count || 0) + DEMO_STATS.invoicesGenerated,
      totalRevenue: invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) + DEMO_STATS.totalRevenue,
      hoursProcessed: invoices.reduce((sum, inv) => sum + (inv.total_hours || 0), 0) + DEMO_STATS.hoursProcessed,
      complianceScore: DEMO_STATS.complianceScore,
      activeWorkers: (workersResult.count || 0) || DEMO_STATS.activeWorkers,
      openShifts: DEMO_STATS.openShifts,
      shiftsThisWeek: DEMO_STATS.shiftsThisWeek,
    }

    res.json(stats)
  } catch (err) {
    console.log('Using demo stats:', err.message)
    res.json(DEMO_STATS)
  }
})

// Get weekly revenue
router.get('/weekly-revenue', (req, res) => {
  res.json([
    { day: 'Mon', amount: 1842.50, target: 2000 },
    { day: 'Tue', amount: 2156.80, target: 2000 },
    { day: 'Wed', amount: 1523.40, target: 2000 },
    { day: 'Thu', amount: 2845.60, target: 2000 },
    { day: 'Fri', amount: 2234.20, target: 2000 },
    { day: 'Sat', amount: 1156.30, target: 1500 },
    { day: 'Sun', amount: 698.00, target: 1000 },
  ])
})

// Get monthly trend
router.get('/monthly-trend', (req, res) => {
  res.json([
    { month: 'Jun', amount: 32450 },
    { month: 'Jul', amount: 38200 },
    { month: 'Aug', amount: 35800 },
    { month: 'Sep', amount: 42100 },
    { month: 'Oct', amount: 45600 },
    { month: 'Nov', amount: 48752 },
  ])
})

export default router

