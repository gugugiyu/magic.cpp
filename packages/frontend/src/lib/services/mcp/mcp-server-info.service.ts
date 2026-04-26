import { HealthCheckStatus } from '$lib/enums';
import type { MCPConnection } from '$lib/types';

interface ServerStatus {
	name: string;
	isConnected: boolean;
	toolCount: number;
	error: string | undefined;
}

interface HealthCheckState {
	status: string;
	serverInfo?: { title?: string; name?: string };
	instructions?: string;
}

export class McpServerInfoService {
	static getServersStatus(connections: Map<string, MCPConnection>): ServerStatus[] {
		const statuses: ServerStatus[] = [];

		for (const [name, connection] of connections) {
			statuses.push({
				name,
				isConnected: true,
				toolCount: connection.tools.length,
				error: undefined
			});
		}

		return statuses;
	}

	static getServerInstructions(
		connections: Map<string, MCPConnection>
	): Array<{ serverName: string; serverTitle?: string; instructions: string }> {
		const results: Array<{
			serverName: string;
			serverTitle?: string;
			instructions: string;
		}> = [];

		for (const [serverName, connection] of connections) {
			if (connection.instructions) {
				results.push({
					serverName,
					serverTitle: connection.serverInfo?.title || connection.serverInfo?.name,
					instructions: connection.instructions
				});
			}
		}

		return results;
	}

	static hasServerInstructions(connections: Map<string, MCPConnection>): boolean {
		for (const connection of connections.values()) {
			if (connection.instructions) {
				return true;
			}
		}
		return false;
	}

	static getHealthCheckInstructions(
		healthChecks: Record<string, HealthCheckState>
	): Array<{ serverId: string; serverTitle?: string; instructions: string }> {
		const results: Array<{
			serverId: string;
			serverTitle?: string;
			instructions: string;
		}> = [];

		for (const [serverId, state] of Object.entries(healthChecks)) {
			if (state.status === HealthCheckStatus.SUCCESS && state.instructions) {
				results.push({
					serverId,
					serverTitle: state.serverInfo?.title || state.serverInfo?.name,
					instructions: state.instructions
				});
			}
		}

		return results;
	}
}
