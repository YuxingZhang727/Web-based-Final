// @ts-nocheck
import { env } from '$env/dynamic/private';

const FALLBACK_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const FALLBACK_OLLAMA_MODEL = 'qwen2.5:3b';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generateStructuredJson(fetchFn, prompt, schemaDescription) {
	const openRouterResult = await generateWithOpenRouter(fetchFn, prompt, schemaDescription).catch(() => null);
	if (openRouterResult) {
		return openRouterResult;
	}

	const ollamaResult = await generateWithOllama(fetchFn, prompt, schemaDescription).catch(() => null);
	if (ollamaResult) {
		return ollamaResult;
	}

	return null;
}

export async function generateText(fetchFn, systemPrompt, userPrompt) {
	const openRouterText = await generateTextWithOpenRouter(fetchFn, systemPrompt, userPrompt).catch(() => null);
	if (openRouterText) {
		return openRouterText;
	}

	const ollamaText = await generateTextWithOllama(fetchFn, systemPrompt, userPrompt).catch(() => null);
	if (ollamaText) {
		return ollamaText;
	}

	throw new Error('No LLM provider is configured. Add OpenRouter or Ollama environment variables.');
}

async function generateWithOpenRouter(fetchFn, prompt, schemaDescription) {
	if (!env.OPENROUTER_API_KEY) {
		return null;
	}

	const response = await fetchFn(OPENROUTER_BASE_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': env.OPENROUTER_SITE_URL || 'http://localhost:5173',
			'X-Title': env.OPENROUTER_APP_NAME || 'Drink Discovery Final Project'
		},
		body: JSON.stringify({
			model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content: `Return only valid JSON. Follow this schema shape: ${schemaDescription}`
				},
				{
					role: 'user',
					content: prompt
				}
			]
		})
	});

	if (!response.ok) {
		throw new Error(await response.text());
	}

	const data = await response.json();
	const content = data?.choices?.[0]?.message?.content;
	return extractJson(content);
}

async function generateWithOllama(fetchFn, prompt, schemaDescription) {
	if (!env.ollama_base_url && !env.ollama_model) {
		return null;
	}

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

async function generateTextWithOpenRouter(fetchFn, systemPrompt, userPrompt) {
	if (!env.OPENROUTER_API_KEY) {
		return null;
	}

	const response = await fetchFn(OPENROUTER_BASE_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': env.OPENROUTER_SITE_URL || 'http://localhost:5173',
			'X-Title': env.OPENROUTER_APP_NAME || 'Drink Discovery Final Project'
		},
		body: JSON.stringify({
			model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: userPrompt
				}
			]
		})
	});

	if (!response.ok) {
		throw new Error(await response.text());
	}

	const data = await response.json();
	return normalizeContentText(data?.choices?.[0]?.message?.content);
}

async function generateTextWithOllama(fetchFn, systemPrompt, userPrompt) {
	if (!env.ollama_base_url && !env.ollama_model) {
		return null;
	}

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
	} catch {
		return null;
	}
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
