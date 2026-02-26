//@name CPM Component - Chat Navigation
//@display-name 🧁 Cupcake Navigation
//@version 2.1.0
//@description 채팅 메시지 네비게이션 (4버튼 → 2버튼 → 키보드 → OFF 순환)
//@icon 🧭
//@author Cupcake
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-chat-navigation.js

/**
 * ======== CUPCAKE PM Sub-Plugin: Chat Navigation v2.1 ========
 *
 * chat 버튼을 누를 때마다 모드가 순환:
 *   1번 → 4버튼 위젯 (⏫🔼🔽⏬, 드래그 가능)
 *   2번 → 2버튼 위젯 (🔼🔽, 드래그 가능)
 *   3번 → 키보드 모드 (↑↓←→ 방향키)
 *   4번 → OFF
 */
(async () => {
    const LOG_PREFIX = '[CPM Navi]';
    const WIDGET_ATTR_KEY = 'x-cpmnavi-widget';
    const WIDGET_ATTR_VAL = 'container';
    // 모드: 'four' → 'two' → 'keyboard' → 'off' → 'four' ...
    const MODES = ['four', 'two', 'keyboard', 'off'];
    const MODE_LABELS = { four: '4버튼', two: '2버튼', keyboard: '⌨️키보드', off: 'OFF' };

    if (!window.Risuai && !window.risuai) {
        console.warn(`${LOG_PREFIX} RisuAI API not found. Halting.`);
        return;
    }
    const risuai = window.risuai || window.Risuai;

    // ── State ──
    let rootDoc = null;
    let containerSelector = null;
    let currentIndex = 1;
    let isReady = false;
    let widgetElement = null;
    let containerPollTimer = null;
    let currentModeIndex = -1; // starts at -1 so first press → 0 (four)

    // Drag state
    let isDragging = false;
    let dragShiftX = 0;
    let dragShiftY = 0;
    let globalPointerMoveId = null;
    let globalPointerUpId = null;

    // Button refs for hit-test
    let upBtnRef = null;
    let downBtnRef = null;
    let topBtnRef = null;
    let bottomBtnRef = null;
    let handleRef = null;

    // Keyboard listener
    let keyListenerId = null;

    // Chat screen observer
    let domObserver = null;
    let observerTimer = null;
    let lastChatScreenState = null;

    // ── Settings UI Registration ──
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins || [];
    window.CupcakePM_SubPlugins = window.CupcakePM_SubPlugins.filter(p => p.id !== 'cpm-navigation');
    window.CupcakePM_SubPlugins.push({
        id: 'cpm-navigation',
        name: '🧭 Chat Navigation',
        description: '채팅 네비게이션 (4버튼 → 2버튼 → 키보드 → OFF 순환)',
        version: '2.1.0',
        icon: '🧭'
    });

    // ── Root Document 획득 ──
    const initRootDoc = async () => {
        for (let retry = 0; retry < 5; retry++) {
            try {
                rootDoc = await risuai.getRootDocument();
                if (rootDoc) {
                    console.log(`${LOG_PREFIX} rootDoc 획득 성공`);
                    return true;
                }
            } catch (e) {
                console.log(`${LOG_PREFIX} rootDoc 획득 실패 (${retry + 1}/5)`);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        console.error(`${LOG_PREFIX} rootDoc 획득 포기`);
        return false;
    };

    // ── 채팅 컨테이너 탐색 ──
    const findChatContainer = async () => {
        const selectors = [
            '.flex-col-reverse:nth-of-type(2)',
            '.flex-col-reverse:nth-of-type(1)',
            'main .flex-col-reverse',
            '.flex-col-reverse'
        ];
        for (const sel of selectors) {
            try {
                const container = await rootDoc.querySelector(sel);
                if (container) {
                    const children = await container.getChildren();
                    if (children && children.length >= 2) {
                        containerSelector = sel;
                        return true;
                    }
                }
            } catch (_) {}
        }
        return false;
    };

    // ── 메시지 수 ──
    const getMessageCount = async () => {
        try {
            if (!containerSelector) return 0;
            const container = await rootDoc.querySelector(containerSelector);
            if (!container) return 0;
            const children = await container.getChildren();
            return children ? children.length : 0;
        } catch (_) {
            return 0;
        }
    };

    // ── 스크롤 함수들 ──
    const goToTop = async () => {
        if (!isReady) return;
        try {
            const count = await getMessageCount();
            if (count === 0) return;
            const sel = `${containerSelector} > *:nth-child(${count})`;
            const el = await rootDoc.querySelector(sel);
            if (el) {
                await el.scrollIntoView(true);
                currentIndex = count;
            }
        } catch (e) { console.error(`${LOG_PREFIX} goToTop:`, e); }
    };

    const goToBottom = async () => {
        if (!isReady) return;
        try {
            const sel = `${containerSelector} > *:nth-child(1)`;
            const el = await rootDoc.querySelector(sel);
            if (el) {
                await el.scrollIntoView(true);
                currentIndex = 1;
            }
        } catch (e) { console.error(`${LOG_PREFIX} goToBottom:`, e); }
    };

    const scrollUp = async () => {
        if (!isReady) return;
        try {
            const count = await getMessageCount();
            if (currentIndex < count) currentIndex++;
            const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
            const el = await rootDoc.querySelector(sel);
            if (el) await el.scrollIntoView(true);
        } catch (e) { console.error(`${LOG_PREFIX} scrollUp:`, e); }
    };

    const scrollDown = async () => {
        if (!isReady) return;
        try {
            if (currentIndex > 1) currentIndex--;
            const sel = `${containerSelector} > *:nth-child(${currentIndex})`;
            const el = await rootDoc.querySelector(sel);
            if (el) await el.scrollIntoView(true);
        } catch (e) { console.error(`${LOG_PREFIX} scrollDown:`, e); }
    };

    // ── 모바일 터치 Fix ──
    const applyMobileFix = async () => {
        try {
            if (!widgetElement) return;
            const divs = await widgetElement.querySelectorAll('div');
            for (const div of divs) {
                await div.setStyle('touch-action', 'none');
            }
        } catch (_) {}
    };

    // ── 위젯 제거 ──
    const destroyWidget = async () => {
        try {
            const body = await rootDoc.querySelector('body');
            const existing = await rootDoc.querySelector(`[${WIDGET_ATTR_KEY}="${WIDGET_ATTR_VAL}"]`);
            if (existing) await existing.remove();
            widgetElement = null;
            if (globalPointerMoveId) { await body.removeEventListener('pointermove', globalPointerMoveId); globalPointerMoveId = null; }
            if (globalPointerUpId) { await body.removeEventListener('pointerup', globalPointerUpId); globalPointerUpId = null; }
            topBtnRef = upBtnRef = downBtnRef = bottomBtnRef = handleRef = null;
        } catch (_) {}
    };

    // ── 키보드 리스너 등록/해제 ──
    const enableKeyboard = async () => {
        if (keyListenerId) return; // 이미 등록됨
        try {
            const body = await rootDoc.querySelector('body');
            if (!body) return;
            keyListenerId = await body.addEventListener('keydown', async (e) => {
                try {
                    const tag = (e && e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : '';
                    if (tag === 'input' || tag === 'textarea') return;
                    if (e.target && e.target.isContentEditable) return;
                } catch (_) {}

                switch (e.key) {
                    case 'ArrowUp':    await scrollUp();     break;
                    case 'ArrowDown':  await scrollDown();   break;
                    case 'ArrowLeft':  await goToTop();      break;
                    case 'ArrowRight': await goToBottom();   break;
                }
            });
            console.log(`${LOG_PREFIX} 키보드 리스너 등록`);
        } catch (e) {
            console.error(`${LOG_PREFIX} 키보드 등록 실패:`, e);
        }
    };

    const disableKeyboard = async () => {
        if (!keyListenerId) return;
        try {
            const body = await rootDoc.querySelector('body');
            if (body) await body.removeEventListener('keydown', keyListenerId);
        } catch (_) {}
        keyListenerId = null;
        console.log(`${LOG_PREFIX} 키보드 리스너 해제`);
    };

    // ── 플로팅 위젯 생성 ──
    // mode: 'four' = ⏫🔼🔽⏬,  'two' = 🔼🔽
    const createWidget = async (mode) => {
        try {
            const body = await rootDoc.querySelector('body');

            const theme = {
                handle: 'rgba(255, 255, 255, 0.3)',
                handleActive: 'rgba(255, 255, 255, 0.8)',
                btnBg: 'rgba(255, 255, 255, 0.05)',
                btnBorder: 'rgba(255, 255, 255, 0.2)',
                btnColor: 'rgba(255, 255, 255, 0.9)'
            };

            const container = await rootDoc.createElement('div');
            await container.setAttribute(WIDGET_ATTR_KEY, WIDGET_ATTR_VAL);
            await container.setStyleAttribute(`
                position: fixed;
                bottom: 100px;
                right: 20px;
                width: 60px !important;
                height: auto !important;
                display: flex;
                flex-direction: column;
                gap: 8px;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                padding: 8px;
                padding-top: 6px;
                border-radius: 12px;
                background-color: rgba(0, 0, 0, 0);
                user-select: none;
                -webkit-user-select: none;
                cursor: default;
                touch-action: none;
            `);

            // Drag Handle
            const dragHandle = await rootDoc.createElement('div');
            await dragHandle.setStyleAttribute(`
                width: 32px;
                height: 8px;
                background-color: ${theme.handle};
                border-radius: 4px;
                cursor: move;
                margin-bottom: 2px;
                flex-shrink: 0;
                pointer-events: none;
                transition: background-color 0.2s;
            `);

            const btnStyle = `
                width: 40px !important;
                height: 40px !important;
                border-radius: 50%;
                border: 1px solid ${theme.btnBorder};
                background: ${theme.btnBg};
                color: ${theme.btnColor};
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                pointer-events: none;
                transition: background 0.2s;
            `;
            const iconStyle = 'pointer-events: none; width: 24px; height: 24px;';

            // 공통 버튼: 🔼 🔽
            const upBtn = await rootDoc.createElement('div');
            await upBtn.setStyleAttribute(btnStyle);
            await upBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`);

            const downBtn = await rootDoc.createElement('div');
            await downBtn.setStyleAttribute(btnStyle);
            await downBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`);

            handleRef = dragHandle;
            upBtnRef = upBtn;
            downBtnRef = downBtn;
            topBtnRef = null;
            bottomBtnRef = null;

            // Assemble
            await container.appendChild(dragHandle);

            if (mode === 'four') {
                const topBtn = await rootDoc.createElement('div');
                await topBtn.setStyleAttribute(btnStyle);
                await topBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 11-6-6-6 6"/><path d="m18 17-6-6-6 6"/></svg>`);
                topBtnRef = topBtn;
                await container.appendChild(topBtn);
            }

            await container.appendChild(upBtn);
            await container.appendChild(downBtn);

            if (mode === 'four') {
                const bottomBtn = await rootDoc.createElement('div');
                await bottomBtn.setStyleAttribute(btnStyle);
                await bottomBtn.setInnerHTML(`<svg style="${iconStyle}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 7 6 6 6-6"/><path d="m6 13 6 6 6-6"/></svg>`);
                bottomBtnRef = bottomBtn;
                await container.appendChild(bottomBtn);
            }

            await body.appendChild(container);
            widgetElement = container;
            await applyMobileFix();

            // ── Click Handler (hit-test) ──
            await container.addEventListener('click', async (e) => {
                if (isDragging) return;
                const cx = e.clientX;
                const cy = e.clientY;
                if (cx === undefined || cy === undefined) return;

                const hitTest = async (ref, action) => {
                    if (!ref) return false;
                    const rect = await ref.getBoundingClientRect();
                    if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
                        await action();
                        return true;
                    }
                    return false;
                };

                if (topBtnRef && await hitTest(topBtnRef, goToTop)) return;
                if (await hitTest(upBtnRef, scrollUp)) return;
                if (await hitTest(downBtnRef, scrollDown)) return;
                if (bottomBtnRef && await hitTest(bottomBtnRef, goToBottom)) return;
            });

            // ── Drag Handler ──
            try {
                await container.addEventListener('pointerdown', async (e) => {
                    if (e.button !== 0 && e.button !== -1) return;
                    const cx = e.clientX;
                    const cy = e.clientY;
                    if (cx === undefined || cy === undefined || !handleRef) return;

                    const handleRect = await handleRef.getBoundingClientRect();
                    const isInsideHandle =
                        cx >= handleRect.left && cx <= handleRect.right &&
                        cy >= handleRect.top && cy <= handleRect.bottom;
                    if (!isInsideHandle) return;

                    isDragging = true;
                    const rect = await container.getBoundingClientRect();
                    dragShiftX = cx - rect.left;
                    dragShiftY = cy - rect.top;

                    await dragHandle.setStyle('backgroundColor', theme.handleActive);

                    if (globalPointerMoveId) await body.removeEventListener('pointermove', globalPointerMoveId);
                    if (globalPointerUpId) await body.removeEventListener('pointerup', globalPointerUpId);

                    globalPointerMoveId = await body.addEventListener('pointermove', async (ev) => {
                        if (!isDragging || !widgetElement) return;
                        if (ev.preventDefault) ev.preventDefault();
                        const newX = ev.clientX - dragShiftX;
                        const newY = ev.clientY - dragShiftY;
                        await widgetElement.setStyle('bottom', 'auto');
                        await widgetElement.setStyle('right', 'auto');
                        await widgetElement.setStyle('left', `${newX}px`);
                        await widgetElement.setStyle('top', `${newY}px`);
                    });

                    globalPointerUpId = await body.addEventListener('pointerup', async () => {
                        if (isDragging) {
                            isDragging = false;
                            if (handleRef) await handleRef.setStyle('backgroundColor', theme.handle);
                        }
                        if (globalPointerMoveId) await body.removeEventListener('pointermove', globalPointerMoveId);
                        if (globalPointerUpId) await body.removeEventListener('pointerup', globalPointerUpId);
                        globalPointerMoveId = null;
                        globalPointerUpId = null;
                    });
                });
            } catch (dragErr) {
                console.error(`${LOG_PREFIX} Drag setup error:`, dragErr);
            }

        } catch (e) {
            console.error(`${LOG_PREFIX} createWidget error:`, e);
        }
    };

    // ── 모드 순환 ──
    const cycleMode = async () => {
        currentModeIndex = (currentModeIndex + 1) % MODES.length;
        const mode = MODES[currentModeIndex];
        console.log(`${LOG_PREFIX} 모드 전환: ${MODE_LABELS[mode]}`);

        // 이전 상태 모두 정리
        await destroyWidget();
        await disableKeyboard();

        switch (mode) {
            case 'four':
                await createWidget('four');
                break;
            case 'two':
                await createWidget('two');
                break;
            case 'keyboard':
                await enableKeyboard();
                break;
            case 'off':
                // 모든 것 비활성화 (이미 위에서 정리됨)
                break;
        }
    };

    // ── Chat screen observer (위젯 자동 숨김/표시) ──
    const checkChatScreen = async () => {
        try {
            const chatContainer = await rootDoc.querySelector('.flex-col-reverse');
            const isOnChat = !!chatContainer;
            if (isOnChat === lastChatScreenState) return;
            lastChatScreenState = isOnChat;
            if (isOnChat) {
                if (widgetElement) await widgetElement.setStyle('display', 'flex');
            } else {
                if (widgetElement) await widgetElement.setStyle('display', 'none');
            }
        } catch (_) {}
    };

    const startChatObserver = async () => {
        if (domObserver) return;
        try {
            const body = await rootDoc.querySelector('body');
            domObserver = await risuai.createMutationObserver(async () => {
                if (observerTimer) clearTimeout(observerTimer);
                observerTimer = setTimeout(checkChatScreen, 300);
            });
            await domObserver.observe(body, { childList: true, subtree: true });
        } catch (_) {}
    };

    // ── 초기화 ──
    if (!await initRootDoc()) {
        console.error(`${LOG_PREFIX} 초기화 실패: rootDoc 없음`);
        return;
    }

    // ── Chat 버튼 (모드 순환) ──
    try {
        await risuai.registerButton({
            name: '🧭 네비게이션',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`,
            iconType: 'html',
            location: 'chat'
        }, async () => {
            await cycleMode();
        });
        console.log(`${LOG_PREFIX} chat 버튼 등록 완료 (모드 순환)`);
    } catch (e) {
        console.error(`${LOG_PREFIX} chat 버튼 등록 실패:`, e);
    }

    // ── Chat observer + Container 탐색 ──
    await startChatObserver();
    await checkChatScreen();

    const tryFindContainer = async () => {
        for (let i = 0; i < 10; i++) {
            if (await findChatContainer()) {
                isReady = true;
                console.log(`${LOG_PREFIX} ✅ 네비게이션 준비 완료!`);
                return;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        console.warn(`${LOG_PREFIX} 채팅 컨테이너 못 찾음 - 채팅 화면에서 다시 시도됩니다.`);
    };

    tryFindContainer();

    containerPollTimer = setInterval(async () => {
        if (!isReady || !containerSelector) {
            const found = await findChatContainer();
            if (found) isReady = true;
        }
    }, 3000);

    console.log(`${LOG_PREFIX} 초기화 완료 (v2.1.0 모드 순환)`);
})();
