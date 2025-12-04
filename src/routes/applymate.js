import express from 'express'
import { supabase } from '../lib/supabase.js'
import { SeekBot } from '../services/puppeteer.js'

const router = express.Router()

// Store active bot sessions
const activeSessions = new Map()

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ============================================
// SETTINGS
// ============================================

// GET /api/applymate/settings - Get user settings
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applymate_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    // Return default settings if none exist
    if (!data) {
      return res.json({
        full_name: '',
        location: 'Brisbane, Australia',
        background_bio: '',
        seek_email: '',
        expected_salary: 100000,
        job_titles: ['project manager', 'program manager'],
        blocked_companies: [],
        blocked_titles: ['sales', 'customer service'],
        scan_speed: 50,
        apply_speed: 50,
        cooldown_delay: 5,
        stealth_mode: false,
        max_jobs: 100,
        openai_api_key: ''
      })
    }

    res.json(data)
  } catch (error) {
    console.error('Get settings error:', error)
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

// PUT /api/applymate/settings - Save user settings
router.put('/settings', requireAuth, async (req, res) => {
  try {
    const settings = {
      user_id: req.user.id,
      full_name: req.body.full_name,
      location: req.body.location,
      background_bio: req.body.background_bio,
      seek_email: req.body.seek_email,
      expected_salary: req.body.expected_salary,
      job_titles: req.body.job_titles,
      blocked_companies: req.body.blocked_companies,
      blocked_titles: req.body.blocked_titles,
      scan_speed: req.body.scan_speed,
      apply_speed: req.body.apply_speed,
      cooldown_delay: req.body.cooldown_delay,
      stealth_mode: req.body.stealth_mode,
      max_jobs: req.body.max_jobs,
      openai_api_key: req.body.openai_api_key,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('applymate_settings')
      .upsert(settings, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error

    res.json(data)
  } catch (error) {
    console.error('Save settings error:', error)
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

// ============================================
// SESSION CONTROL
// ============================================

// GET /api/applymate/session - Get current session status
router.get('/session', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applymate_sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (!data) {
      return res.json({
        status: 'idle',
        jobs_found: 0,
        jobs_applied: 0,
        jobs_skipped: 0,
        current_job: null,
        current_company: null
      })
    }

    res.json(data)
  } catch (error) {
    console.error('Get session error:', error)
    res.status(500).json({ error: 'Failed to get session' })
  }
})

// POST /api/applymate/start - Start automation
router.post('/start', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id

    // Check if already running
    if (activeSessions.has(userId)) {
      return res.status(400).json({ error: 'Session already running' })
    }

    // Get user settings
    const { data: settings, error: settingsError } = await supabase
      .from('applymate_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (settingsError || !settings) {
      return res.status(400).json({ error: 'Please configure settings first' })
    }

    if (!settings.openai_api_key) {
      return res.status(400).json({ error: 'Please add your OpenAI API key in settings' })
    }

    // Create/update session record
    await supabase
      .from('applymate_sessions')
      .upsert({
        user_id: userId,
        status: 'running',
        jobs_found: 0,
        jobs_applied: 0,
        jobs_skipped: 0,
        current_job: null,
        current_company: null,
        error_message: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    // Create bot with callbacks
    const bot = new SeekBot(settings, {
      onStatusUpdate: async (data) => {
        try {
          await supabase
            .from('applymate_sessions')
            .update({
              status: data.status || 'running',
              current_job: data.currentJob,
              current_company: data.currentCompany,
              jobs_applied: data.jobsApplied,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
        } catch (e) {}
      },
      onJobFound: async (data) => {
        try {
          await supabase
            .from('applymate_sessions')
            .update({
              current_job: data.title,
              current_company: data.company,
              jobs_found: supabase.sql`jobs_found + 1`,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
        } catch (e) {}
      },
      onJobApplied: async (data) => {
        try {
          // Log to applications table
          await supabase
            .from('applymate_applications')
            .insert({
              user_id: userId,
              job_title: data.jobTitle,
              company: data.company,
              job_url: data.jobUrl,
              status: 'submitted',
              applied_at: data.timestamp
            })

          // Update session
          await supabase
            .from('applymate_sessions')
            .update({
              jobs_applied: supabase.sql`jobs_applied + 1`,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
        } catch (e) {}
      },
      onError: async (data) => {
        try {
          await supabase
            .from('applymate_sessions')
            .update({
              error_message: data.message,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
        } catch (e) {}
      },
      onComplete: async (data) => {
        try {
          await supabase
            .from('applymate_sessions')
            .update({
              status: 'completed',
              jobs_found: data.jobsFound,
              jobs_applied: data.successfulSubmits,
              jobs_skipped: data.jobsSkipped,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
        } catch (e) {}
        
        activeSessions.delete(userId)
      }
    })

    // Store session
    activeSessions.set(userId, bot)

    // Start bot (async, don't await)
    bot.run().catch(async (error) => {
      console.error('Bot error:', error)
      await supabase
        .from('applymate_sessions')
        .update({
          status: 'error',
          error_message: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
      
      activeSessions.delete(userId)
    })

    res.json({ success: true, message: 'Automation started' })
  } catch (error) {
    console.error('Start error:', error)
    res.status(500).json({ error: 'Failed to start automation' })
  }
})

// POST /api/applymate/pause - Pause automation
router.post('/pause', requireAuth, async (req, res) => {
  try {
    const bot = activeSessions.get(req.user.id)
    if (!bot) {
      return res.status(400).json({ error: 'No active session' })
    }

    bot.pause()

    await supabase
      .from('applymate_sessions')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', req.user.id)

    res.json({ success: true, message: 'Automation paused' })
  } catch (error) {
    console.error('Pause error:', error)
    res.status(500).json({ error: 'Failed to pause automation' })
  }
})

// POST /api/applymate/resume - Resume automation
router.post('/resume', requireAuth, async (req, res) => {
  try {
    const bot = activeSessions.get(req.user.id)
    if (!bot) {
      return res.status(400).json({ error: 'No active session' })
    }

    bot.resume()

    await supabase
      .from('applymate_sessions')
      .update({
        status: 'running',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', req.user.id)

    res.json({ success: true, message: 'Automation resumed' })
  } catch (error) {
    console.error('Resume error:', error)
    res.status(500).json({ error: 'Failed to resume automation' })
  }
})

// POST /api/applymate/stop - Stop automation
router.post('/stop', requireAuth, async (req, res) => {
  try {
    const bot = activeSessions.get(req.user.id)
    if (bot) {
      bot.stop()
      await bot.close()
      activeSessions.delete(req.user.id)
    }

    await supabase
      .from('applymate_sessions')
      .update({
        status: 'stopped',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', req.user.id)

    res.json({ success: true, message: 'Automation stopped' })
  } catch (error) {
    console.error('Stop error:', error)
    res.status(500).json({ error: 'Failed to stop automation' })
  }
})

// ============================================
// APPLICATIONS HISTORY
// ============================================

// GET /api/applymate/applications - Get application history
router.get('/applications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applymate_applications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('applied_at', { ascending: false })
      .limit(100)

    if (error) throw error

    res.json(data || [])
  } catch (error) {
    console.error('Get applications error:', error)
    res.status(500).json({ error: 'Failed to get applications' })
  }
})

// PUT /api/applymate/applications/:id - Update application status
router.put('/applications/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applymate_applications')
      .update({
        status: req.body.status,
        notes: req.body.notes
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single()

    if (error) throw error

    res.json(data)
  } catch (error) {
    console.error('Update application error:', error)
    res.status(500).json({ error: 'Failed to update application' })
  }
})

// DELETE /api/applymate/applications/:id - Delete application
router.delete('/applications/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('applymate_applications')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)

    if (error) throw error

    res.json({ success: true })
  } catch (error) {
    console.error('Delete application error:', error)
    res.status(500).json({ error: 'Failed to delete application' })
  }
})

// ============================================
// STATS
// ============================================

// GET /api/applymate/stats - Get user stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    // Get total applications
    const { count: totalApps } = await supabase
      .from('applymate_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)

    // Get applications by status
    const { data: byStatus } = await supabase
      .from('applymate_applications')
      .select('status')
      .eq('user_id', req.user.id)

    const statusCounts = byStatus?.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1
      return acc
    }, {}) || {}

    // Get applications this week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    
    const { count: thisWeek } = await supabase
      .from('applymate_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .gte('applied_at', weekAgo.toISOString())

    // Get applications today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const { count: todayCount } = await supabase
      .from('applymate_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .gte('applied_at', today.toISOString())

    res.json({
      total: totalApps || 0,
      thisWeek: thisWeek || 0,
      today: todayCount || 0,
      byStatus: {
        submitted: statusCounts.submitted || 0,
        viewed: statusCounts.viewed || 0,
        interview: statusCounts.interview || 0,
        rejected: statusCounts.rejected || 0,
        offer: statusCounts.offer || 0
      }
    })
  } catch (error) {
    console.error('Get stats error:', error)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

export default router

