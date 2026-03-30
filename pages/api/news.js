import Anthropic from "@anthropic-ai/sdk";
import Parser from "rss-parser";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const parser = new Parser({ timeout: 8000, headers: { "User-Agent": "Shibuya-News/1.0" } });

const FEEDS = [
  // Music industry
  { name: "Music Ally", url: "https://musically.com/feed/", category: "music-industry" },
  { name: "Billboard", url: "https://www.billboard.com/feed/", category: "music-industry" },
  { name: "Pitchfork", url: "https://pitchfork.com/rss/news/feed.json", category: "music-culture" },
  { name: "Hits Daily Double", url: "https://www.hitsdailydouble.com/rss", category: "music-industry" },
  // Substack thought leaders
  { name: "The Honest Broker", url: "https://www.honest-broker.com/feed", category: "substack" },
  { name: "Water & Music", url: "https://www.waterandmusic.com/feed", category: "substack" },
  { name: "Chris Dalla Riva", url: "https://www.chrisdallariva.com/feed", category: "substack" },
  // Tech
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "tech" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "tech" },
  // VC / startup
  { name: "Axios Pro Media", url: "https://www.axios.com/feeds/feed.rss", category: "vc-startup" },
];

const MUSIC_KEYWORDS = [
  "music", "streaming", "spotify", "apple music", "tidal", "soundcloud", "bandcamp",
  "record label", "artist", "album", "playlist", "concert", "touring", "licensing",
  "royalties", "sync", "publishing", "ai music", "generative music", "music tech",
  "music startup", "music software", "creator economy", "fan", "discovery",
  "vc", "venture", "funding", "raised", "seed", "series a", "series b",
  "acquisition", "merger", "nft", "web3", "tiktok", "social music",
];

function isRelevant(item) {
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();
  return MUSIC_KEYWORDS.some(k => text.includes(k));
}

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items || []).slice(0, 8).map(item => ({
      title: item.title || "",
      link: item.link || item.guid || "",
      summary: item.contentSnippet || item.content || "",
      pubDate: item.pubDate || item.isoDate || "",
      source: feed.name,
      category: feed.category,
    }));
  } catch (err) {
    console.warn(`Feed failed: ${feed.name}`, err.message);
    return [];
  }
}

const ANALYSIS_SYSTEM = `You are briefing the founder of a seed-stage music software company on what happened today in music, tech, and culture.

Write like a sharp person who reads everything and wastes no words. Not a newsletter. Not a report. Just the essential thing that happened and why it matters.

Rules:
- No em dashes. Use periods or just end the sentence.
- No phrases like "it's worth noting" or "this signals" or "this underscores"
- No bullet points in the synopsis. Write in sentences.
- Keep the implication line genuinely thought provoking, not generic. If you can't say something specific and interesting, say nothing.
- Sound like someone who actually follows this space, not someone summarizing it for a client.
- Broad strokes on implications. Nothing proprietary or specific to internal strategy.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { edition = "morning" } = req.body; // "morning" or "evening"

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(FEEDS.map(fetchFeed));
  const allItems = feedResults
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(isRelevant);

  // Deduplicate by title similarity, sort by date
  const seen = new Set();
  const unique = allItems.filter(item => {
    const key = item.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date descending
  unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Take top 12 for Claude to analyze
  const top = unique.slice(0, 12);

  if (top.length === 0) {
    return res.status(200).json({ stories: [], edition, generated: new Date().toISOString() });
  }

  const storiesText = top.map((s, i) =>
    `${i + 1}. [${s.source}] ${s.title}\n   ${s.summary?.slice(0, 200) || ""}\n   URL: ${s.link}`
  ).join("\n\n");

  const prompt = edition === "morning"
    ? `Here are today's top music/tech headlines. Select the 5 most significant stories for a music software founder to know about RIGHT NOW. For each story provide:
- A sharp 2-3 sentence synopsis of what happened and why it matters for the music/tech space
- One thought-provoking implication for a founder building at the intersection of music, gaming, and interactive culture (keep broad, no specific company details)
- A signal strength: HIGH / MEDIUM / LOW

Stories to analyze:
${storiesText}

Respond in this exact JSON format (no markdown, no backticks, just valid JSON):
{"stories":[{"title":"...","source":"...","url":"...","synopsis":"...","implication":"...","signal":"HIGH|MEDIUM|LOW"}]}`
    : `Here are today's music/tech headlines. Select 3 stories to WATCH TOMORROW — things developing that a music software founder should keep an eye on. These should be stories that are still unfolding or have implications that will become clearer in the next 24-48 hours.

For each provide:
- What's developing and why it's worth watching
- What to look for tomorrow that would make it more/less significant
- Signal strength: HIGH / MEDIUM / LOW

Stories:
${storiesText}

Respond in this exact JSON format (no markdown, no backticks, just valid JSON):
{"stories":[{"title":"...","source":"...","url":"...","synopsis":"...","watchFor":"...","signal":"HIGH|MEDIUM|LOW"}]}`;

  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      system: ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json({
      stories: parsed.stories || [],
      edition,
      generated: new Date().toISOString(),
      count: parsed.stories?.length || 0,
    });
  } catch (err) {
    console.error("Analysis failed:", err);
    // Fall back to returning raw stories without AI analysis
    return res.status(200).json({
      stories: top.slice(0, 5).map(s => ({
        title: s.title,
        source: s.source,
        url: s.link,
        synopsis: s.summary?.slice(0, 300) || "",
        implication: "",
        signal: "MEDIUM",
      })),
      edition,
      generated: new Date().toISOString(),
      fallback: true,
    });
  }
}
