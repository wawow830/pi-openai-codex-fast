# pi-openai-codex-fast

Adds **`openai-codex-fast`** to Pi, mirroring the bundled OpenAI Codex models and requesting `service_tier: "priority"`. The normal `openai-codex` provider is unchanged.

## Install

```sh
pi install /path/to/pi-openai-codex-fast
```

Run `/reload`, then `/model` and search for `openai-codex-fast`.

Your existing **OpenAI Codex** login is reused, including locked token refresh. If not signed in, use `/login` → OpenAI Codex. You may also sign in separately via **OpenAI Codex Fast (ChatGPT)**; that credential takes precedence. Credentials are managed by Pi, not copied into this package.

For one invocation:

```sh
pi -e ./index.ts --provider openai-codex-fast --model gpt-5.5
```

## Behavior

- Requests priority service without reducing reasoning effort or changing models.
- Delegates streaming, tools, images, cancellation, transport and usage accounting to Pi's Codex implementation.
- Uses Pi's service-tier pricing adjustment, rather than modifying base model costs.
- Preserves request/response hooks; an explicit payload hook can still override the request.
- Priority availability and actual speed depend on OpenAI and your account. It may consume more quota or cost more; this does not bypass limits or guarantee faster responses.
- Models come from the installed Pi bundled catalog, not custom `openai-codex` model overrides.

Targets the native provider API in `@earendil-works/pi-*` **0.87.1**. Older `@mariozechner` releases are not supported.

## Development

```sh
npm install
npm run typecheck
npm test
```

Tests use fake credentials and mocked transport; they do not make paid model requests.
