/**
 * Utilities for rendering Mermaid and SVG diagrams inside code-block wrappers.
 *
 * Each render function:
 *  1. Hides the code scroll-container immediately.
 *  2. Shows a `.diagram-render-skeleton` spinner while the library is lazy-loaded.
 *  3. Replaces the skeleton with the rendered diagram on success.
 *  4. Restores the scroll-container and removes the skeleton on failure, then
 *     re-throws so the caller can update the button state.
 *
 * Zoom/pan is attached via attachZoomPan (supports mouse wheel + pointer drag +
 * two-finger pinch on touch devices).
 */

import { attachZoomPan } from './zoom-pan';

type ZoomPanTarget = HTMLElement & { _zoomPanCleanup?: () => void };

function createLoadingSkeleton(): HTMLElement {
	const wrapper = document.createElement('div');
	wrapper.className = 'diagram-render-skeleton';
	const spinner = document.createElement('div');
	spinner.className = 'diagram-render-spinner';
	wrapper.appendChild(spinner);
	return wrapper;
}

/**
 * Renders a Mermaid diagram into `wrapper`, hiding `scrollContainer` first.
 * The caller is responsible for the toggle-back (remove existing render)
 * before calling this function.
 *
 * @param wrapper        - `.code-block-wrapper` element
 * @param scrollContainer - `.code-block-scroll-container` inside the wrapper
 * @param rawCode        - Raw mermaid source
 * @param isDark         - Whether to use the dark Mermaid theme
 */
export async function renderMermaidDiagram(
	wrapper: HTMLElement,
	scrollContainer: HTMLElement,
	rawCode: string,
	isDark: boolean
): Promise<void> {
	scrollContainer.style.display = 'none';

	// Prevent multiple skeletons from accumulating during race conditions
	const existingSkeleton = wrapper.querySelector('.diagram-render-skeleton');
	if (!existingSkeleton) {
		const skeleton = createLoadingSkeleton();
		wrapper.appendChild(skeleton);
	}

	try {
		const mermaid = (await import('mermaid')).default;
		mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });

		const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const { svg } = await mermaid.render(id, rawCode);

		const skeleton = wrapper.querySelector('.diagram-render-skeleton');
		skeleton?.remove();

		const renderContainer = document.createElement('div') as ZoomPanTarget;
		renderContainer.className = 'mermaid-render-container';
		renderContainer.style.cssText =
			'overflow:hidden;cursor:grab;position:relative;min-height:200px;';

		const inner = document.createElement('div');
		inner.innerHTML = svg;
		inner.style.cssText = 'display:inline-block;';
		renderContainer.appendChild(inner);
		wrapper.appendChild(renderContainer);

		renderContainer._zoomPanCleanup = attachZoomPan(inner);
	} catch (err) {
		const skeleton = wrapper.querySelector('.diagram-render-skeleton');
		skeleton?.remove();
		scrollContainer.style.display = '';
		throw err;
	}
}

/**
 * Renders a sanitized SVG diagram into `wrapper`, hiding `scrollContainer` first.
 * The caller is responsible for the toggle-back (remove existing render)
 * before calling this function.
 *
 * @param wrapper        - `.code-block-wrapper` element
 * @param scrollContainer - `.code-block-scroll-container` inside the wrapper
 * @param rawCode        - Raw SVG source
 */
export async function renderSvgDiagram(
	wrapper: HTMLElement,
	scrollContainer: HTMLElement,
	rawCode: string
): Promise<void> {
	scrollContainer.style.display = 'none';

	// Prevent multiple skeletons from accumulating during race conditions
	const existingSkeleton = wrapper.querySelector('.diagram-render-skeleton');
	if (!existingSkeleton) {
		const skeleton = createLoadingSkeleton();
		wrapper.appendChild(skeleton);
	}

	try {
		const DOMPurify = (await import('dompurify')).default;
		const clean = DOMPurify.sanitize(rawCode, {
			USE_PROFILES: { svg: true, svgFilters: true },
			FORBID_TAGS: ['script', 'style', 'foreignObject'],
			FORBID_ATTR: ['onbegin', 'onend', 'onrepeat', 'onload', 'onerror', 'onclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmouseout']
		});

		const skeleton = wrapper.querySelector('.diagram-render-skeleton');
		skeleton?.remove();

		const renderContainer = document.createElement('div') as ZoomPanTarget;
		renderContainer.className = 'svg-render-container';
		renderContainer.style.cssText =
			'overflow:hidden;cursor:grab;position:relative;min-height:80px;';

		const inner = document.createElement('div');
		inner.innerHTML = clean;
		inner.style.cssText = 'display:inline-block;';
		renderContainer.appendChild(inner);
		wrapper.appendChild(renderContainer);

		renderContainer._zoomPanCleanup = attachZoomPan(inner);
	} catch (err) {
		const skeleton = wrapper.querySelector('.diagram-render-skeleton');
		skeleton?.remove();
		scrollContainer.style.display = '';
		throw err;
	}
}
