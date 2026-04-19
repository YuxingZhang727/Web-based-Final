// @ts-nocheck
import { env } from '$env/dynamic/private';

const FALLBACK_MCPO_BASE_URL = 'http://127.0.0.1:8000';
const mcpoBaseUrl = new URL(env.mcpo_base_url || FALLBACK_MCPO_BASE_URL);
const MCPO_TIMEOUT_MS = 12000;
const FALLBACK_POSTS_PATH = '/reddit/get_subreddit_top_posts';
const FALLBACK_POST_CONTENT_PATH = '/reddit/get_post_content';

export function getMcpoPostsPath() {
	return env.mcpo_posts_path || FALLBACK_POSTS_PATH;
}

export function getMcpoPostContentPath() {
	return env.mcpo_post_content_path || FALLBACK_POST_CONTENT_PATH;
}

export function isMcpoConfigured() {
	return Boolean(getMcpoPostsPath());
}

export async function fetchRedditPostsViaMcpo(fetchFn, subredditName, limit = 2, time = 'month') {
	const response = await callMcpo(fetchFn, getMcpoPostsPath(), {
		subreddit_name: subredditName,
		limit,
		time
	});

	return response;
}

export async function fetchRedditPostContentViaMcpo(fetchFn, postId, commentLimit = 4, commentDepth = 2) {
	return callMcpo(fetchFn, getMcpoPostContentPath(), {
		post_id: postId,
		comment_limit: commentLimit,
		comment_depth: commentDepth
	});
}

export function parseRedditPostsResponse(raw, userQuery, subredditName) {
	const payload = tryParseJson(raw);
	let posts = null;

	if (Array.isArray(payload)) {
		posts = payload;
	} else if (payload && typeof payload === 'object') {
		// Try common MCP wrapper shapes
		const unwrapped = payload.posts ?? payload.data ?? payload.results ?? payload.content ?? payload.items;
		if (Array.isArray(unwrapped)) {
			posts = unwrapped;
		}
	}

	if (!posts) {
		console.error('[mcpo] parseRedditPostsResponse: unexpected response shape, raw preview:', String(raw || '').slice(0, 400));
		return [];
	}

	return posts
		.map((post, index) => normalizeRedditPost(post, index, userQuery, subredditName))
		.filter(Boolean);
}

export function parseRedditPostContentResponse(raw) {
	const payload = tryParseJson(raw);
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const post = payload.post && typeof payload.post === 'object' ? payload.post : {};
	const comments = Array.isArray(payload.comments)
		? payload.comments.map(normalizeComment).filter(Boolean)
		: [];

	return {
		post,
		comments
	};
}

async function callMcpo(fetchFn, path, body) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), MCPO_TIMEOUT_MS);
	const response = await fetchFn(`${mcpoBaseUrl.toString().replace(/\/$/, '')}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		signal: controller.signal,
		body: JSON.stringify(body)
	}).finally(() => clearTimeout(timeoutId));

	const text = await response.text();
	if (!response.ok) {
		console.error(`[mcpo] request to ${path} failed (${response.status}):`, text.slice(0, 400));
		throw new Error(text || `mcpo request failed with status ${response.status}`);
	}

	console.log(`[mcpo] raw response from ${path} (first 500 chars):`, text.slice(0, 500));
	return text;
}

function normalizeRedditPost(post, index, userQuery, subredditName) {
	if (!post || typeof post !== 'object') {
		return null;
	}

	const title = firstString(post.title) ?? `Reddit post ${index + 1}`;
	const body = firstString(post.selftext, post.content) ?? '';
	const url = firstString(post.url);
	const author = firstString(post.author);
	const subreddit = firstString(post.subreddit) || subredditName;
	const score = typeof post.score === 'number' ? post.score : Number(post.score || 0);
	const commentCount = typeof post.comment_count === 'number' ? post.comment_count : Number(post.comment_count || 0);

	return {
		id: String(firstString(post.id) ?? `reddit-${subredditName}-${index}`),
		redditPostId: String(firstString(post.id) ?? ''),
		name: title,
		tagline: body.slice(0, 140) || `A Reddit post from r/${subreddit} related to "${userQuery}".`,
		vibe: subreddit ? `From r/${subreddit}` : 'From Reddit',
		function: 'Community inspiration',
		taste: deriveTasteFromText(`${title}\n${body}`),
		matchReason: `This post came from r/${subreddit} while looking for drink ideas related to "${userQuery}".`,
		ingredients: [],
		steps: body ? [body] : [],
		signals: [
			author ? `by u/${author}` : '',
			score ? `${score} points` : '',
			commentCount ? `${commentCount} comments` : ''
		].filter(Boolean),
		sourceTitle: title,
		sourceUrl: url,
		comments: [],
		commentHighlights: []
	};
}

function normalizeComment(comment) {
	if (!comment || typeof comment !== 'object') {
		return null;
	}

	const body = firstString(comment.body, comment.content);
	if (!body) {
		return null;
	}

	return {
		id: String(firstString(comment.id) ?? ''),
		author: firstString(comment.author) ?? '',
		content: body,
		likes: typeof comment.score === 'number' ? comment.score : Number(comment.score || 0),
		time: firstString(comment.created_at) ?? '',
		replies: Array.isArray(comment.replies) ? comment.replies.map(normalizeComment).filter(Boolean) : []
	};
}

function deriveTasteFromText(text) {
	const lower = String(text || '').toLowerCase();
	const signals = [];
	if (/(citrus|lemon|lime|orange|yuzu|grapefruit)/.test(lower)) signals.push('citrus');
	if (/(matcha|green tea)/.test(lower)) signals.push('matcha');
	if (/(coffee|espresso|latte|cold brew)/.test(lower)) signals.push('coffee');
	if (/(tea|oolong|jasmine|earl grey|chai)/.test(lower)) signals.push('tea');
	if (/(sparkling|soda|fizz|fizzy)/.test(lower)) signals.push('sparkling');
	if (/(berry|strawberry|blueberry|raspberry)/.test(lower)) signals.push('berry');
	return signals.join(', ') || 'Needs interpretation';
}

function firstString(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}

	return undefined;
}

function tryParseJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
