/* =============================================================================
 * Zero-dependency colorized logger
 * =============================================================================
 * Human-readable terminal output with ANSI colors.  No JSON mode, no
 * third-party dependencies.  Respects LOG_LEVEL env var, NO_COLOR, and
 * config.toml `logLevel`.
 * ============================================================================= */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
};

/* -------------------------------------------------------------------------- */
/* ANSI helpers                                                               */
/* -------------------------------------------------------------------------- */

const isTTY = typeof process !== 'undefined' && process.stdout?.isTTY === true;
const noColor = typeof process !== 'undefined' && process.env.NO_COLOR !== undefined;
const useColor = isTTY && !noColor;

function ansi(code: string | number): string {
	return `\x1b[${code}m`;
}

const C = {
	reset: ansi(0),
	bold: ansi(1),
	dim: ansi(2),
	italic: ansi(3),
	underline: ansi(4),

	black: ansi(30),
	red: ansi(31),
	green: ansi(32),
	yellow: ansi(33),
	blue: ansi(34),
	magenta: ansi(35),
	cyan: ansi(36),
	white: ansi(37),
	gray: ansi(90),

	brightRed: ansi(91),
	brightGreen: ansi(92),
	brightYellow: ansi(93),
	brightBlue: ansi(94),
	brightMagenta: ansi(95),
	brightCyan: ansi(96),
	brightWhite: ansi(97),
};

function colorize(text: string, codes: string[]): string {
	if (!useColor) return text;
	return codes.join('') + text + C.reset;
}

/* -------------------------------------------------------------------------- */
/* Level badges & namespace colours                                           */
/* -------------------------------------------------------------------------- */

const LEVEL_STYLE: Record<LogLevel, { badge: string; codes: string[] }> = {
	trace: { badge: 'TRACE', codes: [C.dim, C.gray] },
	debug: { badge: 'DEBUG', codes: [C.dim, C.gray] },
	info:  { badge: 'INFO ', codes: [C.green] },
	warn:  { badge: 'WARN ', codes: [C.yellow] },
	error: { badge: 'ERROR', codes: [C.bold, C.red] },
};

const NAMESPACE_COLORS: Record<string, string[]> = {
	server: [C.cyan],
	startup: [C.brightGreen],
	config: [C.magenta],
	'config-watcher': [C.brightMagenta],
	database: [C.blue],
	'model-pool': [C.brightBlue],
	heartbeat: [C.brightYellow],
	chat: [C.brightCyan],
	streaming: [C.brightWhite],
	proxy: [C.brightYellow],
	'cors-proxy': [C.brightCyan],
	api: [C.white],
	compact: [C.brightMagenta],
	'skill-io': [C.brightGreen],
	filesystem: [C.blue],
	router: [C.brightBlue],
	models: [C.brightBlue],
	props: [C.brightMagenta],
	'model-ops': [C.brightYellow],
	tools: [C.brightCyan],
};

function getNamespaceColor(namespace: string): string[] {
	return NAMESPACE_COLORS[namespace] ?? [C.gray];
}

/* -------------------------------------------------------------------------- */
/* Logger implementation                                                      */
/* -------------------------------------------------------------------------- */

interface LoggerOptions {
	level: LogLevel;
	colors: boolean;
	timestamps: boolean;
}

class Logger {
	constructor(
		private namespace: string,
		private opts: LoggerOptions,
	) {}

	trace(msg: string, ...args: unknown[]) {
		this.emit('trace', msg, args);
	}
	debug(msg: string, ...args: unknown[]) {
		this.emit('debug', msg, args);
	}
	info(msg: string, ...args: unknown[]) {
		this.emit('info', msg, args);
	}
	warn(msg: string, ...args: unknown[]) {
		this.emit('warn', msg, args);
	}
	// Overload so we can pass raw Error objects easily
	error(msg: string, ...args: unknown[]) {
		this.emit('error', msg, args);
	}

	private emit(level: LogLevel, msg: string, args: unknown[]) {
		if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.opts.level]) {
			return;
		}

		const parts: string[] = [];

		// Timestamp
		if (this.opts.timestamps) {
			const now = new Date();
			const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
			parts.push(colorize(ts, [C.dim, C.gray]));
		}

		// Level badge
		const style = LEVEL_STYLE[level];
		parts.push(colorize(style.badge, style.codes));

		// Namespace
		const ns = `[${this.namespace}]`.padEnd(18, ' ');
		parts.push(colorize(ns, getNamespaceColor(this.namespace)));

		// Message + args
		let message = msg;
		if (args.length > 0) {
			message += ' ' + args.map((a) => (typeof a === 'string' ? a : formatArg(a))).join(' ');
		}
		parts.push(message);

		const line = parts.join('  ');

		if (level === 'error') {
			// eslint-disable-next-line no-console
			console.error(line);
		} else if (level === 'warn') {
			// eslint-disable-next-line no-console
			console.warn(line);
		} else {
			// eslint-disable-next-line no-console
			console.log(line);
		}
	}
}

function formatArg(arg: unknown): string {
	if (arg instanceof Error) {
		return arg.stack || arg.message;
	}
	if (typeof arg === 'object') {
		try {
			return JSON.stringify(arg);
		} catch {
			return String(arg);
		}
	}
	return String(arg);
}

/* -------------------------------------------------------------------------- */
/* Global state                                                               */
/* -------------------------------------------------------------------------- */

let globalLevel: LogLevel = resolveLevel(process.env.LOG_LEVEL);
let globalColors = useColor;
let globalTimestamps = process.env.LOG_TIMESTAMP === '1';

function resolveLevel(raw: string | undefined): LogLevel {
	if (!raw) return 'info';
	const lvl = raw.toLowerCase().trim();
	if (lvl in LEVEL_PRIORITY) return lvl as LogLevel;
	return 'info';
}

export function createLogger(namespace: string): Logger {
	return new Logger(namespace, {
		level: globalLevel,
		colors: globalColors,
		timestamps: globalTimestamps,
	});
}

export function setLogLevel(level: LogLevel) {
	globalLevel = level;
}

export function setColors(enabled: boolean) {
	globalColors = enabled;
}

export function setTimestamps(enabled: boolean) {
	globalTimestamps = enabled;
}

/** Configure logger from Config object + env (called once at startup). */
export function configureLogger(opts: {
	level?: LogLevel;
	colors?: boolean;
	timestamps?: boolean;
}) {
	if (opts.level) globalLevel = opts.level;
	if (opts.colors !== undefined) globalColors = opts.colors;
	if (opts.timestamps !== undefined) globalTimestamps = opts.timestamps;
}

/** Small helper for the pretty ASCII boxes in index.ts. */
export function box(title: string, lines: string[], borderColor: string[] = [C.magenta]): void {
	const width = 59;
	const top = '╔' + '═'.repeat(width) + '╗';
	const bottom = '╚' + '═'.repeat(width) + '╝';
	const empty = '║' + ' '.repeat(width) + '║';

	const print = (text: string) => {
		if (useColor) {
			// eslint-disable-next-line no-console
			console.error(colorize(text, borderColor));
		} else {
			// eslint-disable-next-line no-console
			console.error(text);
		}
	};

	print(top);
	print(empty);
	print('║  ' + title.padEnd(width - 2, ' ') + '  ║');
	print(empty);
	for (const line of lines) {
		print('║  ' + line.padEnd(width - 2, ' ') + '  ║');
	}
	print(empty);
	print(bottom);
}
