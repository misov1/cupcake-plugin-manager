//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.5.1
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/provider-manager.js

const CPM_VERSION = '1.5.1';

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
                    const execWrapper = `(async () => {\ntry {\n${p.code}\n} catch(err) {\nconsole.error('[CPM Loader] Error executing plugin ${p.name}:', err);\n}\n})();`;
                    eval(execWrapper);
                    console.log(`[CPM Loader] Loaded Sub-Plugin: ${p.name}`);
                } catch (e) {
                    console.error(`[CPM Loader] Failed to load ${p.name}`, e);
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

    // Check a single plugin for updates. Returns { hasUpdate, remoteVersion, remoteCode } or null on error.
    async checkOneUpdate(plugin) {
        const url = plugin.updateUrl;
        if (!url) return null;
        try {
            // Cache-busting to prevent stale responses
            const cacheBuster = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
            const res = await Risuai.nativeFetch(cacheBuster, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
            });
            if (!res.ok) return null;
            const remoteCode = await res.text();
            const remoteMeta = this.extractMetadata(remoteCode);
            if (!remoteMeta.version) return null;
            // Validate that the remote file matches this plugin (name check)
            if (remoteMeta.name !== plugin.name) {
                console.warn(`[CPM Update] Name mismatch for ${plugin.name}: remote has "${remoteMeta.name}". Skipping.`);
                return null;
            }
            const cmp = this.compareVersions(plugin.version || '0.0.0', remoteMeta.version);
            return {
                hasUpdate: cmp > 0,
                remoteVersion: remoteMeta.version,
                localVersion: plugin.version || '0.0.0',
                remoteCode,
            };
        } catch (e) {
            console.error(`[CPM Update] Failed to check ${plugin.name}:`, e);
            return null;
        }
    },

    // Check all plugins that have updateUrl. Returns array of { plugin, remoteVersion, remoteCode }.
    async checkAllUpdates() {
        const results = [];
        for (const p of this.plugins) {
            if (!p.updateUrl) continue;
            const info = await this.checkOneUpdate(p);
            if (info && info.hasUpdate) {
                results.push({ plugin: p, ...info });
            }
        }
        return results;
    },

    // Apply update for a specific plugin
    async applyUpdate(pluginId, newCode) {
        const p = this.plugins.find(x => x.id === pluginId);
        if (!p) return false;
        const meta = this.extractMetadata(newCode);
        // Safety check: verify the remote code's name matches the plugin being updated
        if (meta.name && p.name && meta.name !== p.name) {
            console.error(`[CPM Update] BLOCKED: Tried to apply "${meta.name}" code to plugin "${p.name}". IDs don't match.`);
            return false;
        }
        p.code = newCode;
        p.name = meta.name || p.name;
        p.version = meta.version;
        p.description = meta.description;
        p.icon = meta.icon;
        p.updateUrl = meta.updateUrl || p.updateUrl;
        await this.saveRegistry();
        return true;
    }
};

// ==========================================
// CUPCAKE PM GLOBAL API
// ==========================================
window.CupcakePM = {
    customFetchers,
    registeredProviderTabs,
    registerProvider({ name, models, fetcher, settingsTab }) {
        if (fetcher) customFetchers[name] = fetcher;
        if (models && Array.isArray(models)) {
            for (const m of models) ALL_DEFINED_MODELS.push({ ...m, provider: name });
        }
        if (settingsTab) registeredProviderTabs.push(settingsTab);
        console.log(`[CupcakePM] Provider registered: ${name}`);
    },
    formatToOpenAI,
    formatToAnthropic,
    formatToGemini,
    safeGetArg,
    safeGetBoolArg,
    setArg: (k, v) => risuai.setArgument(k, String(v)),
    get vertexTokenCache() { return vertexTokenCache; },
    set vertexTokenCache(v) { vertexTokenCache = v; },
    AwsV4Signer,
};
console.log('[CupcakePM] API exposed on window.CupcakePM');

// Map RisuAI's internal mode string to our exact LBI-style slots
function mapModeToSlot(mode) {
    const raw = (mode || 'chat').toLowerCase();
    const map = {
        'model': 'chat', 'chat': 'chat', 'submodel': 'chat', 'continue': 'chat', 'roleplay': 'chat',
        'translate': 'translation', 'translation': 'translation',
        'emotion': 'emotion', 'hypa': 'emotion',
        'memory': 'memory', 'summarize': 'memory', 'summary': 'memory',
        'other': 'other', 'lua': 'other', 'trigger': 'other', 'otherax': 'other'
    };
    return map[raw] || 'chat';
}

function formatToOpenAI(messages, config = {}) {
    let msgs = [...messages];

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

    let arr = msgs.map(m => {
        const msg = { role: m.role, content: '' };
        if (config.altrole && msg.role === 'assistant') msg.role = 'model';
        if (typeof m.content === 'string') msg.content = m.content;
        else if (Array.isArray(m.content)) msg.content = m.content;
        else msg.content = String(m.content || '');
        if (m.name) msg.name = m.name;
        return msg;
    });

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
    const systemMsgs = messages.filter(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');
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

function formatToGemini(messages, config = {}) {
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
// 3. PROVIDER FETCHERS (Custom only - built-in providers are sub-plugins)
// ==========================================

async function fetchCustom(config, messages, temp, maxTokens, args = {}) {
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

    const body = {
        model: config.model,
        temperature: temp,
        max_tokens: maxTokens,
    };
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

    if (config.maxout) {
        if (format === 'openai') {
            body.max_output_tokens = maxTokens;
            delete body.max_tokens;
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
                Object.assign(body, extra);
            }
        } catch (e) {
            console.error('[Cupcake PM] Failed to parse customParams JSON for Custom Model:', e);
        }
    }

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` };
    if (config.url && config.url.includes('githubcopilot.com') && config.copilotToken) {
        headers['Copilot-Integration-Id'] = 'vscode-chat';
        headers['Authorization'] = `Bearer ${config.copilotToken}`;
        headers['Editor-Version'] = 'vscode/1.85.1';
        headers['Editor-Plugin-Version'] = 'copilot-chat/0.11.1';
    }

    const res = await Risuai.nativeFetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!res.ok) return { success: false, content: `[Custom API Error ${res.status}] ${await res.text()}` };
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

async function fetchByProviderId(modelDef, args) {
    const temp = args.temperature || 0.7;
    const maxTokens = args.max_tokens || 4096;
    const messages = args.prompt_chat || [];

    try {
        // Dynamic provider lookup from registered sub-plugins
        const fetcher = customFetchers[modelDef.provider];
        if (fetcher) {
            return await fetcher(modelDef, messages, temp, maxTokens, args);
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
                customParams: cDef.customParams || '', copilotToken: args.copilot_token || ''
            }, messages, temp, maxTokens, args);
        }
        return { success: false, content: `[Cupcake PM] Unknown provider selected: ${modelDef.provider}` };
    } catch (e) {
        return { success: false, content: `[Cupcake PM Crash] ${e.message}` };
    }
}

async function handleRequest(args, activeModelDef) {
    const slot = mapModeToSlot(args.mode);

    // If it's the main chat slot, route to the provider that the UI initiated this call for
    let targetDef = activeModelDef;

    // If it's an auxiliary slot (not chat), lookup the Cupcake Config mapped model
    if (slot !== 'chat') {
        const configuredAuxUniqueId = await safeGetArg(`cpm_slot_${slot}`, '');
        if (configuredAuxUniqueId && configuredAuxUniqueId !== '') {
            const foundOption = ALL_DEFINED_MODELS.find(m => m.uniqueId === configuredAuxUniqueId);
            if (foundOption) {
                targetDef = foundOption;
            } else {
                console.warn(`[Cupcake PM] Overridden slot '${slot}' configured model '${configuredAuxUniqueId}' not found. Falling back to active UI model.`);
            }
        }

        // Override generation params if provided
        const maxOut = await safeGetArg(`cpm_slot_${slot}_max_out`);
        const maxCtx = await safeGetArg(`cpm_slot_${slot}_max_context`);
        const temp = await safeGetArg(`cpm_slot_${slot}_temp`);
        const topP = await safeGetArg(`cpm_slot_${slot}_top_p`);
        const topK = await safeGetArg(`cpm_slot_${slot}_top_k`);
        const repPen = await safeGetArg(`cpm_slot_${slot}_rep_pen`);
        const freqPen = await safeGetArg(`cpm_slot_${slot}_freq_pen`);
        const presPen = await safeGetArg(`cpm_slot_${slot}_pres_pen`);

        if (maxOut) args.max_tokens = parseInt(maxOut);
        if (maxCtx) args.max_context_tokens = parseInt(maxCtx); // RisuAI uses this to build prompt, but usually done before here. Kept for passing down.
        if (temp) args.temperature = parseFloat(temp);
        if (topP) args.top_p = parseFloat(topP);
        if (topK) args.top_k = parseInt(topK);
        if (repPen) args.repetition_penalty = parseFloat(repPen);
        if (freqPen) args.frequency_penalty = parseFloat(freqPen);
        if (presPen) args.presence_penalty = parseFloat(presPen);
    }

    return await fetchByProviderId(targetDef, args);
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

        // Explicitly format names identical to LBI: `[Cupcake PM] [GoogleAI] Gemini 2.5 Flash`
        for (const modelDef of ALL_DEFINED_MODELS) {
            let pLabel = modelDef.provider;
            let mLabel = modelDef.name;
            await Risuai.addProvider(`[Cupcake PM] [${pLabel}] ${mLabel}`, async (args) => {
                try {
                    return await handleRequest(args, modelDef);
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
                        <h2 class="text-lg font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">Cupcake PM v${CPM_VERSION}</h2>
                        <span class="md:hidden text-gray-400 text-xl" id="cpm-mobile-icon">▼</span>
                    </div>
                    
                    <div id="cpm-mobile-dropdown" class="hidden md:flex flex-col absolute md:static top-full left-0 w-full md:w-auto bg-gray-900 border-b border-gray-700 md:border-none shadow-xl md:shadow-none z-[100] h-auto max-h-[70vh] md:max-h-none md:h-full overflow-hidden flex-1">
                        <div class="flex-1 overflow-y-auto py-2 pr-2" id="cpm-tab-list">
                        <div class="px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 mt-2">Aux Slots (Map Mode)</div>
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
                            값을 입력하면 기본 설정 대신 우선 적용됩니다. (비워두면 메인 챗 설정 따름)
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
                            <button id="cpm-check-updates-btn" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded transition-colors text-sm shadow">🔄 업데이트 확인</button>
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
                            alert(`서브 플러그인 '${name}' 설치 완료! 적용을 위해 화면을 새로고침(F5) 해주세요.`);
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
                        alert('설정이 저장되었습니다. 적용하려면 새로고침(F5) 하세요.');
                    });
                });
                listContainer.querySelectorAll('.cpm-plugin-delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = e.target.getAttribute('data-id');
                        if (confirm('정말로 이 플러그인을 삭제하시겠습니까?')) {
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
                                    pendingUpdates.set(u.plugin.id, { code: u.remoteCode, name: u.plugin.name });
                                    html += `<div class="flex items-center justify-between bg-gray-800 rounded p-2">`;
                                    html += `<div><span class="text-white font-semibold">${u.plugin.icon || '🧩'} ${u.plugin.name}</span>`;
                                    html += `<span class="text-gray-400 text-xs ml-2">v${u.localVersion} → <span class="text-green-400">v${u.remoteVersion}</span></span></div>`;
                                    html += `<button class="cpm-apply-update bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1 rounded" data-id="${u.plugin.id}">⬆️ 업데이트</button>`;
                                    html += `</div>`;
                                }
                                html += `</div>`;
                                statusDiv.innerHTML = html;
                                // Bind update apply buttons
                                statusDiv.querySelectorAll('.cpm-apply-update').forEach(btn => {
                                    btn.addEventListener('click', async (e) => {
                                        const id = e.target.getAttribute('data-id');
                                        const updateData = pendingUpdates.get(id);
                                        if (!updateData) { e.target.textContent = '❌ 데이터 없음'; return; }
                                        e.target.disabled = true;
                                        e.target.textContent = '⏳ 적용 중...';
                                        const ok = await SubPluginManager.applyUpdate(id, updateData.code);
                                        if (ok) {
                                            e.target.textContent = '✅ 완료';
                                            e.target.classList.replace('bg-green-600', 'bg-gray-600');
                                            pendingUpdates.delete(id);
                                            alert('업데이트 완료! 적용을 위해 새로고침(F5) 해주세요.');
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
            `Cupcake PM v${CPM_VERSION}`,
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
