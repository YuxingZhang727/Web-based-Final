<script>
	// @ts-nocheck
	const promptChips = [
		'citrus refreshing',
		'energizing tea-based',
		'summer afternoon',
		'light floral',
		'after workout'
	];

	const starterRecipes = [
		{
			id: 'starter-1',
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
			,
			sourceTitle: '',
			sourceUrl: ''
		},
		{
			id: 'starter-2',
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
			,
			sourceTitle: '',
			sourceUrl: ''
		},
		{
			id: 'starter-3',
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
			,
			sourceTitle: '',
			sourceUrl: ''
		}
	];

	let userPrompt = $state(
		'I want something refreshing, citrusy, and suitable for a summer afternoon.'
	);
	let recipes = $state(starterRecipes);
	let selectedRecipe = $state(starterRecipes[0]);
	let loading = $state(false);
	let statusMessage = $state('Ready to search. Right now the page will use demo data until MCP is configured.');
	let sourceMode = $state('mock');
	let errorMessage = $state('');

	function applyPrompt(chip) {
		userPrompt = `I want a drink that feels ${chip}.`;
	}

	async function discoverRecipes() {
		loading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/discover', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					query: userPrompt
				})
			});

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}

			const data = await response.json();

			recipes = data.recipes;
			selectedRecipe = data.recipes[0];
			statusMessage = data.message;
			sourceMode = data.mode;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unknown request error';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Drink Discovery Interface</title>
	<meta
		name="description"
		content="An interactive final project prototype for discovering personalized drink ideas through AI-structured social media recipes."
	/>
</svelte:head>

<div class="page-shell">
	<section class="hero">
		<div class="hero-copy">
			<p class="eyebrow">Final Project Prototype</p>
			<h1>Turn social drink trends into a personalized recipe experience.</h1>
			<p class="lede">
				Users describe a flavor, function, or moment. The system gathers messy social media signals,
				extracts recipe logic with AI, and turns them into clear drink cards that are easier to compare.
			</p>

			<div class="prompt-panel">
				<div class="panel-label">Describe your drink</div>
				<textarea bind:value={userPrompt} rows="4"></textarea>
				<div class="chip-row">
					{#each promptChips as chip}
						<button type="button" class="chip" onclick={() => applyPrompt(chip)}>{chip}</button>
					{/each}
				</div>

				<div class="action-row">
					<button type="button" class="generate-button" onclick={discoverRecipes} disabled={loading}>
						{loading ? 'Generating...' : 'Generate drink ideas'}
					</button>
					<span class:live={sourceMode === 'mcp'} class="source-badge">
						{sourceMode === 'mcp' ? 'Live MCP mode' : 'Demo mode'}
					</span>
				</div>

				<p class="status-copy">{statusMessage}</p>
				{#if errorMessage}
					<p class="error-copy">{errorMessage}</p>
				{/if}
			</div>
		</div>

		<div class="hero-card">
			<div class="mini-label">System Flow</div>
			<div class="flow-step">
				<span>01</span>
				<p>User intent: flavor, function, context</p>
			</div>
			<div class="flow-step">
				<span>02</span>
				<p>SvelteKit route sends the prompt to an MCP client</p>
			</div>
			<div class="flow-step">
				<span>03</span>
				<p>MCP tool returns social recipe data from Rednote / Xiaohongshu</p>
			</div>
			<div class="flow-step">
				<span>04</span>
				<p>The app normalizes the result into interactive recipe cards</p>
			</div>
		</div>
	</section>

	<section class="overview-grid">
		<div class="overview-card">
			<p class="overview-title">User Input</p>
			<p>{userPrompt}</p>
		</div>
		<div class="overview-card">
			<p class="overview-title">Connection</p>
			<p>
				The page calls <code>/api/discover</code>, which can now connect to a real MCP server through
				environment variables.
			</p>
		</div>
		<div class="overview-card">
			<p class="overview-title">AI Output</p>
			<p>Structured recipes with taste notes, preparation steps, and explanation of relevance.</p>
		</div>
	</section>

	<section class="content-grid">
		<div class="recipe-column">
			<div class="section-heading">
				<p class="eyebrow">Recipe Cards</p>
				<h2>Compare AI-refined drink directions</h2>
			</div>

			<div class="recipe-list">
				{#each recipes as recipe}
					<button
						type="button"
						class:selected={selectedRecipe.id === recipe.id}
						class="recipe-card"
						onclick={() => (selectedRecipe = recipe)}
					>
						<div class="recipe-top">
							<p>{recipe.name}</p>
							<span>{recipe.function}</span>
						</div>
						<p class="tagline">{recipe.tagline}</p>
						<div class="meta-row">
							<div>
								<p class="meta-label">Vibe</p>
								<p>{recipe.vibe}</p>
							</div>
							<div>
								<p class="meta-label">Taste</p>
								<p>{recipe.taste}</p>
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<div class="detail-panel">
			<div class="section-heading">
				<p class="eyebrow">Selected Recipe</p>
				<h2>{selectedRecipe.name}</h2>
			</div>

			<p class="detail-copy">{selectedRecipe.matchReason}</p>

			<div class="detail-block">
				<h3>Ingredients</h3>
				<div class="pill-row">
					{#if selectedRecipe.ingredients.length > 0}
						{#each selectedRecipe.ingredients as ingredient}
							<span>{ingredient}</span>
						{/each}
					{:else}
						<p class="empty-copy">No ingredients were parsed from this source yet.</p>
					{/if}
				</div>
			</div>

			<div class="detail-block">
				<h3>Preparation</h3>
				{#if selectedRecipe.steps.length > 0}
					<ol>
						{#each selectedRecipe.steps as step}
							<li>{step}</li>
						{/each}
					</ol>
				{:else}
					<p class="empty-copy">No preparation steps were parsed from this source yet.</p>
				{/if}
			</div>

			<div class="detail-block">
				<h3>Why AI surfaced this</h3>
				{#if selectedRecipe.signals.length > 0}
					<ul>
						{#each selectedRecipe.signals as signal}
							<li>{signal}</li>
						{/each}
					</ul>
				{:else}
					<p class="empty-copy">No source signals were extracted yet.</p>
				{/if}
			</div>

			{#if selectedRecipe.sourceUrl}
				<div class="detail-block">
					<h3>Source Link</h3>
					<p>
						<a href={selectedRecipe.sourceUrl} target="_blank" rel="noreferrer">
							{selectedRecipe.sourceTitle ?? selectedRecipe.sourceUrl}
						</a>
					</p>
				</div>
			{/if}
		</div>
	</section>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: "Avenir Next", "Segoe UI", sans-serif;
		background:
			radial-gradient(circle at top left, rgba(255, 214, 153, 0.45), transparent 28%),
			radial-gradient(circle at top right, rgba(126, 194, 177, 0.3), transparent 24%),
			linear-gradient(180deg, #fffaf2 0%, #f5efe4 100%);
		color: #1f1c17;
	}

	.page-shell {
		max-width: 1200px;
		margin: 0 auto;
		padding: 56px 24px 72px;
	}

	.hero {
		display: grid;
		grid-template-columns: 1.4fr 0.9fr;
		gap: 24px;
		align-items: stretch;
	}

	.hero-copy,
	.hero-card,
	.overview-card,
	.recipe-card,
	.detail-panel {
		border: 1px solid rgba(72, 54, 29, 0.12);
		border-radius: 28px;
		background: rgba(255, 252, 246, 0.82);
		backdrop-filter: blur(12px);
		box-shadow: 0 20px 50px rgba(83, 59, 25, 0.08);
	}

	.hero-copy {
		padding: 32px;
	}

	.eyebrow,
	.panel-label,
	.mini-label,
	.overview-title,
	.meta-label {
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-size: 0.72rem;
		color: #8b6a42;
		margin: 0 0 10px;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		font-size: clamp(2.8rem, 6vw, 5rem);
		line-height: 0.95;
		letter-spacing: -0.05em;
		max-width: 10ch;
	}

	.lede {
		margin-top: 18px;
		max-width: 60ch;
		line-height: 1.65;
		color: #53483d;
	}

	.prompt-panel {
		margin-top: 28px;
		padding: 20px;
		border-radius: 22px;
		background: rgba(255, 246, 231, 0.95);
		border: 1px solid rgba(72, 54, 29, 0.08);
	}

	textarea {
		width: 100%;
		border: none;
		resize: vertical;
		min-height: 110px;
		padding: 16px;
		font: inherit;
		border-radius: 18px;
		background: #fffdf8;
		color: #2b241d;
		box-sizing: border-box;
	}

	textarea:focus,
	.chip:focus,
	.recipe-card:focus,
	.generate-button:focus {
		outline: 2px solid #d18e3a;
		outline-offset: 2px;
	}

	.chip-row,
	.pill-row,
	.action-row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 14px;
	}

	.chip,
	.pill-row span,
	.generate-button,
	.source-badge {
		border-radius: 999px;
		padding: 10px 14px;
		font: inherit;
		font-size: 0.92rem;
	}

	.chip {
		border: 1px solid rgba(72, 54, 29, 0.12);
		background: white;
		cursor: pointer;
	}

	.generate-button {
		border: none;
		background: #c96d1b;
		color: white;
		cursor: pointer;
	}

	.generate-button:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.source-badge {
		background: #f2e5d2;
		color: #755026;
	}

	.source-badge.live {
		background: #dcefe8;
		color: #21664d;
	}

	.status-copy,
	.error-copy {
		margin-top: 14px;
		line-height: 1.6;
	}

	.status-copy {
		color: #5b5044;
	}

	.error-copy {
		color: #a63d2e;
	}

	.hero-card {
		padding: 28px;
		display: grid;
		gap: 14px;
		background: linear-gradient(180deg, rgba(255, 243, 224, 0.95), rgba(246, 255, 250, 0.9));
	}

	.flow-step {
		display: grid;
		grid-template-columns: 56px 1fr;
		gap: 14px;
		align-items: center;
		padding: 14px 0;
		border-top: 1px solid rgba(72, 54, 29, 0.08);
	}

	.flow-step:first-of-type {
		border-top: none;
		padding-top: 0;
	}

	.flow-step span {
		font-size: 1.7rem;
		color: #bc7a28;
	}

	.overview-grid,
	.content-grid {
		display: grid;
		gap: 20px;
	}

	.overview-grid {
		grid-template-columns: repeat(3, 1fr);
		margin-top: 20px;
	}

	.overview-card {
		padding: 22px;
		line-height: 1.6;
	}

	.content-grid {
		grid-template-columns: 1.05fr 0.95fr;
		margin-top: 28px;
		align-items: start;
	}

	.recipe-list {
		display: grid;
		gap: 16px;
		margin-top: 16px;
	}

	.recipe-card {
		padding: 22px;
		text-align: left;
		cursor: pointer;
		transition:
			transform 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.recipe-card:hover,
	.recipe-card.selected {
		transform: translateY(-2px);
		border-color: rgba(209, 142, 58, 0.8);
		box-shadow: 0 24px 44px rgba(123, 82, 31, 0.14);
	}

	.recipe-top,
	.meta-row {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	.recipe-top p {
		font-size: 1.3rem;
		font-weight: 700;
	}

	.recipe-top span {
		padding: 6px 10px;
		border-radius: 999px;
		background: #fff3de;
		color: #9a621d;
		font-size: 0.84rem;
	}

	.tagline {
		margin: 12px 0 18px;
		color: #5e5449;
		line-height: 1.6;
	}

	.meta-row p {
		font-weight: 600;
	}

	.detail-panel {
		padding: 28px;
	}

	.detail-copy {
		margin-top: 14px;
		line-height: 1.7;
		color: #4e463d;
	}

	.detail-block {
		margin-top: 22px;
		padding-top: 22px;
		border-top: 1px solid rgba(72, 54, 29, 0.09);
	}

	.detail-block h3 {
		margin-bottom: 12px;
		font-size: 1rem;
	}

	.pill-row span {
		background: #fff4e2;
		color: #70470d;
	}

	ol,
	ul {
		margin: 0;
		padding-left: 20px;
		line-height: 1.8;
		color: #3d362f;
	}

	.empty-copy,
	a {
		color: #5b5044;
	}

	a {
		word-break: break-word;
	}

	@media (max-width: 920px) {
		.hero,
		.content-grid,
		.overview-grid {
			grid-template-columns: 1fr;
		}

		h1 {
			max-width: none;
		}
	}

	@media (max-width: 640px) {
		.page-shell {
			padding: 24px 16px 48px;
		}

		.hero-copy,
		.hero-card,
		.overview-card,
		.recipe-card,
		.detail-panel {
			border-radius: 22px;
		}

		.hero-copy,
		.hero-card,
		.detail-panel,
		.recipe-card {
			padding: 20px;
		}

		h1 {
			font-size: 2.6rem;
		}

		.recipe-top,
		.meta-row {
			flex-direction: column;
		}
	}
</style>
