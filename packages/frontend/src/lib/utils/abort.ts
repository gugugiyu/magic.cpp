/**
 * Abort Signal Utilities (Frontend Re-export)
 *
 * Re-exports from @shared/utils/abort for backwards compatibility.
 * New code should import directly from '@shared/utils/abort'.
 */
export {
	throwIfAborted,
	isAbortError,
	createLinkedController,
	createTimeoutSignal,
	withAbortSignal,
	fetchWithTimeout
} from '@shared/utils/abort';
