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
		'{"english_keywords":["..."],"chinese_keywords":["..."],"search_queries":["..."],"explanation":"..."}'
	);
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	const englishKeywords = Array.isArray(parsed.english_keywords) ? parsed.english_keywords.filter(Boolean) : [];
	const chineseKeywords = Array.isArray(parsed.chinese_keywords) ? parsed.chinese_keywords.filter(Boolean) : [];
	const directSearchQueries = Array.isArray(parsed.search_queries)
		? [...new Set(parsed.search_queries.map((item) => String(item).trim()).filter(Boolean))].slice(0, 2)
		: [];
	const fallbackSearchQueries =
		directSearchQueries.length > 0
			? []
			: [...new Set(chineseKeywords.map((item) => String(item).trim()).filter(Boolean))].slice(0, 2);
	const searchQueries = directSearchQueries.length > 0 ? directSearchQueries : fallbackSearchQueries;

	if (searchQueries.length < 1) {
		return null;
	}

	return {
		mode: 'ai',
		originalQuery: userQuery,
		englishKeywords: [...new Set(englishKeywords.map((item) => String(item).trim()).filter(Boolean))].slice(0, 2),
		chineseKeywords: [...new Set(chineseKeywords.map((item) => String(item).trim()).filter(Boolean))].slice(0, 4),
		searchQueries,
		primaryQuery: searchQueries[0],
		explanation:
			typeof parsed.explanation === 'string'
				? parsed.explanation
				: 'AI converted the prompt into shorter bilingual search queries for Rednote.'
	};
}

function buildEmergencyPlan(userQuery) {
	const trimmed = userQuery.trim();
	return {
		mode: 'emergency',
		originalQuery: userQuery,
		englishKeywords: [],
		chineseKeywords: [],
		searchQueries: [trimmed],
		primaryQuery: trimmed,
		explanation:
			'AI keyword planning was unavailable, so the app temporarily used the raw user query as the search input.'
	};
}

function buildInterpreterPrompt(userQuery) {
	return `You convert user drink requests into Rednote/Xiaohongshu search keywords.

Return only valid JSON with this exact shape:
{
  "english_keywords": ["..."],
  "chinese_keywords": ["..."],
  "search_queries": ["..."],
  "explanation": "..."
}

Rules:
- Focus on drink discovery.
- Identify the user's most important drink intent from the sentence, not every descriptive word.
- Extract only non-redundant keywords that directly matter for the drink search.
- Prefer concrete beverage-facing concepts over generic adjectives.
- If the user already names a drink or base ingredient such as matcha, latte, coffee, milk tea, or lemonade, that concept must appear in the output.
- If two keywords overlap heavily, keep only the more useful one.
- Prioritize keywords that can help find real drinks: flavor, base, texture, function, season, occasion.
- Avoid repeating near-synonyms such as "refreshing / fresh / clean" all together.
- Make the final set feel like 1 to 2 distinct drink-search directions.
- Translate the intent into short Chinese search phrases suitable for Xiaohongshu.
- Return exactly 1 or 2 search_queries.
- Order search_queries from most useful to least useful.
- Keep search_queries short, usually 2 to 6 Chinese words.
- Include flavor, function, and context when useful.
- Avoid full sentences.
- Prefer beverage-related phrases like 柠檬茶, 柑橘气泡饮, 夏日果茶, 提神冷萃, 花香特调.
- english_keywords should contain only the most important 1 to 2 English concepts.
- chinese_keywords should contain the most important translated cues, not every possible synonym.
- search_queries should look like phrases a Rednote user would actually search for drinks.
- Make search_queries Chinese-first whenever possible.
- Do not let generic modifiers like "cold", "iced", or "refreshing" replace the actual drink identity.
- Example: "I need a recipe of iced matcha" should keep "matcha" central and produce phrases like "冰抹茶", "抹茶拿铁", "抹茶饮", not just "cold drink".

User query:
${userQuery}`;
}
