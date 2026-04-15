// @ts-nocheck
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';

const FALLBACK_MCPO_BASE_URL = 'http://127.0.0.1:8000';
const mcpoBaseUrl = new URL(env.mcpo_base_url || FALLBACK_MCPO_BASE_URL);

function normalizePath(input) {
	if (typeof input !== 'string' || input.length === 0) {
		throw error(400, 'path is required');
	}

	if (!input.startsWith('/')) {
		throw error(400, 'path must start with /');
	}

	return input;
}

export async function POST({ request, fetch }) {
	const payload = await request.json();
	const path = normalizePath(payload.path);

	const mcpoResponse = await fetch(`${mcpoBaseUrl.toString().replace(/\/$/, '')}${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(payload.body ?? {})
	});

	const text = await mcpoResponse.text();

	return json(
		{ content: text },
		{
			status: mcpoResponse.status
		}
	);
}
