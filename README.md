# Lens Roadmap Studio

마운트별 Prime / Zoom 렌즈 로드맵을 만드는 정적 웹앱입니다.
사진 폴더의 EXIF를 브라우저 안에서 직접 분석해 렌즈별 초점거리 사용량을 보여줍니다.

## 이번 업데이트

- EXIF 연사 인식: 같은 렌즈·바디에서 짧은 간격(0.5~3초)으로 찍은 연사를 1장으로 합산
- 연사 설정 변경 시 캐시 기준으로 빠르게 다시 집계 (`설정 적용` 버튼)
- 촬영시각 EXIF + SubSec 정밀도로 연사 판정, 시각 없으면 낱장 처리
- 사진 수 표기에 연사 합산 표시 (예: `12 (30→12)`)
- Excel 라이브러리 지연 로딩으로 첫 화면 로딩 개선
- 차트 렌더링 최적화 (히트맵 세그먼트 축소, 디바운스, DOM 읽기 캐싱)
- UI 다듬기: 고정 상단바, 탭형 데이터 패널, 정리된 폼/버튼/표 스타일
- 사용감 개선: 드래그앤드롭 분석, Esc 취소, 다국어 문구 보완
- `burst-group.js` 공통 모듈 + `tests/burst-group.test.cjs` 회귀 테스트 추가

## 기능

- 마운트 생성 및 크롭 팩터 설정
- 마운트별 Prime / Zoom 자동 분리
- 35mm 환산 화각 기준과 실제 초점거리 기준 전환
- 로그 스케일과 선형 스케일 전환
- 스타일별 색상, 선 모양, 선 두께, 텍스트 굵기 설정
- PNG / JPG / WebP 저장
- Excel(.xlsx/.xls/.csv) 양식 다운로드 및 업로드
- 로컬 JPEG/RAW 폴더 EXIF 분석, 렌즈별 초점거리 통계, 히트맵 표시
- EXIF 사용량을 로드맵 차트 위에 전체 사용량 기준 히트맵으로 자동 표시
- 히트맵, 로드맵 배경, 축/테두리, 스타일 색상 커스터마이징
- EXIF LensInfo/LensSpecification과 다양한 렌즈명 표기에서 초점거리 범위 인식
- 렌즈명에 `+ MC-14`, `+ TC-20`, `+ 1.4x`처럼 텔레컨버터가 있으면 환산된 초점거리와 히트맵으로 표시
- JPG와 같은 베이스 이름의 RAW가 같이 있으면 JPG EXIF만 사용
- EXIF 분석 결과 IndexedDB 캐시 및 동일 파일 재분석 건너뛰기
- JSON 내보내기 / 불러오기
- localStorage 자동 저장

## 실행

`index.html`을 브라우저에서 바로 열어도 되지만,
EXIF 워커와 파일 접근은 로컬 서버에서 확인하는 것을 권장합니다.

```bash
python -m http.server 4173
```

이후 브라우저에서 `http://localhost:4173`으로 접속하세요.

## GitHub Desktop 연결

이 폴더는 이미 `origin`이 연결된 git 저장소입니다.

1. GitHub Desktop 실행
2. `File > Add local repository` 선택
3. 이 폴더 선택 후 `Add` 클릭
4. 이후 변경분은 GitHub Desktop에서 커밋/푸시하면 `azqeurio/ff-length`에 반영됩니다.

## 연사 테스트

Node가 설치된 환경에서:

```bash
node --test tests/burst-group.test.cjs
```
