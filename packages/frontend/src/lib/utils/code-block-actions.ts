import { renderMermaidDiagram, renderSvgDiagram } from './diagram-renderer';
import { copyCodeToClipboard } from './clipboard';
import { createModuleLogger } from './logger';
import { mode } from 'mode-watcher';
import { ColorMode } from '$lib/enums';
import { toast } from 'svelte-sonner';

const logger = createModuleLogger('CodeBlockActions');

export interface CodeBlockActionCallbacks {
	onPreview: (code: string, language: string) => void;
	onCopyError: (error: unknown) => void;
	onFullscreen?: (svgHtml: string) => void;
}

export class CodeBlockActionManager {
	private callbacks: CodeBlockActionCallbacks;
	private boundContainers = new WeakSet<HTMLElement>();

	constructor(callbacks: CodeBlockActionCallbacks) {
		this.callbacks = callbacks;
	}

	/**
	 * Extracts code information from a button click target within a code block.
	 */
	private getCodeInfoFromTarget(target: HTMLElement) {
		const wrapper = target.closest('.code-block-wrapper');

		if (!wrapper) {
			logger.error('No wrapper found for code block action');
			return null;
		}

		const codeElement = wrapper.querySelector<HTMLElement>('code[data-code-id]');

		if (!codeElement) {
			logger.error('No code element found in wrapper');
			return null;
		}

		const rawCode = codeElement.textContent ?? '';

		const languageLabel = wrapper.querySelector<HTMLElement>('.code-language');
		const language = languageLabel?.textContent?.trim() || 'text';

		return { rawCode, language, wrapper: wrapper as HTMLElement };
	}

	private handleCopyClick = async (event: Event) => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const info = this.getCodeInfoFromTarget(target);
		if (!info) return;

		try {
			await copyCodeToClipboard(info.rawCode);
		} catch (error) {
			this.callbacks.onCopyError(error);
		}
	};

	private handlePreviewClick = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const info = this.getCodeInfoFromTarget(target);
		if (!info) return;

		this.callbacks.onPreview(info.rawCode, info.language);
	};

	private handleFullscreenClick = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const wrapper = target.closest<HTMLElement>('.code-block-wrapper');
		if (!wrapper) return;

		const renderContainer =
			wrapper.querySelector<HTMLElement>('.mermaid-render-container') ||
			wrapper.querySelector<HTMLElement>('.svg-render-container');
		if (!renderContainer) return;

		const inner = renderContainer.querySelector<HTMLDivElement>('div');
		if (!inner) return;

		this.callbacks.onFullscreen?.(inner.innerHTML);
	};

	private handleMermaidRenderClick = async (event: Event) => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const wrapper = target.closest<HTMLElement>('.code-block-wrapper');
		if (!wrapper) return;

		// Prevent race conditions: block rapid double-clicks
		if (wrapper.dataset.renderingInProgress === 'true') return;

		const scrollContainer =
			wrapper.querySelector<HTMLElement>('.code-block-scroll-container') ||
			wrapper.querySelector<HTMLElement>('.streaming-code-scroll-container');
		if (!scrollContainer) return;

		const info = this.getCodeInfoFromTarget(target);
		if (!info) return;

		// Toggle back to code view if already rendered
		const existing = wrapper.querySelector<HTMLElement>('.mermaid-render-container');
		if (existing) {
			const savedScrollTop = scrollContainer.scrollTop;
			(existing as HTMLElement & { _zoomPanCleanup?: () => void })._zoomPanCleanup?.();
			existing.remove();
			// Clean up any skeleton left behind
			wrapper.querySelector('.diagram-render-skeleton')?.remove();
			scrollContainer.style.display = '';
			scrollContainer.scrollTop = savedScrollTop;
			target.title = 'Render diagram';
			const fullscreenBtn = wrapper.querySelector<HTMLButtonElement>('.fullscreen-diagram-btn');
			if (fullscreenBtn) fullscreenBtn.style.display = 'none';
			return;
		}

		wrapper.dataset.renderingInProgress = 'true';
		target.disabled = true;
		target.title = 'Rendering…';

		try {
			await renderMermaidDiagram(
				wrapper,
				scrollContainer,
				info.rawCode,
				mode.current === ColorMode.DARK
			);
			target.title = 'Show source';
			const fullscreenBtn = wrapper.querySelector<HTMLButtonElement>('.fullscreen-diagram-btn');
			if (fullscreenBtn) fullscreenBtn.style.display = '';
		} catch (err) {
			logger.error('Mermaid render failed', err);
			toast.error('Mermaid render failed');
			target.title = 'Render diagram';
		} finally {
			target.disabled = false;
			delete wrapper.dataset.renderingInProgress;
		}
	};

	private renderSvgBlock = async (
		wrapper: HTMLElement,
		scrollContainer: HTMLElement,
		rawCode: string,
		button?: HTMLButtonElement
	): Promise<void> => {
		// Toggle back to code view if already rendered
		const existing = wrapper.querySelector<HTMLElement>('.svg-render-container');
		if (existing) {
			const savedScrollTop = scrollContainer.scrollTop;
			(existing as HTMLElement & { _zoomPanCleanup?: () => void })._zoomPanCleanup?.();
			existing.remove();
			// Clean up any skeleton left behind
			wrapper.querySelector('.diagram-render-skeleton')?.remove();
			scrollContainer.style.display = '';
			scrollContainer.scrollTop = savedScrollTop;
			if (button) button.title = 'Render SVG';
			const fullscreenBtn = wrapper.querySelector<HTMLButtonElement>('.fullscreen-diagram-btn');
			if (fullscreenBtn) fullscreenBtn.style.display = 'none';
			return;
		}

		// Prevent race conditions: block rapid double-clicks
		if (wrapper.dataset.renderingInProgress === 'true') return;

		wrapper.dataset.renderingInProgress = 'true';
		if (button) {
			button.disabled = true;
			button.title = 'Rendering…';
		}

		try {
			await renderSvgDiagram(wrapper, scrollContainer, rawCode);
			if (button) button.title = 'Show source';
			const fullscreenBtn = wrapper.querySelector<HTMLButtonElement>('.fullscreen-diagram-btn');
			if (fullscreenBtn) fullscreenBtn.style.display = '';
		} catch (err) {
			logger.error('SVG render failed', err);
			if (button) button.title = 'Render SVG';
			throw err;
		} finally {
			if (button) button.disabled = false;
			delete wrapper.dataset.renderingInProgress;
		}
	};

	private handleSvgRenderClick = async (event: Event) => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLButtonElement | null;
		if (!target) return;

		const wrapper = target.closest<HTMLElement>('.code-block-wrapper');
		if (!wrapper) return;

		const scrollContainer =
			wrapper.querySelector<HTMLElement>('.code-block-scroll-container') ||
			wrapper.querySelector<HTMLElement>('.streaming-code-scroll-container');
		if (!scrollContainer) return;

		const info = this.getCodeInfoFromTarget(target);
		if (!info) return;

		await this.renderSvgBlock(wrapper, scrollContainer, info.rawCode, target);
	};

	bind(container: HTMLElement, isStreamingComplete: boolean): void {
		const wrappers = container.querySelectorAll<HTMLElement>('.code-block-wrapper');

		for (const wrapper of wrappers) {
			const copyButton = wrapper.querySelector<HTMLButtonElement>('.copy-code-btn');
			const previewButton = wrapper.querySelector<HTMLButtonElement>('.preview-code-btn');
			const mermaidButton = wrapper.querySelector<HTMLButtonElement>('.mermaid-render-btn');
			const svgButton = wrapper.querySelector<HTMLButtonElement>('.svg-render-btn');
			const fullscreenButton = wrapper.querySelector<HTMLButtonElement>('.fullscreen-diagram-btn');

			if (copyButton && copyButton.dataset.listenerBound !== 'true') {
				copyButton.dataset.listenerBound = 'true';
				copyButton.addEventListener('click', this.handleCopyClick);
			}

			if (previewButton && previewButton.dataset.listenerBound !== 'true') {
				previewButton.dataset.listenerBound = 'true';
				previewButton.addEventListener('click', this.handlePreviewClick);
			}

			if (mermaidButton && mermaidButton.dataset.listenerBound !== 'true') {
				mermaidButton.dataset.listenerBound = 'true';
				// Disable during streaming, enable only after streaming completes
				if (!isStreamingComplete) {
					mermaidButton.disabled = true;
					mermaidButton.title = 'Render diagram (after streaming completes)';
					mermaidButton.dataset.pendingEnable = 'true';
				}
				mermaidButton.addEventListener('click', this.handleMermaidRenderClick);
			}

			if (svgButton && svgButton.dataset.listenerBound !== 'true') {
				svgButton.dataset.listenerBound = 'true';
				// Disable during streaming, enable only after streaming completes
				if (!isStreamingComplete) {
					svgButton.disabled = true;
					svgButton.title = 'Render SVG (after streaming completes)';
					svgButton.dataset.pendingEnable = 'true';
				}
				svgButton.addEventListener('click', this.handleSvgRenderClick);
			}

			if (fullscreenButton && fullscreenButton.dataset.listenerBound !== 'true') {
				fullscreenButton.dataset.listenerBound = 'true';
				fullscreenButton.addEventListener('click', this.handleFullscreenClick);
				// Show only if a render container already exists
				const hasRender = wrapper.querySelector('.mermaid-render-container, .svg-render-container');
				fullscreenButton.style.display = hasRender ? '' : 'none';
			}

			// Auto-render completed SVG blocks on first mount
			if (
				isStreamingComplete &&
				svgButton &&
				!wrapper.querySelector('.svg-render-container') &&
				wrapper.dataset.svgAutoRendered !== 'true'
			) {
				const langLabel = wrapper.querySelector<HTMLElement>('.code-language');
				const lang = langLabel?.textContent?.trim().toLowerCase() || '';
				const codeEl = wrapper.querySelector<HTMLElement>('code[data-code-id]');
				const codeText = codeEl?.textContent || '';
				const isSvgContent = lang === 'svg' || (lang === 'xml' && /<svg[\s>]/.test(codeText));

				if (isSvgContent) {
					wrapper.dataset.svgAutoRendered = 'true';
					const sc =
						wrapper.querySelector<HTMLElement>('.code-block-scroll-container') ||
						wrapper.querySelector<HTMLElement>('.streaming-code-scroll-container');
					if (sc) {
						const info = this.getCodeInfoFromTarget(svgButton);
						if (info) {
							this.renderSvgBlock(wrapper, sc, info.rawCode, svgButton).catch(() => {});
						}
					}
				}
			}
		}
	}

	unbind(container: HTMLElement): void {
		if (!this.boundContainers.has(container)) return;
		this.boundContainers.delete(container);

		const copyButtons = container.querySelectorAll<HTMLButtonElement>('.copy-code-btn');
		const previewButtons = container.querySelectorAll<HTMLButtonElement>('.preview-code-btn');
		const mermaidButtons = container.querySelectorAll<HTMLButtonElement>('.mermaid-render-btn');
		const svgButtons = container.querySelectorAll<HTMLButtonElement>('.svg-render-btn');
		const fullscreenButtons =
			container.querySelectorAll<HTMLButtonElement>('.fullscreen-diagram-btn');

		for (const button of copyButtons) {
			button.removeEventListener('click', this.handleCopyClick);
			delete button.dataset.listenerBound;
		}

		for (const button of previewButtons) {
			button.removeEventListener('click', this.handlePreviewClick);
			delete button.dataset.listenerBound;
		}

		for (const button of mermaidButtons) {
			button.removeEventListener('click', this.handleMermaidRenderClick);
			delete button.dataset.listenerBound;
			delete button.dataset.pendingEnable;
		}

		for (const button of svgButtons) {
			button.removeEventListener('click', this.handleSvgRenderClick);
			delete button.dataset.listenerBound;
			delete button.dataset.pendingEnable;
		}

		for (const button of fullscreenButtons) {
			button.removeEventListener('click', this.handleFullscreenClick);
			delete button.dataset.listenerBound;
		}

		const renderContainers = container.querySelectorAll<
			HTMLElement & { _zoomPanCleanup?: () => void }
		>('.mermaid-render-container, .svg-render-container');

		for (const renderContainer of renderContainers) {
			renderContainer._zoomPanCleanup?.();
		}
	}

	enableDiagramButtons(container: HTMLElement): void {
		const mermaidButtons = container.querySelectorAll<HTMLButtonElement>('.mermaid-render-btn');
		const svgButtons = container.querySelectorAll<HTMLButtonElement>('.svg-render-btn');

		for (const button of mermaidButtons) {
			if (button.dataset.pendingEnable === 'true') {
				button.disabled = false;
				button.title = 'Render diagram';
				delete button.dataset.pendingEnable;
			}
		}

		for (const button of svgButtons) {
			if (button.dataset.pendingEnable === 'true') {
				button.disabled = false;
				button.title = 'Render SVG';
				delete button.dataset.pendingEnable;
			}
		}
	}
}
