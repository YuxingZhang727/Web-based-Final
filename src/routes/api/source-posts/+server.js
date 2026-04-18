// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { buildSearchPlan } from '$lib/server/queryInterpreter';
import { collectSourceNotes } from '$lib/server/discovery';

const searchPlanSchema = z.object({
	mode: z.string().optional(),
	originalQuery: z.string().optional(),
	englishKeywords: z.array(z.string()).optional(),
	chineseKeywords: z.array(z.string()).optional(),
	searchQueries: z.array(z.string()).min(1),
	subredditCandidates: z.array(z.string()).optional(),
	primaryQuery: z.string(),
	explanation: z.string().optional()
});

const requestSchema = z.object({
	query: z.string().min(3).max(500),
	searchPlan: searchPlanSchema.optional()
});

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());
	const searchPlan = body.searchPlan ?? (await buildSearchPlan(fetch, body.query));
	const sourceResult = await collectSourceNotes(fetch, body.query, searchPlan);

	return json({
		message: sourceResult.message,
		searchPlan,
		resolvedQuery: sourceResult.resolvedQuery,
		raw: sourceResult.raw,
		sourceNotes: sourceResult.sourceNotes
	});
}
