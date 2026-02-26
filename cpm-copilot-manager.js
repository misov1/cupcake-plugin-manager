//@name CPM Component - Copilot Token Manager
//@display-name Cupcake Copilot Manager
//@api 3.0
//@version 1.5.1
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-copilot-manager.js

/**
 * ======== CUPCAKE PM Sub-Plugin: GitHub Copilot Token Manager ========
 *
 * GitHub Copilot OAuth 토큰을 관리하는 서브 플러그인입니다.
 * Cupcake PM 설정 사이드바에 "🔑 Copilot" 탭으로 직접 표시됩니다.
 *
 * 기능:
 *   - 토큰 생성 (GitHub OAuth Device Flow)
 *   - 토큰 확인 (구독 상태, 텔레메트리, 활성 기능)
 *   - 토큰 제거
 *   - 모델 목록 조회
 *   - 할당량(쿼터) 확인
 *   - 자동 설정
 */
(() => {
    if (!window.Risuai && !window.risuai) {
        console.warn('[CPM Copilot] RisuAI API not found. Halting.');
        return;
    }
    const risuai = window.risuai || window.Risuai;
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM Copilot] CupcakePM API not found!'); return; }

    // ==========================================
    // CONSTANTS
    // ==========================================
    const LOG_TAG = '[CPM Copilot]';
    const GITHUB_CLIENT_ID = '01ab8ac9400c4e429b23';
    const TOKEN_ARG_KEY = 'tools_githubCopilotToken';
    const CODE_VERSION = '1.109.2';
    const CHAT_VERSION = '0.37.4';
    const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/${CODE_VERSION} Chrome/142.0.7444.265 Electron/39.3.0 Safari/537.36`;
    const PREFIX = 'cpm-copilot';

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * Sanitize a token string: trim whitespace, remove non-printable 
     * and non-ASCII characters (zero-width spaces, BOM, etc.)
     * These invisible chars cause:
     *   - "non ISO-8859-1 code point" error in browser fetch headers
     *   - "Bad credentials" from GitHub API (token corrupted)
     */
    function sanitizeToken(raw) {
        if (!raw) return '';
        // Keep only printable ASCII (0x20-0x7E)
        return raw.replace(/[^\x20-\x7E]/g, '').trim();
    }

    /**
     * Sanitize header values: strip any non-ISO-8859-1 characters.
     * Browser Fetch API throws if header values contain code points > 0xFF.
     */
    function sanitizeHeaders(headers) {
        const clean = {};
        for (const [key, value] of Object.entries(headers)) {
            clean[key] = String(value).replace(/[^\x00-\xFF]/g, '');
        }
        return clean;
    }

    async function getToken() {
        const raw = (await CPM.safeGetArg(TOKEN_ARG_KEY)) || '';
        return sanitizeToken(raw);
    }

    function setToken(value) {
        // Sanitize before saving so stored token is clean
        CPM.setArg(TOKEN_ARG_KEY, sanitizeToken(value));
    }

    function toast(msg, duration = 3000) {
        const el = document.createElement('div');
        el.textContent = msg;
        Object.assign(el.style, {
            position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            background: '#27272a', color: '#e4e4e7', padding: '10px 20px', borderRadius: '8px',
            fontSize: '14px', zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'opacity 0.3s', opacity: '1'
        });
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    // ==========================================
    // SMART FETCH: Strategy per endpoint type
    //
    // V3 plugins run in sandboxed iframe; all API calls go through RPC bridge
    // to the host, which calls globalFetch.
    //
    // Problem: RisuAI cloud proxy (sv.risuai.xyz/proxy2) returns 401 for
    // GET requests — the cloud proxy likely only supports POST /proxy2.
    // fetchWithProxy uses arg.method directly, so GET requests hit the proxy
    // as GET and get rejected.
    //
    // Solution:
    //   api.github.com / api.githubcopilot.com endpoints:
    //     → plainFetchForce: true (direct browser fetch from host window)
    //     → GitHub API supports CORS (Access-Control-Allow-Origin: *)
    //     → Bypasses proxy entirely, works for both GET and POST
    //
    //   github.com/login/* OAuth endpoints:
    //     → plainFetchDeforce: true (forces proxy route)
    //     → github.com/login doesn't support CORS, must go through proxy
    //     → OAuth calls use POST, which the proxy handles fine
    //
    // body is passed as a plain object (risuFetch handles JSON.stringify).
    // rawResponse: false → returns parsed JSON in result.data.
    // ==========================================

    /**
     * Wrap risuFetch result ({ ok, data, headers, status }) into a
     * Response-like object so callers can use .ok, .json(), .text(), .status.
     */
    function wrapRisuFetchResult(result) {
        const ok = !!result.ok;
        const status = result.status || (ok ? 200 : 400);
        const data = result.data;
        const headers = result.headers || {};

        return {
            ok,
            status,
            headers,
            async json() {
                if (typeof data === 'object') return data;
                if (typeof data === 'string') return JSON.parse(data);
                return data;
            },
            async text() {
                if (typeof data === 'string') return data;
                return JSON.stringify(data);
            },
        };
    }

    /**
     * Check if a risuFetch result represents a real HTTP response
     * (even error like 401/403) vs a network/CORS/fetch failure.
     * Network failures get: { ok:false, data:"TypeError:...", headers:{}, status:400 }
     */
    function isRealHttpResponse(result) {
        if (result.headers && Object.keys(result.headers).length > 0) return true;
        if (result.status && result.status !== 400) return true;
        if (result.data && typeof result.data === 'object') return true;
        return false;
    }

    async function copilotFetch(url, options = {}) {
        const Risu = window.Risuai || window.risuai;
        const method = options.method || (url.includes('github.com/login/') ? 'POST' : 'GET');
        // Sanitize headers to prevent ISO-8859-1 errors in browser fetch
        const headers = sanitizeHeaders(options.headers || {});

        // Parse body: callers pass JSON string, but risuFetch needs a plain object
        let body = undefined;
        if (options.body) {
            try {
                body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            } catch (e) {
                body = options.body;
            }
        }

        // --- OAuth endpoints (github.com/login/*) → must use proxy (no CORS) ---
        if (url.includes('github.com/login/')) {
            try {
                console.debug(LOG_TAG, `risuFetch [proxy/OAuth] for ${url.substring(0, 80)}...`);
                const result = await Risu.risuFetch(url, {
                    method,
                    headers,
                    body,
                    rawResponse: false,
                    plainFetchDeforce: true,
                });
                console.debug(LOG_TAG, `risuFetch [proxy] ok=${result.ok}, status=${result.status}`);
                return wrapRisuFetchResult(result);
            } catch (e) {
                console.error(LOG_TAG, 'risuFetch [proxy/OAuth] failed:', e.message);
                throw new Error(`OAuth 요청 실패: ${e.message}`);
            }
        }

        // --- API endpoints (api.github.com, api.githubcopilot.com) ---
        // Strategy 1: Direct fetch via plainFetchForce (bypasses proxy, uses CORS)
        try {
            console.debug(LOG_TAG, `risuFetch [direct] for ${url.substring(0, 80)}...`);
            const result = await Risu.risuFetch(url, {
                method,
                headers,
                body,
                rawResponse: false,
                plainFetchForce: true,
            });
            if (isRealHttpResponse(result)) {
                console.debug(LOG_TAG, `risuFetch [direct] ok=${result.ok}, status=${result.status}`);
                if (!result.ok && result.status === 401) {
                    const errDetail = typeof result.data === 'string' ? result.data.substring(0, 200) : JSON.stringify(result.data);
                    console.warn(LOG_TAG, `401 응답 상세: ${errDetail}`);
                }
                return wrapRisuFetchResult(result);
            }
            console.debug(LOG_TAG, `risuFetch [direct] not a real HTTP response:`, typeof result.data === 'string' ? result.data.substring(0, 150) : 'unknown');
        } catch (e) {
            console.debug(LOG_TAG, 'risuFetch [direct] exception:', e.message);
        }

        // Strategy 2: Proxy via plainFetchDeforce (for Tauri/desktop or if CORS fails)
        try {
            console.debug(LOG_TAG, `risuFetch [proxy] for ${url.substring(0, 80)}...`);
            const result = await Risu.risuFetch(url, {
                method,
                headers,
                body,
                rawResponse: false,
                plainFetchDeforce: true,
            });
            if (isRealHttpResponse(result)) {
                console.debug(LOG_TAG, `risuFetch [proxy] ok=${result.ok}, status=${result.status}`);
                if (!result.ok && result.status === 401) {
                    const errDetail = typeof result.data === 'string' ? result.data.substring(0, 200) : JSON.stringify(result.data);
                    console.warn(LOG_TAG, `401 [proxy] 응답 상세: ${errDetail}`);
                }
                return wrapRisuFetchResult(result);
            }
            console.debug(LOG_TAG, `risuFetch [proxy] not a real HTTP response:`, typeof result.data === 'string' ? result.data.substring(0, 150) : 'unknown');
        } catch (e) {
            console.debug(LOG_TAG, 'risuFetch [proxy] exception:', e.message);
        }

        // Strategy 3: nativeFetch as last resort (uses proxy on web, native on Tauri)
        try {
            console.debug(LOG_TAG, `nativeFetch for ${url.substring(0, 80)}...`);
            const res = await Risu.nativeFetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            return res;
        } catch (e) {
            console.debug(LOG_TAG, 'nativeFetch exception:', e.message);
        }

        throw new Error('네트워크 요청 실패: 모든 요청 방식이 실패했습니다. RisuAI 데스크탑 앱을 사용하거나, RisuAI 설정 → 기타 봇 설정 → "Use plain fetch instead of server"를 활성화하세요.');
    }

    // ==========================================
    // COPILOT API FUNCTIONS
    // ==========================================
    async function requestDeviceCode() {
        const res = await copilotFetch('https://github.com/login/device/code', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
            body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'user:email' }),
        });
        if (!res.ok) throw new Error(`디바이스 코드 요청 실패 (${res.status}): ${await res.text()}`);
        return await res.json();
    }

    async function exchangeAccessToken(deviceCode) {
        const res = await copilotFetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
            body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        });
        if (!res.ok) throw new Error(`액세스 토큰 요청 실패 (${res.status}): ${await res.text()}`);
        const data = await res.json();
        if (data.error === 'authorization_pending') throw new Error('인증이 아직 완료되지 않았습니다. GitHub에서 코드를 입력 후 다시 시도하세요.');
        if (!data.access_token) throw new Error(`액세스 토큰을 찾을 수 없습니다: ${JSON.stringify(data)}`);
        return data.access_token;
    }

    async function checkTokenStatus(token) {
        const cleanToken = sanitizeToken(token);
        if (!cleanToken) throw new Error('토큰이 비어있습니다. 먼저 토큰을 생성하세요.');
        if (cleanToken !== token) {
            console.warn(LOG_TAG, `토큰에서 비정상 문자가 제거됨 (원본 ${token.length}자 → 정제 ${cleanToken.length}자)`);
        }
        const res = await copilotFetch('https://api.github.com/copilot_internal/v2/token', {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${cleanToken}`, 'User-Agent': USER_AGENT },
        });
        if (!res.ok) {
            const errBody = await res.text();
            if (res.status === 401) {
                const parsed = (() => { try { return JSON.parse(errBody); } catch { return null; } })();
                if (parsed?.message === 'Bad credentials') {
                    throw new Error('토큰이 만료되었거나 유효하지 않습니다. 🔑 토큰 생성 버튼으로 새 토큰을 발급받으세요.');
                }
            }
            throw new Error(`상태 확인 실패 (${res.status}): ${errBody}`);
        }
        return await res.json();
    }

    async function getTidToken(token) {
        const data = await checkTokenStatus(token);
        if (!data.token) throw new Error('Tid 토큰을 가져올 수 없습니다.');
        return data;
    }

    async function fetchModelList(token) {
        const tidData = await getTidToken(token);
        const res = await copilotFetch('https://api.githubcopilot.com/models', {
            method: 'GET',
            headers: {
                'Accept': 'application/json', 'Authorization': `Bearer ${tidData.token}`,
                'Editor-Version': `vscode/${CODE_VERSION}`, 'Editor-Plugin-Version': `copilot-chat/${CHAT_VERSION}`,
                'Copilot-Integration-Id': 'vscode-chat', 'User-Agent': USER_AGENT,
            },
        });
        if (!res.ok) throw new Error(`모델 목록 요청 실패 (${res.status}): ${await res.text()}`);
        return await res.json();
    }

    async function checkQuota(token) {
        const tidData = await getTidToken(token);
        const quotaInfo = { plan: tidData.sku || 'unknown' };

        // 1. Extract useful fields from token endpoint response
        const tokenMeta = {};
        const skipKeys = ['token', 'tracking_id'];
        for (const [k, v] of Object.entries(tidData)) {
            if (!skipKeys.includes(k) && k !== 'sku') {
                tokenMeta[k] = v;
            }
        }
        if (Object.keys(tokenMeta).length > 0) {
            quotaInfo.token_meta = tokenMeta;
        }

        // 2. Copilot usage / quota via copilot_internal/user
        //    This is the correct endpoint for quota_snapshots (premium_interactions, chat, completions)
        //    Reference: copilotstats.com uses this same endpoint
        try {
            console.debug(LOG_TAG, 'Fetching Copilot quota via /copilot_internal/user...');
            const userRes = await copilotFetch('https://api.github.com/copilot_internal/user', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT,
                },
            });
            if (userRes.ok) {
                const userData = await userRes.json();
                quotaInfo.copilot_user = userData;
                if (userData.quota_snapshots) {
                    quotaInfo.quota_snapshots = userData.quota_snapshots;
                }
                console.debug(LOG_TAG, 'Copilot user data retrieved successfully.');
            } else {
                console.warn(LOG_TAG, `copilot_internal/user returned ${userRes.status}`);
            }
        } catch (e) { console.warn(LOG_TAG, 'Copilot user quota check failed:', e); }

        return quotaInfo;
    }

    // ==========================================
    // INLINE RESULT RENDERER (for settingsTab)
    // ==========================================
    function showResult(html) {
        const c = document.getElementById(`${PREFIX}-result`);
        if (!c) return;
        c.style.display = 'block';
        c.innerHTML = html;
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function showLoading(msg = '처리 중...') {
        showResult(`<div class="text-center py-6 text-gray-400"><div class="text-2xl mb-2">⏳</div><div>${msg}</div></div>`);
    }
    function showError(msg) {
        showResult(`<div class="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300"><strong>❌ 오류:</strong> ${escapeHtml(msg)}</div>`);
    }
    function showSuccess(msg) {
        showResult(`<div class="bg-green-950 border border-green-800 rounded-lg p-4 text-green-300">${msg}</div>`);
    }

    async function refreshTokenDisplay() {
        const el = document.getElementById(`${PREFIX}-token-display`);
        if (!el) return;
        const token = await getToken();
        if (token && token.length > 16) {
            el.textContent = token.substring(0, 8) + '••••••••' + token.substring(token.length - 4);
        } else if (token) {
            el.textContent = token;
        } else {
            el.textContent = '토큰 없음';
        }
    }

    // ==========================================
    // ACTION HANDLERS (exposed on window for inline onclick)
    // ==========================================
    const actions = {};

    actions.manualSave = async () => {
        const input = document.getElementById(`${PREFIX}-manual-input`);
        if (!input) return;
        const val = input.value.trim();
        if (!val) { toast('토큰을 입력하세요.'); return; }
        setToken(val);
        input.value = '';
        await refreshTokenDisplay();
        toast('토큰이 저장되었습니다.');
        showSuccess('<strong>✅ 성공!</strong> 직접 입력한 토큰이 저장되었습니다.');
    };

    actions.copyToken = async () => {
        const token = await getToken();
        if (!token) { toast('저장된 토큰이 없습니다.'); return; }
        try { await navigator.clipboard.writeText(token); } catch {
            const ta = document.createElement('textarea'); ta.value = token; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        toast('토큰이 클립보드에 복사되었습니다.');
    };

    actions.generate = async () => {
        const DIALOG_ID = `${PREFIX}-generate-dialog`;
        document.getElementById(DIALOG_ID)?.remove();
        try {
            showLoading('GitHub 디바이스 코드 요청 중...');
            const deviceCode = await requestDeviceCode();
            const rc = document.getElementById(`${PREFIX}-result`); if (rc) rc.style.display = 'none';

            const dialog = document.createElement('div');
            dialog.id = DIALOG_ID;
            dialog.className = 'fixed inset-0 flex items-center justify-center p-2';
            dialog.style.cssText = 'z-index:10002; background:rgba(0,0,0,0.6);';
            dialog.innerHTML = `
                <div class="bg-gray-900 rounded-xl w-full max-w-md border border-gray-700 overflow-hidden">
                    <div class="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                        <h3 class="text-lg font-bold text-white">🔑 GitHub Copilot 토큰 생성</h3>
                        <button onclick="document.getElementById('${DIALOG_ID}')?.remove()" class="text-gray-400 hover:text-white text-xl px-2">✕</button>
                    </div>
                    <div class="p-5">
                        <div class="bg-gray-800 rounded-lg p-5 mb-4 space-y-4">
                            <div class="flex items-start"><span class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 shrink-0">1</span>
                                <span class="text-gray-200"><a href="https://github.com/login/device" target="_blank" class="text-blue-400 underline">https://github.com/login/device</a> 로 이동하세요</span></div>
                            <div class="flex items-start"><span class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 shrink-0">2</span>
                                <div class="flex-1"><span class="text-gray-200">아래 코드를 입력하세요:</span>
                                    <div class="flex items-center justify-between bg-gray-700 p-3 rounded-md mt-2">
                                        <span class="font-mono text-2xl tracking-widest text-white font-bold" id="${DIALOG_ID}-code">${deviceCode.user_code}</span>
                                        <button onclick="navigator.clipboard.writeText(document.getElementById('${DIALOG_ID}-code').textContent).then(()=>{})" class="bg-gray-600 hover:bg-gray-500 text-white text-xs px-3 py-1 rounded">복사</button>
                                    </div></div></div>
                            <div class="flex items-start"><span class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 shrink-0">3</span>
                                <span class="text-gray-200">GitHub 계정으로 인증하세요</span></div>
                        </div>
                        <p class="text-gray-400 text-center text-sm mb-4">인증을 완료한 후 확인 버튼을 클릭하세요.</p>
                        <div class="flex justify-end space-x-3">
                            <button onclick="document.getElementById('${DIALOG_ID}')?.remove()" class="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-lg text-sm">취소</button>
                            <button id="${DIALOG_ID}-confirm" class="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-bold">확인</button>
                        </div>
                    </div>
                </div>`;
            dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') dialog.remove(); });
            document.body.appendChild(dialog);

            document.getElementById(`${DIALOG_ID}-confirm`).addEventListener('click', async function () {
                this.disabled = true; this.textContent = '확인 중...';
                try {
                    const accessToken = await exchangeAccessToken(deviceCode.device_code);
                    setToken(accessToken);
                    dialog.remove();
                    await refreshTokenDisplay();
                    toast('GitHub Copilot 토큰이 성공적으로 생성되었습니다!');
                    showSuccess('<strong>✅ 성공!</strong> 토큰이 생성되고 저장되었습니다.');
                } catch (e) { this.disabled = false; this.textContent = '확인'; toast(e.message); }
            });
        } catch (e) { showError(e.message); }
    };

    actions.verify = async () => {
        const token = await getToken();
        if (!token) { showError('저장된 토큰이 없습니다. 먼저 토큰을 생성하세요.'); return; }
        showLoading('토큰 상태 확인 중...');
        try {
            const data = await checkTokenStatus(token);
            const sku = data.sku || '알 수 없음';
            const telemetry = data.telemetry || '알 수 없음';
            const expiresAt = data.expires_at ? new Date(data.expires_at * 1000).toLocaleString('ko-KR') : '알 수 없음';
            const features = Object.entries(data).filter(([, v]) => typeof v === 'boolean' && v).map(([k]) => k);
            const ci = `<span class="text-green-400 mr-1">✓</span>`, xi = `<span class="text-red-400 mr-1">✗</span>`;
            showResult(`
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
                    <h4 class="text-white font-bold mb-3">구독 정보</h4>
                    <div class="bg-gray-900 p-3 rounded space-y-1 text-sm text-gray-200">
                        <div>${sku === 'monthly_subscriber' ? ci : xi}<strong>구독:</strong> ${escapeHtml(sku)}</div>
                        <div>${telemetry === 'disabled' ? ci : xi}<strong>텔레메트리:</strong> ${escapeHtml(telemetry)}</div>
                        <div class="text-gray-500 text-xs pt-1">토큰 만료: ${expiresAt}</div>
                    </div>
                </div>
                ${features.length > 0 ? `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
                    <h4 class="text-white font-bold mb-3">활성 기능 (${features.length})</h4>
                    <div class="bg-gray-900 p-3 rounded grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-gray-300">
                        ${features.map(f => `<div>${ci}${escapeHtml(f)}</div>`).join('')}
                    </div></div>` : ''}`);
        } catch (e) { showError(e.message); }
    };

    actions.remove = async () => {
        const token = await getToken();
        if (!token) { toast('이미 토큰이 비어있습니다.'); return; }
        if (!confirm('정말로 저장된 GitHub Copilot 토큰을 제거하시겠습니까?\n\n제거 후에는 다시 토큰을 생성해야 합니다.')) return;
        setToken('');
        await refreshTokenDisplay();
        toast('토큰이 제거되었습니다.');
        showResult(`<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-yellow-300"><strong>🗑️ 토큰 제거 완료.</strong> 필요 시 다시 생성하세요.</div>`);
    };

    actions.models = async () => {
        const token = await getToken();
        if (!token) { showError('저장된 토큰이 없습니다. 먼저 토큰을 생성하세요.'); return; }
        showLoading('모델 목록 조회 중...');
        try {
            const data = await fetchModelList(token);
            const ids = (data.data || []).map(m => m.id);
            showResult(`
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
                    <h4 class="text-white font-bold mb-3">사용 가능한 모델 (${ids.length}개)</h4>
                    <div class="bg-gray-900 p-3 rounded max-h-48 overflow-y-auto font-mono text-xs text-gray-300">
                        ${ids.map(id => `<div class="py-1 border-b border-gray-800">${escapeHtml(id)}</div>`).join('')}
                    </div>
                </div>
                <details class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                    <summary class="p-4 text-white font-bold cursor-pointer select-none">모델 상세 정보 (클릭하여 펼치기)</summary>
                    <div class="px-4 pb-4"><div class="bg-gray-900 p-3 rounded max-h-72 overflow-y-auto font-mono text-[11px] text-gray-500 whitespace-pre-wrap break-all">${escapeHtml(JSON.stringify(data, null, 2))}</div></div>
                </details>`);
        } catch (e) { showError(e.message); }
    };

    actions.quota = async () => {
        const token = await getToken();
        if (!token) { showError('저장된 토큰이 없습니다. 먼저 토큰을 생성하세요.'); return; }
        showLoading('할당량 정보 조회 중...');
        try {
            const q = await checkQuota(token);

            // === 1. Subscription plan ===
            const planLabels = {
                'copilot_for_individuals_subscriber': 'Copilot Individual',
                'copilot_for_individuals_pro_subscriber': 'Copilot Pro',
                'plus_monthly_subscriber_quota': 'Copilot Pro+ (월간)',
                'plus_yearly_subscriber_quota': 'Copilot Pro+ (연간)',
            };
            const planDisplay = planLabels[q.plan] || q.plan;
            let html = `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
                <h4 class="text-white font-bold mb-3">📊 구독 플랜</h4>
                <div class="bg-gray-900 p-3 rounded text-sm text-gray-200">
                    <div class="mb-1"><strong>플랜:</strong> ${escapeHtml(planDisplay)}</div>
                    <div class="text-gray-500 text-xs">(SKU: ${escapeHtml(q.plan)})</div>
                </div></div>`;

            // === 2. Copilot 할당량 (quota_snapshots from copilot_internal/user) ===
            if (q.quota_snapshots) {
                const snap = q.quota_snapshots;

                // 2a. Premium Interactions (메인 할당량)
                if (snap.premium_interactions) {
                    const pi = snap.premium_interactions;
                    const remaining = pi.remaining ?? 0;
                    const entitlement = pi.entitlement ?? 0;
                    const used = entitlement - remaining;
                    const pctRemaining = pi.percent_remaining ?? (entitlement > 0 ? (remaining / entitlement * 100) : 0);
                    const color = pctRemaining > 70 ? '#4ade80' : (pctRemaining > 30 ? '#facc15' : '#f87171');
                    const overage = pi.overage_permitted ? '허용' : '비허용';
                    html += `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
                        <h4 class="text-white font-bold mb-3">🎯 프리미엄 요청 할당량</h4>
                        <div class="bg-gray-900 p-3 rounded text-sm text-gray-300">
                            <div class="mb-2 flex items-baseline justify-between">
                                <span><strong>남은 요청:</strong></span>
                                <span style="color:${color}; font-size:1.4em; font-weight:bold;">${remaining} <span style="font-size:0.6em; color:#9ca3af;">/ ${entitlement}</span></span>
                            </div>
                            <div class="bg-gray-700 rounded-full h-3 overflow-hidden mb-2"><div style="background:${color}; width:${pctRemaining}%; height:100%; transition:width 0.3s; border-radius:9999px;"></div></div>
                            <div class="flex justify-between text-xs text-gray-400">
                                <span>사용: ${used}회</span>
                                <span>${pctRemaining.toFixed(1)}% 남음</span>
                            </div>
                            ${pi.unlimited ? '<div class="text-green-400 text-xs mt-1 font-bold">♾️ 무제한</div>' : ''}
                            <div class="text-gray-500 text-xs mt-1">초과 허용: ${overage}</div>
                            ${pi.reset_date ? `<div class="text-gray-500 text-xs">리셋: ${new Date(pi.reset_date).toLocaleString('ko-KR')}</div>` : ''}
                        </div></div>`;
                }

                // 2b. Other quotas (chat, completions, etc.)
                const otherQuotas = Object.entries(snap).filter(([k]) => k !== 'premium_interactions');
                if (otherQuotas.length > 0) {
                    let oqHtml = '';
                    for (const [key, quota] of otherQuotas) {
                        const label = key.replace(/_/g, ' ');
                        if (quota.unlimited) {
                            oqHtml += `<div class="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                                <span class="capitalize text-xs text-gray-300">${escapeHtml(label)}</span>
                                <span class="text-green-400 text-xs font-bold">♾️ 무제한</span>
                            </div>`;
                        } else {
                            const rem = quota.remaining ?? 0;
                            const ent = quota.entitlement ?? 0;
                            const pct = quota.percent_remaining ?? (ent > 0 ? (rem / ent * 100) : 0);
                            const clr = pct > 70 ? '#4ade80' : (pct > 30 ? '#facc15' : '#f87171');
                            oqHtml += `<div class="py-2 border-b border-gray-700 last:border-0">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="capitalize text-xs text-gray-300">${escapeHtml(label)}</span>
                                    <span class="text-xs" style="color:${clr};">${rem} / ${ent}</span>
                                </div>
                                <div class="bg-gray-700 rounded-full h-1.5 overflow-hidden"><div style="background:${clr}; width:${pct}%; height:100%; border-radius:9999px;"></div></div>
                            </div>`;
                        }
                    }
                    html += `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
                        <h4 class="text-white font-bold mb-3">📋 기타 할당량</h4>
                        <div class="bg-gray-900 p-3 rounded">${oqHtml}</div></div>`;
                }
            } else {
                html += `<div class="bg-yellow-950 border border-yellow-800 rounded-lg p-4 mb-3">
                    <h4 class="text-yellow-300 font-bold mb-2">⚠️ 할당량 정보 없음</h4>
                    <div class="text-yellow-200 text-sm">
                        <p class="mb-1">Copilot 할당량 정보를 가져올 수 없었습니다.</p>
                        <p class="text-yellow-400 text-xs">이 플랜에서 할당량 API를 지원하지 않거나, 토큰 권한이 부족할 수 있습니다. <a href="https://github.com/settings/copilot" target="_blank" style="color:#60a5fa; text-decoration:underline;">GitHub 설정</a>에서 확인하세요.</p>
                    </div></div>`;
            }

            // === 3. Token features (collapsible) ===
            if (q.token_meta && Object.keys(q.token_meta).length > 0) {
                const tm = q.token_meta;
                const boolFeatures = [];
                const otherFields = {};
                for (const [k, v] of Object.entries(tm)) {
                    if (typeof v === 'boolean') {
                        boolFeatures.push({ key: k, enabled: v });
                    } else if (k === 'expires_at') {
                        otherFields[k] = new Date(v * 1000).toLocaleString('ko-KR');
                    } else if (k === 'refresh_in') {
                        otherFields[k] = `${v}초`;
                    } else {
                        otherFields[k] = v;
                    }
                }
                let featHtml = '';
                if (boolFeatures.length > 0) {
                    featHtml += `<div class="grid grid-cols-2 gap-1 mb-2">`;
                    for (const f of boolFeatures) {
                        featHtml += `<div class="text-xs"><span class="${f.enabled ? 'text-green-400' : 'text-gray-600'}">${f.enabled ? '✅' : '❌'}</span> ${escapeHtml(f.key)}</div>`;
                    }
                    featHtml += `</div>`;
                }
                if (Object.keys(otherFields).length > 0) {
                    featHtml += `<div class="text-xs text-gray-400 font-mono whitespace-pre-wrap mt-2">${escapeHtml(JSON.stringify(otherFields, null, 2))}</div>`;
                }
                html += `<details class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-3">
                    <summary class="p-4 text-white font-bold cursor-pointer select-none">🔧 토큰 기능 상세 (클릭하여 펼치기)</summary>
                    <div class="px-4 pb-4">${featHtml}</div>
                </details>`;
            }

            // === 4. Raw API response (collapsible) ===
            if (q.copilot_user) {
                html += `<details class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                    <summary class="p-4 text-gray-400 font-bold cursor-pointer select-none text-sm">🔍 API 원본 응답 (클릭하여 펼치기)</summary>
                    <div class="px-4 pb-4"><div class="bg-gray-900 p-3 rounded max-h-72 overflow-y-auto font-mono text-[11px] text-gray-500 whitespace-pre-wrap break-all">${escapeHtml(JSON.stringify(q.copilot_user, null, 2))}</div></div>
                </details>`;
            }

            showResult(html || `<div class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-yellow-300">할당량 정보를 가져올 수 없습니다.</div>`);
        } catch (e) { showError(e.message); }
    };

    actions.autoConfig = async () => {
        const token = await getToken();
        if (!token) { showError('저장된 토큰이 없습니다. 먼저 토큰을 생성하세요.'); return; }
        if (!confirm(`GitHub Copilot 자동 설정을 진행하시겠습니까?\n\nCustom Model에 다음 설정이 자동 추가됩니다:\n  URL: https://api.githubcopilot.com/chat/completions\n  모델: gpt-4.1\n  포맷: OpenAI\n\n기존 Copilot 커스텀 모델이 있으면 덮어씁니다.`)) return;
        showLoading('자동 설정 적용 중...');
        try {
            // Check if addCustomModel API is available
            if (typeof CPM.addCustomModel !== 'function') {
                showError('CupcakePM 버전이 낮아 자동 설정을 지원하지 않습니다. Provider Manager를 업데이트해주세요.');
                return;
            }
            const modelDef = {
                name: '🤖 Copilot (GPT-4.1)',
                model: 'gpt-4.1',
                url: 'https://api.githubcopilot.com/chat/completions',
                key: '',
                format: 'openai',
                sysfirst: false,
                mergesys: false,
                altrole: false,
                mustuser: false,
                maxout: false,
                decoupled: false,
                thought: false,
                reasoning: 'none',
                verbosity: 'none',
                thinking: 'none',
                tok: 'o200k_base',
                customParams: '',
            };
            const result = CPM.addCustomModel(modelDef, 'copilot-auto');
            if (result.success) {
                toast('Copilot 커스텀 모델이 추가되었습니다!');
                showSuccess(`<strong>✅ 자동 설정 완료!</strong>
                    <p class="mt-2 text-sm">다음 Custom Model이 ${result.created ? '생성' : '업데이트'}되었습니다:</p>
                    <div class="bg-gray-900 rounded p-3 mt-2 text-xs font-mono text-gray-300 space-y-1">
                        <div><strong>이름:</strong> ${escapeHtml(modelDef.name)}</div>
                        <div><strong>URL:</strong> ${escapeHtml(modelDef.url)}</div>
                        <div><strong>모델:</strong> ${escapeHtml(modelDef.model)}</div>
                        <div><strong>Key:</strong> Copilot 토큰 자동 사용 (githubcopilot.com URL 감지)</div>
                    </div>
                    <p class="mt-3 text-xs text-yellow-300">💡 RisuAI 메인 UI에서 [Cupcake PM] [Custom] 🤖 Copilot (GPT-4.1) 을 선택하면 사용할 수 있습니다.<br>변경사항을 적용하려면 설정을 닫고 플러그인을 다시 로드하세요.</p>`);
            } else {
                showError('커스텀 모델 추가에 실패했습니다: ' + (result.error || '알 수 없는 오류'));
            }
        } catch (e) { showError(e.message); }
    };

    // Expose on window for inline onclick (settings tab HTML uses these)
    window._cpmCopilot = actions;

    // ==========================================
    // REGISTER AS SETTINGS TAB (appears in sidebar)
    // ==========================================
    const BTN_CLASS = 'w-full flex flex-col items-center justify-center p-4 rounded-lg bg-gray-800 hover:bg-blue-600 text-gray-200 transition-colors border border-gray-700 cursor-pointer text-sm font-medium';
    const BTN_RED_CLASS = 'w-full flex flex-col items-center justify-center p-4 rounded-lg bg-gray-800 hover:bg-red-600 text-gray-200 transition-colors border border-gray-700 cursor-pointer text-sm font-medium';

    CPM.registerProvider({
        name: 'Copilot',
        // No models or fetcher — this is a tool, not a provider
        settingsTab: {
            id: 'tab-copilot',
            icon: '🔑',
            label: 'Copilot',
            exportKeys: [TOKEN_ARG_KEY],
            renderContent: async (renderInput) => {
                const token = await getToken();
                const masked = token
                    ? (token.length > 16 ? token.substring(0, 8) + '••••••••' + token.substring(token.length - 4) : token)
                    : '토큰 없음';

                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">🔑 GitHub Copilot 토큰 관리자</h3>
                    <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">
                        GitHub Copilot OAuth 토큰을 생성·확인·제거하고, 사용 가능한 모델과 할당량을 조회합니다.
                    </p>

                    <!-- Current Token Display -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-400 mb-2">현재 저장된 토큰</label>
                        <div class="flex items-center space-x-2">
                            <div id="${PREFIX}-token-display" class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-300 font-mono text-sm select-all truncate">${escapeHtml(masked)}</div>
                            <button onclick="window._cpmCopilot.copyToken()" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold shrink-0" title="토큰 복사">📋 복사</button>
                        </div>
                    </div>

                    <!-- Manual Token Input -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-400 mb-2">토큰 직접 입력</label>
                        <div class="flex items-center space-x-2">
                            <input id="${PREFIX}-manual-input" type="text" placeholder="ghu_xxxx 또는 gho_xxxx 토큰을 붙여넣기..." class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-200 font-mono text-sm focus:border-blue-500 focus:outline-none" />
                            <button onclick="window._cpmCopilot.manualSave()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold shrink-0">💾 저장</button>
                        </div>
                        <p class="text-gray-500 text-xs mt-1">GitHub에서 직접 발급받은 토큰을 수동으로 입력할 수 있습니다.</p>
                    </div>

                    <!-- Action Buttons Grid -->
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                        <button onclick="window._cpmCopilot.generate()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">🔑</span><span>토큰 생성</span>
                        </button>
                        <button onclick="window._cpmCopilot.verify()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">✅</span><span>토큰 확인</span>
                        </button>
                        <button onclick="window._cpmCopilot.remove()" class="${BTN_RED_CLASS}">
                            <span class="text-2xl mb-1">🗑️</span><span>토큰 제거</span>
                        </button>
                        <button onclick="window._cpmCopilot.models()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">📋</span><span>모델 목록</span>
                        </button>
                        <button onclick="window._cpmCopilot.quota()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">📊</span><span>할당량 확인</span>
                        </button>
                        <button onclick="window._cpmCopilot.autoConfig()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">⚙️</span><span>자동 설정</span>
                        </button>
                    </div>

                    <!-- Result Container -->
                    <div id="${PREFIX}-result" style="display:none;" class="space-y-3"></div>
                `;
            }
        }
    });

    console.debug(`${LOG_TAG} Settings tab registered (v1.5.1) — sidebar: 🔑 Copilot`);
})();
