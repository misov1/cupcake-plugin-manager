// @name CPM Prompt Toggle Manager
// @display-name ⚙️ PTM (프롬프트 토글 관리자) v3
// @version 3.0.2
// @description CupcakePM 서브 플러그인 - 프롬프트 토글 설정을 프리셋으로 저장하고 관리합니다.
// @icon ⚙️
// @author Cupcake

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-PTM] CupcakePM API not found!'); return; }

    const Risu = window.risuai || window.Risuai;
    if (!Risu) { console.error('[CPM-PTM] RisuAI API not found!'); return; }

    // ==========================================
    // CONSTANTS
    // ==========================================
    const LOG_TAG = '[CPM-PTM]';
    const STORAGE_KEY = 'cpm_ptm_presets_v3';
    const PREFIX = 'cpm-ptm';

    // ==========================================
    // STORAGE HELPERS
    // ==========================================

    /**
     * Load all PTM preset data from safeLocalStorage.
     * Data structure: { [groupName]: { [presetName]: toggleData[] } }
     */
    async function loadAllData() {
        try {
            const raw = await Risu.safeLocalStorage.getItem(STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            const groupCount = Object.keys(data).length;
            const presetCount = Object.values(data).reduce((sum, g) => sum + Object.keys(g).length, 0);
            console.log(LOG_TAG, `loadAllData: ${groupCount} groups, ${presetCount} presets total`, raw ? `(${raw.length} bytes)` : '(empty)');
            return data;
        } catch (e) {
            console.error(LOG_TAG, 'Failed to load presets:', e);
            return {};
        }
    }

    async function saveAllData(allData) {
        try {
            const json = JSON.stringify(allData);
            console.log(LOG_TAG, `saveAllData: saving ${json.length} bytes...`);
            await Risu.safeLocalStorage.setItem(STORAGE_KEY, json);
            console.log(LOG_TAG, 'saveAllData: saved successfully.');
        } catch (e) {
            console.error(LOG_TAG, 'Failed to save presets:', e);
        }
    }

    // ==========================================
    // TOGGLE STATE READER (SafeElement-based)
    // ==========================================

    /**
     * Reads current toggle states from the main document sidebar.
     * 
     * Two-phase approach:
     *   Phase 1 (Fast): getInnerHTML() on sidebar → parse with DOMParser
     *     - Detects toggle names and types from HTML structure
     *     - Reads checkbox values via CSS class detection (bg-darkborderc = checked)
     *     - Select/text values are NOT reliable from innerHTML (Svelte bind:value
     *       only sets JS property, not HTML attribute)
     *
     *   Phase 2 (Accurate): SafeElement API queries for select values
     *     - Uses querySelector('option:checked') on each <select> to find selected option
     *     - Extracts value from getOuterHTML() of the selected <option>
     *     - ~5 async calls per select, acceptable latency for 50+ selects
     *
     * Limitations:
     *   - Text input / textarea values cannot be read through SafeElement API
     *     (no .value property access, getAttribute only allows x- prefix)
     *   - These will show initial/empty values
     *
     * @param {boolean} debug - Enable verbose console logging
     * @returns {Array<{key: string, value: string, type: string}>} Toggle state array, or null on failure.
     */
    async function readCurrentToggleStates(debug = false) {
        try {
            const doc = await Risu.getRootDocument();
            if (!doc) {
                console.warn(LOG_TAG, 'getRootDocument returned null (permission denied?)');
                return null;
            }

            const sidebar = await doc.querySelector('.risu-sidebar');
            if (!sidebar) {
                console.warn(LOG_TAG, 'Sidebar not found (.risu-sidebar)');
                return null;
            }

            // ── Phase 1: Fast innerHTML parse ──
            // Gets toggle names, types, and checkbox values (class-based).
            const html = await sidebar.getInnerHTML();
            if (debug) {
                console.log(LOG_TAG, '[Phase1] Sidebar HTML length:', html.length);
                console.log(LOG_TAG, '[Phase1] HTML preview (first 2000 chars):', html.substring(0, 2000));
            }

            const results = parseToggleHTML(html, debug);
            if (debug) {
                console.log(LOG_TAG, `[Phase1] Parsed ${results.length} toggles`);
                results.forEach(r => console.log(LOG_TAG, `  [${r.type}] "${r.key}" = "${r.value}"`));
            }

            // ── Phase 2: SafeElement pass for select values ──
            // innerHTML can't detect which <option> is selected because Svelte's
            // bind:value sets the JS .value property, not the HTML selected attribute.
            // We use the :checked CSS pseudo-selector which matches the browser's
            // internal selected state.
            try {
                const selectElements = await sidebar.querySelectorAll('select');
                if (debug) console.log(LOG_TAG, `[Phase2] Found ${selectElements.length} <select> elements via SafeElement`);

                for (let i = 0; i < selectElements.length; i++) {
                    const selectEl = selectElements[i];

                    // Get label text from parent container's <span>
                    // Structure: <div class="w-full flex gap-2 ..."><span>Label</span><select>...</select></div>
                    const parentDiv = await selectEl.getParent();
                    if (!parentDiv) { if (debug) console.log(LOG_TAG, `[Phase2] Select ${i}: no parent`); continue; }

                    const labelSpan = await parentDiv.querySelector('span');
                    if (!labelSpan) { if (debug) console.log(LOG_TAG, `[Phase2] Select ${i}: no label span`); continue; }

                    const labelText = await labelSpan.textContent();
                    const trimmedLabel = (labelText || '').trim();

                    // Get selected option via :checked pseudo-selector
                    const checkedOption = await selectEl.querySelector('option:checked');
                    let selectedValue = '0';
                    if (checkedOption) {
                        const optionOuterHTML = await checkedOption.getOuterHTML();
                        const valueMatch = optionOuterHTML.match(/value="([^"]*)"/);
                        if (valueMatch) {
                            selectedValue = valueMatch[1];
                        }
                    }

                    if (debug) console.log(LOG_TAG, `[Phase2] Select ${i}: label="${trimmedLabel}" → value="${selectedValue}"`);

                    // Update existing result or add new
                    const existing = results.find(r => r.key === trimmedLabel && r.type === 'select');
                    if (existing) {
                        existing.value = selectedValue;
                    } else if (trimmedLabel) {
                        results.push({ key: trimmedLabel, value: selectedValue, type: 'select' });
                    }
                }

                if (debug) console.log(LOG_TAG, '[Phase2] Select value pass complete.');
            } catch (e) {
                console.warn(LOG_TAG, 'Phase 2 (select values) failed:', e);
            }

            if (debug) {
                console.log(LOG_TAG, '[Final] Total toggles:', results.length);
                const summary = { checkbox: 0, select: 0, text: 0, textarea: 0 };
                results.forEach(r => { summary[r.type] = (summary[r.type] || 0) + 1; });
                console.log(LOG_TAG, '[Final] Type breakdown:', JSON.stringify(summary));
                console.log(LOG_TAG, '[Final] Non-default values:', results.filter(r => r.value !== '0' && r.value !== '').length);
            }

            return results;
        } catch (e) {
            console.error(LOG_TAG, 'readCurrentToggleStates failed:', e);
            return null;
        }
    }

    /**
     * Parse the sidebar innerHTML to extract toggle states.
     *
     * CheckInput.svelte renders:
     *   <label class="flex items-center gap-2 cursor-pointer ...">
     *     <input class="hidden" type="checkbox" alt="name" />
     *     <span class="w-5 h-5 min-w-5 min-h-5 ... {check ? 'bg-darkborderc' : 'bg-darkbutton'} ...">
     *       <!-- SVG checkmark if checked -->
     *     </span>
     *     <span>Toggle Name</span>
     *   </label>
     *
     * SelectInput.svelte renders:
     *   <div class="w-full flex gap-2 mt-2 items-center">
     *     <span>Toggle Name</span>
     *     <select class="border border-darkborderc ...">
     *       <option value="0" class="bg-darkbg ...">Option 0</option>
     *       <option value="1" class="bg-darkbg ...">Option 1</option>
     *     </select>
     *   </div>
     *
     * NOTE: Select values from innerHTML are UNRELIABLE (always "0").
     * Use Phase 2 SafeElement pass to get actual selected values.
     */
    function parseToggleHTML(html, debug = false) {
        const results = [];
        const parser = new DOMParser();
        const fragment = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const root = fragment.body.firstChild;

        // ── Checkboxes: detect via <label> with indicator span ──
        const labels = root.querySelectorAll('label');
        if (debug) console.log(LOG_TAG, `[Parse] Found ${labels.length} <label> elements`);

        labels.forEach((label, idx) => {
            const inputEl = label.querySelector('input[type="checkbox"]');
            if (!inputEl) {
                if (debug) console.log(LOG_TAG, `[Parse] Label ${idx}: no input[type=checkbox], skipping`);
                return;
            }

            const spans = label.querySelectorAll('span');
            let toggleName = '';
            let isChecked = false;
            let foundIndicator = false;

            for (const span of spans) {
                const classes = span.className || '';
                if (classes.includes('w-5') && classes.includes('h-5')) {
                    foundIndicator = true;
                    isChecked = classes.includes('bg-darkborderc');
                    if (debug) console.log(LOG_TAG, `[Parse] Label ${idx}: indicator classes="${classes}" → checked=${isChecked}`);
                } else if (span.textContent.trim() && !classes.includes('w-3')) {
                    // Label text span (exclude SVG-size spans like w-3 h-3)
                    toggleName = span.textContent.trim();
                }
            }

            if (!foundIndicator && debug) {
                console.log(LOG_TAG, `[Parse] Label ${idx}: WARNING no indicator span (w-5 h-5) found`);
                // Fallback: check for bg-darkborderc anywhere in label
                const anyChecked = label.innerHTML.includes('bg-darkborderc');
                if (anyChecked) {
                    isChecked = true;
                    if (debug) console.log(LOG_TAG, `[Parse] Label ${idx}: fallback innerHTML check → checked=true`);
                }
            }

            if (toggleName) {
                results.push({
                    key: toggleName,
                    value: isChecked ? '1' : '0',
                    type: 'checkbox'
                });
                if (debug) console.log(LOG_TAG, `[Parse] ☑ Checkbox: "${toggleName}" = ${isChecked ? '1 (ON)' : '0 (OFF)'}`);
            }
        });

        // ── Selects: detect via <div> containing <select> ──
        // NOTE: Value will be "0" placeholder — Phase 2 overwrites with real values
        const allDivs = root.querySelectorAll('div');
        allDivs.forEach(div => {
            const selectEl = div.querySelector('select');
            if (!selectEl) return;

            const span = div.querySelector('span');
            if (!span) return;
            const toggleName = span.textContent.trim();
            if (!toggleName) return;

            // Placeholder value — Phase 2 will overwrite
            let selectedValue = '0';
            const selectedOption = selectEl.querySelector('option[selected]');
            if (selectedOption) {
                selectedValue = selectedOption.getAttribute('value') || selectedOption.textContent.trim() || '0';
            }

            if (!results.find(r => r.key === toggleName)) {
                results.push({
                    key: toggleName,
                    value: selectedValue,
                    type: 'select'
                });
            }
        });

        // ── Text inputs ──
        allDivs.forEach(div => {
            const textInput = div.querySelector('input[type="text"]');
            if (!textInput) return;
            const span = div.querySelector('span');
            if (!span) return;
            const toggleName = span.textContent.trim();
            if (!toggleName) return;
            const value = textInput.getAttribute('value') || '';
            if (!results.find(r => r.key === toggleName)) {
                results.push({ key: toggleName, value: value, type: 'text' });
            }
        });

        // ── Textareas ──
        allDivs.forEach(div => {
            const textareaEl = div.querySelector('textarea');
            if (!textareaEl) return;
            const span = div.querySelector('span');
            if (!span) return;
            const toggleName = span.textContent.trim();
            if (!toggleName) return;
            const value = textareaEl.textContent || '';
            if (!results.find(r => r.key === toggleName)) {
                results.push({ key: toggleName, value: value, type: 'textarea' });
            }
        });

        return results;
    }

    // ==========================================
    // DATA VALIDATION
    // ==========================================

    function isValidImportData(data) {
        if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
        for (const groupKey in data) {
            const presets = data[groupKey];
            if (typeof presets !== 'object' || presets === null || Array.isArray(presets)) return false;
            for (const presetKey in presets) {
                const toggles = presets[presetKey];
                if (!Array.isArray(toggles)) return false;
                if (toggles.length > 0) {
                    const first = toggles[0];
                    if (typeof first !== 'object' || !('key' in first && 'value' in first && 'type' in first)) return false;
                }
            }
        }
        return true;
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    }

    function toast(msg, duration = 3000) {
        const el = document.createElement('div');
        el.textContent = msg;
        Object.assign(el.style, {
            position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            background: '#27272a', color: '#e4e4e7', padding: '10px 20px', borderRadius: '8px',
            fontSize: '14px', zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'opacity 0.3s', opacity: '1', maxWidth: '80%', textAlign: 'center'
        });
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
    }

    // ==========================================
    // MAIN PTM TAB RENDERER
    // ==========================================

    /**
     * Build the PTM tab UI HTML and attach event handlers after render.
     */
    async function renderPTMContent(renderInput, lists) {
        // Poll for our root element to appear in DOM, then initialize.
        // We can't use a fixed setTimeout because the settings panel builds ALL tabs'
        // HTML first (each with multiple async safeGetArg calls), then injects them
        // all at once via innerHTML. Total render time is 1-5s depending on tab count.
        const pollId = setInterval(() => {
            const root = document.getElementById(`${PREFIX}-root`);
            if (root && !root.dataset.ptmInitialized) {
                clearInterval(pollId);
                console.log(LOG_TAG, 'Root element found in DOM, initializing...');
                initPTMTab();
            }
        }, 250);
        // Safety: stop polling after 30s
        setTimeout(() => clearInterval(pollId), 30000);

        return `
            <div id="${PREFIX}-root">
                <h3 class="text-3xl font-bold mb-2 pb-3 border-b border-gray-700">
                    ⚙️ 프롬프트 토글 관리자 (PTM) <span class="text-base text-gray-500 ml-2">v3.0</span>
                </h3>
                <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">
                    사이드바의 토글 설정을 프리셋으로 저장하고 관리합니다.<br>
                    <span class="text-xs text-gray-400">※ 프리셋 적용 시 변경 가이드가 표시됩니다 (v3 보안 정책상 자동 적용 제한)</span>
                </p>

                <!-- Group Selection -->
                <div class="mb-6 p-4 bg-gray-900 border border-gray-700 rounded-lg">
                    <label class="block text-sm font-medium text-gray-400 mb-2">📂 프리셋 그룹</label>
                    <div class="flex gap-2">
                        <select id="${PREFIX}-group-select" class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500">
                            <option value="">--- 그룹을 선택하세요 ---</option>
                        </select>
                        <button id="${PREFIX}-btn-new-group" class="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded text-sm transition-colors">➕ 새 그룹</button>
                        <button id="${PREFIX}-btn-del-group" class="bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-3 rounded text-sm transition-colors" title="현재 그룹 삭제">🗑️</button>
                    </div>
                </div>

                <!-- Preset Management -->
                <div class="mb-6 p-4 bg-gray-900 border border-gray-700 rounded-lg">
                    <label class="block text-sm font-medium text-gray-400 mb-2">📋 프리셋</label>
                    <div class="flex gap-2 mb-3">
                        <select id="${PREFIX}-preset-select" class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500">
                            <option value="">--- 프리셋을 선택하세요 ---</option>
                        </select>
                    </div>
                    <!-- Empty state message -->
                    <div id="${PREFIX}-preset-empty" class="hidden mb-3 p-3 bg-gray-800 border border-dashed border-gray-600 rounded-lg text-center">
                        <p class="text-yellow-400 font-semibold mb-1">📭 이 그룹에 저장된 프리셋이 없습니다.</p>
                        <p class="text-gray-400 text-xs">아래 <span class="text-blue-400 font-bold">💾 현재 설정 저장</span> 버튼을 눌러 사이드바의 토글 설정을 프리셋으로 저장하세요.</p>
                        <p class="text-gray-500 text-xs mt-1">또는 하단의 <span class="text-sky-400">📥 가져오기</span> 버튼으로 기존 PTM v1 백업 파일을 불러올 수 있습니다.</p>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <button id="${PREFIX}-btn-save" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded text-sm transition-colors">
                            💾 현재 설정 저장
                        </button>
                        <button id="${PREFIX}-btn-compare" class="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-3 rounded text-sm transition-colors" disabled>
                            🔍 비교/적용 가이드
                        </button>
                        <button id="${PREFIX}-btn-rename" class="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded text-sm transition-colors" disabled>
                            ✏️ 이름 변경
                        </button>
                        <button id="${PREFIX}-btn-delete" class="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-3 rounded text-sm transition-colors" disabled>
                            🗑️ 프리셋 삭제
                        </button>
                    </div>
                </div>

                <!-- Comparison / Apply Guide Panel -->
                <div id="${PREFIX}-compare-panel" class="hidden mb-6 p-4 bg-gray-900 border border-gray-700 rounded-lg">
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="text-lg font-bold text-purple-400">🔍 프리셋 비교 / 적용 가이드</h4>
                        <button id="${PREFIX}-btn-close-compare" class="text-gray-400 hover:text-white text-sm">✕ 닫기</button>
                    </div>
                    <p class="text-xs text-gray-400 mb-3 border-l-2 border-purple-500 pl-2">
                        아래 표에서 <span class="text-orange-400 font-bold">주황색</span> 항목이 현재와 다른 토글입니다. 사이드바에서 해당 토글을 수동으로 변경해 주세요.
                    </p>
                    <div id="${PREFIX}-compare-content" class="max-h-96 overflow-y-auto"></div>
                </div>

                <!-- Preset Details View -->
                <div id="${PREFIX}-detail-panel" class="hidden mb-6 p-4 bg-gray-900 border border-gray-700 rounded-lg">
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="text-lg font-bold text-green-400" id="${PREFIX}-detail-title">📋 프리셋 상세</h4>
                        <button id="${PREFIX}-btn-close-detail" class="text-gray-400 hover:text-white text-sm">✕ 닫기</button>
                    </div>
                    <div id="${PREFIX}-detail-content" class="max-h-96 overflow-y-auto"></div>
                </div>

                <!-- Import / Export -->
                <div class="p-4 bg-gray-900 border border-gray-700 rounded-lg">
                    <h4 class="text-lg font-bold text-gray-300 mb-3">📦 가져오기 / 내보내기</h4>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <button id="${PREFIX}-btn-export" class="bg-teal-700 hover:bg-teal-600 text-white font-bold py-2 px-3 rounded text-sm transition-colors">
                            ⬇️ 전체 내보내기 (JSON)
                        </button>
                        <button id="${PREFIX}-btn-import-merge" class="bg-sky-700 hover:bg-sky-600 text-white font-bold py-2 px-3 rounded text-sm transition-colors">
                            📥 가져오기 (병합)
                        </button>
                        <button id="${PREFIX}-btn-import-overwrite" class="bg-amber-700 hover:bg-amber-600 text-white font-bold py-2 px-3 rounded text-sm transition-colors">
                            📥 전체 가져오기 (덮어쓰기)
                        </button>
                    </div>
                    <div class="mt-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                        <p class="text-blue-300 text-sm font-semibold mb-1">💡 PTM v1에서 마이그레이션하려면:</p>
                        <ol class="text-xs text-gray-400 list-decimal list-inside space-y-1">
                            <li>PTM v1 플러그인에서 <strong class="text-white">내보내기</strong>로 백업 파일(ptm_backup_*.json)을 저장하세요.</li>
                            <li>위의 <strong class="text-sky-300">📥 가져오기 (병합)</strong> 또는 <strong class="text-amber-300">📥 전체 가져오기</strong> 버튼으로 불러오세요.</li>
                        </ol>
                        <p class="text-xs text-gray-500 mt-1">※ v3 보안 정책상 v1 localStorage 데이터를 자동으로 가져올 수 없어 파일 가져오기가 필요합니다.</p>
                    </div>
                </div>

                <!-- Debug / Test -->
                <div class="mt-4 p-3 bg-gray-900 border border-gray-700 rounded-lg">
                    <details>
                        <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-300">🔧 디버그 / 스토리지 테스트</summary>
                        <div class="mt-2 flex gap-2 flex-wrap">
                            <button id="${PREFIX}-btn-debug-scan" class="bg-indigo-700 hover:bg-indigo-600 text-white text-xs py-1 px-3 rounded transition-colors">
                                🔬 토글 스캔 디버그
                            </button>
                            <button id="${PREFIX}-btn-test-save" class="bg-gray-700 hover:bg-gray-600 text-white text-xs py-1 px-3 rounded transition-colors">
                                🧪 테스트 프리셋 저장
                            </button>
                            <button id="${PREFIX}-btn-dump-storage" class="bg-gray-700 hover:bg-gray-600 text-white text-xs py-1 px-3 rounded transition-colors">
                                📋 스토리지 내용 출력 (콘솔)
                            </button>
                        </div>
                        <p class="text-xs text-gray-600 mt-1">🔬 토글 스캔 디버그: 사이드바의 토글을 읽고 콘솔에 상세 로그를 출력합니다. 문제 진단 시 사용하세요.</p>
                        <div id="${PREFIX}-debug-results" class="hidden mt-2 max-h-60 overflow-y-auto text-xs bg-gray-800 p-2 rounded border border-gray-600"></div>
                    </details>
                    </details>
                </div>

                <!-- Scan Status -->
                <div id="${PREFIX}-scan-status" class="mt-4 text-xs text-gray-500 text-center"></div>
            </div>
        `;
    }

    /**
     * Wire up all event handlers for the PTM tab.
     * Called after the settings panel DOM is fully rendered.
     */
    async function initPTMTab() {
        const root = document.getElementById(`${PREFIX}-root`);
        if (!root) {
            console.warn(LOG_TAG, 'PTM root element not found, skipping init.');
            return;
        }

        // Prevent double-initialization on the same DOM
        if (root.dataset.ptmInitialized === 'true') {
            console.log(LOG_TAG, 'PTM tab already initialized for this panel instance, skipping.');
            return;
        }
        root.dataset.ptmInitialized = 'true';

        const groupSelect = document.getElementById(`${PREFIX}-group-select`);
        const presetSelect = document.getElementById(`${PREFIX}-preset-select`);
        const btnNewGroup = document.getElementById(`${PREFIX}-btn-new-group`);
        const btnDelGroup = document.getElementById(`${PREFIX}-btn-del-group`);
        const btnSave = document.getElementById(`${PREFIX}-btn-save`);
        const btnCompare = document.getElementById(`${PREFIX}-btn-compare`);
        const btnRename = document.getElementById(`${PREFIX}-btn-rename`);
        const btnDelete = document.getElementById(`${PREFIX}-btn-delete`);
        const btnCloseCompare = document.getElementById(`${PREFIX}-btn-close-compare`);
        const btnCloseDetail = document.getElementById(`${PREFIX}-btn-close-detail`);
        const btnExport = document.getElementById(`${PREFIX}-btn-export`);
        const btnImportMerge = document.getElementById(`${PREFIX}-btn-import-merge`);
        const btnImportOverwrite = document.getElementById(`${PREFIX}-btn-import-overwrite`);
        const comparePanel = document.getElementById(`${PREFIX}-compare-panel`);
        const compareContent = document.getElementById(`${PREFIX}-compare-content`);
        const detailPanel = document.getElementById(`${PREFIX}-detail-panel`);
        const detailContent = document.getElementById(`${PREFIX}-detail-content`);
        const detailTitle = document.getElementById(`${PREFIX}-detail-title`);
        const scanStatus = document.getElementById(`${PREFIX}-scan-status`);
        const presetEmpty = document.getElementById(`${PREFIX}-preset-empty`);
        const btnTestSave = document.getElementById(`${PREFIX}-btn-test-save`);
        const btnDumpStorage = document.getElementById(`${PREFIX}-btn-dump-storage`);
        const btnDebugScan = document.getElementById(`${PREFIX}-btn-debug-scan`);
        const debugResults = document.getElementById(`${PREFIX}-debug-results`);

        // ---- State ----
        let currentGroup = '';
        let currentPreset = '';

        // ---- Refresh Functions ----

        async function refreshGroupDropdown() {
            const allData = await loadAllData();
            const groups = Object.keys(allData).sort((a, b) => a.localeCompare(b));

            groupSelect.innerHTML = '<option value="">--- 그룹을 선택하세요 ---</option>';
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g;
                opt.textContent = g;
                if (g === currentGroup) opt.selected = true;
                groupSelect.appendChild(opt);
            });

            if (currentGroup && !groups.includes(currentGroup)) {
                currentGroup = '';
            }

            await refreshPresetDropdown();
        }

        async function refreshPresetDropdown() {
            const allData = await loadAllData();
            const presets = currentGroup ? allData[currentGroup] || {} : {};
            const presetNames = Object.keys(presets).sort((a, b) => a.localeCompare(b));

            console.log(LOG_TAG, `refreshPresetDropdown: group='${currentGroup}', found ${presetNames.length} presets:`, presetNames);

            presetSelect.innerHTML = '<option value="">--- 프리셋을 선택하세요 ---</option>';
            presetNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = `${name} (${presets[name].length} toggles)`;
                if (name === currentPreset) opt.selected = true;
                presetSelect.appendChild(opt);
            });

            if (currentPreset && !presetNames.includes(currentPreset)) {
                currentPreset = '';
                presetSelect.value = '';
            }

            // Show/hide empty state message
            if (presetEmpty) {
                if (currentGroup && presetNames.length === 0) {
                    presetEmpty.classList.remove('hidden');
                } else {
                    presetEmpty.classList.add('hidden');
                }
            }

            updatePresetButtons();
        }

        function updatePresetButtons() {
            const hasPreset = !!currentPreset;
            btnCompare.disabled = !hasPreset;
            btnRename.disabled = !hasPreset;
            btnDelete.disabled = !hasPreset;

            [btnCompare, btnRename, btnDelete].forEach(btn => {
                if (btn.disabled) {
                    btn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            });
        }

        // ---- Event Handlers ----

        groupSelect.addEventListener('change', async () => {
            currentGroup = groupSelect.value;
            currentPreset = '';
            console.log(LOG_TAG, `Group changed to: '${currentGroup}'`);
            await refreshPresetDropdown();
            hideAllPanels();
        });

        presetSelect.addEventListener('change', async () => {
            currentPreset = presetSelect.value;
            updatePresetButtons();

            if (currentPreset) {
                // Show detail panel
                const allData = await loadAllData();
                const presetData = allData[currentGroup]?.[currentPreset];
                if (presetData) {
                    showDetailPanel(currentPreset, presetData);
                }
            } else {
                hideAllPanels();
            }
        });

        // New Group
        btnNewGroup.addEventListener('click', async () => {
            const name = prompt('새 그룹의 이름을 입력하세요:');
            if (!name || !name.trim()) return;

            const allData = await loadAllData();
            if (allData[name.trim()]) {
                alert('이미 존재하는 그룹 이름입니다.');
                return;
            }
            allData[name.trim()] = {};
            await saveAllData(allData);
            currentGroup = name.trim();
            await refreshGroupDropdown();
            toast(`그룹 '${name.trim()}' 생성 완료!`);
        });

        // Delete Group
        btnDelGroup.addEventListener('click', async () => {
            if (!currentGroup) {
                alert('삭제할 그룹을 선택하세요.');
                return;
            }
            if (!confirm(`정말로 '${currentGroup}' 그룹과 그 안의 모든 프리셋을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

            const allData = await loadAllData();
            delete allData[currentGroup];
            await saveAllData(allData);
            currentGroup = '';
            currentPreset = '';
            await refreshGroupDropdown();
            hideAllPanels();
            toast('그룹이 삭제되었습니다.');
        });

        // Save Current Toggles
        btnSave.addEventListener('click', async () => {
            if (!currentGroup) {
                alert('먼저 그룹을 선택하거나 만들어 주세요.');
                return;
            }

            scanStatus.textContent = '🔍 사이드바에서 토글 상태를 읽는 중... (셀렉트 값 읽기에 수 초 걸릴 수 있음)';
            const toggles = await readCurrentToggleStates();

            if (!toggles || toggles.length === 0) {
                scanStatus.textContent = '⚠️ 토글을 읽을 수 없었습니다. 사이드바에 캐릭터가 선택되어 있고 토글이 표시된 상태에서 설정 패널을 열어주세요.';
                alert('사이드바에서 토글 상태를 읽을 수 없었습니다.\n\n다음을 확인해 주세요:\n1. 캐릭터가 선택되어 있어야 합니다\n2. 사이드바에 토글이 표시된 상태여야 합니다\n3. 메인 DOM 접근 권한을 허용해야 합니다');
                return;
            }

            const nonDefaults = toggles.filter(t => t.value !== '0' && t.value !== '').length;
            scanStatus.textContent = `✅ ${toggles.length}개 토글 읽기 완료! (기본값 아닌 항목: ${nonDefaults}개)`;

            const presetName = prompt(`저장할 프리셋의 이름을 입력하세요: (${toggles.length}개 토글 감지됨)`);
            if (!presetName || !presetName.trim()) {
                scanStatus.textContent = '';
                return;
            }

            const allData = await loadAllData();
            if (!allData[currentGroup]) allData[currentGroup] = {};

            if (allData[currentGroup][presetName.trim()] && !confirm(`'${presetName.trim()}' 이름의 프리셋이 이미 존재합니다. 덮어쓸까요?`)) {
                return;
            }

            allData[currentGroup][presetName.trim()] = toggles;
            await saveAllData(allData);
            currentPreset = presetName.trim();
            await refreshPresetDropdown();
            showDetailPanel(currentPreset, toggles);
            toast(`프리셋 '${presetName.trim()}' 저장 완료! (${toggles.length}개 토글)`);
        });

        // Compare / Apply Guide
        btnCompare.addEventListener('click', async () => {
            if (!currentGroup || !currentPreset) return;

            const allData = await loadAllData();
            const presetData = allData[currentGroup]?.[currentPreset];
            if (!presetData) return;

            scanStatus.textContent = '🔍 현재 토글 상태를 읽는 중... (셀렉트 값 읽기에 수 초 걸릴 수 있음)';
            const currentToggles = await readCurrentToggleStates();

            if (!currentToggles || currentToggles.length === 0) {
                scanStatus.textContent = '⚠️ 현재 토글 상태를 읽을 수 없었습니다.';
                alert('사이드바에서 토글 상태를 읽을 수 없었습니다.\n사이드바에 캐릭터가 선택되어 있고 토글이 표시된 상태에서 다시 시도해 주세요.');
                return;
            }

            scanStatus.textContent = '';
            showComparePanel(presetData, currentToggles);
        });

        // Rename
        btnRename.addEventListener('click', async () => {
            if (!currentGroup || !currentPreset) return;

            const newName = prompt('새로운 프리셋 이름을 입력하세요:', currentPreset);
            if (!newName || !newName.trim() || newName.trim() === currentPreset) return;

            const allData = await loadAllData();
            if (allData[currentGroup]?.[newName.trim()]) {
                alert('이미 존재하는 프리셋 이름입니다.');
                return;
            }

            allData[currentGroup][newName.trim()] = allData[currentGroup][currentPreset];
            delete allData[currentGroup][currentPreset];
            await saveAllData(allData);
            currentPreset = newName.trim();
            await refreshPresetDropdown();
            toast(`'${currentPreset}'(으)로 이름 변경 완료!`);
        });

        // Delete Preset
        btnDelete.addEventListener('click', async () => {
            if (!currentGroup || !currentPreset) return;
            if (!confirm(`'${currentPreset}' 프리셋을 삭제하시겠습니까?`)) return;

            const allData = await loadAllData();
            delete allData[currentGroup][currentPreset];
            await saveAllData(allData);
            currentPreset = '';
            await refreshPresetDropdown();
            hideAllPanels();
            toast('프리셋이 삭제되었습니다.');
        });

        // Close panels
        btnCloseCompare.addEventListener('click', () => { comparePanel.classList.add('hidden'); });
        btnCloseDetail.addEventListener('click', () => { detailPanel.classList.add('hidden'); });

        // Export
        btnExport.addEventListener('click', async () => {
            const allData = await loadAllData();
            if (Object.keys(allData).length === 0) {
                alert('내보낼 프리셋 데이터가 없습니다.');
                return;
            }
            const jsonString = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const today = new Date();
            const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            a.href = url;
            a.download = `ptm_backup_${dateString}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast('모든 프리셋을 파일로 내보냈습니다!');
        });

        // Import (Merge)
        btnImportMerge.addEventListener('click', () => importFromFile(false));

        // Import (Overwrite)
        btnImportOverwrite.addEventListener('click', () => importFromFile(true));

        async function importFromFile(overwrite) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json,application/json';
            fileInput.style.display = 'none';

            fileInput.onchange = async (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const importedData = JSON.parse(e.target.result);
                        if (!isValidImportData(importedData)) {
                            throw new Error('Invalid data structure');
                        }

                        if (overwrite) {
                            if (!confirm('⚠️ 경고 ⚠️\n\n정말로 현재 모든 프리셋을 이 파일의 내용으로 완전히 덮어쓸까요?\n현재 저장된 모든 데이터가 영구적으로 삭제됩니다.')) return;
                            await saveAllData(importedData);
                        } else {
                            // Merge mode: user selects which group to import into current group
                            const importGroups = Object.keys(importedData);
                            if (importGroups.length === 0) {
                                alert('가져올 데이터가 비어있습니다.');
                                return;
                            }

                            const groupList = importGroups.map((g, i) => `${i + 1}: ${g} (${Object.keys(importedData[g]).length}개 프리셋)`).join('\n');
                            const choice = parseInt(prompt(`어떤 그룹의 프리셋을 가져올까요?\n번호를 입력하세요:\n\n${groupList}`), 10);

                            if (isNaN(choice) || choice < 1 || choice > importGroups.length) {
                                alert('잘못된 번호입니다.');
                                return;
                            }

                            const chosenGroup = importGroups[choice - 1];
                            let targetGroup = currentGroup;

                            if (!targetGroup) {
                                targetGroup = prompt(`프리셋을 저장할 그룹 이름을 입력하세요:`, chosenGroup);
                                if (!targetGroup || !targetGroup.trim()) return;
                                targetGroup = targetGroup.trim();
                            }

                            if (!confirm(`'${chosenGroup}'의 프리셋을 '${targetGroup}' 그룹에 병합하시겠습니까?\n(같은 이름의 프리셋은 덮어쓰기 됩니다.)`)) return;

                            const allData = await loadAllData();
                            if (!allData[targetGroup]) allData[targetGroup] = {};
                            Object.assign(allData[targetGroup], importedData[chosenGroup]);
                            await saveAllData(allData);
                            currentGroup = targetGroup;
                        }

                        await refreshGroupDropdown();
                        toast('프리셋을 성공적으로 가져왔습니다!');
                    } catch (err) {
                        console.error(LOG_TAG, 'Import error:', err);
                        alert('파일을 읽는 중 오류가 발생했습니다.\n올바른 PTM 백업 파일인지 확인해 주세요.');
                    }
                };
                reader.readAsText(file);
            };

            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
        }

        // ---- Display Functions ----

        function showDetailPanel(presetName, presetData) {
            detailTitle.textContent = `📋 프리셋: ${presetName}`;
            detailPanel.classList.remove('hidden');
            comparePanel.classList.add('hidden');

            if (!presetData || presetData.length === 0) {
                detailContent.innerHTML = '<p class="text-gray-500">이 프리셋에 저장된 토글이 없습니다.</p>';
                return;
            }

            let html = '<table class="w-full text-sm"><thead><tr class="text-gray-400 border-b border-gray-700"><th class="text-left py-2 px-2">토글</th><th class="text-left py-2 px-2">타입</th><th class="text-left py-2 px-2">값</th></tr></thead><tbody>';

            presetData.forEach(t => {
                const typeIcon = t.type === 'checkbox' ? '☑️' : t.type === 'select' ? '📋' : t.type === 'textarea' ? '📝' : '📝';
                const displayValue = t.type === 'checkbox' ? (t.value === '1' ? '✅ ON' : '❌ OFF') : escapeHtml(t.value);
                html += `<tr class="border-b border-gray-800 hover:bg-gray-800"><td class="py-2 px-2 text-gray-200">${escapeHtml(t.key)}</td><td class="py-2 px-2 text-gray-400">${typeIcon} ${t.type}</td><td class="py-2 px-2 ${t.type === 'checkbox' && t.value === '1' ? 'text-green-400' : t.type === 'checkbox' ? 'text-red-400' : 'text-white'}">${displayValue}</td></tr>`;
            });

            html += '</tbody></table>';
            detailContent.innerHTML = html;
        }

        function showComparePanel(presetData, currentToggles) {
            comparePanel.classList.remove('hidden');
            detailPanel.classList.add('hidden');

            const currentMap = new Map();
            currentToggles.forEach(t => currentMap.set(t.key, t));

            let diffCount = 0;
            let textLimitCount = 0;
            let html = '<table class="w-full text-sm"><thead><tr class="text-gray-400 border-b border-gray-700"><th class="text-left py-2 px-2">토글</th><th class="text-left py-2 px-2">타입</th><th class="text-left py-2 px-2">현재 상태</th><th class="text-center py-2 px-2">→</th><th class="text-left py-2 px-2">프리셋 값</th><th class="text-center py-2 px-2">상태</th></tr></thead><tbody>';

            presetData.forEach(preset => {
                const current = currentMap.get(preset.key);
                const currentValue = current ? current.value : '(없음)';

                // For text/textarea types, values may be unreliable due to v3 API limitations
                const isTextType = preset.type === 'text' || preset.type === 'textarea';
                const isDiff = isTextType ? false : (currentValue !== preset.value);
                if (isTextType) textLimitCount++;

                if (isDiff) diffCount++;

                const formatValue = (val, type) => {
                    if (type === 'checkbox') return val === '1' ? '✅ ON' : '❌ OFF';
                    if (type === 'select') return `옵션 ${escapeHtml(val)}`;
                    return escapeHtml(val) || '<span class="text-gray-600">(빈값)</span>';
                };

                const typeIcon = preset.type === 'checkbox' ? '☑️' : preset.type === 'select' ? '📋' : '📝';

                const rowClass = isDiff ? 'bg-orange-900/30 border-orange-700' : isTextType ? 'border-gray-800 opacity-60' : 'border-gray-800';
                const statusText = isDiff
                    ? '<span class="text-orange-400 font-bold">변경 필요</span>'
                    : isTextType
                        ? '<span class="text-gray-500" title="v3 API 제한으로 텍스트 값 비교 불가">➖</span>'
                        : '<span class="text-green-400">일치</span>';

                html += `<tr class="border-b ${rowClass} hover:bg-gray-800">`;
                html += `<td class="py-2 px-2 ${isDiff ? 'text-orange-300 font-bold' : 'text-gray-200'}">${escapeHtml(preset.key)}</td>`;
                html += `<td class="py-2 px-2 text-gray-500 text-xs">${typeIcon}</td>`;
                html += `<td class="py-2 px-2 text-gray-400">${formatValue(currentValue, preset.type)}</td>`;
                html += `<td class="py-2 px-2 text-center text-gray-600">→</td>`;
                html += `<td class="py-2 px-2 ${isDiff ? 'text-orange-200 font-bold' : 'text-gray-300'}">${formatValue(preset.value, preset.type)}</td>`;
                html += `<td class="py-2 px-2 text-center">${statusText}</td>`;
                html += `</tr>`;
            });

            // Show toggles that exist in current but not in preset
            currentToggles.forEach(current => {
                if (!presetData.find(p => p.key === current.key)) {
                    html += `<tr class="border-b border-gray-800 hover:bg-gray-800 opacity-50">`;
                    html += `<td class="py-2 px-2 text-gray-500">${escapeHtml(current.key)}</td>`;
                    html += `<td class="py-2 px-2 text-gray-500">${current.type === 'checkbox' ? (current.value === '1' ? '✅' : '❌') : escapeHtml(current.value)}</td>`;
                    html += `<td class="py-2 px-2 text-center text-gray-600">—</td>`;
                    html += `<td class="py-2 px-2 text-gray-600">(프리셋에 없음)</td>`;
                    html += `<td class="py-2 px-2 text-center text-gray-500">➖</td>`;
                    html += `</tr>`;
                }
            });

            html += '</tbody></table>';

            // Summary
            const summaryClass = diffCount > 0 ? 'text-orange-400' : 'text-green-400';
            let summaryText = diffCount > 0
                ? `⚠️ ${diffCount}개 토글이 현재 상태와 다릅니다. 사이드바에서 해당 토글을 수동으로 변경해 주세요.`
                : '✅ 모든 체크박스/셀렉트 토글이 프리셋과 일치합니다!';
            if (textLimitCount > 0) {
                summaryText += `<br><span class="text-gray-400 text-xs">ℹ️ 텍스트 입력 ${textLimitCount}개는 v3 API 제한으로 비교할 수 없습니다 (수동 확인 필요)</span>`;
            }

            compareContent.innerHTML = `<div class="mb-3 p-2 rounded bg-gray-800 ${summaryClass} font-bold text-sm">${summaryText}</div>` + html;
        }

        function hideAllPanels() {
            comparePanel.classList.add('hidden');
            detailPanel.classList.add('hidden');
        }

        // ---- Debug Handlers ----
        if (btnDebugScan) {
            btnDebugScan.addEventListener('click', async () => {
                scanStatus.textContent = '🔬 디버그 스캔 실행 중... (콘솔에 상세 로그 출력)';
                console.log(LOG_TAG, '===== DEBUG SCAN START =====');

                try {
                    const toggles = await readCurrentToggleStates(true);

                    if (!toggles || toggles.length === 0) {
                        scanStatus.textContent = '⚠️ 토글을 읽을 수 없었습니다. 콘솔(F12)에서 오류를 확인하세요.';
                        if (debugResults) {
                            debugResults.classList.remove('hidden');
                            debugResults.innerHTML = '<p class="text-red-400">토글 읽기 실패. 콘솔(F12)에서 [CPM-PTM] 로그를 확인하세요.</p>';
                        }
                        return;
                    }

                    const summary = { checkbox: 0, select: 0, text: 0, textarea: 0 };
                    const nonDefaults = [];
                    toggles.forEach(r => {
                        summary[r.type] = (summary[r.type] || 0) + 1;
                        if (r.value !== '0' && r.value !== '') {
                            nonDefaults.push(r);
                        }
                    });

                    scanStatus.textContent = `✅ 디버그 스캔 완료: ${toggles.length}개 토글 (기본값 아닌 항목: ${nonDefaults.length}개)`;

                    if (debugResults) {
                        debugResults.classList.remove('hidden');
                        let html = `<p class="text-green-400 font-bold mb-2">스캔 결과: ${toggles.length}개 토글</p>`;
                        html += `<p class="text-gray-400 mb-2">☑️ 체크박스: ${summary.checkbox} | 📋 셀렉트: ${summary.select} | 📝 텍스트: ${summary.text} | 📄 텍스트에어리어: ${summary.textarea}</p>`;

                        if (nonDefaults.length > 0) {
                            html += '<p class="text-yellow-400 font-bold mt-2 mb-1">기본값이 아닌 항목:</p>';
                            nonDefaults.forEach(r => {
                                html += `<div class="text-yellow-300">[${r.type}] ${escapeHtml(r.key)} = <span class="text-white font-bold">${escapeHtml(r.value)}</span></div>`;
                            });
                        } else {
                            html += '<p class="text-orange-400 mt-2">⚠️ 모든 값이 기본값(“0” 또는 빈 문자열)입니다.</p>';
                            html += '<p class="text-gray-500">토글을 변경한 상태에서 다시 스캔해보세요.</p>';
                        }

                        html += '<details class="mt-2"><summary class="text-gray-500 cursor-pointer">전체 토글 목록 (클릭해서 펜치기)</summary><div class="mt-1">';
                        toggles.forEach(r => {
                            const valClass = (r.value !== '0' && r.value !== '') ? 'text-green-300' : 'text-gray-500';
                            html += `<div><span class="text-gray-400">[${r.type}]</span> ${escapeHtml(r.key)} = <span class="${valClass}">${escapeHtml(r.value)}</span></div>`;
                        });
                        html += '</div></details>';
                        debugResults.innerHTML = html;
                    }
                } catch (e) {
                    console.error(LOG_TAG, 'Debug scan error:', e);
                    scanStatus.textContent = '❌ 디버그 스캔 오류. 콘솔 확인.';
                }
                console.log(LOG_TAG, '===== DEBUG SCAN END =====');
            });
        }
        if (btnTestSave) {
            btnTestSave.addEventListener('click', async () => {
                if (!currentGroup) {
                    alert('먼저 그룹을 선택하거나 만들어 주세요.');
                    return;
                }
                const testPresetName = `테스트_${Date.now() % 10000}`;
                const testData = [
                    { key: '테스트_체크박스', value: '1', type: 'checkbox' },
                    { key: '테스트_셀렉트', value: 'option1', type: 'select' },
                    { key: '테스트_텍스트', value: 'hello', type: 'text' }
                ];
                console.log(LOG_TAG, `Test save: saving '${testPresetName}' to group '${currentGroup}'...`);
                const allData = await loadAllData();
                if (!allData[currentGroup]) allData[currentGroup] = {};
                allData[currentGroup][testPresetName] = testData;
                await saveAllData(allData);
                currentPreset = testPresetName;
                await refreshPresetDropdown();
                showDetailPanel(testPresetName, testData);
                toast(`테스트 프리셋 '${testPresetName}' 저장 완료!`);
                console.log(LOG_TAG, 'Test save completed. Check preset dropdown.');
            });
        }
        if (btnDumpStorage) {
            btnDumpStorage.addEventListener('click', async () => {
                console.log(LOG_TAG, '===== STORAGE DUMP START =====');
                const allData = await loadAllData();
                console.log(LOG_TAG, 'Raw data:', JSON.stringify(allData, null, 2));
                for (const group of Object.keys(allData)) {
                    const presets = Object.keys(allData[group]);
                    console.log(LOG_TAG, `  Group '${group}': ${presets.length} presets →`, presets);
                }
                console.log(LOG_TAG, '===== STORAGE DUMP END =====');
                toast('콘솔(F12)에 스토리지 내용이 출력되었습니다.');
            });
        }

        // ---- Initial Load ----
        await refreshGroupDropdown();
        console.log(LOG_TAG, 'PTM tab initialized.');
    }

    // ==========================================
    // REGISTER AS CPM TAB (via registerProvider with no actual provider)
    // ==========================================

    // We register a "pseudo-provider" that has no models or fetcher,
    // only a settingsTab for the PTM UI.
    CPM.registerProvider({
        name: '_PTM_Internal',
        models: [],
        fetcher: null,
        settingsTab: {
            id: 'tab-ptm',
            icon: '⚙️',
            label: 'PTM (토글 관리)',
            exportKeys: [],
            renderContent: renderPTMContent
        }
    });

    console.log(LOG_TAG, 'PTM v3 sub-plugin loaded. Tab init is deferred until settings panel opens.');
})();
