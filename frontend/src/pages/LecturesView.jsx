import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Video,
  Play,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  FileText,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  GraduationCap,
  Save,
  AlertCircle,
  Copy,
  Check,
  X,
  ExternalLink,
  Printer,
  SearchX,
  FileQuestion,
  Send,
  MessageSquare
} from 'lucide-react';
import AcademicMarkdown from '../components/AcademicMarkdown.jsx';
import CortexGpuIcon from '../components/CortexGpuIcon.jsx';

/**
 * Robust extraction of the 11-character YouTube Video ID from any standard or short URL
 */
export function extractYouTubeId(urlOrId) {
  if (!urlOrId) return '';
  if (typeof urlOrId !== 'string') return '';
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|[?&]v=)([^#&?]*)/);
  return (match && match[1]?.length === 11) ? match[1] : '';
}

/**
 * Format raw seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const secNum = Math.floor(seconds);
  const h = Math.floor(secNum / 3600);
  const m = Math.floor((secNum % 3600) / 60);
  const s = secNum % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function LecturesView({
  user,
  API_BASE = '/api',
  videoLectures = [],
  selectedLecture,
  setSelectedLecture,
  location,
  navigate
}) {
  // Extract ?v= query parameter directly from URL location
  const queryVideoId = new URLSearchParams(location?.search || window.location.search).get('v');

  // Active video player and telemetry states
  const [activeLecture, setActiveLecture] = useState(null);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerState, setPlayerState] = useState(-1);
  const [sdkReady, setSdkReady] = useState(false);

  const localStorageKey = useMemo(() => {
    const sId = user?.studentId || user?.username || user?.id || user?._id || 'guest';
    return `bics_lecture_progress_${sId}`;
  }, [user]);

  // Student progress cache: { [lectureIdOrYoutubeId]: { currentTime, duration, percent, completed, watchedSeconds, personalNotes } }
  // Initialized from localStorage cache for instant zero-latency loading
  const [progressMap, setProgressMap] = useState(() => {
    try {
      const sId = user?.studentId || user?.username || user?.id || user?._id || 'guest';
      const stored = localStorage.getItem(`bics_lecture_progress_${sId}`);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  });

  // UI Drawer / Tabs
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' (Lecture Synopsis) | 'notes' (Personal Notes)
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState({});
  const [copiedLink, setCopiedLink] = useState(false);

  // Lecture Synopsis State (Loaded directly via backend)
  const [aiSummary, setAiSummary] = useState(null);
  const [isSynopsisLoading, setIsSynopsisLoading] = useState(false);

  // BICS Cortex "Ask Questions" Side Panel States
  const [isAskQuestionOpen, setIsAskQuestionOpen] = useState(false);
  const [shouldRenderCortex, setShouldRenderCortex] = useState(false);
  const [cortexAnimClass, setCortexAnimClass] = useState('cortex-panel-closed');
  const [cortexMessages, setCortexMessages] = useState([]);
  const [cortexInput, setCortexInput] = useState('');
  const [isCortexThinking, setIsCortexThinking] = useState(false);
  const [isCortexStreaming, setIsCortexStreaming] = useState(false);
  const [cortexError, setCortexError] = useState(null);
  const [cortexFollowups, setCortexFollowups] = useState([]);
  const [isChatHistoryLoading, setIsChatHistoryLoading] = useState(false);
  const chatMessagesContainerRef = useRef(null);
  const cortexStreamTimerRef = useRef(null);

  // Smooth entrance & exit transition coordinator for Cortex panel & curriculum drawer
  useEffect(() => {
    let timer;
    if (isAskQuestionOpen) {
      setShouldRenderCortex(true);
      timer = setTimeout(() => {
        setCortexAnimClass('cortex-panel-open');
      }, 25);
      return () => clearTimeout(timer);
    } else {
      setCortexAnimClass('cortex-panel-closed');
      timer = setTimeout(() => {
        setShouldRenderCortex(false);
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [isAskQuestionOpen]);

  // Student Personal Notes
  const [studentNotes, setStudentNotes] = useState('');

  // Dynamic measuring for the sliding tab indicator underline
  const summaryTabRef = useRef(null);
  const notesTabRef = useRef(null);
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

  const updateTabIndicator = useCallback(() => {
    const activeRef = activeTab === 'summary' ? summaryTabRef.current : notesTabRef.current;
    if (activeRef && activeRef.offsetWidth > 0) {
      setTabIndicatorStyle({
        left: activeRef.offsetLeft,
        width: activeRef.offsetWidth,
        opacity: 1
      });
    }
  }, [activeTab]);

  useEffect(() => {
    updateTabIndicator();
    // Re-check after activeLecture mounts or fonts finish loading
    const t1 = setTimeout(updateTabIndicator, 50);
    const t2 = setTimeout(updateTabIndicator, 200);
    window.addEventListener('resize', updateTabIndicator);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', updateTabIndicator);
    };
  }, [activeTab, activeLecture?._id, activeLecture?.id, updateTabIndicator]);
  const [isNotesSaved, setIsNotesSaved] = useState(false);

  // Refs for tracking system watch time
  const playerRef = useRef(null);
  const isPlayerReadyRef = useRef(false);
  const pollingIntervalRef = useRef(null);
  const saveDebounceTimeoutRef = useRef(null);
  const watchedSecondsSetRef = useRef(new Set()); // Set of integer seconds physically watched
  const lastActiveLectureKeyRef = useRef('');
  const lastSyncTimeRef = useRef(0);
  const activeLectureRef = useRef(activeLecture);

  useEffect(() => {
    activeLectureRef.current = activeLecture;
  }, [activeLecture]);

  const studentId = user?.studentId || user?.username || user?.id || user?._id || '';

  // 1. Load YouTube IFrame API script tag once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setSdkReady(true);
      return;
    }

    if (!document.getElementById('youtube-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(tag, firstScript);
      } else {
        document.body.appendChild(tag);
      }
    }

    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousOnReady === 'function') previousOnReady();
      setSdkReady(true);
    };

    const checkInterval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        setSdkReady(true);
        clearInterval(checkInterval);
      }
    }, 300);

    return () => clearInterval(checkInterval);
  }, []);

  // 2. Fetch candidate's existing lecture progress on mount and sync with local cache
  useEffect(() => {
    if (!studentId) return;

    fetch(`${API_BASE}/student/lecture-progress?studentId=${encodeURIComponent(studentId)}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.progress) {
          setProgressMap(prev => {
            const merged = { ...prev };
            Object.entries(data.progress).forEach(([key, srvVal]) => {
              const localVal = prev[key];
              if (!localVal) {
                merged[key] = srvVal;
              } else {
                const maxPercent = Math.max(localVal.percent || 0, srvVal.percent || 0);
                const maxCurTime = Math.max(localVal.currentTime || 0, srvVal.currentTime || 0);
                const maxDuration = srvVal.duration || localVal.duration || 0;
                const maxWatched = Math.max(localVal.watchedSeconds || 0, srvVal.watchedSeconds || 0, Math.floor(maxCurTime));
                const isCompleted = localVal.completed || srvVal.completed || maxPercent >= 85;

                const mergedNotes = (localVal.personalNotes && String(localVal.personalNotes).trim())
                  ? localVal.personalNotes
                  : (srvVal.personalNotes || '');

                merged[key] = {
                  ...srvVal,
                  ...localVal,
                  currentTime: maxCurTime,
                  duration: maxDuration,
                  percent: maxPercent,
                  watchedSeconds: maxWatched,
                  completed: isCompleted,
                  personalNotes: mergedNotes,
                  lastWatchedAt: (localVal.lastWatchedAt && new Date(localVal.lastWatchedAt) > new Date(srvVal.lastWatchedAt || 0))
                    ? localVal.lastWatchedAt
                    : (srvVal.lastWatchedAt || localVal.lastWatchedAt)
                };
              }
            });

            // Ensure every lecture is indexed by both its DB ID and its YouTube ID
            (videoLectures || []).forEach(l => {
              const yId = extractYouTubeId(l.youtubeUrl);
              const lId = l._id || l.id;
              const found = merged[lId] || merged[yId] || (l._id ? merged[l._id] : null);
              if (found) {
                if (lId) merged[lId] = found;
                if (l._id) merged[l._id] = found;
                if (yId) merged[yId] = found;
              }
            });
            try {
              localStorage.setItem(localStorageKey, JSON.stringify(merged));
            } catch (e) {}

            // If activeLecture has notes in progress response, populate studentNotes
            if (activeLectureRef.current) {
              const current = activeLectureRef.current;
              const yId = extractYouTubeId(current.youtubeUrl);
              const p = merged[current._id] || merged[current.id] || (yId ? merged[yId] : null);
              if (p && p.personalNotes) {
                setStudentNotes(prevNotes => prevNotes && prevNotes.trim() ? prevNotes : p.personalNotes);
              }
            }

            return merged;
          });
        }
      })
      .catch(err => console.error('[Progress Fetch Error]', err));
  }, [studentId, API_BASE, videoLectures, localStorageKey]);

  // 3. Canonical Section Deduplication: Normalize and group lectures cleanly
  const canonicalSections = useMemo(() => {
    const map = new Map();
    videoLectures.forEach((lec) => {
      const raw = lec.section || 'General Coursework';
      const key = raw.trim().toUpperCase();
      if (!map.has(key)) {
        map.set(key, {
          title: raw.trim(),
          lectures: []
        });
      }
      map.get(key).lectures.push(lec);
    });
    return Array.from(map.values());
  }, [videoLectures]);

  // 4. Overall Course Progress Calculation: (Sum of lecture percent) / Total Lectures
  const overallProgressStats = useMemo(() => {
    if (!videoLectures || videoLectures.length === 0) {
      return { percentage: 0, completedCount: 0, total: 0 };
    }
    let totalPct = 0;
    let completedCount = 0;

    videoLectures.forEach(l => {
      const yId = extractYouTubeId(l.youtubeUrl);
      const prog = progressMap[l._id] || progressMap[l.id] || progressMap[yId] || {};
      const pct = prog.percent || (prog.completed ? 100 : 0);
      totalPct += pct;
      if (prog.completed || pct >= 85) {
        completedCount++;
      }
    });

    const averagePct = Math.round(totalPct / videoLectures.length);
    return {
      percentage: Math.min(100, Math.max(0, averagePct)),
      completedCount,
      total: videoLectures.length
    };
  }, [videoLectures, progressMap]);

  // 5. Synchronize URL query parameter ?v=... and activeLecture
  // STRICT RULE: Only synchronize when route is specifically /coursework/lectures
  useEffect(() => {
    if (!videoLectures || videoLectures.length === 0) return;

    const currentPath = (location?.pathname || window.location.pathname || '');
    const isLecturesRoute = currentPath === '/coursework/lectures' || currentPath.endsWith('/coursework/lectures');

    if (!isLecturesRoute) {
      return;
    }

    if (queryVideoId) {
      const found = videoLectures.find(l => {
        const yId = extractYouTubeId(l.youtubeUrl);
        return yId === queryVideoId || l.youtubeId === queryVideoId;
      });

      if (found) {
        setActiveLecture(found);
        if (typeof setSelectedLecture === 'function') setSelectedLecture(found);
      } else {
        const first = videoLectures[0];
        const firstId = extractYouTubeId(first.youtubeUrl);
        setActiveLecture(first);
        if (typeof setSelectedLecture === 'function') setSelectedLecture(first);
        if (firstId && navigate) {
          navigate(`/coursework/lectures?v=${firstId}`, { replace: true });
        }
      }
    } else {
      const first = selectedLecture || videoLectures[0];
      const firstId = extractYouTubeId(first.youtubeUrl);
      setActiveLecture(first);
      if (typeof setSelectedLecture === 'function') setSelectedLecture(first);
      if (firstId && navigate) {
        navigate(`/coursework/lectures?v=${firstId}`, { replace: true });
      }
    }
  }, [videoLectures, queryVideoId, location?.pathname]);

  // Fetch saved chat history for this lecture and student (isolated per video lecture)
  const fetchCortexHistory = useCallback(async (lecture, { withDelay = false } = {}) => {
    if (!lecture) return;
    const targetId = lecture._id || lecture.id || extractYouTubeId(lecture.youtubeUrl);
    if (!targetId) return;

    const cacheKey = `bics_cortex_chat_${studentId || 'default'}_${targetId}`;

    if (withDelay) {
      setIsChatHistoryLoading(true);
    }

    // 1. Check local lecture cache
    let cachedList = null;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedList = parsed;
        }
      }
    } catch (e) {}

    // When withDelay is true, hold reveal until the 650ms slide and resize transition has settled
    const delayMs = withDelay ? 650 : 0;
    const startTime = Date.now();

    const revealMessages = (messages) => {
      setCortexMessages(messages || []);
      setIsChatHistoryLoading(false);
      setTimeout(() => {
        if (chatMessagesContainerRef.current) {
          chatMessagesContainerRef.current.scrollTo({
            top: chatMessagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 50);
    };

    // 2. Fetch latest verified chat from database
    let latestHistory = cachedList;
    try {
      const res = await fetch(`${API_BASE}/video-lectures/${targetId}/chat?studentId=${encodeURIComponent(studentId || 'default_student')}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.chatHistory)) {
        latestHistory = data.chatHistory;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data.chatHistory));
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[Cortex Chat History Fetch Notice]', err);
    }

    // 3. Reveal once transition is complete (guarantees zero re-renders mid-animation)
    const elapsed = Date.now() - startTime;
    const remainingDelay = Math.max(0, delayMs - elapsed);

    if (remainingDelay > 0) {
      setTimeout(() => {
        revealMessages(latestHistory);
      }, remainingDelay);
    } else {
      revealMessages(latestHistory);
    }
  }, [studentId, API_BASE]);

  // Sync personal notes, watch history, and restore position when activeLecture updates
  useEffect(() => {
    if (!activeLecture) return;
    const activeLecId = String(activeLecture._id || activeLecture.id || extractYouTubeId(activeLecture.youtubeUrl));
    const yId = extractYouTubeId(activeLecture.youtubeUrl);
    const savedProg = progressMap[activeLecture._id] || progressMap[activeLecture.id] || (yId ? progressMap[yId] : {}) || {};

    const isNewLecture = lastActiveLectureKeyRef.current !== activeLecId;
    if (isNewLecture) {
      lastActiveLectureKeyRef.current = activeLecId;
      setStudentNotes(savedProg.personalNotes || '');
      setIsNotesSaved(false);

      // Dedicated fresh watch set for this specific lecture
      const freshSet = new Set();
      const dur = savedProg.duration || 0;
      const pctSecs = dur > 0 && savedProg.percent ? Math.floor((savedProg.percent / 100) * dur) : 0;
      const existingWatchedSecs = Math.max(savedProg.watchedSeconds || 0, Math.floor(savedProg.currentTime || 0), pctSecs);
      for (let s = 0; s < existingWatchedSecs; s++) {
        freshSet.add(s);
      }
      watchedSecondsSetRef.current = freshSet;

      // Automatically load and isolate chats for this new lecture from DB
      fetchCortexHistory(activeLecture);
    }

    // Restore time to UI if not actively playing
    if (savedProg.currentTime && (!playerRef.current || playerState !== 1)) {
      setPlayerCurrentTime(savedProg.currentTime);
      if (savedProg.duration) setPlayerDuration(savedProg.duration);
    } else if (!savedProg.currentTime && (!playerRef.current || playerState !== 1)) {
      setPlayerCurrentTime(0);
      if (savedProg.duration) setPlayerDuration(savedProg.duration);
    }

    // Check if lecture already has summary in state, otherwise load via backend synopsis loader
    if (activeLecture.aiSummary && activeLecture.aiSummary.synopsis) {
      setAiSummary(activeLecture.aiSummary);
      setIsSynopsisLoading(false);
    } else if (isNewLecture) {
      setAiSummary(null);
      loadLectureSynopsis(activeLecture);
    }
  }, [activeLecture, fetchCortexHistory]);

  // Ensure latest chat is loaded whenever Cortex panel is opened (slowed down slightly to match panel slide-in)
  useEffect(() => {
    if (isAskQuestionOpen && activeLecture) {
      fetchCortexHistory(activeLecture, { withDelay: true });
    }
  }, [isAskQuestionOpen, activeLecture, fetchCortexHistory]);

  // Automatically open the section containing the loading/active lecture, keep the rest closed
  useEffect(() => {
    if (!activeLecture) return;
    const secName = (activeLecture.section || 'General Coursework').trim();
    const matchingSec = (canonicalSections || []).find(s => s.title.toUpperCase() === secName.toUpperCase());
    const targetTitle = matchingSec ? matchingSec.title : secName;
    setOpenSections({ [targetTitle]: true });
  }, [activeLecture?._id, activeLecture?.section, canonicalSections]);

  // Backend Synopsis Loader: loads or generates simple synopsis for active lecture
  const loadLectureSynopsis = async (lecture) => {
    if (!lecture) return;
    const targetId = lecture._id || lecture.id || extractYouTubeId(lecture.youtubeUrl);
    setIsSynopsisLoading(true);
    try {
      const res = await fetch(`${API_BASE}/video-lectures/${targetId}/summary`);
      const data = await res.json();
      if (res.ok && data.summary && data.summary.synopsis) {
        setAiSummary(data.summary);
        if (lecture) {
          lecture.aiSummary = data.summary;
        }
      } else {
        setAiSummary(null);
      }
    } catch (err) {
      console.warn('[Lecture Synopsis Load Notice]', err);
    } finally {
      setIsSynopsisLoading(false);
    }
  };

  // Convert (MM:SS) string to integer seconds
  const parseTimestampToSeconds = (ts) => {
    if (!ts) return 0;
    // Extract first time if a range like "03:03 - 05:52"
    const firstPart = ts.split('-')[0].trim();
    const parts = firstPart.split(':').map(Number);
    if (parts.length === 2) {
      return (parts[0] * 60) + parts[1];
    } else if (parts.length === 3) {
      return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }
    return 0;
  };

  // Jump video to timestamp via YouTube API
  const handleSeekToTimestamp = (tsString) => {
    const secs = parseTimestampToSeconds(tsString);
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(secs, true);
        if (typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      } catch (e) {
        console.warn('[Cortex Seek Error]', e);
      }
    }
  };


  // Send question to BICS Cortex
  const handleSendCortexQuestion = async (queryText) => {
    const text = (queryText || cortexInput || '').trim();
    if (!text || !activeLecture || isCortexThinking || isCortexStreaming) return;

    setCortexError(null);
    setCortexInput('');

    // Optimistically append user message
    const optimisticUserMsg = {
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    setCortexMessages(prev => [...prev, optimisticUserMsg]);
    setIsCortexThinking(true);

    // Scroll chat message container internally (never scroll page window)
    setTimeout(() => {
      if (chatMessagesContainerRef.current) {
        chatMessagesContainerRef.current.scrollTo({
          top: chatMessagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);

    const targetId = activeLecture._id || activeLecture.id || extractYouTubeId(activeLecture.youtubeUrl);

    try {
      const res = await fetch(`${API_BASE}/video-lectures/${targetId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          studentId,
          history: cortexMessages.slice(-6),
          lectureContext: {
            youtubeUrl: activeLecture.youtubeUrl
          }
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'BICS Cortex was unable to process your question.');
      }

      // Stop thinking indicator
      setIsCortexThinking(false);

      // Start word-by-word response streaming
      const fullAnswer = data.answer || '';
      const tokens = fullAnswer.match(/\S+|\s+/g) || [fullAnswer];
      let currWordIdx = 0;
      setIsCortexStreaming(true);

      // Append assistant message initialized with empty string
      setCortexMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          provider: data.provider || 'BICS Cortex'
        }
      ]);

      if (cortexStreamTimerRef.current) {
        clearInterval(cortexStreamTimerRef.current);
      }

      // Smooth cadence: reveal 2 words every 24ms
      cortexStreamTimerRef.current = setInterval(() => {
        currWordIdx += 2;
        if (currWordIdx >= tokens.length) {
          clearInterval(cortexStreamTimerRef.current);
          cortexStreamTimerRef.current = null;
          setIsCortexStreaming(false);

          setCortexMessages(prev => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
              next[lastIdx] = { ...next[lastIdx], content: fullAnswer };
            }
            try {
              const currentLec = activeLectureRef.current || activeLecture;
              const targetId = currentLec?._id || currentLec?.id || extractYouTubeId(currentLec?.youtubeUrl || '');
              if (targetId) {
                const cacheKey = `bics_cortex_chat_${studentId || 'default'}_${targetId}`;
                localStorage.setItem(cacheKey, JSON.stringify(next));
              }
            } catch (e) {}
            return next;
          });

          if (Array.isArray(data.suggestedFollowups)) {
            setCortexFollowups(data.suggestedFollowups);
          }
        } else {
          const partialAnswer = tokens.slice(0, currWordIdx).join('');
          setCortexMessages(prev => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].role === 'assistant') {
              next[lastIdx] = { ...next[lastIdx], content: partialAnswer };
            }
            return next;
          });
        }

        if (chatMessagesContainerRef.current) {
          chatMessagesContainerRef.current.scrollTo({
            top: chatMessagesContainerRef.current.scrollHeight,
            behavior: 'auto'
          });
        }
      }, 24);

    } catch (err) {
      console.error('[Cortex Ask Error]', err);
      setCortexError(err.message || 'Failed to connect to BICS Cortex. Please try again.');
      setIsCortexThinking(false);
      setIsCortexStreaming(false);
    }
  };

  // Auto-scroll ONLY inside the chat messages container when new messages arrive (NEVER scroll the browser window)
  useEffect(() => {
    if (isAskQuestionOpen && chatMessagesContainerRef.current) {
      chatMessagesContainerRef.current.scrollTo({
        top: chatMessagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [cortexMessages, isCortexThinking]);

  // Cleanup streaming timer on unmount
  useEffect(() => {
    return () => {
      if (cortexStreamTimerRef.current) {
        clearInterval(cortexStreamTimerRef.current);
      }
    };
  }, []);

  // Load chat history when activeLecture changes
  useEffect(() => {
    if (activeLecture) {
      fetchCortexHistory(activeLecture);
      setCortexError(null);
    }
  }, [activeLecture?._id, activeLecture?.id]);

  // Active Video ID extraction
  const activeVideoId = useMemo(() => {
    return activeLecture ? extractYouTubeId(activeLecture.youtubeUrl) : '';
  }, [activeLecture]);

  // 6. Handle YouTube Player Initialization & Video Swapping with Saved Time Restoration
  useEffect(() => {
    if (!sdkReady || !activeVideoId) return;

    const iframe = playerRef.current && typeof playerRef.current.getIframe === 'function' ? playerRef.current.getIframe() : null;
    const isAttached = iframe && iframe.isConnected && document.body.contains(iframe);

    const yId = activeVideoId;
    const saved = progressMap[activeLecture?._id] || progressMap[activeLecture?.id] || progressMap[yId] || {};
    const startSec = (saved.currentTime && saved.currentTime > 2 && !saved.completed) ? Math.floor(saved.currentTime) : 0;

    if (isAttached && isPlayerReadyRef.current && typeof playerRef.current.loadVideoById === 'function') {
      try {
        playerRef.current.loadVideoById({
          videoId: activeVideoId,
          startSeconds: startSec
        });
      } catch (err) {
        console.error('[YT Player Load Error]', err);
      }
      return;
    }

    if (playerRef.current) {
      try {
        if (typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch (e) {}
      playerRef.current = null;
      isPlayerReadyRef.current = false;
    }

    const container = document.getElementById('bics-yt-telemetry-player');
    if (!container || !window.YT || !window.YT.Player) return;

    try {
      isPlayerReadyRef.current = false;
      playerRef.current = new window.YT.Player('bics-yt-telemetry-player', {
        videoId: activeVideoId,
        playerVars: {
          enablejsapi: 1,
          origin: window.location.origin,
          rel: 0,
          start: startSec,
          modestbranding: 1
        },
        events: {
          onReady: (event) => {
            isPlayerReadyRef.current = true;
            if (startSec > 0) {
              try {
                event.target.seekTo(startSec, true);
              } catch (e) {}
            }
          },
          onStateChange: (event) => {
            setPlayerState(event.data);
            if (event.data === window.YT.PlayerState.PLAYING) {
              startProgressPoller();
            } else {
              stopProgressPoller();
              flushProgressUpdate();
            }
          }
        }
      });
    } catch (err) {
      console.error('[YT Player Init Error]', err);
    }

    return () => {
      stopProgressPoller();
    };
  }, [sdkReady, activeVideoId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProgressPoller();
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          }
        } catch (e) {}
        playerRef.current = null;
        isPlayerReadyRef.current = false;
      }
    };
  }, []);

  // Telemetry Poller: ACCUMULATES GENUINELY WATCHED SECONDS TO PREVENT FAST-SEEK GAMING
  const startProgressPoller = () => {
    stopProgressPoller();
    pollingIntervalRef.current = setInterval(() => {
      const currentLecture = activeLectureRef.current;
      if (!currentLecture || !isPlayerReadyRef.current || !playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
      const iframe = typeof playerRef.current.getIframe === 'function' ? playerRef.current.getIframe() : null;
      if (!iframe || !iframe.isConnected) return;

      try {
        const cur = playerRef.current.getCurrentTime() || 0;
        const dur = playerRef.current.getDuration() || 0;
        setPlayerCurrentTime(cur);
        setPlayerDuration(dur);

        if (dur > 0) {
          // Accumulate the current integer second into the distinct watched set
          const currentSecondInt = Math.floor(cur);
          watchedSecondsSetRef.current.add(currentSecondInt);
          const distinctSecondsWatched = watchedSecondsSetRef.current.size;

          // Pure system-driven calculation based on genuine watch duration
          const pct = Math.min(100, Math.round((distinctSecondsWatched / dur) * 100));
          const isComp = pct >= 85 || distinctSecondsWatched >= (dur * 0.85);

          updateLocalProgress(currentLecture, cur, dur, pct, distinctSecondsWatched, isComp);

          // Continuous periodic sync every 3 seconds so progress is never lost during continuous playback
          const now = Date.now();
          if (now - lastSyncTimeRef.current >= 3000) {
            lastSyncTimeRef.current = now;
            persistProgressToBackend(currentLecture, cur, dur, pct, distinctSecondsWatched, isComp);
          }
        }
      } catch (err) {}
    }, 1000);
  };

  const stopProgressPoller = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Update in-memory progress and trigger debounced sync
  const updateLocalProgress = (lecture, currentTime, duration, percent, watchedSeconds, completed) => {
    if (!lecture) return;
    const lectureId = lecture._id || lecture.id;
    const yId = extractYouTubeId(lecture.youtubeUrl);

    setProgressMap(prev => {
      const existing = prev[lectureId] || (yId ? prev[yId] : {}) || {};
      const newPct = Math.max(existing.percent || 0, percent);
      const isCompleted = existing.completed || completed || newPct >= 85;
      const totalWatched = Math.max(existing.watchedSeconds || 0, watchedSeconds || 0);
      const newCur = Math.max(existing.currentTime || 0, currentTime || 0);

      const updated = {
        ...existing,
        currentTime: newCur,
        duration: duration || existing.duration || 0,
        percent: newPct,
        watchedSeconds: totalWatched,
        completed: isCompleted,
        lastWatchedAt: new Date()
      };

      const next = {
        ...prev,
        ...(lectureId ? { [lectureId]: updated } : {}),
        ...(yId ? { [yId]: updated } : {})
      };

      try {
        localStorage.setItem(localStorageKey, JSON.stringify(next));
      } catch (e) {}

      return next;
    });

    if (saveDebounceTimeoutRef.current) {
      clearTimeout(saveDebounceTimeoutRef.current);
    }
    saveDebounceTimeoutRef.current = setTimeout(() => {
      persistProgressToBackend(lecture, currentTime, duration, percent, watchedSeconds, completed);
    }, 3000);
  };

  const flushProgressUpdate = () => {
    const currentLecture = activeLectureRef.current;
    if (!currentLecture || !isPlayerReadyRef.current || !playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
    const iframe = typeof playerRef.current.getIframe === 'function' ? playerRef.current.getIframe() : null;
    if (!iframe || !iframe.isConnected) return;

    try {
      const cur = playerRef.current.getCurrentTime() || 0;
      const dur = playerRef.current.getDuration() || 0;
      if (dur > 0) {
        const distinctSecondsWatched = watchedSecondsSetRef.current.size;
        const pct = Math.min(100, Math.round((distinctSecondsWatched / dur) * 100));
        const isComp = pct >= 85 || distinctSecondsWatched >= (dur * 0.85);
        lastSyncTimeRef.current = Date.now();
        persistProgressToBackend(currentLecture, cur, dur, pct, distinctSecondsWatched, isComp);
      }
    } catch (e) {}
  };

  const persistProgressToBackend = async (lecture, currentTime, duration, percent, watchedSeconds, completed, customNotes, options = {}) => {
    if (!studentId || !lecture) return;
    const targetId = lecture._id || lecture.id || extractYouTubeId(lecture.youtubeUrl);

    const payload = {
      studentId,
      currentTime,
      duration,
      percent,
      watchedSeconds,
      completed
    };
    if (customNotes !== undefined) {
      payload.personalNotes = customNotes;
    }

    try {
      await fetch(`${API_BASE}/video-lectures/${targetId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: !!options.keepalive
      });
    } catch (err) {
      console.error('[Progress Save Error]', err);
    }
  };

  // Immediate persistence on window refresh, tab hide, or unload
  useEffect(() => {
    const handleFlushOnExit = () => {
      const currentLecture = activeLectureRef.current;
      if (!currentLecture || !playerRef.current) return;
      try {
        const cur = (typeof playerRef.current.getCurrentTime === 'function') ? (playerRef.current.getCurrentTime() || 0) : 0;
        const dur = (typeof playerRef.current.getDuration === 'function') ? (playerRef.current.getDuration() || 0) : 0;
        if (dur > 0) {
          const currentSecondInt = Math.floor(cur);
          watchedSecondsSetRef.current.add(currentSecondInt);
          const distinctSecondsWatched = watchedSecondsSetRef.current.size;
          const pct = Math.min(100, Math.round((distinctSecondsWatched / dur) * 100));
          const isComp = pct >= 85 || distinctSecondsWatched >= (dur * 0.85);

          // Update localStorage synchronously
          const lectureId = currentLecture._id || currentLecture.id;
          const yId = extractYouTubeId(currentLecture.youtubeUrl);
          try {
            const raw = localStorage.getItem(localStorageKey);
            const parsed = raw ? JSON.parse(raw) : {};
            const existing = parsed[lectureId] || parsed[yId] || {};
            const maxPct = Math.max(existing.percent || 0, pct);
            const entry = {
              ...existing,
              currentTime: Math.max(existing.currentTime || 0, cur),
              duration: dur || existing.duration || 0,
              percent: maxPct,
              watchedSeconds: Math.max(existing.watchedSeconds || 0, distinctSecondsWatched),
              completed: existing.completed || isComp || maxPct >= 85,
              lastWatchedAt: new Date()
            };
            parsed[lectureId] = entry;
            if (yId) parsed[yId] = entry;
            localStorage.setItem(localStorageKey, JSON.stringify(parsed));
          } catch (e) {}

          // Flush to backend with keepalive
          persistProgressToBackend(currentLecture, cur, dur, pct, distinctSecondsWatched, isComp, studentNotes, { keepalive: true });
        }
      } catch (e) {}
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFlushOnExit();
      }
    };

    window.addEventListener('pagehide', handleFlushOnExit);
    window.addEventListener('beforeunload', handleFlushOnExit);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handleFlushOnExit);
      window.removeEventListener('beforeunload', handleFlushOnExit);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeLecture, studentId, studentNotes, localStorageKey]);

  // Save Student Notes
  const handleSaveNotes = () => {
    const currentLecture = activeLectureRef.current || activeLecture;
    if (!currentLecture) return;
    const lectureId = currentLecture._id || currentLecture.id;
    const yId = extractYouTubeId(currentLecture.youtubeUrl);
    const existing = progressMap[lectureId] || (yId ? progressMap[yId] : {}) || {};

    const updated = {
      ...existing,
      personalNotes: studentNotes,
      lastWatchedAt: new Date()
    };

    setProgressMap(prev => {
      const next = {
        ...prev,
        ...(lectureId ? { [lectureId]: updated } : {}),
        ...(yId ? { [yId]: updated } : {})
      };
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    persistProgressToBackend(
      currentLecture,
      existing.currentTime || 0,
      existing.duration || 0,
      existing.percent || 0,
      existing.watchedSeconds || 0,
      existing.completed || false,
      studentNotes
    );
    setIsNotesSaved(true);
    setTimeout(() => setIsNotesSaved(false), 3000);
  };

  // Deep Link Selection Handler: STRICTLY routes to /coursework/lectures?v=...
  const handleSelectLecture = (lec) => {
    if (!lec) return;
    flushProgressUpdate();
    stopProgressPoller();
    activeLectureRef.current = lec;
    setActiveLecture(lec);
    fetchCortexHistory(lec);
    if (typeof setSelectedLecture === 'function') setSelectedLecture(lec);
    const vId = extractYouTubeId(lec.youtubeUrl);
    if (navigate) {
      navigate(`/coursework/lectures?v=${vId}`);
    }
  };

  // Flattened list of all canonical lectures preserving display order across all sections
  const allLecturesOrdered = useMemo(() => {
    const list = [];
    (canonicalSections || []).forEach(sec => {
      (sec.lectures || []).forEach(lec => {
        list.push(lec);
      });
    });
    return list.length > 0 ? list : videoLectures;
  }, [canonicalSections, videoLectures]);

  const currentIndex = useMemo(() => {
    if (!activeLecture || !allLecturesOrdered || allLecturesOrdered.length === 0) return -1;
    const activeLecId = String(activeLecture._id || activeLecture.id || '');
    const activeYId = extractYouTubeId(activeLecture.youtubeUrl);

    return allLecturesOrdered.findIndex(l => {
      const lId = String(l._id || l.id || '');
      const lYId = extractYouTubeId(l.youtubeUrl);
      if (activeLecId && lId && activeLecId === lId) return true;
      if (activeYId && lYId && activeYId === lYId) return true;
      return false;
    });
  }, [allLecturesOrdered, activeLecture]);

  const handleNextLecture = () => {
    if (currentIndex >= 0 && currentIndex < allLecturesOrdered.length - 1) {
      handleSelectLecture(allLecturesOrdered[currentIndex + 1]);
    }
  };

  const handlePrevLecture = () => {
    if (currentIndex > 0) {
      handleSelectLecture(allLecturesOrdered[currentIndex - 1]);
    }
  };

  const handleCopyDeepLink = () => {
    const canonicalUrl = `${window.location.origin}/main/coursework/lectures?v=${activeVideoId}`;
    navigator.clipboard.writeText(canonicalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return canonicalSections;
    const q = searchQuery.toLowerCase();
    return canonicalSections.map(sec => {
      const filtered = sec.lectures.filter(l =>
        l.title.toLowerCase().includes(q) || sec.title.toLowerCase().includes(q)
      );
      return {
        ...sec,
        lectures: filtered
      };
    }).filter(sec => sec.lectures.length > 0);
  }, [canonicalSections, searchQuery]);

  const currentLectureProgress = useMemo(() => {
    if (!activeLecture) return { percent: 0, completed: false, currentTime: 0, duration: 0 };
    const yId = extractYouTubeId(activeLecture.youtubeUrl);
    const p = progressMap[activeLecture._id] || progressMap[activeLecture.id] || progressMap[yId] || {};
    return {
      percent: p.percent || (p.completed ? 100 : 0),
      completed: !!p.completed || (p.percent >= 85),
      currentTime: (playerCurrentTime > 0 ? playerCurrentTime : (p.currentTime || 0)),
      duration: (playerDuration > 0 ? playerDuration : (p.duration || 0))
    };
  }, [activeLecture, progressMap, playerCurrentTime, playerDuration]);

  return (
    <div className="cf-card">
      
      <div className="cf-card-title">
        <Video size={16} style={{ color: '#3b5998' }} />
        <span>Course Video Lectures</span>
      </div>

      {videoLectures.length === 0 ? (
        <div className="cf-alert cf-alert-info">No video lectures have been scheduled or uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '12px' }}>
          
          {/* Main Workspace Row: Video Player + [Cortex Side Panel OR Syllabus Side List] */}
          <div className="lecture-workspace-row">
            
            {/* LEFT COLUMN: Video Player, Telemetry Bar, & Student Workspace */}
            <div className={`lecture-video-column ${cortexAnimClass === 'cortex-panel-open' ? 'cortex-open' : ''}`}>
            
            {activeLecture ? (
              <div>
                {/* 1. IFrame Container */}
                <div
                  style={{
                    position: 'relative',
                    paddingBottom: '56.25%',
                    height: 0,
                    overflow: 'hidden',
                    borderRadius: '4px',
                    border: '1px solid #b9c9fe',
                    backgroundColor: '#000',
                    boxShadow: '0 4px 10px rgba(0,33,71,0.06)'
                  }}
                >
                  <div
                    id="bics-yt-telemetry-player"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%'
                    }}
                  />
                </div>

                {/* 2. System-Controlled Real-Time Telemetry Bar (No manual button) */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '9pt' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={14} style={{ color: '#3b5998' }} />
                      <span style={{ fontWeight: '600', color: '#1e293b' }}>
                        Watch Progress: {currentLectureProgress.percent}%
                      </span>
                      {currentLectureProgress.completed && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#16a34a', fontWeight: 'bold', fontSize: '8.5pt' }}>
                          <CheckCircle2 size={13} /> Completed
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '8.5pt' }}>
                      {formatTime(playerCurrentTime || currentLectureProgress.currentTime)} / {formatTime(playerDuration || currentLectureProgress.duration || 0)}
                    </div>
                  </div>

                  {/* System Progress Bar */}
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${currentLectureProgress.percent}%`,
                        height: '100%',
                        backgroundColor: currentLectureProgress.completed ? '#16a34a' : '#3b5998',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>

                {/* 3. Title & Controls Action Bar */}
                <div className="lecture-action-bar">
                  <div className="lecture-title-section">
                    <div style={{ display: 'inline-block', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '3px', marginBottom: '4px' }}>
                      {activeLecture.section}
                    </div>
                    <h2 title={activeLecture.title}>
                      {activeLecture.title}
                    </h2>
                  </div>

                  {/* Action buttons: Ask Cortex, Prev, Next, Share */}
                  <div className="lecture-action-buttons">

                    {/* BICS Cortex "Ask questions" Trigger Button */}
                    <button
                      type="button"
                      onClick={() => setIsAskQuestionOpen(prev => !prev)}
                      title="Ask questions about this video"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: isAskQuestionOpen ? '8.5pt' : '9pt',
                        fontWeight: '600',
                        padding: isAskQuestionOpen ? '5px 12px' : '6px 14px',
                        borderRadius: '9999px',
                        backgroundColor: '#ffffff',
                        color: isAskQuestionOpen ? '#3b5998' : '#1e293b',
                        border: isAskQuestionOpen ? '1.5px solid #3b5998' : '1px solid #cbd5e1',
                        boxShadow: isAskQuestionOpen 
                          ? '0 0 0 2px rgba(59, 89, 152, 0.15), 0 2px 5px rgba(0, 0, 0, 0.04)' 
                          : '0 1px 2px rgba(0, 0, 0, 0.04)',
                        cursor: 'pointer',
                        transition: 'all 0.65s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <CortexGpuIcon size={14} />
                      <span>Ask questions</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrevLecture}
                      disabled={currentIndex <= 0}
                      className="cf-btn-secondary"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: isAskQuestionOpen ? '8pt' : '9pt',
                        padding: isAskQuestionOpen ? '5px 8px' : '6px 10px',
                        opacity: currentIndex <= 0 ? 0.4 : 1,
                        transition: 'all 0.65s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>

                    <button
                      type="button"
                      onClick={handleNextLecture}
                      disabled={currentIndex >= allLecturesOrdered.length - 1}
                      className="cf-btn-secondary"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: isAskQuestionOpen ? '8pt' : '9pt',
                        padding: isAskQuestionOpen ? '5px 8px' : '6px 10px',
                        opacity: currentIndex >= allLecturesOrdered.length - 1 ? 0.4 : 1,
                        transition: 'all 0.65s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      Next <ChevronRight size={14} />
                    </button>

                    {activeVideoId && (
                      <button
                        type="button"
                        onClick={handleCopyDeepLink}
                        title="Copy Deep Link"
                        className="cf-btn-secondary"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: isAskQuestionOpen ? '8pt' : '8.5pt',
                          padding: isAskQuestionOpen ? '5px 8px' : '6px 10px',
                          transition: 'all 0.65s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        {copiedLink ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                        <span>{copiedLink ? 'Copied' : 'Share'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Tab Navigation below player: My Notes & AI Summary Quick Launcher */}
                <div style={{ marginTop: '20px' }}>
                  <div className="lecture-tab-bar-container">
                    <button
                      ref={summaryTabRef}
                      type="button"
                      onClick={() => setActiveTab('summary')}
                      className={`lecture-tab-nav-btn ${activeTab === 'summary' ? 'active' : ''}`}
                    >
                      <Sparkles size={14} style={{ color: activeTab === 'summary' ? '#3b5998' : '#94a3b8', transition: 'color 0.5s cubic-bezier(0.25, 1, 0.35, 1)' }} />
                      Lecture Synopsis
                    </button>

                    <button
                      ref={notesTabRef}
                      type="button"
                      onClick={() => setActiveTab('notes')}
                      className={`lecture-tab-nav-btn ${activeTab === 'notes' ? 'active' : ''}`}
                    >
                      <FileText size={14} style={{ color: activeTab === 'notes' ? '#3b5998' : '#94a3b8', transition: 'color 0.5s cubic-bezier(0.25, 1, 0.35, 1)' }} />
                      My Personal Notes
                    </button>

                    {/* Smooth Dynamic Sliding Underline Indicator */}
                    <div
                      className="lecture-tab-indicator"
                      style={{
                        left: tabIndicatorStyle.width > 0 ? `${tabIndicatorStyle.left}px` : (activeTab === 'summary' ? '0px' : '150px'),
                        width: tabIndicatorStyle.width > 0 ? `${tabIndicatorStyle.width}px` : (activeTab === 'summary' ? '146px' : '158px'),
                        opacity: 1
                      }}
                    />
                  </div>

                  {/* TAB 1: Lecture Synopsis Overview Callout */}
                  {activeTab === 'summary' && (
                    <div key="tab-summary" className="lecture-tab-pane" style={{ padding: '16px 4px' }}>
                      {isSynopsisLoading ? (
                        <div
                          style={{
                            textAlign: 'center',
                            padding: '36px 20px',
                            backgroundColor: '#f8fafd',
                            borderRadius: '4px',
                            border: '1px solid #b9c9fe'
                          }}
                        >
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#3b5998', fontSize: '9.5pt', fontWeight: 'bold' }}>
                            <Sparkles size={16} className="cortex-spin-anim" />
                            <span>Loading Lecture Synopsis...</span>
                          </div>
                          <p style={{ margin: '8px 0 14px 0', fontSize: '8.5pt', color: '#64748b' }}>
                            Loading concise academic synopsis and learning objectives for this lecture.
                          </p>
                          <div
                            style={{
                              height: '4px',
                              maxWidth: '240px',
                              margin: '0 auto',
                              backgroundColor: '#e2e8f0',
                              borderRadius: '2px',
                              overflow: 'hidden'
                            }}
                          >
                            <div className="academic-loader-shimmer" style={{ width: '100%', height: '100%' }} />
                          </div>
                        </div>
                      ) : aiSummary && aiSummary.synopsis ? (
                        <div style={{ backgroundColor: '#f8fafd', border: '1px solid #b9c9fe', borderRadius: '4px', padding: '16px' }}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '10pt', fontWeight: 'bold', color: '#3b5998' }}>
                            Lecture Synopsis
                          </h4>
                          <AcademicMarkdown content={aiSummary.synopsis} />
                        </div>
                      ) : (
                        <div
                          style={{
                            textAlign: 'center',
                            padding: '28px 20px',
                            backgroundColor: '#f8fafd',
                            borderRadius: '4px',
                            border: '1px dashed #cbd5e1'
                          }}
                        >
                          <p style={{ margin: 0, fontSize: '8.5pt', color: '#64748b' }}>
                            No synopsis available for this lecture yet.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: Student Personal Study Notes */}
                  {activeTab === 'notes' && (
                    <div key="tab-notes" className="lecture-tab-pane" style={{ padding: '16px 4px' }}>
                      <p style={{ fontSize: '8.5pt', color: '#64748b', margin: '0 0 8px 0' }}>
                        Your personal timestamped study notes for this lecture. Notes are automatically saved to your student profile.
                      </p>
                      <textarea
                        value={studentNotes}
                        onChange={(e) => setStudentNotes(e.target.value)}
                        placeholder="Write down key takeaways, formulae, doubts, and personal exam pointers here..."
                        style={{
                          width: '100%',
                          minHeight: '140px',
                          padding: '12px',
                          fontSize: '9.5pt',
                          fontFamily: 'inherit',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          lineHeight: '1.5'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '8px', gap: '10px' }}>
                        {isNotesSaved && (
                          <span style={{ fontSize: '8.5pt', color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} /> Saved to Profile
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveNotes}
                          className="cf-btn-primary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '8.5pt', padding: '6px 14px' }}
                        >
                          <Save size={13} /> Save Personal Notes
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="cf-alert cf-alert-info">Select a lecture from the course syllabus to begin playing.</div>
            )}
          </div>

            {/* RIGHT COLUMN SLOT: Holds either Cortex AI Panel or Syllabus List */}
            <div className="lecture-side-slot">
              {/* DOCKED BICS CORTEX AI SIDE PANEL (When shouldRenderCortex === true) */}
              {shouldRenderCortex && (
                <div
                  className={`cortex-panel-container ${cortexAnimClass}`}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '740px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                    overflow: 'hidden'
                  }}
                >
                {/* Panel Header */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    padding: '12px 16px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CortexGpuIcon size={18} />
                    <span style={{ fontSize: '10pt', fontWeight: 'bold', color: '#1e293b' }}>
                      Ask about this video
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAskQuestionOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Close Cortex panel"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Messages Chat Scroll Container */}
                <div
                  ref={chatMessagesContainerRef}
                  style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: '#fcfdfd' }}
                >
                  
                  {/* BICS Cortex Identity & Disclaimer Banner */}
                  <div
                    style={{
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      fontSize: '7.5pt',
                      color: '#475569',
                      lineHeight: '1.45'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <CortexGpuIcon size={12} />
                      <strong style={{ color: '#1e293b' }}>Cortex is the official LLM by BICS Portal.</strong>
                    </div>
                    <span>
                      It can make mistakes, so double-check important theoretical or mathematical information. Answers are grounded in <strong>"{activeLecture?.title}"</strong>.
                    </span>
                  </div>

                  {/* History Initializing Loader (Shown smoothly while panel opens) */}
                  {isChatHistoryLoading && (
                    <div
                      className="cortex-thinking-container"
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div className="cortex-pulse-anim" style={{ display: 'flex', alignItems: 'center' }}>
                          <CortexGpuIcon size={14} spin={true} />
                        </div>
                        <span style={{ fontSize: '8pt', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          BICS CORTEX • Loading Discussion
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                        <div className="academic-loader-shimmer" style={{ height: '11px', width: '100%', borderRadius: '3px' }} />
                        <div className="academic-loader-shimmer" style={{ height: '11px', width: '92%', borderRadius: '3px' }} />
                        <div className="academic-loader-shimmer" style={{ height: '11px', width: '68%', borderRadius: '3px' }} />
                      </div>
                    </div>
                  )}

                  {/* Empty state / Welcome prompt if no messages */}
                  {!isChatHistoryLoading && cortexMessages.length === 0 && !isCortexThinking && (
                    <div style={{ textAlign: 'center', padding: '24px 10px', color: '#64748b' }}>
                      <CortexGpuIcon size={32} style={{ margin: '0 auto 10px auto', display: 'block', opacity: 0.65 }} />
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '9.5pt', fontWeight: 'bold', color: '#334155' }}>
                        Have a question about this lecture?
                      </h4>
                      <p style={{ margin: 0, fontSize: '8.5pt', lineHeight: '1.5' }}>
                        Ask for concept clarifications, code walk-throughs, or timestamped pointers from the video.
                      </p>
                    </div>
                  )}

                  {/* Message Bubble Stream */}
                  {!isChatHistoryLoading && cortexMessages.map((msg, mIdx) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={mIdx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isUser ? 'flex-end' : 'flex-start',
                          gap: '3px'
                        }}
                      >
                        <div
                          className={isUser ? undefined : 'cortex-assistant-bubble'}
                          style={{
                            width: isUser ? 'auto' : '100%',
                            maxWidth: isUser ? '88%' : '100%',
                            padding: isUser ? '8px 12px' : '12px 14px',
                            borderRadius: '6px',
                            fontSize: '9pt',
                            lineHeight: '1.6',
                            backgroundColor: isUser ? '#e8eff7' : '#ffffff',
                            color: '#1e293b',
                            border: isUser ? '1px solid #b9c9fe' : '1px solid #cbd5e1',
                            boxShadow: isUser ? 'none' : '0 1px 3px rgba(0,0,0,0.03)'
                          }}
                        >
                          {!isUser && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <CortexGpuIcon size={14} />
                              <span style={{ fontSize: '8pt', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                BICS CORTEX
                              </span>
                            </div>
                          )}

                          {isUser ? (
                            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                          ) : (
                            <div style={{ width: '100%' }}>
                              <AcademicMarkdown content={msg.content} />
                              {isCortexStreaming && mIdx === cortexMessages.length - 1 && (
                                <span className="typewriter-cursor" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Timestamp quick-chips if assistant mentions timestamps like (03:15) */}
                        {!isUser && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                            {Array.from(new Set(msg.content.match(/\b\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?\b/g) || [])).slice(0, 4).map((ts, tsIdx) => (
                              <button
                                key={tsIdx}
                                type="button"
                                onClick={() => handleSeekToTimestamp(ts)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  fontSize: '7.5pt',
                                  fontFamily: 'monospace',
                                  fontWeight: 'bold',
                                  backgroundColor: '#eff6ff',
                                  color: '#3b5998',
                                  border: '1px solid #b9c9fe',
                                  cursor: 'pointer'
                                }}
                                title={`Jump video to ${ts}`}
                              >
                                <Play size={9} fill="#3b5998" /> {ts}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Thinking State Loader (Matching Reference Image) */}
                  {isCortexThinking && (
                    <div
                      className="cortex-thinking-container"
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <div className="cortex-pulse-anim" style={{ display: 'flex', alignItems: 'center' }}>
                          <CortexGpuIcon size={14} spin={true} />
                        </div>
                        <span style={{ fontSize: '8pt', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          BICS CORTEX
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                        <div
                          className="academic-loader-shimmer"
                          style={{ height: '11px', width: '100%', borderRadius: '3px' }}
                        />
                        <div
                          className="academic-loader-shimmer"
                          style={{ height: '11px', width: '100%', borderRadius: '3px' }}
                        />
                        <div
                          className="academic-loader-shimmer"
                          style={{ height: '11px', width: '100%', borderRadius: '3px' }}
                        />
                        <div
                          className="academic-loader-shimmer"
                          style={{ height: '11px', width: '65%', borderRadius: '3px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Notification */}
                  {cortexError && (
                    <div
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#fff1f2',
                        border: '1px solid #fecdd3',
                        borderRadius: '4px',
                        fontSize: '8.5pt',
                        color: '#9f1239'
                      }}
                    >
                      <span><strong>Notice:</strong> {cortexError}</span>
                    </div>
                  )}
                </div>

                {/* Suggested Followup Chips */}
                {(cortexFollowups.length > 0 || cortexMessages.length === 0) && (
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#f8fafc',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px'
                    }}
                  >
                    {(cortexFollowups.length > 0
                      ? cortexFollowups.slice(0, 3)
                      : [
                          `What are the core concepts covered in this lecture?`,
                          `What are high-probability exam pitfalls for this topic?`,
                          `Can you break down the code/formulas shown?`
                        ]
                    ).map((promptText, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => handleSendCortexQuestion(promptText)}
                        disabled={isCortexThinking || isCortexStreaming}
                        style={{
                          textAlign: 'left',
                          fontSize: '8pt',
                          color: '#334155',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '16px',
                          padding: '5px 12px',
                          cursor: (isCortexThinking || isCortexStreaming) ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendCortexQuestion();
                  }}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#ffffff',
                    borderTop: '1px solid #cbd5e1',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                  }}
                >
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={cortexInput}
                    onChange={(e) => setCortexInput(e.target.value)}
                    disabled={isCortexThinking || isCortexStreaming}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '9pt',
                      borderRadius: '20px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      backgroundColor: '#f8fafc'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!cortexInput.trim() || isCortexThinking || isCortexStreaming}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: cortexInput.trim() && !isCortexThinking && !isCortexStreaming ? '#3b5998' : '#cbd5e1',
                      color: '#ffffff',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: cortexInput.trim() && !isCortexThinking && !isCortexStreaming ? 'pointer' : 'default',
                      flexShrink: 0
                    }}
                    title="Send to Cortex"
                  >
                    <Send size={14} />
                  </button>
                </form>

                {/* Bottom Model Badge */}
                <div
                  style={{
                    backgroundColor: '#f1f5f9',
                    padding: '4px 12px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <CortexGpuIcon size={12} />
                  <span style={{ fontSize: '7pt', color: '#64748b', fontWeight: 'bold' }}>
                    Cortex • Official LLM by BICS Portal
                  </span>
                </div>
              </div>
            )}

            {/* SYLLABUS COLUMN (Shown in top row ONLY when Cortex panel is closed) */}
            {!shouldRenderCortex && (
              <div 
                className="syllabus-side-column-transition"
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                
                {/* 1. Overall Course Progress Header */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '14px 16px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#3b5998' }}>
                      Overall Coursework Progress
                    </span>
                    <span style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#3b5998', fontFamily: 'monospace' }}>
                      {overallProgressStats.percentage}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: `${overallProgressStats.percentage}%`,
                        height: '100%',
                        backgroundColor: '#3b5998',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>

                  <div style={{ fontSize: '8pt', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{overallProgressStats.completedCount} of {overallProgressStats.total} Lectures Completed</span>
                    <span>Average: {overallProgressStats.percentage}%</span>
                  </div>
                </div>

                {/* 2. Search Syllabus Filter */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search lectures & topics..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: searchQuery ? '8px 28px 8px 32px' : '8px 10px 8px 32px',
                      fontSize: '9pt',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      title="Clear filter"
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '8px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* 3. Deduplicated Canonical Sections List or Empty State */}
                <div style={{ maxHeight: '680px', overflowY: 'auto', paddingRight: '4px' }}>
                  {filteredSections.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '40px 16px',
                        backgroundColor: '#ffffff',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '6px',
                        marginTop: '4px'
                      }}
                    >
                      <svg
                        width="64"
                        height="64"
                        viewBox="0 0 64 64"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{ margin: '0 auto 12px auto', display: 'block' }}
                      >
                        <rect x="10" y="14" width="36" height="42" rx="4" fill="#f8fafc" stroke="#b9c9fe" strokeWidth="2" strokeDasharray="3 3" />
                        <line x1="16" y1="24" x2="38" y2="24" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                        <line x1="16" y1="32" x2="34" y2="32" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                        <line x1="16" y1="40" x2="28" y2="40" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                        <circle cx="42" cy="42" r="13" fill="#ffffff" stroke="#3b5998" strokeWidth="2" />
                        <path d="M37 42L47 42" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
                        <line x1="51.5" y1="51.5" x2="58" y2="58" stroke="#3b5998" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                      <h5 style={{ margin: '0 0 6px 0', fontSize: '10pt', fontWeight: 'bold', color: '#334155' }}>
                        No lectures match "{searchQuery}"
                      </h5>
                      <p style={{ margin: '0 0 14px 0', fontSize: '8.5pt', color: '#64748b', lineHeight: '1.45' }}>
                        No modules or lecture topics found matching your query. Check spelling or clear search.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="cf-btn-secondary"
                        style={{ fontSize: '8pt', padding: '4px 12px', cursor: 'pointer' }}
                      >
                        Clear Filter
                      </button>
                    </div>
                  ) : (
                    filteredSections.map((sec, secIdx) => {
                      const isOpen = searchQuery.trim() ? true : !!openSections[sec.title];
                      return (
                        <div key={secIdx} style={{ marginBottom: '14px' }}>
                          <div
                            onClick={() => setOpenSections(prev => ({ ...prev, [sec.title]: !prev[sec.title] }))}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: 'pointer',
                              padding: '10px 14px',
                              backgroundColor: '#f8fafc',
                              borderRadius: '4px',
                              marginBottom: isOpen ? '6px' : '0',
                              border: '1px solid #cbd5e1',
                              transition: 'background-color 0.15s ease'
                            }}
                          >
                            <h4 style={{ margin: 0, fontSize: '8.5pt', fontWeight: 'bold', color: '#3b5998', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {sec.title}
                            </h4>
                            <span className={`lecture-module-chevron ${isOpen ? 'open' : ''}`} style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                              <ChevronDown size={15} />
                            </span>
                          </div>

                          <div className={`lecture-module-accordion ${isOpen ? 'open' : ''}`}>
                            <div className="lecture-module-inner" style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                              {sec.lectures.map((lec, lIdx) => {
                                const lecId = lec._id ? String(lec._id) : (lec.id ? String(lec.id) : '');
                                const activeId = activeLecture?._id ? String(activeLecture._id) : (activeLecture?.id ? String(activeLecture.id) : '');
                                const lecYId = extractYouTubeId(lec.youtubeUrl);
                                const activeYId = activeLecture ? extractYouTubeId(activeLecture.youtubeUrl) : '';
                                const isActive = (activeLecture && ((lecId && activeId && lecId === activeId) || (lecYId && activeYId && lecYId === activeYId)));
                                const prog = progressMap[lec._id] || progressMap[lec.id] || progressMap[lecYId] || {};
                                const pct = prog.percent || (prog.completed ? 100 : 0);
                                const isDone = !!prog.completed || pct >= 85;
                                const isLast = lIdx === sec.lectures.length - 1;
                                const displayIndex = lIdx + 1;

                                return (
                                  <div
                                    key={lIdx}
                                    onClick={() => handleSelectLecture(lec)}
                                    style={{
                                      cursor: 'pointer',
                                      padding: '12px 16px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: '12px',
                                      backgroundColor: isActive ? '#6674cc' : '#ffffff',
                                      color: isActive ? '#ffffff' : '#334155',
                                      borderBottom: isLast ? 'none' : (isActive ? '1px solid #5764be' : '1px solid #eef2f6'),
                                      transition: 'background-color 0.2s ease, color 0.2s ease'
                                    }}
                                  >
                                    <div style={{ fontSize: '9.5pt', fontWeight: isActive ? '600' : '400', lineHeight: '1.45', flex: 1 }}>
                                      {displayIndex}. {lec.title}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                      {isDone ? (
                                        <CheckCircle2 size={15} style={{ color: isActive ? '#ffffff' : '#16a34a' }} />
                                      ) : (
                                        <span style={{ fontSize: '7.5pt', fontWeight: 'bold', fontFamily: 'monospace', color: isActive ? '#ffffff' : (pct > 0 ? '#475569' : '#94a3b8'), backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : (pct > 0 ? '#f1f5f9' : '#f8fafc'), padding: '2px 5px', borderRadius: '3px' }}>
                                          {pct}%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            </div>
          </div>

          {/* CURRICULUM SYLLABUS SECTION (Shifted BELOW video when shouldRenderCortex === true) */}
          {shouldRenderCortex && (
            <div 
              className={`curriculum-drawer-container ${cortexAnimClass === 'cortex-panel-open' ? 'curriculum-drawer-open' : 'curriculum-drawer-closed'}`}
              style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '18px 20px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold', color: '#3b5998' }}>
                    Course Curriculum & Lecture Modules
                  </h3>
                </div>

                {/* Progress bar and search in bottom drawer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${overallProgressStats.percentage}%`, height: '100%', backgroundColor: '#3b5998', transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ fontSize: '7.5pt', color: '#64748b', textAlign: 'left' }}>
                      {overallProgressStats.completedCount} of {overallProgressStats.total} Lectures Completed ({overallProgressStats.percentage}%)
                    </span>
                  </div>
                  <div style={{ position: 'relative', width: '220px' }}>
                    <input
                      type="text"
                      placeholder="Search syllabus..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 28px',
                        fontSize: '8.5pt',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        outline: 'none'
                      }}
                    />
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
                  </div>
                </div>
              </div>

              {/* Grid of Sections */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px', alignItems: 'start' }}>
                {filteredSections.map((sec, secIdx) => {
                  const isOpen = searchQuery.trim() ? true : (openSections[sec.title] !== undefined ? !!openSections[sec.title] : true);
                  return (
                    <div key={secIdx} style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                      <div 
                        onClick={() => setOpenSections(prev => ({ ...prev, [sec.title]: !isOpen }))}
                        style={{
                          backgroundColor: '#f1f5f9',
                          padding: '8px 12px',
                          borderBottom: '1px solid #cbd5e1',
                          fontWeight: 'bold',
                          fontSize: '8.5pt',
                          color: '#3b5998',
                          textTransform: 'uppercase',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'background-color 0.3s ease'
                        }}
                      >
                        <span>{sec.title} ({sec.lectures.length} lectures)</span>
                        <span className={`lecture-module-chevron ${isOpen ? 'open' : ''}`} style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                          <ChevronDown size={15} />
                        </span>
                      </div>
                      
                      {/* Slow & Smooth Accordion Transition Container */}
                      <div className={`lecture-module-accordion ${isOpen ? 'open' : ''}`}>
                        <div className="lecture-module-inner">
                          {sec.lectures.map((lec, lIdx) => {
                            const lecId = lec._id ? String(lec._id) : (lec.id ? String(lec.id) : '');
                            const activeId = activeLecture?._id ? String(activeLecture._id) : (activeLecture?.id ? String(activeLecture.id) : '');
                            const lecYId = extractYouTubeId(lec.youtubeUrl);
                            const activeYId = activeLecture ? extractYouTubeId(activeLecture.youtubeUrl) : '';
                            const isActive = (activeLecture && ((lecId && activeId && lecId === activeId) || (lecYId && activeYId && lecYId === activeYId)));
                            const prog = progressMap[lec._id] || progressMap[lec.id] || progressMap[lecYId] || {};
                            const pct = prog.percent || (prog.completed ? 100 : 0);
                            const isDone = !!prog.completed || pct >= 85;

                            return (
                              <div
                                key={lIdx}
                                onClick={() => handleSelectLecture(lec)}
                                style={{
                                  cursor: 'pointer',
                                  padding: '10px 14px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '10px',
                                  backgroundColor: isActive ? '#6674cc' : '#ffffff',
                                  color: isActive ? '#ffffff' : '#334155',
                                  borderBottom: lIdx === sec.lectures.length - 1 ? 'none' : '1px solid #f1f5f9',
                                  transition: 'background-color 0.2s ease, color 0.2s ease'
                                }}
                              >
                                <div style={{ fontSize: '9pt', fontWeight: isActive ? '600' : '400', flex: 1 }}>
                                  {lIdx + 1}. {lec.title}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {isDone ? (
                                    <CheckCircle2 size={14} style={{ color: isActive ? '#ffffff' : '#16a34a' }} />
                                  ) : (
                                    <span style={{ fontSize: '7.5pt', fontFamily: 'monospace', color: isActive ? '#ffffff' : '#64748b' }}>
                                      {pct}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
