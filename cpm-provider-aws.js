// @name CPM Provider - AWS Bedrock
// @version 1.1.0
// @description AWS Bedrock (Claude) provider for Cupcake PM
// @icon 🔶

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-AWS] CupcakePM API not found!'); return; }

    const AWS_MODELS = [
        { uniqueId: 'aws-us.anthropic.claude-opus-4-6-v1', id: 'us.anthropic.claude-opus-4-6-v1', name: 'Claude 4.6 Opus' },
        { uniqueId: 'aws-us.anthropic.claude-sonnet-4-6', id: 'us.anthropic.claude-sonnet-4-6', name: 'Claude 4.6 Sonnet' },
        { uniqueId: 'aws-us.anthropic.claude-4-5-opus-20251101-v1:0', id: 'us.anthropic.claude-4-5-opus-20251101-v1:0', name: 'Claude 4.5 Opus (20251101)' },
        { uniqueId: 'aws-us.anthropic.claude-4-5-sonnet-20250929-v1:0', id: 'us.anthropic.claude-4-5-sonnet-20250929-v1:0', name: 'Claude 4.5 Sonnet (20250929)' },
        { uniqueId: 'aws-us.anthropic.claude-4-5-haiku-20251001-v1:0', id: 'us.anthropic.claude-4-5-haiku-20251001-v1:0', name: 'Claude 4.5 Haiku (20251001)' },
        { uniqueId: 'aws-us.anthropic.claude-4-1-opus-20250805-v1:0', id: 'us.anthropic.claude-4-1-opus-20250805-v1:0', name: 'Claude 4.1 Opus (20250805)' },
        { uniqueId: 'aws-us.anthropic.claude-4-opus-20250514-v1:0', id: 'us.anthropic.claude-4-opus-20250514-v1:0', name: 'Claude 4 Opus (20250514)' },
        { uniqueId: 'aws-us.anthropic.claude-4-sonnet-20250514-v1:0', id: 'us.anthropic.claude-4-sonnet-20250514-v1:0', name: 'Claude 4 Sonnet (20250514)' },
    ];

    const ADAPTIVE_THINKING_MODEL_PATTERNS = ['claude-opus-4-6', 'claude-sonnet-4-6'];
    const EFFORT_OPTIONS = ['low', 'medium', 'high', 'max'];

    CPM.registerProvider({
        name: 'AWS',
        models: AWS_MODELS,
        fetcher: async function (modelDef, messages, temp, maxTokens, args) {
            const config = {
                key: await CPM.safeGetArg('cpm_aws_key'),
                secret: await CPM.safeGetArg('cpm_aws_secret'),
                region: await CPM.safeGetArg('cpm_aws_region'),
                model: modelDef.id,
                budget: await CPM.safeGetArg('cpm_aws_thinking_budget'),
                effort: await CPM.safeGetArg('cpm_aws_thinking_effort'),
            };

            if (!config.key || !config.secret || !config.region || !config.model) {
                return { success: false, content: "[AWS Bedrock] Access Key, Secret, Region, and Model are required." };
            }

            // Fixed: formatToAnthropic returns { messages, system }, not { anthropicMessages, systemPrompt }
            const { messages: anthropicMessages, system: systemPrompt } = CPM.formatToAnthropic(messages);
            const body = {
                messages: anthropicMessages,
                max_tokens: maxTokens || 4096,
                temperature: temp !== undefined ? temp : 0.7,
                anthropic_version: "bedrock-2023-05-31"
            };
            if (args.top_p !== undefined && args.top_p !== null) body.top_p = args.top_p;
            if (args.top_k !== undefined && args.top_k !== null) body.top_k = args.top_k;
            if (systemPrompt) body.system = systemPrompt;

            // Thinking support
            const isAdaptiveModel = ADAPTIVE_THINKING_MODEL_PATTERNS.some(p => config.model.includes(p));
            if (isAdaptiveModel && (config.effort || config.budget > 0)) {
                // Claude 4.6 models: use adaptive thinking
                body.thinking = { type: 'adaptive' };
                const effort = config.effort && EFFORT_OPTIONS.includes(config.effort) ? config.effort : 'high';
                body.output_config = { effort };
                delete body.temperature;
            } else if (config.budget && config.budget > 0) {
                // Legacy models: use manual extended thinking
                body.thinking = { type: 'enabled', budget_tokens: parseInt(config.budget) };
                if (body.max_tokens <= body.thinking.budget_tokens) body.max_tokens = body.thinking.budget_tokens + 4096;
                delete body.temperature;
            }

            try {
                const AwsV4Signer = CPM.AwsV4Signer;
                const signer = new AwsV4Signer({
                    method: 'POST',
                    url: `https://bedrock-runtime.${config.region}.amazonaws.com/model/${config.model}/invoke`,
                    accessKeyId: config.key,
                    secretAccessKey: config.secret,
                    service: 'bedrock',
                    region: config.region,
                    body: JSON.stringify(body),
                    headers: { 'Content-Type': 'application/json', 'accept': 'application/json' }
                });

                const signed = await signer.sign();
                const res = await Risuai.nativeFetch(signed.url.toString(), {
                    method: signed.method,
                    headers: signed.headers,
                    body: signed.body
                });

                if (!res.ok) return { success: false, content: `[AWS Bedrock Error ${res.status}] ${await res.text()}` };
                const data = await res.json();
                let result = '';
                if (Array.isArray(data.content)) {
                    for (const block of data.content) {
                        if (block.type === 'text') result += block.text;
                    }
                }
                return { success: true, content: result };
            } catch (e) {
                return { success: false, content: `[AWS Bedrock Exception] ${e.message}` };
            }
        },
        settingsTab: {
            id: 'tab-aws',
            icon: '🔶',
            label: 'AWS Bedrock',
            exportKeys: ['cpm_aws_key', 'cpm_aws_secret', 'cpm_aws_region', 'cpm_aws_thinking_budget', 'cpm_aws_thinking_effort'],
            renderContent: async (renderInput, lists) => {
                return `
                    <h3 class="text-3xl font-bold text-amber-400 mb-6 pb-3 border-b border-gray-700">AWS Bedrock Configuration (설정)</h3>
                    ${await renderInput('cpm_aws_key', 'Access Key ID (액세스 키)', 'password')}
                    ${await renderInput('cpm_aws_secret', 'Secret Access Key (시크릿 키)', 'password')}
                    ${await renderInput('cpm_aws_region', 'Region (리전 ex: us-east-1)')}
                    ${await renderInput('cpm_aws_thinking_budget', 'Thinking Budget Tokens (4.5 이하 모델용, 0은 끄기)', 'number')}
                    ${await renderInput('cpm_aws_thinking_effort', 'Adaptive Thinking Effort (4.6 모델용: low/medium/high/max)')}
                `;
            }
        }
    });
})();
