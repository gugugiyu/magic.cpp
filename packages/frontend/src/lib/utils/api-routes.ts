/**
 * Route URL builder using the shared route tree.
 * Provides type-safe URL generation for API endpoints.
 */

import { apiRoutes, buildRoutes, type CompiledRoute, type RouteDef } from '@shared/types/routes';

const compiledRoutes = buildRoutes(apiRoutes);

/**
 * Cache of route patterns for quick lookup
 */
const routeCache = new Map<string, CompiledRoute>();

/**
 * Find a route by handler key
 */
function findRouteByHandlerKey(handlerKey: string): CompiledRoute | undefined {
	if (routeCache.has(handlerKey)) {
		return routeCache.get(handlerKey);
	}

	const route = compiledRoutes.find((r) => r.handlerKey === handlerKey);
	if (route) {
		routeCache.set(handlerKey, route);
	}
	return route;
}

/**
 * Build a URL path from a route handler key and parameters.
 *
 * @param handlerKey - The handler key from the route tree (e.g., 'getConversation')
 * @param pathParams - Optional path parameters to fill into the route path
 * @param queryParams - Optional query parameters to append
 * @returns The constructed URL path
 *
 * @example
 * ```typescript
 * // Static route
 * routeUrl('getConversations') // '/api/conversations'
 *
 * // Route with path parameters
 * routeUrl('getConversation', { id: '123' }) // '/api/conversations/123'
 *
 * // Route with query parameters
 * routeUrl('exportConversations', undefined, { limit: '10' }) // '/api/conversations/export?limit=10'
 * ```
 */
export function routeUrl(
	handlerKey: string,
	pathParams?: Record<string, string>,
	queryParams?: Record<string, string>
): string {
	const route = findRouteByHandlerKey(handlerKey);

	if (!route) {
		throw new Error(`Route handler '${handlerKey}' not found in route tree`);
	}

	// Helper to find path in the route tree
	function findPath(defs: RouteDef[], targetHandler: string, current = ''): string | null {
		for (const def of defs) {
			const newPath = `${current}/${def.path}`.replace(/\/+/g, '/');

			if (def.methods && Object.values(def.methods).includes(targetHandler)) {
				return newPath;
			}

			if (def.children) {
				const found = findPath(def.children, targetHandler, newPath);
				if (found) return found;
			}
		}
		return null;
	}

	const foundPath = findPath(apiRoutes, handlerKey);
	if (!foundPath) {
		throw new Error(`Could not construct path for handler '${handlerKey}'`);
	}

	// Replace :param with actual values
	let constructedPath = foundPath;
	if (pathParams) {
		for (const [key, value] of Object.entries(pathParams)) {
			constructedPath = constructedPath.replace(`:${key}`, value);
		}
	}

	// Append query parameters if present
	if (queryParams && Object.keys(queryParams).length > 0) {
		const queryString = Object.entries(queryParams)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');
		constructedPath += `?${queryString}`;
	}

	return constructedPath;
}

/**
 * Handler key constants for type-safe route references
 */
export const RouteHandlers = {
	// Conversations
	getConversations: 'getConversations',
	createConversation: 'createConversation',
	deleteAllConversations: 'deleteAllConversations',
	importConversations: 'importConversations',
	exportConversations: 'exportConversations',
	getConversation: 'getConversation',
	updateConversation: 'updateConversation',
	deleteConversation: 'deleteConversation',
	forkConversation: 'forkConversation',
	getMessages: 'getMessages',
	createMessage: 'createMessage',
	getSubagentSessions: 'getSubagentSessions',
	getSubagentMessages: 'getSubagentMessages',

	// Messages
	getMessage: 'getMessage',
	updateMessage: 'updateMessage',
	deleteMessage: 'deleteMessage',
	deleteMessageCascading: 'deleteMessageCascading',

	// Skills
	listSkills: 'listSkills',
	createSkill: 'createSkill',
	readSkill: 'readSkill',
	updateSkill: 'updateSkill',
	deleteSkill: 'deleteSkill',

	// Presets
	listPresets: 'listPresets',
	createPreset: 'createPreset',
	getPreset: 'getPreset',
	updatePreset: 'updatePreset',
	deletePreset: 'deletePreset',

	// Tools
	executeTool: 'executeTool',
	getAllowedCommands: 'getAllowedCommands',

	// File System
	getFileSystem: 'getFileSystem',
	getFileSystemDiff: 'getFileSystemDiff',

	// V1 API
	getV1Models: 'getV1Models',
	handleChat: 'handleChat',

	// Models
	getModels: 'getModels',
	loadModel: 'loadModel',
	unloadModel: 'unloadModel',
	handleCorsProxy: 'handleCorsProxy',
	handleHealth: 'handleHealth'
} as const;

export type RouteHandlerKey = (typeof RouteHandlers)[keyof typeof RouteHandlers];
