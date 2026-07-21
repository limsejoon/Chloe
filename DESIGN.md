# Design System — 영단어 퀴즈

## Product Context
- **What this is:** 개인용 영단어 퀴즈 웹앱 (영단어 테스트 + 기록).
- **Who it's for:** 본인 혼자 쓰는 학습 도구.
- **Space/industry:** 학습/암기 앱 (Quizlet과 유사한 카테고리).
- **Project type:** 웹앱 (Next.js App Router).

## Aesthetic Direction
- **Direction:** Quizlet 스타일 — 인디고+터콰이즈 조합의 친근하고 산뜻한 학습 앱 톤.
- **Decoration level:** intentional — 카드, 필(pill) 배지, 은은한 그림자로 입체감을 주되 장식은 최소화.
- **Mood:** 딱딱한 관리 도구가 아니라, 가볍게 매일 켜보고 싶은 학습 동반자 느낌.
- **Reference:** Quizlet 브랜드 컬러 (#4257B2 인디고 / #3CCFCF 터콰이즈).

## Typography
- **전체:** Pretendard Variable (한글 UI 전용, 라틴 알파벳도 자체 지원) — jsDelivr CDN(`pretendard`)으로 로드.
- **Fallback:** -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif.
- **단어 카드 (플래시카드):** 800 weight, 큰 사이즈 (24~30px) — 이 앱의 핵심 순간이라 가장 굵고 크게.
- **헤딩/버튼:** 600~700 weight.
- **본문/피드백:** 500 weight, `--text-muted` 색.
- **숫자 (진행률, 점수):** `font-variant-numeric: tabular-nums`.

## Color

### Light
| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-primary` | `#4257B2` | 브랜드 메인, 기본 버튼, 활성 탭 |
| `--color-primary-dark` | `#34459A` | 버튼 hover/pressed |
| `--color-primary-tint` | `#E8EBF9` | 배지 배경, 은은한 강조 영역 |
| `--color-accent` | `#1FA6A1` | 보조 강조 (진행바, 태그) |
| `--color-accent-tint` | `#E1F5F3` | 보조 배지 배경 |
| `--color-success` | `#1F9D55` | 정답(O) |
| `--color-success-bg` | `#E6F6EC` | 정답 배너 배경 |
| `--color-error` | `#D8464B` | 오답(X) |
| `--color-error-bg` | `#FCEAEA` | 오답 배너 배경 |
| `--color-warning` | `#C97F1A` | 취약 단어 배지 |
| `--color-warning-bg` | `#FCF1E0` | 취약 단어 배지 배경 |
| `--bg` | `#F5F6FC` | 페이지 배경 (순백 아님, 인디고 틴트) |
| `--surface` | `#FFFFFF` | 카드 배경 |
| `--border` | `#E4E6F5` | 카드 테두리(은은하게, 그림자가 주된 구분선) |
| `--text` | `#23263B` | 본문 텍스트 (순검정 아님, 다크 네이비) |
| `--text-muted` | `#6B7099` | 보조 텍스트 |
| `--text-faint` | `#9599BC` | placeholder, 화살표 등 |

### Dark (`prefers-color-scheme: dark` 및 `[data-theme="dark"]`)
| 토큰 | 값 |
|---|---|
| `--color-primary` | `#8C9EEA` |
| `--color-accent` | `#4FD9D3` |
| `--color-success` | `#4ADE80` |
| `--color-error` | `#F27C81` |
| `--color-warning` | `#F0B354` |
| `--bg` | `#12142A` |
| `--surface` | `#1B1E3B` |
| `--border` | `#2E3260` |
| `--text` | `#ECEDFB` |
| `--text-muted` | `#A6ABD6` |

- 다크 모드는 색을 단순 반전하지 않고, 배경/서페이스를 남색 계열로 새로 설계하고 accent 컬러들은 채도를 낮춰 눈부심을 줄임.

## Spacing
- **Base unit:** 4px.
- **Density:** comfortable — 카드 내부 패딩 16~24px, 카드 간 gap 12~16px.
- **Radius:** 카드 `20px`, 입력창 `12px`, 버튼/배지 `999px` (pill).
- **그림자:** `0 1px 2px rgba(35,38,59,0.04), 0 8px 24px rgba(35,38,59,0.06)` — 얇은 회색 테두리 대신 카드 구분에 그림자를 우선 사용.

## Layout
- 카드 기반 리스트/화면 구성. 홈 화면의 "영단어 테스트" 카드는 primary 색으로 강조.
- 플래시카드(단어 표시)는 화면에서 가장 크고 굵은 요소 — 시각적 위계의 최상단.
- 진행률/회독 번호는 pill 배지로, 진행 바는 accent 컬러.
- 정답/오답은 배너(배경색 + 아이콘 배지)로 명확히 구분, 취약 단어는 별도의 warning pill.

## Motion
- **Approach:** minimal-functional — 상태 전환(다음 문제, 채점 완료)에 필요한 만큼만. 화려한 애니메이션 없음.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-21 | Quizlet 인디고+터콰이즈 팔레트 채택, Pretendard 폰트로 전환, 카드+pill 기반 레이아웃으로 전면 리디자인 | 기존 기본 Tailwind 스타일(얇은 회색 테두리, 기본 파란 버튼)이 너무 밋밋하다는 피드백. `/design-consultation`으로 브레인스토밍 후 승인. |
