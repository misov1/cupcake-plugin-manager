// @name CPM Provider - Vertex AI
// @version 1.5.0
// @description Google Vertex AI (Service Account) provider for Cupcake PM (Streaming, Key Rotation)
// @icon 🔷
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-vertex.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-Vertex] CupcakePM API not found!'); return; }

    // Shared Gemini model IDs available on Vertex
    const GEMINI_MODELS = [
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];
    const VERTEX_ONLY_MODELS = [
        { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
    ];
    const CLAUDE_ON_VERTEX = [
        { baseId: "claude-haiku-4-5", date: "20251001", name: "Claude 4.5 Haiku", displayDate: "2025/10/01" },
        { baseId: "claude-sonnet-4", date: "20250514", name: "Claude 4 Sonnet", displayDate: "2025/05/14" },
        { baseId: "claude-sonnet-4-5", date: "20250929", name: "Claude 4.5 Sonnet", displayDate: "2025/09/29" },
        { baseId: "claude-opus-4-1", date: "20250805", name: "Claude 4.1 Opus", displayDate: "2025/08/05" },
        { baseId: "claude-opus-4-5", date: "20251101", name: "Claude 4.5 Opus", displayDate: "2025/11/01" },
    ];

    const models = [];
    GEMINI_MODELS.forEach(m => models.push({ uniqueId: `vertex-${m.id}`, id: m.id, name: m.name }));
    VERTEX_ONLY_MODELS.forEach(m => models.push({ uniqueId: `vertex-${m.id}`, id: m.id, name: m.name }));
    CLAUDE_ON_VERTEX.forEach(m => models.push({
        uniqueId: `vertex-${m.baseId}`,
        id: `${m.baseId}@${m.date}`,
        name: `${m.name} (${m.displayDate})`
    }));

    // Vertex OAuth token helper (uses Service Account JSON key)
    // Per-credential token cache (keyed by client_email) for multi-key rotation
    const _tokenCaches = {};

    async function getVertexAccessToken(keyJson) {
        const key = JSON.parse(keyJson);
        const cacheKey = key.client_email || 'default';
        const cache = _tokenCaches[cacheKey] || { token: null, expiry: 0 };
        const now = Math.floor(Date.now() / 1000);
        if (cache.token && cache.expiry > now + 60) return cache.token;
        const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
        const claims = btoa(JSON.stringify({
            iss: key.client_email,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now, exp: now + 3600
        })).replace(/=+$/, '');
        const unsignedToken = `${header}.${claims}`;
        const binaryKey = atob(key.private_key.replace(/-----BEGIN .*?-----/g, '').replace(/-----END .*?-----/g, '').replace(/\s/g, ''));
        const bytes = new Uint8Array(binaryKey.length);
        for (let i = 0; i < binaryKey.length; i++) bytes[i] = binaryKey.charCodeAt(i);
        const privateKey = await crypto.subtle.importKey('pkcs8', bytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedToken));
        const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const jwt = `${unsignedToken}.${sigB64}`;

        const res = await Risuai.nativeFetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        _tokenCaches[cacheKey] = { token: data.access_token, expiry: now + data.expires_in };
        return data.access_token;
    }

    function invalidateTokenCache(keyJson) {
        try {
            const key = JSON.parse(keyJson);
            const cacheKey = key.client_email || 'default';
            delete _tokenCaches[cacheKey];
        } catch (_) {}
    }

    CPM.registerProvider({
        name: 'VertexAI',
        models,
        fetchDynamicModels: async () => {
            try {
                // Use pickJsonKey for key rotation support
                let keyJson;
                if (typeof CPM.pickJsonKey === 'function') {
                    keyJson = await CPM.pickJsonKey('cpm_vertex_key_json');
                }
                if (!keyJson) keyJson = await CPM.safeGetArg('cpm_vertex_key_json');
                if (!keyJson) return null;
                const loc = await CPM.safeGetArg('cpm_vertex_location') || 'us-central1';
                const accessToken = await getVertexAccessToken(keyJson);
                const key = JSON.parse(keyJson);
                const project = key.project_id;
                const baseUrl = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;

                // Fetch Gemini models from Vertex
                let allModels = [];
                let pageToken = null;
                while (true) {
                    let url = `${baseUrl}/v1beta1/publishers/google/models?pageSize=100`;
                    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
                    const res = await CPM.smartFetch(url, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (!res.ok) break;
                    const data = await res.json();
                    if (data.models) allModels = allModels.concat(data.models);
                    if (!data.nextPageToken) break;
                    pageToken = data.nextPageToken;
                }

                const result = [];
                // Process Gemini models
                for (const m of allModels) {
                    const id = (m.name || '').split('/').pop();
                    if (!id) continue;
                    // Only include gemini models that support generateContent
                    if (!id.startsWith('gemini-')) continue;
                    if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue;
                    result.push({
                        uniqueId: `vertex-${id}`,
                        id: id,
                        name: m.displayName || id
                    });
                }

                // Also list Claude models available via Vertex (Model Garden)
                // These use a different endpoint pattern
                try {
                    const claudeUrl = `${baseUrl}/v1beta1/projects/${project}/locations/${loc}/publishers/anthropic/models`;
                    const claudeRes = await CPM.smartFetch(claudeUrl, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (claudeRes.ok) {
                        const claudeData = await claudeRes.json();
                        if (claudeData.models) {
                            for (const m of claudeData.models) {
                                const id = (m.name || '').split('/').pop();
                                if (!id || !id.startsWith('claude-')) continue;
                                let name = m.displayName || id;
                                const dateMatch = id.match(/(\d{4})(\d{2})(\d{2})/);
                                if (dateMatch && !name.includes('/')) name += ` (${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]})`;
                                result.push({
                                    uniqueId: `vertex-${id}`,
                                    id: id,
                                    name: name
                                });
                            }
                        }
                    }
                } catch (ce) {
                    console.warn('[CPM-Vertex] Claude model listing not available:', ce.message);
                }

                return result.length > 0 ? result : null;
            } catch (e) {
                console.warn('[CPM-Vertex] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
            const config = {
                location: await CPM.safeGetArg('cpm_vertex_location'),
                model: modelDef.id,
                thinking: await CPM.safeGetArg('cpm_vertex_thinking_level'),
                thinkingBudget: await CPM.safeGetArg('cpm_vertex_thinking_budget'),
                claudeThinkingBudget: await CPM.safeGetArg('cpm_vertex_claude_thinking_budget'),
                preserveSystem: await CPM.safeGetBoolArg('chat_vertex_preserveSystem'),
                showThoughtsToken: await CPM.safeGetBoolArg('chat_vertex_showThoughtsToken'),
                useThoughtSignature: await CPM.safeGetBoolArg('chat_vertex_useThoughtSignature'),
            };

            // Key Rotation: wrap all fetch logic in doFetch(keyJson) for automatic credential rotation
            const doFetch = async (keyJson) => {
                if (!keyJson) return { success: false, content: '[Vertex] No Service Account JSON key provided.' };
                let project;
                try { project = JSON.parse(keyJson).project_id; } catch (e) { return { success: false, content: `[Vertex] JSON 파싱 오류: ${e.message}` }; }
                const loc = config.location || 'us-central1';
                const model = config.model || 'gemini-2.5-flash';
                let accessToken;
                try { accessToken = await getVertexAccessToken(keyJson); } catch (e) { return { success: false, content: `[Vertex] 토큰 발급 오류: ${e.message}` }; }
                const baseUrl = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
                const isClaude = model.startsWith('claude-');
                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : Risuai.nativeFetch;

                if (isClaude) {
                    // ── Claude on Vertex (Model Garden) ── streamRawPredict ──
                    const url = `${baseUrl}/v1beta1/projects/${project}/locations/${loc}/publishers/anthropic/models/${model}:streamRawPredict`;
                    const { messages: formattedMsgs, system: systemPrompt } = CPM.formatToAnthropic(messages, config);
                    const body = {
                        anthropic_version: 'vertex-2023-10-16',
                        model: model,
                        max_tokens: maxTokens,
                        temperature: temp,
                        messages: formattedMsgs,
                        stream: true,
                    };
                    if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                    if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
                    if (systemPrompt) body.system = systemPrompt;

                    // Extended thinking support (budget-based)
                    const budget = parseInt(config.claudeThinkingBudget) || 0;
                    if (budget > 0) {
                        body.thinking = { type: 'enabled', budget_tokens: budget };
                        if (body.max_tokens <= budget) body.max_tokens = budget + 4096;
                        delete body.temperature;
                    }

                    const res = await fetchFn(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                        body: JSON.stringify(body)
                    });
                    if (!res.ok) {
                        if (res.status === 401 || res.status === 403) invalidateTokenCache(keyJson);
                        return { success: false, content: `[Vertex Claude Error ${res.status}] ${await res.text()}`, _status: res.status };
                    }
                    return { success: true, content: CPM.createAnthropicSSEStream(res, abortSignal) };
                }

                // ── Gemini models ── streamGenerateContent ──
                const url = `${baseUrl}/v1beta1/projects/${project}/locations/${loc}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;

                const { contents, systemInstruction: sys } = CPM.formatToGemini(messages, config);
                const body = { contents, generationConfig: { temperature: temp, maxOutputTokens: maxTokens } };
                if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
                if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
                if (sys.length > 0) body.systemInstruction = { parts: sys.map(text => ({ text })) };
                if (typeof CPM.buildGeminiThinkingConfig === 'function') {
                    const _tc = CPM.buildGeminiThinkingConfig(model, config.thinking, config.thinkingBudget);
                    if (_tc) body.generationConfig.thinkingConfig = _tc;
                } else if (config.thinking && config.thinking !== 'off' && config.thinking !== 'none') {
                    body.generationConfig.thinkingConfig = { thinkMode: config.thinking };
                }

                const res = await fetchFn(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                    body: JSON.stringify(body)
                });
                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) invalidateTokenCache(keyJson);
                    return { success: false, content: `[Vertex Error ${res.status}] ${await res.text()}`, _status: res.status };
                }
                return { success: true, content: CPM.createSSEStream(res, (line) => CPM.parseGeminiSSELine(line, config), abortSignal) };
            };

            // Use JSON key rotation if available, otherwise fall back to single key
            if (typeof CPM.withJsonKeyRotation === 'function') {
                return CPM.withJsonKeyRotation('cpm_vertex_key_json', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_vertex_key_json');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-vertex',
            icon: '🔷',
            label: 'Vertex AI',
            exportKeys: ['cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_thinking_level', 'cpm_vertex_thinking_budget', 'cpm_vertex_claude_thinking_budget', 'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature', 'cpm_dynamic_vertexai'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">Vertex AI Configuration (설정)</h3>
                    ${await renderInput('cpm_vertex_key_json', 'Service Account JSON Key (JSON 키 - 여러 개 입력 시 쉼표로 구분, 자동 키회전)', 'textarea')}
                    ${await renderInput('cpm_vertex_location', 'Location Endpoint (리전 엔드포인트 ex: global, us-central1)')}
                    ${await renderInput('cpm_dynamic_vertexai', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_vertex_thinking_level', 'Thinking Level (생각 수준 - Gemini 3용)', 'select', lists.thinkingList)}
                    ${await renderInput('cpm_vertex_thinking_budget', 'Thinking Budget Tokens (생각 토큰 예산 - Gemini 2.5용, 0은 끄기)', 'number')}
                    <hr class="my-4 border-gray-700">
                    <h4 class="text-xl font-semibold text-orange-400 mb-3">Claude on Vertex (Model Garden)</h4>
                    ${await renderInput('cpm_vertex_claude_thinking_budget', 'Claude Thinking Budget Tokens (Claude 생각 토큰 예산, 0은 끄기)', 'number')}
                    <hr class="my-4 border-gray-700">
                    ${await renderInput('chat_vertex_preserveSystem', 'Preserve System (시스템 프롬프트 보존)', 'checkbox')}
                    ${await renderInput('chat_vertex_showThoughtsToken', 'Show Thoughts Token Info (생각 토큰 알림 표시)', 'checkbox')}
                    ${await renderInput('chat_vertex_useThoughtSignature', 'Use Thought Signature (생각 서명 추출 사용)', 'checkbox')}
                `;
            }
        }
    });
})();
