export class McpSchemaService {
	static normalizeSchemaProperties(schema: Record<string, unknown>): Record<string, unknown> {
		if (!schema || typeof schema !== 'object') {
			return schema;
		}

		const normalized = { ...schema };
		if (normalized.properties && typeof normalized.properties === 'object') {
			const props = normalized.properties as Record<string, Record<string, unknown>>;
			const normalizedProps: Record<string, Record<string, unknown>> = {};
			for (const [key, prop] of Object.entries(props)) {
				if (!prop || typeof prop !== 'object') {
					normalizedProps[key] = prop;
					continue;
				}
				const normalizedProp = { ...prop };
				if (!normalizedProp.type && normalizedProp.default !== undefined) {
					const defaultVal = normalizedProp.default;
					if (typeof defaultVal === 'string') normalizedProp.type = 'string';
					else if (typeof defaultVal === 'number')
						normalizedProp.type = Number.isInteger(defaultVal) ? 'integer' : 'number';
					else if (typeof defaultVal === 'boolean') normalizedProp.type = 'boolean';
					else if (Array.isArray(defaultVal)) normalizedProp.type = 'array';
					else if (typeof defaultVal === 'object' && defaultVal !== null)
						normalizedProp.type = 'object';
				}
				if (normalizedProp.properties)
					Object.assign(
						normalizedProp,
						this.normalizeSchemaProperties(normalizedProp as Record<string, unknown>)
					);
				if (normalizedProp.items && typeof normalizedProp.items === 'object')
					normalizedProp.items = this.normalizeSchemaProperties(
						normalizedProp.items as Record<string, unknown>
					);
				for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
					if (Array.isArray(normalizedProp[combiner])) {
						normalizedProp[combiner] = (normalizedProp[combiner] as Record<string, unknown>[]).map(
							(sub) => this.normalizeSchemaProperties(sub)
						);
					}
				}
				normalizedProps[key] = normalizedProp;
			}
			normalized.properties = normalizedProps;
		}

		for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
			if (Array.isArray(normalized[combiner])) {
				normalized[combiner] = (normalized[combiner] as Record<string, unknown>[]).map((sub) =>
					this.normalizeSchemaProperties(sub)
				);
			}
		}

		return normalized;
	}
}
