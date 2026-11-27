# 실시간 악보 · LIVE SCORE

건반으로 연주한 선율이 그 자리에서 악보가 되고, 가사를 붙이고, 편곡과 비교해 학생이 직접 고친 뒤 이유를 남기는 음악 창작 수업 플랫폼입니다.

- 플랫폼: https://edunity21.github.io/livescore/
- 사용 매뉴얼: https://edunity21.github.io/livescore-manual/
- OPEN SCORE Vol.01: https://edunity21.github.io/jnjmuse-mag/

## 여덟 단계

1. 연결하기 — MIDI 건반 자동 인식, 곡 제목·모둠 역할, 작곡 방식(건반/마우스)
2. 가사 쓰기 — 글자를 음절로 나누고 한 줄을 두 마디에 배치, 후렴 표시
3. 선율 연주 — 예비박 뒤 실시간 기록(피아노 롤), 화면 건반·마우스 입력, 🎤 흥얼거림 녹음(마이크 → 수노 Upload Audio용 MP3 + 음 높이를 찾아 가사가 붙은 악보, 내 선율로 쓰기)
4. 박 맞춤 — 4분·8분·16분음표 단위로 맞추고 음표 고치기
5. 가사 붙이기 — 음표 아래 가사, 끌어 옮기기, 두 글자 붙이기·늘이기, 줄별 확인(노랫말·음표가 없는 줄은 반주 마디)
6. AI 편곡 — 자동 편곡(연습·시연용, 규칙 기반) 또는 수노 스템 MIDI(받은 .zip 그대로 또는 .mid 여러 개)를 끌어다 놓으면 박을 맞춘 악보로 바로 바뀌고, 음표를 눌러 고치는 악보 편집(재생 빠르기 50~150%). 수노가 구간별로 쪼갠 트랙은 스템마다 합치고, 흔들리는 빠르기 지도는 박(틱) 기준으로 펴며, ÷2·×2와 반 박 단위 첫 박 옮기기로 박을 맞춘다
7. 비교·수정 — 바뀐 마디 표시, 듣고 고르기, 고친 이유 한 줄 기록
8. 악보 완성 — 고칠 수 있는 밴드 총보, MusicXML(뮤즈스코어)·MIDI·PDF·MP3(수노 Upload Audio용) 내보내기

## 쓰는 환경

- 노트북 크롬 또는 엣지(건반 연결은 Web MIDI가 되는 브라우저에서만). 건반이 없으면 마우스 입력.
- 모둠원 태블릿은 머리의 '태블릿으로 보기' QR로 지금 악보를 받아 보고 들을 수 있습니다(실시간 공동 편집은 아님).
- 마이크 녹음과 음 높이 찾기도 브라우저 안에서만 합니다. 서버나 AI API를 쓰지 않습니다. 작업 내용은 그 기기의 브라우저에만 저장되며, 메뉴에서 프로젝트 파일(.json)로 옮길 수 있습니다.

## 쓴 공개 도구

- [abcjs](https://github.com/paulrosen/abcjs) — 악보 그리기 (MIT)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — QR (MIT)
- [lamejs](https://github.com/zhuker/lamejs) — 브라우저 안 MP3 만들기 (LGPL-3.0, LAME 프로젝트 https://lame.sourceforge.io 기반, lib/lame.min.js 별도 파일)
- [Pretendard](https://github.com/orioncactus/pretendard) — 글꼴 (OFL)

2026 수업나눔페스타 · 전남중등음악사랑연구회
