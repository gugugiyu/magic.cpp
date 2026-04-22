<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { ChatSettings } from '$lib/components/app';

	const { Story } = defineMeta({
		title: 'Components/ChatSettings',
		component: ChatSettings,
		parameters: {
			layout: 'fullscreen'
		}
	});
</script>

<Story name="Default" />
