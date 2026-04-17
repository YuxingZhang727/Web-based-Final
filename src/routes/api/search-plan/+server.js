// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { buildSearchPlan } from '$lib/server/queryInterpreter';

const requestSchema = z.object({
	query: z.string().min(3).max(500)
});

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());
	const searchPlan = await buildSearchPlan(fetch, body.query);

	return json({
		message: `Search plan ready. ${searchPlan.explanation}`,
		searchPlan
	});
}
