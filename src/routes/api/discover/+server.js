// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { fetchRednoteViaMcpo, getMcpoSearchPath, parseRednoteResponse } from '$lib/server/mcpo';
import { buildSearchPlan } from '$lib/server/queryInterpreter';
import { generateStructuredJson, generateText } from '$lib/server/llm';

const requestSchema = z.object({
	query: z.string().min(3).max(500)
});

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());
	const searchPlan = await buildSearchPlan(fetch, body.query);
	let raw = '';
	let sourceNotes = [];
	let resolvedQuery = searchPlan.primaryQuery;
	let retrievalError = '';

	try {
		for (const candidate of searchPlan.searchQueries) {
			raw = await fetchRednoteViaMcpo(fetch, candidate, 3);
			sourceNotes = parseRednoteResponse(raw, body.query);
			if (sourceNotes.length > 0) {
				resolvedQuery = candidate;
				break;
			}
		}
	} catch (error) {
		retrievalError = error instanceof Error ? error.message : 'MCP request failed.';
	}

	const aiSummary = await buildAiSummary(fetch, body.query, resolvedQuery, sourceNotes, raw);
	const fallbackSummary = deriveSummaryFromNotes(body.query, resolvedQuery, sourceNotes);
	const summaryForRecipes = aiSummary || fallbackSummary;
	const aiRecipes = await buildAiRecipes(
		fetch,
		body.query,
		resolvedQuery,
		sourceNotes,
		summaryForRecipes,
		raw
	);

	return json({
		mode: retrievalError ? 'partial' : 'mcp',
		message: retrievalError
			? `Keyword planning completed, but source retrieval had a problem: ${retrievalError}`
			: `Recipes retrieved through mcpo path "${getMcpoSearchPath()}". Search query used: "${resolvedQuery}". ${searchPlan.explanation}`,
		searchPlan,
		aiSummary: aiSummary || fallbackSummary,
		sourceNotes,
		aiRecipes,
		recipes: aiRecipes
	});
}

async function buildAiSummary(fetch, userQuery, resolvedQuery, sourceNotes, rawContent) {
	const sourceText = buildSourceText(sourceNotes, rawContent);
	if (!sourceText) {
		return '';
	}

	const content = await generateText(
		fetch,
		'You are helping transform messy Xiaohongshu drink posts into a short, readable drink insight summary for a design project.',
		`User request: ${userQuery}
Search query used: ${resolvedQuery}

Source notes:
${sourceText}

Write one concise paragraph that includes:
1. the dominant drink direction in the posts
2. the strongest flavor, function, and context patterns
3. 2 or 3 recipe directions that would make sense to generate next

Do not list every source note separately.
Do not copy post text word for word.`
	).catch(() => '');

	return content || '';
}

async function buildAiRecipes(fetch, userQuery, resolvedQuery, sourceNotes, summaryText, rawContent) {
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
Do not copy any single post directly.
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

	return result.recipes
		.map((recipe, index) => normalizeAiRecipe(recipe, index))
		.filter(Boolean)
		.slice(0, 3);
}

function buildSourceText(sourceNotes, rawContent) {
	if (Array.isArray(sourceNotes) && sourceNotes.length > 0) {
		return sourceNotes
			.slice(0, 3)
			.map(
				(note, index) =>
					`Note ${index + 1}
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
