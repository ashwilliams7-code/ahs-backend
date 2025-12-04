import express from 'express'
import { supabase } from '../index.js'

const router = express.Router()

// Demo compliance data
const DEMO_CERTIFICATIONS = [
  { name: 'Sarah Mitchell', initials: 'SM', color: 'blue', ndis: 'Valid', wwcc: 'Valid', firstAid: 'Valid', cpr: 'Valid', manual: 'Valid' },
  { name: 'Emily Roberts', initials: 'ER', color: 'green', ndis: 'Valid', wwcc: 'Valid', firstAid: 'Valid', cpr: 'Valid', manual: 'Valid' },
  { name: 'James Kim', initials: 'JK', color: 'purple', ndis: 'Valid', wwcc: 'Valid', firstAid: 'Expiring', cpr: 'Valid', manual: 'Valid' },
  { name: 'Mike Thompson', initials: 'MT', color: 'amber', ndis: 'Valid', wwcc: 'Valid', firstAid: 'Valid', cpr: 'Valid', manual: 'N/A' },
]

const DEMO_ALERTS = [
  { type: 'warning', title: 'First Aid Certificate Expiring', description: 'James Kim\'s certificate expires in 14 days' },
  { type: 'warning', title: 'Missing Service Agreement', description: 'Client: Jane Doe - Agreement not uploaded' },
]

// Get all compliance data
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('compliance')
      .select('*')

    if (error) throw error

    res.json({
      certifications: data && data.length > 0 ? data : DEMO_CERTIFICATIONS,
      alerts: DEMO_ALERTS,
      score: 94,
    })
  } catch (err) {
    console.log('Using demo compliance data:', err.message)
    res.json({
      certifications: DEMO_CERTIFICATIONS,
      alerts: DEMO_ALERTS,
      score: 94,
    })
  }
})

// Get compliance alerts
router.get('/alerts', (req, res) => {
  res.json(DEMO_ALERTS)
})

// Get compliance score
router.get('/score', (req, res) => {
  res.json({
    overall: 94,
    workerChecks: 100,
    documentation: 95,
    training: 85,
    incidentReports: 100,
  })
})

export default router

