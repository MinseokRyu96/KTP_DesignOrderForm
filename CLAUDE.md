# 개발 지침

## README 업데이트
기능 추가, 수정, 삭제 등 코드 변경이 있을 때마다 반드시 `README.md`를 함께 업데이트한다.

## GitHub 배포
변경사항 커밋 후 항상 GitHub에 push한다.
- Remote: `https://github.com/MinseokRyu96/KTP_DesignOrderForm.git`
- Branch: `main`
- PAT 토큰은 유저에게 요청한다.

## 프로젝트 구조
- `index.html` — 마크업
- `styles.css` — 스타일
- `app.js` — 기능 로직 (Supabase 연동)
- `build.sh` — Netlify 빌드 시 config.js 생성
- `config.js` — Supabase 키 (gitignore, 배포 환경변수로 주입)

## 기술 스택
- Frontend: Vanilla HTML / CSS / JS
- Database: Supabase (PostgreSQL)
- 이미지 저장: Supabase Storage (`item-images` 버킷)
- 호스팅: Netlify (GitHub 연동 자동 배포)
