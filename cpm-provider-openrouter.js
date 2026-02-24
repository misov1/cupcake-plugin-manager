// @name CPM Provider - OpenRouter
// @version 1.1.0
// @description OpenRouter provider for Cupcake PM (Streaming)
// @icon 🌐
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-openrouter.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-OpenRouter] CupcakePM API not found!'); return; }

    CPM.registerProvider({
        name: 'OpenRouter',
        models: [
            { uniqueId: 'openrouter-dynamic', id: 'openrouter', name: 'OpenRouter (Set inside PM config)' },
        ],
        fetcher: async function (modelDef, messages, temp, maxTokens, args, abortSignal) {
            const config = {
                url: await CPM.safeGetArg('cpm_openrouter_url'),
                key: await CPM.safeGetArg('cpm_openrouter_key'),
                model: await CPM.safeGetArg('cpm_openrouter_model'),
                reasoning: await CPM.safeGetArg('cpm_openrouter_reasoning'),
                providerString: await CPM.safeGetArg('cpm_openrouter_provider'),
            };

            const url = config.url || 'https://openrouter.ai/api/v1/chat/completions';
            const body = { model: config.model, messages: CPM.formatToOpenAI(messages), temperature: temp, max_tokens: maxTokens, stream: true };
            if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
            if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
            if (args.frequency_penalty !== undefined && args.frequency_penalty !== null) body.frequency_penalty = args.frequency_penalty;
            if (args.presence_penalty !== undefined && args.presence_penalty !== null) body.presence_penalty = args.presence_penalty;
            if (args.repetition_penalty !== undefined && args.repetition_penalty !== null) body.repetition_penalty = args.repetition_penalty;
            if (config.reasoning && config.reasoning !== 'none') {
                body.reasoning = { effort: config.reasoning, max_tokens: 8192 };
            }
            if (config.providerString) {
                body.provider = { id: config.providerString };
            }

            const res = await Risuai.nativeFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.key}`,
                    'HTTP-Referer': 'https://risuai.xyz',
                    'X-Title': 'RisuAI - CPM'
                },
                body: JSON.stringify(body),
                signal: abortSignal
            });
            if (!res.ok) return { success: false, content: await res.text() };
            return { success: true, content: CPM.createSSEStream(res, CPM.parseOpenAISSELine, abortSignal) };
        },
        settingsTab: {
            id: 'tab-openrouter',
            icon: '🌐',
            label: 'OpenRouter',
            exportKeys: ['cpm_openrouter_key', 'cpm_openrouter_provider', 'cpm_openrouter_reasoning', 'cpm_openrouter_url'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-teal-400 mb-6 pb-3 border-b border-gray-700">OpenRouter Configuration (설정)</h3>
                    ${await renderInput('cpm_openrouter_key', 'API Key (API 키)', 'password')}
                    ${await renderInput('cpm_openrouter_provider', 'Provider String (프로바이더 문자열 e.g., Hyperbolic)', 'text')}
                    ${await renderInput('cpm_openrouter_reasoning', 'Reasoning Header (추론 헤더)', 'select', lists.reasoningList)}
                    ${await renderInput('cpm_openrouter_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
