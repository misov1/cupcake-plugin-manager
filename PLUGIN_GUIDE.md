# 🧁 Cupcake Plugin Manager - 플러그인 개발 가이드

## 목차
1. [프로젝트 구조](#1-프로젝트-구조)
2. [메인 플러그인 버전 관리](#2-메인-플러그인-버전-관리)
3. [서브 플러그인 만들기](#3-서브-플러그인-만들기)
4. [Provider 서브 플러그인 만들기](#4-provider-서브-플러그인-만들기)
5. [업데이트 시스템](#5-업데이트-시스템)
6. [GitHub 배포 워크플로우](#6-github-배포-워크플로우)
7. [자주 쓰는 API 레퍼런스](#7-자주-쓰는-api-레퍼런스)
8. [체크리스트](#8-체크리스트)

---

## 1. 프로젝트 구조

```
cupcake-plugin-manager/
├── provider-manager.js          ← 메인 플러그인 (Cupcake PM 코어)
├── cpm-provider-anthropic.js    ← Provider 서브 플러그인
├── cpm-provider-aws.js
├── cpm-provider-openai.js
├── cpm-provider-openrouter.js
├── cpm-provider-deepseek.js
├── cpm-provider-gemini.js
├── cpm-provider-vertex.js
├── cpm-chat-resizer.js          ← Component 서브 플러그인
├── PLUGIN_GUIDE.md              ← 이 문서
└── .gitignore
```

---

## 2. 메인 플러그인 버전 관리

### 버전 변경 시 수정해야 할 곳 (2곳)

```js
// 1️⃣ 파일 상단 헤더 (@version)
//@name Cupcake_Provider_Manager
//@display-name Cupcake Provider Manager
//@api 3.0
//@version 1.4.0  // ← 여기
//@update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/provider-manager.js

// 2️⃣ CPM_VERSION 상수 (헤더 바로 아래)
const CPM_VERSION = '1.4.0';  // ← 여기 (UI 표시용, 위와 동일하게)
```

> ⚠️ **두 곳의 버전이 반드시 일치해야 합니다!**
> `@version`은 RisuAI 업데이트 체크용, `CPM_VERSION`은 UI 표시용입니다.

### 버전 규칙

```
major.minor.patch (예: 1.4.0)

major: 호환성이 깨지는 큰 변경 (API 변경 등)
minor: 새 기능 추가 (하위 호환 유지)
patch: 버그 수정, 사소한 변경
```

---

## 3. 서브 플러그인 만들기

### 필수 헤더

모든 서브 플러그인 `.js` 파일 최상단에 다음 헤더를 반드시 포함해야 합니다:

```js
// @name 플러그인 이름
// @version 1.0.0
// @description 플러그인 설명
// @icon 🔮
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/파일명.js
```

| 헤더 | 필수 | 설명 |
|------|------|------|
| `@name` | ✅ 필수 | 플러그인 이름. UI에 표시됨. 고유해야 함 |
| `@version` | ✅ 필수 | semver 형식 (`x.y.z`). 업데이트 감지에 사용 |
| `@description` | 권장 | 한 줄 설명 |
| `@icon` | 권장 | 이모지 1개. 기본값: 📦 |
| `@update-url` | ✅ 필수 | GitHub Raw URL. **없으면 업데이트 체크 불가!** |

### 기본 구조 (일반 서브 플러그인)

```js
// @name My Custom Plugin
// @version 1.0.0
// @description 내 커스텀 플러그인 설명
// @icon ✨
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/my-custom-plugin.js

(() => {
    // CupcakePM API 가져오기
    const CPM = window.CupcakePM;
    if (!CPM) {
        console.error('[My Plugin] CupcakePM API not found!');
        return;
    }

    // 여기에 플러그인 로직 작성
    console.log('[My Plugin] Loaded successfully!');

    // (선택) 설정 UI 등록
    // window.CupcakePM_SubPlugins.push({ ... });
})();
```

### 이름 규칙

- **Provider 플러그인**: `cpm-provider-{이름}.js` (예: `cpm-provider-anthropic.js`)
- **Component 플러그인**: `cpm-{기능}.js` (예: `cpm-chat-resizer.js`)
- **커스텀/서드파티**: 자유롭게, 하지만 `cpm-` 접두사 권장

---

## 4. Provider 서브 플러그인 만들기

AI Provider를 추가하려면 `CupcakePM.registerProvider()`를 사용합니다.

### 전체 템플릿

```js
// @name CPM Provider - MyProvider
// @version 1.0.0
// @description MyProvider API provider for Cupcake PM
// @icon 🔮
// @update-url https://raw.githubusercontent.com/ruyari-cupcake/cupcake-plugin-manager/main/cpm-provider-myprovider.js

(() => {
    const CPM = window.CupcakePM;
    if (!CPM) { console.error('[CPM-MyProvider] CupcakePM API not found!'); return; }

    // 1. 모델 목록 정의
    const MODELS = [
        { value: 'model-id-1', name: 'Model Name 1' },
        { value: 'model-id-2', name: 'Model Name 2' },
    ];

    // 2. 설정 키 정의 (리스트 형식)
    const SETTINGS = {
        apiKey:   'cpm_myprovider_api_key',
        model:    'cpm_myprovider_model',
        maxToken: 'cpm_myprovider_max_token',
        // 필요한 설정 추가...
    };

    // 3. Provider 등록
    CPM.registerProvider({
        id: 'cpm-myprovider',
        name: 'MyProvider',
        icon: '🔮',

        // 모델 목록 반환
        getModels: () => MODELS,

        // 설정 탭 UI 렌더링 (HTML 문자열 반환)
        renderSettingsTab: async (renderInput, options) => {
            const { reasoningList, verbosityList, thinkingList } = options;
            let html = '';
            html += renderInput('API Key', SETTINGS.apiKey, 'password', '');
            html += renderInput('Model', SETTINGS.model, 'select', '', MODELS);
            html += renderInput('Max Token', SETTINGS.maxToken, 'number', '4096');
            return html;
        },

        // API 요청 처리 (핵심 로직)
        handleRequest: async (body, signal) => {
            const apiKey = CPM.safeGetArg(SETTINGS.apiKey, '');
            const model  = CPM.safeGetArg(SETTINGS.model, MODELS[0].value);
            const maxTok = parseInt(CPM.safeGetArg(SETTINGS.maxToken, '4096'));

            if (!apiKey) throw new Error('MyProvider API Key가 설정되지 않았습니다.');

            // messages 형식 변환 (필요시)
            const messages = CPM.formatMessages(body.messages);

            // API 호출
            const response = await Risuai.nativeFetch('https://api.myprovider.com/v1/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: maxTok,
                    stream: true,
                }),
                signal: signal,
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`MyProvider API Error (${response.status}): ${errText}`);
            }

            return response;
        },

        // 스트리밍 응답 파싱 (SSE 형식)
        parseStream: (line) => {
            // data: {"choices":[{"delta":{"content":"Hello"}}]}
            if (!line.startsWith('data: ')) return null;
            const data = line.slice(6);
            if (data === '[DONE]') return { done: true };
            try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || '';
                return { content, done: false };
            } catch {
                return null;
            }
        },
    });

    console.log('[CPM-MyProvider] Provider registered.');
})();
```

### renderInput 함수 사용법

`renderInput(label, settingKey, type, defaultValue, options?)` — 설정 UI 입력 필드를 생성합니다.

| type | 설명 | options |
|------|------|---------|
| `'text'` | 텍스트 입력 | - |
| `'password'` | 비밀번호 (마스킹) | - |
| `'number'` | 숫자 입력 | - |
| `'select'` | 드롭다운 선택 | `[{ value, name }]` 배열 |
| `'textarea'` | 여러 줄 텍스트 | - |

### 설정 키 네이밍 규칙

```
cpm_{provider이름}_{설정이름}

예시:
cpm_anthropic_api_key
cpm_aws_region
cpm_openai_model
cpm_myprovider_temperature
```

---

## 5. 업데이트 시스템

### 메인 플러그인 업데이트
- RisuAI가 `@update-url`을 읽고 `@version`을 비교하여 자동 감지
- 사용자에게 업데이트 알림이 뜸

### 서브 플러그인 업데이트
- 사용자가 Settings → Sub-Plugins → **🔄 업데이트 확인** 버튼 클릭
- `@update-url`로 원격 파일을 가져와 `@version` 비교
- 새 버전 있으면 **⬆️ 업데이트** 버튼으로 적용

### 업데이트가 작동하려면

1. `@version`이 반드시 있어야 함
2. `@update-url`이 반드시 있어야 함
3. 버전 형식이 `x.y.z` (숫자.숫자.숫자)여야 함
4. **버전을 올리지 않으면 업데이트가 감지되지 않음**
5. URL은 **GitHub Raw URL** 형식: `https://raw.githubusercontent.com/{user}/{repo}/{branch}/{file}`

### @update-url이 없는 구버전에서는?
- 업데이트 체크 자체가 불가능 → **수동으로 새 버전 파일을 다운받아 재설치** 필요
- 재설치 후부터는 `@update-url`이 포함되어 자동 체크 가능

---

## 6. GitHub 배포 워크플로우

### 최초 설정 (한 번만)

```bash
cd cupcake_plugin
git init
git remote add origin https://github.com/ruyari-cupcake/cupcake-plugin-manager.git
git branch -M main
```

### 배포할 때마다 (3단계)

```bash
# 1단계: 버전 올리기 (코드에서 수동으로)
#   - @version 헤더의 숫자 올리기
#   - (메인 플러그인만) CPM_VERSION 상수도 동일하게 올리기

# 2단계: 커밋
git add 변경된파일.js
git commit -m "v1.5.0 - 변경 내용 요약"

# 3단계: 푸시
git push origin main
```

### 커밋 메시지 규칙 (권장)

```
v{버전} - {변경 내용 한줄 요약}

예시:
v1.4.0 - Fix version display, add dynamic CPM_VERSION
v1.2.0 - Add Claude 4.6 support with adaptive thinking
v1.0.1 - Fix API key validation bug
```

### 자주 쓰는 Git 명령어

```bash
# 상태 확인
git status

# 특정 파일만 스테이징
git add provider-manager.js cpm-provider-anthropic.js

# 전체 변경사항 스테이징
git add -A

# 커밋 + 푸시 한번에
git add 파일명; git commit -m "메시지"; git push origin main

# 변경 내용 확인
git diff 파일명
```

---

## 7. 자주 쓰는 API 레퍼런스

### CupcakePM (window.CupcakePM)

```js
const CPM = window.CupcakePM;

// Provider 등록
CPM.registerProvider({ id, name, icon, getModels, renderSettingsTab, handleRequest, parseStream });

// 설정값 안전하게 가져오기 (빈 문자열/undefined 방지)
CPM.safeGetArg('cpm_setting_key', '기본값');

// 메시지 형식 변환 (RisuAI 내부 → API 표준)
CPM.formatMessages(body.messages);

// AWS V4 서명 (AWS Provider 전용)
CPM.AwsV4Signer;
```

### RisuAI API

```js
// HTTP 요청 (CORS 우회)
const res = await Risuai.nativeFetch(url, options);

// 설정값 읽기/쓰기
const val = risuai.getArgument('키');
risuai.setArgument('키', '값');

// pluginStorage (플러그인 삭제해도 유지)
const data = await risuai.pluginStorage.getItem('키');
await risuai.pluginStorage.setItem('키', '값');
```

---

## 8. 체크리스트

### 새 서브 플러그인 만들 때
- [ ] `@name` 작성 (고유한 이름)
- [ ] `@version` 작성 (`1.0.0` 형식)
- [ ] `@description` 작성
- [ ] `@icon` 설정 (이모지)
- [ ] `@update-url` 설정 (GitHub Raw URL)
- [ ] IIFE `(() => { ... })()` 로 감싸기
- [ ] `window.CupcakePM` 존재 체크
- [ ] 설정 키에 `cpm_` 접두사 사용
- [ ] 콘솔 로그에 `[플러그인명]` 접두사 사용

### 버전 올릴 때
- [ ] 코드에서 `@version` 숫자 올리기
- [ ] (메인 플러그인만) `CPM_VERSION` 상수도 동일하게 올리기
- [ ] `git add` → `git commit` → `git push origin main`
- [ ] GitHub에서 파일이 정상 업로드 되었는지 확인

### 배포 전 확인
- [ ] `@update-url`의 파일명이 실제 GitHub 레포의 파일명과 일치하는지
- [ ] 문법 에러 없는지 (브라우저 콘솔에서 확인)
- [ ] 기존 설정값이 깨지지 않는지

---

## 부록: 설정 키 전체 목록

설정 키를 새로 만들 때는 기존 키와 충돌하지 않도록 주의하세요.
전체 키 목록은 `provider-manager.js`의 `SettingsBackup.getAllKeys()` 메서드를 참고하세요.

```
패턴: cpm_{provider}_{setting}

예시:
cpm_anthropic_api_key, cpm_anthropic_model, cpm_anthropic_max_token
cpm_aws_access_key, cpm_aws_secret_key, cpm_aws_region
cpm_openai_api_key, cpm_openai_model
...
```
