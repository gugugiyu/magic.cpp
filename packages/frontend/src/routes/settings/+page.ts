import { goto } from '$app/navigation';
import { browser } from '$app/environment';

export const load = () => {
	if (browser) {
		goto('#/settings/general');
	}
};
