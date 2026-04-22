import type { ModelPool } from './pool/model-pool.ts';
import type { Config } from './config.ts';
import { handleV1Models, handleModels } from './handlers/models.ts';
import { handleChat } from './handlers/chat.ts';
import { handleCompact } from './handlers/compact.ts';
import { handleProps } from './handlers/props.ts';
import { handleModelLoad, handleModelUnload } from './handlers/model-ops.ts';
import { handleCorsProxy } from './handlers/cors-proxy.ts';
import { handleHealth } from './handlers/health.ts';
import { serveStatic } from './handlers/static.ts';
import { getDatabase } from './database/index.ts';
import {
	handleGetConversations,
	handleGetConversation,
	handleCreateConversation,
	handleUpdateConversation,
	handleDeleteConversation,
	handleDeleteAllConversations,
	handleGetConversationMessages,
	handleCreateMessage,
	handleForkConversation,
	handleImportConversations,
	handleExportConversations,
	handleCompactConversation
} from './handlers/conversations.ts';
import {
	handleGetMessage,
	handleUpdateMessage,
	handleDeleteMessage,
	handleDeleteMessageCascading
} from './handlers/messages.ts';
import {
	handleListSkills,
	handleCreateSkill,
	handleReadSkill,
	handleUpdateSkill,
	handleDeleteSkill
} from './handlers/skills.ts';
import { handleExecuteTool } from './handlers/tools.ts';

export function createRouter(pool: ModelPool, config: Config) {
	return async function router(req: Request): Promise<Response> {
		try {
			return await dispatchRoute(req, pool, config);
		} catch (err) {
			console.error(`[router] unhandled error in ${req.method} ${new URL(req.url).pathname}:`, err);
			return Response.json(
				{ error: 'Internal server error', detail: (err as Error).message },
				{ status: 500, headers: { 'Content-Type': 'application/json' } },
			);
		}
	};
}

async function dispatchRoute(req: Request, pool: ModelPool, config: Config): Promise<Response> {
	const url = new URL(req.url);
	const { pathname } = url;
	const method = req.method.toUpperCase();

	// API routes
	if (pathname === '/v1/models' && method === 'GET') {
		return handleV1Models(pool);
	}

	if (pathname === '/v1/chat/completions' && method === 'POST') {
		return handleChat(req, pool);
	}

	if (pathname === '/compact' && method === 'POST') {
		return handleCompact(req, pool);
	}

	if (pathname === '/props' && method === 'GET') {
		return handleProps(req, pool);
	}

	if (pathname === '/models' && method === 'GET') {
		return handleModels(req, pool);
	}

	if (pathname === '/models/load' && method === 'POST') {
		return handleModelLoad(req, pool);
	}

	if (pathname === '/models/unload' && method === 'POST') {
		return handleModelUnload(req, pool);
	}

	if (pathname === '/cors-proxy' && (method === 'GET' || method === 'HEAD')) {
		return handleCorsProxy(req);
	}

	if (pathname === '/health' && method === 'GET') {
		return handleHealth(pool);
	}

	// Database API routes
	if (pathname === '/api/conversations' && method === 'GET') {
		return handleGetConversations(getDatabase());
	}

	if (pathname === '/api/conversations' && method === 'POST') {
		return handleCreateConversation(req, getDatabase());
	}

	if (pathname === '/api/conversations' && method === 'DELETE') {
		return handleDeleteAllConversations(getDatabase(), url);
	}

	if (pathname === '/api/conversations/import' && method === 'POST') {
		return handleImportConversations(req, getDatabase());
	}

	if (pathname === '/api/conversations/export' && method === 'GET') {
		return handleExportConversations(getDatabase(), url);
	}

	// Match /api/conversations/:id
	const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
	if (convMatch) {
		const convId = convMatch[1];
		if (method === 'GET') return handleGetConversation(getDatabase(), convId);
		if (method === 'PUT') return handleUpdateConversation(req, getDatabase(), convId);
		if (method === 'DELETE') return handleDeleteConversation(getDatabase(), convId, url);
	}

	// Match /api/conversations/:id/fork
	if (pathname.match(/^\/api\/conversations\/[^/]+\/fork$/) && method === 'POST') {
		const convId = pathname.split('/')[3];
		return handleForkConversation(getDatabase(), convId, req);
	}

	// Match /api/conversations/:id/compact
	if (pathname.match(/^\/api\/conversations\/[^/]+\/compact$/) && method === 'POST') {
		const convId = pathname.split('/')[3];
		return handleCompactConversation(getDatabase(), convId, req);
	}

	// Match /api/conversations/:id/messages
	if (pathname.match(/^\/api\/conversations\/[^/]+\/messages$/)) {
		const convId = pathname.split('/')[3];
		if (method === 'GET') return handleGetConversationMessages(getDatabase(), convId);
		if (method === 'POST') return handleCreateMessage(req, getDatabase(), convId, url);
	}

	// Match /api/messages/:id
	const msgMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
	if (msgMatch) {
		const msgId = msgMatch[1];
		if (method === 'GET') return handleGetMessage(getDatabase(), msgId);
		if (method === 'PUT') return handleUpdateMessage(req, getDatabase(), msgId);
		if (method === 'DELETE') return handleDeleteMessage(getDatabase(), msgId, url);
	}

	// Match /api/messages/:id/delete-cascading
	if (pathname.match(/^\/api\/messages\/[^/]+\/delete-cascading$/) && method === 'POST') {
		const msgId = pathname.split('/')[3];
		return handleDeleteMessageCascading(req, getDatabase(), msgId);
	}

	// Tool execution
	if (pathname === '/api/tools/execute' && method === 'POST') {
		return handleExecuteTool(req, config);
	}

	// Skill API routes
	if (pathname === '/api/skills' && method === 'GET') {
		return handleListSkills(getDatabase());
	}

	if (pathname === '/api/skills' && method === 'POST') {
		return handleCreateSkill(req, getDatabase());
	}

	// Match /api/skills/:name
	const skillMatch = pathname.match(/^\/api\/skills\/([^/]+)$/);
	if (skillMatch) {
		const skillName = skillMatch[1];
		if (method === 'GET') return handleReadSkill(getDatabase(), skillName);
		if (method === 'PUT') return handleUpdateSkill(req, getDatabase(), skillName);
		if (method === 'DELETE') return handleDeleteSkill(getDatabase(), skillName);
	}

	// CORS preflight
	if (method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
				'Access-Control-Allow-Headers': '*',
			},
		});
	}

	// Static file serving + SPA fallback for all unmatched GET requests
	if (method === 'GET') {
		return serveStatic(req, config.resolvedStaticDir);
	}

	return new Response('Method Not Allowed', { status: 405 });
}
