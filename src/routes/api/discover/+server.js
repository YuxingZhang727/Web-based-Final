// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { buildSearchPlan } from '$lib/server/queryInterpreter';
import {
	analyzeSourceNotes,
	collectSourceNotes,
	generateRecipesFromNotes
} from '$lib/server/discovery';

const requestSchema = z.object({
	query: z.string().min(3).max(500)
});

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());
	const searchPlan = await buildSearchPlan(fetch, body.query);
	const sourceResult = await collectSourceNotes(fetch, body.query, searchPlan);
	const analysis = await analyzeSourceNotes(
		fetch,
		body.query,
		sourceResult.resolvedQuery,
		sourceResult.sourceNotes,
		sourceResult.raw
	);

	const aiSummary = analysis.aiSummary || analysis.fallbackSummary;
	const aiRecipes = await generateRecipesFromNotes(
		fetch,
		body.query,
		sourceResult.resolvedQuery,
		analysis.recipeReadyNotes,
		aiSummary,
		sourceResult.raw
	);

	return json({
		mode: sourceResult.retrievalError ? 'partial' : 'mcp',
		message: sourceResult.message,
		searchPlan,
		aiSummary,
		sourceNotes: analysis.enrichedSourceNotes,
		aiRecipes,
		recipes: aiRecipes,
		resolvedQuery: sourceResult.resolvedQuery
	});
}
