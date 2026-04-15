// @ts-nocheck
import { json } from '@sveltejs/kit';
import { z } from 'zod';

import { fetchRednoteViaMcpo, getMcpoSearchPath, parseRednoteResponse } from '$lib/server/mcpo';
import { buildSearchPlan } from '$lib/server/queryInterpreter';

const requestSchema = z.object({
	query: z.string().min(3).max(500)
});

const mockRecipes = [
	{
		id: 'mock-1',
		name: 'Sparkling Pomelo Jasmine',
		tagline: 'Bright, lightly floral, and easy to sip in warm weather.',
		vibe: 'Summer terrace',
		function: 'Refreshing',
		taste: 'Citrusy, airy, gently sweet',
		matchReason:
			'Matches users asking for something refreshing and not too heavy, with fruit-forward flavor and a clean tea finish.',
		ingredients: ['jasmine tea', 'pomelo pulp', 'lime juice', 'sparkling water', 'honey'],
		steps: [
			'Brew jasmine tea and let it cool.',
			'Mix pomelo pulp, lime juice, and honey in a glass.',
			'Add ice, pour in tea, then top with sparkling water.'
		],
		signals: ['high save rate on fruit tea posts', 'repeated pairing: pomelo + floral tea', 'popular warm-weather format']
	},
	{
		id: 'mock-2',
		name: 'Cold Brew Citrus Tonic',
		tagline: 'A sharper, more energizing option with cafe-style edges.',
		vibe: 'Creative work session',
		function: 'Energizing',
		taste: 'Zesty, bitter, sparkling',
		matchReason:
			'Fits people who want energy without a dessert-like drink, and mirrors social posts combining tonic texture with citrus aroma.',
		ingredients: ['cold brew coffee', 'orange peel', 'tonic water', 'simple syrup', 'ice'],
		steps: [
			'Fill a tall glass with ice.',
			'Add cold brew and a small amount of syrup.',
			'Top with tonic water and express orange peel over the drink.'
		],
		signals: ['coffee-tonic trend', 'high engagement on bitter-sparkling drinks', 'common garnish pattern: orange peel']
	},
	{
		id: 'mock-3',
		name: 'Lychee Mint Green Tea',
		tagline: 'Soft, cooling, and slightly playful.',
		vibe: 'Picnic afternoon',
		function: 'Cooling',
		taste: 'Juicy, minty, delicate',
		matchReason:
			'Works well for users describing a gentle and fruity drink, especially in casual outdoor or daytime contexts.',
		ingredients: ['green tea', 'lychee syrup', 'fresh mint', 'lemon juice', 'ice'],
		steps: [
			'Shake green tea, lychee syrup, and lemon juice with ice.',
			'Pour into a glass over fresh ice.',
			'Clap mint leaves to release aroma and add on top.'
		],
		signals: ['frequent lychee-fruit tea combinations', 'mint used as freshness cue', 'strong visual appeal in social drink posts']
	}
];

export async function POST({ request, fetch }) {
	const body = requestSchema.parse(await request.json());

	try {
		const searchPlan = await buildSearchPlan(fetch, body.query);
		let raw = '';
		let recipes = [];
		let resolvedQuery = searchPlan.primaryQuery;

		for (const candidate of searchPlan.searchQueries) {
			raw = await fetchRednoteViaMcpo(fetch, candidate, 3);
			recipes = parseRednoteResponse(raw, body.query);
			if (recipes.length > 0) {
				resolvedQuery = candidate;
				break;
			}
		}

		return json({
			mode: 'mcp',
			message: `Recipes retrieved through mcpo path "${getMcpoSearchPath()}". Search query used: "${resolvedQuery}". ${searchPlan.explanation}`,
			searchPlan,
			recipes: recipes.length > 0 ? recipes : mockRecipes
		});
	} catch (error) {
		return json(
			{
				mode: 'mock',
				message:
					error instanceof Error
						? `MCP request failed, so demo recipes are shown instead. ${error.message}`
						: 'MCP request failed, so demo recipes are shown instead.',
				recipes: mockRecipes
			},
			{ status: 200 }
		);
	}
}
