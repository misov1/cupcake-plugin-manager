//@name CPM Provider - DeepSeek
//@version 1.4.1
//@description DeepSeek provider for Cupcake PM (Streaming, Key Rotation)
//@icon 🟣
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-deepseek.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-DeepSeek] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'DeepSeek',
        models: [
            { uniqueId: 'deepseek-chat', id: 'deepseek-chat', name: 'Deepseek Chat' },
            { uniqueId: 'deepseek-reasoner', id: 'deepseek-reasoner', name: 'Deepseek Reasoner' },
        ],
        fetchDynamicModels: async () => {
            try {
                const key = typeof CPM.pickKey === 'function'
                    ? await CPM.pickKey('cpm_deepseek_key')
                    : await CPM.safeGetArg('cpm_deepseek_key');
                if (!key) return null;

                const res = await CPM.smartFetch('https://api.deepseek.com/models', {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                if (!res.ok) return null;

                const data = await res.json();
                if (!data.data) return null;

                return data.data.map(m => {
                    // Format name: "deepseek-chat" -> "DeepSeek Chat"
                    let name = m.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    name = name.replace(/^Deepseek/i, 'DeepSeek');
                    return { uniqueId: `deepseek-${m.id}`, id: m.id, name };
                });
            } catch (e) {
                console.warn('[CPM-DeepSeek] Dynamic model fetch error:', e);
                return null;
            }
        },
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
            const config = {
                url: await CPM.safeGetArg('cpm_deepseek_url'),
                model: modelDef.id,
            };

            const url = config.url || 'https://api.deepseek.com/v1/chat/completions';

            // Key Rotation: wrap fetch in withKeyRotation for automatic retry on 429/529
            const doFetch = async (apiKey) => {
                const body = { model: config.model || 'deepseek-chat', messages: CPM.formatToOpenAI(messages), temperature: temp, max_tokens: maxTokens, stream: true };
                if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
                if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
                if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;

                const fetchFn = typeof CPM.smartNativeFetch === 'function' ? CPM.smartNativeFetch : Risuai.nativeFetch;
                const res = await fetchFn(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify(body)
                });
                if (!res.ok) return { success: false, content: `[DeepSeek Error ${res.status}] ${await res.text()}`, _status: res.status };
                return { success: true, content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
            };

            // Use key rotation if available, otherwise fall back to single key
            if (typeof CPM.withKeyRotation === 'function') {
                return CPM.withKeyRotation('cpm_deepseek_key', doFetch);
            }
            const fallbackKey = await CPM.safeGetArg('cpm_deepseek_key');
            return doFetch(fallbackKey);
        },
        settingsTab: {
            id: 'tab-deepseek',
            icon: '🟣',
            label: 'DeepSeek',
            exportKeys: ['cpm_deepseek_key', 'cpm_deepseek_url', 'cpm_dynamic_deepseek'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-purple-400 mb-6 pb-3 border-b border-gray-700">DeepSeek Configuration (설정)</h3>
                    ${await renderInput('cpm_deepseek_key', 'API Key (API 키 - 여러 개 입력 시 공백/줄바꾼으로 구분, 자동 키회전)', 'password')}
                    ${await renderInput('cpm_dynamic_deepseek', '📡 서버에서 모델 목록 불러오기 (Fetch models from API)', 'checkbox')}
                    ${await renderInput('cpm_deepseek_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
