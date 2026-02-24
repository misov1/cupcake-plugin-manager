// @name CPM Provider - OpenAI
// @version 1.1.2
// @description OpenAI provider for Cupcake PM
// @icon 🟢
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-openai.js

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
                const key = await CPM.safeGetArg('cpm_openai_key');
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
        fetcher: async function (modelDef, messages, temp, maxTokens, args) {
            const config = {
                url: await CPM.safeGetArg('cpm_openai_url'),
                key: await CPM.safeGetArg('cpm_openai_key'),
                model: await CPM.safeGetArg('cpm_openai_model') || modelDef.id,
                reasoning: await CPM.safeGetArg('cpm_openai_reasoning'),
                verbosity: await CPM.safeGetArg('cpm_openai_verbosity'),
                servicetier: await CPM.safeGetArg('common_openai_servicetier'),
                copilotToken: args.copilot_token || '',
            };

            const url = config.url || 'https://api.openai.com/v1/chat/completions';
            const body = {
                model: config.model || 'gpt-4o',
                messages: CPM.formatToOpenAI(messages, config),
                temperature: temp,
                max_tokens: maxTokens,
            };
            if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
            if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
            if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
            if (config.servicetier && config.servicetier.trim() !== '') body.service_tier = config.servicetier;
            if (config.maxout) { body.max_output_tokens = maxTokens; delete body.max_tokens; }
            if (config.reasoning && config.reasoning !== 'none') { body.reasoning_effort = config.reasoning; delete body.temperature; }
            if (config.verbosity && config.verbosity !== 'none') body.verbosity = config.verbosity;

            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` };
            if (url.includes('githubcopilot.com') && config.copilotToken) {
                headers['Copilot-Integration-Id'] = 'vscode-chat';
                headers['Authorization'] = `Bearer ${config.copilotToken}`;
                headers['Editor-Version'] = 'vscode/1.85.1';
                headers['Editor-Plugin-Version'] = 'copilot-chat/0.11.1';
            }

            const res = await Risuai.nativeFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
            if (!res.ok) return { success: false, content: `[OpenAI Error ${res.status}] ${await res.text()}` };
            const data = await res.json();
            return { success: true, content: data.choices?.[0]?.message?.content || '' };
        },
        settingsTab: {
            id: 'tab-openai',
            icon: '🟢',
            label: 'OpenAI',
            exportKeys: ['cpm_openai_key', 'cpm_openai_reasoning', 'cpm_openai_verbosity', 'common_openai_servicetier', 'cpm_openai_url', 'cpm_dynamic_openai'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-green-400 mb-6 pb-3 border-b border-gray-700">OpenAI Configuration (설정)</h3>
                    ${await renderInput('cpm_openai_key', 'API Key (sk-...)', 'password')}
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
