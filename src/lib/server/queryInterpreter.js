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
	return `You convert user drink requests into Reddit search directions. Your most important job is to pick the RIGHT subreddit based on the drink's actual identity — not to default to cocktails or Mocktails.

Return only valid JSON with this exact shape:
{
  "english_keywords": ["..."],
  "search_queries": ["..."],
  "subreddit_candidates": ["..."],
  "explanation": "..."
}

Available subreddits (pick the 1-2 most fitting):
- tea            → tea, herbal infusions, floral drinks, botanical, matcha, oolong, chai
- coffee         → coffee, espresso, latte, cold brew, pour-over
- cocktails      → alcoholic cocktails, spirits, bartending
- bartenders     → professional bartending, creative spirit-based drinks
- Mocktails      → non-alcoholic versions of cocktails specifically
- boba           → bubble tea, milk tea, tapioca drinks
- Smoothies      → blended fruit/veggie drinks, protein shakes
- juicing        → cold-pressed juice, fresh juice
- kombucha       → fermented tea, probiotic drinks
- herbalism      → herbal remedies, botanical drinks, tinctures
- cocktails      → creative mixed drinks (use for unusual/creative non-specific drinks)

Mapping examples — read these carefully:
- "floral, herbal, slightly bitter" → tea, herbalism
- "unusual creative botanical" → tea, herbalism
- "matcha latte" → tea, coffee
- "cold brew coffee" → coffee
- "gin and tonic" → cocktails, bartenders
- "virgin mojito" → Mocktails
- "bubble tea with taro" → boba
- "green smoothie" → Smoothies
- "kombucha-style fermented" → kombucha, tea
- "citrusy refreshing summer" → cocktails, Mocktails
- "iced floral drink" → tea
- "espresso martini" → coffee, cocktails

Rules:
- Read the flavor profile and mood, not just drink names.
- Floral, herbal, botanical, bitter, earthy → lean toward tea or herbalism.
- Creamy, sweet, milky → lean toward boba or Smoothies.
- Fruit-forward, blended → Smoothies or juicing.
- Fermented, probiotic → kombucha.
- Spirit-based, boozy → cocktails or bartenders.
- Only use Mocktails if the user explicitly wants a non-alcoholic cocktail-style drink.
- Do NOT default to cocktails or Mocktails when the flavor description points elsewhere.
- Return exactly 1 or 2 search_queries as short Reddit-friendly phrases (2-5 words).
- english_keywords: 1-2 most important drink concepts.

User query:
${userQuery}`;
}

function deriveFallbackSubreddits(userQuery) {
	const text = userQuery.toLowerCase();
	if (/(matcha|green tea|抹茶)/.test(text))                                          return ['tea'];
	if (/(coffee|espresso|latte|cold brew|americano|cappuccino|咖啡)/.test(text))       return ['coffee', 'espresso'];
	if (/(cocktail|gin|vodka|spritz|martini|whiskey|rum|alcohol|alcoholic)/.test(text)) return ['cocktails', 'bartenders'];
	if (/(boba|bubble tea|milk tea|tapioca|珍珠)/.test(text))                           return ['boba', 'tea'];
	if (/(smoothie|fruit blend|açaí|acai|blended)/.test(text))                         return ['Smoothies', 'juicing'];
	if (/(mocktail|nonalcoholic|non-alcoholic|virgin|sober)/.test(text))               return ['Mocktails'];
	if (/(kombucha|fermented|probiotic|kefir)/.test(text))                             return ['kombucha', 'tea'];
	if (/(floral|herbal|botanical|lavender|rose|hibiscus|chamomile|elderflower)/.test(text)) return ['tea', 'herbalism'];
	if (/(bitter|tonic|aperitif|amaro|digestif)/.test(text))                           return ['cocktails', 'tea'];
	if (/(tea|oolong|jasmine|chai|earl grey|herbal|green tea|white tea)/.test(text))   return ['tea'];
	if (/(lemonade|citrus|lemon|lime|grapefruit)/.test(text))                          return ['Mocktails', 'cocktails'];
	if (/(juice|tropical|mango|berry|pineapple|peach|fruit)/.test(text))               return ['Smoothies', 'juicing'];
	if (/(soda|sparkling|fizzy|tonic|shrub|carbonated)/.test(text))                    return ['Mocktails', 'cocktails'];
	if (/(unusual|creative|unique|experimental|inspired)/.test(text))                  return ['tea', 'cocktails'];
	return ['tea', 'cocktails'];
}
