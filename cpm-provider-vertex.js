// @name CPM Provider - Vertex AI
// @version 1.0.0
// @description Google Vertex AI (Service Account) provider for Cupcake PM
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
    async function getVertexAccessToken(keyJson) {
        const cache = CPM.vertexTokenCache || { token: null, expiry: 0 };
        const now = Math.floor(Date.now() / 1000);
        if (cache.token && cache.expiry > now + 60) return cache.token;

        const key = JSON.parse(keyJson);
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
        CPM.vertexTokenCache = { token: data.access_token, expiry: now + data.expires_in };
        return data.access_token;
    }

    CPM.registerProvider({
        name: 'VertexAI',
        models,
        fetcher: async function (modelDef, messages, temp, maxTokens, args) {
            const config = {
                keyJson: await CPM.safeGetArg('cpm_vertex_key_json'),
                location: await CPM.safeGetArg('cpm_vertex_location'),
                model: modelDef.id,
                thinking: await CPM.safeGetArg('cpm_vertex_thinking_level'),
                preserveSystem: await CPM.safeGetBoolArg('chat_vertex_preserveSystem'),
                showThoughtsToken: await CPM.safeGetBoolArg('chat_vertex_showThoughtsToken'),
                useThoughtSignature: await CPM.safeGetBoolArg('chat_vertex_useThoughtSignature'),
            };

            if (!config.keyJson) return { success: false, content: '[Vertex] No Service Account JSON key provided.' };
            const project = JSON.parse(config.keyJson).project_id;
            const loc = config.location || 'us-central1';
            const model = config.model || 'gemini-2.5-flash';
            const accessToken = await getVertexAccessToken(config.keyJson);
            const baseUrl = loc === 'global' ? 'https://aiplatform.googleapis.com' : `https://${loc}-aiplatform.googleapis.com`;
            const url = `${baseUrl}/v1beta1/projects/${project}/locations/${loc}/publishers/google/models/${model}:generateContent`;

            const { contents, systemInstruction: sys } = CPM.formatToGemini(messages, config);
            const body = { contents, generationConfig: { temperature: temp, maxOutputTokens: maxTokens } };
            if (args.top_p !== undefined && args.top_p !== null) body.generationConfig.topP = args.top_p;
            if (args.top_k !== undefined && args.top_k !== null) body.generationConfig.topK = args.top_k;
            if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.generationConfig.frequencyPenalty = args.frequency_penalty;
            if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.generationConfig.presencePenalty = args.presence_penalty;
            if (sys.length > 0) body.systemInstruction = { parts: sys.map(text => ({ text })) };
            if (config.thinking && config.thinking !== 'off' && config.thinking !== 'none') {
                body.generationConfig.thinkingConfig = { thinkingBudget: 8192 };
            }

            const res = await Risuai.nativeFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) CPM.vertexTokenCache = { token: null, expiry: 0 };
                return { success: false, content: await res.text() };
            }
            const data = await res.json();
            let result = '';
            if (data.candidates?.[0]?.content?.parts) {
                for (const part of data.candidates[0].content.parts) {
                    if (part.thought && config.showThoughtsToken) result += `\n> [Thought Process]\n> ${part.thought}\n\n`;
                    if ((part.thoughtSignature || part.thought_signature) && config.useThoughtSignature) {
                        result += `\n> [Signature: ${part.thoughtSignature || part.thought_signature}]\n\n`;
                    }
                    if (part.text !== undefined) result += part.text;
                }
            }
            if (!result && data.candidates?.[0]?.finishReason) {
                let errStr = `[Vertex AI: No text. Finish: ${data.candidates[0].finishReason}]\n`;
                errStr += `[Raw: ${JSON.stringify(data)}]\n`;
                if (data.candidates[0].safetyRatings) errStr += `[Safety: ${JSON.stringify(data.candidates[0].safetyRatings)}]`;
                return { success: false, content: errStr };
            }
            if (!result) return { success: false, content: `[Vertex AI: Unknown empty response. Raw: ${JSON.stringify(data)}]` };
            return { success: true, content: result };
        },
        settingsTab: {
            id: 'tab-vertex',
            icon: '🔷',
            label: 'Vertex AI',
            exportKeys: ['cpm_vertex_key_json', 'cpm_vertex_location', 'cpm_vertex_thinking_level', 'chat_vertex_preserveSystem', 'chat_vertex_showThoughtsToken', 'chat_vertex_useThoughtSignature'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">Vertex AI Configuration (설정)</h3>
                    ${await renderInput('cpm_vertex_key_json', 'Service Account JSON Key Code (서비스 계정 JSON 키)', 'textarea')}
                    ${await renderInput('cpm_vertex_location', 'Location Endpoint (리전 엔드포인트 ex: global, us-central1)')}
                    ${await renderInput('cpm_vertex_thinking_level', 'Thinking Level (생각 수준)', 'select', lists.thinkingList)}
                    ${await renderInput('chat_vertex_preserveSystem', 'Preserve System (시스템 프롬프트 보존)', 'checkbox')}
                    ${await renderInput('chat_vertex_showThoughtsToken', 'Show Thoughts Token Info (생각 토큰 알림 표시)', 'checkbox')}
                    ${await renderInput('chat_vertex_useThoughtSignature', 'Use Thought Signature (생각 서명 추출 사용)', 'checkbox')}
                `;
            }
        }
    });
})();
