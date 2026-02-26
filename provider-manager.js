//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.10.15
//@update-url https://cupcake-plugin-manager.vercel.app/provider-manager.js

const CPM_VERSION = '1.10.15';

// ==========================================
// 1. ARGUMENT SCHEMAS (Saved Natively by RisuAI)
// ==========================================

// --- Slot Assignments ---
//@arg cpm_slot_translation string 번역 보조 모델
//@arg cpm_slot_emotion string 감정 보조 모델
//@arg cpm_slot_memory string 메모리 보조 모델
//@arg cpm_slot_other string 기타(유틸) 보조 모델

// --- Global Provider Configs ---
// OpenAI
//@arg cpm_openai_url string OpenAI Base URL
//@arg cpm_openai_key string OpenAI API Key
//@arg cpm_openai_model string OpenAI Model
//@arg cpm_openai_reasoning string OpenAI Reasoning Effort (none, low, medium, high)
//@arg cpm_openai_verbosity string OpenAI Verbosity (none, low, medium, high)
// Anthropic
//@arg cpm_anthropic_url string Anthropic Base URL
//@arg cpm_anthropic_key string Anthropic API Key
//@arg cpm_anthropic_model string Anthropic Model
//@arg cpm_anthropic_thinking_budget int Anthropic Thinking Budget
// Gemini
//@arg cpm_gemini_key string Gemini API Key
//@arg cpm_gemini_model string Gemini Model
//@arg cpm_gemini_thinking_level string Gemini Thinking Level (off, MINIMAL, LOW, MEDIUM, HIGH)
// Vertex
//@arg cpm_vertex_key_json string Vertex Service Account JSON
//@arg cpm_vertex_location string Vertex Location (e.g. us-central1, global)
//@arg cpm_vertex_model string Vertex Model
//@arg cpm_vertex_thinking_level string Vertex Thinking Level (off, MINIMAL, LOW, MEDIUM, HIGH)
// AWS Bedrock
//@arg cpm_aws_key string AWS Access Key
//@arg cpm_aws_secret string AWS Secret Access Key
//@arg cpm_aws_region string AWS Region
// DeepSeek
//@arg cpm_deepseek_url string DeepSeek Base URL
//@arg cpm_deepseek_key string DeepSeek API Key
//@arg cpm_deepseek_model string DeepSeek Model
// OpenRouter
//@arg cpm_openrouter_url string OpenRouter Base URL
//@arg cpm_openrouter_key string OpenRouter API Key
//@arg cpm_openrouter_model string OpenRouter Model
//@arg cpm_openrouter_reasoning string OpenRouter Reasoning Effort (none, low, medium, high)
//@arg cpm_openrouter_provider string OpenRouter Provider String (e.g., Hyperbolic)

// --- Dynamic Custom Models JSON Storage ---
//@arg cpm_custom_models string Custom Models JSON Array (DO NOT EDIT MANUALLY)

// --- Global Tool Configs ---
//@arg tools_githubCopilotToken string GitHub Copilot Token

// --- AWS Configs ---
//@arg cpm_aws_key string AWS Access Key
//@arg cpm_aws_secret string AWS Secret Access Key
//@arg cpm_aws_region string AWS Region

// --- Global Chat Configs ---
//@arg chat_claude_caching string Claude Caching (true/false)
//@arg chat_claude_cachingBreakpoints string Claude Caching Breakpoints (e.g., 1000,2000)
//@arg chat_claude_cachingMaxExtension string Claude Caching Max Extension (e.g., 500)
//@arg chat_gemini_preserveSystem string Gemini Preserve System Prompt (true/false)
//@arg chat_gemini_showThoughtsToken string Gemini Show Thoughts Token (true/false)
//@arg chat_gemini_useThoughtSignature string Gemini Use Thought Signature (true/false)
//@arg chat_gemini_usePlainFetch string Gemini Use Plain Fetch (true/false)
//@arg common_openai_servicetier string OpenAI Service Tier (Auto, Flex, Default)

// ==========================================
// 1.5 AWS V4 SIGNER
// ==========================================
const encoder = new TextEncoder(); const HOST_SERVICES = { appstream2: "appstream", cloudhsmv2: "cloudhsm", email: "ses", marketplace: "aws-marketplace", mobile: "AWSMobileHubService", pinpoint: "mobiletargeting", queue: "sqs", "git-codecommit": "codecommit", "mturk-requester-sandbox": "mturk-requester", "personalize-runtime": "personalize" }; const UNSIGNABLE_HEADERS = new Set(["authorization", "content-type", "content-length", "user-agent", "presigned-expires", "expect", "x-amzn-trace-id", "range", "connection"]); class AwsV4Signer { constructor({ method, url, headers, body, accessKeyId, secretAccessKey, sessionToken, service, region, cache, datetime, signQuery, appendSessionToken, allHeaders, singleEncode }) { if (url == null) throw new TypeError("url is a required option"); if (accessKeyId == null) throw new TypeError("accessKeyId is a required option"); if (secretAccessKey == null) throw new TypeError("secretAccessKey is a required option"); this.method = method || (body ? "POST" : "GET"); this.url = new URL(url); this.headers = new Headers(headers || {}); this.body = body; this.accessKeyId = accessKeyId; this.secretAccessKey = secretAccessKey; this.sessionToken = sessionToken; let guessedService, guessedRegion; if (!service || !region) { [guessedService, guessedRegion] = guessServiceRegion(this.url, this.headers); } this.service = service || guessedService || ""; this.region = region || guessedRegion || "us-east-1"; this.cache = cache || new Map(); this.datetime = datetime || new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); this.signQuery = signQuery; this.appendSessionToken = appendSessionToken || this.service === "iotdevicegateway"; this.headers.delete("Host"); if (this.service === "s3" && !this.signQuery && !this.headers.has("X-Amz-Content-Sha256")) { this.headers.set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"); } const params = this.signQuery ? this.url.searchParams : this.headers; params.set("X-Amz-Date", this.datetime); if (this.sessionToken && !this.appendSessionToken) { params.set("X-Amz-Security-Token", this.sessionToken); } this.signableHeaders = ["host", ...this.headers.keys()].filter((header) => allHeaders || !UNSIGNABLE_HEADERS.has(header)).sort(); this.signedHeaders = this.signableHeaders.join(";"); this.canonicalHeaders = this.signableHeaders.map((header) => header + ":" + (header === "host" ? this.url.host : (this.headers.get(header) || "").replace(/\s+/g, " "))).join("\n"); this.credentialString = [this.datetime.slice(0, 8), this.region, this.service, "aws4_request"].join("/"); if (this.signQuery) { if (this.service === "s3" && !params.has("X-Amz-Expires")) { params.set("X-Amz-Expires", "86400"); } params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256"); params.set("X-Amz-Credential", this.accessKeyId + "/" + this.credentialString); params.set("X-Amz-SignedHeaders", this.signedHeaders); } if (this.service === "s3") { try { this.encodedPath = decodeURIComponent(this.url.pathname.replace(/\+/g, " ")); } catch (e) { this.encodedPath = this.url.pathname; } } else { this.encodedPath = this.url.pathname.replace(/\/+/g, "/"); } if (!singleEncode) { this.encodedPath = encodeURIComponent(this.encodedPath).replace(/%2F/g, "/"); } this.encodedPath = encodeRfc3986(this.encodedPath); const seenKeys = new Set(); this.encodedSearch = [...this.url.searchParams].filter(([k]) => { if (!k) return false; if (this.service === "s3") { if (seenKeys.has(k)) return false; seenKeys.add(k); } return true }).map((pair) => pair.map((p2) => encodeRfc3986(encodeURIComponent(p2)))).sort(([k1, v1], [k2, v2]) => k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0).map((pair) => pair.join("=")).join("&"); } async sign() { if (this.signQuery) { this.url.searchParams.set("X-Amz-Signature", await this.signature()); if (this.sessionToken && this.appendSessionToken) { this.url.searchParams.set("X-Amz-Security-Token", this.sessionToken); } } else { this.headers.set("Authorization", await this.authHeader()); } return { method: this.method, url: this.url, headers: this.headers, body: this.body } } async authHeader() { return ["AWS4-HMAC-SHA256 Credential=" + this.accessKeyId + "/" + this.credentialString, "SignedHeaders=" + this.signedHeaders, "Signature=" + (await this.signature())].join(", ") } async signature() { const date = this.datetime.slice(0, 8); const cacheKey = [this.secretAccessKey, date, this.region, this.service].join(); let kCredentials = this.cache.get(cacheKey); if (!kCredentials) { const kDate = await hmac("AWS4" + this.secretAccessKey, date); const kRegion = await hmac(kDate, this.region); const kService = await hmac(kRegion, this.service); kCredentials = await hmac(kService, "aws4_request"); this.cache.set(cacheKey, kCredentials); } return buf2hex(await hmac(kCredentials, await this.stringToSign())) } async stringToSign() { return ["AWS4-HMAC-SHA256", this.datetime, this.credentialString, buf2hex(await hash(await this.canonicalString()))].join("\n") } async canonicalString() { return [this.method.toUpperCase(), this.encodedPath, this.encodedSearch, this.canonicalHeaders + "\n", this.signedHeaders, await this.hexBodyHash()].join("\n") } async hexBodyHash() { let hashHeader = this.headers.get("X-Amz-Content-Sha256") || (this.service === "s3" && this.signQuery ? "UNSIGNED-PAYLOAD" : null); if (hashHeader == null) { if (this.body && typeof this.body !== "string" && !("byteLength" in this.body)) { throw new Error("body must be a string, ArrayBuffer or ArrayBufferView, unless you include the X-Amz-Content-Sha256 header") } hashHeader = buf2hex(await hash(this.body || "")); } return hashHeader } } async function hmac(key, string) { const cryptoKey = await crypto.subtle.importKey("raw", typeof key === "string" ? encoder.encode(key) : key, { name: "HMAC", hash: { name: "SHA-256" } }, false, ["sign"]); return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(string)) } async function hash(content) { return crypto.subtle.digest("SHA-256", typeof content === "string" ? encoder.encode(content) : content) } const HEX_CHARS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]; function buf2hex(arrayBuffer) { const buffer = new Uint8Array(arrayBuffer); let out = ""; for (let idx = 0; idx < buffer.length; idx++) { const n = buffer[idx]; out += HEX_CHARS[(n >>> 4) & 15]; out += HEX_CHARS[n & 15]; } return out } function encodeRfc3986(urlEncodedStr) { return urlEncodedStr.replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) } function guessServiceRegion(url, headers) { const { hostname, pathname } = url; if (hostname.endsWith(".on.aws")) { const match2 = hostname.match(/^[^.]{1,63}\.lambda-url\.([^.]{1,63})\.on\.aws$/); return match2 != null ? ["lambda", match2[1] || ""] : ["", ""] } if (hostname.endsWith(".r2.cloudflarestorage.com")) { return ["s3", "auto"] } if (hostname.endsWith(".backblazeb2.com")) { const match2 = hostname.match(/^(?:[^.]{1,63}\.)?s3\.([^.]{1,63})\.backblazeb2\.com$/); return match2 != null ? ["s3", match2[1] || ""] : ["", ""] } const match = hostname.replace("dualstack.", "").match(/([^.]{1,63})\.(?:([^.]{0,63})\.)?amazonaws\.com(?:\.cn)?$/); let service = (match && match[1]) || ""; let region = match && match[2]; if (region === "us-gov") { region = "us-gov-west-1"; } else if (region === "s3" || region === "s3-accelerate") { region = "us-east-1"; service = "s3"; } else if (service === "iot") { if (hostname.startsWith("iot.")) { service = "execute-api"; } else if (hostname.startsWith("data.jobs.iot.")) { service = "iot-jobs-data"; } else { service = pathname === "/mqtt" ? "iotdevicegateway" : "iotdata"; } } else if (service === "autoscaling") { const targetPrefix = (headers.get("X-Amz-Target") || "").split(".")[0]; if (targetPrefix === "AnyScaleFrontendService") { service = "application-autoscaling"; } else if (targetPrefix === "AnyScaleScalingPlannerFrontendService") { service = "autoscaling-plans"; } } else if (region == null && service.startsWith("s3-")) { region = service.slice(3).replace(/^fips-|^external-1/, ""); service = "s3"; } else if (service.endsWith("-fips")) { service = service.slice(0, -5); } else if (region && /-\d$/.test(service) && !/-\d$/.test(region)) { [service, region] = [region, service]; } return [HOST_SERVICES[service] || service, region || ""] }

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

async function safeGetArg(key, defaultValue = '') {
    try {
        const val = await Risuai.getArgument(key);
        return val !== undefined && val !== null && val !== "" ? val : defaultValue;
    } catch {
        return defaultValue;
    }
}

async function safeGetBoolArg(key, defaultValue = false) {
    try {
        const val = await Risuai.getArgument(key);
        if (val === 'true' || val === true) return true;
        if (val === 'false' || val === false || val === '') return false;
        return defaultValue;
    } catch {
        return defaultValue;
    }
}

// ==========================================
// 3. DYNAMIC MODEL & PROVIDER REGISTRY
// ==========================================
let ALL_DEFINED_MODELS = [];
let CUSTOM_MODELS_CACHE = [];
const customFetchers = {};
const registeredProviderTabs = [];
let vertexTokenCache = { token: null, expiry: 0 };
const pendingDynamicFetchers = [];
let _currentExecutingPluginId = null;
const _pluginRegistrations = {}; // pluginId -> { providerNames: [], tabObjects: [], fetcherEntries: [] }

// Helper: Check if dynamic model fetching is enabled for a given provider
// Setting key: cpm_dynamic_<providerName_lowercase> = 'true' means fetch from server
// Default: false — only fetch when user explicitly checks the checkbox
async function isDynamicFetchEnabled(providerName) {
    const key = `cpm_dynamic_${providerName.toLowerCase()}`;
    try {
        const val = await safeGetArg(key);
        // Only treat explicitly 'true' as enabled
        return (val === 'true' || val === true);
    } catch {
        return false;
    }
}

/**
 * Strip RisuAI-internal tags from message content.
 * LBI pre31 stripped {{inlay::...}} and <qak> tags before sending;
 * V3 plugins must do the same to avoid leaking internal markup to API.
 */
function stripInternalTags(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/\{\{(?:inlayed|inlay)::[^}]*\}\}/g, '')
        .replace(/<qak>|<\/qak>/g, '')
        .trim();
}

/**
 * NUCLEAR-SAFE JSON.stringify: uses a custom replacer that physically prevents
 * null/undefined entries from appearing in ANY array during serialization.
 *
 * Why this is needed: standard JSON.stringify converts undefined array elements
 * to null, and objects with toJSON() returning undefined also become null.
 * Pre-stringify .filter() calls cannot catch these cases because toJSON()
 * is only invoked DURING serialization, not before.
 *
 * The replacer intercepts every value during serialization. When it encounters
 * an array, it returns a filtered copy with null/undefined removed.
 * This is the definitive fix — no null can survive this.
 */
function safeStringify(obj) {
    return JSON.stringify(obj, function(_key, value) {
        if (Array.isArray(value)) {
            return value.filter(function(item) { return item != null; });
        }
        return value;
    });
}

/**
 * Deep-sanitize a messages array: remove null/undefined entries,
 * strip internal RisuAI tags, and filter messages with truly empty content.
 * Returns a NEW array — never mutates the input.
 *
 * Validates: non-null object, has string role, content is not null/undefined.
 * Messages with null content are removed because they cause API 400 errors
 * ("expected an object, but got null instead").
 */
function sanitizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const result = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        // Skip null, undefined, non-objects
        if (m == null || typeof m !== 'object') {
            console.warn(`[Cupcake PM] sanitizeMessages: skipped non-object at index ${i} (type=${typeof m})`);
            continue;
        }
        // Skip messages without a valid string role
        if (typeof m.role !== 'string' || !m.role) {
            console.warn(`[Cupcake PM] sanitizeMessages: skipped message with invalid role at index ${i} (role=${JSON.stringify(m.role)})`);
            continue;
        }
        // Skip messages where content is explicitly null/undefined
        // (These survive JSON round-trips and cause API "null message" errors)
        if (m.content === null || m.content === undefined) {
            console.warn(`[Cupcake PM] sanitizeMessages: skipped message with null/undefined content at index ${i} (role=${m.role})`);
            continue;
        }
        const cleaned = { ...m };
        // Strip toJSON if somehow inherited (prevents JSON.stringify producing null)
        if (typeof cleaned.toJSON === 'function') delete cleaned.toJSON;
        if (typeof cleaned.content === 'string') {
            cleaned.content = stripInternalTags(cleaned.content);
        }
        result.push(cleaned);
    }
    return result;
}

/**
 * Absolute last-line-of-defense: parse a JSON body string, filter null entries
 * from the messages/contents arrays, and re-stringify using safeStringify.
 *
 * Two-phase sanitization:
 *   Phase 1: Parse → explicit filter with logging → catches known null patterns
 *   Phase 2: Re-stringify via safeStringify (replacer) → catches ANY null in ANY
 *            array, including nulls produced by toJSON(), undefined→null conversion,
 *            or any other JSON.stringify edge case.
 *
 * CRITICAL: This is the final safeguard before the body crosses the V3 iframe
 * bridge (postMessage) and reaches the RisuAI proxy. Neither of those layers
 * are under our control, so we must ensure the JSON is absolutely clean here.
 */
function sanitizeBodyJSON(jsonStr) {
    try {
        const obj = JSON.parse(jsonStr);
        if (Array.isArray(obj.messages)) {
            const before = obj.messages.length;
            obj.messages = obj.messages.filter((m, idx) => {
                if (m == null) {
                    console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: removed NULL at messages[${idx}]`);
                    return false;
                }
                if (typeof m !== 'object') {
                    console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: removed non-object at messages[${idx}] (type=${typeof m})`);
                    return false;
                }
                // Remove messages with null/undefined content (API rejects these)
                if (m.content === null || m.content === undefined) {
                    console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: removed message with null content at messages[${idx}] (role=${m.role})`);
                    return false;
                }
                // Remove messages with missing/invalid role
                if (typeof m.role !== 'string' || !m.role) {
                    console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: removed message with invalid role at messages[${idx}]`);
                    return false;
                }
                // Strip toJSON from message objects to prevent null serialization
                if (typeof m.toJSON === 'function') {
                    delete m.toJSON;
                    console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: stripped toJSON from messages[${idx}]`);
                }
                return true;
            });
            if (obj.messages.length < before) {
                console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: total removed ${before - obj.messages.length} invalid entries from messages (was ${before}, now ${obj.messages.length})`);
            }
        }
        if (Array.isArray(obj.contents)) {
            const before = obj.contents.length;
            obj.contents = obj.contents.filter((m, idx) => {
                if (m == null || typeof m !== 'object') {
                    console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: removed null/invalid entry from contents[${idx}]`);
                    return false;
                }
                return true;
            });
            if (obj.contents.length < before) {
                console.warn(`[Cupcake PM] ⚠️ sanitizeBodyJSON: removed ${before - obj.contents.length} null entries from contents`);
            }
        }
        // Phase 2: Use safeStringify (replacer) to catch ANY remaining null in ANY array.
        // This is the nuclear option — the replacer runs during serialization itself,
        // catching nulls from toJSON(), undefined→null conversion, etc.
        const result = safeStringify(obj);

        // Phase 3: Post-verification — parse the result and check for null array elements.
        // If any null survived even the replacer (should be impossible), log for diagnosis.
        try {
            const verify = JSON.parse(result);
            if (Array.isArray(verify.messages)) {
                for (let i = 0; i < verify.messages.length; i++) {
                    if (verify.messages[i] == null) {
                        console.error(`[Cupcake PM] 🚨 CRITICAL: null SURVIVED all sanitization at messages[${i}]! Body dump:`, result.substring(0, 2000));
                    }
                }
            }
        } catch (_) { /* verification parse failed — not critical */ }

        return result;
    } catch (e) {
        console.error('[Cupcake PM] sanitizeBodyJSON: JSON parse/stringify failed:', e.message);
        return jsonStr;
    }
}

/**
 * Smart native fetch: 3-strategy fallback for V3 iframe sandbox.
 *
 * Strategy 1: Direct fetch() from iframe — works if CSP allows (non-iframe or relaxed CSP).
 * Strategy 2: Risuai.nativeFetch — goes through RisuAI cloud proxy (sv.risuai.xyz/proxy2).
 *             Supports streaming and preserves the EXACT body string (no re-parse/re-stringify).
 *             This avoids the "messages[N] is null" bug caused by the V3 postMessage bridge
 *             re-stringifying parsed body objects through fetchWithPlainFetch.
 * Strategy 3: Risuai.risuFetch(plainFetchForce) — direct fetch() from HOST window.
 *             Bypasses both iframe CSP and RisuAI cloud proxy. Used as fallback when
 *             the proxy fails (e.g., region-restricted APIs like Vertex AI).
 *             Trade-off: body object crosses postMessage bridge and gets re-stringified.
 *
 * Returns a native Response object, compatible with streaming (from Strategy 1 or 2)
 * or a wrapped non-streaming Response (from Strategy 3).
 */
async function smartNativeFetch(url, options = {}) {
    // ── Final body sanitization before any network call ──
    if (options.method === 'POST' && typeof options.body === 'string') {
        try {
            options = { ...options, body: sanitizeBodyJSON(options.body) };
        } catch (e) {
            console.error('[CupcakePM] smartNativeFetch: body re-sanitization failed:', e.message);
        }
    }

    // ── POST-sanitization diagnostic ──
    if (options.method === 'POST' && typeof options.body === 'string') {
        try {
            const _ps = JSON.parse(options.body);
            if (Array.isArray(_ps.messages)) {
                for (let _i = 0; _i < _ps.messages.length; _i++) {
                    if (_ps.messages[_i] == null) {
                        console.error(`[CupcakePM] 🚨 POST-SANITIZE NULL at messages[${_i}] in smartNativeFetch!`);
                    }
                }
            }
        } catch (_) {}
    }

    // Strategy 1: Direct browser fetch from iframe (bypasses proxy if CSP allows)
    try {
        const res = await fetch(url, options);
        return res;
    } catch (e) {
        // Expected in V3 iframe sandbox (connect-src 'none')
        console.log(`[CupcakePM] Direct fetch failed for ${url.substring(0, 60)}...: ${e.message}`);
    }

    // Strategy 2: Risuai.nativeFetch with body as Uint8Array
    // IMPORTANT: Encode body string to Uint8Array (binary) in the GUEST iframe BEFORE
    // crossing the postMessage bridge. This avoids potential issues with long string
    // serialization in postMessage structured clone. On the host side, fetchNative
    // receives a Uint8Array and uses it directly (no re-encoding step).
    // The Uint8Array's underlying ArrayBuffer is TRANSFERRED (zero-copy) across the bridge,
    // which is both faster and avoids any string handling edge cases.
    let proxyErrorResponse = null; // Save proxy error response for fallback if Strategy 3 also fails
    try {
        console.log(`[CupcakePM] Using nativeFetch (proxy) for ${url.substring(0, 60)}...`);
        const nfOptions = { ...options };
        if (typeof nfOptions.body === 'string') {
            nfOptions.body = new TextEncoder().encode(nfOptions.body);
        }
        const res = await Risuai.nativeFetch(url, nfOptions);

        // Check for proxy-level failures that risuFetch (direct) could bypass:
        // For 403/502/503: ALWAYS try Strategy 3 (direct from host window).
        // The cloud proxy (sv.risuai.xyz) may be blocked by upstream APIs
        // (e.g., Anthropic blocks CloudFlare proxy IPs with "Request not allowed").
        // Strategy 3 uses the user's real IP, bypassing proxy restrictions.
        if (!res.ok && (res.status === 403 || res.status === 502 || res.status === 503)) {
            let errText = '';
            try { errText = await res.clone().text(); } catch {}
            console.log(`[CupcakePM] nativeFetch proxy error (${res.status}), trying risuFetch direct...`);
            proxyErrorResponse = res; // Save for fallback
            // Fall through to Strategy 3
        } else if (!res.ok && res.status === 400) {
            // ── Detect proxy-related 400 errors that Strategy 3 (direct) might bypass ──
            let errText = '';
            try { errText = await res.clone().text(); } catch {}
            const isNullMessageError = errText.includes('got null instead') && errText.includes('messages');
            // Google AI Studio returns 400 FAILED_PRECONDITION for unsupported regions.
            // The proxy server may be in a restricted region while the user's real IP is not
            // (e.g., user has VPN). Fall through to Strategy 3 which uses the user's real IP.
            const isLocationError = errText.includes('User location is not supported') || errText.includes('FAILED_PRECONDITION');
            if (isNullMessageError || isLocationError) {
                const reason = isNullMessageError ? 'null-message corruption' : 'region/location restriction';
                console.warn(`[CupcakePM] ⚠️ Proxy 400 (${reason}). Trying direct fetch from host...`);
                console.warn(`[CupcakePM] ↳ Error: ${errText.substring(0, 300)}`);
                proxyErrorResponse = res; // Save for fallback
                // Fall through to Strategy 3
            } else {
                return res;
            }
        } else {
            return res;
        }
    } catch (e) {
        console.log(`[CupcakePM] nativeFetch failed: ${e.message}. Trying risuFetch direct...`);
    }

    // Strategy 3: risuFetch with plainFetchForce — direct fetch from HOST window
    // Bypasses both iframe CSP sandbox AND cloud proxy.
    // CRITICAL FIX: The host's fetchWithPlainFetch does `JSON.stringify(arg.body)`.
    // If we pass the body as a parsed object, the host re-stringifies it with standard
    // JSON.stringify (without our safe replacer), which can re-introduce nulls.
    // SOLUTION: Instead, we pass a special wrapper that preserves the exact body string.
    // Since fetchWithPlainFetch always does JSON.stringify(arg.body), if arg.body is already
    // a string, it would double-stringify. So we must pass as object.
    // But we deep-clone and filter exhaustively before crossing the bridge.
    if (typeof Risuai.risuFetch === 'function') {
        try {
            let bodyObj = undefined;
            if (options.body && typeof options.body === 'string') {
                try { bodyObj = JSON.parse(options.body); } catch { bodyObj = options.body; }
            } else if (options.body) {
                bodyObj = options.body;
            }

            // ── Deep-sanitize body object before it crosses the postMessage bridge ──
            // Deep plain clone via JSON round-trip strips hidden toJSON, getters, prototype chains.
            // Reconstruct every message as a minimal plain object (only known safe keys).
            if (bodyObj && typeof bodyObj === 'object') {
                if (Array.isArray(bodyObj.messages)) {
                    // Nuclear deep-clone: serialize → parse → manually reconstruct each message
                    try {
                        const rawMsgs = JSON.parse(JSON.stringify(bodyObj.messages));
                        bodyObj.messages = [];
                        for (let _ri = 0; _ri < rawMsgs.length; _ri++) {
                            const _rm = rawMsgs[_ri];
                            if (_rm == null || typeof _rm !== 'object') continue;
                            if (typeof _rm.role !== 'string' || !_rm.role) continue;
                            if (_rm.content === null || _rm.content === undefined) continue;
                            // Reconstruct with ONLY safe keys — no hidden properties can survive
                            // Normalize non-OpenAI roles: model/char → assistant
                            let _safeRole = _rm.role;
                            if (_safeRole === 'model' || _safeRole === 'char') _safeRole = 'assistant';
                            const safeMsg = { role: _safeRole, content: _rm.content };
                            if (_rm.name && typeof _rm.name === 'string') safeMsg.name = _rm.name;
                            bodyObj.messages.push(safeMsg);
                        }
                    } catch (_e) {
                        console.error('[CupcakePM] Deep reconstruct of messages failed:', _e.message);
                        // Fallback: simple filter
                        bodyObj.messages = bodyObj.messages.filter(m => m != null && typeof m === 'object');
                    }
                }
                if (Array.isArray(bodyObj.contents)) {
                    try { bodyObj.contents = JSON.parse(JSON.stringify(bodyObj.contents)); } catch (_) {}
                    bodyObj.contents = bodyObj.contents.filter(m => m != null && typeof m === 'object');
                }
            }

            // Diagnostic: verify body object before risuFetch
            if (bodyObj && Array.isArray(bodyObj.messages)) {
                console.log(`[CupcakePM] Strategy 3: ${bodyObj.messages.length} messages before risuFetch`);
                for (let _rfi = 0; _rfi < bodyObj.messages.length; _rfi++) {
                    const _rfm = bodyObj.messages[_rfi];
                    if (_rfm == null) {
                        console.error(`[CupcakePM] 🚨 Strategy 3: messages[${_rfi}] is NULL before risuFetch!`);
                    }
                }
            }

            const result = await Risuai.risuFetch(url, {
                method: options.method || 'POST',
                headers: options.headers || {},
                body: bodyObj,
                rawResponse: true,
                plainFetchForce: true,
            });
            // Distinguish real HTTP response (Uint8Array data) from network error (string data)
            if (result && result.data instanceof Uint8Array) {
                console.log(`[CupcakePM] risuFetch (direct from host) succeeded: status=${result.status} for ${url.substring(0, 60)}`);
                return new Response(result.data, {
                    status: result.status || 200,
                    headers: new Headers(result.headers || {})
                });
            }
            // Not a real HTTP response — likely CORS/network failure
            const errPreview = typeof result?.data === 'string' ? result.data.substring(0, 120) : 'unknown';
            console.log(`[CupcakePM] risuFetch (plainFetchForce) not a real response: ${errPreview}`);
        } catch (e) {
            console.log(`[CupcakePM] risuFetch fallback error: ${e.message}`);
        }
    }

    // If Strategy 3 didn't return and we have a saved proxy response, return it
    // (the error is likely a real API error, not a proxy issue)
    if (proxyErrorResponse) {
        console.log(`[CupcakePM] Strategy 3 failed, returning original proxy response (status=${proxyErrorResponse.status})`);
        return proxyErrorResponse;
    }

    // Final fallback: try nativeFetch one more time (shouldn't reach here normally)
    console.log(`[CupcakePM] All strategies failed, last resort nativeFetch for ${url.substring(0, 60)}...`);
    return await Risuai.nativeFetch(url, options);
}

// ==========================================
// 3.1 PERSISTENT SETTINGS BACKUP (survives plugin deletion)
// ==========================================
const SettingsBackup = {
    STORAGE_KEY: 'cpm_settings_backup',
    _cache: null,

    // All known setting keys that should be backed up
    getAllKeys() {
        const auxKeys = ['translation', 'emotion', 'memory', 'other'].flatMap(s => [
            `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
            `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
            `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`
        ]);
        return [
            ...auxKeys,
            'cpm_enable_chat_resizer',
            'cpm_custom_models',
            // OpenAI
            'cpm_openai_key', 'cpm_openai_url', 'cpm_openai_model', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier',
            // Anthropic
            'cpm_anthropic_key', 'cpm_anthropic_url', 'cpm_anthropic_model', 'cpm_anthropic_thinking_budget', 'cpm_anthropic_thinking_effort', 'chat_claude_caching',
            // Gemini
            'cpm_gemini_key', 'cpm_gemini_model', 'cpm_gemini_thinking_level',
            'chat_gemini_preserveSystem', 'chat_gemini_showThoughtsToken', 'chat_gemini_useThoughtSignature', 'chat_gemini_usePlainFetch',
            // Vertex
            'cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_model', 'cpm_vertex_thinking_level',
            'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature',
            // AWS
            'cpm_aws_key', 'cpm_aws_secret', 'cpm_aws_region', 'cpm_aws_thinking_budget', 'cpm_aws_thinking_effort',
            // OpenRouter
            'cpm_openrouter_key', 'cpm_openrouter_url', 'cpm_openrouter_model', 'cpm_openrouter_provider', 'cpm_openrouter_reasoning',
            // DeepSeek
            'cpm_deepseek_key', 'cpm_deepseek_url', 'cpm_deepseek_model',
        ];
    },

    async load() {
        try {
            const data = await risuai.pluginStorage.getItem(this.STORAGE_KEY);
            this._cache = data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('[CPM Backup] Failed to load backup', e);
            this._cache = {};
        }
        return this._cache;
    },

    async save() {
        try {
            await risuai.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache || {}));
        } catch (e) {
            console.error('[CPM Backup] Failed to save backup', e);
        }
    },

    // Update a single key in the backup
    async updateKey(key, value) {
        if (!this._cache) await this.load();
        this._cache[key] = value;
        await this.save();
    },

    // Snapshot all current @arg settings into backup
    async snapshotAll() {
        if (!this._cache) this._cache = {};
        const keys = this.getAllKeys();
        // Also include dynamic provider export keys
        for (const tab of registeredProviderTabs) {
            if (tab.exportKeys) keys.push(...tab.exportKeys);
        }
        const uniqueKeys = [...new Set(keys)];
        for (const key of uniqueKeys) {
            const val = await safeGetArg(key);
            if (val !== undefined && val !== '') {
                this._cache[key] = val;
            }
        }
        await this.save();
        console.log(`[CPM Backup] Snapshot saved (${Object.keys(this._cache).length} keys)`);
    },

    // Restore from backup — only fills in keys that are currently empty
    async restoreIfEmpty() {
        if (!this._cache) await this.load();
        if (!this._cache || Object.keys(this._cache).length === 0) {
            console.log('[CPM Backup] No backup found, skipping restore.');
            return 0;
        }
        let restoredCount = 0;
        for (const [key, value] of Object.entries(this._cache)) {
            const current = await safeGetArg(key);
            if ((current === undefined || current === null || current === '') && value !== undefined && value !== '') {
                risuai.setArgument(key, String(value));
                restoredCount++;
            }
        }
        if (restoredCount > 0) {
            console.log(`[CPM Backup] Restored ${restoredCount} settings from backup.`);
        }
        return restoredCount;
    }
};

// ==========================================
// DYNAMIC SUB-PLUGIN LOADER
// ==========================================
const SubPluginManager = {
    STORAGE_KEY: 'cpm_installed_subplugins',
    plugins: [], // Array of { id, name, version, description, code, enabled }

    async loadRegistry() {
        try {
            const data = await risuai.pluginStorage.getItem(this.STORAGE_KEY);
            this.plugins = data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('[CPM Loader] Failed to load registry', e);
            this.plugins = [];
        }
    },

    async saveRegistry() {
        await risuai.pluginStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.plugins));
    },

    extractMetadata(code) {
        const meta = { name: 'Unnamed Sub-Plugin', version: '', description: '', icon: '📦', updateUrl: '' };
        const nameMatch = code.match(/\/\/\s*@(?:name|display-name)\s+(.+)/i);
        if (nameMatch) meta.name = nameMatch[1].trim();
        const verMatch = code.match(/\/\/\s*@version\s+([^\r\n]+)/i);
        if (verMatch) meta.version = verMatch[1].trim();
        const descMatch = code.match(/\/\/\s*@description\s+(.+)/i);
        if (descMatch) meta.description = descMatch[1].trim();
        const iconMatch = code.match(/\/\/\s*@icon\s+(.+)/i);
        if (iconMatch) meta.icon = iconMatch[1].trim();
        const updateMatch = code.match(/\/\/\s*@update-url\s+(.+)/i);
        if (updateMatch) meta.updateUrl = updateMatch[1].trim();
        return meta;
    },

    async install(code) {
        const meta = this.extractMetadata(code);
        // If same name exists, update it instead of duplicating
        const existing = this.plugins.find(p => p.name === meta.name);
        if (existing) {
            existing.code = code;
            existing.version = meta.version;
            existing.description = meta.description;
            existing.icon = meta.icon;
            existing.updateUrl = meta.updateUrl;
            await this.saveRegistry();
            return meta.name;
        }
        const id = 'subplugin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        this.plugins.push({
            id,
            code,
            enabled: true,
            ...meta
        });
        await this.saveRegistry();
        return meta.name;
    },

    async remove(id) {
        this.plugins = this.plugins.filter(p => p.id !== id);
        await this.saveRegistry();
    },

    async toggle(id, enabled) {
        const p = this.plugins.find(p => p.id === id);
        if (p) {
            p.enabled = enabled;
            await this.saveRegistry();
        }
    },

    async executeEnabled() {
        window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
        for (const p of this.plugins) {
            if (p.enabled) {
                try {
                    _currentExecutingPluginId = p.id;
                    if (!_pluginRegistrations[p.id]) _pluginRegistrations[p.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
                    const execWrapper = `(async () => {\ntry {\n${p.code}\n} catch(err) {\nconsole.error('[CPM Loader] Error executing plugin ${p.name}:', err);\n}\n})();`;
                    await eval(execWrapper);
                    console.log(`[CPM Loader] Loaded Sub-Plugin: ${p.name}`);
                } catch (e) {
                    console.error(`[CPM Loader] Failed to load ${p.name}`, e);
                } finally {
                    _currentExecutingPluginId = null;
                }
            }
        }
    },

    // Compare semver-like version strings: returns 1 if b > a, 0 if equal, -1 if a > b
    compareVersions(a, b) {
        if (!a || !b) return 0;
        const pa = a.replace(/[^0-9.]/g, '').split('.').map(Number);
        const pb = b.replace(/[^0-9.]/g, '').split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0, nb = pb[i] || 0;
            if (nb > na) return 1;
            if (na > nb) return -1;
        }
        return 0;
    },

    // ── Single-Bundle Update System ──
    // Constraints of RisuAI's web environment:
    //   1. iframe CSP blocks all cross-origin fetch() → can't use direct fetch
    //   2. nativeFetch goes through proxy2 which caches PER-DOMAIN → cache poisoning
    //   3. risuFetch(plainFetchForce) runs in HOST window, bypasses proxy2,
    //      BUT always adds Content-Type: application/json header → triggers CORS preflight
    //   4. raw.githubusercontent.com doesn't support OPTIONS preflight → CORS fails
    //
    // Solution: Vercel API route (/api/update-bundle) that:
    //   - Properly handles OPTIONS preflight (returns 204 with CORS headers)
    //   - Serves combined {versions, code} bundle as JSON
    //   - risuFetch(plainFetchForce) bypasses proxy2 → no cache poisoning
    //   - Vercel fully supports CORS preflight → no CORS errors

    UPDATE_BUNDLE_URL: 'https://cupcake-plugin-manager.vercel.app/api/update-bundle',

    // Check all plugins for updates. Fetches ONE combined bundle (versions + code).
    // Returns array of { plugin, remoteVersion, localVersion, code }.
    async checkAllUpdates() {
        try {
            const cacheBuster = this.UPDATE_BUNDLE_URL + '?_t=' + Date.now() + '_r=' + Math.random().toString(36).substr(2, 8);
            console.log(`[CPM Update] Fetching update bundle via risuFetch(plainFetchForce): ${cacheBuster}`);

            // risuFetch with plainFetchForce: true
            //   - Runs fetch() in the HOST window (not the sandboxed iframe) → bypasses CSP
            //   - plainFetchForce bypasses proxy2 entirely → no cache poisoning
            //   - Vercel API route handles OPTIONS preflight → no CORS errors
            //   - Returns { ok, data, headers, status } with data auto-parsed as JSON
            const result = await Risuai.risuFetch(cacheBuster, {
                method: 'GET',
                plainFetchForce: true,
            });

            if (!result.ok) {
                console.error(`[CPM Update] Failed to fetch update bundle: ${result.status}`);
                return [];
            }

            // risuFetch auto-parses JSON, so result.data is already an object
            const bundle = (typeof result.data === 'string') ? JSON.parse(result.data) : result.data;
            const manifest = bundle.versions || {};
            const codeBundle = bundle.code || {};
            console.log(`[CPM Update] Bundle loaded: ${Object.keys(manifest).length} versions, ${Object.keys(codeBundle).length} code files`);

            const results = [];
            for (const p of this.plugins) {
                if (!p.updateUrl || !p.name) continue;
                const remote = manifest[p.name];
                if (!remote || !remote.version) {
                    console.warn(`[CPM Update] ${p.name} not found in manifest, skipping.`);
                    continue;
                }
                const cmp = this.compareVersions(p.version || '0.0.0', remote.version);
                console.log(`[CPM Update] ${p.name}: local=${p.version} remote=${remote.version} cmp=${cmp}`);
                if (cmp > 0) {
                    const code = (remote.file && codeBundle[remote.file]) ? codeBundle[remote.file] : null;
                    if (code) {
                        console.log(`[CPM Update] Code ready for ${p.name} (${(code.length / 1024).toFixed(1)}KB)`);
                    } else {
                        console.warn(`[CPM Update] ${p.name} (${remote.file}) code not found in bundle`);
                    }
                    results.push({
                        plugin: p,
                        remoteVersion: remote.version,
                        localVersion: p.version || '0.0.0',
                        remoteFile: remote.file,
                        code,
                    });
                }
            }
            return results;
        } catch (e) {
            console.error(`[CPM Update] Failed to check updates:`, e);
            return [];
        }
    },

    // Apply update using pre-fetched code from the bundle (no additional fetch needed).
    // Code is pre-fetched during checkAllUpdates to avoid proxy2 per-domain cache issues.
    async applyUpdate(pluginId, prefetchedCode) {
        const p = this.plugins.find(x => x.id === pluginId);
        if (!p) return false;
        if (!prefetchedCode) {
            console.error(`[CPM Update] No pre-fetched code available for ${p.name}. Re-run update check.`);
            return false;
        }
        try {
            console.log(`[CPM Update] Applying update for ${p.name} (${(prefetchedCode.length / 1024).toFixed(1)}KB)`);
            const meta = this.extractMetadata(prefetchedCode);
            // Safety check: verify the remote code's name matches the plugin being updated
            if (meta.name && p.name && meta.name !== p.name) {
                console.error(`[CPM Update] BLOCKED: Tried to apply "${meta.name}" code to plugin "${p.name}". Names don't match.`);
                return false;
            }
            p.code = prefetchedCode;
            p.name = meta.name || p.name;
            p.version = meta.version;
            p.description = meta.description;
            p.icon = meta.icon;
            p.updateUrl = meta.updateUrl || p.updateUrl;
            await this.saveRegistry();
            console.log(`[CPM Update] Successfully applied update for ${p.name} → v${meta.version}`);
            return true;
        } catch (e) {
            console.error(`[CPM Update] Failed to apply update for ${p.name}:`, e);
            return false;
        }
    },

    // ── Hot-Reload Infrastructure ──

    // Unload all providers/tabs/fetchers registered by a specific sub-plugin
    unloadPlugin(pluginId) {
        const reg = _pluginRegistrations[pluginId];
        if (!reg) return;
        for (const name of reg.providerNames) {
            delete customFetchers[name];
            ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
        }
        for (const tab of reg.tabObjects) {
            const idx = registeredProviderTabs.indexOf(tab);
            if (idx !== -1) registeredProviderTabs.splice(idx, 1);
        }
        for (const entry of reg.fetcherEntries) {
            const idx = pendingDynamicFetchers.findIndex(f => f.name === entry.name);
            if (idx !== -1) pendingDynamicFetchers.splice(idx, 1);
        }
        _pluginRegistrations[pluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
        console.log(`[CPM Loader] Unloaded registrations for plugin ${pluginId}`);
    },

    // Execute a single plugin (sets tracking context)
    async executeOne(plugin) {
        if (!plugin || !plugin.enabled) return;
        try {
            _currentExecutingPluginId = plugin.id;
            if (!_pluginRegistrations[plugin.id]) _pluginRegistrations[plugin.id] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            const execWrapper = `(async () => {\ntry {\n${plugin.code}\n} catch(err) {\nconsole.error('[CPM Loader] Error executing plugin ${plugin.name}:', err);\n}\n})();`;
            await eval(execWrapper);
            console.log(`[CPM Loader] Hot-loaded Sub-Plugin: ${plugin.name}`);
        } catch (e) {
            console.error(`[CPM Loader] Failed to hot-load ${plugin.name}`, e);
        } finally {
            _currentExecutingPluginId = null;
        }
    },

    // Hot-reload a single sub-plugin: unload old registrations, re-execute, re-fetch dynamic models
    async hotReload(pluginId) {
        const plugin = this.plugins.find(p => p.id === pluginId);
        if (!plugin) return false;

        // 1. Unload old registrations
        this.unloadPlugin(pluginId);

        // 2. Re-execute if enabled
        if (plugin.enabled) {
            await this.executeOne(plugin);

            // 3. Run dynamic model fetching for newly registered providers
            const newProviderNames = (_pluginRegistrations[pluginId] || {}).providerNames || [];
            for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
                if (newProviderNames.includes(name)) {
                    try {
                        const enabled = await isDynamicFetchEnabled(name);
                        if (!enabled) {
                            console.log(`[CupcakePM] Hot-reload: Dynamic fetch disabled for ${name}, using fallback.`);
                            continue;
                        }
                        console.log(`[CupcakePM] Hot-reload: Fetching dynamic models for ${name}...`);
                        const dynamicModels = await fetchDynamicModels();
                        if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                            ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                            for (const m of dynamicModels) ALL_DEFINED_MODELS.push({ ...m, provider: name });
                            console.log(`[CupcakePM] ✓ Hot-reload dynamic models for ${name}: ${dynamicModels.length} models`);
                        }
                    } catch (e) {
                        console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e);
                    }
                }
            }
        }
        console.log(`[CPM Loader] Hot-reload complete for: ${plugin.name}`);
        return true;
    },

    // Hot-reload all enabled sub-plugins
    async hotReloadAll() {
        for (const p of this.plugins) this.unloadPlugin(p.id);
        await this.executeEnabled();
        for (const { name, fetchDynamicModels } of [...pendingDynamicFetchers]) {
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) continue;
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    for (const m of dynamicModels) ALL_DEFINED_MODELS.push({ ...m, provider: name });
                }
            } catch (e) {
                console.warn(`[CupcakePM] Hot-reload dynamic fetch failed for ${name}:`, e.message || e);
            }
        }
        console.log('[CPM Loader] Hot-reload all complete.');
    }
};

// ==========================================
// CUPCAKE PM GLOBAL API
// ==========================================
window.CupcakePM = {
    customFetchers,
    registeredProviderTabs,
    registerProvider({ name, models, fetcher, settingsTab, fetchDynamicModels }) {
        // Track which sub-plugin registered this provider (for hot-reload cleanup)
        if (_currentExecutingPluginId) {
            if (!_pluginRegistrations[_currentExecutingPluginId]) {
                _pluginRegistrations[_currentExecutingPluginId] = { providerNames: [], tabObjects: [], fetcherEntries: [] };
            }
            const reg = _pluginRegistrations[_currentExecutingPluginId];
            if (!reg.providerNames.includes(name)) reg.providerNames.push(name);
            if (settingsTab) reg.tabObjects.push(settingsTab);
            if (typeof fetchDynamicModels === 'function') reg.fetcherEntries.push({ name, fetchDynamicModels });
        }
        if (fetcher) customFetchers[name] = fetcher;
        if (models && Array.isArray(models)) {
            for (const m of models) ALL_DEFINED_MODELS.push({ ...m, provider: name });
        }
        if (settingsTab) registeredProviderTabs.push(settingsTab);
        if (typeof fetchDynamicModels === 'function') {
            pendingDynamicFetchers.push({ name, fetchDynamicModels });
        }
        console.log(`[CupcakePM] Provider registered: ${name}`);
    },
    formatToOpenAI,
    formatToAnthropic,
    formatToGemini,
    createSSEStream,
    parseOpenAISSELine,
    createAnthropicSSEStream,
    parseGeminiSSELine,
    collectStream,
    safeGetArg,
    safeGetBoolArg,
    setArg: (k, v) => risuai.setArgument(k, String(v)),
    get vertexTokenCache() { return vertexTokenCache; },
    set vertexTokenCache(v) { vertexTokenCache = v; },
    AwsV4Signer,
    checkStreamCapability,
    hotReload: (pluginId) => SubPluginManager.hotReload(pluginId),
    hotReloadAll: () => SubPluginManager.hotReloadAll(),
    /**
     * addCustomModel: Programmatically add or update a Custom Model.
     * @param {Object} modelDef - Model definition (name, model, url, key, format, etc.)
     * @param {string} [tag] - Optional tag to identify models created by a specific source (for upsert).
     * @returns {{ success: boolean, created: boolean, uniqueId: string, error?: string }}
     */
    addCustomModel(modelDef, tag = '') {
        try {
            let existingIdx = -1;
            if (tag) {
                existingIdx = CUSTOM_MODELS_CACHE.findIndex(m => m._tag === tag);
            }
            if (existingIdx !== -1) {
                // Update existing
                CUSTOM_MODELS_CACHE[existingIdx] = { ...CUSTOM_MODELS_CACHE[existingIdx], ...modelDef, _tag: tag };
                risuai.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                return { success: true, created: false, uniqueId: CUSTOM_MODELS_CACHE[existingIdx].uniqueId };
            } else {
                // Create new
                const uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                const entry = { ...modelDef, uniqueId, _tag: tag || undefined };
                CUSTOM_MODELS_CACHE.push(entry);
                ALL_DEFINED_MODELS.push({ uniqueId, id: entry.model, name: entry.name || uniqueId, provider: 'Custom' });
                risuai.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                return { success: true, created: true, uniqueId };
            }
        } catch (e) {
            return { success: false, created: false, uniqueId: '', error: e.message };
        }
    },
    /**
     * smartFetch: Try direct browser fetch first (avoids proxy issues),
     * fall back to Risuai.nativeFetch if CORS or network error occurs.
     */
    smartFetch: async (url, options = {}) => smartNativeFetch(url, options),
    /**
     * smartNativeFetch: Same as smartFetch but explicitly named for streaming use.
     * Tries direct fetch() → falls back to nativeFetch (proxy).
     * Returns native Response object, compatible with ReadableStream/SSE.
     */
    smartNativeFetch: async (url, options = {}) => smartNativeFetch(url, options),
    /** Exchange stored GitHub OAuth token for short-lived Copilot API token (cached). */
    ensureCopilotApiToken: () => ensureCopilotApiToken(),
};
console.log('[CupcakePM] API exposed on window.CupcakePM');

// Infer request slot using CPM's own slot configuration.
// V3 overrides args.mode to 'v3', so we can't rely on mode for routing.
//
// How it works: user assigns a SPECIFIC model to each aux slot in CPM settings.
// If the invoked model's uniqueId matches a slot config, apply that slot's params.
// Otherwise it's treated as main chat.
//
// NOTE: DB-based detection (reading seperateModels) was intentionally removed.
// It causes false positives when the same model handles both main chat AND aux
// tasks, since the plugin API can't read which model is the main chat model.
const CPM_SLOT_LIST = ['translation', 'emotion', 'memory', 'other'];

async function inferSlot(activeModelDef) {
    for (const slot of CPM_SLOT_LIST) {
        const configuredId = await safeGetArg(`cpm_slot_${slot}`, '');
        if (configuredId && configuredId === activeModelDef.uniqueId) {
            return slot;
        }
    }
    return 'chat';
}

function formatToOpenAI(messages, config = {}) {
    // Step 1: Deep sanitize — remove nulls, strip internal RisuAI tags
    let msgs = sanitizeMessages(messages);

    if (config.mergesys) {
        let sysPrompt = "";
        let newMsgs = [];
        for (let m of msgs) {
            if (m.role === 'system') sysPrompt += (sysPrompt ? '\n' : '') + (typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
            else newMsgs.push(m);
        }
        if (sysPrompt && newMsgs.length > 0) {
            newMsgs[0].content = sysPrompt + "\n\n" + (typeof newMsgs[0].content === 'string' ? newMsgs[0].content : JSON.stringify(newMsgs[0].content));
        }
        msgs = newMsgs;
    }

    if (config.mustuser) {
        if (msgs.length > 0 && msgs[0].role !== 'user' && msgs[0].role !== 'system') {
            msgs.unshift({ role: 'user', content: '(Continue)' });
        }
    }

    let arr = [];
    for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (!m || typeof m !== 'object') continue;
        // Validate role exists and is a string
        let role = typeof m.role === 'string' ? m.role : 'user';
        if (!role) continue;
        // Normalize non-OpenAI roles to standard OpenAI roles FIRST
        // 'model' is Gemini-specific, 'char' is RisuAI-internal → both map to 'assistant'
        if (role === 'model' || role === 'char') role = 'assistant';
        const msg = { role, content: '' };
        // altrole: convert assistant→model for Gemini-style APIs (only when explicitly requested)
        if (config.altrole && msg.role === 'assistant') msg.role = 'model';
        // Handle multimodals (images/audio) → OpenAI vision format (like LBI pre31)
        if (m.multimodals && Array.isArray(m.multimodals) && m.multimodals.length > 0) {
            const contentParts = [];
            const textContent = typeof m.content === 'string' ? m.content.trim() : String(m.content ?? '').trim();
            if (textContent) contentParts.push({ type: 'text', text: textContent });
            for (const modal of m.multimodals) {
                if (!modal || typeof modal !== 'object') continue;
                if (modal.type === 'image') {
                    contentParts.push({ type: 'image_url', image_url: { url: modal.base64 } });
                } else if (modal.type === 'audio') {
                    contentParts.push({ type: 'input_audio', input_audio: { data: (modal.base64 || '').split(',')[1] || modal.base64, format: (modal.base64 || '').includes('wav') ? 'wav' : 'mp3' } });
                }
            }
            msg.content = contentParts.length > 0 ? contentParts : (textContent || '');
        } else if (typeof m.content === 'string') {
            msg.content = m.content;
        } else if (Array.isArray(m.content)) {
            // Filter null entries from content array (vision/audio parts)
            msg.content = m.content.filter(p => p != null && typeof p === 'object');
        } else {
            msg.content = String(m.content ?? '');
        }
        // Final validation: ensure msg.content is valid (not null/undefined)
        if (msg.content === null || msg.content === undefined) {
            console.warn(`[Cupcake PM] formatToOpenAI: skipped message with null content after formatting (index=${i}, role=${role})`);
            continue;
        }
        if (m.name && typeof m.name === 'string') msg.name = m.name;
        arr.push(msg);
    }

    if (config.sysfirst) {
        const firstIdx = arr.findIndex(m => m.role === 'system');
        if (firstIdx > 0) {
            const el = arr.splice(firstIdx, 1)[0];
            arr.unshift(el);
        }
    }

    return arr;
}

function formatToAnthropic(messages, config = {}) {
    const validMsgs = sanitizeMessages(messages);
    const systemMsgs = validMsgs.filter(m => m.role === 'system');
    const chatMsgs = validMsgs.filter(m => m.role !== 'system');
    const systemPrompt = systemMsgs.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n');

    const formattedMsgs = [];
    for (const m of chatMsgs) {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (formattedMsgs.length > 0 && formattedMsgs[formattedMsgs.length - 1].role === role) {
            formattedMsgs[formattedMsgs.length - 1].content += '\n\n' + content;
        } else {
            formattedMsgs.push({ role, content });
        }
    }
    if (formattedMsgs.length === 0 || formattedMsgs[0].role !== 'user') {
        formattedMsgs.unshift({ role: 'user', content: '(Continue)' });
    }
    return { messages: formattedMsgs, system: systemPrompt };
}

function formatToGemini(messagesRaw, config = {}) {
    const messages = sanitizeMessages(messagesRaw);
    const systemInstruction = [];
    const contents = [];
    for (const m of messages) {
        if (m.role === 'system') systemInstruction.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
        else {
            const role = m.role === 'assistant' ? 'model' : 'user';
            const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            if (contents.length > 0 && contents[contents.length - 1].role === role) contents[contents.length - 1].parts.push({ text });
            else contents.push({ role, parts: [{ text }] });
        }
    }
    if (contents.length > 0 && contents[0].role === 'model') contents.unshift({ role: 'user', parts: [{ text: '(Continue)' }] });

    if (!config.preserveSystem && systemInstruction.length > 0) {
        const sysText = systemInstruction.join('\n\n');
        if (contents.length > 0 && contents[0].role === 'user') {
            contents[0].parts.unshift({ text: `[System Content]\n${sysText}\n[/System Content]\n\n` });
        } else {
            contents.unshift({ role: 'user', parts: [{ text: `[System Content]\n${sysText}\n[/System Content]\n\n` }] });
        }
        systemInstruction.length = 0; // Clear system instructions to signal it's merged
    }

    return { contents, systemInstruction };
}

// ==========================================
// 3. SSE STREAMING HELPERS
// ==========================================

/**
 * Parse SSE (Server-Sent Events) lines from a ReadableStream<Uint8Array>.
 * Returns a ReadableStream<string> where each chunk is the delta text.
 * @param {Response} response - fetch Response with streaming body
 * @param {function} lineParser - (line: string) => string|null — extracts delta text from an SSE data line
 * @param {AbortSignal} [abortSignal] - optional abort signal
 * @returns {ReadableStream<string>}
 */
function createSSEStream(response, lineParser, abortSignal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    return new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    if (abortSignal && abortSignal.aborted) {
                        reader.cancel();
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        // Process remaining buffer
                        if (buffer.trim()) {
                            const delta = lineParser(buffer.trim());
                            if (delta) controller.enqueue(delta);
                        }
                        controller.close();
                        return;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith(':')) continue;
                        const delta = lineParser(trimmed);
                        if (delta) controller.enqueue(delta);
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    controller.error(e);
                } else {
                    controller.close();
                }
            }
        },
        cancel() {
            reader.cancel();
        }
    });
}

/**
 * OpenAI-compatible SSE parser: extracts delta.content from "data: {...}" lines.
 * Works for OpenAI, DeepSeek, OpenRouter, and other OpenAI-compatible APIs.
 */
function parseOpenAISSELine(line) {
    if (!line.startsWith('data:')) return null;
    const jsonStr = line.slice(5).trim();
    if (jsonStr === '[DONE]') return null;
    try {
        const obj = JSON.parse(jsonStr);
        return obj.choices?.[0]?.delta?.content || null;
    } catch { return null; }
}

/**
 * Anthropic SSE parser: extracts delta.text from content_block_delta events.
 * Anthropic SSE format uses "event: ..." + "data: ..." pairs.
 */
function createAnthropicSSEStream(response, abortSignal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    return new ReadableStream({
        async pull(controller) {
            try {
                while (true) {
                    if (abortSignal && abortSignal.aborted) {
                        reader.cancel();
                        controller.close();
                        return;
                    }
                    const { done, value } = await reader.read();
                    if (done) { controller.close(); return; }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) { currentEvent = ''; continue; }
                        if (trimmed.startsWith('event:')) {
                            currentEvent = trimmed.slice(6).trim();
                            continue;
                        }
                        if (trimmed.startsWith('data:')) {
                            const jsonStr = trimmed.slice(5).trim();
                            try {
                                const obj = JSON.parse(jsonStr);
                                if (currentEvent === 'content_block_delta' && obj.delta?.text) {
                                    controller.enqueue(obj.delta.text);
                                }
                            } catch { }
                        }
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') controller.error(e);
                else controller.close();
            }
        },
        cancel() { reader.cancel(); }
    });
}

/**
 * Gemini SSE parser: extracts text parts from streamed JSON chunks.
 * Gemini streamGenerateContent with alt=sse returns "data: {...}" lines.
 */
function parseGeminiSSELine(line, config = {}) {
    if (!line.startsWith('data:')) return null;
    const jsonStr = line.slice(5).trim();
    try {
        const obj = JSON.parse(jsonStr);
        let text = '';
        if (obj.candidates?.[0]?.content?.parts) {
            for (const part of obj.candidates[0].content.parts) {
                if (part.thought && config.showThoughtsToken) text += `\n> [Thought Process]\n> ${part.thought}\n\n`;
                if ((part.thoughtSignature || part.thought_signature) && config.useThoughtSignature) {
                    text += `\n> [Signature: ${part.thoughtSignature || part.thought_signature}]\n\n`;
                }
                if (part.text !== undefined && !part.thought) text += part.text;
            }
        }
        return text || null;
    } catch { return null; }
}

/**
 * Collect a ReadableStream<string> into a single string.
 * Used for decoupled streaming mode and as fallback when bridge doesn't support stream transfer.
 */
async function collectStream(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) result += value;
    }
    return result;
}

// ==========================================
// 3.6 STREAM BRIDGE CAPABILITY DETECTION
// ==========================================
/**
 * Detects whether the RisuAI V3 iframe bridge can transfer ReadableStream objects
 * from the Guest (plugin iframe) to the Host (main window).
 *
 * The V3 bridge's Guest-side collectTransferables() may not include ReadableStream,
 * causing a DataCloneError when postMessage tries to structured-clone the stream.
 *
 * Two-phase detection:
 *   Phase 1 – Check if ReadableStream is structured-cloneable (postMessage WITHOUT transfer list).
 *             If yes, the bridge works even without a patch.
 *   Phase 2 – Check if the Guest bridge source code includes ReadableStream in collectTransferables.
 *             If yes AND the browser supports ReadableStream as Transferable, the bridge is patched.
 *
 * The result is cached after the first probe.
 *
 * @returns {Promise<boolean>} true if returning a ReadableStream from addProvider callback is safe
 */
let _streamBridgeCapable = null;
async function checkStreamCapability() {
    if (_streamBridgeCapable !== null) return _streamBridgeCapable;

    // Phase 1: Can the browser structured-clone a ReadableStream? (no transfer list)
    // This would mean the stream survives postMessage even if the bridge doesn't list it as transferable.
    try {
        const s1 = new ReadableStream({ start(c) { c.close(); } });
        const mc1 = new MessageChannel();
        const cloneable = await new Promise(resolve => {
            const timer = setTimeout(() => { resolve(false); try { mc1.port1.close(); mc1.port2.close(); } catch { } }, 500);
            mc1.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc1.port1.close(); mc1.port2.close(); };
            mc1.port2.onmessageerror = () => { clearTimeout(timer); resolve(false); mc1.port1.close(); mc1.port2.close(); };
            try { mc1.port1.postMessage({ s: s1 }); } // NO transfer list
            catch { clearTimeout(timer); resolve(false); }
        });
        if (cloneable) {
            _streamBridgeCapable = true;
            console.log('[CupcakePM] ReadableStream is structured-cloneable — streaming enabled.');
            return true;
        }
    } catch { /* continue to Phase 2 */ }

    // Phase 2: Check if the Guest bridge's collectTransferables includes ReadableStream.
    // The bridge script is embedded in this iframe's <script> tag.
    try {
        const scriptContent = document.querySelector('script')?.textContent || '';
        const ctFnMatch = scriptContent.match(/function\s+collectTransferables\b[\s\S]{0,800}?return\s+transferables/);
        if (ctFnMatch && ctFnMatch[0].includes('ReadableStream')) {
            // Bridge is patched. Verify the browser can actually transfer ReadableStream.
            const s2 = new ReadableStream({ start(c) { c.close(); } });
            const mc2 = new MessageChannel();
            const transferable = await new Promise(resolve => {
                const timer = setTimeout(() => { resolve(false); try { mc2.port1.close(); mc2.port2.close(); } catch { } }, 500);
                mc2.port2.onmessage = () => { clearTimeout(timer); resolve(true); mc2.port1.close(); mc2.port2.close(); };
                try { mc2.port1.postMessage({ s: s2 }, [s2]); } // WITH transfer list
                catch { clearTimeout(timer); resolve(false); }
            });
            if (transferable) {
                _streamBridgeCapable = true;
                console.log('[CupcakePM] Guest bridge patched + browser supports transfer — streaming enabled.');
                return true;
            }
        }
    } catch { /* continue to fallback */ }

    _streamBridgeCapable = false;
    console.log('[CupcakePM] ReadableStream transfer NOT supported by bridge. Falling back to string responses.');
    return false;
}

// ==========================================
// 3.7 COPILOT TOKEN AUTO-FETCH (for githubcopilot.com URLs)
// ==========================================
let _copilotTokenCache = { token: '', expiry: 0 };

async function ensureCopilotApiToken() {
    // Return cached token if still valid (with 60s safety margin)
    if (_copilotTokenCache.token && Date.now() < _copilotTokenCache.expiry - 60000) {
        return _copilotTokenCache.token;
    }
    // Read GitHub OAuth token from stored arg
    const githubToken = await safeGetArg('tools_githubCopilotToken');
    if (!githubToken) {
        console.warn('[Cupcake PM] Copilot: No GitHub OAuth token found. Set token via Copilot Manager.');
        return '';
    }
    // Sanitize token (strip non-ASCII)
    const cleanToken = githubToken.replace(/[^\x20-\x7E]/g, '').trim();
    if (!cleanToken) return '';
    try {
        console.log('[Cupcake PM] Copilot: Exchanging OAuth token for API token...');
        const res = await smartNativeFetch('https://api.github.com/copilot_internal/v2/token', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${cleanToken}`,
                'User-Agent': 'GitHubCopilotChat/0.24.1',
                'Editor-Version': 'vscode/1.96.4',
                'Editor-Plugin-Version': 'copilot-chat/0.24.1',
                'X-GitHub-Api-Version': '2024-12-15',
            }
        });
        if (!res.ok) {
            console.error(`[Cupcake PM] Copilot token exchange failed (${res.status}): ${await res.text()}`);
            return '';
        }
        const data = await res.json();
        if (!data.token) {
            console.error('[Cupcake PM] Copilot token exchange returned no token');
            return '';
        }
        // Cache with expiry (expires_at is Unix timestamp in seconds)
        const expiryMs = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800000;
        _copilotTokenCache = { token: data.token, expiry: expiryMs };
        window._cpmCopilotApiToken = data.token;
        console.log('[Cupcake PM] Copilot: API token obtained, expires in', Math.round((expiryMs - Date.now()) / 60000), 'min');
        return data.token;
    } catch (e) {
        console.error('[Cupcake PM] Copilot token exchange error:', e.message);
        return '';
    }
}

// ==========================================
// 3.8 PROVIDER FETCHERS (Custom only - built-in providers are sub-plugins)
// ==========================================

async function fetchCustom(config, messagesRaw, temp, maxTokens, args = {}, abortSignal) {
    // Defensive: deep-sanitize messages (null filter + tag strip + role validation)
    const messages = sanitizeMessages(messagesRaw);
    const format = config.format || 'openai';
    let formattedMessages;
    let systemPrompt = '';

    if (format === 'anthropic') {
        const { messages: anthropicMsgs, system: anthropicSys } = formatToAnthropic(messages, config);
        formattedMessages = anthropicMsgs;
        systemPrompt = anthropicSys;
    } else if (format === 'google') {
        const { contents: geminiContents, systemInstruction: geminiSys } = formatToGemini(messages, config);
        // For custom, we'll just pass the contents and systemInstruction as separate fields if needed
        // Or, if the custom endpoint expects OpenAI-like, we'd need to convert.
        // For simplicity, let's assume custom endpoints are mostly OpenAI-compatible unless specified.
        // If 'google' format is chosen, we'll pass the Gemini-formatted messages.
        // This might need further refinement based on actual custom API expectations.
        formattedMessages = geminiContents;
        systemPrompt = geminiSys.length > 0 ? geminiSys.join('\n\n') : '';
    } else { // Default to OpenAI
        formattedMessages = formatToOpenAI(messages, config);
    }

    // ── Final role normalization for OpenAI-compatible APIs ──
    // Even after formatToOpenAI, roles may be non-standard if config.altrole was set
    // or if RisuAI sent non-standard roles. OpenAI APIs only accept: system, user, assistant, tool, function, developer.
    // 'model' (Gemini), 'char' (RisuAI internal) → 'assistant'
    if (format === 'openai' && Array.isArray(formattedMessages)) {
        const _validOpenAIRoles = new Set(['system', 'user', 'assistant', 'tool', 'function', 'developer']);
        for (let _ri = 0; _ri < formattedMessages.length; _ri++) {
            const _fm = formattedMessages[_ri];
            if (_fm && typeof _fm.role === 'string' && !_validOpenAIRoles.has(_fm.role)) {
                const _oldRole = _fm.role;
                _fm.role = (_oldRole === 'model' || _oldRole === 'char') ? 'assistant' : 'user';
                console.warn(`[Cupcake PM] fetchCustom: normalized invalid OpenAI role '${_oldRole}' → '${_fm.role}' at index ${_ri}`);
            }
        }
    }

    const body = {
        model: config.model,
        temperature: temp,
    };

    // max_tokens vs max_completion_tokens: newer OpenAI models require max_completion_tokens
    const _needsMCT = (model) => { if (!model) return false; return /^(gpt-5|o[1-9])/i.test(model); };
    if (format === 'openai' && _needsMCT(config.model)) {
        body.max_completion_tokens = maxTokens;
    } else {
        body.max_tokens = maxTokens;
    }
    if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
    if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
    if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
    if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
    if (args.repetition_penalty !== undefined && args.repetition_penalty !== null) body.repetition_penalty = args.repetition_penalty;

    if (format === 'anthropic') {
        body.messages = formattedMessages;
        if (systemPrompt) body.system = systemPrompt;
        if (config.thinking_level && config.thinking_level !== 'none' && config.thinking_level !== 'off') {
            const budget = parseInt(config.thinking_level) || 0;
            if (budget > 0) {
                body.thinking = { type: 'enabled', budget_tokens: budget };
                if (body.max_tokens <= budget) body.max_tokens = budget + 4096;
                delete body.temperature;
            }
        }
    } else if (format === 'google') {
        body.contents = formattedMessages;
        if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
        body.generationConfig = { temperature: temp, maxOutputTokens: maxTokens };
        if (config.thinking_level && config.thinking_level !== 'none' && config.thinking_level !== 'off') {
            body.generationConfig.thinkingConfig = { thinkingBudget: 8192 };
        }
        delete body.temperature;
        delete body.max_tokens;
    } else { // OpenAI compatible
        body.messages = formattedMessages;
    }

    // ===== FINAL SAFETY: deep-clone + filter messages array =====
    // Deep plain clone via JSON round-trip eliminates hidden prototype chains,
    // getters, toJSON methods, and any non-plain-object artifacts that could
    // cause null entries to appear during serialization or proxy transit.
    // This is the absolute last defense before JSON.stringify.
    if (body.messages) {
        try {
            // Deep plain clone: strips ALL non-data properties (toJSON, getters, prototype chains)
            body.messages = JSON.parse(JSON.stringify(body.messages));
        } catch (e) {
            console.error('[Cupcake PM] ⚠️ Deep-clone of messages failed:', e.message);
        }
        const before = body.messages.length;
        body.messages = body.messages.filter(m => {
            if (m == null || typeof m !== 'object') return false;
            if (m.content === null || m.content === undefined) return false;
            if (typeof m.role !== 'string' || !m.role) return false;
            return true;
        });
        if (body.messages.length < before) {
            console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.messages.length} null/invalid entries from messages array (was ${before}, now ${body.messages.length})`);
        }
    }
    if (body.contents) {
        try {
            body.contents = JSON.parse(JSON.stringify(body.contents));
        } catch (e) {
            console.error('[Cupcake PM] ⚠️ Deep-clone of contents failed:', e.message);
        }
        const before = body.contents.length;
        body.contents = body.contents.filter(m => m != null && typeof m === 'object');
        if (body.contents.length < before) {
            console.warn(`[Cupcake PM] ⚠️ Removed ${before - body.contents.length} null/invalid entries from contents array`);
        }
    }

    if (config.maxout) {
        if (format === 'openai') {
            body.max_output_tokens = maxTokens;
            delete body.max_tokens;
            delete body.max_completion_tokens;
        } else if (format === 'google') {
            body.generationConfig.maxOutputTokens = maxTokens;
        }
    }

    if (config.reasoning && config.reasoning !== 'none') {
        if (format === 'openai') {
            body.reasoning_effort = config.reasoning;
            delete body.temperature;
        }
        // Anthropic and Google have their own thinking/budget params, not directly mapped here
    }
    if (config.verbosity && config.verbosity !== 'none') {
        if (format === 'openai') {
            body.verbosity = config.verbosity;
        }
    }

    if (config.customParams && config.customParams.trim() !== '') {
        try {
            const extra = JSON.parse(config.customParams);
            if (typeof extra === 'object' && extra !== null) {
                // Protect: do NOT allow customParams to overwrite messages/contents arrays
                // (they were already sanitized above — overwriting would bypass all null filters)
                const safeExtra = { ...extra };
                delete safeExtra.messages;
                delete safeExtra.contents;
                Object.assign(body, safeExtra);
            }
        } catch (e) {
            console.error('[Cupcake PM] Failed to parse customParams JSON for Custom Model:', e);
        }
    }

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` };
    // Copilot auto-detection: if URL is githubcopilot.com, auto-fetch API token + attach Copilot headers
    if (config.url && config.url.includes('githubcopilot.com')) {
        // Auto-fetch Copilot API token (exchanges stored GitHub OAuth token for short-lived API token)
        let copilotApiToken = config.copilotToken || '';
        if (!copilotApiToken) {
            copilotApiToken = await ensureCopilotApiToken();
        }
        if (copilotApiToken) {
            headers['Authorization'] = `Bearer ${copilotApiToken}`;
        } else {
            console.warn('[Cupcake PM] Copilot: No API token available. Request may fail auth. Set token via Copilot Manager (🔑 탭).');
        }
        // Required Copilot headers (from cpm-copilot-manager & VS Code Copilot extension)
        headers['Copilot-Integration-Id'] = 'vscode-chat';
        headers['X-Request-Id'] = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
        headers['Editor-Version'] = 'vscode/1.109.2';
        headers['Editor-Plugin-Version'] = 'copilot-chat/0.37.4';
        // Copilot-Vision-Request header: detect vision content in messages
        if (body.messages && body.messages.some(m => Array.isArray(m?.content) && m.content.some(p => p.type === 'image_url'))) {
            headers['Copilot-Vision-Request'] = 'true';
        }
    }

    // --- Streaming support ---
    const useStreaming = !config.decoupled;

    if (useStreaming) {
        // Build streaming request
        const streamBody = { ...body };
        let streamUrl = config.url;

        if (format === 'anthropic') {
            streamBody.stream = true;
        } else if (format === 'google') {
            // Switch endpoint to streamGenerateContent
            streamUrl = config.url.replace(':generateContent', ':streamGenerateContent');
            if (!streamUrl.includes('alt=')) streamUrl += (streamUrl.includes('?') ? '&' : '?') + 'alt=sse';
        } else {
            // OpenAI-compatible
            streamBody.stream = true;
        }

        // Final safety: deep-clone + filter streaming body messages array
        // Deep plain clone ensures no hidden properties survive into the final JSON
        if (streamBody.messages) {
            try { streamBody.messages = JSON.parse(JSON.stringify(streamBody.messages)); } catch (_) {}
            streamBody.messages = streamBody.messages.filter(m => {
                if (m == null || typeof m !== 'object') return false;
                if (m.content === null || m.content === undefined) return false;
                if (typeof m.role !== 'string' || !m.role) return false;
                return true;
            });
        }
        if (streamBody.contents) {
            try { streamBody.contents = JSON.parse(JSON.stringify(streamBody.contents)); } catch (_) {}
            streamBody.contents = streamBody.contents.filter(m => m != null && typeof m === 'object');
        }

        // Use safeStringify (nuclear replacer) → sanitizeBodyJSON (parse+filter+verify)
        const finalBody = sanitizeBodyJSON(safeStringify(streamBody));

        // ── Comprehensive diagnostic: verify final body before fetch ──
        try {
            const _diag = JSON.parse(finalBody);
            if (Array.isArray(_diag.messages)) {
                const _nullIdx = [];
                for (let _i = 0; _i < _diag.messages.length; _i++) {
                    if (_diag.messages[_i] == null) _nullIdx.push(_i);
                }
                if (_nullIdx.length > 0) {
                    console.error(`[Cupcake PM] 🚨 PRE-FETCH: null at messages indices [${_nullIdx.join(',')}] in ${_diag.messages.length} messages! Body preview:`, finalBody.substring(0, 1500));
                } else {
                    console.log(`[Cupcake PM] ✓ Pre-fetch body OK: ${_diag.messages.length} messages, model=${_diag.model}`);
                }
                // Detailed per-message dump for null-message debugging
                for (let _d = 0; _d < _diag.messages.length; _d++) {
                    const _m = _diag.messages[_d];
                    if (_m == null) {
                        console.error(`[Cupcake PM] 📋 messages[${_d}]: *** NULL ***`);
                    } else {
                        const _ct = typeof _m.content;
                        const _cv = _ct === 'string' ? _m.content.substring(0, 60) : (Array.isArray(_m.content) ? `Array(${_m.content.length})` : JSON.stringify(_m.content).substring(0, 60));
                        console.log(`[Cupcake PM] 📋 messages[${_d}]: role=${_m.role}, content_type=${_ct}, keys=[${Object.keys(_m).join(',')}], preview="${_cv}"`);
                    }
                }
                console.log(`[Cupcake PM] 📋 Body length: ${finalBody.length} chars`);
            }
        } catch (_) {}

        const res = await smartNativeFetch(streamUrl, {
            method: 'POST',
            headers,
            body: finalBody
            // NOTE: signal: abortSignal removed — AbortSignal can't cross V3 iframe bridge (postMessage structured clone)
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`[Cupcake PM] Streaming request failed (${res.status}) for ${streamUrl.substring(0, 60)}:`, errBody.substring(0, 500));
            return { success: false, content: `[Custom API Error ${res.status}] ${errBody}` };
        }

        if (format === 'anthropic') {
            return { success: true, content: createAnthropicSSEStream(res, abortSignal) };
        } else if (format === 'google') {
            return { success: true, content: createSSEStream(res, (line) => parseGeminiSSELine(line, config), abortSignal) };
        } else {
            return { success: true, content: createSSEStream(res, parseOpenAISSELine, abortSignal) };
        }
    }

    // --- Non-streaming (decoupled) fallback ---
    const res = await smartNativeFetch(config.url, {
        method: 'POST',
        headers,
        body: sanitizeBodyJSON(safeStringify(body))
        // NOTE: signal: abortSignal removed — AbortSignal can't cross V3 iframe bridge (postMessage structured clone)
    });

    if (!res.ok) {
        const errBody = await res.text();
        console.error(`[Cupcake PM] Non-streaming request failed (${res.status}) for ${config.url.substring(0, 60)}:`, errBody.substring(0, 500));
        return { success: false, content: `[Custom API Error ${res.status}] ${errBody}` };
    }
    const data = await res.json();

    if (format === 'anthropic') {
        let result = '';
        if (Array.isArray(data.content)) {
            for (const block of data.content) if (block.type === 'text') result += block.text;
        }
        return { success: true, content: result };
    } else if (format === 'google') {
        let result = '';
        if (data.candidates?.[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) if (part.text !== undefined && !part.thought) result += part.text;
        }
        return { success: true, content: result };
    } else { // OpenAI compatible
        return { success: true, content: data.choices?.[0]?.message?.content || '' };
    }
}


// ==========================================
// 4. MAIN ROUTER
// ==========================================

async function fetchByProviderId(modelDef, args, abortSignal) {
    // CRITICAL: Use ?? (nullish coalescing) not || (logical OR) for numeric fallbacks.
    // || treats 0 as falsy → temperature=0 would become 0.7, which is wrong.
    // ?? only falls back for null/undefined, preserving valid 0 values.
    //
    // Parameter source chain (highest priority first):
    //   1. CPM slot overrides (cpm_slot_<slot>_temp etc.) — applied in handleRequest()
    //   2. RisuAI separate parameters (db.seperateParameters[mode]) — applied by applyParameters() before plugin call
    //   3. RisuAI main parameters (db.temperature etc.) — applied by applyParameters() when separate params disabled
    //   4. CPM global fallback defaults (cpm_fallback_temp etc.) — user-configurable in CPM settings
    //   5. Hardcoded default for temperature only (0.7) — max_tokens has NO hardcoded fallback
    //      because RisuAI ALWAYS sends max_tokens from db.maxResponse (main model setting),
    //      independent of parameter separation.
    const cpmFallbackTemp = await safeGetArg('cpm_fallback_temp');
    const cpmFallbackMaxTokens = await safeGetArg('cpm_fallback_max_tokens');
    const cpmFallbackTopP = await safeGetArg('cpm_fallback_top_p');
    const cpmFallbackFreqPen = await safeGetArg('cpm_fallback_freq_pen');
    const cpmFallbackPresPen = await safeGetArg('cpm_fallback_pres_pen');

    const temp = args.temperature ?? (cpmFallbackTemp !== '' ? parseFloat(cpmFallbackTemp) : 0.7);
    // max_tokens: RisuAI always sends this from db.maxResponse (main model's setting),
    // regardless of parameter separation. No hardcoded 4096 — main model value is used.
    // CPM global fallback only applies as a safety net if somehow undefined.
    const maxTokens = args.max_tokens ?? (cpmFallbackMaxTokens !== '' ? parseInt(cpmFallbackMaxTokens) : undefined);

    // Apply CPM global fallbacks for optional params (only when RisuAI didn't provide them)
    if (args.top_p === undefined && cpmFallbackTopP !== '') args.top_p = parseFloat(cpmFallbackTopP);
    if (args.frequency_penalty === undefined && cpmFallbackFreqPen !== '') args.frequency_penalty = parseFloat(cpmFallbackFreqPen);
    if (args.presence_penalty === undefined && cpmFallbackPresPen !== '') args.presence_penalty = parseFloat(cpmFallbackPresPen);

    // Diagnostic: log parameter values received from RisuAI (helps debug separate params issues)
    console.log(`[Cupcake PM] 📊 Parameters for ${modelDef.name}: temp=${args.temperature}→${temp}, max_tokens=${args.max_tokens}→${maxTokens}, top_p=${args.top_p}, freq_pen=${args.frequency_penalty}, pres_pen=${args.presence_penalty}, top_k=${args.top_k}, rep_pen=${args.repetition_penalty}, min_p=${args.min_p}`);

    // Deep-sanitize messages — RisuAI's runTrigger (JSON round-trip), V3 iframe
    // postMessage bridge, and replacerbeforeRequest hooks can introduce null entries
    // or leave internal tags ({{inlay::...}}, <qak>) in prompt_chat.
    const rawChat = args.prompt_chat;
    // Diagnostic: check for null entries in raw prompt_chat (helps identify upstream source)
    if (Array.isArray(rawChat)) {
        const nullCount = rawChat.filter(m => m == null).length;
        const badContentCount = rawChat.filter(m => m != null && typeof m === 'object' && (m.content === null || m.content === undefined)).length;
        if (nullCount > 0 || badContentCount > 0) {
            console.warn(`[Cupcake PM] ⚠️ prompt_chat from RisuAI has ${nullCount} null entries and ${badContentCount} null-content entries (total ${rawChat.length} messages)`);
        }
    }
    const messages = sanitizeMessages(rawChat);

    try {
        // Dynamic provider lookup from registered sub-plugins
        const fetcher = customFetchers[modelDef.provider];
        if (fetcher) {
            return await fetcher(modelDef, messages, temp, maxTokens, args, abortSignal);
        }

        // Custom Models Manager (built-in)
        if (modelDef.provider.startsWith('Custom')) {
            const cDef = CUSTOM_MODELS_CACHE.find(m => m.uniqueId === modelDef.uniqueId);
            if (!cDef) return { success: false, content: `[Cupcake PM] Custom model config not found.` };

            return await fetchCustom({
                url: cDef.url, key: cDef.key, model: cDef.model,
                format: cDef.format || 'openai',
                sysfirst: !!cDef.sysfirst, altrole: !!cDef.altrole,
                mustuser: !!cDef.mustuser, maxout: !!cDef.maxout, mergesys: !!cDef.mergesys,
                reasoning: cDef.reasoning || 'none', verbosity: cDef.verbosity || 'none',
                thinking_level: cDef.thinking || 'none', tok: cDef.tok || 'o200k_base',
                decoupled: !!cDef.decoupled, thought: !!cDef.thought,
                customParams: cDef.customParams || '', copilotToken: ''
            }, messages, temp, maxTokens, args, abortSignal);
        }
        return { success: false, content: `[Cupcake PM] Unknown provider selected: ${modelDef.provider}` };
    } catch (e) {
        return { success: false, content: `[Cupcake PM Crash] ${e.message}` };
    }
}

async function handleRequest(args, activeModelDef, abortSignal) {
    // ── Parameter Flow Documentation ──
    // RisuAI V3 forces args.mode='v3' for security, so we cannot know the original
    // request mode (translate/memory/emotion/submodel). However, the PARAMETERS
    // (temperature, top_p, etc.) are already correctly applied by RisuAI's
    // applyParameters() BEFORE they reach this plugin:
    //
    //   - If db.seperateParametersEnabled=true in RisuAI:
    //     → args.temperature etc. come from db.seperateParameters[originalMode]
    //     → These are the mode-specific separate parameter values the user configured
    //   - If db.seperateParametersEnabled=false (default):
    //     → args.temperature etc. come from db.temperature/100, db.top_p, etc.
    //     → These are the main model's parameter values
    //   - If separate params enabled but not configured for a mode:
    //     → args.temperature etc. are UNDEFINED (RisuAI skips NaN values)
    //     → Cupcake falls back to defaults (0.7 temp) or CPM slot overrides
    //
    // CPM's own slot parameter system provides an ADDITIONAL override layer on top
    // of whatever RisuAI sends. CPM slot params only apply when:
    //   1. The model is explicitly assigned to a CPM slot (translation/emotion/memory/other)
    //   2. The slot param field is non-empty in CPM settings

    // V3 forces args.mode='v3', so we infer the slot from CPM's own slot config.
    const slot = await inferSlot(activeModelDef);

    // Diagnostic: log what RisuAI passed us BEFORE any CPM overrides
    console.log(`[Cupcake PM] 📥 Received from RisuAI — mode=${args.mode}, temp=${args.temperature}, top_p=${args.top_p}, freq_pen=${args.frequency_penalty}, pres_pen=${args.presence_penalty}, max_tokens=${args.max_tokens}, slot=${slot}, model=${activeModelDef.name}`);

    // Route to the provider that the UI / RisuAI selected
    let targetDef = activeModelDef;

    // If this model is assigned to an aux slot, apply generation param overrides
    if (slot !== 'chat') {
        console.log(`[Cupcake PM] Aux slot detected: '${slot}' for model '${activeModelDef.name}'`);

        // Override generation params if provided for this slot.
        // Empty string = don't override (keep RisuAI's value or CPM global fallback).
        // IMPORTANT: Use !== '' check, not truthiness, to allow explicit 0 values.
        // safeGetArg returns '' for unset fields, '0' for explicit zero.
        const maxOut = await safeGetArg(`cpm_slot_${slot}_max_out`);
        const maxCtx = await safeGetArg(`cpm_slot_${slot}_max_context`);
        const slotTemp = await safeGetArg(`cpm_slot_${slot}_temp`);
        const topP = await safeGetArg(`cpm_slot_${slot}_top_p`);
        const topK = await safeGetArg(`cpm_slot_${slot}_top_k`);
        const repPen = await safeGetArg(`cpm_slot_${slot}_rep_pen`);
        const freqPen = await safeGetArg(`cpm_slot_${slot}_freq_pen`);
        const presPen = await safeGetArg(`cpm_slot_${slot}_pres_pen`);

        if (maxOut !== '') args.max_tokens = parseInt(maxOut);
        if (maxCtx !== '') args.max_context_tokens = parseInt(maxCtx);
        if (slotTemp !== '') args.temperature = parseFloat(slotTemp);
        if (topP !== '') args.top_p = parseFloat(topP);
        if (topK !== '') args.top_k = parseInt(topK);
        if (repPen !== '') args.repetition_penalty = parseFloat(repPen);
        if (freqPen !== '') args.frequency_penalty = parseFloat(freqPen);
        if (presPen !== '') args.presence_penalty = parseFloat(presPen);

        console.log(`[Cupcake PM] 📝 After CPM slot overrides — temp=${args.temperature}, top_p=${args.top_p}, freq_pen=${args.frequency_penalty}, pres_pen=${args.presence_penalty}, max_tokens=${args.max_tokens}`);
    }

    const result = await fetchByProviderId(targetDef, args, abortSignal);

    // ALWAYS collect ReadableStream into a plain string before returning.
    //
    // Why: RisuAI's requestPlugin returns type:'streaming' when content is a
    // ReadableStream, but translateLLM (LLM translation) rejects streaming
    // responses and skips cache saving. Since V3 bridge overrides mode to 'v3',
    // the plugin cannot distinguish translation from chat requests.
    //
    // By always returning a string, requestPlugin returns type:'success',
    // which allows translateLLM to properly cache retranslated results.
    // For chat, the full response appears at once (no progressive streaming),
    // but this is the expected behavior in V3 sandboxed iframe environments
    // where ReadableStream transfer is unreliable.
    if (result && result.success && result.content instanceof ReadableStream) {
        result.content = await collectStream(result.content);
    }

    return result;
}

// ==========================================
// 5. REGISTRATION / INIT
// ==========================================

(async () => {
    try {
        // --- 0. Bypass RisuAI V3 Event Listener Restrictions ---
        try {
            const rootDoc = await risuai.getRootDocument();
            const rootBody = await rootDoc.querySelector('body');
            const rootWindow = await rootDoc.defaultView;

            if (rootBody && typeof rootBody.addEventListener === 'function') {
                const proto = Object.getPrototypeOf(rootBody);
                if (proto && typeof proto.addEventListener === 'function' && !proto.__cpmV3Patched) {
                    const originalAddEventListener = proto.addEventListener;
                    proto.addEventListener = function (type, listener, options) {
                        if (this.__originalElement && typeof this.__originalElement.addEventListener === 'function') {
                            return this.__originalElement.addEventListener(type, listener, options);
                        }
                        return originalAddEventListener.apply(this, [type, listener, options]);
                    };
                    proto.__cpmV3Patched = true;
                    console.log('[Cupcake PM] SafeElement.addEventListener patched.');
                }
            }

            if (rootWindow && typeof rootWindow.addEventListener === 'function') {
                window.__cpmRootWindow = rootWindow;
                const proto = Object.getPrototypeOf(rootWindow);
                if (proto && typeof proto.addEventListener === 'function' && !proto.__cpmV3Patched) {
                    const originalWindowAddListener = proto.addEventListener;
                    proto.addEventListener = function (type, listener, options) {
                        if (this.__originalWindow && typeof this.__originalWindow.addEventListener === 'function') {
                            return this.__originalWindow.addEventListener(type, listener, options);
                        }
                        return originalWindowAddListener.apply(this, [type, listener, options]);
                    };
                    proto.__cpmV3Patched = true;
                    console.log('[Cupcake PM] SafeWindow.addEventListener patched.');
                }
            }
        } catch (e) {
            console.error('[CPM] V3 Event patch failed:', e);
        }

        // Load & Execute Sub-Plugins FIRST (they register providers via CupcakePM.registerProvider)
        await SubPluginManager.loadRegistry();
        await SubPluginManager.executeEnabled();

        // Restore settings from pluginStorage backup if @arg values were wiped (plugin reinstall)
        await SettingsBackup.load();
        const restoredCount = await SettingsBackup.restoreIfEmpty();
        if (restoredCount > 0) {
            console.log(`[CPM] Auto-restored ${restoredCount} settings from persistent backup.`);
        }

        // ===== Dynamic Model Fetching (공식 API에서 모델 목록 자동 갱신) =====
        for (const { name, fetchDynamicModels } of pendingDynamicFetchers) {
            try {
                const enabled = await isDynamicFetchEnabled(name);
                if (!enabled) {
                    console.log(`[CupcakePM] Dynamic fetch disabled for ${name}, using fallback.`);
                    continue;
                }
                console.log(`[CupcakePM] Fetching dynamic models for ${name}...`);
                const dynamicModels = await fetchDynamicModels();
                if (dynamicModels && Array.isArray(dynamicModels) && dynamicModels.length > 0) {
                    ALL_DEFINED_MODELS = ALL_DEFINED_MODELS.filter(m => m.provider !== name);
                    for (const m of dynamicModels) {
                        ALL_DEFINED_MODELS.push({ ...m, provider: name });
                    }
                    console.log(`[CupcakePM] ✓ Dynamic models for ${name}: ${dynamicModels.length} models`);
                } else {
                    console.log(`[CupcakePM] No dynamic models for ${name}, using fallback.`);
                }
            } catch (e) {
                console.warn(`[CupcakePM] Dynamic fetch failed for ${name}:`, e.message || e);
            }
        }

        // Custom models migration
        const customModelsJson = await safeGetArg('cpm_custom_models', '[]');
        try {
            CUSTOM_MODELS_CACHE = JSON.parse(customModelsJson);
            if (!Array.isArray(CUSTOM_MODELS_CACHE)) CUSTOM_MODELS_CACHE = [];
        } catch (e) {
            CUSTOM_MODELS_CACHE = [];
        }

        // --- Backward Compatibility: Auto-Migrate from C1-C9 to JSON ---
        if (CUSTOM_MODELS_CACHE.length === 0) {
            let migrated = false;
            for (let i = 1; i <= 9; i++) {
                const legacyUrl = await safeGetArg(`cpm_c${i}_url`);
                CUSTOM_MODELS_CACHE.push({
                    uniqueId: `custom${i}`,
                    name: await safeGetArg(`cpm_c${i}_name`) || `Custom ${i}`,
                    model: await safeGetArg(`cpm_c${i}_model`) || '',
                    url: legacyUrl || '',
                    key: await safeGetArg(`cpm_c${i}_key`) || '',
                    format: await safeGetArg(`cpm_c${i}_format`) || 'openai',
                    sysfirst: await safeGetBoolArg(`cpm_c${i}_sysfirst`),
                    altrole: await safeGetBoolArg(`cpm_c${i}_altrole`),
                    mustuser: await safeGetBoolArg(`cpm_c${i}_mustuser`),
                    maxout: await safeGetBoolArg(`cpm_c${i}_maxout`),
                    mergesys: await safeGetBoolArg(`cpm_c${i}_mergesys`),
                    decoupled: await safeGetBoolArg(`cpm_c${i}_decoupled`),
                    thought: await safeGetBoolArg(`cpm_c${i}_thought`),
                    reasoning: await safeGetArg(`cpm_c${i}_reasoning`) || 'none',
                    verbosity: await safeGetArg(`cpm_c${i}_verbosity`) || 'none',
                    thinking: await safeGetArg(`cpm_c${i}_thinking`) || 'none',
                    tok: await safeGetArg(`cpm_c${i}_tok`) || 'o200k_base',
                    customParams: ''
                });
                migrated = true;
            }
            if (migrated) {
                risuai.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
            }
        }

        CUSTOM_MODELS_CACHE.forEach(m => {
            ALL_DEFINED_MODELS.push({
                uniqueId: m.uniqueId,
                id: m.model,
                name: m.name || m.uniqueId,
                provider: `Custom` // Used for grouping
            });
        });

        // Sort ALL_DEFINED_MODELS alphabetically by provider, then by name
        ALL_DEFINED_MODELS.sort((a, b) => {
            const providerCompare = a.provider.localeCompare(b.provider);
            if (providerCompare !== 0) return providerCompare;
            return a.name.localeCompare(b.name);
        });

        // Format: `🧁 [GoogleAI] Gemini 2.5 Flash`
        for (const modelDef of ALL_DEFINED_MODELS) {
            let pLabel = modelDef.provider;
            let mLabel = modelDef.name;
            await Risuai.addProvider(`🧁 [${pLabel}] ${mLabel}`, async (args, abortSignal) => {
                try {
                    return await handleRequest(args, modelDef, abortSignal);
                } catch (err) {
                    return { success: false, content: `[Cupcake SDK Fallback Crash] ${err.message}` };
                }
            });
        }

        // Setup the Native Sidebar UI settings
        const openCpmSettings = async () => {
            risuai.showContainer('fullscreen');

            // Tailwind CSS
            if (!document.getElementById('cpm-tailwind')) {
                const tw = document.createElement('script');
                tw.id = 'cpm-tailwind'; tw.src = 'https://cdn.tailwindcss.com';
                document.head.appendChild(tw);
                await new Promise(r => tw.onload = r);
            }

            document.body.innerHTML = '';
            document.body.style.cssText = 'margin:0; background:#1e1e24; color:#d1d5db; font-family:-apple-system, sans-serif; height:100vh; overflow:hidden;';

            const getVal = async (k) => await safeGetArg(k);
            const getBoolVal = async (k) => await safeGetBoolArg(k);
            const setVal = (k, v) => {
                risuai.setArgument(k, String(v));
                // Also persist to pluginStorage backup
                SettingsBackup.updateKey(k, String(v));
            };

            const renderInput = async (id, label, type = 'text', opts = []) => {
                let html = `<div class="mb-4">`;
                if (type === 'checkbox') {
                    const val = await getBoolVal(id);
                    html += `<label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                                   <input id="${id}" type="checkbox" ${val ? 'checked' : ''} class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                                   <span>${label}</span>
                                 </label></div>`;
                } else if (type === 'select') {
                    const val = await getVal(id);
                    html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                    html += `<select id="${id}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500">`;
                    opts.forEach(o => html += `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.text}</option>`);
                    html += `</select></div>`;
                } else if (type === 'textarea') {
                    const val = await getVal(id);
                    html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                    html += `<textarea id="${id}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 h-24" spellcheck="false">${val}</textarea></div>`;
                } else {
                    const val = await getVal(id);
                    html += `<label class="block text-sm font-medium text-gray-400 mb-1">${label}</label>`;
                    html += `<input id="${id}" type="${type}" value="${val}" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"></div>`;
                }
                return html;
            };

            // Removed renderCustomTab helper

            const container = document.createElement('div');
            container.className = 'flex flex-col md:flex-row h-full';

            const sidebar = document.createElement('div');
            sidebar.className = 'w-full md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col pt-2 shrink-0 z-50 relative';
            sidebar.innerHTML = `
                    <div class="h-14 flex items-center justify-between px-6 border-b border-gray-700 md:border-none cursor-pointer md:cursor-default" id="cpm-mobile-menu-btn">
                        <h2 class="text-lg font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">🧁 Cupcake PM v${CPM_VERSION}</h2>
                        <span class="md:hidden text-gray-400 text-xl" id="cpm-mobile-icon">▼</span>
                    </div>
                    
                    <div id="cpm-mobile-dropdown" class="hidden md:flex flex-col absolute md:static top-full left-0 w-full md:w-auto bg-gray-900 border-b border-gray-700 md:border-none shadow-xl md:shadow-none z-[100] h-auto max-h-[70vh] md:max-h-none md:h-full overflow-hidden flex-1">
                        <div class="flex-1 overflow-y-auto py-2 pr-2" id="cpm-tab-list">
                        <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-2">Common</div>
                        <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-cyan-300 font-semibold" data-target="tab-global">🎛️ 글로벌 기본값</button>
                        
                        <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">Aux Slots (Map Mode)</div>
                        <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-trans">🌐 번역 (Trans)</button>
                        <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-emo">😊 감정 판독 (Emotion)</button>
                        <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-mem">🧠 하이파 (Mem)</button>
                        <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-other">⚙️ 트리거/루아 (Other)</button>
                        
                        <div id="cpm-provider-tabs-section"></div>
                        
                        <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Custom Providers</div>
                        <button class="w-full text-left px-5 py-2 text-sm flex items-center justify-between hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="tab-customs">
                            <span>🛠️ Custom Models Manager</span>
                            <span class="bg-blue-600 text-xs px-2 py-0.5 rounded-full" id="cpm-cm-count">0</span>
                        </button>
                        
                        <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Extensions</div>
                        <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-yellow-300 font-bold bg-yellow-900/10" data-target="tab-plugins">🧩 Sub-Plugins</button>
                        
                        </div>
                        <div class="p-4 border-t border-gray-800 space-y-2 shrink-0 bg-gray-900 z-10 relative" id="cpm-tab-footer">
                            <button id="cpm-export-btn" class="w-full bg-blue-600/90 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm">⬇️ 설정 내보내기</button>
                            <button id="cpm-import-btn" class="w-full bg-blue-600/90 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm">⬆️ 설정 불러오기</button>
                            <button id="cpm-close-btn" class="w-full bg-red-600/90 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow-[0_0_10px_rgba(239,68,68,0.5)]">✕ Close Settings</button>
                        </div>
                    </div>
                `;

            const content = document.createElement('div');
            content.className = 'flex-1 bg-[#121214] overflow-y-auto p-5 md:p-10';

            const providersList = [
                { value: '', text: '🚫 미지정 (Main UI의 모델이 처리)' }
            ];
            for (const m of ALL_DEFINED_MODELS) {
                providersList.push({ value: m.uniqueId, text: `[${m.provider}] ${m.name}` });
            }

            const reasoningList = [{ value: 'none', text: 'None (없음)' }, { value: 'off', text: 'Off (끄기)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
            const verbosityList = [{ value: 'none', text: 'None (기본값)' }, { value: 'low', text: 'Low (낮음)' }, { value: 'medium', text: 'Medium (중간)' }, { value: 'high', text: 'High (높음)' }];
            const thinkingList = [{ value: 'off', text: 'Off (끄기)' }, { value: 'none', text: 'None (없음)' }, { value: 'MINIMAL', text: 'Minimal (최소)' }, { value: 'LOW', text: 'Low (낮음)' }, { value: 'MEDIUM', text: 'Medium (중간)' }, { value: 'HIGH', text: 'High (높음)' }];

            const renderAuxParams = async (slot) => `
                    <div class="mt-8 pt-6 border-t border-gray-800 space-y-2">
                        <h4 class="text-xl font-bold text-gray-300 mb-2">Generation Parameters (생성 설정)</h4>
                        <p class="text-xs text-blue-400 font-semibold mb-4 border-l-2 border-blue-500 pl-2">
                            여기 값을 입력하면 리스AI 설정(파라미터 분리 포함) 대신 이 값이 우선 적용됩니다.<br/>
                            비워두면 리스AI의 '파라미터 분리' 설정값이 사용되고, 파라미터 분리도 미설정이면 메인 모델 설정값이 사용됩니다.<br/>
                            <span class="text-gray-500">(CPM slot override &gt; RisuAI separate params &gt; RisuAI main params &gt; default 0.7)</span>
                        </p>
                        ${await renderInput(`cpm_slot_${slot}_max_context`, 'Max Context Tokens (최대 컨텍스트)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_max_out`, 'Max Output Tokens (최대 응답 크기)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_temp`, 'Temperature (온도)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_top_p`, 'Top P (오답 컷팅)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_top_k`, 'Top K (오답 컷팅)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_rep_pen`, 'Repetition Penalty (반복 페널티)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_freq_pen`, 'Frequency Penalty (빈도 페널티)', 'number')}
                        ${await renderInput(`cpm_slot_${slot}_pres_pen`, 'Presence Penalty (존재 페널티)', 'number')}
                    </div>
                `;

            content.innerHTML = `
                    <div id="tab-trans" class="cpm-tab-content">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">번역 백그라운드 설정 (Translation)</h3>
                        <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">
                            메인 UI에서 선택한 [메인 챗] 프로바이더와 다르게, 번역 태스크만 자동으로 납치하여 전담할 프로바이더를 선택합니다.
                        </p>
                        ${await renderInput('cpm_slot_translation', '번역 전담 모델 선택 (Translation Model)', 'select', providersList)}
                        ${await renderAuxParams('translation')}
                    </div>
                    <div id="tab-emo" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">감정 판독 백그라운드 설정 (Emotion)</h3>
                        <p class="text-pink-300 font-semibold mb-6 border-l-4 border-pink-500 pl-4 py-1">
                            캐릭터 리액션/표정 태스크를 낚아채서 처리할 작고 빠른 모델을 지정하세요.
                        </p>
                        ${await renderInput('cpm_slot_emotion', '감정 판독 전담 모델 (Emotion/Hypa)', 'select', providersList)}
                        ${await renderAuxParams('emotion')}
                    </div>
                    <div id="tab-mem" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">하이파 백그라운드 설정 (Memory)</h3>
                        <p class="text-yellow-300 font-semibold mb-6 border-l-4 border-yellow-500 pl-4 py-1">
                            채팅 메모리 요약 등 긴 텍스트 축약 역할을 전담할 모델을 지정하세요.
                        </p>
                        ${await renderInput('cpm_slot_memory', '하이파 전담 모델 (Memory/Summarize)', 'select', providersList)}
                        ${await renderAuxParams('memory')}
                    </div>
                    <div id="tab-global" class="cpm-tab-content">
                        <h3 class="text-3xl font-bold text-cyan-400 mb-6 pb-3 border-b border-gray-700">🎛️ 글로벌 기본값 (Global Fallback Parameters)</h3>
                        <p class="text-cyan-300 font-semibold mb-4 border-l-4 border-cyan-500 pl-4 py-1">
                            리스AI가 파라미터를 보내지 않을 때 (파라미터 분리 ON + 미설정 등) 여기 값이 사용됩니다.
                        </p>
                        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
                            <h4 class="text-sm font-bold text-gray-300 mb-3">📋 파라미터 우선순위 (높은 순서)</h4>
                            <div class="text-xs text-gray-400 space-y-1">
                                <div class="flex items-center"><span class="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">1</span> CPM 슬롯 오버라이드 (번역/감정/하이파/기타 탭에서 모델 지정 + 파라미터 설정)</div>
                                <div class="flex items-center"><span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">2</span> 리스AI 파라미터 분리 값 (리스AI 설정에서 보조모델별 파라미터 설정)</div>
                                <div class="flex items-center"><span class="bg-green-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">3</span> 리스AI 메인 모델 파라미터 (파라미터 분리 꺼짐일 때)</div>
                                <div class="flex items-center"><span class="bg-cyan-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">4</span> <strong class="text-cyan-300">⭐ 여기: CPM 글로벌 기본값</strong></div>
                                <div class="flex items-center"><span class="bg-gray-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0">5</span> 하드코딩 기본값 (Temperature 0.7 / Max Tokens 4096)</div>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500 mb-6">
                            💡 <strong>사용 예시:</strong> 리스AI에서 파라미터 분리를 켜고 보조모델 파라미터를 설정하지 않았을 때,<br/>
                            여기 글로벌 기본값이 하드코딩 0.7 대신 사용됩니다. 비워두면 기존처럼 0.7/4096이 적용됩니다.
                        </p>
                        <div class="space-y-2">
                            ${await renderInput('cpm_fallback_temp', 'Default Temperature (기본 온도, 비워두면 0.7)', 'number')}
                            ${await renderInput('cpm_fallback_max_tokens', 'Default Max Output Tokens (비워두면 메인모델 최대응답 설정 따름)', 'number')}
                            ${await renderInput('cpm_fallback_top_p', 'Default Top P (기본 Top P, 비워두면 API 기본값)', 'number')}
                            ${await renderInput('cpm_fallback_freq_pen', 'Default Frequency Penalty (기본 빈도 페널티, 비워두면 API 기본값)', 'number')}
                            ${await renderInput('cpm_fallback_pres_pen', 'Default Presence Penalty (기본 존재 페널티, 비워두면 API 기본값)', 'number')}
                        </div>
                    </div>

                    <div id="tab-other" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">트리거/루아 백그라운드 설정 (Other)</h3>
                        ${await renderInput('cpm_slot_other', 'Lua 스크립트 등 무거운 유틸 전담 모델 (Other/Trigger)', 'select', providersList)}
                        ${await renderAuxParams('other')}
                    </div>                    <div id="cpm-dynamic-provider-content"></div>

                    <div id="tab-customs" class="cpm-tab-content hidden">
                        <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                            <h3 class="text-3xl font-bold text-gray-400">Custom Models Manager</h3>
                            <div class="flex space-x-2">
                                <button id="cpm-import-model-btn" class="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">📥 Import Model</button>
                                <button id="cpm-add-custom-btn" class="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">➕ Add Model</button>
                            </div>
                        </div>
                        
                        <div id="cpm-cm-list" class="space-y-3">
                            <!-- JS will inject list items here -->
                        </div>

                        <div id="cpm-cm-editor" class="hidden mt-6 bg-gray-900 border border-gray-700 rounded-lg p-6 relative">
                            <h4 class="text-xl font-bold text-blue-400 mb-4 border-b border-gray-700 pb-2" id="cpm-cm-editor-title">Edit Custom Model</h4>
                            <input type="hidden" id="cpm-cm-id" value="">
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="md:col-span-2 text-xs text-blue-300 mb-2 border-l-4 border-blue-500 pl-3">
                                    고급 옵션이 필요 없는 경우, 필수 항목만 입력하고 저장하세요. API 규격은 기본적으로 OpenAI와 호환됩니다.
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Display Name (UI 표시 이름)</label>
                                    <input type="text" id="cpm-cm-name" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Model Name (API 요청 모델명)</label>
                                    <input type="text" id="cpm-cm-model" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Base URL</label>
                                    <input type="text" id="cpm-cm-url" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-400 mb-1">API Key</label>
                                    <input type="password" id="cpm-cm-key" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                </div>
                                
                                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                                    <h5 class="text-sm font-bold text-gray-300 mb-3">Model Parameters (모델 매개변수)</h5>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">API Format / Spec (API 규격)</label>
                                    <select id="cpm-cm-format" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        <option value="openai">OpenAI (Default/기본값)</option>
                                        <option value="anthropic">Anthropic Claude</option>
                                        <option value="google">Google Gemini Studio</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Tokenizer Type (토크나이저 종류)</label>
                                    <select id="cpm-cm-tok" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        <option value="o200k_base">o200k_base (OpenAI)</option>
                                        <option value="llama3">llama3</option>
                                        <option value="claude">Claude</option>
                                        <option value="gemma">Gemma</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Thinking Level / Budget Tokens (생각 수준)</label>
                                    <select id="cpm-cm-thinking" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${thinkingList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Reasoning Effort (추론 수준)</label>
                                    <select id="cpm-cm-reasoning" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${reasoningList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-400 mb-1">Response Verbosity (응답 상세)</label>
                                    <select id="cpm-cm-verbosity" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white">
                                        ${verbosityList.map(o => `<option value="${o.value}">${o.text}</option>`).join('')}
                                    </select>
                                </div>
                                <div></div> <!-- spacing -->
                                
                                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Formatter Flags (커스텀 포맷터 설정)</h5>
                                    <div class="space-y-2">
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-sysfirst" class="form-checkbox bg-gray-800"> <span>hasFirstSystemPrompt (시스템 프롬프트를 맨 위로 강제 이동)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mergesys" class="form-checkbox bg-gray-800"> <span>mergeSystemPrompt (시스템 프롬프트를 첫 번째 사용자 메시지와 병합)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-altrole" class="form-checkbox bg-gray-800"> <span>requiresAlternateRole (Assistant 역할을 Model 역할로 변경)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-mustuser" class="form-checkbox bg-gray-800"> <span>mustStartWithUserInput (첫 번째 메시지를 사용자 역할로 강제 시작)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-maxout" class="form-checkbox bg-gray-800"> <span>useMaxOutputTokensInstead (max_tokens 대신 max_output_tokens 사용)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-decoupled" class="form-checkbox bg-gray-800"> <span>decoupledStreaming (스트리밍 플래그 비활성화/전환)</span></label>
                                        <label class="flex items-center space-x-2 text-sm text-gray-300"><input type="checkbox" id="cpm-cm-thought" class="form-checkbox bg-gray-800"> <span>useThoughtSignature (생각 서명 추출 사용)</span></label>
                                    </div>
                                </div>
                                
                                <div class="md:col-span-2 mt-4 border-t border-gray-800 pt-4">
                                    <h5 class="text-sm font-bold text-gray-300 mb-3">Custom Parameters (Additional JSON Payload)</h5>
                                    <p class="text-xs text-gray-500 mb-2">API Body 최상단에 직접 병합(Merge)할 JSON을 작성하세요. 예시: <code>{"top_p": 0.9, "presence_penalty": 0.1}</code></p>
                                    <textarea id="cpm-cm-custom-params" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white h-24 font-mono text-sm" spellcheck="false" placeholder="{}"></textarea>
                                </div>
                            </div>

                            <div class="mt-4 flex justify-end space-x-3 border-t border-gray-800 pt-4">
                                <button id="cpm-cm-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">Cancel</button>
                                <button id="cpm-cm-save" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-bold shadow">Save Definition</button>
                            </div>
                        </div>
                        <p class="text-xs font-bold text-gray-500 mt-4">* Additions/deletions require refreshing RisuAI (F5) to appear in the native dropdown menu.</p>
                    </div>

                    <div id="tab-plugins" class="cpm-tab-content hidden">
                        <div class="flex justify-between items-center mb-6 pb-3 border-b border-gray-700">
                            <h3 class="text-3xl font-bold text-gray-400">Sub-Plugins Manager</h3>
                            <button id="cpm-check-updates-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">🔄 서브 플러그인 업데이트 확인</button>
                        </div>
                        <p class="text-yellow-300 font-semibold mb-4 border-l-4 border-yellow-500 pl-4 py-1">
                            Cupcake PM에 연동된 외부 확장 기능(Sub-Plugins)들을 통합 관리합니다.
                        </p>
                        <div id="cpm-update-status" class="hidden mb-4"></div>
                        <div id="cpm-plugins-list" class="space-y-4">
                            <!-- JS will inject registered sub-plugins here -->
                        </div>
                    </div>
                `;

            // Sub-Plugins UI renderer
            const renderPluginsTab = () => {
                const listContainer = document.getElementById('cpm-plugins-list');
                if (!listContainer) return;

                let html = `
                    <div class="bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:bg-gray-700 transition-colors cursor-pointer mb-6" id="cpm-btn-upload-plugin">
                        <div class="text-4xl mb-2">📥</div>
                        <h4 class="text-lg font-bold text-gray-200">설치할 서브 플러그인 선택 (.js)</h4>
                        <p class="text-sm text-gray-400 mt-1">파일을 클릭하여 업로드하세요</p>
                        <input type="file" id="cpm-file-plugin" accept=".js" class="hidden">
                    </div>
                `;

                if (SubPluginManager.plugins.length === 0) {
                    html += '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded block">설치된 서브 플러그인이 없습니다.</div>';
                } else {
                    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
                    for (const p of SubPluginManager.plugins) {
                        html += `
                            <div class="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-gray-500 transition-colors relative">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex-1 pr-4">
                                        <h4 class="text-xl font-bold text-white flex items-center space-x-2">
                                            <span>${p.icon || '🧩'}</span>
                                            <span>${p.name}</span>
                                            ${p.version ? `<span class="bg-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded-full ml-2">v${p.version}</span>` : ''}
                                            ${p.updateUrl ? `<span class="bg-gray-800 text-gray-500 text-[10px] px-2 py-0.5 rounded-full ml-1" title="자동 업데이트 가능">🔗</span>` : ''}
                                        </h4>
                                        <p class="text-sm text-gray-400 mt-1">${p.description || 'No description provided.'}</p>
                                    </div>
                                    <div class="flex flex-col items-end space-y-2">
                                        <label class="flex items-center cursor-pointer">
                                            <div class="relative">
                                                <input type="checkbox" class="sr-only cpm-plugin-toggle" data-id="${p.id}" ${p.enabled ? 'checked' : ''}>
                                                <div class="block bg-gray-600 w-10 h-6 rounded-full custom-toggle-bg transition-colors"></div>
                                                <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform"></div>
                                            </div>
                                        </label>
                                        <button class="cpm-plugin-delete text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 bg-gray-700 rounded" data-id="${p.id}">🗑️ 삭제</button>
                                    </div>
                                </div>
                                <div class="border-t border-gray-700 pt-3 mt-3 plugin-ui-container" id="plugin-ui-${p.id}">
                                </div>
                            </div>
                        `;
                    }
                    html += '</div>';

                    html += '<style>.cpm-plugin-toggle:checked ~ .custom-toggle-bg{background-color:#3b82f6;} .cpm-plugin-toggle:checked ~ .dot{transform:translateX(100%);}</style>';
                }

                listContainer.innerHTML = html;

                // Events for upload
                const btnUpload = document.getElementById('cpm-btn-upload-plugin');
                const pFileInput = document.getElementById('cpm-file-plugin');
                if (btnUpload && pFileInput) {
                    btnUpload.addEventListener('click', () => pFileInput.click());
                    pFileInput.addEventListener('change', async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                            const code = ev.target.result;
                            const name = await SubPluginManager.install(code);
                            // Hot-reload: 즉시 적용 (새로고침 불필요)
                            const installed = SubPluginManager.plugins.find(p => p.name === name);
                            if (installed) await SubPluginManager.hotReload(installed.id);
                            alert(`서브 플러그인 '${name}' 설치 완료! 바로 적용되지만 새로고침을 권장합니다.`);
                            renderPluginsTab();
                        };
                        reader.readAsText(file);
                    });
                }

                // Events for toggles and deletes
                listContainer.querySelectorAll('.cpm-plugin-toggle').forEach(t => {
                    t.addEventListener('change', async (e) => {
                        const id = e.target.getAttribute('data-id');
                        await SubPluginManager.toggle(id, e.target.checked);
                        // Hot-reload: 즉시 적용
                        await SubPluginManager.hotReload(id);
                        alert('설정이 저장되었습니다. 바로 적용되지만 새로고침을 권장합니다.');
                    });
                });
                listContainer.querySelectorAll('.cpm-plugin-delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = e.target.getAttribute('data-id');
                        if (confirm('정말로 이 플러그인을 삭제하시겠습니까?')) {
                            SubPluginManager.unloadPlugin(id);
                            await SubPluginManager.remove(id);
                            renderPluginsTab();
                        }
                    });
                });

                // Update check button
                const updateBtn = document.getElementById('cpm-check-updates-btn');
                if (updateBtn) {
                    updateBtn.addEventListener('click', async () => {
                        const statusDiv = document.getElementById('cpm-update-status');
                        updateBtn.disabled = true;
                        updateBtn.textContent = '⏳ 확인 중...';
                        statusDiv.classList.remove('hidden');
                        statusDiv.innerHTML = '<p class="text-gray-400 text-sm">업데이트를 확인하고 있습니다...</p>';
                        try {
                            const updates = await SubPluginManager.checkAllUpdates();
                            if (updates.length === 0) {
                                statusDiv.innerHTML = '<p class="text-green-400 text-sm font-semibold bg-green-900/30 rounded p-3">✅ 모든 서브 플러그인이 최신 버전입니다.</p>';
                            } else {
                                // Store update data in a Map (not in HTML attributes) to avoid encoding issues
                                const pendingUpdates = new Map();
                                let html = `<div class="bg-indigo-900/30 rounded p-3 space-y-3">`;
                                html += `<p class="text-indigo-300 text-sm font-semibold">🔔 ${updates.length}개의 업데이트가 있습니다.</p>`;
                                for (const u of updates) {
                                    pendingUpdates.set(u.plugin.id, { code: u.code, name: u.plugin.name });
                                    const hasCode = !!u.code;
                                    html += `<div class="flex items-center justify-between bg-gray-800 rounded p-2">`;
                                    html += `<div><span class="text-white font-semibold">${u.plugin.icon || '🧩'} ${u.plugin.name}</span>`;
                                    html += `<span class="text-gray-400 text-xs ml-2">v${u.localVersion} → <span class="text-green-400">v${u.remoteVersion}</span></span></div>`;
                                    if (hasCode) {
                                        html += `<button class="cpm-apply-update bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1 rounded" data-id="${u.plugin.id}">⬆️ 업데이트</button>`;
                                    } else {
                                        html += `<span class="text-red-400 text-xs">⚠️ 코드 다운로드 실패</span>`;
                                    }
                                    html += `</div>`;
                                }
                                html += `</div>`;
                                statusDiv.innerHTML = html;
                                // Bind update apply buttons
                                statusDiv.querySelectorAll('.cpm-apply-update').forEach(btn => {
                                    btn.addEventListener('click', async (e) => {
                                        const id = e.target.getAttribute('data-id');
                                        const updateData = pendingUpdates.get(id);
                                        if (!updateData || !updateData.code) { e.target.textContent = '❌ 코드 없음'; return; }
                                        e.target.disabled = true;
                                        e.target.textContent = '⏳ 적용 중...';
                                        const ok = await SubPluginManager.applyUpdate(id, updateData.code);
                                        if (ok) {
                                            // Hot-reload: 즉시 적용 (새로고침 불필요)
                                            await SubPluginManager.hotReload(id);
                                            e.target.textContent = '✅ 완료';
                                            e.target.classList.replace('bg-green-600', 'bg-gray-600');
                                            pendingUpdates.delete(id);
                                            alert('업데이트 완료! 바로 적용되지만 새로고침을 권장합니다.');
                                        } else {
                                            e.target.textContent = '❌ 실패';
                                        }
                                    });
                                });
                            }
                        } catch (err) {
                            console.error('[CPM Update Check]', err);
                            statusDiv.innerHTML = '<p class="text-red-400 text-sm font-semibold bg-red-900/30 rounded p-3">❌ 업데이트 확인 중 오류가 발생했습니다.</p>';
                        }
                        updateBtn.disabled = false;
                        updateBtn.textContent = '🔄 업데이트 확인';
                    });
                }

                // Render dynamic UIs for enabled plugins if they registered to CupcakePM_SubPlugins
                window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
                for (const p of window.CupcakePM_SubPlugins) {
                    const uiContainer = document.getElementById(`plugin-ui-${p.id}`);
                    if (uiContainer) {
                        try {
                            if (p.uiHtml) uiContainer.innerHTML = p.uiHtml;
                            if (typeof p.onRender === 'function') p.onRender(uiContainer, safeGetArg, setVal);
                        } catch (err) {
                            console.error(`UI Error for ${p.id}:`, err);
                        }
                    }
                }
            };

            container.appendChild(sidebar);
            container.appendChild(content);
            document.body.appendChild(container);

            // Dynamically render provider tabs from registered sub-plugins
            const providerTabsSection = document.getElementById('cpm-provider-tabs-section');
            const dynamicContentContainer = document.getElementById('cpm-dynamic-provider-content');
            if (registeredProviderTabs.length > 0 && providerTabsSection) {
                let sidebarBtnsHtml = `<div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-5 mb-2">Providers</div>`;
                let contentHtml = '';
                for (const tab of registeredProviderTabs) {
                    sidebarBtnsHtml += `<button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn" data-target="${tab.id}">${tab.icon} ${tab.label}</button>`;
                    try {
                        const tabContent = await tab.renderContent(renderInput, { reasoningList, verbosityList, thinkingList });
                        contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden">${tabContent}</div>`;
                    } catch (err) {
                        console.error(`[CupcakePM] Failed to render settings tab: ${tab.id}`, err);
                        contentHtml += `<div id="${tab.id}" class="cpm-tab-content hidden"><p class="text-red-400">Error rendering tab: ${err.message}</p></div>`;
                    }
                }
                providerTabsSection.innerHTML = sidebarBtnsHtml;
                if (dynamicContentContainer) dynamicContentContainer.innerHTML = contentHtml;
            }

            // Render AFTER DOM is mounted so getElementById works
            renderPluginsTab();

            const mobileMenuBtn = document.getElementById('cpm-mobile-menu-btn');
            const mobileDropdown = document.getElementById('cpm-mobile-dropdown');
            const mobileIcon = document.getElementById('cpm-mobile-icon');

            if (mobileMenuBtn) {
                mobileMenuBtn.addEventListener('click', () => {
                    const isHidden = mobileDropdown.classList.contains('hidden');
                    if (isHidden) {
                        mobileDropdown.classList.remove('hidden');
                        mobileDropdown.classList.add('flex');
                        mobileIcon.innerText = '▲';
                    } else {
                        mobileDropdown.classList.add('hidden');
                        mobileDropdown.classList.remove('flex');
                        mobileIcon.innerText = '▼';
                    }
                });
            }

            const getActualId = (e) => e.target.id;

            content.querySelectorAll('input[type="text"], input[type="password"], input[type="number"], select, textarea').forEach(el => {
                el.addEventListener('change', (e) => setVal(getActualId(e), e.target.value));
                el.addEventListener('change', (e) => setVal(getActualId(e), e.target.value));
            });

            content.querySelectorAll('input[type="checkbox"]').forEach(el => {
                el.addEventListener('change', (e) => setVal(getActualId(e), e.target.checked));
            });

            const tabs = sidebar.querySelectorAll('.tab-btn');

            tabs.forEach(t => t.addEventListener('click', () => {
                tabs.forEach(x => { x.classList.remove('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400'); });
                t.classList.add('bg-gray-800', 'border-l-4', 'border-blue-500', 'text-blue-400');
                content.querySelectorAll('.cpm-tab-content').forEach(p => p.classList.add('hidden'));
                document.getElementById(t.dataset.target).classList.remove('hidden');

                // Re-render sub-plugins list whenever the tab is activated
                if (t.dataset.target === 'tab-plugins') {
                    renderPluginsTab();
                }

                // Auto collapse on mobile when a tab is newly selected
                if (window.innerWidth < 768 && mobileDropdown && !mobileDropdown.classList.contains('hidden')) {
                    mobileDropdown.classList.add('hidden');
                    mobileDropdown.classList.remove('flex');
                    mobileIcon.innerText = '▼';
                }
            }));

            tabs[0].click();

            // Custom Models Manager Logic
            const cmList = document.getElementById('cpm-cm-list');
            const cmEditor = document.getElementById('cpm-cm-editor');
            const cmCount = document.getElementById('cpm-cm-count');

            const refreshCmList = () => {
                if (cmList.contains(cmEditor)) {
                    document.getElementById('tab-customs').appendChild(cmEditor);
                    cmEditor.classList.add('hidden');
                }
                cmCount.innerText = CUSTOM_MODELS_CACHE.length;
                if (CUSTOM_MODELS_CACHE.length === 0) {
                    cmList.innerHTML = '<div class="text-center text-gray-500 py-4 border border-dashed border-gray-700 rounded block">No custom models defined.</div>';
                    return;
                }
                cmList.innerHTML = CUSTOM_MODELS_CACHE.map((m, i) => `
                    <div class="bg-gray-800 border border-gray-700 rounded p-4 flex justify-between items-center group hover:border-gray-500 transition-colors">
                        <div>
                            <div class="font-bold text-white text-lg">${m.name || 'Unnamed Model'}</div>
                            <div class="text-xs text-gray-400 font-mono mt-1">${m.model || 'No model ID'} | ${m.url || 'No URL'}</div>
                        </div>
                        <div class="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="bg-green-900/50 hover:bg-green-600 text-white px-3 py-1 rounded text-sm cpm-cm-export-btn" data-idx="${i}" title="Export this model (API key excluded)">📤 Export</button>
                            <button class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm cpm-cm-edit-btn" data-idx="${i}">✏️ Edit</button>
                            <button class="bg-red-900/50 hover:bg-red-600 text-white px-3 py-1 rounded text-sm cpm-cm-del-btn" data-idx="${i}">🗑️ Delete</button>
                        </div>
                    </div>
                `).join('');

                cmList.querySelectorAll('.cpm-cm-export-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const m = CUSTOM_MODELS_CACHE[idx];
                    if (!m) return;
                    // Strip API key for sharing safety
                    const exportModel = { ...m };
                    delete exportModel.key;
                    exportModel._cpmModelExport = true; // marker for import validation
                    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportModel, null, 2));
                    const a = document.createElement('a');
                    a.href = dataStr;
                    a.download = `${(m.name || 'custom_model').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}.cpm-model.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }));

                cmList.querySelectorAll('.cpm-cm-del-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    if (confirm('Delete this model?')) {
                        CUSTOM_MODELS_CACHE.splice(idx, 1);
                        risuai.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        refreshCmList();
                    }
                }));

                cmList.querySelectorAll('.cpm-cm-edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const m = CUSTOM_MODELS_CACHE[idx];
                    document.getElementById('cpm-cm-id').value = m.uniqueId;
                    document.getElementById('cpm-cm-name').value = m.name || '';
                    document.getElementById('cpm-cm-model').value = m.model || '';
                    document.getElementById('cpm-cm-url').value = m.url || '';
                    document.getElementById('cpm-cm-key').value = m.key || '';

                    document.getElementById('cpm-cm-format').value = m.format || 'openai';
                    document.getElementById('cpm-cm-tok').value = m.tok || 'o200k_base';
                    document.getElementById('cpm-cm-thinking').value = m.thinking || 'none';
                    document.getElementById('cpm-cm-reasoning').value = m.reasoning || 'none';
                    document.getElementById('cpm-cm-verbosity').value = m.verbosity || 'none';

                    document.getElementById('cpm-cm-sysfirst').checked = !!m.sysfirst;
                    document.getElementById('cpm-cm-mergesys').checked = !!m.mergesys;
                    document.getElementById('cpm-cm-altrole').checked = !!m.altrole;
                    document.getElementById('cpm-cm-mustuser').checked = !!m.mustuser;
                    document.getElementById('cpm-cm-maxout').checked = !!m.maxout;
                    document.getElementById('cpm-cm-decoupled').checked = !!m.decoupled;
                    document.getElementById('cpm-cm-thought').checked = !!m.thought;

                    document.getElementById('cpm-cm-custom-params').value = m.customParams || '';

                    document.getElementById('cpm-cm-editor-title').innerText = 'Edit Custom Model';

                    const itemDiv = e.target.closest('.group');
                    if (itemDiv) itemDiv.after(cmEditor);

                    cmEditor.classList.remove('hidden');
                }));
            };

            // Import single model definition
            document.getElementById('cpm-import-model-btn').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.multiple = true;
                input.onchange = async (e) => {
                    const files = Array.from(e.target.files);
                    if (files.length === 0) return;
                    let importedCount = 0;
                    let errorCount = 0;
                    for (const file of files) {
                        try {
                            const text = await file.text();
                            const data = JSON.parse(text);
                            if (!data._cpmModelExport || !data.name) {
                                errorCount++;
                                console.warn(`[CPM] Invalid model file: ${file.name}`);
                                continue;
                            }
                            // Assign a fresh uniqueId to avoid collision
                            data.uniqueId = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                            delete data._cpmModelExport;
                            // Ensure no key is carried over
                            if (!data.key) data.key = '';
                            CUSTOM_MODELS_CACHE.push(data);
                            importedCount++;
                        } catch (err) {
                            errorCount++;
                            console.error(`[CPM] Failed to import ${file.name}:`, err);
                        }
                    }
                    if (importedCount > 0) {
                        risuai.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                        refreshCmList();
                    }
                    alert(`${importedCount}개 모델 가져오기 완료` + (errorCount > 0 ? ` (${errorCount}개 실패)` : '') + `\n\n불러온 모델의 API Key는 별도로 설정해주세요.`);
                };
                input.click();
            });

            document.getElementById('cpm-add-custom-btn').addEventListener('click', () => {
                document.getElementById('cpm-cm-id').value = 'custom_' + Date.now();
                document.getElementById('cpm-cm-name').value = '';
                document.getElementById('cpm-cm-model').value = '';
                document.getElementById('cpm-cm-url').value = '';
                document.getElementById('cpm-cm-key').value = '';

                document.getElementById('cpm-cm-format').value = 'openai';
                document.getElementById('cpm-cm-tok').value = 'o200k_base';
                document.getElementById('cpm-cm-thinking').value = 'none';
                document.getElementById('cpm-cm-reasoning').value = 'none';
                document.getElementById('cpm-cm-verbosity').value = 'none';

                ['sysfirst', 'mergesys', 'altrole', 'mustuser', 'maxout', 'decoupled', 'thought'].forEach(id => document.getElementById(`cpm-cm-${id}`).checked = false);
                document.getElementById('cpm-cm-custom-params').value = '';

                document.getElementById('cpm-cm-editor-title').innerText = 'Add New Model';

                cmList.prepend(cmEditor);
                cmEditor.classList.remove('hidden');
            });

            document.getElementById('cpm-cm-cancel').addEventListener('click', () => {
                document.getElementById('tab-customs').appendChild(cmEditor);
                cmEditor.classList.add('hidden');
            });

            document.getElementById('cpm-cm-save').addEventListener('click', () => {
                const uid = document.getElementById('cpm-cm-id').value;
                const newModel = {
                    uniqueId: uid,
                    name: document.getElementById('cpm-cm-name').value,
                    model: document.getElementById('cpm-cm-model').value,
                    url: document.getElementById('cpm-cm-url').value,
                    key: document.getElementById('cpm-cm-key').value,
                    format: document.getElementById('cpm-cm-format').value,
                    tok: document.getElementById('cpm-cm-tok').value,
                    thinking: document.getElementById('cpm-cm-thinking').value,
                    reasoning: document.getElementById('cpm-cm-reasoning').value,
                    verbosity: document.getElementById('cpm-cm-verbosity').value,
                    sysfirst: document.getElementById('cpm-cm-sysfirst').checked,
                    mergesys: document.getElementById('cpm-cm-mergesys').checked,
                    altrole: document.getElementById('cpm-cm-altrole').checked,
                    mustuser: document.getElementById('cpm-cm-mustuser').checked,
                    maxout: document.getElementById('cpm-cm-maxout').checked,
                    decoupled: document.getElementById('cpm-cm-decoupled').checked,
                    thought: document.getElementById('cpm-cm-thought').checked,
                    customParams: document.getElementById('cpm-cm-custom-params').value,
                };

                const existingIdx = CUSTOM_MODELS_CACHE.findIndex(x => x.uniqueId === uid);
                if (existingIdx !== -1) {
                    CUSTOM_MODELS_CACHE[existingIdx] = { ...CUSTOM_MODELS_CACHE[existingIdx], ...newModel };
                } else {
                    CUSTOM_MODELS_CACHE.push(newModel);
                }

                risuai.setArgument('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                SettingsBackup.updateKey('cpm_custom_models', JSON.stringify(CUSTOM_MODELS_CACHE));
                refreshCmList();
                cmEditor.classList.add('hidden');
            });

            // initialize list
            refreshCmList();

            // Take a full snapshot of current settings for backup
            await SettingsBackup.snapshotAll();

            // Export Functionality
            document.getElementById('cpm-export-btn').addEventListener('click', async () => {
                const auxKeys = ['translation', 'emotion', 'memory', 'other'].flatMap(s => [
                    `cpm_slot_${s}`, `cpm_slot_${s}_max_context`, `cpm_slot_${s}_max_out`,
                    `cpm_slot_${s}_temp`, `cpm_slot_${s}_top_p`, `cpm_slot_${s}_top_k`,
                    `cpm_slot_${s}_rep_pen`, `cpm_slot_${s}_freq_pen`, `cpm_slot_${s}_pres_pen`
                ]);
                const settingKeys = [
                    ...auxKeys,
                    'cpm_enable_chat_resizer',
                    'cpm_custom_models',
                    // Dynamically include provider export keys from registered tabs
                    ...registeredProviderTabs.flatMap(tab => tab.exportKeys || [])
                ];

                const exportData = {};
                for (const key of settingKeys) {
                    const val = await safeGetArg(key);
                    if (val !== undefined && val !== '') exportData[key] = val;
                }

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "cupcake_pm_settings.json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            });

            // Import Functionality
            document.getElementById('cpm-import-btn').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const importedData = JSON.parse(event.target.result);
                            for (const [key, value] of Object.entries(importedData)) {
                                setVal(key, value);
                                const el = document.getElementById(key);
                                if (el) {
                                    if (el.type === 'checkbox') {
                                        el.checked = (value === true || String(value).toLowerCase() === 'true');
                                    } else {
                                        el.value = value;
                                    }
                                }
                            }
                            alert('설정을 성공적으로 불러왔습니다!');
                        } catch (err) {
                            alert('설정 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            document.getElementById('cpm-close-btn').addEventListener('click', () => {
                document.body.innerHTML = '';
                risuai.hideContainer();
            });
        };

        await risuai.registerSetting(
            `v${CPM_VERSION}`,
            openCpmSettings,
            '🧁',
            'html'
        );

        if (!window.cpmShortcutRegistered) {
            window.cpmShortcutRegistered = true;
            try {
                const rootDoc = await risuai.getRootDocument();
                // Keyboard shortcut is preserved
                await rootDoc.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
                        openCpmSettings();
                    }
                });

                // Simultaneous 4-finger touch gesture for mobile
                // RisuAI SafeElement strips e.pointerId, so we use a concurrent active down-count approach
                let activePointersCount = 0;
                let activePointersTimer = null;

                const addPointer = () => {
                    activePointersCount++;
                    if (activePointersCount >= 4) {
                        openCpmSettings();
                        activePointersCount = 0; // Reset immediately
                    }
                    // If a touch isn't lifted correctly, reset the counter after a short timeout
                    if (activePointersTimer) clearTimeout(activePointersTimer);
                    activePointersTimer = setTimeout(() => {
                        activePointersCount = 0;
                    }, 500);
                };

                const removePointer = () => {
                    activePointersCount = Math.max(0, activePointersCount - 1);
                };

                await rootDoc.addEventListener('pointerdown', addPointer);
                await rootDoc.addEventListener('pointerup', removePointer);
                await rootDoc.addEventListener('pointercancel', removePointer);

            } catch (err) {
                console.error('[CPM] Hotkey registration failed:', err);
            }
        }

        // Inline Resizer Sub-plugin removed. Handled cleanly by dynamic Sub-Plugins Loader.

    } catch (e) { console.error('[CPM] init fail', e); }
})();
