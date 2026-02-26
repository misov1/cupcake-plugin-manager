# Cupcake Provider Manager — Sub-Plugin Development Guide

> **Last Updated:** 2026-02-26  
> **CPM Version:** 1.10.9+  
> **RisuAI Compatibility:** V3 (iframe-sandboxed plugins)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Quick Start — Minimal Provider](#3-quick-start--minimal-provider)
4. [File Header (Metadata)](#4-file-header-metadata)
5. [CPM Global API Reference](#5-cpm-global-api-reference)
6. [registerProvider() — Full Spec](#6-registerprovider--full-spec)
7. [Message Formatting Helpers](#7-message-formatting-helpers)
8. [SSE Streaming Helpers](#8-sse-streaming-helpers)
9. [Settings Tab System](#9-settings-tab-system)
10. [Dynamic Model Fetching](#10-dynamic-model-fetching)
11. [Utility Functions](#11-utility-functions)
12. [Non-Provider Extensions](#12-non-provider-extensions)
13. [Deployment & Update Workflow](#13-deployment--update-workflow)
14. [Troubleshooting & Best Practices](#14-troubleshooting--best-practices)

---

## 1. Overview

**Cupcake Provider Manager (CPM)** is a RisuAI V3 plugin that acts as a _meta-framework_ for managing multiple AI provider backends (OpenAI, Anthropic, Gemini, etc.) via **sub-plugins**.

Sub-plugins are standalone `.js` files that run inside CPM's execution context (which itself runs inside RisuAI's sandboxed iframe). Each sub-plugin can:

- **Register an AI provider** with models, a fetcher function, and a settings tab
- **Fetch dynamic model lists** from provider APIs
- **Add UI components** (like the Chat Input Resizer)
- **Use CPM helper functions** for message formatting, SSE parsing, etc.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Provider Manager** (`provider-manager.js`) | The main CPM engine — handles routing, settings UI, update system |
| **Sub-Plugin** (`cpm-*.js`) | A standalone JS file that registers providers/components via `window.CupcakePM` |
| **Update Bundle** (`update-bundle.json`) | A single JSON file containing all sub-plugin versions + embedded code, served via Vercel API |
| **Settings Tab** | Each provider can register a tab in CPM's settings panel |

---

## 2. Architecture

```
RisuAI V3 App
  └─ iframe (about:srcdoc, sandboxed)
       └─ provider-manager.js (CPM engine)
            ├─ window.CupcakePM API exposed
            ├─ SubPluginManager loads installed sub-plugins
            │   ├─ cpm-provider-openai.js
            │   ├─ cpm-provider-anthropic.js
            │   ├─ cpm-provider-gemini.js
            │   └─ ... (eval'd in same context)
            ├─ handleRequest() routes to correct fetcher
            └─ Settings UI renders all registered tabs
```

### Data Flow

1. RisuAI calls `addProvider` callback with `(args, abortSignal)` — the `modelDef` is captured via closure
2. CPM's `handleRequest()` identifies the provider from `modelDef.provider`
3. Looks up `customFetchers[provider]` (registered by sub-plugin)
4. Calls `fetcher(modelDef, messages, temp, maxTokens, args, abortSignal)`
5. Sub-plugin fetches the API, returns `{ success, content }` (string or ReadableStream)
6. **Important:** `handleRequest()` always collects ReadableStream into a plain string before returning (see §6.3 note)

---

## 3. Quick Start — Minimal Provider

The simplest possible provider sub-plugin:

```javascript
// @name CPM Provider - MyProvider
// @version 1.0.0
// @description My custom provider for Cupcake PM
// @icon 🔵
// @update-url https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/cpm-provider-myprovider.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-MyProvider] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'MyProvider',

        // Static model list
        models: [
            { uniqueId: 'myprovider-model-a', id: 'model-a', name: 'Model A' },
            { uniqueId: 'myprovider-model-b', id: 'model-b', name: 'Model B' },
        ],

        // Core fetcher — called when user sends a message with this provider's model
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
            const apiKey = await CPM.safeGetArg('cpm_myprovider_key');
            const formattedMessages = CPM.formatToOpenAI(messages);

            const body = {
                model: modelDef.id,
                messages: formattedMessages,
                temperature: temp,
                max_tokens: maxTokens,
                stream: true,
            };

            const res = await Risuai.nativeFetch('https://api.myprovider.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                return { success: false, content: `[MyProvider Error ${res.status}] ${await res.text()}` };
            }

            // Return SSE stream for OpenAI-compatible APIs
            return { success: true, content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
        },

        // Settings tab in CPM settings panel
        settingsTab: {
            id: 'tab-myprovider',
            icon: '🔵',
            label: 'MyProvider',
            exportKeys: ['cpm_myprovider_key'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">MyProvider Configuration</h3>
                    ${await renderInput('cpm_myprovider_key', 'API Key', 'password')}
                `;
            }
        }
    });
})();
```

---

## 4. File Header (Metadata)

Every sub-plugin **must** include metadata comments at the top. CPM uses `extractMetadata()` to parse these:

```javascript
// @name CPM Provider - MyProvider       // REQUIRED: Display name (must match versions.json key)
// @version 1.0.0                        // REQUIRED: Semver version string
// @description Short description        // Optional: Shown in sub-plugin manager
// @icon 🔵                              // Optional: Emoji icon for sidebar
// @update-url https://raw.git...        // REQUIRED: URL for update system
```

| Tag | Required | Description |
|-----|----------|-------------|
| `@name` | ✅ | Must exactly match the key used in `versions.json` |
| `@version` | ✅ | Semver string (e.g., `1.2.3`). Used for update comparison |
| `@description` | ❌ | Brief description shown in Sub-Plugin Manager tab |
| `@icon` | ❌ | Single emoji, shown in sidebar. Default: `📦` |
| `@update-url` | ✅ | Raw URL to the `.js` file (used as install source key) |

Also supported: `@display-name`, `@api`, `@author` (informational only).

---

## 5. CPM Global API Reference

All sub-plugins access CPM through `window.CupcakePM`:

```javascript
const CPM = window.CupcakePM;
```

### Available Properties & Methods

| API | Type | Description |
|-----|------|-------------|
| `CPM.registerProvider(config)` | Function | Register a provider (see §6) |
| `CPM.formatToOpenAI(messages, config?)` | Function | Format messages for OpenAI API (see §7) |
| `CPM.formatToAnthropic(messages, config?)` | Function | Format messages for Anthropic API (see §7) |
| `CPM.formatToGemini(messages, config?)` | Function | Format messages for Gemini API (see §7) |
| `CPM.createSSEStream(response, lineParser, abortSignal?)` | Function | Create SSE ReadableStream (see §8) |
| `CPM.parseOpenAISSELine(line)` | Function | Parse OpenAI SSE `data:` line → delta text |
| `CPM.createAnthropicSSEStream(response, abortSignal?)` | Function | Create Anthropic SSE stream (handles event types) |
| `CPM.parseGeminiSSELine(line, config?)` | Function | Parse Gemini SSE line → delta text |
| `CPM.collectStream(stream)` | Function | Collect a ReadableStream\<string\> into a single string |
| `CPM.safeGetArg(key, defaultValue?)` | Async Function | Read a plugin argument safely (see §11) |
| `CPM.safeGetBoolArg(key)` | Async Function | Read a boolean plugin argument |
| `CPM.setArg(key, value)` | Function | Write a plugin argument |
| `CPM.smartFetch(url, options?)` | Async Function | 3-strategy fetch: direct → nativeFetch → risuFetch (see §11) |
| `CPM.smartNativeFetch(url, options?)` | Async Function | Alias for `smartFetch` — explicitly named for streaming use |
| `CPM.checkStreamCapability()` | Async Function | Test if ReadableStream can cross iframe bridge |
| `CPM.AwsV4Signer` | Class | AWS Signature V4 signer (for Bedrock) |
| `CPM.addCustomModel(modelDef, tag?)` | Function | Programmatically add a Custom Model |
| `CPM.ensureCopilotApiToken()` | Async Function | Exchange GitHub OAuth for Copilot API token |
| `CPM.hotReload(pluginId)` | Function | Hot-reload a specific sub-plugin |
| `CPM.hotReloadAll()` | Function | Hot-reload all sub-plugins |
| `CPM.vertexTokenCache` | Object | Shared Vertex AI OAuth token cache `{ token, expiry }` |

### RisuAI APIs Available in Context

Since sub-plugins run inside CPM's iframe, you also have access to:

| API | Description |
|-----|-------------|
| `Risuai.nativeFetch(url, options)` | Cross-origin fetch via RisuAI's native bridge |
| `Risuai.risuFetch(url, options)` | RisuAI fetch with special modes (plainFetchForce, etc.) |
| `risuai.setArgument(key, value)` | Persist a plugin argument |
| `Risuai.getArgument(key)` | Read a plugin argument (note: capital `R`) |
| `risuai.pluginStorage` | `.getItem(key)` / `.setItem(key, value)` for persistent storage |

---

## 6. registerProvider() — Full Spec

```javascript
CPM.registerProvider({
    name,              // string — Provider display name (used as routing key)
    models,            // Array<ModelDef> — Static model list
    fetcher,           // async function — Core request handler
    settingsTab,       // Object — Settings tab configuration
    fetchDynamicModels // async function — Optional dynamic model fetching
});
```

### 6.1 `name` (string, required)

The provider name. This is used as:
- The routing key in `customFetchers[name]`
- The `provider` field on each model definition
- Display in settings UI

### 6.2 `models` (Array, required)

Static model list. Each model object:

```javascript
{
    uniqueId: 'provider-model-id',  // Globally unique ID (prefix with provider name)
    id: 'model-id',                 // API model identifier (sent to the API)
    name: 'Display Name'            // Human-readable name shown in UI
}
```

**Important:** `uniqueId` must be globally unique across all providers. Convention: `{provider}-{model-id}`.

### 6.3 `fetcher` (async function, required)

The core request handler. Called when a user sends a message with one of this provider's models.

```javascript
async function fetcher(modelDef, messages, temp, maxTokens, args, abortSignal) {
    // modelDef   — { uniqueId, id, name, provider } — the selected model
    // messages   — Array<{role, content, multimodals?}> — pre-sanitized by CPM
    // temp       — number — temperature (0.0–2.0)
    // maxTokens  — number — max output tokens
    // args       — object — raw RisuAI PluginV2ProviderArgument (prompt_chat, mode, etc.)
    // abortSignal — AbortSignal|undefined — (NOTE: can't be passed to nativeFetch due to iframe bridge)

    // Must return: { success: boolean, content: string | ReadableStream<string> }
}
```

**Return format:**
- `{ success: true, content: ReadableStream }` — Streaming response (sub-plugin may return this)
- `{ success: true, content: "full text" }` — Non-streaming response  
- `{ success: false, content: "[Error] message" }` — Error

> **⚠️ Note:** Even if a sub-plugin returns a `ReadableStream`, CPM's `handleRequest()` **always collects it into a plain string** before returning to RisuAI. This is because RisuAI's `translateLLM` (translation mode) rejects streaming responses and skips cache saving. Since the V3 bridge overrides `mode` to `'v3'`, CPM cannot distinguish translation from chat requests. The result is that chat responses appear all at once (no progressive streaming), which is expected behavior in V3 sandboxed iframe environments.

**Important notes:**
- `messages` are already sanitized by CPM (null filtering, internal tag stripping)
- `abortSignal` cannot be passed to `Risuai.nativeFetch()` — AbortSignal can't cross the V3 iframe bridge (structured clone limitation). Handle abort via the stream's cancel mechanism or check `abortSignal.aborted` in loops.
- Use `CPM.formatToOpenAI(messages)` etc. to convert messages to API-specific format

### 6.4 `settingsTab` (Object, optional)

Registers a tab in CPM's settings panel:

```javascript
{
    id: 'tab-myprovider',        // Unique tab ID
    icon: '🔵',                   // Emoji icon for sidebar button
    label: 'MyProvider',          // Sidebar label text
    exportKeys: ['cpm_key1', 'cpm_key2'],  // Keys included in settings export/import
    renderContent: async (renderInput, lists) => {
        // renderInput — async helper to render form inputs
        // lists — { reasoningList, verbosityList, thinkingList } — common option lists
        return `<h3>My Settings</h3>...`;
    }
}
```

See [§9 Settings Tab System](#9-settings-tab-system) for full details.

### 6.5 `fetchDynamicModels` (async function, optional)

If provided, CPM calls this to fetch the live model list from the provider's API:

```javascript
async function fetchDynamicModels() {
    // Return Array<{uniqueId, id, name}> or null on failure
}
```

This is gated by a per-provider checkbox: `cpm_dynamic_{providerName.toLowerCase()}`. Only runs when the user explicitly enables it.

---

## 7. Message Formatting Helpers

CPM provides pre-built formatters that handle:
- Null/invalid message filtering
- Internal RisuAI tag stripping (`{{inlay::...}}`, `<qak>`)
- Role normalization
- Multimodal content (images, audio)
- System message merging

### 7.1 `formatToOpenAI(messages, config?)`

Formats messages for OpenAI-compatible APIs.

```javascript
const formatted = CPM.formatToOpenAI(messages, {
    mergesys: false,    // Merge all system messages into first user message
    mustuser: false,    // Ensure first message is user/system role
    altrole: false,     // Replace 'assistant' with 'model' (for Gemini-like)
    sysfirst: false,    // Move first system message to position 0
});
// Returns: Array<{role, content, name?}>
```

**Handles multimodals:** If a message has `multimodals` array (images/audio), converts to OpenAI vision/audio format:
```javascript
// Image:
{ type: 'image_url', image_url: { url: 'data:...' } }
// Audio:
{ type: 'input_audio', input_audio: { data: '<base64>', format: 'wav' | 'mp3' } }
```

Example combined output:
```javascript
[
    { type: 'text', text: '...' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
    { type: 'input_audio', input_audio: { data: '...', format: 'mp3' } }
]
```

### 7.2 `formatToAnthropic(messages, config?)`

Formats for Anthropic's Messages API format.

```javascript
const { messages: formattedMsgs, system: systemPrompt } = CPM.formatToAnthropic(messages);
// messages — Array<{role: 'user'|'assistant', content}> (consecutive same-role merged)
// system   — string (all system messages concatenated)
```

Ensures:
- First message is always `user` role (prepends `(Continue)` if needed)
- Consecutive same-role messages are merged
- System messages extracted to separate `system` field

### 7.3 `formatToGemini(messages, config?)`

Formats for Google Gemini API format.

```javascript
const { contents, systemInstruction } = CPM.formatToGemini(messages, {
    preserveSystem: false  // If true, keep system as separate systemInstruction
});
// contents — Array<{role: 'user'|'model', parts: [{text}]}>
// systemInstruction — Array<string>
```

**Default behavior (`preserveSystem: false`):** Merges system instructions into the first user message's parts, then **empties** the `systemInstruction` array (sets `length = 0`). So when using the default, `systemInstruction` will be an empty array.

**With `preserveSystem: true`:** System messages are kept in the `systemInstruction` array and NOT merged into contents.

---

## 8. SSE Streaming Helpers

### 8.1 `createSSEStream(response, lineParser, abortSignal?)`

Generic SSE stream parser. Works with any SSE-format API.

```javascript
const stream = CPM.createSSEStream(response, (line) => {
    // line — raw SSE line (e.g., "data: {...}")
    // Return delta text string, or null to skip
    if (!line.startsWith('data:')) return null;
    const json = JSON.parse(line.slice(5).trim());
    return json.choices?.[0]?.delta?.content || null;
}, abortSignal);
// Returns: ReadableStream<string>
```

### 8.2 `parseOpenAISSELine(line)`

Pre-built parser for OpenAI-compatible SSE:

```javascript
// Extracts: data: {"choices":[{"delta":{"content":"..."}}]}
const stream = CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal);
```

Works with: OpenAI, DeepSeek, OpenRouter, and any OpenAI-compatible endpoint.

### 8.3 `createAnthropicSSEStream(response, abortSignal?)`

Pre-built Anthropic SSE stream (handles `event: content_block_delta` + `data: {...}` pairs):

```javascript
const stream = CPM.createAnthropicSSEStream(res, abortSignal);
```

### 8.4 `parseGeminiSSELine(line, config?)`

Pre-built Gemini SSE parser:

```javascript
const stream = CPM.createSSEStream(res, (line) => CPM.parseGeminiSSELine(line, {
    showThoughtsToken: false,
    useThoughtSignature: false,
}), abortSignal);
```

### 8.5 `collectStream(stream)`

Utility to collect a ReadableStream into a single string:

```javascript
const fullText = await CPM.collectStream(stream);
```

---

## 9. Settings Tab System

### 9.1 `renderContent(renderInput, lists)`

The `renderContent` function receives two arguments:

- **`renderInput`** — An async helper function for rendering form inputs
- **`lists`** — Common option lists: `{ reasoningList, verbosityList, thinkingList }`

### 9.2 `renderInput(id, label, type?, opts?)`

```javascript
await renderInput(id, label, type, opts)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `id` | string | — | Argument key (persisted via `risuai.setArgument`) |
| `label` | string | — | Display label |
| `type` | string | `'text'` | Input type |
| `opts` | Array | `[]` | Options for `select` type |

**Supported types:**

| Type | Renders | Example |
|------|---------|---------|
| `'text'` | Text input | `renderInput('cpm_my_url', 'API URL')` |
| `'password'` | Password field | `renderInput('cpm_my_key', 'API Key', 'password')` |
| `'number'` | Number input | `renderInput('cpm_my_budget', 'Token Budget', 'number')` |
| `'checkbox'` | Checkbox toggle | `renderInput('cpm_my_flag', 'Enable Feature', 'checkbox')` |
| `'select'` | Dropdown select | `renderInput('cpm_my_opt', 'Option', 'select', [{value: 'a', text: 'A'}])` |
| `'textarea'` | Multi-line text | `renderInput('cpm_my_params', 'Custom JSON', 'textarea')` |

**Select options format:**
```javascript
[
    { value: '', text: 'None (Default)' },
    { value: 'low', text: 'Low' },
    { value: 'high', text: 'High' },
]
```

### 9.3 `exportKeys`

Array of argument keys to include in CPM's settings export/import feature:

```javascript
exportKeys: ['cpm_myprovider_key', 'cpm_myprovider_url', 'cpm_dynamic_myprovider']
```

### 9.4 Common Lists

The `lists` parameter provides pre-defined option arrays:

```javascript
renderContent: async (renderInput, lists) => {
    // lists.reasoningList — [{value, text}] for reasoning effort options
    // lists.verbosityList — [{value, text}] for verbosity options
    // lists.thinkingList  — [{value, text}] for thinking budget options
    return `
        ${await renderInput('cpm_my_reasoning', 'Reasoning', 'select', lists.reasoningList)}
    `;
}
```

---

## 10. Dynamic Model Fetching

### Purpose

Instead of hardcoding models, sub-plugins can fetch the live model list from the provider's API at runtime.

### Implementation

```javascript
fetchDynamicModels: async () => {
    try {
        const key = await CPM.safeGetArg('cpm_myprovider_key');
        if (!key) return null;  // No key = can't fetch

        const res = await CPM.smartFetch('https://api.myprovider.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!res.ok) return null;

        const data = await res.json();
        return data.models.map(m => ({
            uniqueId: `myprovider-${m.id}`,
            id: m.id,
            name: m.display_name || m.id
        }));
    } catch (e) {
        console.warn('[CPM-MyProvider] Dynamic model fetch error:', e);
        return null;
    }
}
```

### User Enable/Disable

Dynamic fetching is controlled by a per-provider checkbox. Add this to your settings tab:

```javascript
${await renderInput('cpm_dynamic_myprovider', '📡 Fetch models from API', 'checkbox')}
```

Include `'cpm_dynamic_myprovider'` in your `exportKeys`.

CPM checks `cpm_dynamic_{name.toLowerCase()}` — the name must match your provider's `name` field (lowercased).

---

## 11. Utility Functions

### 11.1 `safeGetArg(key, defaultValue?)`

Safely reads a plugin argument. Returns `defaultValue` (default: `''`) if the key doesn't exist or throws.

```javascript
const apiKey = await CPM.safeGetArg('cpm_myprovider_key');
const budget = await CPM.safeGetArg('cpm_myprovider_budget', '0');
```

### 11.2 `safeGetBoolArg(key, defaultValue?)`

Reads a boolean argument.
- Returns `true` if value is `'true'` or `true`
- Returns `false` if value is `'false'`, `false`, or `''`
- Returns `defaultValue` (default: `false`) for any other value or if key doesn't exist

```javascript
const enabled = await CPM.safeGetBoolArg('cpm_myprovider_caching');
const defaultOn = await CPM.safeGetBoolArg('cpm_myprovider_feature', true);
```

### 11.3 `setArg(key, value)`

Writes an argument value (always stringified):

```javascript
CPM.setArg('cpm_myprovider_model', 'gpt-4o');
```

### 11.4 `smartFetch(url, options?)`

Uses a 3-strategy fallback chain to maximize compatibility:

1. **Strategy 1:** Direct browser `fetch()` from iframe (fastest, avoids proxy)
2. **Strategy 2:** `Risuai.nativeFetch()` via proxy (bypasses CSP, supports streaming)
3. **Strategy 3:** `Risuai.risuFetch(plainFetchForce)` — direct fetch from HOST window (bypasses proxy region blocks)

For POST requests, the body is automatically deep-sanitized before crossing the V3 bridge to prevent null entries.

```javascript
const res = await CPM.smartFetch('https://api.example.com/models', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${key}` }
});
```

**When to use `smartFetch` vs `Risuai.nativeFetch`:**
- `smartFetch` / `smartNativeFetch` — Recommended for all API calls. Handles proxy fallback automatically.
- `Risuai.nativeFetch` — Direct proxy call only. Use when you explicitly want proxy behavior.

### 11.5 `smartNativeFetch(url, options?)`

Alias for `smartFetch`. Explicitly named for streaming use cases where you want to make clear you're expecting a native `Response` object compatible with ReadableStream/SSE.

### 11.6 `addCustomModel(modelDef, tag?)`

Programmatically add a model to CPM's Custom Models Manager:

```javascript
const result = CPM.addCustomModel({
    name: 'My Dynamic Model',
    model: 'model-id',
    url: 'https://api.example.com/v1/chat/completions',
    key: 'sk-...',
    format: 'openai'
}, 'my-plugin-tag');
// Returns: { success, created, uniqueId, error? }
```

### 11.7 `ensureCopilotApiToken()`

Exchanges a stored GitHub OAuth token for a short-lived Copilot API token (cached):

```javascript
const token = await CPM.ensureCopilotApiToken();
```

### 11.8 `AwsV4Signer`

AWS Signature Version 4 signer class for AWS Bedrock API authentication. Used by `cpm-provider-aws.js`.

---

## 12. Non-Provider Extensions

Sub-plugins don't have to be providers. You can create UI components or utilities:

```javascript
// @name CPM Component - My Widget
// @version 1.0.0
// @description A utility widget
// @icon ⚙️
// @update-url https://...

(async () => {
    const risuai = window.risuai || window.Risuai;
    if (!risuai) return;

    // Register as a CupcakePM sub-plugin (for settings UI)
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'my-widget');
    window.CupcakePM_SubPlugins.push({
        id: 'my-widget',
        name: 'My Widget',
        description: 'Does something useful',
        version: '1.0.0',
        icon: '⚙️',
        uiHtml: `<div>Widget settings HTML here</div>`
    });

    // Your component logic here...
})();
```

---

## 13. Deployment & Update Workflow

### 13.1 Repository Structure

```
your-repo/
├── provider-manager.js          # Main CPM engine
├── cpm-provider-openai.js       # OpenAI sub-plugin
├── cpm-provider-anthropic.js    # Anthropic sub-plugin
├── cpm-provider-*.js            # Other providers
├── cpm-chat-resizer.js          # UI component
├── versions.json                # Version manifest
├── update-bundle.json           # ⚠️ BUNDLED versions + code (auto-generated)
├── api/
│   └── update-bundle.js         # Vercel serverless function
├── vercel.json                  # Vercel routing config
└── PLUGIN_GUIDE.md              # This guide
```

### 13.2 versions.json

Maps plugin display names to version + filename:

```json
{
    "CPM Provider - OpenAI": {
        "version": "1.3.0",
        "file": "cpm-provider-openai.js"
    },
    "CPM Provider - Anthropic": {
        "version": "1.4.1",
        "file": "cpm-provider-anthropic.js"
    }
}
```

**The key (`@name`) must exactly match the `@name` metadata in the `.js` file.**

### 13.3 update-bundle.json

This is the **critical file** that the update system reads. It's a single JSON object combining versions and embedded code:

```json
{
    "versions": {
        "CPM Provider - OpenAI": { "version": "1.3.0", "file": "cpm-provider-openai.js" },
        "...": "..."
    },
    "code": {
        "cpm-provider-openai.js": "// @name CPM Provider - OpenAI\n// @version 1.3.0\n...(full file contents)...",
        "...": "..."
    }
}
```

The Vercel API route (`/api/update-bundle`) serves this file directly with CORS headers.

### 13.4 Rebuilding update-bundle.json

**⚠️ You MUST rebuild this file after every sub-plugin code change, or the update won't be detected by users.**

Run this script from the repository root:

```javascript
// rebuild-bundle.js
const fs = require('fs');
const versions = JSON.parse(fs.readFileSync('versions.json', 'utf-8'));
const bundle = { versions: {}, code: {} };

for (const [name, info] of Object.entries(versions)) {
    bundle.versions[name] = { version: info.version, file: info.file };
    bundle.code[info.file] = fs.readFileSync(info.file, 'utf-8');
}

fs.writeFileSync('update-bundle.json', JSON.stringify(bundle));
console.log('update-bundle.json rebuilt with', Object.keys(bundle.code).length, 'files');
```

Or as a one-liner:

```bash
node -e "const fs=require('fs');const v=JSON.parse(fs.readFileSync('versions.json','utf-8'));const b={versions:{},code:{}};for(const[n,i]of Object.entries(v)){b.versions[n]={version:i.version,file:i.file};b.code[i.file]=fs.readFileSync(i.file,'utf-8');}fs.writeFileSync('update-bundle.json',JSON.stringify(b));console.log('Done:',Object.keys(b.code).length,'files')"
```

### 13.5 Complete Update Checklist

When you update a sub-plugin, you must update **4 things**:

| Step | Action | File |
|------|--------|------|
| 1 | Update `@version` in the sub-plugin file header | `cpm-provider-xyz.js` |
| 2 | Update version number in `versions.json` | `versions.json` |
| 3 | **Rebuild `update-bundle.json`** | `update-bundle.json` |
| 4 | Commit and push to GitHub | All changed files |

**Common mistake:** Forgetting step 3. If you only update the `.js` file and `versions.json` but don't rebuild the bundle, the Vercel API will still serve the old code and users won't see the update.

### 13.6 How the Update System Works

1. CPM's `checkAllUpdates()` calls `Risuai.risuFetch()` with `plainFetchForce: true` to fetch `/api/update-bundle` from Vercel
2. Vercel function reads `update-bundle.json` from disk and returns it with CORS headers
3. CPM compares local `plugin.version` against `bundle.versions[plugin.name].version` using semver comparison
4. If remote version is newer, the pre-fetched code from `bundle.code[file]` is available immediately
5. User clicks "Update" → `applyUpdate()` replaces the plugin code in storage and memory

**Why a bundle?** RisuAI's iframe CSP blocks direct `fetch()`. `nativeFetch` goes through proxy2 which caches per-domain (cache poisoning). `risuFetch(plainFetchForce)` works but triggers CORS preflight on raw GitHub. The Vercel API route handles CORS properly, and bundling into one file minimizes requests.

### 13.7 Main Engine (`provider-manager.js`) Updates

The `provider-manager.js` main engine has its own `@update-url` pointing to the Vercel deployment:

```
//@update-url https://cupcake-plugin-manager.vercel.app/provider-manager.js
```

This is separate from the sub-plugin update bundle. RisuAI handles updating the main engine via its native plugin update mechanism (checking `@update-url` + `@version` in the file header). To update the main engine:

1. Update `@version` and `CPM_VERSION` in `provider-manager.js`
2. Ensure the file is deployed to Vercel (via git push)
3. RisuAI will detect the new version on next plugin update check

### 13.8 Vercel API Route

The `api/update-bundle.js` serverless function:

```javascript
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
    // CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Serve the bundle
    const bundlePath = path.join(__dirname, '..', 'update-bundle.json');
    const data = fs.readFileSync(bundlePath, 'utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(data);
};
```

---

## 14. Troubleshooting & Best Practices

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Sub-plugin updates not showing | `update-bundle.json` not rebuilt | Rebuild bundle (§13.4) |
| `CupcakePM API not found!` | Script running before CPM loads | Wrap in `(() => { ... })()` IIFE |
| `nativeFetch` returns cached data | proxy2 cache poisoning | Use `smartFetch` for all API calls |
| `AbortSignal could not be cloned` | AbortSignal can't cross iframe bridge | Don't pass `abortSignal` to `nativeFetch` |
| `Invalid service_tier argument` | Sending invalid/empty service_tier | Validate against known values, skip empty |
| `max_tokens not supported` (newer OpenAI) | Newer models require `max_completion_tokens` | Detect model name, use appropriate param |
| Null messages in API request | V3 iframe bridge JSON round-trip | Filter messages: `.filter(m => m != null)` |
| No progressive streaming in chat | `handleRequest()` always collects streams to strings | By design — needed for translateLLM cache compatibility (§6.3) |
| Proxy 403 on Vertex AI / Google Cloud | nativeFetch proxy blocked by region | `smartFetch` auto-falls back to risuFetch (Strategy 3) |
| `@name` doesn't match versions.json | Name mismatch breaks update detection | Ensure exact string match |

### Best Practices

1. **Always sanitize messages** — Use `CPM.formatToOpenAI()` etc. instead of passing raw messages
2. **Use `safeGetArg` / `safeGetBoolArg`** — Never call `Risuai.getArgument()` directly (it throws on missing keys)
3. **Prefix setting keys** — Use `cpm_{provider}_` prefix to avoid conflicts (e.g., `cpm_openai_key`)
4. **Handle errors gracefully** — Return `{ success: false, content: "[Error] ..." }` instead of throwing
5. **Filter null messages** — Even after formatting, add a final `.filter(m => m != null)` before JSON.stringify
6. **Don't pass AbortSignal to nativeFetch** — It can't be cloned across the iframe bridge
7. **Use IIFE wrapper** — Always wrap sub-plugin code in `(() => { ... })()` to avoid polluting global scope
8. **Use `smartFetch` for all API calls** — It handles proxy fallback and body sanitization automatically
9. **Include dynamic fetch checkbox** — Let users opt-in to server model fetching via `cpm_dynamic_{name}`
10. **Rebuild the bundle** — After ANY code change, always rebuild `update-bundle.json` before pushing
11. **Streams are always collected** — Your fetcher can return ReadableStream, but CPM will collect it to a string before returning to RisuAI

### Version Naming Convention

Follow semantic versioning: `MAJOR.MINOR.PATCH`
- **MAJOR** — Breaking changes (API signature changes, etc.)
- **MINOR** — New features (new models, new settings, etc.)  
- **PATCH** — Bug fixes

---

## Appendix: Complete Example — Anthropic Provider

See [`cpm-provider-anthropic.js`](cpm-provider-anthropic.js) for a full production example that demonstrates:
- Extended model list with date-versioned and latest variants
- Anthropic-specific message formatting (`formatToAnthropic`)
- Extended thinking / adaptive thinking support
- Prompt caching (`cache_control: { type: 'ephemeral' }`)
- Dynamic model fetching with API pagination
- Full settings tab with multiple input types
