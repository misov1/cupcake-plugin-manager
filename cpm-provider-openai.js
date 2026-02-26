//@name CPM Provider - OpenAI
//@version 1.5.1
//@description OpenAI provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🟢
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-openai.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-OpenAI] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'OpenAI',
        models: [
            { uniqueId: 'openai-gpt-4.1-2025-04-14', id: 'gpt-4.1-2025-04-14', name: 'GPT-4.1 (2025/04/14)' },
            { uniqueId: 'openai-chatgpt-4o-latest', id: 'chatgpt-4o-latest', name: 'ChatGPT-4o (Latest)' },
            { uniqueId: 'openai-gpt-5-2025-08-07', id: 'gpt-5-2025-08-07', name: 'gpt-5 (2025/08/07)' },
            { uniqueId: 'openai-gpt-5-mini-2025-08-07', id: 'gpt-5-mini-2025-08-07', name: 'gpt-5-mini (2025/08/07)' },
            { uniqueId: 'openai-gpt-5-nano-2025-08-07', id: 'gpt-5-nano-2025-08-07', name: 'gpt-5-nano (2025/08/07)' },
            { uniqueId: 'openai-gpt-5-chat-latest', id: 'gpt-5-chat-latest', name: 'gpt-5-chat (Latest)' },
            { uniqueId: 'openai-gpt-5.1-2025-11-13', id: 'gpt-5.1-2025-11-13', name: 'GPT-5.1 (2025/11/13)' },
            { uniqueId: 'openai-gpt-5.1-chat-latest', id: 'gpt-5.1-chat-latest', name: 'GPT-5.1 Chat (Latest)' },
            { uniqueId: 'openai-gpt-5.2-2025-12-11', id: 'gpt-5.2-2025-12-11', name: 'GPT-5.2 (2025/12/11)' },
            { uniqueId: 'openai-gpt-5.2-chat-latest', id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Chat (Latest)' },
        ],
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_openai_key')
                    : await CPM.safeGetArg('cpm_openai_key');
                if (!key) return null;

                const res = await CPM.smartFetch('https://api.openai.com/v1/models', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!res.ok) return null;

                const data = await res.json();
                if (!data.data) return null;

                // Filter to chat-capable models only
                const INCLUDE_PREFIXES = ['gpt-4', 'gpt-5', 'chatgpt-', 'o1', 'o3', 'o4'];
                const EXCLUDE_KEYWORDS = ['audio', 'realtime', 'search', 'transcribe', 'instruct', 'embedding', 'tts', 'whisper', 'dall-e'];

                const chatModels = data.data.filter(m => {
                    const id = m.id;
                    const included = INCLUDE_PREFIXES.some(pfx => id.startsWith(pfx));
                    if (!included) return false;
                    const excluded = EXCLUDE_KEYWORDS.some(kw => id.toLowerCase().includes(kw));
                    return !excluded;
                });

                return chatModels.map(m => {
                    let name = m.id;
                    const dateMatch = m.id.match(/-(\d{4})-(\d{2})-(\d{2})$/);
                    if (dateMatch) {
                        name = m.id.replace(/-\d{4}-\d{2}-\d{2}$/, '') + ` (${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]})`;
                    } else if (m.id.endsWith('-latest')) {
                        name = m.id.replace(/-latest$/, '') + ' (Latest)';
                    }
                    name = name.replace(/^gpt-/i, 'GPT-').replace(/^chatgpt-/i, 'ChatGPT-');
                    return { uniqueId: `openai-${m.id}`, id: m.id, name };
                });
            } catch (e) {
                console.warn('[CPM-OpenAI] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
            const config = {
                url: await CPM.safeGetArg('cpm_openai_url'),
                model: await CPM.safeGetArg('cpm_openai_model') || modelDef.id,
                reasoning: await CPM.safeGetArg('cpm_openai_reasoning'),
                verbosity: await CPM.safeGetArg('cpm_openai_verbosity'),
                servicetier: await CPM.safeGetArg('common_openai_servicetier'),
            };

            // Helper: detect models that require max_completion_tokens instead of max_tokens
            const needsMaxCompletionTokens = (model) => {
                if (!model) return false;
                const m = model.toLowerCase();
                return /^(gpt-5|o[1-9])/.test(m);
            };

            // Helper: validate service_tier value
            const validServiceTiers = new Set(['flex', 'default']);

            const url = config.url || 'https://api.openai.com/v1/chat/completions';
            const modelName = config.model || 'gpt-4o';
            const formattedMessages = CPM.formatToOpenAI(messages, config);

            // Key Rotation: wrap fetch in withKeyRotation for automatic retry on 429/529
            const doFetch = async (apiKey) => {
                const body = {
                    model: modelName,
                    messages: Array.isArray(formattedMessages) ? formattedMessages.filter(m => m != null && typeof m === 'object') : [],
                    temperature: temp,
                    stream: true,
                };

                if (needsMaxCompletionTokens(modelName)) {
                    body.max_completion_tokens = maxTokens;
                } else {
                    body.max_tokens = maxTokens;
                }

                if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;

                if (config.servicetier) {
                    const tier = config.servicetier.trim().toLowerCase();
                    if (tier && tier !== 'auto' && validServiceTiers.has(tier)) {
                        body.service_tier = tier;
                    }
                }

                if (config.reasoning && config.reasoning !== 'none') { body.reasoning_effort = config.reasoning; delete body.temperature; }
                if (config.verbosity && config.verbosity !== 'none') body.verbosity = config.verbosity;

                const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                if (url.includes('githubcopilot.com')) {
                    let copilotApiToken = '';
                    if (typeof window.CupcakePM?.ensureCopilotApiToken === 'function') {
                        copilotApiToken = await window.CupcakePM.ensureCopilotApiToken();
                    } else if (window._cpmCopilotApiToken) {
                        copilotApiToken = window._cpmCopilotApiToken;
                    }
                    if (copilotApiToken) {
                        headers['Authorization'] = `Bearer ${copilotApiToken}`;
                    }
                    headers['Copilot-Integration-Id'] = 'vscode-chat';
                    headers['X-Request-Id'] = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
                }

                const safeBody = JSON.stringify(body);

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : Risuai.nativeFetch;
                const res = await fetchFn(url, { method: 'POST', headers, body: safeBody });
                if (!res.ok) return { success: false, content: `[OpenAI Error ${res.status}] ${await res.text()}`, _status: res.status };
                return { success: true, content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
            };

            // Use key rotation if available, otherwise fall back to single key
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_openai_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_openai_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-openai',
            icon: '🟢',
            label: 'OpenAI',
            exportKeys: ['cpm_openai_key', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier', 'cpm_openai_url', 'cpm_dynamic_openai'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-green-400 mb-6 pb-3 border-b border-gray-700">OpenAI Configuration (설정)</h3>
                    ${await renderInput('cpm_openai_key', 'API Key (sk-... \uc5ec\ub7ec \uac1c \uc785\ub825 \uc2dc \uacf5\ubc31/\uc904\ubc14\uafbc\uc73c\ub85c \uad6c\ubd84, \uc790\ub3d9 \ud0a4\ud68c\uc804)', 'password')}
                    ${await renderInput('cpm_dynamic_openai', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_openai_reasoning', 'Reasoning Effort (추론 수준 - o3, o1 series)', 'select', lists.reasoningList)}
                    ${await renderInput('cpm_openai_verbosity', 'Response Verbosity (응답 상세)', 'select', lists.verbosityList)}
                    ${await renderInput('common_openai_servicetier', 'Service Tier (응답 속도)', 'select', [{ value: '', text: 'Auto (자동)' }, { value: 'flex', text: 'Flex' }, { value: 'default', text: 'Default' }])}
                    ${await renderInput('cpm_openai_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
