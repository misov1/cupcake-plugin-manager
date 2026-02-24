// @name CPM Provider - DeepSeek
// @version 1.0.1
// @description DeepSeek provider for Cupcake PM
// @icon 🟣
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-deepseek.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-DeepSeek] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'DeepSeek',
        models: [
            { uniqueId: 'deepseek-chat', id: 'deepseek-chat', name: 'Deepseek Chat' },
            { uniqueId: 'deepseek-reasoner', id: 'deepseek-reasoner', name: 'Deepseek Reasoner' },
        ],
        fetcher: async function (modelDef, messages, temp, maxTokens, args) {
            const config = {
                url: await CPM.safeGetArg('cpm_deepseek_url'),
                key: await CPM.safeGetArg('cpm_deepseek_key'),
                model: modelDef.id,
            };

            const url = config.url || 'https://api.deepseek.com/v1/chat/completions';
            const body = { model: config.model || 'deepseek-chat', messages: CPM.formatToOpenAI(messages), temperature: temp, max_tokens: maxTokens };
            if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
            if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
            if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;

            const res = await Risuai.nativeFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
                body: JSON.stringify(body)
            });
            if (!res.ok) return { success: false, content: await res.text() };
            const data = await res.json();
            return { success: true, content: data.choices?.[0]?.message?.content || '' };
        },
        settingsTab: {
            id: 'tab-deepseek',
            icon: '🟣',
            label: 'DeepSeek',
            exportKeys: ['cpm_deepseek_key', 'cpm_deepseek_url'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-purple-400 mb-6 pb-3 border-b border-gray-700">DeepSeek Configuration (설정)</h3>
                    ${await renderInput('cpm_deepseek_key', 'API Key (API 키)', 'password')}
                    ${await renderInput('cpm_deepseek_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
