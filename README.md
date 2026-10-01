# Model Connection Kit

A reusable React component library for configuring AI model providers, authentication, and model selection.

> Status: early design and scaffolding. The public API is not stable and the package is not ready for use.

## Goals

- Keep the React UI independent from any specific AI runtime.
- Support OAuth/subscription login, API keys, ambient credentials, and custom OpenAI-compatible endpoints.
- Keep API keys and OAuth tokens out of component values and save callbacks.
- Provide Pi AI through an optional adapter instead of making it a core dependency.

## Architecture

```text
React settings UI
        ↓
ModelSettingsAdapter
        ↓
Pi AI adapter / backend adapter / mock adapter
        ↓
Model provider
```

The detailed architecture, contracts, security boundaries, and staged implementation plan are documented in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md).

## Current state

- TypeScript and Vite library structure with locked dependencies
- Verified ESM dual-entry build, declarations, and standalone CSS output
- Public adapter contracts with non-secret discriminated selections
- Catalog normalization, capability filtering, and compile-time safety tests
- In-memory mock adapter with latency, failure, prompt/event, and cancellation simulation
- Minimal three-flow React settings panel and browser demo
- Development plan reviewed against Pi AI's authentication model
- Pi AI and production runtime adapters are not implemented yet

## License

MIT
