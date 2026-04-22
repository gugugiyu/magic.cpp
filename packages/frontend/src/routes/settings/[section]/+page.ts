import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { SETTINGS_SECTION_SLUGS } from '$lib/constants';

export const load: PageLoad = ({ params }) => {
	const sectionTitle = SETTINGS_SECTION_SLUGS[params.section.toLowerCase()];

	if (!sectionTitle) {
		throw error(404, 'Settings section not found');
	}

	return { section: sectionTitle };
};
