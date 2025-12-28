/**
 * 아디다스 쿠폰 관리자 - 사용자 가이드 모듈
 */

function showGuideModal() {
    state.modal = { type: 'guide' };
    render();
}

function getGuideContent() {
    return `
        <div class="guide-content">
            <h2>아디다스 쿠폰 관리 프로그램 사용자 가이드</h2>
            <p class="guide-version">버전: v${APP_VERSION}</p>

            <div class="guide-toc">
                <h3>목차</h3>
                <ul>
                    <li><a href="#guide-install">1. 설치</a></li>
                    <li><a href="#guide-mode">2. 사용 모드 선택</a></li>
                    <li><a href="#guide-account">3. 계정 등록</a></li>
                    <li><a href="#guide-extract">4. 정보 조회</a></li>
                    <li><a href="#guide-coupon">5. 쿠폰 발급</a></li>
                    <li><a href="#guide-barcode">6. 바코드 다운로드</a></li>
                    <li><a href="#guide-filter">7. 필터링</a></li>
                    <li><a href="#guide-stats">8. 통계</a></li>
                </ul>
            </div>

            <hr>

            <section id="guide-install">
                <h3>1. 설치</h3>
                <h4>1.1 웹크롤러 설치</h4>
                <p>프로그램 첫 실행 시 웹크롤러 설치가 필요합니다.</p>
                <ol>
                    <li>우측 상단의 <strong>⚙ 버튼</strong>을 클릭합니다.</li>
                    <li><strong>"웹크롤러 프로그램"</strong> 옆의 <strong>[설치]</strong> 버튼을 클릭합니다.</li>
                    <li>설치가 완료되면 버튼이 <strong>[설치 완료]</strong>로 변경됩니다.</li>
                </ol>
                <div class="guide-tip">
                    <strong>💡 팁:</strong> Chrome 브라우저가 설치되어 있어야 합니다.
                </div>
            </section>

            <hr>

            <section id="guide-mode">
                <h3>2. 사용 모드 선택</h3>
                <p>사용 목적에 맞는 모드를 선택하세요.</p>
                <table class="guide-table">
                    <tr><th>모드</th><th>설명</th><th>상태</th></tr>
                    <tr><td>웹 브라우저</td><td>PC Chrome을 이용한 자동화</td><td>✅ 지원</td></tr>
                    <tr><td>모바일</td><td>안드로이드 기기 연결 자동화</td><td>✅ 지원</td></tr>
                    <tr><td>웹+모바일</td><td>웹 실패 시 모바일로 재시도</td><td>✅ 지원</td></tr>
                </table>
            </section>

            <hr>

            <section id="guide-account">
                <h3>3. 계정 등록</h3>
                <h4>3.1 단일 계정 등록</h4>
                <ol>
                    <li>좌측 하단의 <strong>[+ 계정 추가]</strong> 버튼을 클릭합니다.</li>
                    <li>이메일과 비밀번호를 입력합니다.</li>
                    <li><strong>[저장]</strong> 버튼을 클릭합니다.</li>
                </ol>

                <h4>3.2 일괄 계정 등록</h4>
                <ol>
                    <li>좌측 하단의 <strong>[📋 일괄 등록]</strong> 버튼을 클릭합니다.</li>
                    <li>텍스트 영역에 계정 정보를 입력합니다.</li>
                    <li>형식: <code>이메일:비밀번호</code> (한 줄에 하나씩)</li>
                </ol>
                <pre class="guide-code">user1@example.com:password1
user2@example.com:password2</pre>
            </section>

            <hr>

            <section id="guide-extract">
                <h3>4. 정보 조회</h3>
                <p>계정의 포인트, 쿠폰, 바코드 등의 정보를 조회합니다.</p>

                <h4>4.1 단일 조회</h4>
                <ol>
                    <li>조회할 계정의 행에서 <strong>[정보 조회]</strong> 버튼을 클릭합니다.</li>
                    <li>Chrome 브라우저가 자동으로 열리고 로그인이 진행됩니다.</li>
                    <li>조회가 완료되면 테이블에 정보가 업데이트됩니다.</li>
                </ol>

                <h4>4.2 일괄 조회</h4>
                <ol>
                    <li>조회할 계정들의 <strong>체크박스</strong>를 선택합니다.</li>
                    <li>상단의 <strong>[📊 선택 정보조회]</strong> 버튼을 클릭합니다.</li>
                    <li>선택한 계정들이 순차적으로 조회됩니다.</li>
                </ol>

                <div class="guide-warning">
                    <strong>⚠️ 주의:</strong> 일괄 조회 시 계정당 약 15~30초 소요됩니다. 조회 중에는 Chrome 창을 닫지 마세요.
                </div>
            </section>

            <hr>

            <section id="guide-coupon">
                <h3>5. 쿠폰 발급</h3>
                <p>적립된 포인트로 쿠폰을 발급합니다.</p>

                <h4>쿠폰 종류</h4>
                <table class="guide-table">
                    <tr><th>쿠폰</th><th>필요 포인트</th><th>설명</th></tr>
                    <tr><td>네이버페이 5천원</td><td>5,000P</td><td>네이버페이 포인트 전환</td></tr>
                    <tr><td>스타벅스 5천원</td><td>5,000P</td><td>스타벅스 기프티콘</td></tr>
                    <tr><td>10만원 쿠폰</td><td>100,000P</td><td>아디다스 매장 사용</td></tr>
                </table>

                <h4>단일/일괄 발급</h4>
                <ul>
                    <li><strong>단일:</strong> 계정 행의 [쿠폰 발급] 버튼 클릭</li>
                    <li><strong>일괄:</strong> 계정 선택 후 상단의 [🎁 선택 쿠폰발급] 버튼 클릭</li>
                </ul>
            </section>

            <hr>

            <section id="guide-barcode">
                <h3>6. 바코드 다운로드</h3>
                <p>계정의 멤버십 바코드 이미지를 다운로드합니다.</p>
                <ul>
                    <li><strong>단일:</strong> 바코드 열의 다운로드 아이콘 클릭</li>
                    <li><strong>일괄:</strong> 계정 선택 후 상단의 [📥 바코드 다운로드] 버튼 클릭</li>
                </ul>
            </section>

            <hr>

            <section id="guide-filter">
                <h3>7. 필터링</h3>
                <p>다양한 조건으로 계정을 필터링할 수 있습니다.</p>
                <table class="guide-table">
                    <tr><th>필터</th><th>설명</th></tr>
                    <tr><td>포인트 범위</td><td>최소~최대 포인트 지정</td></tr>
                    <tr><td>생일 월</td><td>특정 월에 생일인 계정</td></tr>
                    <tr><td>쿠폰 종류</td><td>특정 쿠폰 보유 계정</td></tr>
                    <tr><td>쿠폰 유무</td><td>쿠폰 있음/없음</td></tr>
                    <tr><td>계정 상태</td><td>활성/비활성</td></tr>
                    <tr><td>조회 상태</td><td>조회완료/대기중/오류 등</td></tr>
                </table>
                <p>테이블 상단의 <strong>[🔍 필터]</strong> 버튼으로 필터 패널을 열 수 있습니다.</p>
            </section>

            <hr>

            <section id="guide-stats">
                <h3>8. 통계</h3>
                <p>상단 통계 카드에서 계정 현황을 한눈에 확인할 수 있습니다.</p>
                <table class="guide-table">
                    <tr><th>통계 카드</th><th>설명</th></tr>
                    <tr><td>계정</td><td>활성/전체 계정 수</td></tr>
                    <tr><td>만료 예정 쿠폰</td><td>7일 이내 만료 쿠폰 보유 계정 (클릭시 필터)</td></tr>
                    <tr><td>10만원 쿠폰</td><td>10만원 쿠폰 보유 계정 (클릭시 필터)</td></tr>
                    <tr><td>총 포인트</td><td>모든 계정의 포인트 합계</td></tr>
                </table>
                <div class="guide-tip">
                    <strong>💡 팁:</strong> 통계 카드를 클릭하면 해당 조건으로 자동 필터링됩니다.
                </div>
            </section>

            <hr>

            <section>
                <h3>단축키</h3>
                <table class="guide-table">
                    <tr><th>단축키</th><th>기능</th></tr>
                    <tr><td><code>Ctrl + A</code></td><td>전체 계정 선택</td></tr>
                    <tr><td><code>Esc</code></td><td>모달 닫기</td></tr>
                    <tr><td><code>F5</code></td><td>계정 목록 새로고침</td></tr>
                </table>
            </section>
        </div>
    `;
}
