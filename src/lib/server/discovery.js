// @ts-nocheck
import { fetchRednoteViaMcpo, getMcpoSearchPath, parseRednoteResponse } from '$lib/server/mcpo';
import { generateStructuredJson } from '$lib/server/llm';

export async function collectSourceNotes(fetch, userQuery, searchPlan) {
	let raw = '';
	let sourceNotes = [];
	let resolvedQuery = searchPlan.primaryQuery;
	let retrievalError = '';
	const retrievalErrors = [];
	const collectedNotes = [];
	const rawChunks = [];

	for (const candidate of searchPlan.searchQueries) {
		try {
			const candidateRaw = await fetchRednoteViaMcpo(fetch, candidate, 3);
			const candidateNotes = parseRednoteResponse(candidateRaw, userQuery);
			if (candidateNotes.length > 0) {
				if (resolvedQuery === searchPlan.primaryQuery) {
					resolvedQuery = candidate;
				}
				rawChunks.push(candidateRaw);
				collectedNotes.push(
					...candidateNotes.map((note, index) => ({
						...note,
						id: `${note.id}-${candidate}-${index}`
					}))
				);
			}
		} catch (error) {
			retrievalErrors.push({
				candidate,
				message: error instanceof Error ? error.message : 'MCP request failed.'
			});
		}

		if (collectedNotes.length >= 3) {
			break;
		}
	}

	sourceNotes = dedupeNotes(collectedNotes).slice(0, 3);
	raw = rawChunks.join('\n\n');
	retrievalError = formatRetrievalError(retrievalErrors, sourceNotes.length);

	return {
		raw,
		sourceNotes,
		resolvedQuery,
		retrievalError,
		message: retrievalError
			? `Keyword planning completed, but source retrieval had a problem: ${retrievalError}`
			: `Recipes retrieved through mcpo path "${getMcpoSearchPath()}". Search query used: "${resolvedQuery}". ${searchPlan.explanation}`
	};
}

function formatRetrievalError(retrievalErrors, successfulCount) {
	if (!Array.isArray(retrievalErrors) || retrievalErrors.length === 0) {
		return '';
	}

	const normalizedMessages = retrievalErrors
		.map((item) => {
			const candidate = typeof item?.candidate === 'string' ? item.candidate : 'unknown query';
			const message = typeof item?.message === 'string' ? item.message.replace(/\s+/g, ' ').trim() : 'Unknown error';
			return `"${candidate}": ${message}`;
		})
		.slice(0, 3);

	const joined = normalizedMessages.join(' | ');
	if (successfulCount > 0) {
		return `Some Rednote searches failed, but partial results were still collected. Failed queries: ${joined}`;
	}

	if (normalizedMessages.some((message) => message.includes('Not logged in'))) {
		return `Rednote source retrieval failed because the MCP browser session is not logged in. Failed queries: ${joined}`;
	}

	return `All Rednote searches failed. Failed queries: ${joined}`;
}

export async function analyzeSourceNotes(fetch, userQuery, resolvedQuery, sourceNotes, rawContent) {
	const sourceText = buildSourceText(sourceNotes, rawContent);
	if (!sourceText) {
		return {
			enrichedSourceNotes: [],
			recipeReadyNotes: [],
			aiSummary: '',
			fallbackSummary: `No strong Rednote recipe matches were extracted yet for "${userQuery}".`
		};
	}

	const sourceAnalysis = await generateStructuredJson(
		fetch,
		`User request: ${userQuery}
Search query used: ${resolvedQuery}

Source notes:
${sourceText}

Task:
1. Evaluate the 2 to 3 source notes.
2. Decide whether each note is useful for recipe generation.
3. If useful, extract one short recipe cue from it.
4. Write one concise summary of the overall recipe direction based only on useful notes.

Rules:
- A note is useful only if it contains concrete drink inspiration such as ingredients, flavor pairings, drink type, or preparation clues.
- If a note is vague, aesthetic-only, or not recipe-relevant, mark it not useful.
- Keep the summary concise and readable.
- Keep the per-note reason concise.
- Keep the recipe cue short, like a design hint, not a full recipe.
- If none of the notes are useful, say that clearly in the summary.`,
		`{
  "summary": "string",
  "notes": [
    {
      "id": "string",
      "use_for_recipe": true,
      "reason": "string",
      "recipe_cue": "string"
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
Search query used: ${resolvedQuery}
AI summary:
${summaryText}

Supporting source notes:
${sourceText}

Generate 3 feasible drink recipes based primarily on the AI summary above.
Use the source notes only as supporting evidence.
Only use notes that are clearly helpful for recipe generation.
Do not copy any single post directly.
You may moderately refine, combine, and complete missing details so the recipes feel more coherent and more practical.
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
			.slice(0, 3)
			.map(
				(note, index) =>
					`Note ${index + 1}
Id: ${note.id}
Title: ${note.name}
Taste: ${note.taste}
Reason: ${note.matchReason}
Steps: ${Array.isArray(note.steps) ? note.steps.join(' ') : ''}
Signals: ${Array.isArray(note.signals) ? note.signals.join(', ') : ''}`
			)
			.join('\n\n');
	}

	return typeof rawContent === 'string' ? rawContent.slice(0, 4000) : '';
}

function normalizeAiRecipe(recipe, index) {
	if (!recipe || typeof recipe !== 'object') {
		return null;
	}

	return {
		id: typeof recipe.id === 'string' ? recipe.id : `ai-recipe-${index}`,
		name: stringOrFallback(recipe.name, `AI Recipe ${index + 1}`),
		tagline: stringOrFallback(recipe.tagline, 'AI-generated from Rednote patterns'),
		vibe: stringOrFallback(recipe.vibe, 'AI interpretation'),
		function: stringOrFallback(recipe.function, 'Personalized'),
		taste: stringOrFallback(recipe.taste, 'Balanced'),
		matchReason: stringOrFallback(
			recipe.matchReason,
			'Generated from recurring Rednote patterns and aligned to the user request.'
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
			aiReason: stringOrFallback(insight?.reason, 'AI did not find enough recipe-specific detail in this post.'),
			aiRecipeCue: stringOrFallback(
				insight?.recipe_cue,
				insight?.use_for_recipe ? 'Useful recipe direction detected.' : 'No strong recipe cue extracted.'
			)
		};
	});
}

function deriveSummaryFromNotes(userQuery, resolvedQuery, sourceNotes) {
	if (!Array.isArray(sourceNotes) || sourceNotes.length === 0) {
		return `No strong Rednote recipe matches were extracted yet for "${userQuery}".`;
	}

	const topNotes = sourceNotes.slice(0, 3);
	const functions = uniqueValues(topNotes.map((note) => note.function)).join(', ') || 'drink inspiration';
	const tastes = uniqueValues(topNotes.map((note) => note.taste)).join(', ') || 'mixed flavor directions';
	const vibes = uniqueValues(topNotes.map((note) => note.vibe)).join(', ') || 'casual social contexts';

	return `For "${userQuery}", the Rednote search term "${resolvedQuery}" surfaced posts leaning toward ${functions}. The strongest recurring taste cues are ${tastes}, and the most common contexts are ${vibes}. These notes suggest the most promising recipes are light, easy-to-make drinks built from repeat ingredient pairings rather than one-off novelty combinations.`;
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
		const key = `${note.sourceUrl || ''}::${note.name || ''}::${note.tagline || ''}`.trim();
		if (!key || seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}
