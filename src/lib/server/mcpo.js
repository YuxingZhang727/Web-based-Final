// @ts-nocheck
import { env } from '$env/dynamic/private';

const FALLBACK_MCPO_BASE_URL = 'http://127.0.0.1:8000';
const mcpoBaseUrl = new URL(env.mcpo_base_url || FALLBACK_MCPO_BASE_URL);
const MCPO_TIMEOUT_MS = 20000;

export function getMcpoSearchPath() {
	return env.mcpo_search_path || '/rednote/search_notes';
}

export function isMcpoConfigured() {
	return Boolean(getMcpoSearchPath());
}

export async function fetchRednoteViaMcpo(fetchFn, query, count = 3) {
	const path = getMcpoSearchPath();
	const keywordField = env.mcpo_keyword_field || 'keywords';
	const limitField = env.mcpo_limit_field || 'limit';
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), MCPO_TIMEOUT_MS);
	const response = await fetchFn(`${mcpoBaseUrl.toString().replace(/\/$/, '')}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		signal: controller.signal,
		body: JSON.stringify({
			[keywordField]: query,
			[limitField]: count
		})
	}).finally(() => clearTimeout(timeoutId));

	const text = await response.text();

	if (!response.ok) {
		throw new Error(text || `mcpo request failed with status ${response.status}`);
	}

	return text;
}

export function parseRednoteResponse(raw, query) {
	const directJson = tryParseJson(raw);
	if (directJson) {
		if (typeof directJson === 'string') {
			const fromString = parseMarkdownNotes(directJson, query);
			if (fromString.length > 0) {
				return fromString;
			}
		}

		const fromBlocks = parseContentBlocks(directJson, query);
		if (fromBlocks.length > 0) {
			return fromBlocks;
		}

		const maybeNested = typeof directJson === 'string' ? tryParseJson(directJson) : directJson;
		const nestedBlocks = parseContentBlocks(maybeNested ?? directJson, query);
		if (nestedBlocks.length > 0) {
			return nestedBlocks;
		}

		const normalized = parsePossibleObject(maybeNested ?? directJson, query);
		if (normalized.length > 0) {
			return normalized;
		}
	}

	return parseMarkdownNotes(raw, query);
}

function parseContentBlocks(payload, query) {
	if (!payload || typeof payload !== 'object' || !('content' in payload)) {
		return [];
	}

	const { content } = payload;
	if (!Array.isArray(content)) {
		return [];
	}

	return content
		.map((block) => {
			if (!block || typeof block !== 'object' || !('text' in block)) {
				return null;
			}

			const text = typeof block.text === 'string' ? block.text : '';
			return parseMarkdownNote(text, query, 0);
		})
		.filter(Boolean)
		.map((item, index) => ({ ...item, id: `rednote-${index}` }));
}

function parsePossibleObject(payload, query) {
	if (!payload || typeof payload !== 'object') {
		return [];
	}

	if (Array.isArray(payload)) {
		if (payload.every((item) => typeof item === 'string')) {
			return payload
				.flatMap((item, index) => parseMarkdownNotes(item, query, index))
				.filter(Boolean);
		}

		return payload.map((item, index) => normalizeObjectRecipe(item, index, query)).filter(Boolean);
	}

	for (const key of ['notes', 'results', 'items', 'posts', 'data']) {
		const value = payload[key];
		if (Array.isArray(value)) {
			return value.map((item, index) => normalizeObjectRecipe(item, index, query)).filter(Boolean);
		}
	}

	return [];
}

function normalizeObjectRecipe(item, index, query) {
	if (!item || typeof item !== 'object') {
		return null;
	}

	const title = firstString(item.title, item.name, item.note_title) ?? `Rednote result ${index + 1}`;
	const content = firstString(item.content, item.description, item.text) ?? '';
	const author = firstString(item.author, item.user_name, item.nickname);
	const url = firstString(item.url, item.link, item.note_url);
	const tags = toStringList(item.tags, item.keywords);

	return {
		id: String(firstString(item.id, item.note_id) ?? `rednote-${index}`),
		name: title,
		tagline: content.slice(0, 120) || `Social post related to "${query}".`,
		vibe: author ? `Shared by ${author}` : 'Rednote post',
		function: 'Social inspiration',
		taste: tags.slice(0, 3).join(', ') || 'Need AI interpretation',
		matchReason: `This note was returned for "${query}". The next layer can extract ingredients and flavor combinations from the post text.`,
		ingredients: [],
		steps: content ? [content] : [],
		signals: tags,
		sourceTitle: title,
		sourceUrl: url
	};
}

function parseMarkdownNotes(raw, query, baseIndex = 0) {
	const chunks = raw.includes('## ')
		? raw
				.split(/\n(?=##\s+\d+\.)/g)
				.map((chunk) => chunk.trim())
				.filter((chunk) => chunk.startsWith('## '))
		: raw
				.split(/\n---\s*(?:\n|$)/g)
				.map((chunk) => chunk.trim())
				.filter(Boolean);

	return chunks.map((chunk, index) => parseMarkdownNote(chunk, query, baseIndex + index)).filter(Boolean);
}

function parseMarkdownNote(blockText, query, index) {
	const cleanedText = blockText.trim();
	const chineseTitleMatch = cleanedText.match(/标题:\s*([^\n]+)/);
	const chineseAuthorMatch = cleanedText.match(/作者:\s*([^\n]+)/);
	const chineseContentMatch = cleanedText.match(/内容:\s*([\s\S]*?)(?:\n点赞:|\n评论:|\n链接:|$)/);
	const chineseLikesMatch = cleanedText.match(/点赞:\s*([^\n]+)/);
	const chineseCommentsMatch = cleanedText.match(/评论:\s*([^\n]+)/);
	const chineseLinkMatch = cleanedText.match(/链接:\s*(https?:\/\/\S+)/);

	const titleMatch = cleanedText.match(/^##\s+\d+\.\s+(.+)$/m);
	const authorMatch = cleanedText.match(/\*\*Author:\*\*\s+([^\n]+)/);
	const interactionMatch = cleanedText.match(/\*\*Interactions:\*\*\s+([^\n]+)/);
	const contentMatch = cleanedText.match(/### Content\n([\s\S]*?)(?:\n\*\*Original Link:\*\*|\n\*\*Tags:\*\*|$)/);
	const tagsMatch = cleanedText.match(/\*\*Tags:\*\*\s+([^\n]+)/);
	const linkMatch = cleanedText.match(/\*\*Original Link:\*\*\s+(https?:\/\/\S+)/);

	const author = chineseAuthorMatch?.[1]?.trim() ?? authorMatch?.[1]?.trim();
	const socialContent = chineseContentMatch?.[1]?.trim() ?? contentMatch?.[1]?.trim() ?? '';
	const derivedTitle =
		chineseTitleMatch?.[1]?.trim() ??
		titleMatch?.[1]?.trim() ??
		socialContent.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 24) ??
		(author ? `${author} shared post` : '');
	const title = derivedTitle?.trim();
	if (!title && !socialContent) {
		return null;
	}

	const hashtagTags = socialContent.match(/#([^\s#]+)/g)?.map((tag) => tag.replace(/^#/, '').trim()) ?? [];
	const tags = tagsMatch
		? tagsMatch[1]
				.split(/\s+/)
				.map((tag) => tag.replace(/^#/, '').trim())
				.filter(Boolean)
		: hashtagTags;
	const engagement = [chineseLikesMatch?.[1]?.trim(), chineseCommentsMatch?.[1]?.trim()]
		.filter(Boolean)
		.join(' likes/comments ');

	return {
		id: `rednote-${index}`,
		name: title,
		tagline: socialContent.slice(0, 120) || `Social post related to "${query}".`,
		vibe: author ? `Shared by ${author}` : 'Rednote post',
		function: 'Social inspiration',
		taste: tags.slice(0, 3).join(', ') || 'Need AI interpretation',
		matchReason: `This note was returned by Xiaohongshu search for "${query}". It still needs an AI summarization step to turn post content into a recipe.`,
		ingredients: [],
		steps: socialContent ? [socialContent] : [],
		signals: [engagement || interactionMatch?.[1]?.trim(), ...tags].filter(Boolean),
		sourceTitle: title,
		sourceUrl: chineseLinkMatch?.[1] ?? linkMatch?.[1]
	};
}

function tryParseJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function firstString(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}

	return undefined;
}

function toStringList(...values) {
	for (const value of values) {
		if (Array.isArray(value)) {
			const list = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);

			if (list.length > 0) {
				return list;
			}
		}

		if (typeof value === 'string' && value.trim()) {
			const list = value
				.split(/\n|,|•|·|\s+#/)
				.map((part) => part.replace(/^#/, '').trim())
				.filter(Boolean);

			if (list.length > 0) {
				return list;
			}
		}
	}

	return [];
}
