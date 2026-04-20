// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { hydrateSourceNotes } from '$lib/server/discovery';

const sourceNoteSchema = z.object({
	id: z.string(),
	redditPostId: z.string().optional(),
	name: z.string().optional(),
	tagline: z.string().optional(),
	postContent: z.string().optional(),
	vibe: z.string().optional(),
	function: z.string().optional(),
	taste: z.string().optional(),
	matchReason: z.string().optional(),
	ingredients: z.array(z.string()).optional(),
	steps: z.array(z.string()).optional(),
	signals: z.array(z.string()).optional(),
	sourceTitle: z.string().optional(),
	sourceUrl: z.string().optional(),
	comments: z.array(z.any()).optional(),
	commentHighlights: z.array(z.string()).optional()
});

const requestSchema = z.object({
	query: z.string().min(3).max(500),
	resolvedQuery: z.string().min(1).max(500),
	raw: z.string().optional(),
	sourceNotes: z.array(sourceNoteSchema)
});

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());
	const result = await hydrateSourceNotes(
		fetch,
		body.query,
		body.resolvedQuery,
		body.sourceNotes,
		body.raw || ''
	);

	return json(result);
}
