import express from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../index.js'

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

// Demo invoices for fallback
const DEMO_INVOICES = [
  { invoice_number: 'INV-20241128143022', worker_name: 'Sarah Mitchell', client_name: 'Jane Doe', total_amount: 540.48, created_at: '2024-11-28' },
  { invoice_number: 'INV-20241128112015', worker_name: 'Emily Roberts', client_name: 'Mark Wilson', total_amount: 675.60, created_at: '2024-11-28' },
  { invoice_number: 'INV-20241127163042', worker_name: 'James Kim', client_name: 'Lisa Chen', total_amount: 405.36, created_at: '2024-11-27' },
  { invoice_number: 'INV-20241127091122', worker_name: 'Mike Thompson', client_name: 'Jane Doe', total_amount: 810.72, created_at: '2024-11-27' },
  { invoice_number: 'INV-20241126154533', worker_name: 'Angela Patel', client_name: 'Tom Brown', total_amount: 472.92, created_at: '2024-11-26' },
]

// Get all invoices
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    res.json({ invoices: data || [] })
  } catch (err) {
    console.log('Using demo invoices:', err.message)
    res.json({ invoices: [] })
  }
})

// Get invoice by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_number', req.params.id)
      .single()

    if (error) throw error
    if (!data) {
      return res.status(404).json({ error: 'Invoice not found' })
    }

    res.json(data)
  } catch (err) {
    res.status(404).json({ error: 'Invoice not found' })
  }
})

// Download invoice PDF (mock)
router.get('/:id/download', async (req, res) => {
  try {
    // In production, this would generate or fetch the actual PDF
    // For now, return a simple text response
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=${req.params.id}.pdf`)
    res.send('PDF content would go here')
  } catch (err) {
    res.status(500).json({ error: 'Failed to download invoice' })
  }
})

// Process timesheet and create invoice
router.post('/process-timesheet', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Generate invoice number
    const timestamp = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14)
    const invoiceNumber = `INV-${timestamp}`

    // Mock OCR processing - in production this would use actual OCR
    const mockLineItems = [
      { date: '2024-11-28', hours: 4, rate: 67.56, line_total: 270.24 },
      { date: '2024-11-28', hours: 4, rate: 67.56, line_total: 270.24 },
    ]

    const totalHours = mockLineItems.reduce((sum, item) => sum + item.hours, 0)
    const totalAmount = mockLineItems.reduce((sum, item) => sum + item.line_total, 0)

    // Save to database
    const invoiceData = {
      id: uuidv4(),
      invoice_number: invoiceNumber,
      worker_name: 'Demo Worker',
      client_name: 'Demo Client',
      total_hours: totalHours,
      total_amount: totalAmount,
      line_items: mockLineItems,
      status: 'generated',
      user_id: req.user?.id,
      created_at: new Date().toISOString(),
    }

    try {
      const { error } = await supabase
        .from('invoices')
        .insert(invoiceData)
      
      if (error) console.log('DB insert error:', error.message)
    } catch (dbErr) {
      console.log('Database not configured:', dbErr.message)
    }

    res.json({
      invoice_number: invoiceNumber,
      total_hours: totalHours,
      total_amount: totalAmount,
      line_items: mockLineItems,
      status: 'success',
      message: 'Invoice generated successfully',
    })
  } catch (err) {
    console.error('Process error:', err)
    res.status(500).json({ error: 'Failed to process timesheet' })
  }
})

export default router

