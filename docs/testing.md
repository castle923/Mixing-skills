# 공개 패키지 검증 기록

검증일: 2026-10-30. 원본 개인 환경에서의 과거 성공 기록과 별개로, 이 저장소의 공개용 사본을 확인했습니다.

| 검증 | 결과 | 범위 |
|---|---|---|
| Python unittest | 40개 통과 | 검색·읽기·삭제 갱신·호환 근거·서버 경계·AI 계약/예산/취소/오류·공개 사본의 이식성 |
| 데모 UI | 통과 | 실제 loopback 서버, 가상 스킬 8개, 장바구니, 조합 근거, 문서 검색, 로컬 추천, 키 없음, 390px |
| AI UI | 통과 | 공급자 모의 응답, 전송 확인·중복 클릭·취소·이전 응답 무시·안전한 텍스트 출력·종료 사유/실사용량 누락 표시 |
| 개인정보 검토 | 확인 | 파일별 허용 목록으로 소스와 직접 작성한 예제만 공개. 개인 SKILL 원문·한국어 설명 모음·원시 실행 로그·백업·검색 DB·선택 기록 제외 |

실행 환경은 Windows, 번들 Python 및 기존 Chrome/Playwright입니다. 새 패키지를 설치하지 않고 기존 도구를 재사용했습니다. 다른 PC의 일반적인 Python 환경을 위해 외부 인벤토리 스크립트·별도 카탈로그 저장소·개인 런타임 경로 의존성을 제거했습니다.

## 재현

```powershell
python -X utf8 -m unittest discover -v
npm install
npx playwright install chromium
npm run test:ui
```

`smoke_demo_ui.cjs`는 임시 포트에서 서버를 시작하고 키 환경 변수를 비운 뒤 종료합니다. 기존 선택 파일이 있으면 복원합니다. `smoke_ai_ui.cjs`는 모든 브라우저 API를 가로채므로 실제 공급자를 호출하지 않습니다. 기본 브라우저는 Playwright Chromium이며 기존 Chrome을 검증에 사용할 때만 `PLAYWRIGHT_CHANNEL=chrome`을 지정합니다. 테스트용 Python은 `PYTHON`으로 지정할 수 있습니다.

스크린샷은 `CAPTURE_DEMO=1`로 데모 테스트를 실행해 생성했습니다. 실제 사용자 카탈로그·질문·답변을 촬영한 자료가 아닙니다.

## GitHub Actions 검증

[공개 커밋 검증 실행](https://github.com/castle923/Mixing-skills/actions/runs/40978055363)에서 Windows/Ubuntu × Python 3.11/3.13의 단위·통합 검사 4개와 Ubuntu Chromium UI 검사 1개가 모두 성공했습니다. GitHub 러너의 격리된 환경에서 수행한 결과이며 모든 OS 배포 환경을 보장하는 것은 아닙니다.

## 확인하지 않은 범위

이 공개 패키지에서 유료 API 생성 요청을 추가로 보내지 않았습니다. 모델 접근·실제 요금·일반 작업의 답변 품질은 해당 계정에서 별도 검증해야 합니다. 모든 스킬 쌍의 실행 호환성, 대규모 검색 성능, 전체 접근성 감사 및 macOS와 별도의 Linux 배포 환경에서 수동 설치·실행을 보장하지 않습니다. CI 설정 파일의 존재는 원격 작업의 성공을 뜻하지 않습니다.
