# Field Notes

A drink discovery app that turns a mood, flavor, or moment into a concrete recipe — by searching real Reddit communities and using AI to interpret what people are actually making and drinking.

---

## How it works

1. **Describe what you want** — type a prompt like *"something floral and slightly bitter"* or *"iced matcha for a hot afternoon"*
2. **AI interprets your request** — DeepSeek generates Reddit-friendly search keywords and picks the most relevant community (r/tea, r/coffee, r/cocktails, r/boba, etc.)
3. **Reddit posts are fetched** — the app searches those subreddits using your keywords, pulling posts and top comments that actually match your query
4. **Browse the source posts** — flip through a card stack of real community posts, see what people are recommending
5. **Build a recipe** — AI analyzes the posts and generates 3 distinct drink recipes grounded in the community's collective knowledge

---

## Stack

- **SvelteKit 2** + **Svelte 5** (runes: `$state`, `$derived`)
- **DeepSeek API** (OpenAI-compatible) for query interpretation, post analysis, and recipe generation
- **Reddit public JSON API** — no OAuth required, searches subreddits directly
- **Zod** for request validation on API routes

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a `.env` file

```env
DEEPSEEK_API_KEY=your_key_here
```

Get a key at [platform.deepseek.com](https://platform.deepseek.com). The app also works with any OpenAI-compatible API — set `OPENAI_API_KEY` and optionally `OPENAI_BASE_URL` instead.

### 3. Run the dev server

```bash
npm run dev
```

---

## Project structure

```
src/
├── routes/
│   ├── +page.svelte              # Main UI (all 3 stages + loading animation)
│   └── api/
│       ├── search-plan/          # POST — AI generates search keywords + subreddits
│       ├── source-posts/         # POST — fetches & normalizes Reddit posts
│       └── recipes/              # POST — analyzes posts and generates 3 recipes
└── lib/server/
    ├── reddit.js                 # Reddit public JSON API client
    ├── llm.js                    # DeepSeek / OpenAI structured JSON wrapper
    ├── discovery.js              # Core pipeline: fetch → analyze → generate
    └── queryInterpreter.js       # Builds the AI search plan from user prompt
```

---

## UI stages

| Stage | What happens |
|---|---|
| **Request** | User types a prompt, optional "Find search terms" preview |
| **Posts** | Card stack of Reddit posts, paginated, with comments |
| **Loading** | Drink-matched SVG animation (teacup, martini, boba, etc.) |
| **Recipe** | 3 recipe cards + detailed view with ingredients and steps |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | Yes (or OpenAI) | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | No | Defaults to `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | No | Defaults to `deepseek-chat` |
| `OPENAI_API_KEY` | Alternative | Use instead of DeepSeek |
| `OPENAI_BASE_URL` | No | Custom OpenAI-compatible endpoint |
| `OPENAI_MODEL` | No | Model override |

---

## Notes

- Reddit is accessed via the public `.json` API — no Reddit account or API key needed
- If AI query interpretation fails (no API key, rate limit, etc.), the app falls back to keyword-based subreddit matching
- Search uses `restrict_sr=1` to stay within the chosen subreddit, falling back to top posts if the search returns nothing
