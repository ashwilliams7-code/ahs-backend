import express from 'express'
import { supabase } from '../index.js'

const router = express.Router()

// Admin email for demo data
const ADMIN_EMAIL = 'ash.williams7@icloud.com'
const isAdmin = (user) => user?.email === ADMIN_EMAIL

// Demo activity data for admin only
const DEMO_ACTIVITY = [
  { type: 'invoice', title: 'Invoice INV-20241128143022 generated', subtitle: 'For Sarah Mitchell • $540.48', time: '2m ago', icon: 'invoice' },
  { type: 'compliance', title: 'Compliance check completed', subtitle: 'All worker screenings verified', time: '15m ago', icon: 'check' },
  { type: 'roster', title: 'Shift assigned to Emily Roberts', subtitle: 'Tomorrow 8:00 AM - 4:00 PM', time: '32m ago', icon: 'calendar' },
  { type: 'alert', title: 'Certificate expiring soon', subtitle: 'James Kim - First Aid expires in 14 days', time: '1h ago', icon: 'warning' },
  { type: 'team', title: 'New worker onboarded', subtitle: 'Alex Santos joined the team', time: '3h ago', icon: 'user' },
  { type: 'invoice', title: 'Invoice INV-20241128112015 generated', subtitle: 'For Emily Roberts • $675.60', time: '4h ago', icon: 'invoice' },
  { type: 'roster', title: 'Open shift filled', subtitle: 'Mike Thompson accepted Saturday shift', time: '5h ago', icon: 'calendar' },
  { type: 'compliance', title: 'Document uploaded', subtitle: 'WWCC for Rachel Henderson verified', time: '6h ago', icon: 'check' },
]

// Get all activity
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id
    
    // Admin sees demo data
    if (isAdmin(req.user)) {
      return res.json(DEMO_ACTIVITY)
    }
    
    // Other users see their own activity
    if (!userId) {
      return res.json([])
    }
    
    const { data, error } = await supabase
      .from('activity')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    res.json(data || [])
  } catch (err) {
    console.log('Activity error:', err.message)
    res.json([])
  }
})

// Create activity
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activity')
      .insert({
        ...req.body,
        user_id: req.user?.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.status(201).json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create activity' })
  }
})

export default router

