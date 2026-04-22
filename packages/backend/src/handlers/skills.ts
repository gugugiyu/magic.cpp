/**
 * HTTP handlers for skill CRUD operations.
 *
 * Endpoints:
 *   GET    /api/skills          — List all skills
 *   POST   /api/skills          — Create a new skill
 *   GET    /api/skills/:name    — Read a single skill
 *   PUT    /api/skills/:name    — Update an existing skill
 *   DELETE /api/skills/:name    — Delete a skill
 */

import type { DrizzleDB } from '../database/index.ts';
import { sanitizeSkillName, SKILL_MAX_CONTENT_BYTES } from '#shared/constants/skills';
import {
	listAllSkills,
	readSkill,
	createSkill,
	updateSkill,
	deleteSkill
} from '../services/skill-io.ts';

export async function handleListSkills(_db: DrizzleDB): Promise<Response> {
	try {
		const skills = await listAllSkills();
		return Response.json(skills, {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return Response.json(
			{ error: 'Failed to list skills', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleCreateSkill(req: Request, _db: DrizzleDB): Promise<Response> {
	try {
		const body = await req.json();
		const { name, content } = body as { name?: string; content?: string };

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return Response.json(
				{ error: 'Missing or invalid "name" field (string required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (!content || typeof content !== 'string') {
			return Response.json(
				{ error: 'Missing or invalid "content" field (string required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const MAX_SKILL_SIZE = SKILL_MAX_CONTENT_BYTES;
		if (Buffer.byteLength(content, 'utf-8') > MAX_SKILL_SIZE) {
			return Response.json(
				{ error: 'Skill content exceeds maximum size of 1MB' },
				{ status: 413, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const sanitizedName = sanitizeSkillName(name.trim());
		const skill = await createSkill(sanitizedName, content);
		return Response.json(skill, {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = (err as Error).message;
		if (message.includes('already exists')) {
			return Response.json(
				{ error: 'Conflict', detail: message },
				{ status: 409, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return Response.json(
			{ error: 'Failed to create skill', detail: message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleReadSkill(_db: DrizzleDB, name: string): Promise<Response> {
	try {
		const skill = await readSkill(name);
		if (!skill) {
			return Response.json(
				{ error: 'Not found', detail: `Skill "${name}" does not exist` },
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return Response.json(skill, {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return Response.json(
			{ error: 'Failed to read skill', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleUpdateSkill(req: Request, _db: DrizzleDB, name: string): Promise<Response> {
	try {
		const body = await req.json();
		const { content } = body as { content?: string };

		if (!content || typeof content !== 'string') {
			return Response.json(
				{ error: 'Missing or invalid "content" field (string required)' },
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const MAX_SKILL_SIZE = SKILL_MAX_CONTENT_BYTES;
		if (Buffer.byteLength(content, 'utf-8') > MAX_SKILL_SIZE) {
			return Response.json(
				{ error: 'Skill content exceeds maximum size of 1MB' },
				{ status: 413, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const sanitizedName = sanitizeSkillName(name);
		const skill = await updateSkill(sanitizedName, content);
		return Response.json(skill, {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = (err as Error).message;
		if (message.includes('does not exist')) {
			return Response.json(
				{ error: 'Not found', detail: message },
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return Response.json(
			{ error: 'Failed to update skill', detail: message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export async function handleDeleteSkill(_db: DrizzleDB, name: string): Promise<Response> {
	try {
		const deleted = await deleteSkill(name);
		if (!deleted) {
			return Response.json(
				{ error: 'Not found', detail: `Skill "${name}" does not exist` },
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}
		return new Response(null, { status: 204 });
	} catch (err) {
		return Response.json(
			{ error: 'Failed to delete skill', detail: (err as Error).message },
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
