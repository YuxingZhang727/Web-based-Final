// @ts-nocheck
import { env } from '$env/dynamic/private';
import { generateStructuredJson } from '$lib/server/llm';

const keywordDictionary = [
	{ en: ['refreshing', 'refresh'], zh: ['清爽', '解渴', '清新'] },
	{ en: ['citrus', 'lemon', 'lime', 'orange', 'grapefruit'], zh: ['柠檬', '柑橘', '西柚'] },
	{ en: ['summer'], zh: ['夏日', '夏天'] },
	{ en: ['afternoon'], zh: ['下午茶', '午后'] },
	{ en: ['energizing', 'energy'], zh: ['提神', '醒脑'] },
	{ en: ['tea', 'tea-based'], zh: ['茶饮', '果茶'] },
	{ en: ['floral', 'flower'], zh: ['花香', '茉莉', '桂花'] },
	{ en: ['mint'], zh: ['薄荷'] },
	{ en: ['coffee'], zh: ['咖啡'] },
	{ en: ['sweet'], zh: ['甜感'] },
	{ en: ['light'], zh: ['轻盈', '低负担'] },
	{ en: ['cold', 'iced'], zh: ['冰饮'] }
];

export async function buildSearchPlan(fetchFn, userQuery) {
	const aiPlan = await buildAiPlan(fetchFn, userQuery).catch(() => null);
	if (aiPlan) {
		return aiPlan;
	}

	return buildHeuristicPlan(userQuery);
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
	const searchQueries = Array.isArray(parsed.search_queries) ? parsed.search_queries.filter(Boolean) : [];

	if (searchQueries.length === 0) {
		return null;
	}

	return {
		mode: 'ai',
		originalQuery: userQuery,
		englishKeywords,
		chineseKeywords,
		searchQueries,
		primaryQuery: searchQueries[0],
		explanation:
			typeof parsed.explanation === 'string'
				? parsed.explanation
				: 'AI converted the prompt into shorter bilingual search queries for Rednote.'
	};
}

function buildHeuristicPlan(userQuery) {
	const normalized = userQuery.toLowerCase();
	const englishKeywords = [];
	const chineseKeywords = [];

	for (const entry of keywordDictionary) {
		if (entry.en.some((word) => normalized.includes(word))) {
			englishKeywords.push(...entry.en.slice(0, 1));
			chineseKeywords.push(...entry.zh);
		}
	}

	const uniqueEnglish = [...new Set(englishKeywords)];
	const uniqueChinese = [...new Set(chineseKeywords)];

	const searchQueries = [];
	if (uniqueChinese.length > 0) {
		searchQueries.push(uniqueChinese.join(' '));
	}
	if (uniqueChinese.length >= 2) {
		searchQueries.push(uniqueChinese.slice(0, 2).join(' ') + ' 饮品');
	}
	if (uniqueEnglish.length > 0) {
		searchQueries.push(uniqueEnglish.join(' '));
	}
	if (searchQueries.length === 0) {
		searchQueries.push(userQuery);
	}

	return {
		mode: 'heuristic',
		originalQuery: userQuery,
		englishKeywords: uniqueEnglish,
		chineseKeywords: uniqueChinese,
		searchQueries,
		primaryQuery: searchQueries[0],
		explanation:
			'The app converted the natural-language prompt into shorter bilingual search keywords before sending it to Rednote.'
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
- Translate the intent into short Chinese search phrases suitable for Xiaohongshu.
- Keep search_queries short, usually 2 to 6 Chinese words.
- Include flavor, function, and context when useful.
- Avoid full sentences.
- Prefer beverage-related phrases like 柠檬茶, 清爽饮品, 夏日饮品, 提神果茶.

User query:
${userQuery}`;
}
