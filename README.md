# KTP 디자인물 관리

디자인물 발주를 관리하고, 지출결의서 작성 시 필요한 내용을 빠르게 복사할 수 있는 사내 웹 툴입니다.

🔗 **배포 주소**: [https://ktpdesignorder.netlify.app](https://ktpdesignorder.netlify.app)

---

## 탭 구성

| 탭 | 설명 |
|----|------|
| 디자인물 | 발주 항목 관리, 지출결의서 복사, 발주내역 |
| 재고현황 | 항목별 최근 배부 현황 표시, 📋 히스토리 버튼으로 전체 배부 이력 모달 확인 / 추가 / 수정 / 삭제 |

---

## 주요 기능

### 발주 항목 관리
- 품목명, 수량, 총 금액, 발주처, 발주 URL, 주문 URL, 옵션/스펙, 비고 입력
- 수량 + 총 금액 입력 시 **단가 자동 계산**
- 참고 이미지 업로드 (드래그앤드롭 지원, 10MB 이하)
- 이미지는 **Supabase Storage**에 저장, DB에는 URL만 보관
- 항목 추가 / 수정 / 삭제

### 지출결의서 복사
- 📋 **복사 버튼** 클릭 한 번으로 지출결의서에 맞는 텍스트 복사
- 이미지, 수량, 단가, 총액은 복사에서 제외
- 복사되는 항목: 품목명, 발주처, URL, 옵션, 배송 방식, 비고

### 배송 방식 선택
| 방식 | 설명 |
|------|------|
| 🏢 자사 배송 | 회사 주소로 배송 |
| 🚚 직배송 | 복사 시 배송지 주소 / 담당자명 / 연락처 빈 칸 포함 → 붙여넣기 후 직접 입력 |

### 발주내역 관리
- 각 카드 타이틀 우측 **📦 발주내역** 버튼 클릭으로 해당 품목의 발주 히스토리 확인
- **[재고현황]** 탭 최근 발주일 옆 **내역** 버튼으로도 동일한 발주내역 모달 접근 가능
- 발주내역 추가 항목: 발주일, 개수, 총금액, 단가(자동 계산), 발주 목적
- 발주내역 추가 / 수정 / 삭제
- 최근 발주일 기준 내림차순 정렬
- 발주내역이 있는 카드에는 **🕒 최근 발주일** 자동 표시

### 카테고리 분류 및 필터
- 항목마다 **대분류** (매장 / 호텔 / 병원 / 약국) + **소분류** (리플렛 / 와블러 / 봉투 / 스티커 / 배너 / POP / 기타) 지정
- 상단 필터 바에서 클릭 한 번으로 카테고리별 필터링
- 카드에 카테고리 뱃지 표시 (복사 시 제외)

### 다중 선택 복사
- 카드 좌상단 **체크박스**로 여러 항목 동시 선택
- 선택 시 하단에 선택 바 등장 → **📋 선택 항목 복사** 클릭
- 복사 시 번호 자동 부여 및 항목 간 구분선 삽입

### 팀 실시간 공유
- **Supabase** DB 연동으로 팀원 전원이 동일한 데이터 공유
- 누군가 항목을 추가/수정/삭제하면 **새로고침 없이 실시간 반영**

---

## 복사 텍스트 예시

```
1. 【 [자켓봉투] 공항웹 봉투 (실물영수증) 】

발주처 : 오프린트미
URL : https://www.ohprint.me/store/envelope/...

<옵션>
카테고리: 봉투 / 형태: 자켓형 / 사이즈: 소봉투

배송 방식 : 직배송
배송지 주소 :
담당자명 :
연락처 :

──────────────────────────────

2. 【 [리플랫] 공항환급 안내문 단면지 】

발주처 : 성원애드피아
URL : https://www.swadpia.co.kr/...

<옵션>
규격: 100*180mm / 용지: 스노우지 150g

배송 방식 : 자사 배송
```

---

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| Frontend | HTML, CSS, Vanilla JS |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| 이미지 저장 | Supabase Storage (`item-images` 버킷) |
| 실시간 동기화 | Supabase Realtime |
| 호스팅 | [Netlify](https://netlify.com) |

---

## 로컬 실행

별도 빌드 과정 없이 `index.html`을 브라우저에서 열면 되지만,  
Supabase 연결은 **배포 URL(Netlify)** 에서만 정상 동작합니다.

```bash
# 파일 구조
OrderForm/
├── index.html   # 메인 페이지
├── styles.css   # 스타일
├── app.js       # 기능 로직 (Supabase 연동)
└── README.md
```

---

## DB 스키마 (Supabase)

```sql
create table public.items (
  id            text primary key,
  name          text not null,
  qty           numeric,
  total         numeric,
  vendor        text not null,
  url           text default '',
  order_url     text default '',
  options       text default '',
  note          text default '',
  image         text default '',  -- Supabase Storage 공개 URL
  delivery_type text default 'own',
  created_at    timestamptz default now(),
  main_category text[] default '{}',
  sub_category  text[] default '{}'
);

create table public.order_history (
  id           text primary key,
  item_id      text references public.items(id) on delete cascade,
  order_date   date,
  quantity     numeric,
  total_amount numeric,
  unit_price   numeric,
  purpose      text default '',
  created_at   timestamptz default now()
);
```

### Storage 버킷

```sql
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true);

create policy "public read"   on storage.objects for select using (bucket_id = 'item-images');
create policy "public insert" on storage.objects for insert with check (bucket_id = 'item-images');
create policy "public update" on storage.objects for update using (bucket_id = 'item-images');
create policy "public delete" on storage.objects for delete using (bucket_id = 'item-images');
```

---

## 담당

- 개발 · 운영: 전략마케팅팀
