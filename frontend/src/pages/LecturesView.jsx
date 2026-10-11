import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Printer
} from 'lucide-react';
import AcademicMarkdown from '../components/AcademicMarkdown.jsx';

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
  const [activeTab, setActiveTab] = useState('notes'); // 'notes' | 'summary' | 'concepts'
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // AI Summary Modal State
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Student Personal Notes
  const [studentNotes, setStudentNotes] = useState('');
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
    }

    // Restore time to UI if not actively playing
    if (savedProg.currentTime && (!playerRef.current || playerState !== 1)) {
      setPlayerCurrentTime(savedProg.currentTime);
      if (savedProg.duration) setPlayerDuration(savedProg.duration);
    } else if (!savedProg.currentTime && (!playerRef.current || playerState !== 1)) {
      setPlayerCurrentTime(0);
      if (savedProg.duration) setPlayerDuration(savedProg.duration);
    }

    // Check if lecture already has summary in state, otherwise check DB cache (NEVER auto-generate)
    if (activeLecture.aiSummary && activeLecture.aiSummary.synopsis) {
      setAiSummary(activeLecture.aiSummary);
      setIsAiLoading(false);
    } else if (isNewLecture) {
      setAiSummary(null);
      checkCachedSummary(activeLecture);
    }
  }, [activeLecture]);

  // Automatically open the section containing the loading/active lecture, keep the rest closed
  useEffect(() => {
    if (!activeLecture) return;
    const secName = (activeLecture.section || 'General Coursework').trim();
    const matchingSec = (canonicalSections || []).find(s => s.title.toUpperCase() === secName.toUpperCase());
    const targetTitle = matchingSec ? matchingSec.title : secName;
    setOpenSections({ [targetTitle]: true });
  }, [activeLecture?._id, activeLecture?.section, canonicalSections]);

  // Read-only check for existing summary in DB (DO NOT auto-generate for all lectures)
  const checkCachedSummary = async (lecture) => {
    if (!lecture) return;
    const targetId = lecture._id || lecture.id || extractYouTubeId(lecture.youtubeUrl);
    try {
      const res = await fetch(`${API_BASE}/video-lectures/${targetId}/summary`);
      const data = await res.json();
      if (res.ok && data.summary && data.summary.synopsis) {
        setAiSummary(data.summary);
      } else {
        setAiSummary(null);
      }
    } catch (err) {
      console.warn('[AI Summary Check Notice]', err);
    }
  };

  // Explicit AI Summary Generation (Runs ONLY when student explicitly clicks "Summarize")
  const triggerGenerateSummary = async (lecture = activeLecture) => {
    if (!lecture) return;
    setIsAiLoading(true);
    setAiError(null);

    const targetId = lecture._id || lecture.id || extractYouTubeId(lecture.youtubeUrl);
    try {
      const res = await fetch(`${API_BASE}/video-lectures/${targetId}/summary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to synthesize lecture summary');
      }
      setAiSummary(data.summary);
      // Update in active lecture in-memory
      if (lecture) {
        lecture.aiSummary = data.summary;
      }
    } catch (err) {
      console.error('[AI Summary Generation Error]', err);
      setAiError(err.message || 'Generation failed');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleOpenSummaryModal = () => {
    setIsSummaryModalOpen(true);
    if (!aiSummary && activeLecture) {
      checkCachedSummary(activeLecture);
    }
  };

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
    if (typeof setSelectedLecture === 'function') setSelectedLecture(lec);
    const vId = extractYouTubeId(lec.youtubeUrl);
    if (navigate) {
      navigate(`/coursework/lectures?v=${vId}`);
    }
  };

  const currentIndex = useMemo(() => {
    if (!activeLecture) return -1;
    return videoLectures.findIndex(l => (l._id === activeLecture._id || l.id === activeLecture.id));
  }, [videoLectures, activeLecture]);

  const handleNextLecture = () => {
    if (currentIndex >= 0 && currentIndex < videoLectures.length - 1) {
      handleSelectLecture(videoLectures[currentIndex + 1]);
    }
  };

  const handlePrevLecture = () => {
    if (currentIndex > 0) {
      handleSelectLecture(videoLectures[currentIndex - 1]);
    }
  };

  const handleCopyDeepLink = () => {
    const canonicalUrl = `${window.location.origin}/main/coursework/lectures?v=${activeVideoId}`;
    navigator.clipboard.writeText(canonicalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopySummaryContent = () => {
    if (!aiSummary) return;
    const textToCopy = `Academic Summary: ${activeLecture?.title || 'Video Lecture'}\n\nEXECUTIVE SYNOPSIS:\n${aiSummary.synopsis || ''}\n\nDETAILED NOTES:\n${aiSummary.detailedNotes || ''}\n\nKEY CONCEPTS:\n${(aiSummary.keyConcepts || []).join('\n')}\n\nEXAM TAKEAWAYS:\n${(aiSummary.examTakeaways || []).join('\n')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
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
      
      {/* Original Standard Institutional Heading Box Preserved Exactly */}
      <div className="cf-card-title">Course Video Lectures</div>

      {videoLectures.length === 0 ? (
        <div className="cf-alert cf-alert-info">No video lectures have been scheduled or uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '12px' }}>
          
          {/* LEFT COLUMN: Video Player, Telemetry Bar, & Student Workspace */}
          <div style={{ flex: '3 1 640px', minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
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
                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'inline-block', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', fontWeight: 'bold', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '3px', marginBottom: '6px' }}>
                      {activeLecture.section}
                    </div>
                    <h2 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#3b5998', margin: 0 }}>
                      {activeLecture.title}
                    </h2>
                  </div>

                  {/* Action buttons: Summarize Modal trigger, Prev, Next, Share */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    
                    {/* Explicit Summarize Action Button (Subtle & Light, matches site theme) */}
                    <button
                      type="button"
                      onClick={handleOpenSummaryModal}
                      className="cf-btn-primary"
                      title="Open full AI academic summary modal"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '9pt',
                        padding: '4px 12px'
                      }}
                    >
                      <Sparkles size={14} style={{ color: '#3b5998' }} />
                      <span>Summarize</span>
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
                        fontSize: '9pt',
                        padding: '6px 10px',
                        opacity: currentIndex <= 0 ? 0.4 : 1
                      }}
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>

                    <button
                      type="button"
                      onClick={handleNextLecture}
                      disabled={currentIndex >= videoLectures.length - 1}
                      className="cf-btn-secondary"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '9pt',
                        padding: '6px 10px',
                        opacity: currentIndex >= videoLectures.length - 1 ? 0.4 : 1
                      }}
                    >
                      Next <ChevronRight size={15} />
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
                          fontSize: '8.5pt',
                          padding: '6px 10px'
                        }}
                      >
                        {copiedLink ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                        <span>{copiedLink ? 'Copied' : 'Share Link'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Tab Navigation below player: My Notes & AI Summary Quick Launcher */}
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab('notes')}
                      style={{
                        padding: '8px 16px',
                        fontSize: '9pt',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        border: 'none',
                        borderBottom: activeTab === 'notes' ? '2px solid #3b5998' : '2px solid transparent',
                        backgroundColor: 'transparent',
                        color: activeTab === 'notes' ? '#3b5998' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <FileText size={14} />
                      My Personal Notes
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('summary')}
                      style={{
                        padding: '8px 16px',
                        fontSize: '9pt',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        border: 'none',
                        borderBottom: activeTab === 'summary' ? '2px solid #3b5998' : '2px solid transparent',
                        backgroundColor: 'transparent',
                        color: activeTab === 'summary' ? '#3b5998' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Sparkles size={14} style={{ color: '#3b5998' }} />
                      AI Academic Synopsis
                    </button>
                  </div>

                  {/* TAB 1: Student Personal Study Notes */}
                  {activeTab === 'notes' && (
                    <div style={{ padding: '16px 4px' }}>
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

                  {/* TAB 2: AI Summary Overview Callout */}
                  {activeTab === 'summary' && (
                    <div style={{ padding: '16px 4px' }}>
                      {aiSummary ? (
                        <div style={{ backgroundColor: '#f8fafd', border: '1px solid #b9c9fe', borderRadius: '4px', padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '10pt', fontWeight: 'bold', color: '#3b5998' }}>
                              Executive Synopsis
                            </h4>
                            <button
                              type="button"
                              onClick={handleOpenSummaryModal}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'none',
                                border: 'none',
                                color: '#3b5998',
                                cursor: 'pointer',
                                fontSize: '8.5pt',
                                fontWeight: 'bold',
                                textDecoration: 'underline'
                              }}
                            >
                              <ExternalLink size={13} /> View Full Academic Breakdown
                            </button>
                          </div>
                          <AcademicMarkdown content={aiSummary.synopsis} />
                        </div>
                      ) : (
                        <div
                          style={{
                            textAlign: 'center',
                            padding: '30px 20px',
                            backgroundColor: '#f8fafd',
                            borderRadius: '4px',
                            border: '1px dashed #b9c9fe'
                          }}
                        >
                          <Sparkles size={26} style={{ color: '#3b5998', marginBottom: '8px' }} />
                          <h4 style={{ margin: '0 0 6px 0', fontSize: '10.5pt', fontWeight: 'bold', color: '#3b5998' }}>
                            AI Academic Lecture Summary
                          </h4>
                          <p style={{ fontSize: '8.5pt', color: '#64748b', maxWidth: '420px', margin: '0 auto 14px auto', lineHeight: '1.5' }}>
                            Synthesize in-depth topical breakdowns, code snippets, and exam pitfalls on demand for <strong>"{activeLecture.title}"</strong>.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenSummaryModal}
                            className="cf-btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '9pt', padding: '6px 16px' }}
                          >
                            <Sparkles size={14} style={{ color: '#3b5998' }} /> Summarize Lecture in Modal
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="cf-alert cf-alert-info">Select a lecture from the course syllabus to begin playing.</div>
            )}
          </div>

          {/* RIGHT COLUMN: Course Syllabus & Navigation Side List */}
          <div style={{ flex: '1 1 300px', minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
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
                  padding: '8px 10px 8px 32px',
                  fontSize: '9pt',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box'
                }}
              />
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
            </div>

            {/* 3. Deduplicated Canonical Sections List */}
            <div style={{ maxHeight: '680px', overflowY: 'auto', paddingRight: '4px' }}>
              {filteredSections.map((sec, secIdx) => {
                const isOpen = searchQuery.trim() ? true : !!openSections[sec.title];
                return (
                  <div key={secIdx} style={{ marginBottom: '14px' }}>
                    
                    {/* Section Header Accordion (Initially Closed) */}
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
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                    >
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '8.5pt',
                          fontWeight: 'bold',
                          color: '#3b5998',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      >
                        {sec.title}
                      </h4>
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                        {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </span>
                    </div>

                    {/* Unified Contiguous List Group (Starts at 1 for each section) */}
                    {isOpen && (
                      <div
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        {sec.lectures.map((lec, lIdx) => {
                          const lecId = lec._id ? String(lec._id) : (lec.id ? String(lec.id) : '');
                          const activeId = activeLecture?._id ? String(activeLecture._id) : (activeLecture?.id ? String(activeLecture.id) : '');
                          const lecYId = extractYouTubeId(lec.youtubeUrl);
                          const activeYId = activeLecture ? extractYouTubeId(activeLecture.youtubeUrl) : '';

                          let isActive = false;
                          if (activeLecture) {
                            if (lecId && activeId && lecId === activeId) {
                              isActive = true;
                            } else if (lecYId && activeYId && lecYId === activeYId) {
                              isActive = true;
                            }
                          }

                          const prog = progressMap[lec._id] || progressMap[lec.id] || progressMap[lecYId] || {};
                          const pct = prog.percent || (prog.completed ? 100 : 0);
                          const isDone = !!prog.completed || pct >= 85;
                          const isLast = lIdx === sec.lectures.length - 1;
                          const displayIndex = lIdx + 1; // Starts at 1 for each individual section

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
                                transition: 'background-color 0.15s ease, color 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.backgroundColor = '#f8fafd';
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.backgroundColor = '#ffffff';
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '9.5pt',
                                  fontWeight: isActive ? '600' : '400',
                                  lineHeight: '1.45',
                                  flex: 1
                                }}
                              >
                                {displayIndex}. {lec.title}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                {isDone ? (
                                  <CheckCircle2
                                    size={15}
                                    style={{ color: isActive ? '#ffffff' : '#16a34a' }}
                                    title="Completed"
                                  />
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '7.5pt',
                                      fontWeight: 'bold',
                                      fontFamily: 'monospace',
                                      color: isActive ? '#ffffff' : (pct > 0 ? '#475569' : '#94a3b8'),
                                      backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : (pct > 0 ? '#f1f5f9' : '#f8fafc'),
                                      padding: '2px 5px',
                                      borderRadius: '3px'
                                    }}
                                  >
                                    {pct}%
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          DEDICATED ACADEMIC SUMMARY MODAL
          Renders full video title, exhaustive breakdown, code snippets, & tips
         ========================================================================= */}
      {isSummaryModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSummaryModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              border: '1px solid #cbd5e1'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#f0f4fa',
                color: '#3b5998',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #b9c9fe'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={20} style={{ color: '#3b5998' }} />
                <div>
                  <div style={{ fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', fontWeight: 'bold' }}>
                    Academic Lecture Summary • {activeLecture?.section || 'Coursework'}
                  </div>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '13pt', fontWeight: 'bold', color: '#3b5998' }}>
                    {activeLecture?.title || 'Video Lecture'}
                  </h3>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {aiSummary && (
                  <button
                    type="button"
                    onClick={handleCopySummaryContent}
                    className="cf-btn-primary"
                    title="Copy full summary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '8.5pt',
                      padding: '4px 10px'
                    }}
                  >
                    {copiedSummary ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                    <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsSummaryModalOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Close modal"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
              {isAiLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                  <Cpu size={36} className="spin-animation" style={{ color: '#3b5998', marginBottom: '14px' }} />
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '12pt', fontWeight: 'bold', color: '#3b5998' }}>
                    Synthesizing Comprehensive Lecture Notes...
                  </h4>
                  <p style={{ margin: 0, fontSize: '9pt', color: '#64748b', maxWidth: '480px', marginInline: 'auto', lineHeight: '1.5' }}>
                    Executing AI pipeline (OpenRouter Gemini Flash → Gemini Direct → Groq GPT). Summary will be saved permanently in the curriculum database.
                  </p>
                </div>
              ) : aiError ? (
                <div className="cf-alert cf-alert-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={18} />
                    <span><strong>Synthesis Notice:</strong> {aiError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerGenerateSummary(activeLecture)}
                    className="cf-btn-primary"
                    style={{ fontSize: '8.5pt', padding: '6px 12px' }}
                  >
                    Retry Generation
                  </button>
                </div>
              ) : aiSummary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                  
                  {/* Metadata Banner */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '4px',
                      fontSize: '8pt',
                      color: '#475569'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
                      Verified Academic Artifact • Provider: {aiSummary.provider || 'Gemini Flash'}
                    </span>
                    <span style={{ fontFamily: 'monospace' }}>
                      Video ID: {activeVideoId || 'N/A'}
                    </span>
                  </div>

                  {/* 1. Executive Synopsis */}
                  <div>
                    <h4
                      style={{
                        fontSize: '11pt',
                        fontWeight: 'bold',
                        color: '#3b5998',
                        margin: '0 0 8px 0',
                        borderBottom: '2px solid #b9c9fe',
                        paddingBottom: '4px'
                      }}
                    >
                      Executive Synopsis
                    </h4>
                    <AcademicMarkdown content={aiSummary.synopsis} />
                  </div>

                  {/* 2. Exhaustive Topical Breakdown with code blocks and headings */}
                  {aiSummary.detailedNotes && (
                    <div>
                      <h4
                        style={{
                          fontSize: '11pt',
                          fontWeight: 'bold',
                          color: '#3b5998',
                          margin: '0 0 10px 0',
                          borderBottom: '2px solid #b9c9fe',
                          paddingBottom: '4px'
                        }}
                      >
                        Exhaustive Topical Breakdown
                      </h4>
                      <div
                        style={{
                          backgroundColor: '#f8fafd',
                          padding: '18px 22px',
                          borderRadius: '6px',
                          border: '1px solid #b9c9fe'
                        }}
                      >
                        <AcademicMarkdown content={aiSummary.detailedNotes} />
                      </div>
                    </div>
                  )}

                  {/* 3. Core Technical Concepts */}
                  {aiSummary.keyConcepts && aiSummary.keyConcepts.length > 0 && (
                    <div>
                      <h4
                        style={{
                          fontSize: '11pt',
                          fontWeight: 'bold',
                          color: '#3b5998',
                          margin: '0 0 10px 0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderBottom: '2px solid #b9c9fe',
                          paddingBottom: '4px'
                        }}
                      >
                        <BookOpen size={16} /> Core Technical Concepts
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {aiSummary.keyConcepts.map((concept, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: '#f8fafd',
                              border: '1px solid #b9c9fe',
                              borderLeft: '4px solid #3b5998',
                              borderRadius: '4px',
                              padding: '10px 14px',
                              fontSize: '9.5pt',
                              color: '#1e293b'
                            }}
                          >
                            <AcademicMarkdown content={concept} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. Examination Tips & Pitfalls */}
                  {aiSummary.examTakeaways && aiSummary.examTakeaways.length > 0 && (
                    <div>
                      <h4
                        style={{
                          fontSize: '11pt',
                          fontWeight: 'bold',
                          color: '#b45309',
                          margin: '0 0 10px 0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderBottom: '2px solid #d97706',
                          paddingBottom: '4px'
                        }}
                      >
                        <GraduationCap size={16} /> Examination Tips & Important Pitfalls
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {aiSummary.examTakeaways.map((tip, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: '#fffbeb',
                              border: '1px solid #fef3c7',
                              borderLeft: '4px solid #d97706',
                              borderRadius: '4px',
                              padding: '10px 14px',
                              fontSize: '9.5pt',
                              color: '#92400e'
                            }}
                          >
                            <AcademicMarkdown content={tip} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                /* Un-summarized state: Click to generate on demand */
                <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                  <Sparkles size={38} style={{ color: '#3b5998', marginBottom: '14px' }} />
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '13pt', fontWeight: 'bold', color: '#3b5998' }}>
                    Generate Comprehensive Lecture Summary
                  </h3>
                  <p style={{ margin: '0 auto 20px auto', fontSize: '9.5pt', color: '#64748b', maxWidth: '480px', lineHeight: '1.6' }}>
                    Click below to generate an academic synopsis, exhaustive topical breakdowns with code snippets, key technical concepts, and high-probability exam tips for <strong>"{activeLecture?.title}"</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => triggerGenerateSummary(activeLecture)}
                    className="cf-btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '9.5pt',
                      padding: '8px 20px',
                      cursor: 'pointer'
                    }}
                  >
                    <Sparkles size={16} style={{ color: '#3b5998' }} />
                    <span>Summarize this Lecture</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '8pt', color: '#64748b' }}>
                  Course: {activeLecture?.section || 'General'} • BICS Academic Repository
                </span>
                <span style={{ fontSize: '7.5pt', color: '#94a3b8' }}>
                  The summary is generated by {aiSummary?.provider || 'Gemini Flash'} model. It can make mistakes, verify important information.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSummaryModalOpen(false)}
                className="cf-btn-secondary"
                style={{ fontSize: '9pt', padding: '6px 14px', flexShrink: 0 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
