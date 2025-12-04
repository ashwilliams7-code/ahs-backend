import OpenAI from 'openai'

/**
 * OpenAI Service for ApplyMate
 * Generates cover letters, answers screening questions, and fills selection criteria
 */

export class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey })
    this.model = 'gpt-4o-mini'
  }

  async chat(systemPrompt, userPrompt) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.4
      })
      return response.choices[0].message.content.trim()
    } catch (error) {
      console.error('OpenAI Error:', error.message)
      return ''
    }
  }

  /**
   * Generate a tailored cover letter
   */
  async generateCoverLetter(params) {
    const { fullName, location, backgroundBio, jobTitle, company, description } = params

    const prompt = `
Write a highly targeted cover letter for **${fullName}** applying for:

ROLE: ${jobTitle}
COMPANY: ${company}

CANDIDATE:
- Name: ${fullName}
- Location: ${location}
- Background: ${backgroundBio}

═══════════════════════════════════════════════════════
CRITICAL: JOB-SPECIFIC REQUIREMENTS
═══════════════════════════════════════════════════════

STEP 1 - ANALYZE THE JOB DESCRIPTION BELOW AND IDENTIFY:
• The TOP 3-4 key responsibilities mentioned
• The specific skills or qualifications required
• Any industry-specific terminology used
• The company's apparent culture or values

STEP 2 - WRITE THE COVER LETTER THAT:
• Directly addresses EACH key responsibility from the job posting
• Uses the SAME terminology and keywords from the job description
• Provides specific examples of how ${fullName} has done similar work
• References the actual duties listed (e.g., "Your requirement for X aligns with my experience in...")
• Shows understanding of what THIS specific role involves

═══════════════════════════════════════════════════════

STRUCTURE:
Paragraph 1: Hook + why THIS specific role at THIS company
Paragraph 2: Address the FIRST major responsibility from job description with concrete example
Paragraph 3: Address the SECOND major responsibility with evidence
Paragraph 4: Address additional key requirements (skills, qualifications, soft skills)
Paragraph 5: Strong closing with call to action

FORMAT RULES:
• First line MUST be: "Dear ${company} Hiring Team,"
• DO NOT include: email, phone, LinkedIn, dates, addresses, or any placeholders
• End with signature: ${fullName}
• Length: 400-550 words

STYLE:
• Confident and professional, not generic
• Use action verbs and quantifiable achievements where possible
• Mirror the tone of the job posting
• NO clichés like "I am excited to apply" or "I believe I would be a great fit"

═══════════════════════════════════════════════════════
JOB DESCRIPTION TO ANALYZE:
═══════════════════════════════════════════════════════
${description}
`

    return this.chat(
      'You are a professional cover letter writer who creates highly tailored, job-specific cover letters. You carefully analyze job descriptions and match candidate experience to specific role requirements.',
      prompt
    )
  }

  /**
   * Generate selection criteria statement
   */
  async generateSelectionCriteria(params) {
    const { fullName, location, backgroundBio, jobTitle, company, description } = params

    const prompt = `
Write a selection criteria statement for **${fullName}** applying for:

ROLE: ${jobTitle}
COMPANY: ${company}

CANDIDATE BACKGROUND:
- Name: ${fullName}
- Location: ${location}
- Experience: ${backgroundBio}

INSTRUCTIONS:
1. Read the job description below
2. Identify the TOP 3-4 key selection criteria or requirements
3. Write a focused statement (250-400 words) addressing each criterion
4. Use specific examples and achievements where possible
5. Use bullet points or short paragraphs for clarity

FORMAT:
- Start with a brief intro sentence
- Address each key criterion with evidence
- Keep it professional and concise
- Do NOT include any headers like "Selection Criteria Response"

JOB DESCRIPTION:
${description}
`

    return this.chat(
      'You are an expert at writing selection criteria responses for job applications. You write concise, specific statements that directly address key requirements.',
      prompt
    )
  }

  /**
   * Answer a screening question
   */
  async answerScreeningQuestion(params) {
    const { fullName, location, backgroundBio, jobTitle, company, question } = params

    const prompt = `
You are answering as **${fullName}**, a senior professional based in ${location}.

BACKGROUND BIO:
${backgroundBio}

JOB APPLYING FOR:
- ${jobTitle} at ${company}

RULES:
• 4–7 sentences
• Direct, confident, senior tone
• If the question is about commute, onsite work, availability, local work rights, or proximity → mention being based in ${location}
• Otherwise DO NOT mention the location
• No dates, emails, phone numbers, or irrelevant details
• No clichés

QUESTION:
"${question}"
`

    return this.chat(
      'You write concise, senior-level answers for job screening questions.',
      prompt
    )
  }

  /**
   * Answer a multiple choice question
   */
  async answerMultipleChoice(params) {
    const { location, question, options } = params
    const optionsText = options.map(opt => `- ${opt}`).join('\n')

    const prompt = `Question: ${question}

Options:
${optionsText}

Important context:
- You are an Australian citizen with full work rights
- You have a driver's license
- You are based in ${location}
- You can travel if needed
- Answer YES to capability questions
- For experience questions, pick the highest/best option

Reply with ONLY the exact option text to select:`

    return this.chat(
      "You are answering job application questions. Reply with ONLY the exact option text to select. Nothing else.",
      prompt
    )
  }
}

