// @name CPM Provider - Anthropic
// @version 1.2.1
// @description Anthropic Claude provider for Cupcake PM
// @icon 🟠
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-anthropic.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-Anthropic] CupcakePM API not found!'); return; }

    const CLAUDE_MODELS_BASE = [
        { baseId: "claude-haiku-4-5", date: "20251001", name: "Claude 4.5 Haiku", displayDate: "2025/10/01" },
        { baseId: "claude-sonnet-4", date: "20250514", name: "Claude 4 Sonnet", displayDate: "2025/05/14" },
        { baseId: "claude-sonnet-4-5", date: "20250929", name: "Claude 4.5 Sonnet", displayDate: "2025/09/29" },
        { baseId: "claude-opus-4", date: "20250514", name: "Claude 4 Opus", displayDate: "2025/05/14" },
        { baseId: "claude-opus-4-1", date: "20250805", name: "Claude 4.1 Opus", displayDate: "2025/08/05" },
        { baseId: "claude-opus-4-5", date: "20251101", name: "Claude 4.5 Opus", displayDate: "2025/11/01" },
    ];

    // Claude 4.6 models have no date suffix and support adaptive thinking
    const CLAUDE_46_MODELS = [
        { uniqueId: 'anthropic-claude-sonnet-4-6', id: 'claude-sonnet-4-6', name: 'Claude 4.6 Sonnet' },
        { uniqueId: 'anthropic-claude-opus-4-6', id: 'claude-opus-4-6', name: 'Claude 4.6 Opus' },
    ];

    const ADAPTIVE_THINKING_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6'];
    const EFFORT_OPTIONS = ['low', 'medium', 'high', 'max'];

    const models = [
        ...CLAUDE_46_MODELS,
        ...CLAUDE_MODELS_BASE.map(m => ({
            uniqueId: `anthropic-${m.baseId}-${m.date}`,
            id: `${m.baseId}-${m.date}`,
            name: `${m.name} (${m.displayDate})`
        }))
    ];

    CPM.registerProvider({
        name: 'Anthropic',
        models,
        fetcher: async function (modelDef, messages, temp, maxTokens, args) {
            const config = {
                url: await CPM.safeGetArg('cpm_anthropic_url'),
                key: await CPM.safeGetArg('cpm_anthropic_key'),
                model: await CPM.safeGetArg('cpm_anthropic_model') || modelDef.id,
                budget: await CPM.safeGetArg('cpm_anthropic_thinking_budget'),
                effort: await CPM.safeGetArg('cpm_anthropic_thinking_effort'),
                caching: await CPM.safeGetBoolArg('chat_claude_caching'),
            };

            const url = config.url || 'https://api.anthropic.com/v1/messages';
            const { messages: formattedMsgs, system: systemPrompt } = CPM.formatToAnthropic(messages, config);

            const body = {
                model: config.model || 'claude-3-5-sonnet-20241022',
                max_tokens: maxTokens,
                temperature: temp,
                messages: formattedMsgs,
            };
            if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
            if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
            if (systemPrompt) {
                if (config.caching) {
                    body.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
                } else {
                    body.system = systemPrompt;
                }
            }

            const isAdaptiveModel = ADAPTIVE_THINKING_MODELS.some(m => (config.model || '').startsWith(m));

            if (isAdaptiveModel && (config.effort || config.budget > 0)) {
                // Claude 4.6 models: use adaptive thinking (manual mode is deprecated)
                body.thinking = { type: 'adaptive' };
                const effort = config.effort && EFFORT_OPTIONS.includes(config.effort) ? config.effort : 'high';
                body.output_config = { effort };
                delete body.temperature;
            } else if (config.budget && config.budget > 0) {
                // Legacy models: use manual extended thinking with budget_tokens
                body.thinking = { type: 'enabled', budget_tokens: parseInt(config.budget) };
                if (body.max_tokens <= body.thinking.budget_tokens) body.max_tokens = body.thinking.budget_tokens + 4096;
                delete body.temperature;
            }

            const res = await Risuai.nativeFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': config.key, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(body)
            });
            if (!res.ok) return { success: false, content: `[Anthropic Error ${res.status}] ${await res.text()}` };
            const data = await res.json();
            let result = '';
            if (Array.isArray(data.content)) {
                for (const block of data.content) if (block.type === 'text') result += block.text;
            }
            return { success: true, content: result };
        },
        settingsTab: {
            id: 'tab-anthropic',
            icon: '🟠',
            label: 'Anthropic',
            exportKeys: ['cpm_anthropic_key', 'cpm_anthropic_thinking_budget', 'cpm_anthropic_thinking_effort', 'chat_claude_caching', 'cpm_anthropic_url'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-orange-400 mb-6 pb-3 border-b border-gray-700">Anthropic Configuration (설정)</h3>
                    ${await renderInput('cpm_anthropic_key', 'API Key (API 키)', 'password')}
                    ${await renderInput('cpm_anthropic_thinking_budget', 'Thinking Budget Tokens (생각 토큰 예산 - 4.5 이하 모델용, 0은 끄기)', 'number')}
                    ${await renderInput('cpm_anthropic_thinking_effort', 'Adaptive Thinking Effort (4.6 모델용: low/medium/high/max)')}
                    ${await renderInput('chat_claude_caching', 'Cache Enabled (프롬프트 캐싱 사용)', 'checkbox')}
                    ${await renderInput('cpm_anthropic_url', 'Custom Base URL (커스텀 API 주소 - 선택사항)')}
                `;
            }
        }
    });
})();
