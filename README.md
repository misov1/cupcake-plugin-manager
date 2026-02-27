# cupcake-plugin-manager

**Cupcake Provider Manager (CPM)** is a RisuAI V3 plugin that acts as a meta-framework for managing multiple AI provider backends (OpenAI, Anthropic, Gemini, Vertex AI, AWS Bedrock, DeepSeek, OpenRouter, GitHub Copilot, etc.) via sub-plugins.

## Features

- Multi-provider management via sub-plugin architecture
- Key rotation with automatic failover (429/529/503)
- Auxiliary slot system (translation, emotion, memory, etc.)
- Dynamic model fetching from provider APIs
- Settings backup & persistence across reinstalls
- SSE streaming helpers & message formatting utilities
- Hot-reload for sub-plugins without restarting RisuAI

## Security & Safety

> **TL;DR — CPM은 RisuAI V3 iframe 샌드박스 안에서 실행되며, 사용자의 시스템이나 브라우저 데이터에 접근할 수 없습니다.**

CPM은 `eval()`을 사용하여 서브 플러그인을 로드합니다. 이에 대한 보안 분석 결과를 투명하게 공개합니다:

### RisuAI V3 다중 보안 레이어

| Layer | Protection |
|-------|-----------|
| **iframe Sandbox** | `allow-same-origin` 미포함 → null origin, 호스트 DOM/쿠키/localStorage 접근 불가 |
| **CSP** | `connect-src 'none'` → 직접 네트워크 요청(fetch, XHR, WebSocket) 전면 차단 |
| **RPC Bridge** | 모든 API 호출은 postMessage 기반 RPC Proxy를 통해 직렬화됨 |
| **Host API Restrictions** | URL 블랙리스트, SafeElement 래핑, 권한 검사 적용 |

### eval()이 안전한 이유

1. **iframe 안에서 실행** — eval()은 이미 격리된 sandbox iframe 내부에서 실행됩니다. 추가적인 sandbox 탈출 경로를 열지 않습니다.
2. **RisuAI 자체도 eval() 사용** — RisuAI의 `GUEST_BRIDGE_SCRIPT`에서 `eval()`을 공식적으로 사용하며, iframe 내 eval()은 허용된 패턴입니다.
3. **사용자 동의 기반** — 모든 서브 플러그인은 사용자가 직접 설치(파일 업로드 또는 업데이트 버튼 클릭)한 코드만 실행합니다.
4. **업데이트 안전장치** — 원격 코드의 `@name`이 대상 플러그인과 일치하지 않으면 업데이트가 차단됩니다.

### eval() 코드 vs 일반 코드 비교

| 항목 | eval() 코드 | 일반 iframe 코드 |
|------|------------|----------------|
| 호스트 DOM 접근 | ❌ 불가 | ❌ 불가 |
| 호스트 localStorage | ❌ 불가 | ❌ 불가 |
| 직접 fetch() | ❌ CSP 차단 | ❌ CSP 차단 |
| window.parent 접근 | ❌ cross-origin 차단 | ❌ cross-origin 차단 |

> 📄 전체 보안 분석 보고서: [Issue #4 — CPM eval() Security Analysis Report](https://github.com/ruyari-cupcake/cupcake-plugin-manager/issues/4)

## Documentation

- [PLUGIN_GUIDE.md](PLUGIN_GUIDE.md) — Sub-plugin development guide (CPM API reference, examples, architecture)

## License

See individual plugin files for license information.