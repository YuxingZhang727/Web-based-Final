// @ts-nocheck
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';

import { generateText } from '$lib/server/llm';

const requestSchema = z.object({
	mode: z.enum(['search-plan', 'recipe-cleanup']).default('recipe-cleanup'),
	content: z.string().min(1),
	query: z.string().optional().default('')
});

function buildPrompt(mode, query, content) {
	if (mode === 'search-plan') {
		return {
			systemPrompt:
				'You help transform user drink requests into better Xiaohongshu search ideas. Write concise, readable output with short sections.',
			userPrompt: `User query:\n${content}\n\nExplain the flavor intent, function, context, and suggest 3 to 5 better bilingual search phrases for Rednote/Xiaohongshu.`
		};
	}

	return {
		systemPrompt:
			'You are helping turn messy Xiaohongshu drink posts into cleaner recipe ideas. Keep the response concise, structured, and readable.',
		userPrompt: `Original user request:\n${query}\n\nRaw Rednote content:\n${content}\n\nSummarize the likely drink idea, flavor profile, ingredients if identifiable, and why it matches the user request.`
	};
}

export async function POST({ request, fetch }) {
	const payload = requestSchema.parse(await request.json());
	const prompt = buildPrompt(payload.mode, payload.query, payload.content);

	try {
		const content = await generateText(fetch, prompt.systemPrompt, prompt.userPrompt);
		return json({ content });
	} catch (err) {
		throw error(500, err instanceof Error ? err.message : 'Interpretation failed');
	}
}
