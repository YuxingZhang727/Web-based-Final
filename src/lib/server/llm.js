// @ts-nocheck
import { env } from '$env/dynamic/private';

const FALLBACK_OPENAI_BASE_URL = 'https://api.deepseek.com';
const FALLBACK_OPENAI_MODEL = 'deepseek-chat';

export async function generateStructuredJson(fetchFn, prompt, schemaDescription) {
	const openaiResult = await generateStructuredJsonWithOpenAI(fetchFn, prompt, schemaDescription).catch(
		(error) => {
			console.error('Structured LLM request failed:', error);
			return null;
		}
	);
	if (openaiResult) {
		return openaiResult;
	}

	return null;
}

export async function generateText(fetchFn, systemPrompt, userPrompt) {
	const openaiText = await generateTextWithOpenAI(fetchFn, systemPrompt, userPrompt).catch((error) => {
		console.error('Text LLM request failed:', error);
		return null;
	});
	if (openaiText) {
		return openaiText;
	}

	throw new Error(
		'No API LLM provider responded. Configure DEEPSEEK_API_KEY or OPENAI_API_KEY.'
	);
}

async function generateStructuredJsonWithOpenAI(fetchFn, prompt, schemaDescription) {
	const apiKey = env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY;
	if (!apiKey) {
		return null;
	}

	const baseUrl = env.DEEPSEEK_BASE_URL || env.OPENAI_BASE_URL || FALLBACK_OPENAI_BASE_URL;
	const model = env.DEEPSEEK_MODEL || env.OPENAI_MODEL || FALLBACK_OPENAI_MODEL;
	const response = await fetchFn(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: 'system',
					content: `You must respond with ONLY valid JSON. No markdown, no code fences, no explanation text — just the raw JSON object. Follow this exact schema shape:\n${schemaDescription}`
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
	return extractJson(data?.choices?.[0]?.message?.content);
}

async function generateTextWithOpenAI(fetchFn, systemPrompt, userPrompt) {
	const apiKey = env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY;
	if (!apiKey) {
		return null;
	}

	const baseUrl = env.DEEPSEEK_BASE_URL || env.OPENAI_BASE_URL || FALLBACK_OPENAI_BASE_URL;
	const model = env.DEEPSEEK_MODEL || env.OPENAI_MODEL || FALLBACK_OPENAI_MODEL;
	const response = await fetchFn(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
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
	const content = data?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content.trim() : normalizeContentText(content);
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
