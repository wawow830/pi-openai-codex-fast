import { ModelRuntime, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFastProvider } from "./src/provider.ts";

export default async function (pi: ExtensionAPI) {
	const auth = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false });
	pi.registerProvider(createFastProvider(auth));
}
