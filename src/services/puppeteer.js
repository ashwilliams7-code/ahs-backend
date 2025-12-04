import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { OpenAIService } from './openai.js'

// Add stealth plugin
puppeteer.use(StealthPlugin())

/**
 * SeekBot - Puppeteer-based job automation for SEEK
 * Ported from Python Selenium version
 */
export class SeekBot {
  constructor(settings, callbacks = {}) {
    this.settings = settings
    this.browser = null
    this.page = null
    this.openai = null
    this.successfulSubmits = 0
    this.jobsFound = 0
    this.jobsSkipped = 0
    this.isRunning = false
    this.isPaused = false
    this.shouldStop = false
    
    // Callbacks for real-time updates
    this.onStatusUpdate = callbacks.onStatusUpdate || (() => {})
    this.onJobFound = callbacks.onJobFound || (() => {})
    this.onJobApplied = callbacks.onJobApplied || (() => {})
    this.onError = callbacks.onError || (() => {})
    this.onComplete = callbacks.onComplete || (() => {})
  }

  // Speed multipliers based on slider value (1-100)
  getScanMultiplier() {
    const speed = this.settings.scan_speed || 50
    if (speed >= 95) return 0.02
    if (speed >= 75) return 0.15
    if (speed >= 50) return 0.4
    if (speed >= 25) return 0.8
    return 1.5
  }

  getApplyMultiplier() {
    const speed = this.settings.apply_speed || 50
    if (speed >= 95) return 0.02
    if (speed >= 75) return 0.15
    if (speed >= 50) return 0.4
    if (speed >= 25) return 0.8
    return 1.5
  }

  async sleep(baseMs, mode = 'scan') {
    const multiplier = mode === 'scan' ? this.getScanMultiplier() : this.getApplyMultiplier()
    let delay = baseMs * multiplier
    
    // Minimum delays for stability
    const minDelay = mode === 'scan' ? 100 : 50
    delay = Math.max(delay, minDelay)
    
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  async cooldown() {
    const delay = this.settings.cooldown_delay || 5
    if (delay > 0) {
      this.onStatusUpdate({ message: `Cooldown: waiting ${delay}s...` })
      await new Promise(resolve => setTimeout(resolve, delay * 1000))
    }
  }

  // Stealth functions
  async stealthScroll() {
    if (!this.settings.stealth_mode) return
    
    try {
      const scrollAmount = Math.floor(Math.random() * 300) + 100
      await this.page.evaluate((amount) => {
        window.scrollBy(0, amount)
      }, scrollAmount)
      await this.sleep(300 + Math.random() * 500)
    } catch (e) {}
  }

  async stealthPause() {
    if (!this.settings.stealth_mode) return
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 2000))
  }

  async stealthReadingDelay() {
    if (!this.settings.stealth_mode) return
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 4000))
  }

  // Category detection for smart title matching
  detectCategory(titles) {
    const titlesNorm = titles.map(t => t.toLowerCase().trim())

    const govKeywords = ['el1', 'el 1', 'el2', 'el 2', 'ses', 'policy', 'governance', 'compliance', 'public sector', 'principal', 'advisor']
    if (titlesNorm.some(t => govKeywords.some(k => t.includes(k)))) return 'gov'

    const leadership = ['director', 'program director', 'operations director', 'head of', 'general manager', 'executive', 'principal', 'gm']
    if (titlesNorm.some(t => leadership.includes(t))) return 'leadership'

    const project = ['project manager', 'program manager', 'agile', 'scrum master', 'project lead', 'delivery manager']
    if (titlesNorm.some(t => project.includes(t))) return 'project'

    const sales = ['bdm', 'business development', 'sales', 'account manager', 'relationship manager', 'client', 'growth']
    if (titlesNorm.some(t => sales.includes(t))) return 'sales'

    const admin = ['admin', 'coordinator', 'ea', 'executive assistant']
    if (titlesNorm.some(t => admin.includes(t))) return 'admin'

    const it = ['it', 'developer', 'engineer', 'software', 'cyber', 'cloud', 'data']
    if (titlesNorm.some(t => it.includes(t))) return 'it'

    return 'generic'
  }

  // Smart title matching
  titleMatches(title) {
    const allowed = (this.settings.job_titles || []).map(t => t.toLowerCase().trim())
    const titleClean = title.toLowerCase().trim()

    // Direct match
    if (allowed.some(a => titleClean.includes(a))) return true

    // Reverse match
    const titleWords = titleClean.replace(/-/g, ' ').split(' ').filter(w => w.length > 3)
    if (titleWords.some(word => allowed.some(a => a.includes(word)))) return true

    // Category expansion
    const category = this.detectCategory(allowed)
    const expansions = {
      gov: ['el1', 'el 1', 'el2', 'el 2', 'ses', 'director', 'policy', 'principal', 'executive', 'governance', 'advisor', 'analyst', 'coordinator', 'officer', 'manager'],
      leadership: ['director', 'head', 'general manager', 'gm', 'executive', 'principal', 'lead', 'chief', 'senior', 'manager'],
      project: ['project', 'program', 'delivery', 'scrum', 'agile', 'lead', 'coordinator', 'manager', 'officer', 'analyst'],
      sales: ['bdm', 'business development', 'sales', 'account', 'partnership', 'growth', 'client', 'relationship', 'solutions', 'commercial'],
      admin: ['admin', 'coordinator', 'ea', 'executive assistant', 'office', 'project coordinator', 'officer', 'support'],
      it: ['developer', 'engineer', 'software', 'it', 'cloud', 'cyber', 'product', 'technical', 'devops', 'data', 'analyst']
    }

    const related = expansions[category] || []
    return related.some(r => titleClean.includes(r))
  }

  isCompanyBlocked(company) {
    const blocked = (this.settings.blocked_companies || []).map(c => c.toLowerCase().trim())
    return blocked.some(b => company.toLowerCase().includes(b))
  }

  isTitleBlocked(title) {
    const blocked = (this.settings.blocked_titles || []).map(t => t.toLowerCase().trim())
    return blocked.some(b => title.toLowerCase().includes(b))
  }

  buildSearchUrl(jobTitle, location) {
    const safeLocation = location.replace(', Australia', '').trim()
    const jobQuery = encodeURIComponent(jobTitle)
    const locQuery = encodeURIComponent(safeLocation)
    return `https://www.seek.com.au/jobs?keywords=${jobQuery}&where=${locQuery}&sortmode=ListedDate`
  }

  async init() {
    // Initialize OpenAI
    if (this.settings.openai_api_key) {
      this.openai = new OpenAIService(this.settings.openai_api_key)
    }

    // Launch browser
    this.browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-notifications',
        '--window-size=1920,1080'
      ]
    })

    this.page = await this.browser.newPage()
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 })
    
    // Set user agent
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    this.isRunning = true
    return true
  }

  async close() {
    this.isRunning = false
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }

  pause() {
    this.isPaused = true
    this.onStatusUpdate({ status: 'paused', message: 'Bot paused' })
  }

  resume() {
    this.isPaused = false
    this.onStatusUpdate({ status: 'running', message: 'Bot resumed' })
  }

  stop() {
    this.shouldStop = true
    this.onStatusUpdate({ status: 'stopping', message: 'Stopping bot...' })
  }

  async waitIfPaused() {
    while (this.isPaused && !this.shouldStop) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    return !this.shouldStop
  }

  async checkLoginStatus() {
    await this.page.goto('https://www.seek.com.au/', { waitUntil: 'networkidle2' })
    await this.sleep(3000, 'scan')
    
    // Check for sign in button
    const signInBtn = await this.page.$('a[href*="login"]')
    return !signInBtn
  }

  async getJobDescription() {
    const selectors = [
      '[data-automation="jobDescription"]',
      'div[data-automation*="jobAdDetails"]',
      'div[data-automation*="job"]'
    ]

    for (const sel of selectors) {
      try {
        const element = await this.page.$(sel)
        if (element) {
          const text = await element.evaluate(el => el.textContent)
          if (text && text.length > 50) return text.trim()
        }
      } catch (e) {}
    }
    return ''
  }

  async selectDocumentOptions() {
    try {
      const labels = await this.page.$$('label')
      
      for (const label of labels) {
        const text = await label.evaluate(el => el.textContent.toLowerCase())
        
        // Resume: Select saved
        if (text.includes('select a resum') || text.includes('select a résumé')) {
          await label.click()
          await this.sleep(300, 'apply')
          continue
        }
        
        // Cover letter: Write
        if (text.includes('write a cover letter')) {
          await label.click()
          await this.sleep(300, 'apply')
          continue
        }
        
        // Selection criteria: Write
        if (text.includes('write a statement')) {
          await label.click()
          await this.sleep(300, 'apply')
          continue
        }
      }
    } catch (e) {
      console.error('Document selection error:', e.message)
    }
  }

  async fillCoverLetter(jobTitle, company, description) {
    if (!this.openai) return

    const letter = await this.openai.generateCoverLetter({
      fullName: this.settings.full_name,
      location: this.settings.location,
      backgroundBio: this.settings.background_bio,
      jobTitle,
      company,
      description
    })

    if (!letter) return

    try {
      const textareas = await this.page.$$('textarea')
      
      for (const ta of textareas) {
        const name = await ta.evaluate(el => (el.getAttribute('name') || '').toLowerCase())
        const id = await ta.evaluate(el => (el.getAttribute('id') || '').toLowerCase())
        
        if (!name.includes('cover') && !id.includes('cover')) continue
        
        await ta.scrollIntoView()
        await this.sleep(500, 'apply')
        
        // Clear and fill
        await ta.click({ clickCount: 3 })
        await ta.type(letter)
        
        this.onStatusUpdate({ message: 'Cover letter added' })
        return
      }
    } catch (e) {
      console.error('Cover letter error:', e.message)
    }
  }

  async fillSelectionCriteria(jobTitle, company, description) {
    if (!this.openai) return

    const statement = await this.openai.generateSelectionCriteria({
      fullName: this.settings.full_name,
      location: this.settings.location,
      backgroundBio: this.settings.background_bio,
      jobTitle,
      company,
      description
    })

    if (!statement) return

    try {
      const textareas = await this.page.$$('textarea')
      
      for (const ta of textareas) {
        const placeholder = await ta.evaluate(el => (el.getAttribute('placeholder') || '').toLowerCase())
        const name = await ta.evaluate(el => (el.getAttribute('name') || '').toLowerCase())
        const aria = await ta.evaluate(el => (el.getAttribute('aria-label') || '').toLowerCase())
        
        // Skip cover letter
        if (name.includes('cover') || placeholder.includes('cover') || aria.includes('cover')) continue
        
        // Look for selection criteria
        if (placeholder.includes('selection') || placeholder.includes('criteria') || 
            placeholder.includes('statement') || name.includes('statement') ||
            aria.includes('selection') || aria.includes('criteria')) {
          
          await ta.scrollIntoView()
          await this.sleep(500, 'apply')
          await ta.click({ clickCount: 3 })
          await ta.type(statement)
          
          this.onStatusUpdate({ message: 'Selection criteria added' })
          return
        }
      }
    } catch (e) {
      console.error('Selection criteria error:', e.message)
    }
  }

  async answerScreeningQuestions(jobTitle, company, description) {
    if (!this.openai) return

    try {
      const textareas = await this.page.$$('textarea')
      
      for (const ta of textareas) {
        const placeholder = await ta.evaluate(el => (el.getAttribute('placeholder') || '').toLowerCase())
        const name = await ta.evaluate(el => (el.getAttribute('name') || '').toLowerCase())
        const id = await ta.evaluate(el => (el.getAttribute('id') || '').toLowerCase())
        
        // Skip cover letter and large fields
        if (name.includes('cover') || placeholder.includes('cover') || id.includes('cover')) continue
        
        const height = await ta.evaluate(el => el.offsetHeight)
        if (height > 200) continue
        
        // Get the question label
        let labelText = ''
        try {
          labelText = await ta.evaluate(el => {
            const label = el.closest('div')?.querySelector('label')
            return label ? label.textContent.trim() : ''
          })
        } catch (e) {}
        
        if (labelText.length < 5) continue
        
        // Check if already answered
        const value = await ta.evaluate(el => el.value)
        if (value && value.length > 10) continue
        
        // Get GPT answer
        const answer = await this.openai.answerScreeningQuestion({
          fullName: this.settings.full_name,
          location: this.settings.location,
          backgroundBio: this.settings.background_bio,
          jobTitle,
          company,
          question: labelText
        })
        
        if (answer) {
          await ta.scrollIntoView()
          await this.sleep(500, 'apply')
          await ta.click({ clickCount: 3 })
          await ta.type(answer)
          this.onStatusUpdate({ message: `Answered: ${labelText.substring(0, 30)}...` })
        }
      }
    } catch (e) {
      console.error('Screening questions error:', e.message)
    }
  }

  async answerRadioButtons() {
    try {
      const radios = await this.page.$$('input[type="radio"]')
      
      // Group by name
      const groups = {}
      for (const radio of radios) {
        const name = await radio.evaluate(el => el.getAttribute('name'))
        if (name) {
          if (!groups[name]) groups[name] = []
          groups[name].push(radio)
        }
      }
      
      for (const [name, group] of Object.entries(groups)) {
        try {
          // Get question text
          let questionText = ''
          try {
            questionText = await group[0].evaluate(el => {
              const fieldset = el.closest('fieldset')
              const legend = fieldset?.querySelector('legend')
              return legend ? legend.textContent.toLowerCase() : ''
            })
          } catch (e) {}
          
          // Get options
          const options = []
          for (const r of group) {
            const label = await r.evaluate(el => {
              const next = el.nextElementSibling
              return next ? next.textContent.toLowerCase().trim() : ''
            })
            options.push({ element: r, label })
          }
          
          // Apply rules
          // Yes/No questions
          if (['do you', 'have you', 'can you', 'did you', 'were you'].some(p => questionText.includes(p))) {
            const yesOption = options.find(o => o.label.includes('yes'))
            if (yesOption) {
              await yesOption.element.click()
              await this.sleep(200, 'apply')
              continue
            }
          }
          
          // Experience - pick highest
          if (questionText.includes('experience')) {
            await options[options.length - 1].element.click()
            await this.sleep(200, 'apply')
            continue
          }
          
          // Work eligibility
          if (['eligibility', 'right to work', 'visa', 'citizen'].some(k => questionText.includes(k))) {
            const citizenOption = options.find(o => 
              ['australian', 'citizen', 'permanent resident', 'pr'].some(k => o.label.includes(k))
            )
            if (citizenOption) {
              await citizenOption.element.click()
              await this.sleep(200, 'apply')
              continue
            }
          }
          
          // Default - pick first non-negative option
          for (const opt of options) {
            if (!['no', 'none', 'visa', 'sponsor'].some(neg => opt.label.includes(neg))) {
              await opt.element.click()
              await this.sleep(200, 'apply')
              break
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error('Radio buttons error:', e.message)
    }
  }

  async answerDropdowns() {
    try {
      const selects = await this.page.$$('select')
      
      for (const select of selects) {
        await select.scrollIntoView()
        await this.sleep(300, 'apply')
        
        const options = await select.$$('option')
        if (options.length < 2) continue
        
        // Get label
        let labelText = ''
        try {
          labelText = await select.evaluate(el => {
            const label = el.closest('div')?.querySelector('label')
            return label ? label.textContent.toLowerCase() : ''
          })
        } catch (e) {}
        
        // Salary expectations
        if (['salary', 'pay', 'remuneration', 'expectation'].some(k => labelText.includes(k))) {
          const targetSalary = this.settings.expected_salary || 100000
          let bestOption = null
          let bestDiff = Infinity
          
          for (const opt of options) {
            const text = await opt.evaluate(el => el.textContent)
            const numbers = text.match(/\d+/g)
            if (numbers) {
              let salary = parseInt(numbers[0])
              if (text.toLowerCase().includes('k')) salary *= 1000
              else if (salary < 1000) salary *= 1000
              
              const diff = Math.abs(salary - targetSalary)
              if (diff < bestDiff) {
                bestDiff = diff
                bestOption = opt
              }
            }
          }
          
          if (bestOption) {
            const value = await bestOption.evaluate(el => el.value)
            await select.select(value)
            continue
          }
        }
        
        // Default - pick last option (usually highest/most experienced)
        const lastOption = options[options.length - 1]
        const value = await lastOption.evaluate(el => el.value)
        await select.select(value)
        await this.sleep(200, 'apply')
      }
    } catch (e) {
      console.error('Dropdowns error:', e.message)
    }
  }

  async clickApplyButton() {
    const selectors = [
      "button:has-text('Quick apply')",
      "button:has-text('Quick Apply')",
      '[data-automation="quickApplyButton"]',
      "button:has-text('Apply now')",
      "button:has-text('Apply')"
    ]
    
    for (const sel of selectors) {
      try {
        const btn = await this.page.$(sel)
        if (btn) {
          const isVisible = await btn.isIntersectingViewport()
          if (isVisible) {
            await btn.scrollIntoView()
            await this.sleep(1000, 'scan')
            await this.stealthPause()
            await btn.click()
            return true
          }
        }
      } catch (e) {}
    }
    
    // Try XPath as fallback
    try {
      const [btn] = await this.page.$x("//button[contains(., 'Quick apply') or contains(., 'Apply')]")
      if (btn) {
        await btn.click()
        return true
      }
    } catch (e) {}
    
    return false
  }

  async clickContinue() {
    try {
      const [btn] = await this.page.$x("//button[contains(., 'Continue') or contains(., 'Next')]")
      if (btn) {
        await btn.click()
        return true
      }
    } catch (e) {}
    return false
  }

  async clickSubmit() {
    try {
      const [btn] = await this.page.$x("//button[contains(., 'Submit application')]")
      if (btn) {
        await btn.click()
        return true
      }
    } catch (e) {}
    return false
  }

  async applyToJob(jobTitle, company, jobUrl) {
    await this.sleep(2000, 'scan')
    await this.stealthScroll()
    await this.stealthPause()

    // Check for external site
    try {
      const external = await this.page.$x("//button[contains(., 'company site') or contains(., 'Apply on company')]")
      if (external.length > 0) {
        this.onStatusUpdate({ message: `Skipping external: ${jobTitle}` })
        return false
      }
    } catch (e) {}

    await this.page.evaluate(() => window.scrollTo(0, 300))
    await this.sleep(1000, 'scan')
    await this.stealthReadingDelay()

    // Click apply button
    const clicked = await this.clickApplyButton()
    if (!clicked) {
      this.onStatusUpdate({ message: `No apply button: ${jobTitle}` })
      return false
    }

    await this.sleep(3000, 'apply')
    await this.stealthPause()

    const description = await this.getJobDescription()

    // Page 1 - Document selection + GPT content
    await this.selectDocumentOptions()
    await this.fillCoverLetter(jobTitle, company, description)
    await this.fillSelectionCriteria(jobTitle, company, description)
    await this.answerScreeningQuestions(jobTitle, company, description)

    const continued = await this.clickContinue()
    if (!continued) {
      this.onStatusUpdate({ message: `Cannot continue: ${jobTitle}` })
      return false
    }
    await this.sleep(3000, 'apply')

    // Pages 2+ - Full automation
    for (let attempt = 0; attempt < 6; attempt++) {
      await this.answerScreeningQuestions(jobTitle, company, description)
      await this.answerRadioButtons()
      await this.answerDropdowns()
      
      const next = await this.clickContinue()
      if (!next) break
      await this.sleep(2000, 'apply')
    }

    // Final submit
    const submitted = await this.clickSubmit()
    if (submitted) {
      await this.sleep(2000, 'apply')
      this.successfulSubmits++
      this.onJobApplied({
        jobTitle,
        company,
        jobUrl,
        timestamp: new Date().toISOString()
      })
      return true
    }

    return false
  }

  async run() {
    if (!this.isRunning) {
      await this.init()
    }

    const jobTitles = this.settings.job_titles || []
    const location = this.settings.location || 'Brisbane, Australia'
    const maxJobs = this.settings.max_jobs || 100

    this.onStatusUpdate({ status: 'running', message: 'Starting job search...' })

    for (const searchTitle of jobTitles) {
      if (this.shouldStop || this.successfulSubmits >= maxJobs) break
      
      if (!await this.waitIfPaused()) break

      this.onStatusUpdate({ message: `Searching: ${searchTitle}` })
      
      const searchUrl = this.buildSearchUrl(searchTitle, location)
      await this.page.goto(searchUrl, { waitUntil: 'networkidle2' })
      await this.sleep(3000, 'scan')

      let page = 1
      
      while (this.successfulSubmits < maxJobs && !this.shouldStop) {
        if (!await this.waitIfPaused()) break
        
        this.onStatusUpdate({ message: `Page ${page} - ${searchTitle}` })
        
        // Get job cards
        const cards = await this.page.$$('article[data-automation="normalJob"], article')
        if (cards.length === 0) {
          this.onStatusUpdate({ message: 'No more jobs found' })
          break
        }
        
        this.jobsFound += cards.length
        
        for (let i = 0; i < cards.length; i++) {
          if (this.shouldStop || this.successfulSubmits >= maxJobs) break
          if (!await this.waitIfPaused()) break

          try {
            // Re-query cards after each job (DOM may have changed)
            const currentCards = await this.page.$$('article[data-automation="normalJob"], article')
            if (i >= currentCards.length) break
            
            const card = currentCards[i]
            
            // Get job info
            let title = 'Unknown'
            let company = 'Unknown'
            
            try {
              const titleEl = await card.$('[data-automation="jobTitle"]')
              if (titleEl) title = await titleEl.evaluate(el => el.textContent)
            } catch (e) {}
            
            try {
              const companyEl = await card.$('[data-automation="jobCompany"]')
              if (companyEl) company = await companyEl.evaluate(el => el.textContent)
            } catch (e) {}
            
            // Apply filters
            if (!this.titleMatches(title)) {
              this.jobsSkipped++
              continue
            }
            
            if (this.isTitleBlocked(title)) {
              this.onStatusUpdate({ message: `Blocked title: ${title}` })
              this.jobsSkipped++
              continue
            }
            
            if (this.isCompanyBlocked(company)) {
              this.onStatusUpdate({ message: `Blocked company: ${company}` })
              this.jobsSkipped++
              continue
            }
            
            this.onJobFound({ title, company })
            this.onStatusUpdate({ message: `Applying: ${title} at ${company}` })
            
            // Open job in new tab
            const link = await card.$('a[data-automation="jobTitle"]')
            if (!link) continue
            
            const href = await link.evaluate(el => el.href)
            
            // Open new tab
            const newPage = await this.browser.newPage()
            await newPage.goto(href, { waitUntil: 'networkidle2' })
            
            // Switch to new page
            const oldPage = this.page
            this.page = newPage
            
            await this.stealthScroll()
            
            // Try to apply
            const success = await this.applyToJob(title, company, href)
            
            // Close tab and switch back
            await newPage.close()
            this.page = oldPage
            
            if (success) {
              this.onStatusUpdate({ 
                message: `✓ Applied: ${title}`,
                jobsApplied: this.successfulSubmits
              })
            }
            
            // Cooldown between jobs
            await this.cooldown()
            
          } catch (e) {
            console.error('Job processing error:', e.message)
            this.onError({ message: e.message })
          }
        }
        
        // Try next page
        try {
          const [nextBtn] = await this.page.$x("//a[@aria-label='Next'] | //a[contains(text(), 'Next')]")
          if (nextBtn) {
            await nextBtn.click()
            await this.sleep(3000, 'scan')
            page++
          } else {
            break
          }
        } catch (e) {
          break
        }
      }
    }

    this.onComplete({
      successfulSubmits: this.successfulSubmits,
      jobsFound: this.jobsFound,
      jobsSkipped: this.jobsSkipped
    })

    this.onStatusUpdate({ 
      status: 'completed',
      message: `Completed! Applied to ${this.successfulSubmits} jobs`
    })

    await this.close()
  }
}

export default SeekBot

