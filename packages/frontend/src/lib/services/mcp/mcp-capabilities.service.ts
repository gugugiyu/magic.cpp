import type { ClientCapabilities, MCPCapabilitiesInfo, ServerCapabilities } from '$lib/types';

export class McpCapabilitiesService {
	static buildCapabilitiesInfo(
		serverCaps?: ServerCapabilities,
		clientCaps?: ClientCapabilities
	): MCPCapabilitiesInfo {
		return {
			server: {
				tools: serverCaps?.tools ? { listChanged: serverCaps.tools.listChanged } : undefined,
				prompts: serverCaps?.prompts ? { listChanged: serverCaps.prompts.listChanged } : undefined,
				resources: serverCaps?.resources
					? {
							subscribe: serverCaps.resources.subscribe,
							listChanged: serverCaps.resources.listChanged
						}
					: undefined,
				logging: !!serverCaps?.logging,
				completions: !!serverCaps?.completions,
				tasks: !!serverCaps?.tasks
			},
			client: {
				roots: clientCaps?.roots ? { listChanged: clientCaps.roots.listChanged } : undefined,
				sampling: !!clientCaps?.sampling,
				elicitation: clientCaps?.elicitation
					? {
							form: !!clientCaps.elicitation.form,
							url: !!clientCaps.elicitation.url
						}
					: undefined,
				tasks: !!clientCaps?.tasks
			}
		};
	}
}
