<span aria-hidden="true" style="display: none;"></span>

<style>
	:global {
		.markdown-content-root .markdown-block--unstable {
			display: contents;
		}

		/* Streaming code block uses .code-block-wrapper styles */
		.markdown-content-root .streaming-code-block .streaming-code-pre {
			background: transparent;
			padding: 0.5rem;
			margin: 0;
			overflow-x: visible;
			border-radius: 0;
			border: none;
			font-size: 0.875rem;
		}

		.markdown-content-root .scroll-to-bottom-btn {
			position: absolute;
			bottom: 0.75rem;
			right: 0.75rem;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 2rem;
			height: 2rem;
			border-radius: 9999px;
			border: 1px solid hsl(var(--border));
			background: hsl(var(--background) / 0.9);
			color: hsl(var(--foreground));
			cursor: pointer;
			transition: all 0.15s ease;
			backdrop-filter: blur(8px);
			z-index: 10;
		}

		.markdown-content-root .scroll-to-bottom-btn:hover {
			background: hsl(var(--muted));
			transform: scale(1.05);
		}

		/* Base typography styles */
		.markdown-content-root p {
			margin-block: 1rem;
			line-height: 1.75;
		}

		.markdown-content-root :is(h1, h2, h3, h4, h5, h6):first-child {
			margin-top: 0;
		}

		/* Headers with consistent spacing */
		.markdown-content-root h1 {
			font-size: 1.875rem;
			font-weight: 700;
			line-height: 1.2;
			margin: 1.5rem 0 0.75rem 0;
		}

		.markdown-content-root h2 {
			font-size: 1.5rem;
			font-weight: 600;
			line-height: 1.3;
			margin: 1.25rem 0 0.5rem 0;
		}

		.markdown-content-root h3 {
			font-size: 1.25rem;
			font-weight: 600;
			margin: 1.5rem 0 0.5rem 0;
			line-height: 1.4;
		}

		.markdown-content-root h4 {
			font-size: 1.125rem;
			font-weight: 600;
			margin: 0.75rem 0 0.25rem 0;
		}

		.markdown-content-root h5 {
			font-size: 1rem;
			font-weight: 600;
			margin: 0.5rem 0 0.25rem 0;
		}

		.markdown-content-root h6 {
			font-size: 0.875rem;
			font-weight: 600;
			margin: 0.5rem 0 0.25rem 0;
		}

		/* Text formatting */
		.markdown-content-root strong {
			font-weight: 600;
		}

		.markdown-content-root em {
			font-style: italic;
		}

		.markdown-content-root del {
			text-decoration: line-through;
			opacity: 0.7;
		}

		/* Inline code */
		.markdown-content-root code:not(pre code) {
			background: var(--muted);
			color: var(--muted-foreground);
			padding: 0.125rem 0.375rem;
			border-radius: 0.375rem;
			font-size: 0.875rem;
			font-family:
				ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
				'Liberation Mono', Menlo, monospace;
		}

		.markdown-content-root pre {
			display: inline;
			margin: 0 !important;
			overflow: hidden !important;
			background: var(--muted);
			overflow-x: auto;
			border-radius: 1rem;
			border: none;
			line-height: 1 !important;
		}

		.markdown-content-root pre code {
			padding: 0 !important;
			display: inline !important;
		}

		.markdown-content-root code {
			background: transparent;
			color: var(--code-foreground);
		}

		/* Links */
		.markdown-content-root a {
			color: var(--primary);
			text-decoration: underline;
			text-underline-offset: 2px;
			transition: color 0.2s ease;
			overflow-wrap: anywhere;
			word-break: break-all;
		}

		.markdown-content-root a:hover {
			color: var(--primary);
		}

		/* Lists */
		.markdown-content-root ul {
			list-style-type: disc;
			margin-inline-start: 1.5rem;
			margin-bottom: 1rem;
		}

		.markdown-content-root ol {
			list-style-type: decimal;
			margin-inline-start: 1.5rem;
			margin-bottom: 1rem;
		}

		.markdown-content-root li {
			margin-bottom: 0.25rem;
			padding-inline-start: 0.5rem;
		}

		.markdown-content-root li::marker {
			color: var(--muted-foreground);
		}

		/* Nested lists */
		.markdown-content-root ul ul {
			list-style-type: circle;
			margin-top: 0.25rem;
			margin-bottom: 0.25rem;
		}

		.markdown-content-root ol ol {
			list-style-type: lower-alpha;
			margin-top: 0.25rem;
			margin-bottom: 0.25rem;
		}

		/* Task lists */
		.markdown-content-root .task-list-item {
			list-style: none;
			margin-inline-start: 0;
			padding-inline-start: 0;
		}

		.markdown-content-root .task-list-item-checkbox {
			margin-right: 0.5rem;
			margin-top: 0.125rem;
		}

		/* Blockquotes */
		.markdown-content-root blockquote {
			border-left: 4px solid var(--border);
			padding: 0.5rem 1rem;
			margin: 1.5rem 0;
			font-style: italic;
			color: var(--muted-foreground);
			background: var(--muted);
			border-radius: 0 0.375rem 0.375rem 0;
		}

		/* Tables */
		.markdown-content-root table {
			width: 100%;
			margin: 1.5rem 0;
			border-collapse: collapse;
			border: 1px solid var(--border);
			border-radius: 0.375rem;
			overflow: hidden;
		}

		.markdown-content-root th {
			background: hsl(var(--muted) / 0.3);
			border: 1px solid var(--border);
			padding: 0.5rem 0.75rem;
			text-align: left;
			font-weight: 600;
		}

		.markdown-content-root td {
			border: 1px solid var(--border);
			padding: 0.5rem 0.75rem;
		}

		.markdown-content-root tr:nth-child(even) {
			background: hsl(var(--muted) / 0.1);
		}

		/* User message markdown should keep table borders visible on light primary backgrounds */
		.markdown-content-root.markdown-user-content table,
		.markdown-content-root.markdown-user-content th,
		.markdown-content-root.markdown-user-content td,
		.markdown-content-root.markdown-user-content .table-wrapper {
			border-color: currentColor;
		}

		/* Horizontal rules */
		.markdown-content-root hr {
			border: none;
			border-top: 1px solid var(--border);
			margin: 1.5rem 0;
		}

		/* Images */
		.markdown-content-root img {
			border-radius: 0.5rem;
			box-shadow:
				0 1px 3px 0 color-mix(in oklch, var(--foreground) 10%, transparent),
				0 1px 2px -1px color-mix(in oklch, var(--foreground) 10%, transparent);
			margin: 1.5rem 0;
			max-width: 100%;
			height: auto;
		}

		/* Code blocks */

		.markdown-content-root .code-block-wrapper {
			margin: 1.5rem 0;
			border-radius: 0.75rem;
			overflow: hidden;
			border: 1px solid color-mix(in oklch, var(--border) 30%, transparent);
			background: var(--code-background);
			box-shadow: 0 1px 2px 0 color-mix(in oklch, var(--foreground) 5%, transparent);
			min-height: var(--min-message-height);
			max-height: var(--max-message-height);
		}

		.dark .markdown-content-root .code-block-wrapper {
			border-color: color-mix(in oklch, var(--border) 20%, transparent);
		}

		/* Scroll container for code blocks (both streaming and completed) */
		.markdown-content-root .code-block-scroll-container,
		.markdown-content-root .streaming-code-scroll-container {
			min-height: var(--min-message-height);
			max-height: var(--max-message-height);
			overflow-y: auto;
			overflow-x: auto;
			padding: 3rem 1rem 1rem;
			line-height: 1.3;
		}

		.markdown-content-root.full-height-code-blocks .code-block-wrapper {
			max-height: none;
		}

		.markdown-content-root.full-height-code-blocks .code-block-scroll-container,
		.markdown-content-root.full-height-code-blocks .streaming-code-scroll-container {
			max-height: none;
			overflow-y: visible;
		}

		.markdown-content-root .code-block-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.5rem 1rem 0;
			font-size: 0.875rem;
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			z-index: 10;
		}

		.markdown-content-root .code-language {
			color: var(--color-foreground);
			font-weight: 500;
			font-family:
				ui-monospace, SFMono-Regular, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
				'Liberation Mono', Menlo, monospace;
			text-transform: uppercase;
			font-size: 0.75rem;
			letter-spacing: 0.05em;
		}

		.markdown-content-root .code-block-actions {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		.markdown-content-root .copy-code-btn,
		.markdown-content-root .preview-code-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 0;
			background: transparent;
			color: var(--code-foreground);
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.markdown-content-root .copy-code-btn:hover,
		.markdown-content-root .preview-code-btn:hover {
			transform: scale(1.05);
		}

		.markdown-content-root .copy-code-btn:active,
		.markdown-content-root .preview-code-btn:active {
			transform: scale(0.95);
		}

		.markdown-content-root .code-block-wrapper pre {
			background: transparent;
			margin: 0;
			border-radius: 0;
			border: none;
			font-size: 0.875rem;
		}

		/* Mentions and hashtags */
		.markdown-content-root .mention {
			color: hsl(var(--primary));
			font-weight: 500;
			text-decoration: none;
		}

		.markdown-content-root .mention:hover {
			text-decoration: underline;
		}

		.markdown-content-root .hashtag {
			color: hsl(var(--primary));
			font-weight: 500;
			text-decoration: none;
		}

		.markdown-content-root .hashtag:hover {
			text-decoration: underline;
		}

		/* Advanced table enhancements */
		.markdown-content-root table {
			transition: all 0.2s ease;
		}

		.markdown-content-root table:hover {
			box-shadow:
				0 4px 6px -1px color-mix(in oklch, var(--foreground) 10%, transparent),
				0 2px 4px -2px color-mix(in oklch, var(--foreground) 10%, transparent);
		}

		.markdown-content-root th:hover,
		.markdown-content-root td:hover {
			background: var(--muted);
		}

		/* Disable hover effects when rendering user messages */
		.markdown-content-root.markdown-user-content a,
		.markdown-content-root.markdown-user-content a:hover {
			color: inherit;
		}

		.markdown-content-root.markdown-user-content table:hover {
			box-shadow: none;
		}

		.markdown-content-root.markdown-user-content th:hover,
		.markdown-content-root.markdown-user-content td:hover {
			background: inherit;
		}

		/* Enhanced blockquotes */
		.markdown-content-root blockquote {
			transition: all 0.2s ease;
			position: relative;
		}

		.markdown-content-root blockquote:hover {
			border-left-width: 6px;
			background: var(--muted);
			transform: translateX(2px);
		}

		.markdown-content-root blockquote::before {
			content: '"';
			position: absolute;
			top: -0.5rem;
			left: 0.5rem;
			font-size: 3rem;
			color: var(--muted-foreground);
			font-family: serif;
			line-height: 1;
		}

		/* Enhanced images */
		.markdown-content-root img {
			transition: all 0.3s ease;
			cursor: pointer;
		}

		.markdown-content-root img:hover {
			transform: scale(1.02);
			box-shadow:
				0 10px 15px -3px color-mix(in oklch, var(--foreground) 10%, transparent),
				0 4px 6px -4px color-mix(in oklch, var(--foreground) 10%, transparent);
		}

		/* Image zoom overlay */
		.markdown-content-root .image-zoom-overlay {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: color-mix(in oklch, var(--overlay) 80%, transparent);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 1000;
			cursor: pointer;
		}

		.markdown-content-root .image-zoom-overlay img {
			max-width: 90vw;
			max-height: 90vh;
			border-radius: 0.5rem;
			box-shadow: 0 25px 50px -12px color-mix(in oklch, var(--foreground) 25%, transparent);
		}

		/* Enhanced horizontal rules */
		.markdown-content-root hr {
			border: none;
			height: 2px;
			background: linear-gradient(to right, transparent, var(--border), transparent);
			margin: 2rem 0;
			position: relative;
		}

		.markdown-content-root hr::after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 1rem;
			height: 1rem;
			background: var(--border);
			border-radius: 50%;
		}

		/* Scrollable tables */
		.markdown-content-root .table-wrapper {
			overflow-x: auto;
			margin: 1.5rem 0;
			border-radius: 0.5rem;
			border: 1px solid var(--border);
		}

		.markdown-content-root .table-wrapper table {
			margin: 0;
			border: none;
		}

		/* Responsive adjustments */
		@media (max-width: 640px) {
			.markdown-content-root h1 {
				font-size: 1.5rem;
			}

			.markdown-content-root h2 {
				font-size: 1.25rem;
			}

			.markdown-content-root h3 {
				font-size: 1.125rem;
			}

			.markdown-content-root table {
				font-size: 0.875rem;
			}

			.markdown-content-root th,
			.markdown-content-root td {
				padding: 0.375rem 0.5rem;
			}

			.markdown-content-root .table-wrapper {
				margin: 0.5rem -1rem;
				border-radius: 0;
				border-left: none;
				border-right: none;
			}
		}

		/* Dark mode adjustments */
		@media (prefers-color-scheme: dark) {
			.markdown-content-root blockquote:hover {
				background: var(--muted);
			}
		}

		/* Image load error fallback */
		.markdown-content-root .image-load-error {
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 1.5rem 0;
			padding: 1.5rem;
			border-radius: 0.5rem;
			background: var(--muted);
			border: 1px dashed var(--border);
		}

		.markdown-content-root .image-error-content {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.75rem;
			color: var(--muted-foreground);
			text-align: center;
		}

		.markdown-content-root .image-error-content svg {
			opacity: 0.5;
		}

		.markdown-content-root .image-error-text {
			font-size: 0.875rem;
		}

		.markdown-content-root .image-error-link {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			padding: 0.5rem 1rem;
			font-size: 0.875rem;
			font-weight: 500;
			color: var(--primary);
			background: var(--background);
			border: 1px solid var(--border);
			border-radius: 0.375rem;
			text-decoration: none;
			transition: all 0.2s ease;
		}

		.markdown-content-root .image-error-link:hover {
			background: var(--muted);
			border-color: var(--primary);
		}

		.markdown-content-root .diagram-render-skeleton {
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 120px;
			width: 100%;
		}

		.markdown-content-root .diagram-render-spinner {
			width: 28px;
			height: 28px;
			border: 3px solid var(--border);
			border-top-color: var(--primary);
			border-radius: 50%;
			animation: diagram-spin 0.7s linear infinite;
		}

		/* Responsive scaling for rendered Mermaid / SVG diagrams */
		.markdown-content-root .mermaid-render-container,
		.markdown-content-root .svg-render-container {
			width: 100%;
		}

		.markdown-content-root .mermaid-render-container svg,
		.markdown-content-root .svg-render-container svg {
			max-width: 100%;
			height: auto;
			display: block;
		}

		@keyframes diagram-spin {
			to {
				transform: rotate(360deg);
			}
		}

		/* Live-streaming SVG styles */
		.markdown-content-root .streaming-svg-badge {
			font-size: 0.75rem;
			color: var(--muted-foreground);
			animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
		}

		.markdown-content-root .svg-stream-container {
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 120px;
			padding: 1rem;
			background: var(--code-background);
		}

		.markdown-content-root .svg-stream-container svg {
			max-width: 100%;
			height: auto;
		}

		.markdown-content-root .svg-stream-placeholder {
			font-size: 0.875rem;
			color: var(--muted-foreground);
			text-align: center;
		}

		@keyframes pulse {
			0%,
			100% {
				opacity: 1;
			}
			50% {
				opacity: 0.5;
			}
		}
	}
</style>
