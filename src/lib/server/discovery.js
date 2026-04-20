// @ts-nocheck
import { fetchSubredditPosts, fetchPostWithComments, normalizePost } from '$lib/server/reddit';
import { generateStructuredJson } from '$lib/server/llm';

export async function collectSourceNotes(fetch, userQuery, searchPlan) {
	let resolvedQuery = searchPlan.primaryQuery;
	const retrievalErrors = [];
	const subredditCandidates = Array.isArray(searchPlan.subredditCandidates)
		? searchPlan.subredditCandidates
		: deriveFallbackSubreddits(userQuery, searchPlan.searchQueries);

	// Fetch all subreddits in parallel
	const subredditResults = await Promise.allSettled(
		subredditCandidates.slice(0, 2).map(async (subreddit) => {
			const rawPosts = await fetchSubredditPosts(fetch, subreddit, 4, 'month');
			const notes = rawPosts
				.slice(0, 2)
				.map((raw, i) => normalizePost(raw, i, userQuery, subreddit))
				.filter(Boolean);

			// Fetch full post content + comments in parallel
			const enriched = await Promise.all(notes.map((note) => attachPostContent(fetch, note)));
			return { subreddit, notes: enriched };
		})
	);

	const collectedNotes = [];
	for (const result of subredditResults) {
		if (result.status === 'fulfilled' && result.value.notes.length > 0) {
			if (resolvedQuery === searchPlan.primaryQuery) {
				resolvedQuery = `r/${result.value.subreddit}`;
			}
			collectedNotes.push(...result.value.notes);
		} else if (result.status === 'rejected') {
			const idx = subredditResults.indexOf(result);
			retrievalErrors.push({
				candidate: subredditCandidates[idx] ?? 'unknown',
				message: result.reason instanceof Error ? result.reason.message : 'Reddit fetch failed.'
			});
		}
	}

	const sourceNotes = dedupeNotes(collectedNotes).slice(0, 4);
	const retrievalError = formatRetrievalError(retrievalErrors, sourceNotes.length);

	return {
		raw: '',
		sourceNotes,
		resolvedQuery,
		retrievalError,
		message: retrievalError
			? `Reddit retrieval had a problem: ${retrievalError}`
			: `Posts fetched from Reddit. Source: "${resolvedQuery}". ${searchPlan.explanation}`
	};
}

export async function analyzeSourceNotes(fetch, userQuery, resolvedQuery, sourceNotes, rawContent) {
	const sourceText = buildSourceText(sourceNotes, rawContent);
	if (!sourceText) {
		return {
			enrichedSourceNotes: [],
			recipeReadyNotes: [],
			aiSummary: '',
			fallbackSummary: `No strong Reddit recipe matches were extracted yet for "${userQuery}".`
		};
	}

	const sourceAnalysis = await generateStructuredJson(
		fetch,
		`You are a drink recipe researcher. Analyze these Reddit posts and extract recipe inspiration.

User's request: "${userQuery}"
Reddit source: ${resolvedQuery}

Posts to analyze:
${sourceText}

Your tasks:
1. For each post, decide if it offers ANY drink-related value — ingredients, flavor ideas, techniques, ratios, tips, or even just a mood or concept worth building on.
2. Extract a short recipe cue from each useful post (a hint, not a full recipe).
3. Write a brief summary of the overall drink direction these posts suggest.

Be GENEROUS with "use_for_recipe": mark it true if the post gives even a single useful idea — a flavor combination, a base spirit/ingredient, a technique, or an interesting concept. Only mark false if the post is completely off-topic or contains no drink information at all.

Return a JSON object matching this schema exactly:`,
		`{
  "summary": "string — one or two sentences describing the overall drink direction",
  "notes": [
    {
      "id": "string — must match the post Id exactly",
      "use_for_recipe": true,
      "reason": "string — why this post is or isn't useful",
      "recipe_cue": "string — short hint like 'add cold brew to sparkling water with citrus'"
    }
  ]
}`
	).catch(() => null);

	const enrichedSourceNotes = mergeSourceAnalysis(sourceNotes, sourceAnalysis);
	const recipeReadyNotes = enrichedSourceNotes.filter((note) => note.aiUseForRecipe).slice(0, 3);
	const aiSummary = stringOrFallback(sourceAnalysis?.summary, '');
	const fallbackSummary = deriveSummaryFromNotes(userQuery, resolvedQuery, recipeReadyNotes);

	return {
		enrichedSourceNotes,
		recipeReadyNotes,
		aiSummary,
		fallbackSummary
	};
}

export async function generateRecipesFromNotes(fetch, userQuery, resolvedQuery, sourceNotes, summaryText, rawContent) {
	const sourceText = buildSourceText(sourceNotes, rawContent);
	if (!summaryText || !sourceText) {
		return [];
	}

	const result = await generateStructuredJson(
		fetch,
		`User request: ${userQuery}
Source used: ${resolvedQuery}
Editor note:
${summaryText}

Supporting source posts and comment cues:
${sourceText}

Generate 3 feasible drink recipes based primarily on the editor note above.
Use the Reddit posts and comments only as supporting evidence.
Only use posts that are clearly helpful for recipe generation.
Do not copy any single post directly.
You may moderately refine, combine, and complete missing details so the recipes feel more coherent and practical.
Each recipe should feel plausible, distinct, and easy to understand in a web interface.
Prefer simple ingredients, 2 to 4 preparation steps, and a clear reason why the recipe fits the user request.`,
		`{
  "recipes": [
    {
      "id": "recipe-1",
      "name": "string",
      "tagline": "string",
      "vibe": "string",
      "function": "string",
      "taste": "string",
      "matchReason": "string",
      "ingredients": ["string"],
      "steps": ["string"],
      "signals": ["string"]
    }
  ]
}`
	).catch(() => null);

	if (!result || typeof result !== 'object' || !Array.isArray(result.recipes)) {
		return [];
	}

	return result.recipes.map((recipe, index) => normalizeAiRecipe(recipe, index)).filter(Boolean).slice(0, 3);
}

export function buildSourceText(sourceNotes, rawContent) {
	if (Array.isArray(sourceNotes) && sourceNotes.length > 0) {
		return sourceNotes
			.slice(0, 4)
			.map(
				(note, index) =>
					`Post ${index + 1}
Id: ${note.id}
Title: ${note.name}
Community: ${note.vibe}
Taste: ${note.taste}
Summary: ${note.matchReason}
Body: ${Array.isArray(note.steps) ? note.steps.join(' ') : ''}
Signals: ${Array.isArray(note.signals) ? note.signals.join(', ') : ''}
Comments: ${Array.isArray(note.comments) ? note.comments.map(formatCommentForPrompt).join(' | ') : ''}`
			)
			.join('\n\n');
	}

	return typeof rawContent === 'string' ? rawContent.slice(0, 4000) : '';
}

async function attachPostContent(fetch, note) {
	if (!note?.redditPostId) return note;

	try {
		const payload = await fetchPostWithComments(fetch, note.subreddit || '', note.redditPostId, 5);
		if (!payload) return note;

		const postBody = typeof payload.post?.selftext === 'string' ? payload.post.selftext.trim() : '';
		const comments = Array.isArray(payload.comments) ? payload.comments.slice(0, 4) : [];

		return {
			...note,
			tagline: postBody.slice(0, 140) || note.tagline,
			steps: postBody ? [postBody] : note.steps,
			comments,
			commentHighlights: comments.map((c) => c.content).filter(Boolean)
		};
	} catch {
		return note;
	}
}


function normalizeAiRecipe(recipe, index) {
	if (!recipe || typeof recipe !== 'object') {
		return null;
	}

	return {
		id: typeof recipe.id === 'string' ? recipe.id : `recipe-${index}`,
		name: stringOrFallback(recipe.name, `Recipe ${index + 1}`),
		tagline: stringOrFallback(recipe.tagline, 'A direction shaped from recent community posts'),
		vibe: stringOrFallback(recipe.vibe, 'Community-driven'),
		function: stringOrFallback(recipe.function, 'Personalized'),
		taste: stringOrFallback(recipe.taste, 'Balanced'),
		matchReason: stringOrFallback(
			recipe.matchReason,
			'Generated from recurring Reddit patterns and aligned to the user request.'
		),
		ingredients: toStringArray(recipe.ingredients),
		steps: toStringArray(recipe.steps),
		signals: toStringArray(recipe.signals),
		sourceTitle: '',
		sourceUrl: ''
	};
}

function toStringArray(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((item) => String(item).trim()).filter(Boolean);
}

function stringOrFallback(value, fallback) {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function mergeSourceAnalysis(sourceNotes, sourceAnalysis) {
	if (!Array.isArray(sourceNotes) || sourceNotes.length === 0) {
		return [];
	}

	const notesById = new Map(
		Array.isArray(sourceAnalysis?.notes)
			? sourceAnalysis.notes.filter((note) => note && typeof note === 'object').map((note) => [String(note.id), note])
			: []
	);

	return sourceNotes.map((note) => {
		const insight = notesById.get(String(note.id));
		return {
			...note,
			aiUseForRecipe: Boolean(insight?.use_for_recipe),
			aiReason: stringOrFallback(insight?.reason, 'Not enough recipe-specific detail stood out in this post.'),
			aiRecipeCue: stringOrFallback(
				insight?.recipe_cue,
				insight?.use_for_recipe ? 'Useful recipe direction detected.' : 'No strong recipe cue extracted.'
			)
		};
	});
}

function deriveSummaryFromNotes(userQuery, resolvedQuery, sourceNotes) {
	if (!Array.isArray(sourceNotes) || sourceNotes.length === 0) {
		return `No strong Reddit recipe matches were extracted yet for "${userQuery}".`;
	}

	const topNotes = sourceNotes.slice(0, 4);
	const functions = uniqueValues(topNotes.map((note) => note.function)).join(', ') || 'drink inspiration';
	const tastes = uniqueValues(topNotes.map((note) => note.taste)).join(', ') || 'mixed flavor directions';
	const vibes = uniqueValues(topNotes.map((note) => note.vibe)).join(', ') || 'community discussions';

	return `For "${userQuery}", the Reddit source "${resolvedQuery}" surfaced posts leaning toward ${functions}. The strongest recurring taste cues are ${tastes}, and the most common contexts are ${vibes}. These posts suggest the most promising recipes are practical, repeatable drinks shaped by shared tips and comment-level fixes.`;
}

function uniqueValues(values) {
	return [...new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))];
}

function dedupeNotes(notes) {
	if (!Array.isArray(notes)) {
		return [];
	}

	const seen = new Set();
	return notes.filter((note) => {
		const key = `${note.redditPostId || ''}::${note.sourceUrl || ''}`.trim();
		if (!key || seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function formatRetrievalError(retrievalErrors, successfulCount) {
	if (!Array.isArray(retrievalErrors) || retrievalErrors.length === 0) {
		return '';
	}

	const normalizedMessages = retrievalErrors
		.map((item) => {
			const candidate = typeof item?.candidate === 'string' ? item.candidate : 'unknown source';
			const message = typeof item?.message === 'string' ? item.message.replace(/\s+/g, ' ').trim() : 'Unknown error';
			return `"${candidate}": ${message}`;
		})
		.slice(0, 3);

	const joined = normalizedMessages.join(' | ');
	if (successfulCount > 0) {
		return `Some Reddit sources failed, but partial results were still collected. Failed sources: ${joined}`;
	}

	return `All Reddit sources failed. Failed sources: ${joined}`;
}

function deriveFallbackSubreddits(userQuery, searchQueries = []) {
	const text = `${userQuery}\n${Array.isArray(searchQueries) ? searchQueries.join(' ') : ''}`.toLowerCase();
	if (/(matcha|tea|jasmine|oolong|chai)/.test(text)) return ['tea', 'matcha'];
	if (/(coffee|espresso|latte|cold brew)/.test(text)) return ['coffee', 'espresso'];
	if (/(cocktail|alcohol|gin|vodka|spritz|martini)/.test(text)) return ['cocktails', 'bartenders'];
	if (/(mocktail|nonalcoholic|na |sober|sparkling)/.test(text)) return ['Mocktails', 'Soda'];
	if (/(smoothie|protein|fruit blend)/.test(text)) return ['Smoothies', 'juicing'];
	if (/(boba|milk tea)/.test(text)) return ['boba', 'tea'];
	return ['Mocktails', 'cocktails'];
}

function formatCommentForPrompt(comment) {
	if (!comment || typeof comment !== 'object') {
		return '';
	}

	const author = typeof comment.author === 'string' && comment.author.trim() ? `${comment.author}: ` : '';
	const content = typeof comment.content === 'string' ? comment.content.trim() : '';
	return `${author}${content}`.trim();
}
