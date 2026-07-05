"""
수신동의(preferences) 페이지 recon 스크립트
- 로그인 후 https://www.adidas.co.kr/my-account/preferences 이동
- '광고성 정보 수신 동의(Email)' 체크박스 상태 파악
- 네트워크 요청(fetch/XHR) 가로채서 저장 API 분석
- (옵션) --apply 시 미동의면 체크 + 수신동의 버튼 클릭까지 수행하여 저장 요청 캡처

사용법:
  python recon_preferences.py <email> <password>            # 조사만(상태/DOM 덤프)
  python recon_preferences.py <email> <password> --apply    # 미동의면 동의 처리까지 수행
"""
import sys
import time
import json

PREF_URL = "https://www.adidas.co.kr/my-account/preferences"

INTERCEPT_JS = r"""
window.__net = [];
(function(){
  if (window.__netHooked) return; window.__netHooked = true;
  const of = window.fetch;
  window.fetch = function(){
    try { window.__net.push({type:'fetch', url:''+arguments[0], method:(arguments[1]&&arguments[1].method)||'GET', body:(arguments[1]&&arguments[1].body)||null}); } catch(e){}
    return of.apply(this, arguments);
  };
  const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m,u){ this.__m=m; this.__u=u; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){ try{ window.__net.push({type:'xhr', url:this.__u, method:this.__m, body:b||null}); }catch(e){} return os.apply(this, arguments); };
})();
"""

# 동의 관련 후보 요소 덤프 JS
DUMP_JS = r"""
function txt(el){ return (el.innerText||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80); }
const out = {checkboxes:[], switches:[], buttons:[], labels:[]};
document.querySelectorAll('input[type=checkbox]').forEach((el,i)=>{
  out.checkboxes.push({i, id:el.id||'', name:el.name||'', checked:el.checked, ariaLabel:el.getAttribute('aria-label')||'', dataAutoId:el.getAttribute('data-auto-id')||'', nearby: txt(el.closest('label')||el.parentElement||el)});
});
document.querySelectorAll('[role=switch],[role=checkbox]').forEach((el,i)=>{
  out.switches.push({i, role:el.getAttribute('role'), ariaChecked:el.getAttribute('aria-checked'), id:el.id||'', dataAutoId:el.getAttribute('data-auto-id')||'', ariaLabel:el.getAttribute('aria-label')||'', nearby: txt(el.closest('label')||el.parentElement||el)});
});
document.querySelectorAll('button').forEach((el,i)=>{
  const t = txt(el);
  if (t && (t.includes('동의') || t.includes('저장') || t.includes('수신') || t.toLowerCase().includes('save') || t.toLowerCase().includes('submit'))) {
    out.buttons.push({i, text:t, dataAutoId:el.getAttribute('data-auto-id')||'', type:el.getAttribute('type')||''});
  }
});
document.querySelectorAll('label,span,p,h2,h3').forEach(el=>{
  const t = txt(el);
  if (t && (t.includes('광고성') || t.includes('수신 동의') || (t.includes('Email')&&t.includes('동의')))) out.labels.push(t);
});
out.labels = [...new Set(out.labels)].slice(0,15);
return out;
"""


def login(email, password):
    import undetected_chromedriver as uc
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import NoSuchElementException

    options = uc.ChromeOptions()
    options.add_argument('--window-size=1280,950')
    options.add_argument('--lang=ko-KR')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--no-first-run')
    options.add_argument('--no-default-browser-check')
    options.add_argument('--disable-popup-blocking')
    options.add_argument('--log-level=3')
    driver = uc.Chrome(options=options, use_subprocess=True)
    time.sleep(2)
    driver.implicitly_wait(10)

    print("[로그인] 로그인 페이지 이동")
    driver.get("https://www.adidas.co.kr/account-login")
    time.sleep(3)
    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]'))
    )
    driver.implicitly_wait(0)
    for sel in ['#glass-gdpr-default-consent-accept-button', 'button[data-auto-id="consent-modal-accept-btn"]', '#onetrust-accept-btn-handler']:
        try:
            b = driver.find_element(By.CSS_SELECTOR, sel)
            if b.is_displayed():
                b.click(); time.sleep(1); break
        except NoSuchElementException:
            continue
    driver.implicitly_wait(10)

    email_el = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.CSS_SELECTOR, 'input[name="email"], input[type="email"]')))
    pw_el = driver.find_element(By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
    js_set = """
        const el=arguments[0],val=arguments[1];const proto=Object.getPrototypeOf(el);
        const setter=Object.getOwnPropertyDescriptor(proto,'value').set;setter.call(el,val);
        el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));
    """
    driver.execute_script(js_set, email_el, email); time.sleep(0.3)
    driver.execute_script(js_set, pw_el, password); time.sleep(0.3)
    btn = driver.find_element(By.CSS_SELECTOR, 'button[type="submit"], #login-submit-button')
    try: btn.click()
    except Exception: driver.execute_script("arguments[0].click();", btn)

    # 토큰 대기
    start = time.time(); token = None
    while time.time() - start < 25:
        try:
            for c in driver.get_cookies():
                if c['name'] == 'account.grant.accessToken':
                    token = c['value']; break
        except Exception: pass
        if token: break
        time.sleep(0.5)
    print(f"[로그인] 토큰 {'획득' if token else '실패'}")
    return driver, token


def main():
    if len(sys.argv) < 3:
        print("사용법: python recon_preferences.py <email> <password> [--apply]")
        sys.exit(1)
    email, password = sys.argv[1], sys.argv[2]
    do_apply = '--apply' in sys.argv

    driver = None
    try:
        driver, token = login(email, password)
        if not token:
            print("[중단] 로그인 실패")
            return

        print(f"\n[이동] {PREF_URL}")
        driver.get(PREF_URL)
        time.sleep(5)
        print(f"[현재 URL] {driver.current_url}")

        # 네트워크 후킹 (이후 저장요청 캡처용)
        driver.execute_script(INTERCEPT_JS)

        dump = driver.execute_script(DUMP_JS)
        print("\n===== DOM 덤프 =====")
        print(json.dumps(dump, ensure_ascii=False, indent=1))

        # 이메일 동의 체크박스 찾기 헬퍼 (name^=doc-mrkt-email-optin 우선, 없으면 텍스트)
        FIND_EMAIL_CB = r"""
          let t = document.querySelector('input[name^="doc-mrkt-email-optin"]');
          if (!t){
            for (const el of document.querySelectorAll('input[type=checkbox]')){
              const ctx=(el.closest('label')||el.parentElement||el).innerText||'';
              if (ctx.includes('Email')&&ctx.includes('광고성')){ t=el; break; }
            }
          }
          return t;
        """
        def email_state():
            return driver.execute_script(FIND_EMAIL_CB + "\nreturn arguments && false;") if False else driver.execute_script(
                "const t=(function(){%s})(); return t? (t.checked===true):null;" % FIND_EMAIL_CB)

        def flip_and_save(target_checked):
            # 현재상태가 target과 다르면 클릭하여 변경 후 저장버튼 탐색/클릭
            res = driver.execute_script(r"""
              const want = arguments[0];
              const t = (function(){%s})();
              if(!t) return {found:false};
              const cur = t.checked===true;
              if (cur!==want){ (t.closest('label')||t).click(); }
              return {found:true, before:cur, want:want};
            """ % FIND_EMAIL_CB, target_checked)
            time.sleep(1.2)
            # 변경 후 나타나는 버튼 전체 덤프
            btns = driver.execute_script(r"""
              function txt(el){ return (el.innerText||el.textContent||'').trim().replace(/\s+/g,' '); }
              return [...document.querySelectorAll('button')].map((b,i)=>({i,text:txt(b),dataAutoId:b.getAttribute('data-auto-id')||'',disabled:b.disabled})).filter(b=>b.text);
            """)
            # 저장/동의 버튼 클릭 시도
            clicked = driver.execute_script(r"""
              function txt(el){ return (el.innerText||el.textContent||'').trim(); }
              for (const b of document.querySelectorAll('button')){
                const t=txt(b);
                if (b.disabled) continue;
                if (t.includes('수신동의')||t.includes('수신 동의')||t.includes('동의 ')||t==='동의'||t.includes('저장')||t.includes('적용')||t.includes('확인')||t.toLowerCase().includes('save')||t.toLowerCase().includes('submit')){
                  b.click(); return {clicked:true, text:t};
                }
              }
              return {clicked:false};
            """)
            time.sleep(4)
            return res, btns, clicked

        if do_apply:
            print("\n===== --apply: 저장 API/버튼 캡처 (해제→저장→재체크→저장 원복) =====")
            print("현재 이메일 동의 상태:", email_state())

            print("\n-- 1) 체크 해제 + 저장 --")
            r1, b1, c1 = flip_and_save(False)
            print("flip:", json.dumps(r1, ensure_ascii=False))
            print("버튼 목록:", json.dumps(b1, ensure_ascii=False)[:800])
            print("클릭:", json.dumps(c1, ensure_ascii=False))
            print("상태(해제후):", email_state())

            print("\n-- 2) 재체크 + 저장 (원복, 실제 '동의' 경로) --")
            r2, b2, c2 = flip_and_save(True)
            print("flip:", json.dumps(r2, ensure_ascii=False))
            print("버튼 목록:", json.dumps(b2, ensure_ascii=False)[:800])
            print("클릭:", json.dumps(c2, ensure_ascii=False))
            print("상태(재체크후):", email_state())

        # 캡처된 네트워크 출력 (쓰기요청 우선 + 키워드)
        net = driver.execute_script("return window.__net || [];")
        print("\n===== 캡처된 네트워크 요청 (쓰기/관련) =====")
        seen = set()
        for r in net:
            u = r.get('url', ''); m = (r.get('method') or 'GET').upper()
            key = m + ' ' + u
            if key in seen: continue
            is_write = m in ('POST', 'PUT', 'PATCH', 'DELETE')
            is_rel = any(k in u for k in ['preference', 'consent', 'subscription', 'mrkt', 'optin', 'opt-in', 'marketing', 'gw-api', '/api/account', 'profile', 'communication', 'data-capture', 'datacapture'])
            if is_write or is_rel:
                seen.add(key)
                print(json.dumps(r, ensure_ascii=False)[:700])

        print("\n[완료] 5초 후 종료")
        time.sleep(5)
    finally:
        try:
            if driver: driver.quit()
        except Exception: pass


if __name__ == '__main__':
    main()
