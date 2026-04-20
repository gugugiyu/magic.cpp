export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	NONE = 4
}

const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'] as const;

const REDACTED_VALUE = '[REDACTED]';
const CIRCULAR_VALUE = '[Circular]';

const SENSITIVE_FIELD_PATTERNS = [
	/key$/i,
	/secret$/i,
	/token$/i,
	/password$/i,
	/credential$/i,
	/auth$/i,
	/bearer$/i,
	/api[-_]?key$/i,
	/access[-_]?key$/i,
	/private[-_]?key$/i,
	/session$/i,
	/cookie$/i,
	/authorization$/i,
	/x-api-key$/i
];

const SENSITIVE_VALUE_PATTERNS = [
	/^sk-[a-zA-Z0-9]{20,}$/,
	/^[a-zA-Z0-9]{32,}$/,
	/^Bearer\s+.+$/i,
	/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
	/\btoken["']?\s*[:=]\s*["'][^"']{20,}["']/i,
	/^ghp_[a-zA-Z0-9]{36}$/,
	/^AIza[0-9A-Za-z\-_]{35}$/
];

function shouldRedactField(key: string): boolean {
	return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function isSensitiveValue(value: string): boolean {
	return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function redactString(value: string): string {
	if (isSensitiveValue(value)) {
		return REDACTED_VALUE;
	}

	if (value.length > 50 && /^[a-zA-Z0-9+/=]{32,}$/.test(value)) {
		return REDACTED_VALUE;
	}

	return value;
}

function redactValue(
	value: unknown,
	depth: number = 0,
	seen: WeakSet<object> = new WeakSet()
): unknown {
	if (depth > 10) return REDACTED_VALUE;

	if (value === null || value === undefined) return value;

	if (typeof value === 'string') return redactString(value);
	if (typeof value === 'number' || typeof value === 'boolean') return value;

	if (value instanceof Error) {
		return {
			name: value.name,
			message: redactString(value.message),
			stack: value.stack
		};
	}

	if (typeof value === 'object') {
		if (seen.has(value as object)) return CIRCULAR_VALUE;
		seen.add(value as object);
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactValue(item, depth + 1, seen));
	}

	if (value instanceof Map) {
		return Object.fromEntries(
			Array.from(value.entries()).map(([k, v]) => [k, redactValue(v, depth + 1, seen)])
		);
	}

	if (value instanceof Set) {
		return Array.from(value).map((v) => redactValue(v, depth + 1, seen));
	}

	if (typeof value === 'object') {
		const redacted: Record<string, unknown> = {};

		for (const [k, v] of Object.entries(value)) {
			if (shouldRedactField(k)) {
				redacted[k] = REDACTED_VALUE;
			} else {
				redacted[k] = redactValue(v, depth + 1, seen);
			}
		}

		return redacted;
	}

	return value;
}

function formatPrefix(level: LogLevel, namespace: string): string {
	const timestamp = new Date().toISOString();
	const levelName = LOG_LEVEL_NAMES[level];
	return `[${timestamp}] [${levelName}] [${namespace}]`;
}

function getStackTrace(): string | null {
	try {
		throw new Error();
	} catch (e) {
		const stack = (e as Error).stack;
		if (!stack) return null;

		const lines = stack.split('\n');

		// Skip:
		// 0 = Error
		// 1 = getStackTrace
		// 2 = Logger.log
		// 3 = caller
		return lines[3]?.trim() ?? null;
	}
}

class Logger {
	private namespace: string;
	private minLevel: LogLevel;
	private enableStackTrace: boolean;

	constructor(
		namespace: string,
		minLevel: LogLevel = LogLevel.INFO,
		enableStackTrace: boolean = false
	) {
		this.namespace = namespace;
		this.minLevel = minLevel;
		this.enableStackTrace = enableStackTrace;
	}

	private shouldLog(level: LogLevel): boolean {
		return level >= this.minLevel;
	}

	private log(level: LogLevel, ...args: unknown[]): void {
		if (!this.shouldLog(level)) return;

		const prefix = formatPrefix(level, this.namespace);

		const redactedArgs = args.map((a) =>
			typeof a === 'object' && a !== null ? redactValue(a) : a
		);

		switch (level) {
			case LogLevel.DEBUG: {
				if (this.enableStackTrace) {
					const stack = getStackTrace();
					console.debug(prefix, ...redactedArgs, stack ? `\n  ↳ ${stack}` : '');
				} else {
					console.debug(prefix, ...redactedArgs);
				}
				break;
			}

			case LogLevel.INFO:
				console.info(prefix, ...redactedArgs);
				break;

			case LogLevel.WARN:
				console.warn(prefix, ...redactedArgs);
				break;

			case LogLevel.ERROR: {
				console.error(prefix, ...redactedArgs);

				if (this.enableStackTrace) {
					const stack = getStackTrace();
					if (stack) {
						console.error(`  ↳ ${stack}`);
					}
				}
				break;
			}
		}
	}

	debug(...args: unknown[]): void {
		this.log(LogLevel.DEBUG, ...args);
	}

	info(...args: unknown[]): void {
		this.log(LogLevel.INFO, ...args);
	}

	warn(...args: unknown[]): void {
		this.log(LogLevel.WARN, ...args);
	}

	error(...args: unknown[]): void {
		this.log(LogLevel.ERROR, ...args);
	}

	namespaceWith(suffix: string): Logger {
		return new Logger(`${this.namespace}:${suffix}`, this.minLevel, this.enableStackTrace);
	}

	withLevel(level: LogLevel): Logger {
		return new Logger(this.namespace, level, this.enableStackTrace);
	}

	withStackTrace(): Logger {
		return new Logger(this.namespace, this.minLevel, true);
	}
}

function createLogger(namespace: string, minLevel: LogLevel = LogLevel.INFO): Logger {
	return new Logger(namespace, minLevel, false);
}

const DEFAULT_MIN_LEVEL =
	typeof import.meta !== 'undefined' && import.meta.env?.DEV ? LogLevel.DEBUG : LogLevel.INFO;

export const logger = createLogger('app', DEFAULT_MIN_LEVEL);

export function createModuleLogger(namespace: string): Logger {
	return createLogger(namespace, DEFAULT_MIN_LEVEL);
}

export type { Logger };
