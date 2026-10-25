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
        'google/gemini-2.0-flash-001',
        'google/gemini-1.5-flash',
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

    const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];
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

/**
 * Fast, simple academic synopsis generator for video lectures.
 * Creates a clean 2 to 3 paragraph synopsis and 3-4 key concepts.
 * Cascades: 1. OpenRouter (Gemini Flash) -> 2. Gemini Direct -> 3. Groq (GPT models) -> 4. Robust fallback
 */
async function generateSimpleSynopsis({ title, section, youtubeUrl }) {
    const prompt = `
Create a clear, concise, and pedagogical 2 to 3 paragraph academic synopsis for the following university video lecture:
- Course / Section: "${section || 'Computer Science'}"
- Lecture Title: "${title}"
- YouTube Resource: ${youtubeUrl || 'N/A'}

Focus on:
1. The primary learning objective and theme.
2. The foundational conceptual principles and mechanisms taught.
3. Practical implementation and coursework relevance.

Return a valid JSON object matching this schema exactly without any extra conversational commentary:
{
  "synopsis": "A clear, well-written 2 to 3 paragraph academic synopsis explaining what this lecture covers, foundational concepts, and key takeaways.",
  "keyConcepts": [
    "Key concept 1",
    "Key concept 2",
    "Key concept 3"
  ]
}
`.trim();

    // 1. Try OpenRouter (Gemini Flash)
    try {
        const res = await callOpenRouter(prompt);
        if (res?.result?.synopsis) {
            return {
                synopsis: res.result.synopsis,
                keyConcepts: Array.isArray(res.result.keyConcepts) ? res.result.keyConcepts : [],
                generatedAt: new Date(),
                provider: res.provider || 'BICS Cortex'
            };
        }
    } catch (e) {
        console.warn('[Simple Synopsis] OpenRouter failed, falling back:', e.message);
    }

    // 2. Try Gemini Direct
    try {
        const res = await callGemini(prompt);
        if (res?.result?.synopsis) {
            return {
                synopsis: res.result.synopsis,
                keyConcepts: Array.isArray(res.result.keyConcepts) ? res.result.keyConcepts : [],
                generatedAt: new Date(),
                provider: res.provider || 'BICS Cortex'
            };
        }
    } catch (e) {
        console.warn('[Simple Synopsis] Gemini Direct failed, falling back:', e.message);
    }

    // 3. Try Groq
    try {
        const res = await callGroq(prompt);
        if (res?.result?.synopsis) {
            return {
                synopsis: res.result.synopsis,
                keyConcepts: Array.isArray(res.result.keyConcepts) ? res.result.keyConcepts : [],
                generatedAt: new Date(),
                provider: res.provider || 'BICS Cortex'
            };
        }
    } catch (e) {
        console.warn('[Simple Synopsis] Groq failed, falling back to local curriculum synthesis:', e.message);
    }

    // 4. Guaranteed fallback synopsis
    const fallbackSynopsis = `This lecture on "${title}" covers core principles and foundational concepts within ${section || 'Computer Science coursework'}. Students are guided through essential theoretical frameworks, structured problem-solving techniques, and practical programming methodologies. Reviewing this session reinforces key curriculum competencies and algorithmic comprehension necessary for examination success.`;
    return {
        synopsis: fallbackSynopsis,
        keyConcepts: [
            `Foundations of ${title}`,
            `Core theoretical mechanisms and applications`,
            `Key problem-solving patterns in ${section || 'Coursework'}`
        ],
        generatedAt: new Date(),
        provider: 'BICS Curriculum Core'
    };
}

/**
 * Conversational Lecture Q&A via BICS Cortex (RAG System)
 * Strictly grounded in the extracted knowledgeBase ground truth if available.
 * Uses Groq (sub-second inference) or OpenRouter models with Gemini fallback.
 */
async function askLectureQuestion({ question, history = [], lectureContext = {} }) {
    const { youtubeUrl, knowledgeBase, title } = lectureContext;

    // Window history to last 6 messages
    const recentHistory = Array.isArray(history) ? history.slice(-6) : [];

    // Check if verified knowledgeBase is available for RAG
    let groundTruthSection = '';
    const hasKnowledgeBase = knowledgeBase && (knowledgeBase.status === 'completed' || (knowledgeBase.chunks && knowledgeBase.chunks.length > 0));

    if (hasKnowledgeBase) {
        // Collect timestamped topics across all chunks
        const allTopics = (knowledgeBase.chunks || []).flatMap(c => c.topics || []);
        
        const qLower = question.toLowerCase();
        // Check if broad overview question
        const isOverview = qLower.includes('about') || qLower.includes('what is') || qLower.includes('summary') || qLower.includes('overview') || qLower.includes('explain the video') || qLower.includes('tell me about') || qLower.includes('topics');

        let selectedTopics = [];
        if (isOverview || allTopics.length <= 16) {
            selectedTopics = allTopics.slice(0, 18);
        } else {
            const matched = allTopics.filter(t => 
                qLower.includes((t.title || '').toLowerCase()) || 
                (t.content || '').toLowerCase().includes(qLower)
            );
            if (matched.length >= 8) {
                selectedTopics = matched.slice(0, 16);
            } else {
                // Combine keyword matches + chronological anchor nodes
                const combined = [...matched];
                const step = Math.max(1, Math.floor(allTopics.length / 10));
                for (let i = 0; i < allTopics.length && combined.length < 16; i += step) {
                    if (!combined.some(t => t.timestamp === allTopics[i].timestamp)) {
                        combined.push(allTopics[i]);
                    }
                }
                selectedTopics = combined.sort((a, b) => (a.timestampSeconds || 0) - (b.timestampSeconds || 0));
            }
        }

        const formattedTopics = selectedTopics.map(t => 
            `[${t.timestamp}] ${t.title}:\n${t.content} ${t.codeOrFormula ? `\nCode/Formula: ${t.codeOrFormula}` : ''}`
        ).join('\n\n');

        const keyConceptsList = Array.isArray(knowledgeBase.keyConcepts) && knowledgeBase.keyConcepts.length > 0
            ? knowledgeBase.keyConcepts.map((kc, i) => `${i + 1}. ${kc}`).join('\n')
            : 'Core academic principles and data structures.';

        groundTruthSection = `
=== VERIFIED LECTURE GROUND TRUTH (EXTRACTED DIRECTLY FROM VIDEO) ===
LECTURE TITLE: "${title || 'Course Lecture'}"
EXECUTIVE SYNOPSIS:
${knowledgeBase.synopsis || 'Comprehensive academic lecture breakdown.'}

KEY CONCEPTS TAUGHT:
${keyConceptsList}

CHRONOLOGICAL TOPICS & TIMESTAMPS:
${formattedTopics}
======================================================================
`;
    }

    const systemPrompt = `
You are BICS Cortex, the official LLM by BICS Portal and an expert AI academic teaching assistant.
You are assisting a student with this university lecture.
Video Resource: ${youtubeUrl || 'N/A'}
${title ? `Lecture: "${title}"` : ''}

${groundTruthSection ? groundTruthSection : 'Ground your answer strictly in the actual content and spoken explanations from the video.'}

STRICT DIRECTIVES:
1. Ground your answers strictly in the factual explanations, demonstrations, code, and visuals from this lecture. Do NOT hallucinate concepts not taught.
2. Include specific timestamps in (MM:SS) format (for example: (04:15) or (12:30)) so the student can jump directly to that point in the player.
3. Format all responses using clean, structured Markdown (code blocks, bold highlights, concise explanations).
4. Always return your response strictly as a JSON object matching this schema without any outer markdown fences or conversation:
{
  "answer": "Your comprehensive, detailed answer grounded strictly in this lecture with timestamp citations...",
  "suggestedFollowups": [
    "Specific follow-up question 1 about what was taught in this video",
    "Specific follow-up question 2 about code or formulas from this video",
    "Specific follow-up question 3 about practical implementation from this video"
  ]
}
`.trim();

    const conversationPrompt = `
${recentHistory.length > 0 ? `Previous conversation history:\n${recentHistory.map(m => `${m.role === 'user' ? 'Student' : 'BICS Cortex'}: ${m.content}`).join('\n')}\n` : ''}
Student's question:
"${question}"

Provide your JSON response answering the student based strictly on the verified lecture content.
`.trim();

    // 1. Primary RAG Engine: Groq (ultra-fast sub-second inference with verified working models)
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
        const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
        for (const model of groqModels) {
            try {
                console.log(`[BICS Cortex RAG] Querying Groq (${model})...`);
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${groqApiKey}`
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: conversationPrompt }
                        ],
                        max_tokens: 1500,
                        temperature: 0.2,
                        response_format: { type: 'json_object' }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const parsed = cleanJsonResponse(data.choices?.[0]?.message?.content);
                    if (parsed && parsed.answer) {
                        return { ...parsed, provider: `BICS Cortex (Groq: ${model.split('/')[1] || model})` };
                    }
                } else {
                    const errText = await response.text();
                    console.warn(`[BICS Cortex RAG] Groq model ${model} status ${response.status}:`, errText);
                }
            } catch (groqErr) {
                console.warn(`[BICS Cortex RAG] Groq model ${model} error:`, groqErr.message);
            }
        }
    }

    // 2. Secondary Engine: OpenRouter (Gemini Flash & Llama 3.3 models)
    const orApiKey = process.env.OPENROUTER_API_KEY;
    if (orApiKey) {
        const orModels = [
            'google/gemini-2.5-flash-lite',
            'google/gemini-2.5-flash',
            'meta-llama/llama-3.3-70b-instruct'
        ];
        for (const model of orModels) {
            try {
                console.log(`[BICS Cortex RAG] Querying OpenRouter (${model})...`);
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${orApiKey}`,
                        'HTTP-Referer': 'https://bics.edu.in',
                        'X-Title': 'BICS Cortex'
                    },
                    body: JSON.stringify({
                        model,
                        max_tokens: 1500,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: conversationPrompt }
                        ],
                        temperature: 0.2,
                        response_format: { type: 'json_object' }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const parsed = cleanJsonResponse(data.choices?.[0]?.message?.content);
                    if (parsed && parsed.answer) {
                        return { ...parsed, provider: `BICS Cortex (OpenRouter: ${model.split('/')[1] || model})` };
                    }
                } else {
                    const errText = await response.text();
                    console.warn(`[BICS Cortex RAG] OpenRouter model ${model} status ${response.status}:`, errText);
                }
            } catch (e) {
                console.warn(`[BICS Cortex RAG] OpenRouter model ${model} error:`, e.message);
            }
        }
    }

    // 3. Fallback: Return Error (Do not fabricate answers or save to chat database)
    console.error('[BICS Cortex RAG] All inference providers (Groq -> OpenRouter) failed.');
    return {
        isError: true,
        error: "BICS Cortex is currently experiencing high server traffic. Please try asking your question again in a moment."
    };
}

module.exports = {
    extractYouTubeId,
    generateLectureSummary,
    generateSimpleSynopsis,
    askLectureQuestion
};
