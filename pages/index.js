import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

const SIGNAL_COLORS = { HIGH: "#e8856a", MEDIUM: "#c8a96e", LOW: "#7a9ab0" };
const SIGNAL_LABELS = { HIGH: "●●●", MEDIUM: "●●○", LOW: "●○○" };

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

function getEdition() {
  const h = new Date().getHours();
  return h >= 5 && h < 14 ? "morning" : "evening";
}

function formatDateKey(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TOD_CONFIG = {
  morning: {
    heading: "What's happening",
    emphasis: "this morning?",
    subhead: "Five stories before you start your day.",
    button: "Get morning brief →",
  },
  afternoon: {
    heading: "What's happening",
    emphasis: "this afternoon?",
    subhead: "What's moved since you opened your laptop.",
    button: "Get afternoon brief →",
  },
  evening: {
    heading: "What's happening",
    emphasis: "this evening?",
    subhead: "Three things worth watching overnight.",
    button: "Get evening watch →",
  },
};

const PUBLICATIONS = [
  "Music Ally", "Billboard", "Pitchfork", "Hits Daily Double",
  "Water & Music", "The Honest Broker", "TechCrunch", "The Verge", "Axios",
];

// ── RSS Ticker: free rss2json.com proxy, no API key needed for public feeds ──
const TICKER_FEEDS = [
  "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.musicalliance.com%2Ffeed%2F",
  "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.billboard.com%2Ffeed%2F",
  "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fpitchfork.com%2Ffeed%2Ffeed-news%2Frss",
];

async function fetchTickerHeadlines() {
  const results = await Promise.allSettled(
    TICKER_FEEDS.map(url =>
      fetch(url, { next: { revalidate: 900 } })
        .then(r => r.json())
        .then(d => (d.items || []).slice(0, 4).map(i => ({ title: i.title, link: i.link })))
        .catch(() => [])
    )
  );
  return results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(h => h.title && h.title.length > 10)
    .slice(0, 20);
}

// ── ORP calculation (Spritz method) ──
function getORP(word) {
  const clean = word.replace(/[^a-zA-Z0-9]/g, "");
  if (!clean.length) return { before: "", orp: word, after: "" };
  const len = clean.length;
  const orpIdx = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4;
  const before = word.slice(0, orpIdx);
  const orp = word.slice(orpIdx, orpIdx + 1);
  const after = word.slice(orpIdx + 1);
  return { before, orp, after };
}

// ── RSVP Reader (unchanged appearance/behavior) ──
function RSVPReader({ text, onClose }) {
  const [words] = useState(() => text.split(/\s+/).filter(Boolean));
  const [wordIdx, setWordIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setWordIdx(prev => {
          if (prev >= words.length - 1) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, 60000 / wpm);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, wpm, words.length]);

  const { before, orp, after } = getORP(words[wordIdx] || "");
  const progress = words.length > 1 ? (wordIdx / (words.length - 1)) * 100 : 0;

  return (
    <div className="rsvp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rsvp-modal">
        <div className="rsvp-header">
          <span className="rsvp-label">speed read</span>
          <button className="rsvp-close" onClick={onClose}>×</button>
        </div>
        <div className="rsvp-display">
          <div className="rsvp-guide-line" />
          <div className="rsvp-word">
            <span className="rsvp-before">{before}</span>
            <span className="rsvp-orp">{orp}</span>
            <span className="rsvp-after">{after}</span>
          </div>
        </div>
        <div className="rsvp-progress">
          <div className="rsvp-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="rsvp-counter">{wordIdx + 1} / {words.length}</div>
        <div className="rsvp-controls">
          <button className="rsvp-btn" onClick={() => setWordIdx(Math.max(0, wordIdx - 10))}>‹‹</button>
          <button className="rsvp-play" onClick={() => {
            if (wordIdx >= words.length - 1) setWordIdx(0);
            setIsPlaying(!isPlaying);
          }}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="rsvp-btn" onClick={() => setWordIdx(Math.min(words.length - 1, wordIdx + 10))}>››</button>
        </div>
        <div className="rsvp-wpm">
          <button className="wpm-btn" onClick={() => setWpm(Math.max(100, wpm - 50))}>−</button>
          <span className="wpm-label">{wpm} wpm</span>
          <button className="wpm-btn" onClick={() => setWpm(Math.min(800, wpm + 50))}>+</button>
        </div>
      </div>
    </div>
  );
}

// ── TTS hook ──
function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const speak = useCallback((text, id) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speaking && currentId === id) { setSpeaking(false); setCurrentId(null); return; }
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95; utt.pitch = 1;
    utt.onend = () => { setSpeaking(false); setCurrentId(null); };
    utt.onerror = () => { setSpeaking(false); setCurrentId(null); };
    setSpeaking(true); setCurrentId(id);
    window.speechSynthesis.speak(utt);
  }, [speaking, currentId]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel(); setSpeaking(false); setCurrentId(null);
  }, []);

  return { speak, stop, speaking, currentId };
}

function SignalBadge({ signal }) {
  return (
    <span className="signal-badge" style={{ color: SIGNAL_COLORS[signal] || SIGNAL_COLORS.MEDIUM }}>
      {SIGNAL_LABELS[signal] || SIGNAL_LABELS.MEDIUM}
    </span>
  );
}

function StoryCard({ story, index, edition, tts, onRSVP }) {
  const isEvening = edition === "evening";
  const fullText = `${story.title}. ${story.synopsis}. ${isEvening ? story.watchFor || "" : story.implication || ""}`;

  return (
    <div className="story-card">
      <div className="story-top">
        <div className="story-meta">
          <span className="story-source">{story.source}</span>
          <SignalBadge signal={story.signal} />
        </div>
        <div className="story-actions">
          <a className="action-btn" href={story.url} target="_blank" rel="noopener noreferrer" title="Open article">↗</a>
          <button
            className={`action-btn ${tts.speaking && tts.currentId === `story-${index}` ? "active" : ""}`}
            onClick={() => tts.speak(fullText, `story-${index}`)}
            title="Listen"
          >♪</button>
          <button className="action-btn" onClick={() => onRSVP(fullText)} title="Speed read">⚡</button>
        </div>
      </div>
      <div className="story-title">{story.title}</div>
      <div className="story-synopsis">{story.synopsis}</div>
      {(isEvening ? story.watchFor : story.implication) && (
        <div className="story-implication">
          <span className="implication-label">{isEvening ? "watch for" : "consider"}</span>
          <span className="implication-text">{isEvening ? story.watchFor : story.implication}</span>
        </div>
      )}
    </div>
  );
}

// ── News Ticker ──
function NewsTicker({ headlines }) {
  if (!headlines || headlines.length === 0) return null;
  const repeated = [...headlines, ...headlines];
  return (
    <div className="ticker-wrap">
      <span className="ticker-tag">PULSE</span>
      <div className="ticker-track">
        <div className="ticker-inner">
          {repeated.map((h, i) => (
            <span key={i} className="ticker-item">
              <a href={h.link} target="_blank" rel="noopener noreferrer">{h.title}</a>
              <span className="ticker-sep">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── History Tab ──
function HistoryView({ history, onBack }) {
  const grouped = {};
  history.forEach(item => {
    const key = item.dateKey || formatDateKey(new Date(item.generated));
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  if (history.length === 0) {
    return (
      <div className="history-empty">
        <p>No past briefs yet.</p>
        <p>Generate your first brief to start building a history.</p>
        <button className="back-btn" onClick={onBack}>← back</button>
      </div>
    );
  }

  return (
    <div className="history-view">
      <div className="history-header">
        <span className="history-title">Past Briefs</span>
        <button className="back-btn" onClick={onBack}>← back</button>
      </div>
      {sortedDates.map(dateKey => (
        <div key={dateKey} className="history-date-group">
          <div className="history-date-label">{dateKey}</div>
          {grouped[dateKey].map((item, i) => (
            <div key={i} className="history-brief-group">
              <div className="history-edition-badge">{item.edition === "morning" ? "☀ morning" : "◑ evening"}</div>
              {(item.stories || []).map((story, j) => (
                <a
                  key={j}
                  href={story.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="history-headline"
                >
                  <span className="history-source">{story.source}</span>
                  <span className="history-title-text">{story.title}</span>
                </a>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function PulsePage() {
  const tod = getTimeOfDay();
  const edition = getEdition();
  const cfg = TOD_CONFIG[tod];

  const [view, setView] = useState("landing"); // "landing" | "history" | "loading" | "stories"
  const [stories, setStories] = useState([]);
  const [lastFetched, setLastFetched] = useState(null);
  const [rsvpText, setRSVPText] = useState(null);
  const [history, setHistory] = useState([]);
  const [tickerHeadlines, setTickerHeadlines] = useState([]);
  const tts = useTTS();

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pulse_history") || "[]");
      setHistory(saved);
    } catch (e) {}
  }, []);

  // Fetch ticker headlines once on mount
  useEffect(() => {
    fetchTickerHeadlines().then(setTickerHeadlines).catch(() => {});
  }, []);

  const saveToHistory = useCallback((newStories, editionType) => {
    const entry = {
      generated: new Date().toISOString(),
      dateKey: formatDateKey(),
      edition: editionType,
      stories: newStories,
    };
    setHistory(prev => {
      const updated = [entry, ...prev].slice(0, 30); // keep last 30
      try { localStorage.setItem("pulse_history", JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  }, []);

  const fetchNews = async () => {
    setView("loading");
    tts.stop();
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edition }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setStories(data.stories || []);
      setLastFetched(new Date());
      saveToHistory(data.stories || [], edition);
      setView("stories");
    } catch (err) {
      setView("landing");
      alert("Failed to fetch news. Check your API connection.");
    }
  };

  const readAll = () => {
    const allText = stories.map(s =>
      `${s.title}. ${s.synopsis}. ${s.implication || s.watchFor || ""}`
    ).join(". Next story. ");
    tts.speak(allText, "all");
  };

  const timeStr = lastFetched
    ? lastFetched.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <Head>
        <title>Pulse — Shibuya</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      </Head>

      <div className="app">
        {/* Ticker */}
        <NewsTicker headlines={tickerHeadlines} />

        {/* Header */}
        <header>
          <div className="header-inner">
            <div className="wordmark">
              <span className="wm-a">A Vinyl Bar in Shibuya</span>
              <span className="wm-dot"> · </span>
              <span className="wm-b">PULSE</span>
            </div>
            <div className="header-right">
              {view === "stories" && stories.length > 0 && (
                <button className="listen-all-btn" onClick={readAll}>
                  {tts.speaking && tts.currentId === "all" ? "■ stop" : "♪ all"}
                </button>
              )}
              {view !== "history" && (
                <button className="history-btn" onClick={() => setView("history")}>
                  history
                </button>
              )}
            </div>
          </div>
        </header>

        <main>
          {/* HISTORY VIEW */}
          {view === "history" && (
            <HistoryView history={history} onBack={() => setView("landing")} />
          )}

          {/* LANDING */}
          {view === "landing" && (
            <div className="landing">
              <div className="landing-date">{dateStr}</div>
              <div className="landing-heading">
                <h1>{cfg.heading}<br /><em>{cfg.emphasis}</em></h1>
                <p className="landing-sub">{cfg.subhead}</p>
              </div>
              <div className="sources-strip">
                <span className="sources-label">pulling from</span>
                <span className="sources-list">
                  {PUBLICATIONS.join(" · ")} + more
                </span>
              </div>
              <button className="generate-btn" onClick={fetchNews}>
                {cfg.button}
              </button>
            </div>
          )}

          {/* LOADING */}
          {view === "loading" && (
            <div className="loading-wrap">
              <div className="loading-label">
                <em>{edition === "morning" ? "reading the room" : "scanning overnight"}</em>
              </div>
              <div className="loading-sub">pulling from {PUBLICATIONS.length}+ sources</div>
            </div>
          )}

          {/* STORIES */}
          {view === "stories" && (
            <div className="stories-wrap">
              <div className="stories-header">
                <span className="stories-count">
                  {stories.length} {edition === "morning" ? "stories" : "to watch"}
                </span>
                {timeStr && <span className="fetched-time">as of {timeStr}</span>}
                <button className="refresh-btn" onClick={fetchNews}>↻</button>
              </div>
              <div className="stories-list">
                {stories.map((story, i) => (
                  <StoryCard
                    key={i}
                    story={story}
                    index={i}
                    edition={edition}
                    tts={tts}
                    onRSVP={setRSVPText}
                  />
                ))}
              </div>
              <div className="edition-footer">
                <button className="back-btn" onClick={() => setView("landing")}>← back</button>
              </div>
            </div>
          )}
        </main>

        {rsvpText && <RSVPReader text={rsvpText} onClose={() => setRSVPText(null)} />}
      </div>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #13110f;
          --surface: #1c1916;
          --surface2: #252119;
          --border: rgba(220,205,180,0.08);
          --border-hi: rgba(220,205,180,0.18);
          --ink: #e8e0d0;
          --ink-mid: rgba(232,224,208,0.58);
          --ink-dim: rgba(232,224,208,0.32);
          --accent: #c8a96e;
          --accent-dim: rgba(200,169,110,0.15);
          --mono: 'DM Mono', monospace;
          --serif: 'Instrument Serif', serif;
        }

        html, body {
          background: var(--bg);
          color: var(--ink);
          font-family: var(--mono);
          font-size: 15px;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
          min-height: 100dvh;
        }

        .app {
          max-width: 540px;
          margin: 0 auto;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
        }

        /* ── Ticker ── */
        .ticker-wrap {
          display: flex;
          align-items: center;
          overflow: hidden;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          height: 32px;
          flex-shrink: 0;
        }
        .ticker-tag {
          font-size: 0.52rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          padding: 0 12px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          height: 100%;
          display: flex;
          align-items: center;
        }
        .ticker-track {
          flex: 1;
          overflow: hidden;
          position: relative;
        }
        .ticker-inner {
          display: inline-flex;
          white-space: nowrap;
          animation: ticker-scroll 60s linear infinite;
        }
        .ticker-wrap:hover .ticker-inner {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-item {
          font-size: 0.62rem;
          color: var(--ink-mid);
          padding: 0 16px 0 0;
          letter-spacing: 0.01em;
        }
        .ticker-item a {
          color: var(--ink-mid);
          text-decoration: none;
          transition: color 0.15s;
        }
        .ticker-item a:hover { color: var(--ink); }
        .ticker-sep { margin-left: 16px; color: var(--border-hi); }

        /* ── Header ── */
        header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          padding: 0 20px;
        }
        .header-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 52px;
        }
        .wordmark { display: flex; align-items: baseline; gap: 0; }
        .wm-a { font-family: var(--serif); font-size: 0.85rem; color: var(--ink-mid); font-style: italic; }
        .wm-dot { color: var(--ink-dim); margin: 0 6px; font-size: 0.75rem; }
        .wm-b { font-size: 0.62rem; letter-spacing: 0.2em; color: var(--accent); text-transform: uppercase; }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .listen-all-btn {
          background: none; border: 1px solid var(--border-hi); color: var(--ink-mid);
          font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.1em;
          padding: 5px 12px; border-radius: 6px; cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .listen-all-btn:hover { border-color: var(--accent); color: var(--accent); }
        .history-btn {
          background: none; border: 1px solid var(--border); color: var(--ink-dim);
          font-family: var(--mono); font-size: 0.60rem; letter-spacing: 0.1em;
          padding: 5px 10px; border-radius: 6px; cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .history-btn:hover { border-color: var(--border-hi); color: var(--ink-mid); }

        /* ── Main ── */
        main { flex: 1; padding: 0 20px 40px; }

        /* ── Landing ── */
        .landing { padding-top: 40px; }
        .landing-date {
          font-size: 0.6rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-dim);
          margin-bottom: 24px;
        }
        .landing-heading { margin-bottom: 32px; }
        .landing-heading h1 {
          font-family: var(--serif);
          font-size: clamp(2.2rem, 8vw, 3.2rem);
          font-weight: 400;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 14px;
        }
        .landing-heading h1 em { font-style: italic; color: var(--accent); }
        .landing-sub {
          font-size: 0.78rem;
          color: var(--ink-mid);
          line-height: 1.65;
          max-width: 380px;
        }

        .sources-strip {
          margin-bottom: 32px;
          padding: 16px 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .sources-label {
          display: block;
          font-size: 0.52rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-dim);
          margin-bottom: 8px;
        }
        .sources-list {
          font-size: 0.72rem;
          color: var(--ink-mid);
          line-height: 1.7;
          letter-spacing: 0.01em;
        }

        .generate-btn {
          background: var(--accent);
          border: none;
          color: #13110f;
          font-family: var(--mono);
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          padding: 14px 28px;
          border-radius: 8px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        .generate-btn:hover { opacity: 0.88; }
        .generate-btn:active { transform: scale(0.97); }

        /* ── Loading ── */
        .loading-wrap {
          padding-top: 80px;
          text-align: center;
        }
        .loading-label {
          font-family: var(--serif);
          font-size: 1.4rem;
          color: var(--ink-mid);
          margin-bottom: 10px;
        }
        .loading-sub { font-size: 0.65rem; color: var(--ink-dim); letter-spacing: 0.08em; }

        /* ── Stories ── */
        .stories-wrap { padding-top: 24px; }
        .stories-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .stories-count { font-size: 0.6rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-dim); flex: 1; }
        .fetched-time { font-size: 0.58rem; color: var(--ink-dim); }
        .refresh-btn {
          background: none; border: none; color: var(--ink-dim); font-size: 0.9rem;
          cursor: pointer; padding: 4px; transition: color 0.15s;
        }
        .refresh-btn:hover { color: var(--ink-mid); }

        .stories-list { display: flex; flex-direction: column; gap: 0; }

        .story-card {
          padding: 20px 0;
          border-bottom: 1px solid var(--border);
        }
        .story-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .story-meta { display: flex; align-items: center; gap: 8px; }
        .story-source {
          font-size: 0.52rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-dim);
        }
        .signal-badge { font-size: 0.6rem; letter-spacing: 0.04em; }
        .story-actions { display: flex; gap: 6px; }
        .action-btn {
          background: none;
          border: 1px solid var(--border);
          color: var(--ink-mid);
          font-size: 0.68rem;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          transition: border-color 0.15s, color 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .action-btn.active { border-color: var(--accent); color: var(--accent); }
        .action-btn:active { border-color: var(--border-hi); color: var(--ink); }

        .story-title {
          font-family: var(--serif);
          font-size: 1.05rem;
          font-style: normal;
          line-height: 1.35;
          margin-bottom: 10px;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .story-synopsis {
          font-size: 0.76rem;
          line-height: 1.72;
          color: var(--ink-mid);
          margin-bottom: 12px;
        }
        .story-implication {
          padding: 11px 14px;
          background: var(--accent-dim);
          border-radius: 6px;
          border-left: 2px solid var(--accent);
        }
        .implication-label {
          font-size: 0.5rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          opacity: 0.8;
          display: block;
          margin-bottom: 5px;
        }
        .implication-text {
          font-size: 0.74rem;
          line-height: 1.65;
          color: var(--ink-mid);
          font-style: italic;
        }

        .edition-footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); }

        .back-btn {
          background: none; border: none; color: var(--ink-dim); font-family: var(--mono);
          font-size: 0.68rem; cursor: pointer; padding: 0; letter-spacing: 0.06em;
          transition: color 0.15s;
        }
        .back-btn:hover { color: var(--ink-mid); }

        /* ── History ── */
        .history-view { padding-top: 28px; }
        .history-empty {
          padding-top: 60px;
          text-align: center;
          color: var(--ink-dim);
          font-size: 0.75rem;
          line-height: 2;
        }
        .history-empty button { margin-top: 24px; }
        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 28px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .history-title {
          font-size: 0.58rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-dim);
        }
        .history-date-group { margin-bottom: 28px; }
        .history-date-label {
          font-size: 0.56rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
          opacity: 0.7;
          margin-bottom: 12px;
        }
        .history-brief-group { margin-bottom: 16px; }
        .history-edition-badge {
          font-size: 0.52rem;
          letter-spacing: 0.1em;
          color: var(--ink-dim);
          margin-bottom: 8px;
        }
        .history-headline {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          text-decoration: none;
          transition: background 0.1s;
          cursor: pointer;
        }
        .history-headline:hover .history-title-text { color: var(--ink); }
        .history-source {
          font-size: 0.5rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-dim);
        }
        .history-title-text {
          font-family: var(--serif);
          font-size: 0.92rem;
          color: var(--ink-mid);
          line-height: 1.35;
          transition: color 0.15s;
        }

        /* ── RSVP ── */
        .rsvp-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          width: 100vw; height: 100dvh;
          background: rgba(10,8,6,0.94);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          -webkit-overflow-scrolling: touch;
        }
        .rsvp-modal {
          background: var(--surface);
          border: 1px solid var(--border-hi);
          border-radius: 16px;
          padding: 32px 28px;
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .rsvp-header { display: flex; justify-content: space-between; align-items: center; }
        .rsvp-label { font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
        .rsvp-close { background: none; border: none; color: var(--ink-dim); font-size: 1.3rem; cursor: pointer; }
        .rsvp-display {
          position: relative;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface2);
          border-radius: 10px;
          overflow: hidden;
        }
        .rsvp-guide-line { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(200,169,110,0.12); }
        .rsvp-word { font-family: var(--serif); font-size: 2.4rem; display: flex; align-items: baseline; letter-spacing: 0.01em; }
        .rsvp-before, .rsvp-after { color: var(--ink); }
        .rsvp-orp { color: var(--accent); font-weight: 500; }
        .rsvp-progress { height: 2px; background: var(--surface2); border-radius: 1px; overflow: hidden; }
        .rsvp-bar { height: 100%; background: var(--accent); transition: width 0.1s linear; }
        .rsvp-counter { font-size: 0.6rem; color: var(--ink-dim); text-align: center; letter-spacing: 0.08em; }
        .rsvp-controls { display: flex; align-items: center; justify-content: center; gap: 16px; }
        .rsvp-btn {
          background: none; border: 1px solid var(--border); color: var(--ink-mid);
          font-family: var(--mono); font-size: 0.8rem; width: 36px; height: 36px;
          border-radius: 8px; cursor: pointer;
        }
        .rsvp-play {
          background: var(--accent); border: none; color: var(--bg);
          width: 48px; height: 48px; border-radius: 50%; font-size: 1rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .rsvp-wpm { display: flex; align-items: center; justify-content: center; gap: 16px; }
        .wpm-btn {
          background: none; border: 1px solid var(--border); color: var(--ink-mid);
          font-family: var(--mono); font-size: 1rem; width: 32px; height: 32px;
          border-radius: 6px; cursor: pointer;
        }
        .wpm-label { font-size: 0.66rem; letter-spacing: 0.1em; color: var(--ink-mid); min-width: 60px; text-align: center; }
      `}</style>
    </>
  );
}