# Son Lab 겨울 우체국

연구실 구성원이 한 그루의 전나무에 카드, 사진, 분자 전구를 걸고 답장을 주고받는 GitHub Pages 사이트다. 구경은 공개다. 글을 쓰고 이미지를 올릴 때는 연구실 Google 그룹에 직접 가입한 계정으로 로그인한다.

## 들어 있는 파일

| 경로 | 용도 |
| --- | --- |
| `docs/index.html`, `docs/style.css` | 트리, 작업대, 장식 목록, 별 편지, 모바일 화면 |
| `docs/assets/` | 트리 일러스트, 꼭대기 별, 빨간 장갑, 연구실 이니셜 원본, 리본 솔방울 |
| `docs/js/` | 사진 자르기·누끼, 분자 렌더링, 가지에 배치하기, 로그인, 공동 저장소 호출 |
| `docs/config.js` | 공개 웹 클라이언트 ID와 Apps Script 웹 앱 주소를 입력하는 곳 |
| `docs/connection.html` | 실제 배포 주소에서 공개 GET, POST, Sheets 조회를 각각 확인하는 페이지 |
| `apps-script/` | Google Apps Script V8용 서버 코드 세 파일과 권한을 명시한 매니페스트 |
| `tests/` | Node.js 기본 모듈로 실행하는 공동 저장·권한 회귀 테스트 |

정적 파일은 빌드할 필요가 없다. 아래 순서대로 진행하면 `docs/config.js` 두 값만 수정해 저장소에 올릴 수 있다. ZIP을 쓰면 최상위 `sonlab-winter-post` 안의 `docs`, `apps-script`, `tests`, `README.md`, `.gitignore`가 저장소 루트에 오도록 풀어준다.

## 1. Google 로그인용 웹 클라이언트 만들기

1. 트리를 운영할 Google Cloud 프로젝트의 **Google Auth Platform**에서 Branding과 Audience를 설정한다. 그룹에 다른 기관이나 개인 Google 계정이 있으면 그 계정들이 로그인 가능한 Audience인지 확인한다. 외부 앱이 테스트 상태이면 참여할 계정을 테스트 사용자로 추가한다.
2. **Clients → Create client → Web application**을 선택한다. **Authorized JavaScript origins**에는 Pages의 프로토콜과 호스트만 넣는다. 예를 들어 트리가 `https://YOUR-ORG.github.io/winter-post/`라면 등록값은 `https://YOUR-ORG.github.io`다. 독립 도메인을 쓰면 실제 접속하는 origin을 등록한다. 로컬 개발이 필요하면 `http://localhost`와 `http://localhost:8000`도 등록한다.
3. 발급받은 **Client ID**를 보관한다. 프런트엔드는 Google 로그인 버튼의 자바스크립트 콜백으로 ID 토큰을 받는다. 이 구현에 클라이언트 보안 비밀번호나 리디렉션 URI 입력은 필요하지 않다.

[Google 로그인 클라이언트 설정](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) · [Google 로그인 버튼](https://developers.google.com/identity/gsi/web/reference/js-reference)

## 2. 비공개 Drive와 Sheets 준비하기

1. 그룹 구성원 목록을 열람할 수 있고 개인용 **내 드라이브**에 파일을 만들 수 있는 운영 계정으로 [Apps Script](https://script.google.com/home)에 새 독립형 프로젝트를 만든다.
2. 편집기에 `Api.gs`, `Auth.gs`, `Storage.gs`를 같은 이름의 스크립트 파일로 추가한다. 기본 `Code.gs`를 `Api.gs`로 바꾸어도 된다. 세 파일은 같은 프로젝트에 둔다.
3. **프로젝트 설정 → 편집기에 ‘appsscript.json’ 매니페스트 파일 표시**를 켠다. 매니페스트를 저장소의 `apps-script/appsscript.json` 내용으로 바꾼다.
4. **프로젝트 설정 → 스크립트 속성**에 다음 값을 추가한다. Google `sub`는 긴 문자열이므로 그대로 복사한다.

| 속성 | 넣을 값 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | 1단계의 웹 클라이언트 ID |
| `GROUP_EMAIL` | 실제 연구실 Google 그룹 이메일 |
| `PROFESSOR_SUB` | 별 편지 작성 계정의 Google 고유 ID. 첫 로그인 후 등록 가능 |
| `ADMIN_SUBS` | 타인 글을 삭제할 운영 계정의 고유 ID. 여러 개는 쉼표로 구분. 운영자를 지정하지 않을 때는 비워둔다. |

5. 편집기 상단에서 **setupTree → 실행**을 선택하고 운영 계정으로 권한을 승인한다. 전용 상위 폴더, `ornaments` 이미지 폴더, 데이터 스프레드시트가 만들어진다. `ROOT_FOLDER_ID`, `IMAGE_FOLDER_ID`, `SPREADSHEET_ID`는 자동으로 스크립트 속성에 기록된다. 같은 프로젝트에서 다시 실행하면 기존 자원을 사용한다.
6. 내 드라이브에서 새 폴더와 시트의 공유 설정이 **제한됨**인지 확인한다. Apps Script 프로젝트 편집자는 운영자만 둔다. 일일 정리 작업은 중간에 끊긴 업로드에서 남은 파일을 휴지통으로 옮긴다.

**교수님과 운영자 ID를 확인하는 방법**은 배포 후 본인의 계정으로 트리에서 장식 만들기를 눌러 로그인하고, 창을 닫고 상단의 **내 계정 또는 닉네임 · 계정 → 내 Google 계정 ID**를 여는 것이다. 해당 계정의 ID를 운영자에게 비공개로 전달해 스크립트 속성에 넣은 뒤 새로고침하거나 다시 로그인한다. 교수님 서명은 **손창윤 교수님**으로 표시된다. 교수님과 운영자도 쓰기 시 연구실 그룹의 직접 구성원이어야 한다.

[Apps Script 웹 앱 실행 권한](https://developers.google.com/apps-script/guides/web) · [Google 그룹 구성원 확인](https://developers.google.com/apps-script/reference/groups/group#hasuseremail) · [그룹 역할](https://developers.google.com/apps-script/reference/groups/role)

## 3. Apps Script 웹 앱 배포하기

1. **배포 → 새 배포 → 유형 선택 → 웹 앱**을 선택한다.
2. **실행 사용자**를 배포자인 **나**로, **액세스 권한**을 로그인하지 않은 방문자도 포함하는 **모든 사용자**로 지정하고 배포한다. Workspace 정책 때문에 익명 공개 옵션이 없으면 해당 계정에서는 기획한 공개 읽기를 확인할 수 없다. 폴더나 시트의 공유 범위를 넓혀도 웹 앱의 접근 정책은 바뀌지 않는다.
3. `https://script.google.com/macros/s/…/exec`로 끝나는 **웹 앱 URL**을 복사한다. 로그아웃한 시크릿 창에서 열어 `"ok":true`와 `ornaments`, `replies`, `star`가 들어 있는 응답을 확인한다. 테스트 배포 주소인 `/dev`는 편집자 전용이다.
4. 나중에 서버 코드를 고쳤다면 **배포 → 배포 관리 → 편집 → 새 버전 → 배포**로 기존 웹 앱을 갱신한다.

[웹 앱 배포 및 테스트](https://developers.google.com/apps-script/guides/web) · [웹 앱의 공개 범위](https://developers.google.com/apps-script/manifest/web-app-api-executable)

## 4. GitHub Pages 연결하기

1. `docs/config.js`의 `googleClientId`에는 웹 클라이언트 ID, `apiUrl`에는 위의 `/exec` 주소를 넣는다. ID 앞뒤 공백이나 URL 마지막 슬래시는 제거한다. 실제 그룹 주소, 관리자·교수님 ID, 메일, 토큰은 스크립트 속성에서만 관리한다.
2. 파일들을 저장소의 `main` 브랜치에 올린다. **Settings → Pages → Source → Deploy from a branch → main → /docs → Save**를 고른다. 기본 브랜치 이름이 다르면 실제 브랜치를 고른다. 상대경로를 사용하므로 프로젝트 저장소의 하위 경로에서도 작동한다.
3. Pages가 알려준 사이트 주소 뒤에 `connection.html`을 붙여 **연결 확인**을 누른다. 같은 브라우저에서 공개 GET, 인증 정보 없는 POST, 공동 트리 읽기 세 줄에 **성공**이 표시되어야 한다.
4. 트리를 새로고침하고 별과 장식을 열어본다. 빈 트리로 시작하며 다른 브라우저에서 올라온 내용은 작업대의 **↻ 공동 트리 새로고침**으로 가져온다.

Apps Script의 Content Service는 응답을 `script.googleusercontent.com`으로 리디렉션한다. 이 앱은 리디렉션을 따르고 로그인 토큰을 `text/plain` POST 본문에 담는다. 브라우저 쿠키나 사용자 지정 HTTP 헤더를 보내지 않는다. 공개 GET만 성공한다면 실제 사이트에서 POST 결과를 읽을 수 있는지, 배포 권한·Workspace 정책·프로덕션 URL이 맞는지 확인한다. 성공 응답을 읽은 뒤에야 장식이 확정된다. 응답이 끊겼을 때는 같은 작성 화면에서 재시도하면 서버가 요청 번호로 중복 생성을 막는다.

[GitHub Pages 게시 폴더 선택](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [Google Content Service의 리디렉션](https://developers.google.com/apps-script/guides/content#redirects)

## 장식과 데이터의 동작

- **장식과 답장**은 누구나 읽을 수 있다. 그룹 구성원은 만들기·답장 달기를 처음 누를 때 Google 로그인과 표시할 닉네임을 입력한다. 닉네임과 답장 태그 표시 설정은 해당 브라우저가 기억한다. Google ID 토큰은 탭의 메모리에만 둔다.
- **메시지 카드**는 본문과 봉투 색을 저장하고 각 브라우저가 봉투를 그린다. **사진**은 기존 기본 이미지나 업로드한 사진으로 원형 볼 또는 투명 누끼 키링을 만든다. **분자 전구**는 +z에서 본 XY 투영이며, 고분자는 모노머의 마지막 원자와 다음 모노머의 첫 원자를 잇는다. 탄소는 가지에 묻히지 않도록 밝은 연보라색과 같은 계열의 후광을 사용한다.
- **사진 원본·XYZ 좌표**는 기기에 남고, 완성한 PNG·WebP 장식만 Drive로 올라간다. 트리에 게시한 사진과 메시지는 방문자가 열거나 보관할 수 있다. 민감한 연구 데이터를 게시할 때는 공개되는 완성 이미지에 포함되는 내용을 확인한다.
- **소유권**은 서버가 검증한 Google `sub`로 기록한다. 같은 닉네임을 쓰는 다른 계정은 남의 장식을 옮기거나 수정·삭제할 수 없다. 관리자는 다른 사람의 장식·답장을 삭제할 수 있다. 별 편지의 작성·수정·삭제는 교수님 계정에만 허용한다.
- **장식을 내리면** 공개 트리와 이미지 조회에서 빠지고 이미지 파일은 휴지통으로 이동한다. 공개 트리에 내려간 장식의 답장이 있으면 예전처럼 **장식 목록 → 내려간 장식의 답장**에서 계속 읽는다. 각 답장은 작성자가 수정·삭제할 수 있다. 별 편지의 본문을 지워도 별은 꼭대기에 남는다.
- **기존 로컬 시안**에 걸어둔 장식은 개인 브라우저에 남는다. 이 배포판은 빈 공유 트리로 시작한다. 시안에서 썼던 닉네임을 실계정 소유권에 자동 대응시키지 않는다.

### 서버가 보관하는 정보

시트 탭은 `Ornaments`, `Replies`, `Settings`다. 각 행에 레코드 ID, 비공개 작성자 키, 생성·마지막 요청 번호, 상태, 이미지 파일 ID, 표시용 JSON을 따로 둔다. 긴 Google 계정 번호는 `google:` 접두사가 붙은 문자열로 저장한다. 메시지는 JSON 셀 안에 두어 수식으로 해석되지 않는다. 공개 조회는 활동 중인 레코드의 표시용 필드만 반환한다. 이미지는 장식 ID로 찾아 활성 레코드, 파일 이름과 전용 폴더를 확인한다.

Google 서명을 공개 키로 검증하고 발급자, 클라이언트 ID, 만료 및 이메일 확인 상태를 검사한다. 매 쓰기 요청에서 직접 가입과 활성 역할을 확인한다. Google이 현재 이메일 소유권을 보증하는 Gmail 및 Workspace 계정은 바로 참여할 수 있다. 그 밖의 제3자 메일 주소로 만든 Google 계정은 직접 구성원 확인 뒤 본인이 요청한 1회용 코드로 메일함을 추가 확인한다. 코드는 10분 동안 유효하며 메일 확인은 최대 1시간 또는 토큰 만료까지 유지된다. 중첩 그룹으로만 가입한 계정은 쓰기 대상에서 제외된다.

운영 기본값은 완성 이미지 2 MiB, 트리에 장식 250개, 남아 있는 답장 1,500개, 계정당 1분에 변경 20회다. 원본 사진 입력은 브라우저에서 10 MB, 단일 구조는 300원자까지 받는다. Drive 여유 용량과 Apps Script의 실행·메일·호출 할당량은 배포 계정에 따라 다르다.

[Google ID 토큰 검증과 이메일 소유권](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) · [Apps Script 할당량](https://developers.google.com/apps-script/guides/services/quotas)

## 검증하기

로컬에서는 저장소 루트에서 Node.js 20 이상으로 `node --test tests/*.test.cjs`를 실행한다. 별도 패키지 설치 없이 테스트용 RSA 키와 Google 서비스 대역을 사용해 권한·저장·정리 흐름을 검사한다. Pages 화면만 먼저 보려면 `python -m http.server 8000 --directory docs`를 실행해 `http://localhost:8000`을 연다. 설정 전 화면에는 **공동 트리 연결 전**이 표시된다.

실제 배포에서는 다음을 확인하면 된다.

| 계정 또는 상황 | 확인할 결과 |
| --- | --- |
| 시크릿 창에서 로그인 전 | 공동 트리와 별 편지를 자유롭게 열 수 있다. 장식 만들기는 로그인 창을 연다. |
| 연구실 구성원 A와 B | A가 사진을 걸면 B가 새로고침한 뒤 같은 가지의 사진을 본다. B의 답장이 A에게 보인다. Sheets에는 사진 원본 대신 파일 참조가 기록된다. |
| 같은 닉네임, 다른 계정 | 상대방의 이동·수정·삭제 메뉴가 보이지 않는다. 관리자 계정에는 타인 글 삭제만 추가된다. |
| 그룹 외부 계정 또는 탈퇴한 계정 | 기존 게시물은 읽을 수 있고 새 저장은 거절된다. 구성원 목록 자체를 조회할 수 없을 때에도 쓰기는 차단된다. |
| 교수님과 일반 구성원 | 교수님 계정에서 별을 수정한 뒤 일반 계정이 별을 눌러 읽는다. 일반 계정이 닉네임을 ‘손창윤 교수님’으로 바꾸어도 권한은 생기지 않는다. |
| 두 창에서 동시 수정 | 먼저 성공한 내용이 유지되고 이전 버전으로 작성한 창에는 다시 열라는 안내가 나온다. |
| 사진 삭제 후 | 시크릿 창에서 새로고침하면 사진이 사라진다. Drive에서 해당 파일의 휴지통 이동을 확인한다. |
