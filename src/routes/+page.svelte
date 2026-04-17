<script>
	// @ts-nocheck
	const promptChips = [
		'citrusy and refreshing',
		'iced matcha',
		'light floral tea',
		'after workout',
		'summer afternoon'
	];

	let userPrompt = $state(
		'I want something refreshing, citrusy, and suitable for a summer afternoon.'
	);
	let recipes = $state([]);
	let selectedRecipe = $state(null);
	let loading = $state(false);
	let statusMessage = $state('Ready to search. Generate to fetch source posts and AI recipe suggestions.');
	let sourceMode = $state('idle');
	let errorMessage = $state('');
	let aiSummary = $state(
		'After retrieval, AI will summarize recurring social patterns and turn them into cleaner recipe suggestions.'
	);
	let sourceNotes = $state([]);
	let searchPlan = $state(null);
	let expandedNotes = $state({});
	let resolvedQuery = $state('');
	let rawSource = $state('');
	let stepState = $state({
		search: 'idle',
		posts: 'idle',
		recipes: 'idle'
	});

	function applyPrompt(chip) {
		userPrompt = `I want a drink that feels ${chip}.`;
	}

	function resetDownstream(fromStep) {
		if (fromStep === 'search') {
			sourceNotes = [];
			recipes = [];
			selectedRecipe = null;
			aiSummary =
				'After retrieval, AI will summarize recurring social patterns and turn them into cleaner recipe suggestions.';
			resolvedQuery = '';
			rawSource = '';
			expandedNotes = {};
			stepState.posts = 'idle';
			stepState.recipes = 'idle';
		}

		if (fromStep === 'posts') {
			recipes = [];
			selectedRecipe = null;
			stepState.recipes = 'idle';
		}
	}

	async function runSearchPlan() {
		loading = true;
		errorMessage = '';
		stepState.search = 'loading';
		resetDownstream('search');

		try {
			const response = await fetch('/api/search-plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: userPrompt })
			});
			if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
			const data = await response.json();
			searchPlan = data.searchPlan || null;
			statusMessage = data.message;
			if (searchPlan?.searchQueries?.length) {
				stepState.search = 'done';
			} else {
				stepState.search = 'error';
				throw new Error('No search words were generated.');
			}
		} catch (error) {
			stepState.search = 'error';
			errorMessage = error instanceof Error ? error.message : 'Unknown request error';
		} finally {
			loading = false;
		}
	}

	async function runSourcePosts() {
		loading = true;
		errorMessage = '';
		stepState.posts = 'loading';
		resetDownstream('posts');

		try {
			if (!searchPlan) {
				await runSearchPlan();
			}
			if (!searchPlan || stepState.search === 'error') {
				throw new Error('Search plan is not ready yet.');
			}

			const response = await fetch('/api/source-posts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: userPrompt, searchPlan })
			});
			if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
			const data = await response.json();
			searchPlan = data.searchPlan || searchPlan;
			sourceNotes = data.sourceNotes || [];
			resolvedQuery = data.resolvedQuery || '';
			rawSource = data.raw || '';
			statusMessage = data.message;
			sourceMode = 'mcp';
			expandedNotes = {};
			if (sourceNotes.length > 0) {
				stepState.posts = 'done';
			} else {
				stepState.posts = 'error';
				throw new Error('No posts were fetched.');
			}
		} catch (error) {
			stepState.posts = 'error';
			errorMessage = error instanceof Error ? error.message : 'Unknown request error';
		} finally {
			loading = false;
		}
	}

	async function runRecipes() {
		loading = true;
		errorMessage = '';
		stepState.recipes = 'loading';

		try {
			if (!sourceNotes.length) {
				await runSourcePosts();
			}
			if (!sourceNotes.length || stepState.posts === 'error') {
				throw new Error('Source posts are not ready yet.');
			}

			const response = await fetch('/api/recipes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					query: userPrompt,
					resolvedQuery: resolvedQuery || searchPlan?.primaryQuery || userPrompt,
					sourceNotes,
					raw: rawSource,
					aiSummary
				})
			});
			if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
			const data = await response.json();
			sourceNotes = data.sourceNotes || sourceNotes;
			aiSummary = data.aiSummary || aiSummary;
			const nextRecipes = data.aiRecipes?.length ? data.aiRecipes : [];
			recipes = nextRecipes;
			selectedRecipe = nextRecipes[0] || null;
			statusMessage = data.message;
			if (nextRecipes.length > 0) {
				stepState.recipes = 'done';
			} else {
				stepState.recipes = 'error';
				throw new Error('No recipe suggestions were generated.');
			}
		} catch (error) {
			stepState.recipes = 'error';
			errorMessage = error instanceof Error ? error.message : 'Unknown request error';
		} finally {
			loading = false;
		}
	}

	async function runAllSteps() {
		await runSearchPlan();
		if (stepState.search === 'done') {
			await runSourcePosts();
		}
		if (stepState.posts === 'done') {
			await runRecipes();
		}
	}

	function toggleNote(noteId) {
		expandedNotes = {
			...expandedNotes,
			[noteId]: !expandedNotes[noteId]
		};
	}

	function countUsefulNotes(notes) {
		return notes.filter((note) => note.aiUseForRecipe).length;
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
	<section class="hero-grid">
		<div class="hero-copy card">
			<p class="eyebrow">Final Project Prototype</p>
			<h1>Social drink research, translated into usable recipes.</h1>
			<p class="lede">
				Users describe a mood, flavor, or moment. The app turns that intent into better Rednote search
				phrases, reviews a small set of source posts, filters for recipe value, and generates a few
				clear drink directions with AI.
			</p>

			<div class="composer">
				<p class="section-label">Describe Your Drink</p>
				<textarea bind:value={userPrompt} rows="4"></textarea>

				<div class="chip-row">
					{#each promptChips as chip}
						<button type="button" class="chip" onclick={() => applyPrompt(chip)}>{chip}</button>
					{/each}
				</div>

				<div class="action-row">
					<button type="button" class="generate-button" onclick={runAllSteps} disabled={loading}>
						{loading ? 'Working...' : 'Run all steps'}
					</button>
					<span class:live={sourceMode === 'mcp'} class="source-badge">
						{sourceMode === 'mcp'
							? 'Live MCP mode'
							: sourceMode === 'partial'
								? 'Partial result'
								: sourceMode === 'error'
									? 'AI unavailable'
									: 'Ready'}
					</span>
				</div>

				<div class="step-row">
					<button type="button" class="step-button" onclick={runSearchPlan} disabled={loading}>
						1. Search words
					</button>
					<button type="button" class="step-button" onclick={runSourcePosts} disabled={loading}>
						2. Fetch posts
					</button>
					<button type="button" class="step-button" onclick={runRecipes} disabled={loading}>
						3. Generate recipes
					</button>
				</div>

				<div class="step-status-grid">
					<p class:done={stepState.search === 'done'} class:error={stepState.search === 'error'}>
						Search: {stepState.search}
					</p>
					<p class:done={stepState.posts === 'done'} class:error={stepState.posts === 'error'}>
						Posts: {stepState.posts}
					</p>
					<p class:done={stepState.recipes === 'done'} class:error={stepState.recipes === 'error'}>
						Recipes: {stepState.recipes}
					</p>
				</div>

				<p class="status-copy">{statusMessage}</p>
				{#if errorMessage}
					<p class="error-copy">{errorMessage}</p>
				{/if}
			</div>
		</div>

		<div class="hero-side">
			<div class="flow-card card">
				<p class="section-label">Workflow</p>
				<div class="flow-step">
					<span>01</span>
					<p>User prompt becomes AI-selected Chinese search phrases.</p>
				</div>
				<div class="flow-step">
					<span>02</span>
					<p>`mcpo` retrieves 2-3 relevant Rednote posts.</p>
				</div>
				<div class="flow-step">
					<span>03</span>
					<p>AI judges which posts are actually recipe-useful.</p>
				</div>
				<div class="flow-step">
					<span>04</span>
					<p>AI synthesizes and refines 3 recipe suggestions.</p>
				</div>
			</div>

			<div class="metrics-card card">
				<p class="section-label">Current Run</p>
				<div class="metrics-grid">
					<div>
						<p class="metric-value">{searchPlan?.searchQueries?.length ?? 0}</p>
						<p class="metric-label">Search Terms</p>
					</div>
					<div>
						<p class="metric-value">{sourceNotes.length}</p>
						<p class="metric-label">Posts Read</p>
					</div>
					<div>
						<p class="metric-value">{countUsefulNotes(sourceNotes)}</p>
						<p class="metric-label">Useful Posts</p>
					</div>
					<div>
						<p class="metric-value">{recipes.length}</p>
						<p class="metric-label">AI Recipes</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="insight-grid">
		<div class="summary-card card">
			<div class="section-heading">
				<p class="eyebrow">AI Summary</p>
				<h2>What the model thinks is worth cooking with</h2>
			</div>
			<p class="summary-copy">{aiSummary}</p>
		</div>

		<div class="plan-card card">
			<div class="section-heading">
				<p class="eyebrow">Search Plan</p>
				<h2>AI-selected search directions</h2>
			</div>
			{#if searchPlan}
				<div class="plan-stack">
					<div>
						<p class="plan-label">Chinese search phrases</p>
						<div class="pill-row compact">
							{#each searchPlan.searchQueries || [] as keyword}
								<span>{keyword}</span>
							{/each}
						</div>
					</div>
					{#if searchPlan.chineseKeywords?.length}
						<div>
							<p class="plan-label">Intent cues</p>
							<div class="pill-row compact">
								{#each searchPlan.chineseKeywords || [] as keyword}
									<span>{keyword}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<p class="empty-copy">Search planning will appear after you run a query.</p>
			{/if}
		</div>
	</section>

	<section class="research-section">
		<div class="section-heading">
			<p class="eyebrow">Source Research</p>
			<h2>Posts from Xiaohongshu / Rednote, paired with AI judgment</h2>
		</div>

		<div class="source-list">
			{#if sourceNotes.length > 0}
				{#each sourceNotes.slice(0, 3) as note}
					<article class="source-card card">
						<div class="source-header">
							<div>
								<p class="source-title">{note.name}</p>
								<p class="source-tagline">{note.tagline}</p>
							</div>
							<span class:useful={note.aiUseForRecipe} class="judgement-pill">
								{note.aiUseForRecipe ? 'Useful for recipe' : 'Low recipe value'}
							</span>
						</div>

						<div class="source-dual">
							<div class="source-column">
								<p class="sub-label">Post Excerpt</p>
								<p class:expanded={expandedNotes[note.id]} class="source-excerpt">
									{note.steps?.[0] || note.matchReason}
								</p>
								<button type="button" class="expand-button" onclick={() => toggleNote(note.id)}>
									{expandedNotes[note.id] ? 'Collapse' : 'Expand'}
								</button>
							</div>

							<div class="ai-note-panel">
								<p class="sub-label">AI Read</p>
								<p class="ai-note-copy"><strong>Cue:</strong> {note.aiRecipeCue || 'No strong recipe cue extracted.'}</p>
								<p class="ai-note-copy"><strong>Why:</strong> {note.aiReason || 'No explanation returned yet.'}</p>
							</div>
						</div>

						<div class="source-meta">
							<div>
								<p class="sub-label">Taste Signals</p>
								<p>{note.taste}</p>
							</div>
							<div>
								<p class="sub-label">Context</p>
								<p>{note.vibe}</p>
							</div>
						</div>

						{#if note.sourceUrl}
							<p class="source-link">
								<a href={note.sourceUrl} target="_blank" rel="noreferrer">View original post</a>
							</p>
						{/if}
					</article>
				{/each}
			{:else}
				<div class="source-card card">
					<p class="empty-copy">No source posts have been parsed yet.</p>
				</div>
			{/if}
		</div>
	</section>

	<section class="recipe-grid">
		<div class="recipe-column">
			<div class="section-heading">
				<p class="eyebrow">AI Recipes</p>
				<h2>Refined directions generated from useful posts</h2>
			</div>

			<div class="recipe-list">
				{#if recipes.length > 0}
					{#each recipes as recipe}
						<button
							type="button"
							class:selected={selectedRecipe?.id === recipe.id}
							class="recipe-card card"
							onclick={() => (selectedRecipe = recipe)}
						>
							<div class="recipe-top">
								<p>{recipe.name}</p>
								<span>{recipe.function}</span>
							</div>
							<p class="tagline">{recipe.tagline}</p>
							<div class="recipe-meta">
								<div>
									<p class="sub-label">Vibe</p>
									<p>{recipe.vibe}</p>
								</div>
								<div>
									<p class="sub-label">Taste</p>
									<p>{recipe.taste}</p>
								</div>
							</div>
						</button>
					{/each}
				{:else}
					<div class="recipe-card card">
						<p class="empty-copy">No AI recipe suggestions yet. Generate a search to populate this area.</p>
					</div>
				{/if}
			</div>
		</div>

		<div class="detail-panel card">
			<div class="section-heading">
				<p class="eyebrow">Selected Recipe</p>
				<h2>{selectedRecipe ? selectedRecipe.name : 'Waiting for AI recipe suggestions'}</h2>
			</div>

			<p class="detail-copy">
				{selectedRecipe
					? selectedRecipe.matchReason
					: 'Once AI recipes are generated, the selected recipe details will appear here.'}
			</p>

			<div class="detail-block">
				<h3>Ingredients</h3>
				<div class="pill-row">
					{#if selectedRecipe?.ingredients?.length}
						{#each selectedRecipe.ingredients as ingredient}
							<span>{ingredient}</span>
						{/each}
					{:else}
						<p class="empty-copy">No ingredients available yet.</p>
					{/if}
				</div>
			</div>

			<div class="detail-block">
				<h3>Preparation</h3>
				{#if selectedRecipe?.steps?.length}
					<ol>
						{#each selectedRecipe.steps as step}
							<li>{step}</li>
						{/each}
					</ol>
				{:else}
					<p class="empty-copy">No preparation steps available yet.</p>
				{/if}
			</div>

			<div class="detail-block">
				<h3>Why This One</h3>
				{#if selectedRecipe?.signals?.length}
					<ul>
						{#each selectedRecipe.signals as signal}
							<li>{signal}</li>
						{/each}
					</ul>
				{:else}
					<p class="empty-copy">No supporting signals available yet.</p>
				{/if}
			</div>
		</div>
	</section>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Avenir Next', 'Segoe UI', sans-serif;
		background:
			radial-gradient(circle at top left, rgba(242, 186, 120, 0.38), transparent 24%),
			radial-gradient(circle at top right, rgba(122, 176, 159, 0.28), transparent 26%),
			linear-gradient(180deg, #fffaf2 0%, #f4ede0 100%);
		color: #1f1c17;
	}

	.page-shell {
		max-width: 1280px;
		margin: 0 auto;
		padding: 48px 24px 80px;
	}

	.card {
		border: 1px solid rgba(72, 54, 29, 0.12);
		border-radius: 28px;
		background: rgba(255, 252, 246, 0.84);
		backdrop-filter: blur(12px);
		box-shadow: 0 22px 54px rgba(83, 59, 25, 0.08);
	}

	.eyebrow,
	.section-label,
	.sub-label,
	.metric-label {
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

	.hero-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
		gap: 24px;
		align-items: stretch;
	}

	.hero-copy {
		padding: 34px;
	}

	h1 {
		font-size: clamp(3rem, 6vw, 5.4rem);
		line-height: 0.95;
		letter-spacing: -0.05em;
		max-width: 9ch;
	}

	.lede {
		margin-top: 20px;
		max-width: 62ch;
		line-height: 1.7;
		color: #53483d;
	}

	.hero-side {
		display: grid;
		gap: 20px;
	}

	.flow-card,
	.metrics-card,
	.summary-card,
	.plan-card,
	.source-card,
	.recipe-card,
	.detail-panel {
		padding: 26px;
	}

	.composer {
		margin-top: 30px;
		padding: 22px;
		border-radius: 22px;
		background: rgba(255, 246, 231, 0.95);
		border: 1px solid rgba(72, 54, 29, 0.08);
	}

	textarea {
		width: 100%;
		min-height: 116px;
		border: none;
		resize: vertical;
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
	.generate-button:focus,
	.expand-button:focus {
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

	.step-row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.pill-row span,
	.chip,
	.generate-button,
	.source-badge,
	.judgement-pill {
		border-radius: 999px;
		padding: 10px 14px;
		font: inherit;
		font-size: 0.92rem;
	}

	.step-button {
		border-radius: 16px;
		padding: 12px 14px;
		font: inherit;
		font-size: 0.92rem;
		border: 1px solid rgba(72, 54, 29, 0.12);
		background: #fffaf1;
		color: #493b2c;
		cursor: pointer;
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

	.step-button:disabled {
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

	.step-status-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.step-status-grid p {
		padding: 10px 12px;
		border-radius: 14px;
		background: rgba(255, 248, 236, 0.95);
		color: #6f5532;
		font-size: 0.9rem;
	}

	.step-status-grid p.done {
		background: #dcefe8;
		color: #21664d;
	}

	.step-status-grid p.error {
		background: #f8dfdb;
		color: #9b3d31;
	}

	.status-copy {
		color: #5b5044;
	}

	.error-copy {
		color: #a63d2e;
	}

	.flow-step {
		display: grid;
		grid-template-columns: 46px 1fr;
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
		font-size: 1.4rem;
		color: #bc7a28;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		margin-top: 10px;
	}

	.metric-value {
		font-size: 2rem;
		font-weight: 700;
		color: #2d2419;
	}

	.insight-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
		gap: 20px;
		margin-top: 24px;
	}

	.section-heading h2 {
		font-size: 1.65rem;
		line-height: 1.1;
	}

	.summary-copy {
		margin-top: 12px;
		line-height: 1.78;
		color: #4f473f;
	}

	.plan-stack {
		margin-top: 12px;
		display: grid;
		gap: 18px;
	}

	.plan-label {
		font-size: 0.82rem;
		font-weight: 700;
		color: #6f5532;
		margin-bottom: 10px;
	}

	.pill-row.compact {
		margin-top: 0;
	}

	.research-section,
	.recipe-grid {
		margin-top: 28px;
	}

	.source-list {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 18px;
		margin-top: 16px;
	}

	.source-header,
	.recipe-top,
	.recipe-meta,
	.source-meta {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	.source-title,
	.recipe-top p {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.source-tagline,
	.tagline {
		margin-top: 10px;
		line-height: 1.6;
		color: #5e5449;
	}

	.judgement-pill {
		align-self: start;
		background: #fff3de;
		color: #9a621d;
		white-space: nowrap;
	}

	.judgement-pill.useful {
		background: #dcefe8;
		color: #21664d;
	}

	.source-dual {
		display: grid;
		grid-template-columns: 1.1fr 0.95fr;
		gap: 16px;
		margin-top: 14px;
	}

	.source-column,
	.ai-note-panel {
		min-width: 0;
	}

	.source-excerpt {
		line-height: 1.68;
		color: #4f473f;
		line-clamp: 2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.source-excerpt.expanded {
		display: block;
	}

	.expand-button {
		margin-top: 10px;
		padding: 0;
		border: none;
		background: transparent;
		color: #9a621d;
		font: inherit;
		font-size: 0.92rem;
		cursor: pointer;
	}

	.ai-note-panel {
		padding: 16px;
		border-radius: 18px;
		background: rgba(255, 244, 226, 0.95);
		border: 1px solid rgba(72, 54, 29, 0.08);
	}

	.ai-note-copy {
		margin-top: 6px;
		line-height: 1.58;
		color: #4f473f;
	}

	.source-meta {
		margin-top: 16px;
	}

	.source-link {
		margin-top: 16px;
	}

	.recipe-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
		gap: 20px;
		align-items: start;
	}

	.recipe-list {
		display: grid;
		gap: 16px;
		margin-top: 16px;
	}

	.recipe-card {
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

	.recipe-top span {
		padding: 6px 10px;
		border-radius: 999px;
		background: #fff3de;
		color: #9a621d;
		font-size: 0.84rem;
	}

	.detail-panel {
		position: sticky;
		top: 24px;
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

	@media (max-width: 1040px) {
		.hero-grid,
		.insight-grid,
		.recipe-grid,
		.source-list,
		.step-row,
		.step-status-grid {
			grid-template-columns: 1fr;
		}

		.detail-panel {
			position: static;
		}
	}

	@media (max-width: 760px) {
		.page-shell {
			padding: 24px 16px 48px;
		}

		.hero-copy,
		.flow-card,
		.metrics-card,
		.summary-card,
		.plan-card,
		.source-card,
		.recipe-card,
		.detail-panel {
			padding: 20px;
			border-radius: 22px;
		}

		h1 {
			font-size: 2.8rem;
			max-width: none;
		}

		.source-dual,
		.source-header,
		.recipe-top,
		.recipe-meta,
		.source-meta {
			grid-template-columns: 1fr;
			flex-direction: column;
		}

		.metrics-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
