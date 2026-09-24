import assert from "node:assert/strict";
import test from "node:test";
import { createModels, normalizeContext, type Models, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { createFastProvider, PROVIDER_ID } from "../src/provider.ts";

const token = `test.${Buffer.from(JSON.stringify({
	"https://api.openai.com/auth": { chatgpt_account_id: "test-account" },
})).toString("base64url")}.signature`;
const sharedAuth: Pick<Models, "checkAuth" | "getAuth"> = {
	checkAuth: async () => ({ type: "oauth", source: "OAuth" }),
	getAuth: async () => ({ auth: { apiKey: token }, source: "OAuth" }),
};
const provider = createFastProvider(sharedAuth);
const model = provider.getModels().find((model) => model.id === "gpt-5.5")!;
const context = normalizeContext({ messages: [{ role: "user", content: "Hello", timestamp: 0 }] });

function completedResponse(serviceTier?: string) {
	const events = [{
		type: "response.output_item.done", output_index: 0,
		item: {
			type: "message", id: "msg_test", role: "assistant", status: "completed",
			content: [{ type: "output_text", text: "Hello 🌍", annotations: [] }],
		},
	}, {
		type: "response.completed",
		response: {
			id: "resp_test",
			status: "completed",
			service_tier: serviceTier,
			output: [{
				type: "message", id: "msg_test", role: "assistant", status: "completed",
				content: [{ type: "output_text", text: "Hello 🌍", annotations: [] }],
			}],
			usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 0 } },
		},
	}];
	return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
		headers: { "content-type": "text/event-stream" },
	});
}

function options(extra: SimpleStreamOptions = {}): SimpleStreamOptions {
	return { apiKey: token, transport: "sse", maxRetries: 0, fetch: async () => completedResponse(), ...extra };
}

test("mirrors all Codex metadata without mutating the original provider", () => {
	const original = openaiCodexProvider().getModels();
	assert.ok(original.length > 0);
	assert.equal(provider.id, PROVIDER_ID);
	assert.deepEqual(provider.getModels(), original.map((model) => ({
		...model, provider: PROVIDER_ID, name: `${model.name} (Fast)`,
	})));
	assert.ok(original.every((model) => model.provider === "openai-codex"));
});

test("reuses existing login and forwards cancellation to auth resolution", async () => {
	const signal = new AbortController().signal;
	const alias = createFastProvider({
		checkAuth: async (id, options) => {
			assert.equal(id, "openai-codex");
			assert.equal(options?.signal, signal);
			return { type: "oauth" };
		},
		getAuth: async (id, options) => {
			assert.equal(id, "openai-codex");
			assert.equal(options?.signal, signal);
			return { auth: { apiKey: token } };
		},
	});
	const runtime = createModels();
	runtime.setProvider(alias);
	assert.equal((await runtime.checkAuth(PROVIDER_ID, { signal }))?.type, "oauth");
	assert.equal((await runtime.getAuth(PROVIDER_ID, { signal }))?.auth.apiKey, token);
});

test("no existing login leaves the provider unavailable", async () => {
	const runtime = createModels();
	runtime.setProvider(createFastProvider({ checkAuth: async () => undefined, getAuth: async () => undefined }));
	assert.deepEqual(await runtime.getAvailable(), []);
	assert.equal(await runtime.getAuth(PROVIDER_ID), undefined);
	assert.equal(typeof provider.auth.oauth?.login, "function");
});

for (const full of [false, true]) {
	test(`${full ? "full" : "simple"} streaming requests priority and preserves hooks`, async () => {
		let payloadSeen = false;
		let responseSeen = false;
		const config = options({
			onPayload: (payload, actualModel) => {
				assert.equal((payload as { service_tier: string }).service_tier, "priority");
				assert.equal(actualModel.provider, PROVIDER_ID);
				payloadSeen = true;
			},
			onResponse: (response) => { assert.equal(response.status, 200); responseSeen = true; },
		});
		const stream = full
			? provider.stream(model, context, { ...config, serviceTier: "flex" })
			: provider.streamSimple(model, context, config);
		const result = await stream.result();
		assert.equal(result.stopReason, "stop", result.errorMessage);
		assert.equal(result.content[0]?.type, "text");
		assert.equal(result.content[0]?.type === "text" && result.content[0].text, "Hello 🌍");
		assert.equal(result.provider, PROVIDER_ID);
		assert.equal(result.usage.input, 100);
		assert.equal(result.usage.output, 10);
		assert.equal(result.usage.cost.input, 100 / 1e6 * model.cost.input * 2.5);
		assert.ok(payloadSeen && responseSeen);
	});
}

for (const reasoning of [undefined, "low", "high", "xhigh"] as const) {
	test(`preserves ${reasoning} thinking conversion from ordinary Codex`, async () => {
		const payloads: Record<string, unknown>[] = [];
		const config = options({ reasoning, onPayload: (payload) => { payloads.push(payload as Record<string, unknown>); } });
		await provider.streamSimple(model, context, config).result();
		const codex = openaiCodexProvider();
		await codex.streamSimple(codex.getModels().find((m) => m.id === model.id)!, context, config).result();
		assert.equal(payloads.length, 2);
		const { service_tier, ...fast } = payloads[0];
		assert.equal(service_tier, "priority");
		assert.deepEqual(fast, payloads[1]);
	});
}

test("pre-aborted requests terminate without transport", async () => {
	const result = await provider.streamSimple(model, context, options({
		signal: AbortSignal.abort(),
		fetch: async () => { assert.fail("must not fetch"); },
	})).result();
	assert.equal(result.stopReason, "aborted");
});

test("malformed responses produce an error", async () => {
	const result = await provider.streamSimple(model, context, options({
		fetch: async () => new Response("data: not-json\n\n"),
	})).result();
	assert.equal(result.stopReason, "error");
	assert.match(result.errorMessage!, /Invalid Codex SSE JSON/);
});
