//@name CPM Component - Translation Cache Manager
//@display-name Cupcake Translation Cache
//@version 1.2.2
//@author Cupcake
//@description 번역 캐시를 검색·조회·수정하고, 사용자 번역 사전으로 표시 번역을 교정하는 관리 도구입니다.
//@icon 💾
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-translation-cache.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Translation Cache Manager ========
 *
 * RisuAI의 LLM 번역 캐시를 관리합니다.
 *
 * 아키텍처:
 *   v3 플러그인은 about:srcdoc 샌드박스 iframe에서 실행되므로
 *   IndexedDB에 직접 접근할 수 없습니다 (allow-same-origin 없음).
 *
 *   → 읽기: risuai.searchTranslationCache / risuai.getTranslationCache
 *     (postMessage RPC를 통해 부모 윈도우에서 실행)
 *   → 쓰기: 공식 API에 없으므로 risuai.pluginStorage에
 *     "사용자 수정 사전" 오버레이를 저장하고,
 *     addRisuScriptHandler('display', ...) 로 표시 시점에 적용.
 *
 * 기능:
 *   - RisuAI 번역 캐시 검색·조회 (API 경유, 읽기 전용)
 *   - 번역 수정 → 사용자 수정 사전에 저장, 실시간 반영
 *   - 수정 사전 관리 (추가/삭제/되돌리기)
 *   - 전체 내보내기 (캐시 + 수정 사전 병합 JSON)
 *   - JSON 파일 가져오기 (수정 사전에 병합)
 *   - 수정 사전 초기화
 */
(() => {
    if (!window.Risuai && !window.risuai) {
        console.warn('[CPM TransCache] RisuAI API not found. Halting.');
        return;
    }
    const risuai = window.risuai || window.Risuai;
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM TransCache] CupcakePM API not found!'); return; }

    // ==========================================
    // Cleanup previous instance (hot-reload)
    // ==========================================
    if (window._cpmTransCacheCleanup) {
        try { window._cpmTransCacheCleanup(); } catch (e) { /* ignore */ }
    }

    // ==========================================
    // CONSTANTS
    // ==========================================
    const LOG_TAG = '[CPM TransCache]';
    const PREFIX = 'cpm-transcache';
    const CORRECTIONS_KEY = 'cpm_transcache_corrections';
    const ENABLED_ARG_KEY = 'cpm_transcache_display_enabled';
    const PAGE_SIZE = 50;
    const TIMESTAMPS_KEY = 'cpm_transcache_timestamps';

    // ==========================================
    // API Feature Detection
    // ==========================================
    const canSearchCache = typeof risuai.searchTranslationCache === 'function';
    const canGetCache = typeof risuai.getTranslationCache === 'function';
    console.log(`${LOG_TAG} API: searchTranslationCache=${canSearchCache}, getTranslationCache=${canGetCache}`);

    // ==========================================
    // HTML Escape
    // ==========================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ==========================================
    // Corrections Storage (pluginStorage)
    // ==========================================
    // Format: { "original_text": { old: "cached_translation", new: "corrected_translation" }, ... }
    let _corrections = {};

    async function loadCorrections() {
        try {
            const raw = await risuai.pluginStorage.getItem(CORRECTIONS_KEY);
            _corrections = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        } catch (e) {
            console.error(LOG_TAG, 'loadCorrections error:', e);
            _corrections = {};
        }
        rebuildReplacementMap();
        return _corrections;
    }

    async function saveCorrections() {
        try {
            await risuai.pluginStorage.setItem(CORRECTIONS_KEY, JSON.stringify(_corrections));
            rebuildReplacementMap();
        } catch (e) {
            console.error(LOG_TAG, 'saveCorrections error:', e);
            throw e;
        }
    }

    // ==========================================
    // In-memory Replacement Map for Display
    // ==========================================
    // Map<oldTranslation, newTranslation> — used by the display handler
    let _replacementMap = new Map();

    function rebuildReplacementMap() {
        _replacementMap.clear();
        for (const data of Object.values(_corrections)) {
            if (data && data.old && data.new && data.old !== data.new) {
                _replacementMap.set(data.old, data.new);
            }
        }
    }

    // ==========================================
    // Display Handler — applies corrections
    // ==========================================
    let _displayEnabled = true;

    const displayHandler = (content) => {
        if (!_displayEnabled || _replacementMap.size === 0 || !content) return null;
        let result = content;
        for (const [oldText, newText] of _replacementMap) {
            if (result.includes(oldText)) {
                result = result.split(oldText).join(newText);
            }
        }
        return result === content ? null : result;
    };

    risuai.addRisuScriptHandler('display', displayHandler);

    // Cleanup on hot-reload
    window._cpmTransCacheCleanup = () => {
        try { risuai.removeRisuScriptHandler('display', displayHandler); } catch (e) { /* ignore */ }
    };

    // ==========================================
    // Cache API Wrappers
    // ==========================================
    // In-memory cache of all RisuAI cache entries (loaded on demand)
    let _allCacheEntries = null;
    let _cacheLoadedAt = 0;
    const CACHE_TTL = 120_000; // 2분

    async function loadAllCache(force = false) {
        if (!canSearchCache) return null;
        if (!force && _allCacheEntries && (Date.now() - _cacheLoadedAt < CACHE_TTL)) {
            return _allCacheEntries;
        }
        try {
            // searchTranslationCache("") returns ALL entries
            // because every key includes the empty string
            const results = await risuai.searchTranslationCache("");
            _allCacheEntries = results || [];
            _cacheLoadedAt = Date.now();
            // 타임스탬프 인덱스 업데이트 (신규/변경 감지)
            await updateTimestamps(_allCacheEntries);
            return _allCacheEntries;
        } catch (e) {
            console.error(LOG_TAG, 'loadAllCache error:', e);
            return null;
        }
    }

    async function searchCacheLocal(query) {
        // Always force-refresh from IndexedDB to avoid stale results
        // after retranslation updates the cache.
        const all = await loadAllCache(true);
        if (!all) return null;
        if (!query) return all;
        const lq = query.toLowerCase();
        return all.filter(entry =>
            entry.key.toLowerCase().includes(lq) ||
            entry.value.toLowerCase().includes(lq)
        );
    }

    // ==========================================
    // Timestamp Tracking (번역 시점 추적)
    // ==========================================
    // IndexedDB는 키 사전순으로만 정렬하므로,
    // 신규/변경을 감지하여 타임스탬프를 별도 저장합니다.
    // Format: { "원문키": { ts: timestamp, sig: "길이:앞16자" }, ... }
    let _timestampIndex = {};

    function valueSig(value) {
        return value.length + ':' + value.substring(0, 16);
    }

    function relativeTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 0) return '';
        if (diff < 60000) return '방금 전';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
        return `${Math.floor(diff / 86400000)}일 전`;
    }

    async function loadTimestamps() {
        try {
            const raw = await risuai.pluginStorage.getItem(TIMESTAMPS_KEY);
            _timestampIndex = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        } catch (e) {
            console.error(LOG_TAG, 'loadTimestamps error:', e);
            _timestampIndex = {};
        }
    }

    async function saveTimestamps() {
        try {
            await risuai.pluginStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(_timestampIndex));
        } catch (e) {
            console.error(LOG_TAG, 'saveTimestamps error:', e);
        }
    }

    /**
     * 캐시 엔트리 배열에 _timestamp 속성을 부여합니다.
     * - 처음 보는 키: 기존 인덱스가 비어있으면 0 (최초 실행), 아니면 Date.now()
     * - 값이 변경된 키 (재번역): Date.now()
     * - 변경 없는 키: 기존 타임스탬프 유지
     */
    async function updateTimestamps(entries) {
        await loadTimestamps();
        const now = Date.now();
        const isFirstRun = Object.keys(_timestampIndex).length === 0;
        const newIndex = {};
        let changed = false;

        for (const entry of entries) {
            const sig = valueSig(entry.value);
            const existing = _timestampIndex[entry.key];

            if (!existing) {
                newIndex[entry.key] = { ts: isFirstRun ? 0 : now, sig };
                changed = true;
            } else if (existing.sig !== sig) {
                newIndex[entry.key] = { ts: now, sig };
                changed = true;
            } else {
                newIndex[entry.key] = existing;
            }
            entry._timestamp = newIndex[entry.key].ts;
        }

        if (Object.keys(_timestampIndex).length !== Object.keys(newIndex).length) {
            changed = true;
        }

        _timestampIndex = newIndex;
        if (changed) await saveTimestamps();
    }

    /**
     * 결과를 현재 정렬 모드에 따라 정렬하고 렌더링합니다.
     */
    function applySortAndRender(results) {
        _unsortedResults = [...results];
        if (_currentSort === 'recent') {
            const sorted = [...results].sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
            renderResults(sorted);
        } else {
            renderResults(results);
        }
    }

    // ==========================================
    // Init: load corrections & enabled state
    // ==========================================
    (async () => {
        try {
            const enabled = await CPM.safeGetArg(ENABLED_ARG_KEY);
            _displayEnabled = (enabled !== 'false' && enabled !== false);
        } catch (e) { /* default true */ }
        await loadCorrections();
        const corrCount = Object.keys(_corrections).length;
        console.log(`${LOG_TAG} Init: ${corrCount} corrections loaded, display=${_displayEnabled}`);

        // 타임스탬프 스냅샷 자동 생성 — 플러그인 로드 시 현재 캐시 상태를 기록하여
        // 설정창을 열지 않아도 이후 번역/재번역 변경을 감지할 수 있게 합니다.
        if (canSearchCache) {
            try {
                await loadAllCache();
                console.log(`${LOG_TAG} Init: timestamp snapshot taken (${_allCacheEntries ? _allCacheEntries.length : 0} entries)`);
            } catch (e) {
                console.warn(`${LOG_TAG} Init: snapshot failed (non-critical):`, e);
            }
        }
    })();

    // ==========================================
    // Global API (window callbacks for onclick)
    // ==========================================
    const api = {};
    window._cpmTransCache = api;

    // State
    let _searchResults = [];
    let _unsortedResults = [];
    let _currentPage = 0;
    let _isLoading = false;
    let _currentSort = 'default'; // 'default' | 'recent'

    function setResult(html) {
        const el = document.getElementById(`${PREFIX}-result`);
        if (el) { el.style.display = 'block'; el.innerHTML = html; }
    }

    function showStatus(msg, type = 'info') {
        const colors = {
            info: 'text-blue-300 border-blue-500',
            success: 'text-green-300 border-green-500',
            error: 'text-red-300 border-red-500',
            warn: 'text-yellow-300 border-yellow-500'
        };
        const c = colors[type] || colors.info;
        setResult(`<div class="border-l-4 ${c} pl-4 py-2 text-sm">${msg}</div>`);
    }

    // ==========================================
    // Results Rendering
    // ==========================================
    function renderResults(results, page = 0) {
        _searchResults = results;
        _currentPage = page;
        const total = results.length;
        const start = page * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, total);
        const totalPages = Math.ceil(total / PAGE_SIZE);

        if (total === 0) {
            setResult(`<div class="text-gray-400 text-sm py-4 text-center">검색 결과가 없습니다.</div>`);
            return;
        }

        const hasTimestamps = results.length > 0 && results[0]._timestamp !== undefined;

        let html = `
            <div class="flex items-center justify-between mb-3">
                <span class="text-sm text-gray-400">총 <strong class="text-blue-300">${total}</strong>건 (${start + 1}~${end})</span>
                <div class="flex items-center space-x-2">
                    ${page > 0 ? `<button onclick="window._cpmTransCache.goPage(${page - 1})" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">◀ 이전</button>` : ''}
                    <span class="text-xs text-gray-500">${page + 1}/${totalPages}</span>
                    ${end < total ? `<button onclick="window._cpmTransCache.goPage(${page + 1})" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">다음 ▶</button>` : ''}
                </div>
            </div>
        `;

        if (hasTimestamps) {
            const defCls = _currentSort === 'default' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600';
            const recCls = _currentSort === 'recent' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600';
            html += `
                <div class="flex items-center gap-2 mb-3">
                    <span class="text-xs text-gray-500">정렬:</span>
                    <button onclick="window._cpmTransCache.sortBy('default')" class="px-3 py-1 ${defCls} rounded text-xs font-medium">기본 (사전순)</button>
                    <button onclick="window._cpmTransCache.sortBy('recent')" class="px-3 py-1 ${recCls} rounded text-xs font-medium">🕐 최신 번역순</button>
                </div>
            `;
        }

        html += `<div class="space-y-2">`;

        for (let i = start; i < end; i++) {
            const item = results[i];
            const correction = _corrections[item.key];
            // Show corrected translation if exists
            const displayValue = correction ? correction.new : item.value;
            const keyPreview = escapeHtml(item.key.length > 80 ? item.key.substring(0, 80) + '…' : item.key);
            const valPreview = escapeHtml(displayValue.length > 80 ? displayValue.substring(0, 80) + '…' : displayValue);
            const badge = correction
                ? '<span class="ml-2 px-2 py-0.5 bg-yellow-600/30 text-yellow-300 rounded text-xs">수정됨</span>'
                : '';
            const timeStr = relativeTime(item._timestamp);
            const timeBadge = timeStr ? `<span class="ml-auto text-xs text-gray-600 shrink-0">${timeStr}</span>` : '';

            html += `
                <div class="bg-gray-800 border ${correction ? 'border-yellow-600/50' : 'border-gray-700'} rounded-lg p-3 hover:border-blue-500 transition-colors">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center text-xs text-gray-500 mb-1"><span>원문${badge}</span>${timeBadge}</div>
                            <div class="text-sm text-gray-200 break-words font-mono leading-relaxed">${keyPreview}</div>
                            <div class="text-xs text-gray-500 mt-2 mb-1">번역</div>
                            <div class="text-sm ${correction ? 'text-yellow-300' : 'text-green-300'} break-words font-mono leading-relaxed">${valPreview}</div>
                        </div>
                        <div class="flex flex-col gap-1 shrink-0">
                            <button onclick="window._cpmTransCache.viewEntry(${i})" class="px-2 py-1 bg-gray-700 hover:bg-blue-600 text-white rounded text-xs" title="상세">🔍</button>
                            <button onclick="window._cpmTransCache.editEntry(${i})" class="px-2 py-1 bg-gray-700 hover:bg-yellow-600 text-white rounded text-xs" title="수정">✏️</button>
                            ${correction ? `<button onclick="window._cpmTransCache.revertEntry(${i})" class="px-2 py-1 bg-gray-700 hover:bg-orange-600 text-white rounded text-xs" title="수정 되돌리기">↩️</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        html += `</div>`;

        if (totalPages > 1) {
            html += `
                <div class="flex items-center justify-center mt-3 space-x-2">
                    ${page > 0 ? `<button onclick="window._cpmTransCache.goPage(${page - 1})" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">◀ 이전</button>` : ''}
                    <span class="text-xs text-gray-500">${page + 1}/${totalPages}</span>
                    ${end < total ? `<button onclick="window._cpmTransCache.goPage(${page + 1})" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">다음 ▶</button>` : ''}
                </div>
            `;
        }

        setResult(html);
    }

    // ==========================================
    // API Methods
    // ==========================================
    api.goPage = (page) => renderResults(_searchResults, page);

    /** Sort results by mode */
    api.sortBy = (mode) => {
        _currentSort = mode;
        if (mode === 'recent') {
            _searchResults = [..._unsortedResults].sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
        } else {
            _searchResults = [..._unsortedResults];
        }
        renderResults(_searchResults, 0);
    };

    /** Search RisuAI cache + corrections by keyword */
    api.search = async () => {
        const input = document.getElementById(`${PREFIX}-search-input`);
        const query = input ? input.value.trim() : '';
        if (!query) { showStatus('검색어를 입력해주세요.', 'warn'); return; }
        if (_isLoading) return;
        _isLoading = true;
        showStatus('🔄 검색 중...');

        try {
            if (canSearchCache) {
                const results = await searchCacheLocal(query);
                if (results === null) {
                    showStatus('번역 캐시 API 호출에 실패했습니다.', 'error');
                } else {
                    applySortAndRender(results);
                }
            } else {
                // Fallback: search corrections only
                const lq = query.toLowerCase();
                const results = Object.entries(_corrections)
                    .filter(([key, data]) =>
                        key.toLowerCase().includes(lq) ||
                        (data.old || '').toLowerCase().includes(lq) ||
                        (data.new || '').toLowerCase().includes(lq)
                    )
                    .map(([key, data]) => ({ key, value: data.old || '' }));
                if (results.length === 0) {
                    showStatus('검색 결과가 없습니다. (API 미지원 — 수정 사전만 검색)', 'warn');
                } else {
                    renderResults(results);
                }
            }
        } catch (err) {
            console.error(LOG_TAG, 'Search error:', err);
            showStatus(`검색 오류: ${escapeHtml(err.message)}`, 'error');
        } finally {
            _isLoading = false;
        }
    };

    /** Browse all cache entries */
    api.browseAll = async () => {
        if (_isLoading) return;
        _isLoading = true;
        showStatus('🔄 전체 캐시를 불러오는 중...');

        try {
            if (canSearchCache) {
                const results = await loadAllCache(true);
                if (results === null) {
                    showStatus('번역 캐시를 불러올 수 없습니다.', 'error');
                } else if (results.length === 0) {
                    showStatus('번역 캐시가 비어 있습니다.', 'warn');
                } else {
                    applySortAndRender(results);
                }
            } else {
                showStatus('searchTranslationCache API를 사용할 수 없습니다.<br>RisuAI 버전을 확인해주세요. (수정 사전 보기는 아래 버튼 사용)', 'warn');
            }
        } catch (err) {
            console.error(LOG_TAG, 'Browse error:', err);
            showStatus(`불러오기 오류: ${escapeHtml(err.message)}`, 'error');
        } finally {
            _isLoading = false;
        }
    };

    /** View full entry detail */
    api.viewEntry = (idx) => {
        const item = _searchResults[idx];
        if (!item) return;
        const correction = _corrections[item.key];
        const displayValue = correction ? correction.new : item.value;
        const originalCached = correction ? correction.old : item.value;

        let correctionInfo = '';
        if (correction) {
            correctionInfo = `
                <div class="mb-3 bg-yellow-900/20 border border-yellow-700/50 rounded p-3">
                    <div class="text-xs text-yellow-400 mb-1">⚠️ 사용자 수정 적용됨 (원래 캐시 번역:)</div>
                    <div class="text-sm text-gray-400 font-mono whitespace-pre-wrap break-words">${escapeHtml(originalCached)}</div>
                </div>
            `;
        }

        setResult(`
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-blue-300 font-bold text-sm">📄 캐시 항목 상세</h4>
                    <button onclick="window._cpmTransCache.goPage(${_currentPage})" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">← 목록으로</button>
                </div>
                <div class="mb-3">
                    <div class="text-xs text-gray-500 mb-1">원문 (Key)</div>
                    <div class="bg-gray-900 border border-gray-600 rounded p-3 text-sm text-gray-200 font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">${escapeHtml(item.key)}</div>
                </div>
                ${correctionInfo}
                <div>
                    <div class="text-xs text-gray-500 mb-1">번역 (현재 표시값)</div>
                    <div class="bg-gray-900 border border-gray-600 rounded p-3 text-sm ${correction ? 'text-yellow-300' : 'text-green-300'} font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">${escapeHtml(displayValue)}</div>
                </div>
                <div class="flex gap-2 mt-4">
                    <button onclick="window._cpmTransCache.editEntry(${idx})" class="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-bold">✏️ 수정</button>
                    ${correction ? `<button onclick="window._cpmTransCache.revertEntry(${idx})" class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-bold">↩️ 수정 되돌리기</button>` : ''}
                </div>
            </div>
        `);
    };

    /** Edit an entry — shows editable textarea */
    api.editEntry = (idx) => {
        const item = _searchResults[idx];
        if (!item) return;
        const correction = _corrections[item.key];
        const currentValue = correction ? correction.new : item.value;

        setResult(`
            <div class="bg-gray-800 border border-yellow-600 rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-yellow-300 font-bold text-sm">✏️ 번역 수정</h4>
                    <button onclick="window._cpmTransCache.goPage(${_currentPage})" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs">← 취소</button>
                </div>
                <div class="mb-3">
                    <div class="text-xs text-gray-500 mb-1">원문 (Key)</div>
                    <div class="bg-gray-900 border border-gray-600 rounded p-3 text-sm text-gray-400 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">${escapeHtml(item.key)}</div>
                </div>
                <div class="mb-2">
                    <div class="text-xs text-gray-500 mb-1">RisuAI 캐시 원본 번역 (참고용)</div>
                    <div class="bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-500 font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto">${escapeHtml(item.value)}</div>
                </div>
                <div class="mb-4">
                    <div class="text-xs text-gray-500 mb-1">수정할 번역 — 아래에서 편집 후 저장</div>
                    <textarea id="${PREFIX}-edit-value" rows="6" class="w-full bg-gray-900 border border-yellow-600 rounded p-3 text-sm text-green-300 font-mono focus:border-yellow-400 focus:outline-none resize-y">${escapeHtml(currentValue)}</textarea>
                </div>
                <p class="text-xs text-gray-500 mb-3">💡 수정 내용은 사용자 수정 사전에 저장되며, 표시 시 자동으로 적용됩니다.</p>
                <div class="flex gap-2">
                    <button onclick="window._cpmTransCache.saveEdit(${idx})" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-bold">💾 저장</button>
                    <button onclick="window._cpmTransCache.goPage(${_currentPage})" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm font-bold">취소</button>
                </div>
            </div>
        `);
    };

    /** Save edited entry → corrections dictionary */
    api.saveEdit = async (idx) => {
        const item = _searchResults[idx];
        if (!item) return;
        const textarea = document.getElementById(`${PREFIX}-edit-value`);
        if (!textarea) return;
        const newValue = textarea.value;

        if (newValue === item.value) {
            // Same as original cache — remove correction if exists
            if (_corrections[item.key]) {
                delete _corrections[item.key];
                await saveCorrections();
                showStatus('✅ 수정이 되돌려졌습니다 (원본과 동일).', 'success');
            } else {
                showStatus('변경 사항이 없습니다.', 'warn');
            }
            return;
        }

        try {
            _corrections[item.key] = {
                old: item.value,   // original cached translation
                new: newValue      // user's corrected translation
            };
            await saveCorrections();
            showStatus('✅ 번역이 수정 사전에 저장되었습니다. 표시 시 자동 적용됩니다.', 'success');
            updateCorrectionCount();
        } catch (err) {
            console.error(LOG_TAG, 'saveEdit error:', err);
            showStatus(`저장 오류: ${escapeHtml(err.message)}`, 'error');
        }
    };

    /** Revert a correction back to original */
    api.revertEntry = async (idx) => {
        const item = _searchResults[idx];
        if (!item || !_corrections[item.key]) return;
        if (!confirm('이 항목의 수정을 되돌리시겠습니까?\n원래 캐시 번역으로 복원됩니다.')) return;

        try {
            delete _corrections[item.key];
            await saveCorrections();
            showStatus('✅ 수정이 되돌려졌습니다.', 'success');
            updateCorrectionCount();
        } catch (err) {
            console.error(LOG_TAG, 'revertEntry error:', err);
            showStatus(`되돌리기 오류: ${escapeHtml(err.message)}`, 'error');
        }
    };

    /** Export: merge RisuAI cache + user corrections → JSON */
    api.exportCache = async () => {
        showStatus('🔄 내보내기 준비 중...');
        try {
            let entries = [];
            if (canSearchCache) {
                const all = await loadAllCache(true);
                if (all) entries = all;
            }

            // Build merged object: cache entries overridden by corrections
            const obj = {};
            for (const { key, value } of entries) {
                const correction = _corrections[key];
                obj[key] = correction ? correction.new : value;
            }
            // Also include corrections for entries not in cache
            for (const [key, data] of Object.entries(_corrections)) {
                if (!(key in obj)) {
                    obj[key] = data.new;
                }
            }

            const total = Object.keys(obj).length;
            if (total === 0) {
                showStatus('내보낼 데이터가 없습니다.', 'warn');
                return;
            }

            const jsonStr = JSON.stringify(obj, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            a.href = url;
            a.download = `risu-translation-cache-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showStatus(`✅ ${total}건을 내보냈습니다. (캐시 ${entries.length}건 + 수정 ${Object.keys(_corrections).length}건 병합)`, 'success');
        } catch (err) {
            console.error(LOG_TAG, 'Export error:', err);
            showStatus(`내보내기 오류: ${escapeHtml(err.message)}`, 'error');
        }
    };

    /** Export corrections only */
    api.exportCorrections = async () => {
        const corrCount = Object.keys(_corrections).length;
        if (corrCount === 0) {
            showStatus('내보낼 수정 사전이 없습니다.', 'warn');
            return;
        }
        try {
            // Export as simple { original: correctedTranslation } format
            const obj = {};
            for (const [key, data] of Object.entries(_corrections)) {
                obj[key] = data.new;
            }
            const jsonStr = JSON.stringify(obj, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            a.href = url;
            a.download = `risu-translation-corrections-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showStatus(`✅ 수정 사전 ${corrCount}건을 내보냈습니다.`, 'success');
        } catch (err) {
            showStatus(`내보내기 오류: ${escapeHtml(err.message)}`, 'error');
        }
    };

    /** Import JSON into corrections dictionary */
    api.importCache = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            showStatus('🔄 파일을 읽는 중...');

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                    showStatus('올바른 번역 캐시 JSON 형식이 아닙니다. ({ 원문: 번역문 } 객체 필요)', 'error');
                    return;
                }
                for (const [key, value] of Object.entries(data)) {
                    if (typeof key !== 'string' || typeof value !== 'string') {
                        showStatus('파일에 문자열이 아닌 키/값이 포함되어 있습니다.', 'error');
                        return;
                    }
                }

                const entryCount = Object.keys(data).length;
                if (!confirm(`${entryCount}건을 수정 사전에 가져오시겠습니까?\n\n기존 수정 사전에 병합됩니다.\n같은 원문이면 새 값으로 덮어씁니다.`)) return;

                let added = 0;
                for (const [key, newTranslation] of Object.entries(data)) {
                    // Try to look up original cache value
                    let oldValue = '';
                    if (canGetCache) {
                        try {
                            oldValue = (await risuai.getTranslationCache(key)) || '';
                        } catch (e) { /* ignore */ }
                    }
                    _corrections[key] = {
                        old: oldValue || _corrections[key]?.old || '',
                        new: newTranslation
                    };
                    added++;
                }
                await saveCorrections();
                showStatus(`✅ ${added}건을 수정 사전에 가져왔습니다.`, 'success');
                updateCorrectionCount();
            } catch (err) {
                console.error(LOG_TAG, 'Import error:', err);
                showStatus(`가져오기 오류: ${escapeHtml(err.message)}`, 'error');
            }
        };
        input.click();
    };

    /** Clear all corrections */
    api.clearCorrections = async () => {
        const count = Object.keys(_corrections).length;
        if (count === 0) {
            showStatus('삭제할 수정 사전 항목이 없습니다.', 'warn');
            return;
        }
        if (!confirm(`수정 사전 ${count}건을 모두 삭제하시겠습니까?\n\n원래 캐시 번역으로 복원됩니다.`)) return;

        try {
            _corrections = {};
            await saveCorrections();
            showStatus(`✅ 수정 사전 ${count}건을 모두 삭제했습니다.`, 'success');
            updateCorrectionCount();
        } catch (err) {
            showStatus(`삭제 오류: ${escapeHtml(err.message)}`, 'error');
        }
    };

    /** Browse corrections only */
    api.browseCorrections = async () => {
        await loadCorrections();
        const results = Object.entries(_corrections).map(([key, data]) => ({
            key,
            value: data.old || ''
        }));
        if (results.length === 0) {
            showStatus('수정 사전이 비어 있습니다.', 'warn');
            return;
        }
        renderResults(results);
    };

    /** Add new entry manually to corrections */
    api.showAddForm = () => {
        setResult(`
            <div class="bg-gray-800 border border-green-600 rounded-lg p-4">
                <h4 class="text-green-300 font-bold text-sm mb-3">➕ 수동으로 번역 추가</h4>
                <div class="mb-3">
                    <div class="text-xs text-gray-500 mb-1">원문 (번역 전 텍스트)</div>
                    <textarea id="${PREFIX}-add-key" rows="3" class="w-full bg-gray-900 border border-gray-600 rounded p-3 text-sm text-gray-200 font-mono focus:border-green-400 focus:outline-none resize-y" placeholder="번역 전 원문을 입력하세요..."></textarea>
                </div>
                <div class="mb-4">
                    <div class="text-xs text-gray-500 mb-1">번역 (표시할 텍스트)</div>
                    <textarea id="${PREFIX}-add-value" rows="3" class="w-full bg-gray-900 border border-gray-600 rounded p-3 text-sm text-green-300 font-mono focus:border-green-400 focus:outline-none resize-y" placeholder="번역된 텍스트를 입력하세요..."></textarea>
                </div>
                <p class="text-xs text-gray-500 mb-3">💡 수정 사전에 추가됩니다. 해당 원문의 캐시 번역이 있으면 이 값으로 대체됩니다.</p>
                <div class="flex gap-2">
                    <button onclick="window._cpmTransCache.saveNewEntry()" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-bold">💾 추가</button>
                    <button onclick="window._cpmTransCache.goPage(${_currentPage})" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm font-bold">취소</button>
                </div>
            </div>
        `);
    };

    api.saveNewEntry = async () => {
        const keyEl = document.getElementById(`${PREFIX}-add-key`);
        const valEl = document.getElementById(`${PREFIX}-add-value`);
        if (!keyEl || !valEl) return;

        const key = keyEl.value;
        const value = valEl.value;
        if (!key.trim()) { showStatus('원문을 입력해주세요.', 'warn'); return; }
        if (!value.trim()) { showStatus('번역을 입력해주세요.', 'warn'); return; }

        try {
            let oldValue = '';
            if (canGetCache) {
                try { oldValue = (await risuai.getTranslationCache(key)) || ''; } catch (e) { /* ignore */ }
            }
            if (_corrections[key]) {
                if (!confirm('이미 수정 사전에 동일한 원문이 있습니다. 덮어쓰시겠습니까?')) return;
            }
            _corrections[key] = {
                old: oldValue || _corrections[key]?.old || '',
                new: value
            };
            await saveCorrections();
            showStatus('✅ 수정 사전에 추가되었습니다.', 'success');
            updateCorrectionCount();
        } catch (err) {
            console.error(LOG_TAG, 'saveNewEntry error:', err);
            showStatus(`추가 오류: ${escapeHtml(err.message)}`, 'error');
        }
    };

    /** Toggle display corrections on/off */
    api.toggleDisplay = async (checkbox) => {
        _displayEnabled = checkbox.checked;
        CPM.setArg(ENABLED_ARG_KEY, _displayEnabled);
    };

    /** Refresh counts */
    api.refreshCount = async () => {
        try {
            if (canSearchCache) {
                const all = await loadAllCache(true);
                const el = document.getElementById(`${PREFIX}-cache-count`);
                if (el && all) el.textContent = `${all.length.toLocaleString()}건`;
            }
        } catch (err) {
            console.error(LOG_TAG, 'refreshCount error:', err);
        }
        updateCorrectionCount();
    };

    function updateCorrectionCount() {
        const el = document.getElementById(`${PREFIX}-corr-count`);
        if (el) el.textContent = `${Object.keys(_corrections).length.toLocaleString()}건`;
    }

    api.onSearchKeydown = (event) => {
        if (event.key === 'Enter') { event.preventDefault(); api.search(); }
    };

    // ==========================================
    // REGISTER SETTINGS TAB
    // ==========================================
    const BTN_CLASS = 'flex flex-col items-center justify-center p-3 rounded-lg bg-gray-800 hover:bg-blue-600 text-gray-200 transition-colors border border-gray-700 cursor-pointer text-sm font-medium';
    const BTN_WARN_CLASS = 'flex flex-col items-center justify-center p-3 rounded-lg bg-gray-800 hover:bg-orange-600 text-gray-200 transition-colors border border-gray-700 cursor-pointer text-sm font-medium';
    const BTN_RED_CLASS = 'flex flex-col items-center justify-center p-3 rounded-lg bg-gray-800 hover:bg-red-600 text-gray-200 transition-colors border border-gray-700 cursor-pointer text-sm font-medium';

    CPM.registerProvider({
        name: 'TranslationCache',
        settingsTab: {
            id: 'tab-transcache',
            icon: '💾',
            label: '번역 캐시',
            exportKeys: [ENABLED_ARG_KEY],
            renderContent: async (renderInput) => {
                // Pre-fetch counts
                let cacheCount = '—';
                const corrCount = Object.keys(_corrections).length.toLocaleString() + '건';

                if (canSearchCache) {
                    try {
                        const all = await loadAllCache();
                        cacheCount = all ? `${all.length.toLocaleString()}건` : '(오류)';
                    } catch { cacheCount = '(오류)'; }
                } else {
                    cacheCount = '(API 미지원)';
                }

                const displayChecked = _displayEnabled ? 'checked' : '';

                return `
                    <h3 class="text-3xl font-bold text-blue-400 mb-6 pb-3 border-b border-gray-700">💾 번역 캐시 관리자</h3>
                    <p class="text-blue-300 font-semibold mb-4 border-l-4 border-blue-500 pl-4 py-1">
                        RisuAI 번역 캐시를 검색·확인하고, 사용자 수정 사전으로 번역을 교정합니다.
                    </p>
                    <p class="text-xs text-gray-500 mb-6">
                        ℹ️ RisuAI 캐시는 읽기 전용입니다. 번역 수정 시 "수정 사전"에 저장되며, 채팅 표시 시점에 자동으로 적용됩니다.
                    </p>

                    <!-- Display Toggle -->
                    <div class="mb-4">
                        <label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                            <input id="${PREFIX}-display-toggle" type="checkbox" ${displayChecked}
                                   onchange="window._cpmTransCache.toggleDisplay(this)"
                                   class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                            <span>수정 사전 자동 적용 (채팅 표시 시 번역 교정)</span>
                        </label>
                    </div>

                    <!-- Stats -->
                    <div class="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <span class="text-sm text-gray-400">RisuAI 번역 캐시:</span>
                                <span id="${PREFIX}-cache-count" class="text-sm font-bold text-blue-300 ml-2">${cacheCount}</span>
                            </div>
                            <button onclick="window._cpmTransCache.refreshCount()" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs" title="새로고침">🔄</button>
                        </div>
                        <div>
                            <span class="text-sm text-gray-400">사용자 수정 사전:</span>
                            <span id="${PREFIX}-corr-count" class="text-sm font-bold text-yellow-300 ml-2">${corrCount}</span>
                        </div>
                    </div>

                    <!-- Search -->
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-400 mb-2">🔍 검색 (원문 + 번역문 모두 검색)</label>
                        <div class="flex items-center space-x-2">
                            <input id="${PREFIX}-search-input" type="text" placeholder="검색어를 입력하세요..."
                                   class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm focus:border-blue-500 focus:outline-none"
                                   onkeydown="window._cpmTransCache.onSearchKeydown(event)" />
                            <button onclick="window._cpmTransCache.search()" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold shrink-0">🔍 검색</button>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <button onclick="window._cpmTransCache.browseAll()" class="${BTN_CLASS}" ${!canSearchCache ? 'disabled title="API 미지원"' : ''}>
                            <span class="text-2xl mb-1">📋</span><span>캐시 전체 보기</span>
                        </button>
                        <button onclick="window._cpmTransCache.browseCorrections()" class="${BTN_WARN_CLASS}">
                            <span class="text-2xl mb-1">📝</span><span>수정 사전 보기</span>
                        </button>
                        <button onclick="window._cpmTransCache.showAddForm()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">➕</span><span>수동 추가</span>
                        </button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                        <button onclick="window._cpmTransCache.exportCache()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">📤</span><span>전체 내보내기</span>
                        </button>
                        <button onclick="window._cpmTransCache.exportCorrections()" class="${BTN_WARN_CLASS}">
                            <span class="text-2xl mb-1">📤</span><span>수정 사전 내보내기</span>
                        </button>
                        <button onclick="window._cpmTransCache.importCache()" class="${BTN_CLASS}">
                            <span class="text-2xl mb-1">📥</span><span>가져오기</span>
                        </button>
                    </div>
                    <div class="grid grid-cols-1 gap-3 mb-6">
                        <button onclick="window._cpmTransCache.clearCorrections()" class="${BTN_RED_CLASS}">
                            <span class="text-lg">🗑️ 수정 사전 전체 삭제</span>
                        </button>
                    </div>

                    <!-- Result Container -->
                    <div id="${PREFIX}-result" style="display:none;" class="space-y-3"></div>
                `;
            }
        }
    });

    console.log(`${LOG_TAG} Translation Cache Manager v1.2.1 registered — sidebar: 💾 번역 캐시`);
})();
