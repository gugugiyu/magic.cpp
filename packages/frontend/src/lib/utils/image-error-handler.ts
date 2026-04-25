import { getImageErrorFallbackHtml } from './image-error-fallback';
import { UrlProtocol } from '$lib/enums';

const IMAGE_NOT_ERROR_BOUND_SELECTOR = 'img:not([data-error-bound])';
const DATA_ERROR_BOUND_ATTR = 'errorBound';
const DATA_ERROR_HANDLED_ATTR = 'errorHandled';
const BOOL_TRUE_STRING = 'true';

export class ImageErrorHandler {
	private handleImageError = (event: Event) => {
		const img = event.target as HTMLImageElement;
		if (!img || !img.src) return;

		// Don't handle data URLs or already-handled images
		if (
			img.src.startsWith(UrlProtocol.DATA) ||
			img.dataset[DATA_ERROR_HANDLED_ATTR] === BOOL_TRUE_STRING
		)
			return;
		img.dataset[DATA_ERROR_HANDLED_ATTR] = BOOL_TRUE_STRING;

		const src = img.src;
		// Create fallback element
		const fallback = document.createElement('div');
		fallback.className = 'image-load-error';
		fallback.innerHTML = getImageErrorFallbackHtml(src);

		// Replace image with fallback
		img.parentNode?.replaceChild(fallback, img);
	};

	bind(container: HTMLElement): void {
		const images = container.querySelectorAll<HTMLImageElement>(IMAGE_NOT_ERROR_BOUND_SELECTOR);

		for (const img of images) {
			img.dataset[DATA_ERROR_BOUND_ATTR] = BOOL_TRUE_STRING;
			img.addEventListener('error', this.handleImageError);
		}
	}

	unbind(container: HTMLElement): void {
		const images = container.querySelectorAll<HTMLImageElement>(
			`img[data-${DATA_ERROR_BOUND_ATTR}="${BOOL_TRUE_STRING}"]`
		);

		for (const img of images) {
			img.removeEventListener('error', this.handleImageError);
			delete img.dataset[DATA_ERROR_BOUND_ATTR];
		}
	}
}
