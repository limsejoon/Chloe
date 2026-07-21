# 사이트 3-파트 재편 + 독서록 기능 — 설계 문서

- 작성일: 2026-07-21
- 상태: 사용자 승인 완료 (브레인스토밍 대화로 확정)

## 1. 배경 / 목적

이 사이트는 원래 Chloe(사용자의 자녀)를 위한 튜터링 사이트로 기획되었고, 지금까지 완성한 "단어 테스트"는 그중 한 파트일 뿐이다. 사이트를 다음 3개 파트로 재편한다.

1. **단어 테스트** — 이미 완성된 기존 기능 (영단어 배치 채점 테스트).
2. **독서록** — 이번에 새로 만드는 기능. 책 제목+지은이를 입력하면 Claude가 그 책 내용에 근거한 성찰형 질문 3개를 내고, 아이가 1~2단락으로 답하면 Claude가 내용 중심 피드백을 주고 DB에 저장해 나중에 다시 볼 수 있게 한다.
3. **영어독해** — 이번 범위에서는 "준비중" 안내 페이지만 만들고, 실제 기능은 나중에 별도로 브레인스토밍한다.

이 사이트는 아이패드에서 사용하므로, 레이아웃은 아이패드 화면에서 답답하지 않고 터치 조작에 편하도록 조정한다.

## 2. 범위

- **이번 스펙에 포함:** 홈 화면 3-파트 재편, 독서록 기능 전체(질문 생성/답변/피드백/저장/기록 조회), 영어독해 "준비중" 페이지, 아이패드 대응 레이아웃 조정.
- **이번 스펙에서 제외:** 영어독해의 실제 기능(별도 스펙으로 나중에), 기존 단어 테스트 로직 변경.

## 3. 홈 화면 재편

- 홈 화면 카드를 3개로 재편: **단어 테스트** / **독서록** / **영어독해(준비중)**.
- 기존에 홈 화면 최상단에 있던 "기록" 카드는 제거하고, 대신 **단어 테스트 자체에 속한 하위 기능**으로 이동한다 — `/review` 화면 안에 작은 "기록 보기" 링크를 추가해 기존 `/history`로 연결한다 (`/history` 자체의 내용/로직은 변경 없음).
- **독서록** 카드 → `/reading`. `/reading` 화면 안에도 "지난 독서록 보기" 링크로 `/reading/history`를 연결한다.
- **영어독해** 카드 → `/comprehension`. 클릭은 되지만 "준비중입니다" 안내 문구만 있는 정적 페이지. 홈 화면에서는 다른 카드보다 톤을 낮춰(예: 무채색/muted 톤) "아직 준비 중"임을 시각적으로도 암시한다.

## 4. 데이터 모델 (신규)

기존 `wordbooks`/`words`/`word_progress`/`attempts` 스키마와 완전히 분리된 신규 테이블 2개를 추가한다.

```sql
reading_logs
  id           serial PRIMARY KEY
  title        text NOT NULL
  author       text NOT NULL
  created_at   timestamptz NOT NULL DEFAULT now()

reading_log_qa
  id                 serial PRIMARY KEY
  reading_log_id     int NOT NULL REFERENCES reading_logs(id)
  question_index     int NOT NULL        -- 0, 1, 2
  question           text NOT NULL
  answer             text NOT NULL
  feedback           text NOT NULL
```

- `reading_logs` 한 행 = 책 한 권에 대한 독서록 세션 하나.
- `reading_log_qa` 3행 = 그 세션의 질문/답변/피드백 각각 (질문 3개 고정).
- 저장은 `reading_logs` insert(id 획득) → `reading_log_qa` 3행 insert 순서로 진행되는 두 단계 순차 작업이다. `neon-http` Drizzle 드라이버는 `db.transaction()`을 지원하지 않으므로(기존 프로젝트에서 이미 확인된 제약), 두 번째 insert가 실패하면 `reading_logs` 행만 남고 QA가 없는 상태가 생길 수 있다 — 이 경우도 5절의 에러 처리 원칙(채점 결과는 그대로 보여주고 저장 경고만 표시)을 따른다.

## 5. Claude 연동

### 5.1 질문 생성 — `generateReadingQuestions(title, author)`

- 입력은 책 제목과 지은이뿐이다 (줄거리 요약 등 추가 입력 없음).
- Claude에게 먼저 "이 책의 구체적인 줄거리·등장인물·사건을 정확히 아는지"를 판단하게 하고, 구조화된 출력으로 `{ recognized: boolean, questions: string[] }`를 받는다.
- **확신이 없으면 `recognized: false`, `questions: []`를 반환하도록 프롬프트에 명시한다 — 추측으로 질문을 지어내지 않는다.** 이는 이번 기능의 핵심 요구사항이다: 책 내용을 모르면 부실한 범용 질문을 내는 대신 "모르는 책"이라고 솔직히 답해야 한다.
- 안다고 판단되면 `recognized: true`와 함께, 그 책의 실제 등장인물·사건·상황을 구체적으로 언급하는 성찰/공감형 질문을 정확히 3개 생성한다. 단순 사실 확인이 아니라 "주인공이 ~한 상황에서 너라면 어떤 기분이었을 것 같아?", "가장 기억에 남는 장면과 그 이유는?", "주인공의 선택에 공감했어, 아니면 다르게 행동했을 것 같아?" 같은 성찰형이어야 한다.

### 5.2 피드백 — `gradeReadingLogAnswers(title, author, items)`

- 단어 테스트의 배치 채점과 동일한 원칙으로, 3개 답변을 **한 번의 API 호출**로 함께 처리한다 (질문마다 별도 호출하지 않음).
- 채점 기준은 **내용(질문과의 관련성·성찰의 깊이)만** — 문법/맞춤법은 다루지 않는다.
- 질문 취지에서 벗어나거나 성의 없이 답한 경우 그렇다고 솔직하게 말해준다("첨삭"). 어조는 다정한 선생님 톤을 유지하되, 정확성을 희생하지 않는다.
- 질문 생성과 피드백 생성은 완전히 분리된 두 번의 Claude 호출이다 — 그 사이에 아이가 답을 작성하는 시간차가 있으므로 하나로 합칠 수 없다.

## 6. 서버 액션

`src/app/actions/readingLog.ts` (신규 파일):

- `generateReadingQuestions(title: string, author: string): Promise<{ recognized: boolean; questions: string[] }>`
- `submitReadingLog(title: string, author: string, items: { question: string; answer: string }[]): Promise<{ readingLogId: number; feedback: string[]; saveWarning: string | null }>` — 내부에서 `gradeReadingLogAnswers`를 호출한 뒤 DB에 저장.
- `listReadingLogs(): Promise<{ id: number; title: string; author: string; createdAt: string }[]>`
- `getReadingLogDetail(id: number): Promise<{ title: string; author: string; createdAt: string; items: { question: string; answer: string; feedback: string }[] }>`

## 7. UI/UX 흐름

### 독서록 작성 (`/reading`)

1. 시작 화면: 책 제목 + 지은이 입력 폼, "질문 만들기" 버튼, 하단에 "지난 독서록 보기" 링크(`/reading/history`).
2. 제출 → `generateReadingQuestions` 호출, 로딩 상태 표시.
3. `recognized: false` → "이 책은 제가 자세히 모르는 책이에요. 다른 책 제목/지은이로 다시 시도해주세요" 안내, 입력 폼으로 복귀(입력값 유지).
4. `recognized: true` → 3개 질문과 3개 텍스트박스(1~2단락 입력에 편한 높이)를 **한 화면에 모두** 보여주고 "제출" 버튼. 3개 모두 채워야 제출 가능.
5. 제출 → `submitReadingLog` 호출 → 결과 화면: 질문마다 "질문 / 내 답변 / Claude 피드백"을 카드로 순서대로 표시.

### 독서록 기록 (`/reading/history`, `/reading/history/[id]`)

- 목록: 책 제목 + 지은이 + 작성일 카드 리스트 (기존 `/history` 세션 목록과 같은 톤 — `bg-surface` 카드 + `shadow-card`).
- 상세: 해당 독서록의 질문 3개 + 답변 + 피드백 전체를 그대로 다시 볼 수 있음.

### 영어독해 (`/comprehension`)

- "영어독해 — 준비중입니다" 정도의 문구만 있는 정적 페이지.

## 8. 아이패드 대응 레이아웃 (공통 적용)

- 기존 좁은 모바일 폭(`max-w-sm`/`max-w-md`)을 중간 화면 이상(`md:` 브레이크포인트)에서 넓힌다 (`md:max-w-lg` ~ `md:max-w-2xl`, 화면 성격에 따라 다르게 적용) — 아이패드에서 카드가 답답해 보이지 않게.
- 독서록 답변 텍스트박스는 1~2단락 작성에 편하도록 세로로 넉넉한 높이(`min-h-32` 이상)를 준다.
- 버튼/입력창은 기존 패딩 기준(약 44pt 이상)을 유지 — 이미 터치 조작에 충분한 크기이므로 새로 추가하는 요소도 동일 기준을 따른다.
- 마우스 hover에만 의존하는 인터랙션은 두지 않는다(기존에도 없음).

## 9. 에러 처리

- **질문 생성 API 자체 실패**(네트워크/API 오류): 에러 메시지 + "다시 시도" 버튼, 입력한 제목/지은이는 유지.
- **"모르는 책"**: 에러가 아니라 정상적인 판단 결과 — 안내 메시지 + 입력 폼 복귀(입력값 유지), 재시도 유도.
- **피드백 생성 API 실패**: 이미 작성한 답변은 유지한 채 에러 메시지 + "다시 채점하기"(같은 답변으로 재시도).
- **채점은 성공했으나 DB 저장 실패**: 결과(피드백)는 그대로 보여주고 작은 저장 경고만 표시 — 단어 테스트와 동일 원칙.
- 3개 텍스트박스를 모두 채워야 제출 버튼이 활성화된다(빈 답변 방지).

## 10. 테스트 계획

- 신규 서버 액션들(`generateReadingQuestions`, `gradeReadingLogAnswers`, `submitReadingLog`, `listReadingLogs`, `getReadingLogDetail`)은 기존 프로젝트 관례(단어 테스트의 Server Action들과 동일)를 따라 **자동 유닛 테스트 없이 라이브 API/DB로 검증**한다.
- Playwright로 확인:
  1. 유명한 실제 책 제목으로 "인식됨(recognized: true)" 경로 확인 — 질문 3개, 답변 제출, 피드백까지.
  2. 일부러 존재하지 않는 책 제목으로 "모르는 책(recognized: false)" 경로 확인.
  3. 독서록 작성 → `/reading/history` 목록 → `/reading/history/[id]` 상세까지 전체 흐름 확인.
- 홈 화면 3-파트 재편과 아이패드 레이아웃은 브라우저에서 시각적으로 확인(자동 테스트 대상 아님).

## 11. 향후 고려 사항 (이번 범위 밖)

- 영어독해 기능 전체 설계 (별도 브레인스토밍).
- 독서록에 문법/맞춤법 첨삭을 추가할지 여부 (이번엔 내용 중심 피드백만).
- 여러 자녀/여러 사용자 지원 (현재는 단일 사용자 개인 도구 그대로).
