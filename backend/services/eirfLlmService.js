const crypto = require('crypto');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Network Timeouts (ms)
const GEMINI_TIMEOUT_MS = 15000;
const GROQ_TIMEOUT_MS = 8000;
const OPENROUTER_TIMEOUT_MS = 15000;

/**
 * Helper: Formats Date into 24-hour Indian Standard Time (IST, UTC+5:30) string with ' IST' suffix.
 */
function formatISTTimeString(dateVal) {
    if (!dateVal) return '00:00:00 IST';
    try {
        const d = new Date(dateVal);
        return d.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + ' IST';
    } catch (e) {
        return new Date(dateVal).toISOString().slice(11, 19) + ' UTC';
    }
}

/**
 * 1. Zero-PII Data Sanitization
 * Extracts strictly anonymized telemetry, system specs, and proctoring metrics.
 * GUARANTEE: Never transmits student names, emails, student IDs, IP addresses,
 * webcam photos, facial hashes, or actual test questions / code to third parties.
 */
function sanitizeTelemetry(submission) {
    if (!submission) return {};

    const proctoringLog = submission.proctoringLog || {};
    const events = Array.isArray(proctoringLog.events) ? proctoringLog.events : [];
    const serverOfflineGaps = Array.isArray(proctoringLog.serverOfflineGaps) ? proctoringLog.serverOfflineGaps : [];
    const flaggedReasons = Array.isArray(submission.flaggedReasons) ? submission.flaggedReasons : [];

    const fsExits = Number(proctoringLog.fullscreenExits || 0);
    const tabSwitches = Number(proctoringLog.tabSwitches || 0);

    let maxFsSec = 0;
    let totalFsSec = 0;
    let maxTabSec = 0;
    let totalTabSec = 0;
    let maxOfflineSec = 0;
    let totalOfflineSec = 0;
    let offlineGapsCount = 0;

    // Dual layer offline detection metrics
    let heartbeatMisses = 0;
    let navigatorOfflineEvents = 0;
    let pingFailures = 0;

    const anonymizedTimeline = [];

    // Process raw events into anonymized timeline (using IST timestamps)
    events.forEach(ev => {
        if (!ev) return;
        const dur = Number(ev.durationSeconds || 0);
        const type = String(ev.type || '');
        const timeOffset = formatISTTimeString(ev.timestamp);
        const qIndex = (typeof ev.questionIndex === 'number' && ev.questionIndex >= 0) ? `Question #${ev.questionIndex + 1}` : 'General Exam Window';

        if (type.includes('FULLSCREEN')) {
            totalFsSec += dur;
            if (dur > maxFsSec) maxFsSec = dur;
            anonymizedTimeline.push({
                time: timeOffset,
                event: 'FULLSCREEN_EXIT',
                durationSec: dur,
                questionRef: qIndex
            });
        } else if (type.includes('TAB') || type.includes('BLUR')) {
            totalTabSec += dur;
            if (dur > maxTabSec) maxTabSec = dur;
            anonymizedTimeline.push({
                time: timeOffset,
                event: 'WINDOW_FOCUS_LOSS',
                durationSec: dur,
                questionRef: qIndex
            });
        } else if (type === 'NETWORK_OFFLINE' || type === 'DISCONNECT_REAPED' || type.includes('OFFLINE')) {
            offlineGapsCount++;
            totalOfflineSec += dur;
            if (dur > maxOfflineSec) maxOfflineSec = dur;
            if (type === 'NETWORK_OFFLINE') navigatorOfflineEvents++;
            anonymizedTimeline.push({
                time: timeOffset,
                event: 'NETWORK_OFFLINE_GAP',
                durationSec: dur,
                questionRef: qIndex
            });
        } else if (type.includes('HEARTBEAT')) {
            heartbeatMisses++;
        } else if (type.includes('PING')) {
            pingFailures++;
        }
    });

    // Merge server-side offline gaps if tracked (using IST timestamps)
    serverOfflineGaps.forEach(gap => {
        const dSec = Number(gap.downtimeSeconds || 0);
        totalOfflineSec += dSec;
        offlineGapsCount++;
        if (dSec > maxOfflineSec) maxOfflineSec = dSec;
        const startStr = formatISTTimeString(gap.gapStart || gap.timestamp);
        anonymizedTimeline.push({
            time: startStr,
            event: 'SERVER_DETECTED_DISCONNECT_GAP',
            durationSec: dSec,
            questionRef: 'Exam Session Background'
        });
    });

    // Hardware & System Environment extraction (no PII)
    const techContext = submission.technicalContext || submission.securityMetadata || {};
    const answers = Array.isArray(submission.answers) ? submission.answers : [];

    const sessionAlias = 'EXAM-SESSION-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    return {
        sessionAlias,
        examMetadata: {
            category: submission.testTitle ? 'Standard Academic Assessment' : 'General Examination',
            totalQuestions: answers.length || 20,
            status: submission.status || 'submitted',
            isAutoSubmitted: submission.status === 'auto-submitted' || (fsExits + tabSwitches >= 3),
            submissionTrigger: submission.submissionReason || 'manual'
        },
        clientSystemContext: {
            os: techContext.os || techContext.osDetails?.osVersion || techContext.operatingSystem || techContext.platform || 'Windows / macOS Standard Client',
            browser: techContext.browser || 'Chromium Desktop Browser',
            screenResolution: techContext.screenResolution || '1920x1080',
            viewportSize: techContext.viewportSize || '1920x950',
            hardwareConcurrency: techContext.hardwareConcurrency || 4
        },
        proctoringTelemetry: {
            fullscreenExits: fsExits,
            maxFullscreenDurationSec: maxFsSec,
            totalFullscreenDurationSec: totalFsSec,
            tabSwitches: tabSwitches,
            maxTabSwitchDurationSec: maxTabSec,
            totalTabSwitchDurationSec: totalTabSec,
            offlineGapsCount,
            maxSingleOfflineGapSec: maxOfflineSec,
            totalOfflineDurationSec: totalOfflineSec,
            dualLayerMetrics: {
                heartbeatMisses,
                navigatorOfflineEvents,
                pingFailures
            },
            totalWarningsCount: fsExits + tabSwitches
        },
        evaluatedServerFlags: flaggedReasons,
        anonymizedTimeline: anonymizedTimeline.slice(0, 10) // Top 10 chronological incident points
    };
}

/**
 * 2. System Instruction & Prompt Formulation
 */
function buildPrompt(sanitizedPayload) {
    const isSevere = sanitizedPayload.proctoringTelemetry?.totalOfflineDurationSec > 30 ||
                     sanitizedPayload.proctoringTelemetry?.maxSingleOfflineGapSec > 25 ||
                     sanitizedPayload.proctoringTelemetry?.totalWarningsCount >= 3;

    const systemInstruction = `You are an expert Academic Integrity Incident Investigator for a high-stakes online proctoring system.
Your mission is to analyze the provided anonymized proctoring telemetry logs and generate exactly 8 inquiry questions for the Emergency Incident Report Form (EIRF).
The candidate must answer these 8 questions to explain any security flags, offline intervals, or navigation disruptions.

TIME ZONE REQUIREMENT:
All proctoring telemetry timestamps are recorded in Indian Standard Time (IST, UTC+5:30). When referencing incident times in question contexts, descriptions, or placeholders, ALWAYS preserve Indian Standard Time (e.g. 'At 13:33:20 IST, a 28s network disconnection occurred').

STRICT QUESTION DISTRIBUTION REQUIREMENTS (EXACTLY 8 QUESTIONS):
1. Q1 [TEXT]: Descriptive primary narrative explaining the root cause that led to the security flags or disconnects during the exam.
2. Q2 [RADIO]: Single-choice classification of the incident cause (Provide at least 5-6 mutually exclusive, realistic options).
3. Q3 [TEXT]: Contextual drilldown into the peak violation or longest disconnect event (Reference the actual logged timestamp in IST and duration from the telemetry).
4. Q4 [CHECKBOX]: Multi-choice identifying active background software, utilities, or popups (Provide at least 5-6 realistic options).
5. Q5 [RADIO]: Single-choice inquiry into physical testing surroundings (Provide 5 distinct realistic environment options).
6. Q6 [CHECKBOX]: Multi-choice identifying immediate candidate remediation/troubleshooting steps taken (Provide at least 5-7 troubleshooting actions).
7. Q7 [TEXT]: Formal academic integrity declaration affirming no secondary devices, unauthorized notes, or third parties were consulted during interruptions.
8. Q8 [FILE_UPLOAD]: Technical verification proof request (Screenshots/photos of ISP outage SMS, router status lights, Windows Event Viewer, or battery warning).
   - Set "isRequired": ${isSevere ? 'true' : 'false'} (True if severe outage or multiple warnings occurred, False if minor blurs only).
   - Provide clear "proofGuidance" specifying accepted formats (JPG, PNG, PDF <= 5MB).

CRITICAL REQUIREMENT FOR RADIO AND CHECKBOX QUESTIONS:
For questionType "RADIO" and "CHECKBOX", the "options" array MUST NEVER BE EMPTY. You MUST provide at least 4 to 7 realistic string options for candidates to select from.

JSON OUTPUT FORMAT:
You MUST respond with valid JSON only. No markdown fences, no conversational text.
{
  "inquirySummary": "Brief analytical summary of incident telemetry",
  "questions": [
    {
      "questionId": "Q1",
      "questionType": "TEXT",
      "category": "ROOT_CAUSE",
      "questionText": "...",
      "context": "...",
      "placeholder": "...",
      "options": [],
      "isRequired": true,
      "requiresProof": false,
      "proofGuidance": ""
    },
    {
      "questionId": "Q2",
      "questionType": "RADIO",
      "category": "INCIDENT_CLASSIFICATION",
      "questionText": "Which of the following best classifies the primary cause of the incident?",
      "context": "Select the most accurate root cause classification.",
      "placeholder": "",
      "options": [
        "Local ISP / Home broadband disconnection or packet drop",
        "Operating system notification / popup or antivirus interruption",
        "Accidental keyboard shortcut / trackpad gesture / peripheral disconnect",
        "Device power / hardware restart or low battery event",
        "Browser freeze / crash requiring tab reload",
        "Other unforeseen environmental disruption"
      ],
      "isRequired": true,
      "requiresProof": false,
      "proofGuidance": ""
    },
    ... (Q3 through Q8)
  ]
}`;

    const userPrompt = `Anonymized Incident Telemetry Payload:
${JSON.stringify(sanitizedPayload, null, 2)}

Analyze this telemetry and generate the 8 tailored inquiry questions adhering strictly to the schema.`;

    return { systemInstruction, userPrompt };
}

/**
 * 3. Tier 1: Gemini Direct API Call
 */
async function callGeminiApi(promptObj) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured in backend environment');
    }

    const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

    for (const model of candidateModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const body = {
                contents: [{ role: 'user', parts: [{ text: promptObj.userPrompt }] }],
                systemInstruction: { parts: [{ text: promptObj.systemInstruction }] },
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 4096,
                    responseMimeType: 'application/json'
                }
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawOutput) {
                    return { text: rawOutput, provider: `gemini-${model}` };
                }
            } else {
                const errText = await res.text();
                console.warn(`[EirfLlmService] Gemini ${model} failed (${res.status}): ${errText.slice(0, 160)}`);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[EirfLlmService] Gemini ${model} network error: ${err.message}`);
        }
    }

    throw new Error('All Gemini API models exhausted or timed out');
}

/**
 * 4. Tier 2: Groq Direct API Call
 */
async function callGroqApi(promptObj) {
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not configured in backend environment');
    }

    const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

    for (const model of groqModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: promptObj.systemInstruction },
                        { role: 'user', content: promptObj.userPrompt }
                    ],
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const content = data.choices?.[0]?.message?.content;
                if (content) {
                    return { text: content, provider: `groq-${model}` };
                }
            } else {
                const errText = await res.text();
                console.warn(`[EirfLlmService] Groq ${model} failed (${res.status}): ${errText.slice(0, 160)}`);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[EirfLlmService] Groq ${model} network error: ${err.message}`);
        }
    }

    throw new Error('All Groq API models exhausted or timed out');
}

/**
 * 5. Tier 3: OpenRouter API Call
 */
async function callOpenRouterApi(promptObj) {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not configured in backend environment');
    }

    const openRouterModels = [
        'meta-llama/llama-3.3-70b-instruct',
        'qwen/qwen-2.5-72b-instruct'
    ];

    for (const model of openRouterModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://bics-portal.onrender.com',
                    'X-Title': 'BICS EIRF Inquiry Generator'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: promptObj.systemInstruction },
                        { role: 'user', content: promptObj.userPrompt }
                    ],
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const content = data.choices?.[0]?.message?.content;
                if (content) {
                    return { text: content, provider: `openrouter-${model}` };
                }
            } else {
                const errText = await res.text();
                console.warn(`[EirfLlmService] OpenRouter ${model} failed (${res.status}): ${errText.slice(0, 160)}`);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[EirfLlmService] OpenRouter ${model} network error: ${err.message}`);
        }
    }

    throw new Error('All OpenRouter models exhausted or timed out');
}

/**
 * 6. Tier 4: Local Deterministic Synthesizer (Zero-Failure Safety Net)
 * Generates 8 high-fidelity, mathematically tailored questions based on telemetry
 * without requiring any external network or LLM API calls.
 */
function deterministicInquirySynthesizer(sanitizedPayload) {
    const telemetry = sanitizedPayload?.proctoringTelemetry || {};
    const fsExits = Number(telemetry.fullscreenExits || 0);
    const maxFsSec = Number(telemetry.maxFullscreenDurationSec || 0);
    const tabSwitches = Number(telemetry.tabSwitches || 0);
    const maxTabSec = Number(telemetry.maxTabSwitchDurationSec || 0);
    const totalOfflineSec = Number(telemetry.totalOfflineDurationSec || 0);
    const maxOfflineSec = Number(telemetry.maxSingleOfflineGapSec || 0);

    const isSevere = totalOfflineSec > 30 || maxOfflineSec > 25 || (fsExits + tabSwitches >= 3);

    // Identify peak event
    let peakDescription = 'a navigation disruption';
    if (maxFsSec >= maxTabSec && maxFsSec >= maxOfflineSec && maxFsSec > 0) {
        peakDescription = `a ${maxFsSec}-second fullscreen exit`;
    } else if (maxTabSec >= maxFsSec && maxTabSec >= maxOfflineSec && maxTabSec > 0) {
        peakDescription = `a ${maxTabSec}-second window focus loss / tab switch`;
    } else if (maxOfflineSec > 0) {
        peakDescription = `a ${maxOfflineSec}-second continuous network disconnection`;
    }

    return [
        {
            questionId: 'Q1',
            questionType: 'TEXT',
            category: 'ROOT_CAUSE',
            questionText: 'What primary technical or environmental event caused the security flags or disconnections recorded during your exam?',
            context: `Recorded flags: ${fsExits} fullscreen exit(s), ${tabSwitches} window focus loss(es), ${totalOfflineSec}s offline downtime.`,
            placeholder: 'Provide a detailed explanation of what transpired on your system...',
            options: [],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q2',
            questionType: 'RADIO',
            category: 'ROOT_CAUSE_CATEGORY',
            questionText: 'Select the primary classification that best categorizes the incident:',
            context: 'Administrative Root Cause Classification',
            placeholder: '',
            options: [
                'Internet Service Provider / Wi-Fi outage or network instability',
                'Operating System notification / background application popup / forced restart',
                'Accidental trackpad gesture, keyboard shortcut, or peripheral disconnect',
                'Power failure / sudden laptop battery shutdown',
                'Browser freeze / unresponsive tab / crash',
                'Other external distraction or unavoidable interruption'
            ],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q3',
            questionType: 'TEXT',
            category: 'INCIDENT_DRILLDOWN',
            questionText: `Our security monitor flagged ${peakDescription}. Explain in detail what was visible on your screen and what action you took during this exact window.`,
            context: `Peak incident telemetry: ${peakDescription}`,
            placeholder: 'Detail the exact visual state and your immediate response...',
            options: [],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q4',
            questionType: 'CHECKBOX',
            category: 'BACKGROUND_PROCESSES',
            questionText: 'Which of the following background applications or utilities were active on your device during the test window?',
            context: 'Identification of concurrent background software',
            placeholder: '',
            options: [
                'Antivirus / Security Suite scan or alert (e.g. Windows Defender, McAfee)',
                'Communication software (e.g. Discord, Slack, Teams, WhatsApp, Zoom)',
                'Browser extensions / popups (e.g. Grammarly, password manager, ad-blocker)',
                'System update dialog (Windows Update, macOS Software Update)',
                'Display or GPU utilities (e.g. NVIDIA GeForce Experience, dual monitor tools)',
                'None of the above / Machine had only the test window open'
            ],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q5',
            questionType: 'RADIO',
            category: 'PHYSICAL_ENVIRONMENT',
            questionText: 'Select the option that best describes your physical test environment:',
            context: 'Physical surroundings assessment',
            placeholder: '',
            options: [
                'Private closed room with no other individuals present',
                'Shared residential room / family environment with occasional movement',
                'College or university computer laboratory / library',
                'Public venue / café / coworking facility',
                'Mobile / transit setting'
            ],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q6',
            questionType: 'CHECKBOX',
            category: 'REMEDIATION_ACTIONS',
            questionText: 'What immediate remediation steps did you attempt during or after the interruption?',
            context: 'Technical troubleshooting documentation',
            placeholder: '',
            options: [
                'Toggled Wi-Fi off and on / reconnected to wireless access point',
                'Switched connection to mobile hotspot or USB tethering',
                'Rebooted home router or modem',
                'Closed background tasks via Task Manager / Activity Monitor',
                'Re-entered fullscreen immediately via on-screen button or key',
                'Refreshed the browser window to restore server sync',
                'Waited without altering system state until stability resumed'
            ],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q7',
            questionType: 'TEXT',
            category: 'INTEGRITY_DECLARATION',
            questionText: 'Did you consult any secondary devices, notes, communication tools, or online resources while the exam window was unfocused or disconnected? State your formal integrity declaration.',
            context: 'Official Candidate Integrity Affirmation',
            placeholder: 'State your formal statement regarding unauthorized resources...',
            options: [],
            isRequired: true,
            requiresProof: false,
            proofGuidance: ''
        },
        {
            questionId: 'Q8',
            questionType: 'FILE_UPLOAD',
            category: 'PROOF_VERIFICATION',
            questionText: 'Provide supporting technical evidence verifying your reported interruption (e.g. ISP outage SMS / portal notice, router LED photo, Windows Event log, battery status).',
            context: isSevere ? 'Mandatory verification required due to significant downtime / warning thresholds.' : 'Optional supporting evidence.',
            placeholder: '',
            options: [],
            isRequired: isSevere,
            requiresProof: true,
            proofGuidance: 'Accepted formats: JPG, PNG, PDF up to 5MB. Clear, legible screenshots or photos only.'
        }
    ];
}

/**
 * 7. JSON Response Parsing, Normalization & Validation
 */
function validateAndNormalizeQuestions(rawText, sanitizedPayload) {
    if (!rawText || typeof rawText !== 'string') {
        return deterministicInquirySynthesizer(sanitizedPayload);
    }

    try {
        // Strip markdown code fences if present
        let cleanText = rawText.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.slice(7);
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.slice(3);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.slice(0, -3);
        }
        cleanText = cleanText.trim();

        const parsed = JSON.parse(cleanText);
        let questions = Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : null);

        if (!questions || questions.length === 0) {
            console.warn('[EirfLlmService] Parsed JSON did not contain a valid questions array, invoking deterministic synthesizer');
            return deterministicInquirySynthesizer(sanitizedPayload);
        }

        // Normalize each question
        const normalized = questions.map((q, idx) => {
            const rawType = String(q.questionType || q.type || 'TEXT').toUpperCase();
            let safeType = 'TEXT';
            if (rawType.includes('RADIO') || rawType === 'SINGLE_CHOICE') safeType = 'RADIO';
            else if (rawType.includes('CHECKBOX') || rawType === 'MULTI_CHOICE') safeType = 'CHECKBOX';
            else if (rawType.includes('FILE') || rawType.includes('UPLOAD') || rawType.includes('PROOF')) safeType = 'FILE_UPLOAD';

            // Extract options from various potential LLM keys (options, choices, items, selections, or key-value objects)
            const rawOpts = Array.isArray(q.options) ? q.options :
                           (Array.isArray(q.choices) ? q.choices :
                           (Array.isArray(q.items) ? q.items :
                           (Array.isArray(q.selections) ? q.selections :
                           (q.options && typeof q.options === 'object' ? Object.values(q.options) : []))));

            let opts = rawOpts.map(o => {
                if (typeof o === 'string') return o.trim();
                if (typeof o === 'object' && o !== null) return (o.text || o.label || o.value || o.option || '').trim();
                return String(o || '').trim();
            }).filter(o => o.length > 0);

            // Guard: If choice question has no options, backfill immediately from deterministic template
            if ((safeType === 'RADIO' || safeType === 'CHECKBOX') && opts.length === 0) {
                const fallbackList = deterministicInquirySynthesizer(sanitizedPayload);
                const matchingFallback = fallbackList.find(fb => fb.questionId === q.questionId || fb.category === q.category) || fallbackList[idx];
                if (matchingFallback && Array.isArray(matchingFallback.options) && matchingFallback.options.length > 0) {
                    opts = [...matchingFallback.options];
                } else if (safeType === 'RADIO') {
                    opts = [
                        'Local ISP / Home broadband disconnection or packet drop',
                        'Operating system notification / popup or antivirus interruption',
                        'Accidental keyboard shortcut / trackpad gesture / peripheral disconnect',
                        'Device power / hardware restart or low battery event',
                        'Browser freeze / crash requiring tab reload',
                        'Other unforeseen environmental disruption'
                    ];
                } else {
                    opts = [
                        'Toggled Wi-Fi off and on / reconnected to wireless access point',
                        'Switched connection to mobile hotspot or USB tethering',
                        'Rebooted home router or modem',
                        'Closed background tasks via Task Manager / Activity Monitor',
                        'Re-entered fullscreen immediately via on-screen button or key',
                        'Refreshed the browser window to restore server sync',
                        'None of the above / Machine had only the test window open'
                    ];
                }
            }

            return {
                questionId: q.questionId || `Q${idx + 1}`,
                questionType: safeType,
                category: q.category || 'GENERAL',
                questionText: String(q.questionText || q.text || `Inquiry Question ${idx + 1}`).trim(),
                context: String(q.context || '').trim(),
                placeholder: String(q.placeholder || '').trim(),
                options: opts,
                isRequired: q.isRequired !== undefined ? Boolean(q.isRequired) : true,
                required: q.isRequired !== undefined ? Boolean(q.isRequired) : true,
                requiresProof: safeType === 'FILE_UPLOAD' || Boolean(q.requiresProof),
                proofGuidance: String(q.proofGuidance || '').trim()
            };
        });

        // Ensure we have at least 8 questions. If LLM produced fewer, backfill from deterministic synthesizer
        if (normalized.length < 8) {
            const fallbackList = deterministicInquirySynthesizer(sanitizedPayload);
            for (let i = normalized.length; i < 8; i++) {
                normalized.push(fallbackList[i]);
            }
        }

        return normalized.slice(0, 8); // Keep exactly 8
    } catch (e) {
        console.warn('[EirfLlmService] JSON parse error on LLM response:', e.message, 'Falling back to deterministic synthesizer');
        return deterministicInquirySynthesizer(sanitizedPayload);
    }
}

/**
 * 8. Master Generator: Multi-Provider Cascade Orchestrator
 */
async function generateInquiryQuestions(submission) {
    const sanitizedPayload = sanitizeTelemetry(submission);
    const promptObj = buildPrompt(sanitizedPayload);

    let llmResult = null;

    // 1. Try Gemini
    try {
        console.log('[EirfLlmService] Attempting inquiry question generation via Gemini API...');
        llmResult = await callGeminiApi(promptObj);
        console.log(`[EirfLlmService] Success via ${llmResult.provider}`);
    } catch (geminiErr) {
        console.warn(`[EirfLlmService] Gemini failed: ${geminiErr.message}. Initiating Groq fallback...`);
    }

    // 2. Try Groq if Gemini failed
    if (!llmResult) {
        try {
            console.log('[EirfLlmService] Attempting inquiry question generation via Groq API...');
            llmResult = await callGroqApi(promptObj);
            console.log(`[EirfLlmService] Success via ${llmResult.provider}`);
        } catch (groqErr) {
            console.warn(`[EirfLlmService] Groq failed: ${groqErr.message}. Initiating OpenRouter fallback...`);
        }
    }

    // 3. Try OpenRouter if Groq failed
    if (!llmResult) {
        try {
            console.log('[EirfLlmService] Attempting inquiry question generation via OpenRouter API...');
            llmResult = await callOpenRouterApi(promptObj);
            console.log(`[EirfLlmService] Success via ${llmResult.provider}`);
        } catch (openRouterErr) {
            console.warn(`[EirfLlmService] OpenRouter failed: ${openRouterErr.message}. Initiating Local Deterministic Synthesizer...`);
        }
    }

    // 4. Validate output or fall back to deterministic synthesizer
    if (llmResult && llmResult.text) {
        const validated = validateAndNormalizeQuestions(llmResult.text, sanitizedPayload);
        return validated;
    }

    console.log('[EirfLlmService] All external LLM providers unavailable. Employing Local Deterministic Synthesizer (Zero-Failure Safety Net).');
    return deterministicInquirySynthesizer(sanitizedPayload);
}

module.exports = {
    sanitizeTelemetry,
    buildPrompt,
    callGeminiApi,
    callGroqApi,
    callOpenRouterApi,
    deterministicInquirySynthesizer,
    validateAndNormalizeQuestions,
    generateInquiryQuestions
};
