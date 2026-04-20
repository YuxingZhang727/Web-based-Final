// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { analyzeSourceNotes, generateRecipesFromNotes } from '$lib/server/discovery';

const noteSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	tagline: z.string().optional(),
	vibe: z.string().optional(),
	function: z.string().optional(),
	taste: z.string().optional(),
	matchReason: z.string().optional(),
	ingredients: z.array(z.string()).optional(),
	steps: z.array(z.string()).optional(),
	signals: z.array(z.string()).optional(),
	sourceTitle: z.string().optional(),
	sourceUrl: z.string().optional(),
	aiUseForRecipe: z.boolean().optional(),
	aiReason: z.string().optional(),
	aiRecipeCue: z.string().optional()
});

const requestSchema = z.object({
	query: z.string().min(3).max(500),
	resolvedQuery: z.string().min(1),
	sourceNotes: z.array(noteSchema),
	raw: z.string().optional(),
	aiSummary: z.string().optional()
});

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());
	const analysis = await analyzeSourceNotes(
		fetch,
		body.query,
		body.resolvedQuery,
		body.sourceNotes,
		body.raw || ''
	);
	const effectiveSummary = body.aiSummary || analysis.aiSummary || analysis.fallbackSummary;
	const notesForRecipes =
		analysis.recipeReadyNotes.length > 0
			? analysis.recipeReadyNotes
			: analysis.enrichedSourceNotes.length > 0
				? analysis.enrichedSourceNotes.slice(0, 3)
				: body.sourceNotes.slice(0, 3);
	const aiRecipes = await generateRecipesFromNotes(
		fetch,
		body.query,
		body.resolvedQuery,
		notesForRecipes,
		effectiveSummary,
		body.raw || ''
	);

	return json({
		message: aiRecipes.length > 0 ? 'Recipe generation completed.' : 'No recipe-ready posts were found.',
		aiSummary: effectiveSummary,
		sourceNotes: analysis.enrichedSourceNotes,
		aiRecipes,
		recipes: aiRecipes
	});
}
