import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

const SIGNAL_COLORS = { HIGH: "#ff6b4a", MEDIUM: "#c8a96e", LOW: "#6b8fa8" };
const SIGNAL_LABELS = { HIGH: "●●●", MEDIUM: "●●○", LOW: "●○○" };

function getEdition() {
  const h = new Date().getHours();
  return h >= 5 && h < 14 ? "morning" : "evening";
}

function getEditionLabel() {
  const edition = getEdition();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return { edition, dateStr };
}

// RSVP Reader Component
function RSVPReader({ text, onClose }) {
  const [wpm, setWpm] = useState(300);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [words, setWords] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    setWords(cleaned.split(" ").filter(Boolean));
    setWordIdx(0);
    setIsPlaying(false);
  }, [text]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setWordIdx(prev => {
          if (prev >= words.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, Math.round(60000 / wpm));
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, wpm, words.length]);

  const currentWord = words[wordIdx] || "";

  // Find ORP (Optimal Recognition Point) - slightly left of center
  function getORP(word) {
    const clean = word.replace(/[^a-zA-Z0-9]/g, "");
    if (!clean.length) return { before: "", orp: word[0] || "", after: "" };
    const orpIdx = Math.max(0, Math.floor(clean.length * 0.35));
    // Find position of orp char in original word
    let count = 0;
    let pos = 0;
    for (let i = 0; i < word.length; i++) {
      if (/[a-zA-Z0-9]/.test(word[i])) {
        if (count === orpIdx) { pos = i; break; }
        count++;
      }
    }
    return {
      before: word.slice(0, pos),
      orp: word[pos],
      after: word.slice(pos + 1),
    };
  }

  const { before, orp, after } = getORP(currentWord);
  const progress = words.length > 0 ? (wordIdx / (words.length - 1)) * 100 : 0;

  return (
    <div className="rsvp-overlay">
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

// TTS hook
function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const speak = useCallback((text, id) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (speaking && currentId === id) {
      setSpeaking(false);
      setCurrentId(null);
      return;
    }
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.pitch = 1;
    utt.onend = () => { setSpeaking(false); setCurrentId(null); };
    utt.onerror = () => { setSpeaking(false); setCurrentId(null); };
    setSpeaking(true);
    setCurrentId(id);
    window.speechSynthesis.speak(utt);
  }, [speaking, currentId]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setCurrentId(null);
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
  const fullText = `${story.title}. ${story.synopsis}. ${isEvening ? story.watchFor : story.implication}`;
  const isSpeaking = tts.speaking && tts.currentId === index;

  return (
    <div className="story-card">
      <div className="story-top">
        <div className="story-meta">
          <span className="story-source">{story.source}</span>
          <SignalBadge signal={story.signal} />
        </div>
        <div className="story-actions">
          <button
            className={`action-btn ${isSpeaking ? "active" : ""}`}
            onClick={() => tts.speak(fullText, index)}
            title="Listen"
          >
            {isSpeaking ? "■" : "♪"}
          </button>
          <button className="action-btn" onClick={() => onRSVP(fullText)} title="Speed read">⚡</button>
          {story.url && (
            <a href={story.url} target="_blank" rel="noopener noreferrer" className="action-btn" title="Open article">↗</a>
          )}
        </div>
      </div>

      <h2 className="story-title">{story.title}</h2>
      <p className="story-synopsis">{story.synopsis}</p>

      {(story.implication || story.watchFor) && (
        <div className="story-implication">
          <span className="implication-label">{isEvening ? "watch for" : "consider"}</span>
          <p className="implication-text">{isEvening ? story.watchFor : story.implication}</p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [rsvpText, setRSVPText] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const tts = useTTS();
  const { edition, dateStr } = getEditionLabel();

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edition }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStories(data.stories || []);
      setLastFetched(new Date());
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const readAll = () => {
    if (stories.length === 0) return;
    const allText = stories.map((s, i) =>
      `Story ${i + 1}: ${s.title}. ${s.synopsis}. ${s.implication || s.watchFor || ""}`
    ).join(". Next story. ");
    tts.speak(allText, "all");
  };

  const timeStr = lastFetched ? lastFetched.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null;

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
        <header>
          <div className="header-inner">
            <div className="wordmark">
              <span className="wm-a">A Vinyl Bar in Shibuya</span>
              <span className="wm-dot"> · </span>
              <span className="wm-b">pulse</span>
            </div>
            {loaded && stories.length > 0 && (
              <button className="listen-all-btn" onClick={readAll}>
                {tts.speaking && tts.currentId === "all" ? "■ stop" : "♪ all"}
              </button>
            )}
          </div>
        </header>

        <main>
          <div className="edition-header">
            <div className="edition-date">{dateStr}</div>
            <div className={`edition-badge ${edition}`}>
              {edition === "morning" ? "☀ morning brief" : "◑ evening watch"}
            </div>
          </div>

          {!loaded && !loading && (
            <div className="landing">
              <div className="landing-heading">
                <h1>What's moving<br /><em>the space today?</em></h1>
                <p className="landing-sub">
                  {edition === "morning"
                    ? "Top 5 stories across music, tech, and culture. Synthesized for what matters."
                    : "3 stories to watch overnight. What develops while you're off the clock."}
                </p>
              </div>
              <div className="sources-strip">
                <span className="sources-label">pulling from</span>
                <span className="sources-list">Music Ally · Billboard · Honest Broker · Water & Music · TechCrunch · The Verge · Pitchfork + more</span>
              </div>
              <button className="generate-btn" onClick={fetchNews}>
                {edition === "morning" ? "Get morning brief →" : "Get evening watch →"}
              </button>
            </div>
          )}

          {loading && (
            <div className="loading-wrap">
              <div className="loading-label">
                <em>{edition === "morning" ? "Scanning the morning..." : "Reading the evening..."}</em>
              </div>
              <div className="loading-steps">
                <div className="loading-step active">Fetching feeds</div>
                <div className="loading-step">Filtering signal</div>
                <div className="loading-step">Synthesizing</div>
              </div>
              <div className="loading-dots"><span /><span /><span /></div>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p className="error-msg">Failed to fetch: {error}</p>
              <button className="generate-btn" onClick={fetchNews}>Try again →</button>
            </div>
          )}

          {loaded && stories.length > 0 && (
            <div className="stories-container">
              <div className="stories-meta">
                <span>{stories.length} {edition === "morning" ? "stories" : "to watch"}</span>
                {timeStr && <span className="fetched-time">as of {timeStr}</span>}
                <button className="refresh-btn" onClick={fetchNews}>↻ refresh</button>
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
                <button
                  className="switch-edition"
                  onClick={() => { setLoaded(false); setStories([]); }}
                >
                  ← back
                </button>
              </div>
            </div>
          )}
        </main>

        {rsvpText && <RSVPReader text={rsvpText} onClose={() => setRSVPText(null)} />}
      </div>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0a0a0a;
          --surface: #111;
          --surface2: #1a1a1a;
          --border: rgba(255,255,255,0.07);
          --border-hi: rgba(255,255,255,0.15);
          --ink: #e8e4dc;
          --ink-mid: rgba(232,228,220,0.55);
          --ink-dim: rgba(232,228,220,0.3);
          --accent: #c8a96e;
          --red: #ff6b4a;
          --mono: 'DM Mono', monospace;
          --serif: 'Instrument Serif', serif;
          --r: 10px;
        }

        html, body {
          background: var(--bg); color: var(--ink); font-family: var(--mono);
          font-size: 15px; line-height: 1.6; -webkit-font-smoothing: antialiased;
          min-height: 100dvh;
        }
        .app { max-width: 520px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; }

        header {
          position: sticky; top: 0; z-index: 100; background: var(--bg);
          border-bottom: 1px solid var(--border); padding: 0 20px;
        }
        .header-inner { display: flex; justify-content: space-between; align-items: center; height: 52px; }
        .wordmark { display: flex; align-items: baseline; }
        .wm-a { font-family: var(--serif); font-size: 0.82rem; color: var(--ink); opacity: 0.7; }
        .wm-dot { opacity: 0.25; margin: 0 6px; }
        .wm-b { font-size: 0.66rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
        .listen-all-btn {
          background: none; border: 1px solid var(--border); color: var(--ink-mid);
          font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.1em;
          padding: 5px 12px; border-radius: 16px; cursor: pointer;
        }

        main { flex: 1; padding: 24px 20px 60px; }

        .edition-header { margin-bottom: 32px; }
        .edition-date { font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 8px; }
        .edition-badge { display: inline-block; font-size: 0.62rem; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 4px; }
        .edition-badge.morning { background: rgba(200,169,110,0.12); color: var(--accent); border: 1px solid rgba(200,169,110,0.2); }
        .edition-badge.evening { background: rgba(100,140,255,0.1); color: #7b9cff; border: 1px solid rgba(100,140,255,0.2); }

        .landing { display: flex; flex-direction: column; gap: 28px; }
        .landing-heading h1 { font-family: var(--serif); font-size: 2rem; font-weight: 400; letter-spacing: -0.02em; line-height: 1.2; margin-bottom: 10px; }
        .landing-heading h1 em { font-style: italic; }
        .landing-sub { font-size: 0.76rem; color: var(--ink-mid); line-height: 1.6; }
        .sources-strip { padding: 14px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .sources-label { font-size: 0.54rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-dim); display: block; margin-bottom: 6px; }
        .sources-list { font-size: 0.68rem; color: var(--ink-mid); line-height: 1.8; }
        .generate-btn {
          width: 100%; padding: 18px; background: rgba(200,169,110,0.08);
          border: 1px solid var(--accent); color: var(--accent); font-family: var(--mono);
          font-size: 0.78rem; letter-spacing: 0.16em; text-transform: uppercase;
          border-radius: var(--r); cursor: pointer; transition: background 0.2s;
        }
        .generate-btn:active { background: rgba(200,169,110,0.2); }

        .loading-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 40dvh; gap: 20px; }
        .loading-label { font-family: var(--serif); font-size: 1.3rem; color: var(--ink-mid); }
        .loading-steps { display: flex; flex-direction: column; gap: 6px; align-items: center; }
        .loading-step { font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-dim); }
        .loading-step.active { color: var(--accent); }
        .loading-dots { display: flex; gap: 6px; }
        .loading-dots span { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: blink 1.2s ease-in-out infinite; }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink { 0%,80%,100% { opacity: 0.15; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

        .error-state { display: flex; flex-direction: column; gap: 16px; padding-top: 40px; }
        .error-msg { font-size: 0.72rem; color: var(--red); }

        .stories-container { display: flex; flex-direction: column; gap: 0; }
        .stories-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-dim); }
        .fetched-time { color: var(--ink-dim); }
        .refresh-btn { background: none; border: none; color: var(--ink-dim); font-family: var(--mono); font-size: 0.62rem; cursor: pointer; margin-left: auto; }
        .refresh-btn:active { color: var(--ink); }

        .stories-list { display: flex; flex-direction: column; gap: 1px; }

        .story-card {
          padding: 20px 0;
          border-bottom: 1px solid var(--border);
        }
        .story-card:first-child { border-top: 1px solid var(--border); }
        .story-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .story-meta { display: flex; align-items: center; gap: 10px; }
        .story-source { font-size: 0.56rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-dim); }
        .signal-badge { font-size: 0.56rem; letter-spacing: 0.06em; }
        .story-actions { display: flex; gap: 6px; align-items: center; }
        .action-btn {
          background: none; border: 1px solid var(--border); color: var(--ink-mid);
          font-size: 0.68rem; width: 28px; height: 28px; border-radius: 6px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          text-decoration: none; transition: border-color 0.15s, color 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .action-btn.active { border-color: var(--accent); color: var(--accent); }
        .action-btn:active { border-color: var(--border-hi); color: var(--ink); }

        .story-title { font-family: var(--serif); font-size: 1.05rem; font-style: normal;        .story-synopsis { font-size: 0.78rem; line-height: 1.7; color: var(--ink-mid); margin-bottom: 12px; }
        .story-implication { padding: 12px; background: var(--surface); border-radius: 6px; border-left: 2px solid var(--accent); }
        .implication-label { font-size: 0.52rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); opacity: 0.75; display: block; margin-bottom: 5px; }
        .implication-text { font-size: 0.76rem; line-height: 1.65; color: var(--ink-mid); font-style: italic; }

        .edition-footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); }
        .switch-edition { background: none; border: none; color: var(--ink-dim); font-family: var(--mono); font-size: 0.68rem; cursor: pointer; }

        /* RSVP */
        .rsvp-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100dvh; background: rgba(0,0,0,0.92); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; -webkit-overflow-scrolling: touch; }
        .rsvp-modal { background: #111; border: 1px solid var(--border-hi); border-radius: 16px; padding: 32px 28px; width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 24px; }
        .rsvp-word { font-family: var(--serif); font-size: 2.4rem; display: flex; align-items: baseline; letter-spacing: 0.01em; }
        .rsvp-header { display: flex; justify-content: space-between; align-items: center; }
        .rsvp-label { font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
        .rsvp-close { background: none; border: none; color: var(--ink-dim); font-size: 1.3rem; cursor: pointer; }

        .rsvp-display {
          position: relative; height: 80px; display: flex; align-items: center; justify-content: center;
          background: var(--surface2); border-radius: 10px; overflow: hidden;
        }
        .rsvp-guide-line { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(200,169,110,0.15); }
        .rsvp-word { font-family: var(--serif); font-size: 2rem; display: flex; align-items: baseline; letter-spacing: 0.01em; }
        .rsvp-before, .rsvp-after { color: var(--ink); }
        .rsvp-orp { color: var(--accent); font-weight: 500; }

        .rsvp-progress { height: 2px; background: var(--surface2); border-radius: 1px; overflow: hidden; }
        .rsvp-bar { height: 100%; background: var(--accent); transition: width 0.1s linear; }
        .rsvp-counter { font-size: 0.6rem; color: var(--ink-dim); text-align: center; letter-spacing: 0.08em; }

        .rsvp-controls { display: flex; align-items: center; justify-content: center; gap: 16px; }
        .rsvp-btn { background: none; border: 1px solid var(--border); color: var(--ink-mid); font-family: var(--mono); font-size: 0.8rem; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; }
        .rsvp-play { background: var(--accent); border: none; color: var(--bg); width: 48px; height: 48px; border-radius: 50%; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }

        .rsvp-wpm { display: flex; align-items: center; justify-content: center; gap: 16px; }
        .wpm-btn { background: none; border: 1px solid var(--border); color: var(--ink-mid); font-family: var(--mono); font-size: 1rem; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; }
        .wpm-label { font-size: 0.66rem; letter-spacing: 0.1em; color: var(--ink-mid); min-width: 60px; text-align: center; }
      `}</style>
    </>
  );
}
