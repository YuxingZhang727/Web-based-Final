// @ts-nocheck
import { env } from '$env/dynamic/private';

const FALLBACK_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const FALLBACK_OLLAMA_MODEL = 'gemma3:1b';

export async function generateStructuredJson(fetchFn, prompt, schemaDescription) {
	const ollamaResult = await generateWithOllama(fetchFn, prompt, schemaDescription).catch(() => null);
	if (ollamaResult) {
		return ollamaResult;
	}

	return null;
}

export async function generateText(fetchFn, systemPrompt, userPrompt) {
	const ollamaText = await generateTextWithOllama(fetchFn, systemPrompt, userPrompt).catch(() => null);
	if (ollamaText) {
		return ollamaText;
	}

	throw new Error(
		'Ollama request failed. Make sure Ollama is running locally and the selected model is available.'
	);
}

async function generateWithOllama(fetchFn, prompt, schemaDescription) {
	const ollamaBaseUrl = new URL(env.ollama_base_url || FALLBACK_OLLAMA_BASE_URL);
	const ollamaModel = env.ollama_model || FALLBACK_OLLAMA_MODEL;
	const response = await fetchFn(`${ollamaBaseUrl.toString().replace(/\/$/, '')}/api/generate`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model: ollamaModel,
			stream: false,
			format: 'json',
			prompt: `Return only valid JSON. Follow this schema shape: ${schemaDescription}\n\n${prompt}`
		})
	});

	if (!response.ok) {
		throw new Error(await response.text());
	}

	const data = await response.json();
	return extractJson(data?.response);
}

async function generateTextWithOllama(fetchFn, systemPrompt, userPrompt) {
	const ollamaBaseUrl = new URL(env.ollama_base_url || FALLBACK_OLLAMA_BASE_URL);
	const ollamaModel = env.ollama_model || FALLBACK_OLLAMA_MODEL;
	const response = await fetchFn(`${ollamaBaseUrl.toString().replace(/\/$/, '')}/api/generate`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model: ollamaModel,
			stream: false,
			prompt: `${systemPrompt}\n\n${userPrompt}`
		})
	});

	if (!response.ok) {
		throw new Error(await response.text());
	}

	const data = await response.json();
	return typeof data?.response === 'string' ? data.response.trim() : null;
}

function extractJson(content) {
	const text = normalizeContentText(content);
	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {}

	const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fencedMatch?.[1]) {
		try {
			return JSON.parse(fencedMatch[1].trim());
		} catch {}
	}

	const objectMatch = text.match(/\{[\s\S]*\}/);
	if (objectMatch?.[0]) {
		try {
			return JSON.parse(objectMatch[0]);
		} catch {}
	}

	return null;
}

function normalizeContentText(content) {
	if (typeof content === 'string') {
		return content.trim();
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
				return '';
			})
			.join('\n')
			.trim();
	}

	return null;
}
