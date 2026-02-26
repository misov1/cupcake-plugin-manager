//@name CPM Component - Chat Input Resizer
//@display-name Cupcake UI Resizer
//@version 0.1.9
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-chat-resizer.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Chat Input Resizer ========
 * 
 * Provides a UI overlay button to expand the chat textareas to fullscreen
 * in RisuAI, resolving mobile input truncation. Hooks into Cupcake PM
 * for its settings tab, but can run entirely standalone.
 */
(async () => {
    // Note: We intentionally don't block the entire script execution here,
    // because RisuAI V3 hot-reloading needs to re-evaluate the event listeners.

    if (!window.Risuai && !window.risuai) {
        console.warn('[CPM Resizer] RisuAI API variable missing. Halting plugin.');
        return;
    }
    const risuai = window.risuai || window.Risuai;

    try {
        // ==========================================
        // 1. SETTINGS UI INJECTION (HOOK TO HOST)
        // ==========================================
        window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
        window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'cpm-resizer');
        window.CupcakePM_SubPlugins.push({
            id: 'cpm-resizer',
            name: 'Chat Input Resizer',
            description: '텍스트 입력창 모서리에 크기 조절/최대화 버튼을 표시합니다.',
            version: '0.1',
            icon: '↕️',
            uiHtml: `
                <div class="mb-2">
                    <label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                        <input id="cpm_enable_chat_resizer" type="checkbox" class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                        <span>Enable Chat Input Resizer (입력창 ↕️ 팝업 크기 조절기 활성화)</span>
                    </label>
                </div>
            `,
            onRender: async (container, getArg, setVal) => {
                const checkbox = container.querySelector('#cpm_enable_chat_resizer');
                if (checkbox) {
                    const isEnabled = await getArg('cpm_enable_chat_resizer');
                    checkbox.checked = (isEnabled === 'false' || isEnabled === false) ? false : true;

                    checkbox.addEventListener('change', (ev) => {
                        setVal('cpm_enable_chat_resizer', ev.target.checked);
                        isResizerEnabled = ev.target.checked;
                    });
                }
            }
        });

        const handleSettingsRender = async (e) => {
            const { safeGetArg, registerPlugin } = e.detail;

            // Only inject if the host DOES NOT support the new plugin registry system
            if (typeof registerPlugin !== 'function') {
                // Fallback for older Cupcake PM versions
                const { sidebar, content } = e.detail;
                const tabBtnSrc = `
                    <button class="w-full text-left px-5 py-2 text-sm hover:bg-gray-800 transition-colors focus:outline-none tab-btn text-blue-300 font-bold bg-blue-900/10" data-target="tab-cpm-resizer">
                        ↕️ UI Resizer
                    </button>
                `;
                const targetHeader = Array.from(sidebar.querySelectorAll('div')).find(div => div.textContent.includes('Native Providers'));
                if (targetHeader) {
                    targetHeader.insertAdjacentHTML('beforebegin', tabBtnSrc);
                } else {
                    sidebar.querySelector('#cpm-tab-list')?.insertAdjacentHTML('beforeend', tabBtnSrc);
                }

                // For fallback, we still need safeGetArg, but it's passed from the event
                const isEnabled = await safeGetArg('cpm_enable_chat_resizer');
                const isChecked = (isEnabled === 'false' || isEnabled === false) ? '' : 'checked';
                const panelSrc = `
                    <div id="tab-cpm-resizer" class="cpm-tab-content hidden">
                        <h3 class="text-3xl font-bold mb-6 pb-3 border-b border-gray-700">Chat Input Resizer</h3>
                        <p class="text-blue-300 font-semibold mb-6 border-l-4 border-blue-500 pl-4 py-1">
                            텍스트 입력창 모서리에 크기 조절/최대화 버튼을 표시합니다.
                        </p>
                        <div class="mb-4">
                            <label class="flex items-center space-x-2 text-sm font-medium text-gray-300">
                                <input id="cpm_enable_chat_resizer" type="checkbox" ${isChecked} class="form-checkbox text-blue-500 rounded bg-gray-800 border-gray-600 focus:ring-blue-500">
                                <span>Enable Chat Input Resizer (입력창 ↕️ 팝업 크기 조절기 활성화)</span>
                            </label>
                        </div>
                    </div>
                `;
                content.insertAdjacentHTML('beforeend', panelSrc);
            }
        };

        // Clean up previous listener to prevent duplicates on hot-reload
        if (window.__cpmResizerListener) {
            document.removeEventListener('cupcakepm:render_settings', window.__cpmResizerListener);
        }
        window.__cpmResizerListener = handleSettingsRender;
        document.addEventListener('cupcakepm:render_settings', handleSettingsRender);

        const rootDoc = await risuai.getRootDocument();

        // Safe helper to get arguments silently
        const safeGetArg = async (key, defaultValue = '') => {
            try {
                const val = await risuai.getArgument(key);
                return val !== undefined && val !== null && val !== '' ? val : defaultValue;
            } catch {
                return defaultValue;
            }
        };


        // ==========================================
        // 2. CSS ATTRIBUTE INJECTION
        // ==========================================
        const styleId = 'cpm-maximizer-styles';
        if (!(await rootDoc.getElementById(styleId))) {
            const styleEl = await rootDoc.createElement('style');
            await styleEl.setAttribute('x-id', styleId);
            // We use [x-cpm-maximized] to trigger the massive detached overlay
            await styleEl.setInnerHTML(`
                textarea[x-cpm-maximized="true"] {
                    position: fixed !important;
                    top: 10vh !important;
                    left: 10vw !important;
                    width: 80vw !important;
                    height: 80vh !important;
                    max-height: none !important;
                    z-index: 999999 !important;
                    background-color: var(--bgcolor, #1e1e2e) !important;
                    padding: 24px !important;
                    box-shadow: 0 0 50px rgba(0, 0, 0, 0.8), 0 0 0 9999px rgba(0, 0, 0, 0.6) !important;
                    border-radius: 12px !important;
                    border: 2px solid var(--borderc, #555) !important;
                    font-size: 1.1em !important;
                    resize: none !important;
                    transition: all 0.2s ease-out !important;
                }
                /* The button itself needs to float on top of the fullscreen textarea */
                button[x-cpm-maximized-btn="true"] {
                    position: fixed !important;
                    bottom: 12vh !important;
                    right: 12vw !important;
                    z-index: 9999999 !important;
                    padding: 12px !important;
                    font-size: 1.5em !important;
                    background: rgba(255, 255, 255, 0.1) !important;
                    backdrop-filter: blur(4px) !important;
                }
            `);
            const head = await rootDoc.querySelector('head');
            if (head) await head.appendChild(styleEl);
        }

        // ==========================================
        // 3. MUTATIONOBSERVER-BASED SPAWN LOGIC
        // ==========================================
        let isResizerEnabled = null;

        // Selectors for textareas that should NOT get a resize button
        // (same exclusion list as RisuTextAreaExpander)
        const EXCLUDE_SELECTORS = [
            '.text-input-area',
            '#messageInputTranslate',
            '.partial-edit-textarea',
        ];

        // Attach 🧁 button to a single SafeElement textarea
        const attachButtonToTextarea = async (ta) => {
            try {
                // Already processed — skip
                const marker = await ta.getAttribute('x-cpm-resizer');
                if (marker) return;

                // Check if this textarea should be excluded (chat input area, etc.)
                let isExcluded = false;
                for (const sel of EXCLUDE_SELECTORS) {
                    try {
                        if (await ta.matches(sel)) { isExcluded = true; break; }
                    } catch (_) {}
                }
                if (isExcluded) {
                    await ta.setAttribute('x-cpm-resizer', 'skip');
                    return;
                }

                await ta.setAttribute('x-cpm-resizer', '1');

                const parent = await ta.getParent();
                if (parent && !(await parent.querySelector('.cpm-resize-btn'))) {

                    // Ensure parent has relative positioning for absolute button
                    const pos = await parent.getStyle('position');
                    if (!pos || pos === 'static' || pos === '') {
                        await parent.setStyle('position', 'relative');
                    }

                    const btn = await rootDoc.createElement('button');
                    const btnId = 'cpm-btn-' + Math.random().toString(36).substring(2, 9);
                    await btn.setAttribute('x-id', btnId);

                    await btn.setClassName('cpm-resize-btn');
                    await btn.setStyleAttribute(
                        'position:absolute; bottom:4px; right:4px; z-index:50; ' +
                        'width:24px; height:24px; padding:0; margin:0; ' +
                        'display:flex; align-items:center; justify-content:center; ' +
                        'background:rgba(39,39,42,0.8); color:#a1a1aa; ' +
                        'border:1px solid rgba(63,63,70,0.5); border-radius:4px; ' +
                        'cursor:pointer; font-size:13px; line-height:1; ' +
                        'opacity:0.4;'
                    );
                    await btn.setInnerHTML('🧁');
                    await btn.setAttribute('x-title', '창 최대화 / 크기 조절');

                    let isMaximized = false;

                    await btn.addEventListener('pointerup', async (e) => {
                        let cx = e.clientX ?? e.x ?? (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null);
                        let cy = e.clientY ?? e.y ?? (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : null);

                        if (typeof cx === 'number' && typeof cy === 'number') {
                            const rect = await btn.getBoundingClientRect();
                            if (rect) {
                                const rLeft = rect.left ?? rect.x;
                                const rTop = rect.top ?? rect.y;
                                const rRight = rect.right ?? (rLeft + rect.width);
                                const rBottom = rect.bottom ?? (rTop + rect.height);

                                if (cx < rLeft - 5 || cx > rRight + 5 || cy < rTop - 5 || cy > rBottom + 5) {
                                    return;
                                }
                            }
                        }

                        if (!isMaximized) {
                            isMaximized = true;
                            await btn.setInnerHTML('🧁');
                            await ta.setAttribute('x-cpm-maximized', 'true');
                            await btn.setAttribute('x-cpm-maximized-btn', 'true');
                        } else {
                            isMaximized = false;
                            await btn.setInnerHTML('🧁');
                            await ta.setAttribute('x-cpm-maximized', 'false');
                            await btn.setAttribute('x-cpm-maximized-btn', 'false');
                        }
                    });

                    await parent.appendChild(btn);
                }
            } catch (err) {
                console.warn('[CPM Resizer] Failed to attach button:', err);
            }
        };

        // Scan for unprocessed textareas one-by-one via querySelector
        // NOTE: querySelectorAll returns SafeElement[] which does NOT survive
        // the iframe RPC bridge (arrays of REMOTE_REQUIRED objects lose their
        // private fields during structured clone). querySelector (singular)
        // returns a single SafeElement that gets properly serialized.
        const scanExistingTextareas = async () => {
            let limit = 0;
            while (limit < 100) {
                limit++;
                const ta = await rootDoc.querySelector('textarea:not([x-cpm-resizer])');
                if (!ta) break;
                await attachButtonToTextarea(ta);
            }
        };

        // Initialize: check enabled, then start observing
        const initResizer = async () => {
            if (isResizerEnabled === null) {
                const arg = await safeGetArg('cpm_enable_chat_resizer');
                isResizerEnabled = (arg === 'false' || arg === false) ? false : true;
            }
            if (isResizerEnabled === false) {
                console.log('[CPM Resizer] Disabled by user setting.');
                return;
            }

            // Initial scan for textareas already in the DOM
            await scanExistingTextareas();

            // Set up MutationObserver via RisuAI V3 API
            const body = await rootDoc.querySelector('body');
            if (!body) {
                console.warn('[CPM Resizer] Could not find body element.');
                return;
            }

            let scanPending = false;

            const observer = await risuai.createMutationObserver(async (/* mutations - unusable through iframe RPC bridge */) => {
                // NOTE: MutationObserver callback args (SafeClassArray) don't survive
                // the iframe postMessage bridge — private fields are lost during structured clone.
                // Instead, we use the callback purely as a "DOM changed" trigger with debounce.
                if (isResizerEnabled === false) return;
                if (scanPending) return;
                scanPending = true;
                setTimeout(async () => {
                    scanPending = false;
                    await scanExistingTextareas().catch(() => {});
                }, 200);
            });

            await observer.observe(body, { childList: true, subtree: true });
            console.log('[CPM Resizer] MutationObserver active on body.');
        };

        await initResizer();


        console.log('[CPM Resizer] Loaded and ready.');

    } catch (err) {
        console.error('[CPM Resizer] Initialization error:', err);
    }
})();
