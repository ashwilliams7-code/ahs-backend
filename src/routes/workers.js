import express from 'express'
import { supabase } from '../index.js'

const router = express.Router()

// Demo workers data
const DEMO_WORKERS = [
  { id: 1, name: 'Sarah Mitchell', initials: 'SM', color: 'blue', role: 'Support Worker • Full-time', status: 'Available', hours: 32 },
  { id: 2, name: 'Emily Roberts', initials: 'ER', color: 'green', role: 'Support Worker • Full-time', status: 'Available', hours: 40 },
  { id: 3, name: 'James Kim', initials: 'JK', color: 'purple', role: 'Support Worker • Part-time', status: 'On Leave', hours: 24 },
  { id: 4, name: 'Mike Thompson', initials: 'MT', color: 'amber', role: 'Support Worker • Casual', status: 'Available', hours: 16 },
  { id: 5, name: 'Angela Patel', initials: 'AP', color: 'pink', role: 'Senior Support Worker • Full-time', status: 'Available', hours: 38 },
  { id: 6, name: 'Tom Nguyen', initials: 'TN', color: 'cyan', role: 'Support Worker • Full-time', status: 'On Shift', hours: 36 },
  { id: 7, name: 'Rachel Henderson', initials: 'RH', color: 'rose', role: 'Support Worker • Part-time', status: 'Available', hours: 20 },
  { id: 8, name: 'Daniel Wilson', initials: 'DW', color: 'indigo', role: 'Support Coordinator • Full-time', status: 'Available', hours: 40 },
  { id: 9, name: 'Karen Lee', initials: 'KL', color: 'teal', role: 'Support Worker • Casual', status: 'Unavailable', hours: 0 },
  { id: 10, name: 'Ben Jackson', initials: 'BJ', color: 'orange', role: 'Support Worker • Full-time', status: 'Sick Leave', hours: 0 },
  { id: 11, name: 'Sophie O\'Brien', initials: 'SO', color: 'violet', role: 'Support Worker • Part-time', status: 'Available', hours: 24 },
  { id: 12, name: 'Alex Santos', initials: 'AS', color: 'lime', role: 'Support Worker • Casual', status: 'Available', hours: 12 },
]

// Get all workers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('name')

    if (error) throw error

    res.json(data && data.length > 0 ? data : DEMO_WORKERS)
  } catch (err) {
    console.log('Using demo workers:', err.message)
    res.json(DEMO_WORKERS)
  }
})

// Get worker by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    if (!data) {
      const demoWorker = DEMO_WORKERS.find(w => w.id === parseInt(req.params.id))
      if (demoWorker) return res.json(demoWorker)
      return res.status(404).json({ error: 'Worker not found' })
    }

    res.json(data)
  } catch (err) {
    const demoWorker = DEMO_WORKERS.find(w => w.id === parseInt(req.params.id))
    if (demoWorker) return res.json(demoWorker)
    res.status(404).json({ error: 'Worker not found' })
  }
})

// Create worker
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .insert(req.body)
      .select()
      .single()

    if (error) throw error

    res.status(201).json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create worker' })
  }
})

// Update worker
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update worker' })
  }
})

export default router

