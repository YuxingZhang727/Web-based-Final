// @ts-nocheck
const REDDIT_BASE = 'https://www.reddit.com';
const TIMEOUT_MS = 10000;
const USER_AGENT = 'FieldNotes/1.0 (drink discovery app)';

export async function fetchSubredditPosts(fetchFn, subreddit, limit = 4, time = 'month') {
	const url = `${REDDIT_BASE}/r/${subreddit}/top.json?limit=${limit}&t=${time}`;
	const text = await redditGet(fetchFn, url);
	const data = tryParseJson(text);
	const posts = data?.data?.children;
	if (!Array.isArray(posts)) {
		console.error('[reddit] unexpected top.json shape, preview:', String(text || '').slice(0, 300));
		return [];
	}
	return posts.map((child) => child?.data).filter(Boolean);
}

export async function searchSubredditPosts(fetchFn, subreddit, query, limit = 4, time = 'month') {
	const encoded = encodeURIComponent(query);
	const url = `${REDDIT_BASE}/r/${subreddit}/search.json?q=${encoded}&sort=relevance&t=${time}&limit=${limit}&restrict_sr=1`;
	const text = await redditGet(fetchFn, url);
	const data = tryParseJson(text);
	const posts = data?.data?.children;
	if (!Array.isArray(posts) || posts.length === 0) {
		// fall back to top posts if search returns nothing
		return fetchSubredditPosts(fetchFn, subreddit, limit, time);
	}
	return posts.map((child) => child?.data).filter(Boolean);
}

export async function fetchPostWithComments(fetchFn, subreddit, postId, commentLimit = 5) {
	const url = `${REDDIT_BASE}/r/${subreddit}/comments/${postId}.json?limit=${commentLimit}&depth=2`;
	const text = await redditGet(fetchFn, url);
	const data = tryParseJson(text);
	if (!Array.isArray(data) || data.length < 2) return null;

	const postData = data[0]?.data?.children?.[0]?.data ?? null;
	const commentChildren = data[1]?.data?.children ?? [];
	const comments = commentChildren
		.map((c) => c?.data)
		.filter((c) => c && c.body && c.body !== '[deleted]' && c.body !== '[removed]')
		.slice(0, commentLimit)
		.map((c) => ({ id: c.id, author: c.author, content: c.body, likes: c.score ?? 0 }));

	return { post: postData, comments };
}

export function normalizePost(raw, index, userQuery, subreddit) {
	if (!raw || typeof raw !== 'object') return null;

	const title = String(raw.title || `Reddit post ${index + 1}`);
	const body = String(raw.selftext || '');
	const id = String(raw.id || `${subreddit}-${index}`);
	const author = String(raw.author || '');
	const score = Number(raw.score || 0);
	const numComments = Number(raw.num_comments || 0);
	const url = raw.url ? String(raw.url) : `${REDDIT_BASE}/r/${subreddit}/comments/${id}`;
	const sub = String(raw.subreddit || subreddit);

	return {
		id,
		redditPostId: id,
		subreddit: sub,
		name: title,
		tagline: body.slice(0, 140) || `A post from r/${sub} about "${userQuery}".`,
		vibe: `From r/${sub}`,
		function: 'Community inspiration',
		taste: deriveTaste(`${title} ${body}`),
		matchReason: `Found in r/${sub} while looking for "${userQuery}".`,
		ingredients: [],
		steps: body ? [body] : [],
		signals: [author && `by u/${author}`, score && `${score} points`, numComments && `${numComments} comments`].filter(Boolean),
		sourceTitle: title,
		sourceUrl: url,
		comments: [],
		commentHighlights: []
	};
}

async function redditGet(fetchFn, url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetchFn(url, {
			signal: controller.signal,
			headers: { 'User-Agent': USER_AGENT }
		});
		const text = await res.text();
		if (!res.ok) throw new Error(`Reddit API error ${res.status}: ${text.slice(0, 200)}`);
		return text;
	} finally {
		clearTimeout(timer);
	}
}

function deriveTaste(text) {
	const s = text.toLowerCase();
	const hits = [];
	if (/(citrus|lemon|lime|orange|yuzu|grapefruit)/.test(s)) hits.push('citrus');
	if (/(matcha|green tea)/.test(s)) hits.push('matcha');
	if (/(coffee|espresso|latte|cold brew)/.test(s)) hits.push('coffee');
	if (/(tea|oolong|jasmine|earl grey|chai)/.test(s)) hits.push('tea');
	if (/(sparkling|soda|fizz)/.test(s)) hits.push('sparkling');
	if (/(berry|strawberry|blueberry|raspberry)/.test(s)) hits.push('berry');
	return hits.join(', ') || 'Needs interpretation';
}

function tryParseJson(str) {
	try { return JSON.parse(str); } catch { return null; }
}
