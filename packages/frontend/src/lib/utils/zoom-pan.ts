/**
 * Attaches mouse-wheel zoom and pointer-drag pan to a container element.
 * Also handles two-finger pinch-to-zoom on touch devices.
 *
 * @returns A cleanup function that removes all attached event listeners.
 */
export function attachZoomPan(container: HTMLElement): () => void {
	let scale = 1;
	let translateX = 0;
	let translateY = 0;
	let isDragging = false;
	let lastX = 0;
	let lastY = 0;
	let lastPinchDist = 0;

	function applyTransform() {
		container.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
		container.style.transformOrigin = '0 0';
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY > 0 ? 0.9 : 1.1;
		scale = Math.min(Math.max(scale * delta, 0.2), 8);
		applyTransform();
	}

	function onPointerDown(e: PointerEvent) {
		isDragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		container.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDragging) return;
		translateX += e.clientX - lastX;
		translateY += e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		applyTransform();
	}

	function onPointerUp() {
		isDragging = false;
	}

	function getPinchDist(touches: TouchList): number {
		return Math.hypot(
			touches[1].clientX - touches[0].clientX,
			touches[1].clientY - touches[0].clientY
		);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			lastPinchDist = getPinchDist(e.touches);
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (e.touches.length !== 2 || lastPinchDist === 0) return;
		e.preventDefault();
		const dist = getPinchDist(e.touches);
		const ratio = dist / lastPinchDist;
		scale = Math.min(Math.max(scale * ratio, 0.2), 8);
		lastPinchDist = dist;
		applyTransform();
	}

	function onTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) {
			lastPinchDist = 0;
		}
	}

	container.addEventListener('wheel', onWheel, { passive: false });
	container.addEventListener('pointerdown', onPointerDown);
	container.addEventListener('pointermove', onPointerMove);
	container.addEventListener('pointerup', onPointerUp);
	container.addEventListener('pointercancel', onPointerUp);
	container.addEventListener('touchstart', onTouchStart, { passive: true });
	container.addEventListener('touchmove', onTouchMove, { passive: false });
	container.addEventListener('touchend', onTouchEnd, { passive: true });

	return () => {
		container.removeEventListener('wheel', onWheel);
		container.removeEventListener('pointerdown', onPointerDown);
		container.removeEventListener('pointermove', onPointerMove);
		container.removeEventListener('pointerup', onPointerUp);
		container.removeEventListener('pointercancel', onPointerUp);
		container.removeEventListener('touchstart', onTouchStart);
		container.removeEventListener('touchmove', onTouchMove);
		container.removeEventListener('touchend', onTouchEnd);
	};
}
