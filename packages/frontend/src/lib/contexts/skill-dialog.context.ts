import { getContext, setContext } from 'svelte';

const SKILL_DIALOG_CONTEXT_KEY = Symbol('skill-dialog-context');

export interface SkillDialogContext {
	open: () => void;
}

export function setSkillDialogContext(ctx: SkillDialogContext): SkillDialogContext {
	return setContext(SKILL_DIALOG_CONTEXT_KEY, ctx);
}

export function getSkillDialogContext(): SkillDialogContext {
	return getContext(SKILL_DIALOG_CONTEXT_KEY);
}
