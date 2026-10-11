/**
 * AI Lecture Summarizer Service
 * 
 * Generates structured academic lecture summaries with cascading fallback:
 * 1. OpenRouter (google/gemini-2.5-flash / google/gemini-2.5-flash-lite / google/gemini-flash-1.5)
 * 2. Google Gemini Direct API (gemini-1.5-flash / gemini-2.0-flash)
 * 3. Groq (openai/gpt-oss-120b / openai/gpt-oss-20b)
 */

function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    if (typeof urlOrId !== 'string') return '';
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|[?&]v=)([^#&?]*)/);
    return (match && match[1]?.length === 11) ? match[1] : '';
}

function cleanJsonResponse(rawText) {
    if (!rawText) return null;
    let text = rawText.trim();
    // Remove markdown code fences if present
    if (text.startsWith('```json')) {
        text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
        text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        // Attempt regex extraction of first JSON object
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (innerErr) {
                return null;
            }
        }
        return null;
    }
}

/**
 * 1. Provider: OpenRouter (Gemini Flash Models)
 */
async function callOpenRouter(prompt) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

    const models = [
        'google/gemini-2.5-flash',
        'google/gemini-2.5-flash-lite',
        'google/gemini-flash-1.5'
    ];
    let lastError = null;

    for (const model of models) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://bics.edu.in',
                    'X-Title': 'BICS Portal'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 2500,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a senior computer science academic professor and curriculum director. You synthesize video lectures into structured, exhaustive, pedagogical summaries for students. Always respond strictly with valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenRouter HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            const parsed = cleanJsonResponse(content);
            if (parsed) {
                return { result: parsed, provider: `OpenRouter (${model})` };
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('OpenRouter failed for all Gemini models');
}

/**
 * 2. Provider: Google Gemini Direct API
 */
async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const models = ['gemini-1.5-flash', 'gemini-2.0-flash'];
    let lastError = null;

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        responseMimeType: 'application/json'
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = cleanJsonResponse(rawText);
            if (parsed) {
                return { result: parsed, provider: `Gemini (${model})` };
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Gemini direct API failed');
}

/**
 * 3. Provider: Groq (OpenAI GPT-OSS Models)
 */
async function callGroq(prompt) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    let lastError = null;

    for (const model of models) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a senior computer science academic professor and curriculum director. You synthesize video lectures into structured, exhaustive, pedagogical summaries for students. Always respond strictly with valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq HTTP ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            const parsed = cleanJsonResponse(content);
            if (parsed) {
                return { result: parsed, provider: `Groq (${model})` };
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Groq failed for all GPT models');
}

/**
 * Cascading summary generator:
 * Order: 1. OpenRouter (Gemini Flash) -> 2. Gemini Direct -> 3. Groq (GPT models)
 */
async function generateLectureSummary({ title, section, youtubeUrl }) {
    const prompt = `
Synthesize a comprehensive, high-yield academic lecture summary for the following university coursework video lecture:

- Section / Course: "${section || 'Computer Science'}"
- Lecture Title: "${title}"
- YouTube Resource: ${youtubeUrl}

Return a valid JSON object matching this schema exactly without any surrounding conversational text:
{
  "synopsis": "A 2 to 3 paragraph executive summary of the lecture, its learning objectives, foundational theories, and practical applications.",
  "keyConcepts": [
    "Concept 1: Definition and importance",
    "Concept 2: Definition and importance",
    "Concept 3: Definition and importance",
    "Concept 4: Definition and importance"
  ],
  "detailedNotes": "In-depth structured lecture notes formatted with Markdown headings (###), bullet points, and code snippets or formulas where relevant.",
  "examTakeaways": [
    "High-probability exam question topic 1",
    "Common student pitfall or debugging error to avoid",
    "Crucial rule or principle to memorize"
  ]
}
`.trim();

    // 1. Try OpenRouter (Gemini Flash)
    try {
        console.log('[AI Summarizer] Attempting generation via Provider 1: OpenRouter (Gemini Flash)...');
        const res = await callOpenRouter(prompt);
        return { ...res.result, provider: res.provider, generatedAt: new Date() };
    } catch (oErr) {
        console.warn('[AI Summarizer] OpenRouter failed, falling back to Provider 2: Gemini Direct.', oErr.message);
    }

    // 2. Try Gemini Direct
    try {
        console.log('[AI Summarizer] Attempting generation via Provider 2: Gemini Direct...');
        const res = await callGemini(prompt);
        return { ...res.result, provider: res.provider, generatedAt: new Date() };
    } catch (gemErr) {
        console.warn('[AI Summarizer] Gemini Direct failed, falling back to Provider 3: Groq (GPT).', gemErr.message);
    }

    // 3. Try Groq (GPT models)
    try {
        console.log('[AI Summarizer] Attempting generation via Provider 3: Groq (GPT models)...');
        const res = await callGroq(prompt);
        return { ...res.result, provider: res.provider, generatedAt: new Date() };
    } catch (gErr) {
        console.error('[AI Summarizer] All AI providers failed.', gErr.message);
        throw new Error(`All AI summary generation providers failed: ${gErr.message}`);
    }
}

module.exports = {
    extractYouTubeId,
    generateLectureSummary
};
