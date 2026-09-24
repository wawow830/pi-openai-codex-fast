import {
	clampThinkingLevel,
	type Models,
	type Provider,
} from "@earendil-works/pi-ai";
import { buildBaseOptions } from "@earendil-works/pi-ai/api/simple-options";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";

export const PROVIDER_ID = "openai-codex-fast";

/** Reuse Codex's protocol, models, OAuth and pricing; only request priority service. */
export function createFastProvider(sharedAuth: Pick<Models, "checkAuth" | "getAuth">): Provider<"openai-codex-responses"> {
	const codex = openaiCodexProvider();

	return {
		...codex,
		id: PROVIDER_ID,
		name: "OpenAI Codex Fast",
		auth: {
			// An explicit /login for this provider takes precedence over the shared login.
			oauth: { ...codex.auth.oauth!, name: "OpenAI Codex Fast (ChatGPT)" },
			apiKey: {
				name: "Existing OpenAI Codex login",
				check: ({ signal }) => sharedAuth.checkAuth(codex.id, { signal }),
				resolve: ({ signal }) => sharedAuth.getAuth(codex.id, { signal }),
			},
		},
		getModels: () => codex.getModels().map((model) => ({
			...model,
			provider: PROVIDER_ID,
			name: `${model.name} (Fast)`,
		})),
		stream: (model, context, options) => codex.stream<"openai-codex-responses">(model, context, {
			...options,
			serviceTier: "priority",
		}),
		streamSimple: (model, context, options) => {
			// Codex's streamSimple drops serviceTier; use its same reasoning conversion
			// and base options, then call the full stream API so pricing also sees it.
			const reasoning = options?.reasoning
				? clampThinkingLevel(model, options.reasoning)
				: undefined;
			return codex.stream(model, context, {
				...buildBaseOptions(model, context, options, options?.apiKey),
				toolChoice: options?.toolChoice,
				reasoningEffort: reasoning === "off" ? undefined : reasoning,
				serviceTier: "priority",
			});
		},
	};
}
