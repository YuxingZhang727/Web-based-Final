<script>
	// @ts-nocheck
	import { fade, fly, scale } from 'svelte/transition';

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
	let statusMessage = $state('Start with a mood, flavor, or moment, then gather a few directions to explore.');
	let sourceMode = $state('idle');
	let errorMessage = $state('');
	let aiSummary = $state(
		'A short editor’s note will appear here once a few useful posts have been gathered.'
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
	let currentStage = $state('input');
	let currentPostIndex = $state(0);

	function applyPrompt(chip) {
		userPrompt = `I want a drink that feels ${chip}.`;
	}

	function resetDownstream(fromStep) {
		if (fromStep === 'search') {
			sourceNotes = [];
			recipes = [];
			selectedRecipe = null;
			aiSummary = 'A short editor’s note will appear here once a few useful posts have been gathered.';
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
		sourceNotes = [];
		resetDownstream('posts');
		// Jump to posts stage immediately so user sees the skeleton
		currentStage = 'posts';
		currentPostIndex = 0;

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
			sourceMode = 'reddit';
			expandedNotes = {};
			if (sourceNotes.length > 0) {
				stepState.posts = 'done';
				currentPostIndex = 0;
			} else {
				stepState.posts = 'error';
				const detail = data.retrievalError || data.message || '';
				throw new Error(detail ? `No posts found. ${detail}` : 'No posts found. Reddit may be rate-limiting or the subreddit name is wrong.');
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
				currentStage = 'recipe';
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

	function toggleNote(noteId) {
		expandedNotes = {
			...expandedNotes,
			[noteId]: !expandedNotes[noteId]
		};
	}

	function countUsefulNotes(notes) {
		return notes.filter((note) => note.aiUseForRecipe).length;
	}

	function showSourceInsights() {
		return stepState.recipes === 'done' || sourceNotes.some((note) => note.aiRecipeCue || note.aiReason || note.aiUseForRecipe);
	}

	function hasSearchPlan() {
		return Boolean(searchPlan?.searchQueries?.length);
	}

	function hasPosts() {
		return sourceNotes.length > 0;
	}

	function hasRecipes() {
		return recipes.length > 0 || stepState.recipes === 'done';
	}

	function goToStage(stage) {
		currentStage = stage;
	}

	function nextPost() {
		if (!sourceNotes.length) return;
		currentPostIndex = Math.min(currentPostIndex + 1, sourceNotes.length - 1);
	}

	function previousPost() {
		if (!sourceNotes.length) return;
		currentPostIndex = Math.max(currentPostIndex - 1, 0);
	}

	function activePost() {
		return sourceNotes[currentPostIndex] || null;
	}

	function previousPostCard() {
		return currentPostIndex > 0 ? sourceNotes[currentPostIndex - 1] : null;
	}

	function nextPostCard() {
		return currentPostIndex < sourceNotes.length - 1 ? sourceNotes[currentPostIndex + 1] : null;
	}

	function stageTitle() {
		if (currentStage === 'posts') return 'Source browsing';
		if (currentStage === 'recipe') return 'Recipe page';
		return 'Request';
	}
</script>

<svelte:head>
	<title>Field Notes</title>
	<meta
		name="description"
		content="A drink discovery interface that turns social inspiration into clear, usable recipe directions."
	/>
</svelte:head>

<div class="page-shell">
	<div class="stage-frame">
		<div class="stage-chrome">
			<div class="brand-block">
				<p class="eyebrow">Field Notes</p>
				<p class="brand-copy">A quieter way to move from a drink idea to a finished recipe.</p>
			</div>
			<div class="stage-progress" aria-label="Project stage">
				<span class:active={currentStage === 'input'} class="stage-pill" onclick={() => goToStage('input')}>Request</span>
				<span class:active={currentStage === 'posts'} class:reachable={hasPosts()} class="stage-pill" onclick={() => hasPosts() && goToStage('posts')}>Posts</span>
				<span class:active={currentStage === 'recipe'} class:reachable={hasRecipes()} class="stage-pill" onclick={() => hasRecipes() && goToStage('recipe')}>Recipe</span>
			</div>
		</div>

		{#key currentStage}
			{#if currentStage === 'input'}
				<section class="stage-view input-stage" in:fade={{ duration: 240 }} out:fade={{ duration: 180 }}>
					<section class="composer-card card landing-card">
						<div class="landing-copy">
							<h1>Find a drink that fits the moment.</h1>
							<p class="lede">
								Describe a flavor, a mood, or a time of day. Start with a short prompt, then move
								into a focused browsing view for source posts and a more refined recipe page later on.
							</p>
						</div>

						<div class="composer">
							<p class="section-label">Describe The Kind Of Drink You Want</p>
							<textarea bind:value={userPrompt} rows="4"></textarea>

							<div class="chip-row chip-grid">
								{#each promptChips as chip}
									<button type="button" class="chip" onclick={() => applyPrompt(chip)}>{chip}</button>
								{/each}
							</div>

							<div class="input-actions">
								<div class="action-stack">
									<button type="button" class="module-button primary-button" onclick={runSourcePosts} disabled={loading}>
										{stepState.posts === 'loading' ? 'Fetching posts…' : 'Fetch posts'}
									</button>
									<p class:done={stepState.posts === 'done'} class:error={stepState.posts === 'error'} class="step-inline-status">
										Posts: {stepState.posts}
									</p>
								</div>

								<div class="action-stack secondary-stack">
									<button type="button" class="module-button subtle-button" onclick={runSearchPlan} disabled={loading}>
										{stepState.search === 'loading' ? 'Working…' : 'Find search terms'}
									</button>
									<p class:done={stepState.search === 'done'} class:error={stepState.search === 'error'} class="step-inline-status">
										Search: {stepState.search}
									</p>
								</div>
							</div>

							{#if hasSearchPlan()}
								<div class="plan-card inline-plan" in:fade={{ duration: 220 }}>
									<div class="section-heading">
										<p class="eyebrow">Search Terms</p>
										<h2>The phrases used to look for drinks</h2>
									</div>
									<div class="plan-stack">
										<div>
											<p class="plan-label">Search phrases</p>
											<div class="pill-row compact">
												{#each searchPlan.searchQueries || [] as keyword}
													<span>{keyword}</span>
												{/each}
											</div>
										</div>
										{#if searchPlan.subredditCandidates?.length}
											<div>
												<p class="plan-label">Communities</p>
												<div class="pill-row compact">
													{#each searchPlan.subredditCandidates || [] as subreddit}
														<span>r/{subreddit}</span>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<div class="status-ribbon">
								<span class:live={sourceMode === 'mcp'} class="source-badge">
									{sourceMode === 'mcp'
										? 'Live Reddit source'
										: sourceMode === 'partial'
											? 'Partial result'
											: sourceMode === 'error'
												? 'Unavailable'
												: 'Ready'}
								</span>
								<p class="status-copy">{statusMessage}</p>
							</div>
							{#if errorMessage}
								<div class="error-block">
									<p class="error-copy">{errorMessage}</p>
									{#if stepState.posts === 'error'}
										<button type="button" class="retry-button" onclick={runSourcePosts} disabled={loading}>
											Try again
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</section>
				</section>
			{:else if currentStage === 'posts'}
				<section class="stage-view posts-stage" in:fly={{ y: 18, duration: 260 }} out:fade={{ duration: 180 }}>
					<div class="posts-stage-shell">
						<div class="posts-stage-top">
							<div class="section-heading">
								<p class="eyebrow">Source Posts</p>
								<h2>Browse reference posts one at a time</h2>
								<p class="section-support">
									Move through the stack, keep the useful cues, then turn the strongest direction into a cleaner recipe page.
								</p>
							</div>
							<div class="top-actions">
								<button type="button" class="ghost-button" onclick={() => goToStage('input')}>
									Edit request
								</button>
								<div class="module-action compact">
									<button type="button" class="module-button" onclick={runRecipes} disabled={loading}>
										{stepState.recipes === 'loading' ? 'Building recipe…' : 'Build recipe'}
									</button>
									<p class:done={stepState.recipes === 'done'} class:error={stepState.recipes === 'error'} class="step-inline-status">
										Recipes: {stepState.recipes}
									</p>
								</div>
							</div>
						</div>

						<div class="posts-stage-center">
							<div class="card-stack-shell">
								{#if stepState.posts === 'loading'}
									<div class="source-focus-card card skeleton-card">
										<div class="skeleton-badge"></div>
										<div class="skeleton-title"></div>
										<div class="skeleton-line"></div>
										<div class="skeleton-line short"></div>
										<div class="skeleton-body"></div>
										<div class="skeleton-line"></div>
										<div class="skeleton-line short"></div>
									</div>
								{:else if stepState.posts === 'error'}
									<div class="source-focus-card card error-card">
										<p class="error-card-title">Could not load posts</p>
										<p class="error-card-msg">{errorMessage}</p>
										<button type="button" class="retry-button" onclick={runSourcePosts}>Try again</button>
									</div>
								{:else}

								{#if previousPostCard()}
									<div class="stack-card ghost previous-card">
										<span class="stack-caption">Previous</span>
										<p>{previousPostCard().name}</p>
									</div>
								{/if}

								{#if activePost()}
									<article class="source-focus-card card" in:scale={{ duration: 220, start: 0.96 }}>
										<div class="focus-head">
											<div>
												<span class="post-counter-badge">Post {currentPostIndex + 1} / {sourceNotes.length}</span>
												<h3>{activePost().name}</h3>
												<p class="focus-tagline">{activePost().tagline}</p>
											</div>
											<p class="focus-context">{activePost().vibe}</p>
										</div>

										<div class="focus-body">
											<div class="source-column">
												<p class="sub-label">Excerpt</p>
												<div class:expanded={expandedNotes[activePost().id]} class="source-excerpt large">
													{activePost().steps?.[0] || activePost().matchReason}
												</div>
												<button type="button" class="expand-button" onclick={() => toggleNote(activePost().id)}>
													{expandedNotes[activePost().id] ? 'Collapse' : 'Expand'}
												</button>
											</div>

											<div class="focus-meta-grid">
												<div>
													<p class="sub-label">Taste Signals</p>
													<p>{activePost().taste}</p>
												</div>
												<div>
													<p class="sub-label">Community</p>
													<p>{activePost().vibe}</p>
												</div>
											</div>

											{#if activePost().comments?.length}
												<div class="comment-preview">
													<p class="sub-label">Comments</p>
													{#each activePost().comments.slice(0, 3) as comment}
														<p class="comment-line">
															{comment.author ? `${comment.author}: ` : ''}{comment.content}
														</p>
													{/each}
												</div>
											{/if}
										</div>

										<div class="focus-footer">
											<div class="pager">
												<button type="button" class="ghost-button" onclick={previousPost} disabled={currentPostIndex === 0}>
													Previous
												</button>
												<button
													type="button"
													class="ghost-button"
													onclick={nextPost}
													disabled={currentPostIndex >= sourceNotes.length - 1}
												>
													Next
												</button>
											</div>

											{#if activePost().sourceUrl}
												<a class="focus-link" href={activePost().sourceUrl} target="_blank" rel="noreferrer">
													View original post
												</a>
											{/if}
										</div>
									</article>
								{/if}

								{#if nextPostCard()}
									<div class="stack-card ghost next-card">
										<span class="stack-caption">Next</span>
										<p>{nextPostCard().name}</p>
									</div>
								{/if}

								{/if}
							</div>
						</div>
					</div>
				</section>
			{:else}
				<section class="stage-view recipe-stage" in:fly={{ y: 18, duration: 260 }} out:fade={{ duration: 180 }}>
					<div class="recipe-stage-top">
						<div class="section-heading">
							<p class="eyebrow">Recipe Page</p>
							<h2>A more complete drink page shaped from the source posts</h2>
							<p class="section-support">
								The final page keeps the exploratory feel of the source material, but turns it into something easier to read and actually make.
							</p>
						</div>
						<div class="top-actions">
							<button type="button" class="ghost-button" onclick={() => goToStage('posts')}>
								Back to posts
							</button>
						</div>
					</div>

					<section class="summary-section">
						<div class="summary-card card">
							<div class="section-heading">
								<p class="eyebrow">Editor’s Note</p>
								<h2>The direction emerging from the source posts</h2>
							</div>
							<p class="summary-copy">{aiSummary}</p>

							<div class="summary-meta">
								<div>
									<p class="plan-label">Current source</p>
									<p class="summary-meta-copy">{resolvedQuery || 'No source phrase has been used yet.'}</p>
								</div>
								<div>
									<p class="plan-label">Status</p>
									<p class="summary-meta-copy">{statusMessage}</p>
								</div>
							</div>
						</div>
					</section>

					<section class="recipe-grid">
						<div class="recipe-column">
							<div class="section-heading">
								<p class="eyebrow">Recipe Directions</p>
								<h2>Choose a final direction</h2>
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
													<div class="taste-pill-row">
														{#each (recipe.taste || '').split(',').map(t => t.trim()).filter(Boolean) as t}
															<span class="taste-pill">{t}</span>
														{/each}
													</div>
												</div>
											</div>
										</button>
									{/each}
								{/if}
							</div>
						</div>

						<div class="detail-panel card cookbook-page">
							<div class="recipe-page-head">
								<p class="eyebrow">Selected Drink</p>
								<h2>{selectedRecipe ? selectedRecipe.name : 'Choose a recipe card to view the details'}</h2>
								<p class="detail-copy">
									{selectedRecipe
										? selectedRecipe.matchReason
										: 'Once recipe ideas are ready, the full ingredients and preparation notes will appear here.'}
								</p>
							</div>

							<div class="recipe-page-grid">
								<div class="detail-block ingredient-block">
									<h3>Ingredients</h3>
									<div class="pill-row ingredient-pills">
										{#if selectedRecipe?.ingredients?.length}
											{#each selectedRecipe.ingredients as ingredient}
												<span>{ingredient}</span>
											{/each}
										{:else}
											<p class="empty-copy">Ingredients will appear here once a recipe is selected.</p>
										{/if}
									</div>
								</div>

								<div class="detail-block profile-block">
									<h3>Taste & Profile</h3>
									{#if selectedRecipe}
										<ul class="profile-list">
											<li>{selectedRecipe.taste}</li>
											<li>{selectedRecipe.vibe}</li>
											<li>{selectedRecipe.function}</li>
										</ul>
									{:else}
										<p class="empty-copy">Flavor notes will appear here once a recipe is selected.</p>
									{/if}
								</div>
							</div>

							<div class="detail-block">
								<h3>Preparation</h3>
								{#if selectedRecipe?.steps?.length}
									<ol class="recipe-steps">
										{#each selectedRecipe.steps as step}
											<li>{step}</li>
										{/each}
									</ol>
								{:else}
									<p class="empty-copy">Preparation steps will appear here once a recipe is selected.</p>
								{/if}
							</div>

							<div class="detail-block">
								<h3>Inspired By These Posts</h3>
								<div class="inspiration-list">
									{#each sourceNotes.slice(0, 3) as note}
										<div class="inspiration-chip">
											<p>{note.name}</p>
											<span>{note.vibe}</span>
										</div>
									{/each}
								</div>
							</div>
						</div>
					</section>
				</section>
			{/if}
		{/key}
	</div>
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

	.stage-frame {
		position: relative;
		min-height: calc(100vh - 96px);
	}

	.stage-chrome {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 18px;
		margin-bottom: 18px;
	}

	.brand-block {
		display: grid;
		gap: 6px;
	}

	.brand-copy {
		color: #6b5c4c;
		font-size: 0.95rem;
		line-height: 1.5;
		max-width: 34ch;
	}

	.stage-view {
		min-height: calc(100vh - 150px);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.posts-stage,
	.recipe-stage {
		justify-content: flex-start;
	}

	.stage-progress {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 999px;
		background: rgba(255, 248, 236, 0.78);
		border: 1px solid rgba(72, 54, 29, 0.08);
		backdrop-filter: blur(10px);
	}

	.stage-pill {
		padding: 8px 12px;
		border-radius: 999px;
		font-size: 0.85rem;
		color: #7f6950;
		cursor: default;
		transition:
			background 0.22s ease,
			color 0.22s ease,
			transform 0.22s ease;
	}

	.stage-pill.reachable {
		cursor: pointer;
	}

	.stage-pill.reachable:hover {
		background: rgba(201, 109, 27, 0.07);
	}

	.stage-pill.active {
		background: rgba(201, 109, 27, 0.12);
		color: #7a4210;
		transform: translateY(-1px);
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
	.sub-label {
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

	.composer-card,
	.summary-card,
	.recipe-card,
	.detail-panel {
		padding: 34px;
	}

	.landing-card {
		max-width: 860px;
		margin: 0 auto;
	}

	.landing-copy {
		display: grid;
		gap: 14px;
	}

	h1 {
		font-size: clamp(2rem, 3.8vw, 3.1rem);
		line-height: 1;
		letter-spacing: -0.05em;
		max-width: 14ch;
	}

	.lede {
		max-width: 70ch;
		line-height: 1.58;
		color: #53483d;
	}

	.composer-card {
		display: grid;
		gap: 14px;
	}

	.composer {
		margin-top: 6px;
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

	textarea:focus {
		outline: none;
		border-left: 3px solid #c96d1b;
		padding-left: 13px;
	}

	.chip:focus,
	.recipe-card:focus,
	.module-button:focus,
	.expand-button:focus {
		outline: 2px solid #d18e3a;
		outline-offset: 2px;
	}

	.chip-row,
	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 14px;
	}

	.pill-row span,
	.chip,
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
		font-size: 0.86rem;
		padding: 8px 14px;
	}

	.chip-grid {
		gap: 12px;
	}

	.input-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 20px;
		align-items: flex-start;
	}

	.action-stack {
		display: grid;
		gap: 6px;
	}

	.secondary-stack {
		opacity: 0.88;
	}

	.module-action {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}

	.module-button {
		border: none;
		border-radius: 999px;
		padding: 12px 18px;
		font: inherit;
		font-size: 0.94rem;
		background: #c96d1b;
		color: white;
		cursor: pointer;
		box-shadow: 0 14px 28px rgba(167, 94, 24, 0.16);
		white-space: nowrap;
	}

	.primary-button {
		padding-inline: 24px;
		font-size: 1rem;
		box-shadow: 0 18px 36px rgba(167, 94, 24, 0.2);
	}

	.subtle-button {
		background: rgba(255, 248, 236, 0.95);
		color: #6d5635;
		border: 1px solid rgba(72, 54, 29, 0.1);
		box-shadow: none;
	}

	.module-button:disabled {
		opacity: 0.7;
		cursor: wait;
		transition: opacity 0.2s ease;
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

	.inline-plan {
		margin-top: 18px;
		padding: 18px;
		border-radius: 18px;
		background: rgba(255, 253, 248, 0.85);
		border: 1px solid rgba(72, 54, 29, 0.08);
	}

	.step-inline-status {
		margin-top: 8px;
		padding: 10px 12px;
		border-radius: 14px;
		background: rgba(255, 248, 236, 0.95);
		color: #6f5532;
		font-size: 0.9rem;
		width: fit-content;
	}

	.step-inline-status.done {
		background: #dcefe8;
		color: #21664d;
	}

	.step-inline-status.error {
		background: #f8dfdb;
		color: #9b3d31;
	}

	.status-copy {
		color: #5b5044;
	}

	.error-copy {
		color: #a63d2e;
	}

	.summary-meta {
		margin-top: 22px;
		padding-top: 18px;
		border-top: 1px solid rgba(72, 54, 29, 0.09);
		display: grid;
		gap: 16px;
	}

	.summary-meta-copy {
		line-height: 1.6;
		color: #5a4d3f;
		margin-top: 4px;
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

	.section-support {
		margin-top: 10px;
		max-width: 56ch;
		line-height: 1.62;
		color: #5d5246;
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

	.summary-section,
	.recipe-grid {
		margin-top: 28px;
	}

	.posts-stage-shell,
	.recipe-stage {
		width: 100%;
	}

	.posts-stage-top,
	.recipe-stage-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 18px;
		margin-bottom: 24px;
	}

	.top-actions {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.ghost-button {
		border: 1px solid rgba(72, 54, 29, 0.14);
		background: rgba(255, 252, 246, 0.8);
		color: #6d5635;
		padding: 12px 16px;
		border-radius: 999px;
		font: inherit;
		cursor: pointer;
	}

	.posts-stage-center {
		position: relative;
		min-height: 560px;
		display: grid;
		place-items: center;
	}

	.card-stack-shell {
		position: relative;
		width: min(100%, 980px);
		min-height: 560px;
		display: grid;
		place-items: center;
	}

	.stack-card {
		position: absolute;
		top: 50%;
		width: 260px;
		min-height: 360px;
		padding: 24px;
		border-radius: 28px;
		border: 1px solid rgba(72, 54, 29, 0.08);
		background: rgba(255, 248, 238, 0.55);
		color: #7b6444;
		display: grid;
		align-content: end;
		transform: translateY(-50%);
		box-shadow: 0 18px 36px rgba(83, 59, 25, 0.08);
		pointer-events: none;
	}

	.stack-card p {
		font-size: 1rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.stack-caption {
		display: inline-block;
		margin-bottom: 14px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #9a7c58;
	}

	.previous-card {
		left: 2%;
		transform: translateY(-50%) rotate(-6deg) scale(0.92);
	}

	.next-card {
		right: 2%;
		transform: translateY(-50%) rotate(6deg) scale(0.92);
	}

	.source-focus-card {
		position: relative;
		z-index: 2;
		width: min(100%, 720px);
		min-height: 560px;
		padding: 36px;
		display: grid;
		gap: 18px;
		align-content: start;
		border-top: 3px solid rgba(201, 109, 27, 0.35);
		background:
			linear-gradient(180deg, rgba(255, 252, 246, 0.96), rgba(247, 239, 227, 0.94)),
			rgba(255, 252, 246, 0.84);
	}

	.focus-head {
		display: grid;
		gap: 10px;
	}

	.focus-head h3 {
		font-size: clamp(1.8rem, 2.8vw, 2.5rem);
		line-height: 1.05;
		letter-spacing: -0.03em;
		overflow-wrap: anywhere;
	}

	.focus-tagline,
	.focus-context {
		color: #5c5144;
		line-height: 1.6;
	}

	.focus-body {
		display: grid;
		gap: 18px;
	}

	.focus-body > * {
		min-width: 0;
	}

	.focus-meta-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		padding-top: 4px;
	}

	.focus-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding-top: 6px;
	}

	.pager {
		display: flex;
		gap: 10px;
	}

	.focus-link {
		color: #7f4f16;
		text-decoration: none;
	}

	.recipe-top,
	.recipe-meta {
		display: flex;
		justify-content: space-between;
		gap: 16px;
	}

	.recipe-top p {
		font-size: 1.25rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.tagline {
		margin-top: 10px;
		line-height: 1.6;
		color: #5e5449;
		overflow-wrap: anywhere;
	}

	.source-column {
		min-width: 0;
	}

	.source-excerpt {
		line-height: 1.68;
		color: #4f473f;
		max-height: 6.8em;
		overflow: auto;
		padding-right: 4px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.source-excerpt.expanded {
		max-height: 16em;
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

	.comment-preview {
		margin-top: 16px;
		padding-top: 14px;
		border-top: 1px solid rgba(72, 54, 29, 0.08);
		max-height: 180px;
		overflow: auto;
		padding-right: 4px;
	}

	.comment-line {
		margin-top: 8px;
		line-height: 1.55;
		color: #5c5042;
		overflow-wrap: anywhere;
	}

	.recipe-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
		gap: 24px;
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

	.recipe-card.selected {
		border-left: 3px solid rgba(201, 109, 27, 0.6);
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
		min-height: 70vh;
	}

	.cookbook-page {
		background:
			linear-gradient(180deg, rgba(255, 252, 246, 0.94), rgba(249, 241, 228, 0.94)),
			rgba(255, 252, 246, 0.84);
		box-shadow:
			0 28px 58px rgba(83, 59, 25, 0.08),
			inset 0 0 0 1px rgba(255, 255, 255, 0.4);
	}

	.recipe-page-head {
		display: grid;
		gap: 12px;
		padding-bottom: 20px;
		border-bottom: 1px solid rgba(72, 54, 29, 0.09);
	}

	.recipe-page-head h2 {
		font-size: 1.85rem;
	}

	.recipe-page-grid {
		display: grid;
		grid-template-columns: 1.2fr 0.8fr;
		gap: 18px;
	}

	.ingredient-pills {
		gap: 10px;
	}

	.profile-list,
	.recipe-steps {
		display: grid;
		gap: 10px;
	}

	.inspiration-list {
		display: grid;
		gap: 10px;
	}

	.inspiration-chip {
		padding: 12px 14px;
		border-radius: 16px;
		background: rgba(255, 248, 236, 0.92);
		border: 1px solid rgba(72, 54, 29, 0.08);
	}

	.inspiration-chip p {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.inspiration-chip span {
		display: block;
		margin-top: 4px;
		color: #6e5a42;
		font-size: 0.92rem;
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
		.stage-chrome {
			flex-direction: column;
			align-items: stretch;
		}

		.stage-progress {
			align-self: flex-start;
		}

		.recipe-grid {
			grid-template-columns: 1fr;
		}

		.detail-panel {
			position: static;
		}

		.module-action {
			align-items: stretch;
		}

		.module-button {
			width: 100%;
		}

		.step-inline-status {
			width: 100%;
			box-sizing: border-box;
		}

		.posts-stage-top,
		.recipe-stage-top,
		.focus-footer {
			flex-direction: column;
			align-items: stretch;
		}

		.top-actions {
			flex-direction: column;
		}

		.card-stack-shell,
		.posts-stage-center {
			min-height: auto;
		}

		.stack-card {
			display: none;
		}

		.source-focus-card {
			width: 100%;
			min-height: auto;
		}

		.recipe-page-grid {
			grid-template-columns: 1fr;
		}
	}

	.skeleton-card {
		width: min(100%, 720px);
		min-height: 420px;
		padding: 36px;
		display: grid;
		gap: 18px;
		align-content: start;
	}

	@keyframes shimmer {
		0% { background-position: -600px 0; }
		100% { background-position: 600px 0; }
	}

	.skeleton-badge,
	.skeleton-title,
	.skeleton-line,
	.skeleton-body {
		border-radius: 8px;
		background: linear-gradient(90deg, rgba(72,54,29,0.07) 25%, rgba(72,54,29,0.13) 50%, rgba(72,54,29,0.07) 75%);
		background-size: 600px 100%;
		animation: shimmer 1.4s infinite linear;
	}

	.skeleton-badge { height: 22px; width: 90px; border-radius: 999px; }
	.skeleton-title { height: 36px; width: 75%; }
	.skeleton-line { height: 16px; width: 100%; }
	.skeleton-line.short { width: 55%; }
	.skeleton-body { height: 120px; width: 100%; border-radius: 14px; }

	.error-card {
		width: min(100%, 720px);
		padding: 48px 36px;
		display: grid;
		gap: 16px;
		align-content: center;
		justify-items: start;
	}

	.error-card-title {
		font-size: 1.3rem;
		font-weight: 700;
		color: #9b3d31;
	}

	.error-card-msg {
		line-height: 1.6;
		color: #7a4a3d;
		max-width: 52ch;
	}

	.post-counter-badge {
		display: inline-block;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(201, 109, 27, 0.1);
		color: #7a4210;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin-bottom: 10px;
	}

	.taste-pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}

	.taste-pill {
		padding: 3px 10px;
		border-radius: 999px;
		background: rgba(201, 109, 27, 0.09);
		color: #7a4210;
		font-size: 0.8rem;
	}

	.error-block {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
	}

	.error-block .error-copy {
		margin-top: 0;
		flex: 1 1 200px;
	}

	.retry-button {
		padding: 8px 16px;
		border-radius: 999px;
		border: 1px solid rgba(166, 61, 46, 0.3);
		background: rgba(248, 223, 219, 0.8);
		color: #9b3d31;
		font: inherit;
		font-size: 0.9rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.retry-button:hover {
		background: rgba(248, 223, 219, 1);
	}

	@media (max-width: 760px) {
		.page-shell {
			padding: 24px 16px 48px;
		}

		.composer-card,
		.summary-card,
		.plan-card,
		.recipe-card,
		.detail-panel {
			padding: 20px;
			border-radius: 22px;
		}

		h1 {
			font-size: 2.3rem;
			max-width: none;
		}

		.brand-copy,
		.section-support {
			max-width: none;
		}

		.recipe-top,
		.recipe-meta,
		.focus-meta-grid {
			grid-template-columns: 1fr;
			flex-direction: column;
		}

		.stage-progress {
			flex-wrap: wrap;
		}

	}
</style>
