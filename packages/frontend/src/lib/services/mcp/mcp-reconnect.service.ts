import { MCPService } from './mcp.service';
import {
	createLinkedController,
	isAbortError,
	throwIfAborted,
	createModuleLogger
} from '$lib/utils';
import {
	MCP_RECONNECT_INITIAL_DELAY,
	MCP_RECONNECT_BACKOFF_MULTIPLIER,
	MCP_RECONNECT_MAX_DELAY,
	MCP_RECONNECT_ATTEMPT_TIMEOUT_MS,
	DEFAULT_MCP_CONFIG
} from '$lib/constants';
import { MCPConnectionPhase } from '$lib/enums';
import type { MCPConnection, MCPServerConfig } from '$lib/types';

const logger = createModuleLogger('McpReconnectService');

interface ReconnectCallbacks {
	onPhaseChange?: (phase: MCPConnectionPhase) => void;
	onReconnecting?: (serverName: string) => void;
	onReconnected?: (serverName: string) => void;
	onReconnectFailed?: (serverName: string, error: unknown) => void;
	onToolsChanged?: (serverName: string, tools: unknown[]) => void;
}

interface ReconnectDependencies {
	getConnection: (serverName: string) => MCPConnection | undefined;
	setConnection: (serverName: string, connection: MCPConnection) => void;
	deleteConnection: (serverName: string) => void;
	getServerConfig: (serverName: string) => MCPServerConfig | undefined;
	isReconnecting: (serverName: string) => boolean;
	setReconnecting: (serverName: string, value: boolean) => void;
	getShutdownSignal: () => AbortSignal;
}

export class McpReconnectService {
	static async reconnectServer(
		serverName: string,
		deps: ReconnectDependencies,
		callbacks: ReconnectCallbacks,
		signal?: AbortSignal
	): Promise<MCPConnection> {
		const combinedSignal = createLinkedController(signal, deps.getShutdownSignal()).signal;
		throwIfAborted(combinedSignal);

		const serverConfig = deps.getServerConfig(serverName);
		if (!serverConfig) {
			throw new Error(`[McpReconnectService] No config found for ${serverName}, cannot reconnect`);
		}

		const oldConnection = deps.getConnection(serverName);
		if (oldConnection) {
			await MCPService.disconnect(oldConnection).catch(console.warn);
			deps.deleteConnection(serverName);
		}

		logger.info(`[${serverName}] Session expired, reconnecting with fresh session...`);

		const connection = await MCPService.connect(
			serverName,
			serverConfig,
			DEFAULT_MCP_CONFIG.clientInfo,
			DEFAULT_MCP_CONFIG.capabilities,
			(phase) => {
				callbacks.onPhaseChange?.(phase);
				if (phase === MCPConnectionPhase.DISCONNECTED) {
					logger.info(`[${serverName}] Connection lost, starting auto-reconnect`);
					this.autoReconnect(serverName, deps, callbacks, signal).catch((err) => {
						logger.error(`[${serverName}] Auto-reconnect failed:`, err);
					});
				}
			},
			{
				tools: {
					onChanged: (error: Error | null, tools: unknown[] | null) => {
						if (error) {
							logger.warn(`[${serverName}] Tools list changed error:`, error);
							return;
						}
						callbacks.onToolsChanged?.(serverName, tools ?? []);
					}
				},
				prompts: {
					onChanged: (error: Error | null) => {
						if (error) {
							logger.warn(`[${serverName}] Prompts list changed error:`, error);
						}
					}
				}
			},
			combinedSignal
		);

		deps.setConnection(serverName, connection);
		logger.info(`[${serverName}] Session recovered successfully`);

		return connection;
	}

	static async autoReconnect(
		serverName: string,
		deps: ReconnectDependencies,
		callbacks: ReconnectCallbacks,
		signal?: AbortSignal
	): Promise<void> {
		const combinedSignal = createLinkedController(signal, deps.getShutdownSignal()).signal;
		throwIfAborted(combinedSignal);

		if (deps.isReconnecting(serverName)) {
			logger.info(`[${serverName}] Reconnection already in progress, skipping`);
			return;
		}

		const serverConfig = deps.getServerConfig(serverName);
		if (!serverConfig) {
			logger.error(`No config found for ${serverName}, cannot reconnect`);
			return;
		}

		deps.setReconnecting(serverName, true);
		let backoff = MCP_RECONNECT_INITIAL_DELAY;
		let needsReconnect = false;

		try {
			while (true) {
				await new Promise((resolve) => setTimeout(resolve, backoff));
				throwIfAborted(combinedSignal);

				logger.info(`[${serverName}] Auto-reconnecting...`);

				try {
					const attemptController = createLinkedController(combinedSignal);
					let reconnectTimeoutId: ReturnType<typeof setTimeout>;
					const timeoutPromise = new Promise<never>((_, reject) => {
						reconnectTimeoutId = setTimeout(() => {
							attemptController.abort(
								new Error(`Reconnect attempt timed out after ${MCP_RECONNECT_ATTEMPT_TIMEOUT_MS}ms`)
							);
							reject(
								new Error(`Reconnect attempt timed out after ${MCP_RECONNECT_ATTEMPT_TIMEOUT_MS}ms`)
							);
						}, MCP_RECONNECT_ATTEMPT_TIMEOUT_MS);
					});

					needsReconnect = false;
					const connectPromise = MCPService.connect(
						serverName,
						serverConfig,
						DEFAULT_MCP_CONFIG.clientInfo,
						DEFAULT_MCP_CONFIG.capabilities,
						(phase) => {
							callbacks.onPhaseChange?.(phase);
							if (phase === MCPConnectionPhase.DISCONNECTED) {
								if (deps.isReconnecting(serverName)) {
									needsReconnect = true;
								} else {
									logger.info(`[${serverName}] Connection lost, restarting auto-reconnect`);
									this.autoReconnect(serverName, deps, callbacks, signal).catch((err) => {
										logger.error(`[${serverName}] Auto-reconnect failed:`, err);
									});
								}
							}
						},
						{
							tools: {
								onChanged: (error: Error | null, tools: unknown[] | null) => {
									if (error) {
										logger.warn(`[${serverName}] Tools list changed error:`, error);
										return;
									}
									callbacks.onToolsChanged?.(serverName, tools ?? []);
								}
							},
							prompts: {
								onChanged: (error: Error | null) => {
									if (error) {
										logger.warn(`[${serverName}] Prompts list changed error:`, error);
									}
								}
							}
						},
						attemptController.signal
					);

					const connection = await Promise.race([connectPromise, timeoutPromise]);
					clearTimeout(reconnectTimeoutId!);
					connectPromise.catch(() => {});

					deps.setConnection(serverName, connection);
					callbacks.onReconnected?.(serverName);
					logger.info(`[${serverName}] Reconnected successfully`);
					break;
				} catch (error) {
					if (isAbortError(error) && combinedSignal.aborted) throw error;
					logger.warn(`[${serverName}] Reconnection failed:`, error);
					callbacks.onReconnectFailed?.(serverName, error);
					backoff = Math.min(backoff * MCP_RECONNECT_BACKOFF_MULTIPLIER, MCP_RECONNECT_MAX_DELAY);
				}
			}
		} finally {
			deps.setReconnecting(serverName, false);
			if (needsReconnect) {
				logger.info(`[${serverName}] Deferred disconnect detected, restarting auto-reconnect`);
				this.autoReconnect(serverName, deps, callbacks, signal).catch((err) => {
					logger.error(`[${serverName}] Auto-reconnect failed:`, err);
				});
			}
		}
	}
}
