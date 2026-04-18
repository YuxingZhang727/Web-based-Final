// @ts-nocheck
import { generateStructuredJson } from '$lib/server/llm';

export async function buildSearchPlan(fetchFn, userQuery) {
	const aiPlan = await buildAiPlan(fetchFn, userQuery).catch(() => null);
	if (aiPlan) {
		return aiPlan;
	}

	return buildEmergencyPlan(userQuery);
}

async function buildAiPlan(fetchFn, userQuery) {
	const parsed = await generateStructuredJson(
		fetchFn,
		buildInterpreterPrompt(userQuery),
		'{"english_keywords":["..."],"search_queries":["..."],"subreddit_candidates":["..."],"explanation":"..."}'
	);
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	const englishKeywords = Array.isArray(parsed.english_keywords) ? parsed.english_keywords.filter(Boolean) : [];
	const directSearchQueries = Array.isArray(parsed.search_queries)
		? [...new Set(parsed.search_queries.map((item) => String(item).trim()).filter(Boolean))].slice(0, 2)
		: [];
	const searchQueries = directSearchQueries;
	const subredditCandidates = Array.isArray(parsed.subreddit_candidates)
		? [...new Set(parsed.subreddit_candidates.map((item) => String(item).trim()).filter(Boolean))].slice(0, 2)
		: [];

	if (searchQueries.length < 1 && subredditCandidates.length < 1) {
		return null;
	}

	return {
		mode: 'ai',
		originalQuery: userQuery,
		englishKeywords: [...new Set(englishKeywords.map((item) => String(item).trim()).filter(Boolean))].slice(0, 2),
		chineseKeywords: [],
		searchQueries: searchQueries.length > 0 ? searchQueries : subredditCandidates,
		subredditCandidates,
		primaryQuery: searchQueries[0] || subredditCandidates[0],
		explanation:
			typeof parsed.explanation === 'string'
				? parsed.explanation
				: 'The prompt was translated into a couple of tighter Reddit-friendly directions.'
	};
}

function buildEmergencyPlan(userQuery) {
	const trimmed = userQuery.trim();
	const subredditCandidates = deriveFallbackSubreddits(userQuery);
	return {
		mode: 'emergency',
		originalQuery: userQuery,
		englishKeywords: [],
		chineseKeywords: [],
		searchQueries: [trimmed],
		subredditCandidates,
		primaryQuery: subredditCandidates[0] || trimmed,
		explanation:
			'Keyword planning was unavailable, so the app temporarily used the raw user query and a fallback Reddit source.'
	};
}

function buildInterpreterPrompt(userQuery) {
	return `You convert user drink requests into concise Reddit search directions.

Return only valid JSON with this exact shape:
{
  "english_keywords": ["..."],
  "search_queries": ["..."],
  "subreddit_candidates": ["..."],
  "explanation": "..."
}

Rules:
- Focus on drink discovery.
- Identify the user's most important drink intent from the sentence, not every descriptive word.
- Extract only non-redundant keywords that directly matter for the drink search.
- Prefer concrete beverage-facing concepts over generic adjectives.
- If the user already names a drink or base ingredient such as matcha, latte, coffee, milk tea, lemonade, cocktail, or mocktail, that concept must appear in the output.
- If two keywords overlap heavily, keep only the more useful one.
- Prioritize keywords that can help find real drinks: flavor, base, texture, function, season, occasion.
- Avoid repeating near-synonyms such as "refreshing / fresh / clean" all together.
- Make the final set feel like 1 to 2 distinct drink-search directions.
- Return exactly 1 or 2 search_queries.
- Order search_queries from most useful to least useful.
- Keep search_queries short, usually 2 to 5 words.
- Include flavor, function, and context when useful.
- Avoid full sentences.
- search_queries should be short English phrases that fit Reddit drink posts, like "iced matcha", "citrus mocktail", "summer coffee".
- english_keywords should contain only the most important 1 to 2 English concepts.
- subreddit_candidates must contain 1 or 2 subreddit names without the r/ prefix.
- Choose subreddit_candidates only from this list when possible: Mocktails, cocktails, tea, coffee, espresso, boba, Smoothies, juicing, bartenders.
- Match the subreddit to the drink type. Example: mocktails -> Mocktails, matcha -> tea, espresso -> espresso, cocktails -> cocktails.
- Do not let generic modifiers like "cold", "iced", or "refreshing" replace the actual drink identity.

User query:
${userQuery}`;
}

function deriveFallbackSubreddits(userQuery) {
	const text = userQuery.toLowerCase();
	if (/(matcha|tea|jasmine|oolong|chai)/.test(text)) return ['tea'];
	if (/(coffee|espresso|latte|cold brew)/.test(text)) return ['coffee'];
	if (/(cocktail|alcohol|gin|vodka|spritz|martini)/.test(text)) return ['cocktails'];
	if (/(mocktail|nonalcoholic|soda|sparkling)/.test(text)) return ['Mocktails'];
	if (/(smoothie|protein|fruit blend)/.test(text)) return ['Smoothies'];
	if (/(boba|milk tea)/.test(text)) return ['boba'];
	return ['Mocktails'];
}
