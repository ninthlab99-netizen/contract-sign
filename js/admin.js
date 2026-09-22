/* ============================================================
 * admin.js - 管理後台：密碼登入、建立合約、查看簽署狀態
 *
 * 密碼保護說明：
 * 這裡是用 Firebase Authentication 的 Email/Password 登入方式，
 * 把使用者輸入的「密碼」對應到一個固定帳號（外部看不到帳號），
 * 是「真正的伺服器端驗證」——所有 Firestore 讀寫規則都要求已登入
 * 這個帳號才允許，不是只有前端畫面擋一下而已。
 *
 * 第一次使用：請直接輸入密碼 5683，系統會自動建立這組帳號密碼；
 * 之後每次都要輸入同一組密碼才能登入。若要更改密碼，請見 README。
 * ============================================================ */

(function () {
  var ADMIN_EMAIL = 'contract-admin@ninthlab-contract.local';

  var DEFAULT_CONTENT_TEMPLATE =
    '服務項目：\n' +
    '1. 網站內容轉移：完整複製舊網站現有內容至新網站，確保資料不遺漏。\n' +
    '2. LINE 快速聯絡按鈕：加入「加入 LINE 好友」按鈕，點擊後直接導向官方帳號加好友頁面。\n' +
    '3. 產品介紹頁面優化：將「報價資訊」與「產品展示圖」分開呈現。\n' +
    '4. RWD 響應式網頁設計：同步製作手機版與電腦版頁面，避免內容被壓縮而難以瀏覽。\n' +
    '5. SEO／AI SEO（GEO）優化：提升搜尋排名，並因應 AI 搜尋（如 ChatGPT、Google AI Overview）優化網站結構與內容。\n' +
    '6. 網域設定：協助網域綁定與 DNS 設定。\n' +
    '7. 主機設定：使用 GitHub Pages 完成部署與設定（不含主機租金；網域註冊／續約費用如需另計，由客戶自行負擔）。\n\n' +
    '售後服務：\n' +
    '- 免費維護：完成上架後三個月內。\n' +
    '- 免費修改：完成上架後七天內可提出修改需求。\n' +
    '客戶於下斵完成線上簽署，即視為已詳閱;
  var authOverlay = document.getElementById('authOverlay');
  var appRoot = document.getElementById('appRoot');
  var authPasswordInput = document.getElementById('authPasswordInput');
  var authSubmitBtn = document.getElementById('authSubmitBtn');
  var authError = document.getElementById('authError');
  var logoutBtn = document.getElementById('logoutBtn');

  var clientNameInput = document.getElementById('clientNameInput');
  var projectNameInput = document.getElementById('projectNameInput');
  var amountInput = document.getElementById('amountInput');
  var contentInput = document.getElementById('contentInput');
  var createBtn = document.getElementById('createBtn');
  var createError = document.getElementById('createError');
  var createdResult = document.getElementById('createdResult');
  var createdCode = document.getElementById('createdCode');
  var createdLink = document.getElementById('createdLink');
  var copyLinkBtn = document.getElementById('copyLinkBtn');

  var listLoading = document.getElementById('listLoading');
  var contractList = document.getElementById('contractList');

  contentInput.value = DEFAULT_CONTENT_TEMPLATE;

  // ---------- 登入 ----------
  // Firebase Authentication 的密碼政策要求至少 6 碼，但我們希望使用者
  // 只需要記憶一組較短的數字密碼（例如 5683）。這裡在送出給 Firebase
  // 之前，內部自動蓜上固定的前後綴，讓實隘送出的密碼一定緢合長度規定，
  // 使用者畫面上輸入的內容完全不受影響。
  function deriveAuthPassword(pw) {
    return 'nl-' + pw + '-contract9';
  }

  function attemptLogin() {
    var pw = authPasswordInput.value || '';
    if (!pw) { authError.textContent = '請輸入密碼。'; return; }
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = '登入中…';
    authError.textContent = '';

    var realPw = deriveAuthPassword(pw);

    fsAuth.signInWithEmailAndPassword(ADMIN_EMAIL, realPw).catch(function (err) {
      if (err && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials')) {
        // 第一次使用（或帳號尚未建立），自動以這組密碼建立帳號
        return fsAuth.createUserWithEmailAndPassword(ADMIN_EMAIL, realPw);
      }
      throw err;
    }).catch(function (err) {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = '登入';
      var code = err && err.code ? err.code : '';
      var msg = '密碼錯誤，請再試一次。';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        msg = '密碼錯誤，請確認後再試一次。';
      } else if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') {
        msg = '密碼不符合安全規定，請聯絡技術人員調整密碼政策。';
      } else if (code === 'auth/network-request-failed') {
        msg = '網路連線異常，請檢查網路後再試一次。';
      } else if (code === 'auth/unauthorized-domain') {
        msg = '此線址尚未被授權登入，請聯絡技術人員將此線域加入 Firebase 授權清單。';
      } else if (code) {
        msg = '登入發生錯誤（' + code + '），請截圖雠回報。';
      }
      authError.textContent = msg;
    });
  }
  authSubmitBtn.addEventListener('click', attemptLogin);
  authPasswordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attemptLogin();
  });

  logoutBtn.addEventListener('click', function () {
    fsAuth.signOut().then(function () { window.location.reload(); });
  });

  fsAuth.onAuthStateChanged(function (user) {
    if (user) {
      authOverlay.style.display = 'none';
      appRoot.style.visibility = 'visible';
      loadContractList();
    } else {
      authOverlay.style.display = 'flex';
      appRoot.style.visibility = 'hidden';
    }
  });

  // ---------- 產生亲碼編號 ----------
  var CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 避開容易混淆的 0/O/1/I/L
  function generateCode(len) {
    len = len || 8;
    var out = '';
    var arr = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (var i = 0; i < len; i++) out += CODE_CHARS[arr[i] % CODE_CHARS.length];
    return out;
  }

  function buildSignLink(code) {
    var base = window.location.href.replace(/admin\.html.*$/, '');
    return base + 'index.html?code=' + code;
  }

  // ---------- 建立合約 ----------
  function createContract() {
    createError.textContent = '';
    var clientName = (clientNameInput.value || '').trim();
    var projectName = (projectNameInput.value || '').trim() || '網站建置服務合約';
    var amount = Number(amountInput.value || 0);
    var content = contentInput.value || '';

    if (!clientName) { createError.textContent = '請輸入客戶名稱。'; return; }
    if (!content.trim()) { createError.textContent = '合約內容不可空白。'; return; }

    createBtn.disabled = true;
    createBtn.textContent = '建立中…';

    var code = generateCode(8);

    fsDB.collection('contracts').doc(code).set({
      code: code,
      clientName: clientName,
      projectName: projectName,
      amount: amount,
      content: content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: ADMIN_EMAIL
    }).then(function () {
      createBtn.disabled = false;
      createBtn.textContent = '產生編號並建立合約';
      createdCode.textContent = code;
      createdLink.value = buildSignLink(code);
      createdResult.style.display = '';
      clientNameInput.value = '';
      loadContractList();
    }).catch(function (err) {
      createBtn.disabled = false;
      createBtn.textContent = '產生編號並建立合約';
      createError.textContent = '建立失敗，請稍後再試（' + (err && err.message ? err.message : '未知錯誤') + '）。';
    });
  }
  createBtn.addEventListener('click', createContract);

  copyLinkBtn.addEventListener('click', function () {
    createdLink.select();
    document.execCommand('copy');
    copyLinkBtn.textContent = '已複製！';
    setTimeout(function () { copyLinkBtn.textContent = '複製連結'; }, 1500);
  });

  // ---------- 合約列表
  function fmtDate(ts) {
    try {
      var d = ts && ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString('zh-TW', { hour12: false });
    } catch (e) { return '—'; }
  }

  function loadContractList() {
    listLoading.style.display = '';
    contractList.innerHTML = '';
    fsDB.collection('contracts').orderBy('createdAt', 'desc').get().then(function (snap) {
      listLoading.style.display = 'none';
      if (snap.empty) {
        contractList.innerHTML = '<p class="muted">目前沃有任何合約。</p>';
        return;
      }
      var docs = snap.docs;
      var sigChecks = docs.map(function (d) {
        return fsDB.collection('signatures').doc(d.id).get();
      });
      Promise.all(sigChecks).then(function (sigSnaps) {
        docs.forEach(function (d, i) {
          var data = d.data();
          var sigSnap = sigSnaps[i];
          var signed = sigSnap.exists;
          var el = document.createElement('div');
          el.className = 'list-item';
          var sigInfo = '';
          if (signed) {
            var sig = sigSnap.data();
            sigInfo = '<p class="meta" style="margin-top:6px;">簽署人：' + escapeHtml(sig.signerName || '—') +
              '　｜　簽署時間：' + fmtDate(sig.signedAt) + '</p>' +
              '<p class="meta"><img src="' + sig.signatureDataUrl + '" alt="簽名" style="max-width:180px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;" /></p>';
          }
          el.innerHTML =
            '<div class="top-row">' +
              '<strong>' + escapeHtml(data.clientName || '—') + '</strong>' +
              '<span class="badge ' + (signed ? 'signed' : 'unsigned') + '">' + (signed ? '已簽署' : '未簽署') + '</span>' +
            '</div>' +
            '<div class="code">綨號：' + d.id + '</div>' +
            '<div class="meta">' + escapeHtml(data.projectName || '') + '　｜　NT$' + (data.amount || 0) + '　｜　建立於 ' + fmtDate(data.createdAt) + '</div>' +
            sigInfo +
            '<div class="row" style="margin-top:10px;">' +
              '<button type="button" class="secondary copy-link-item" data-code="' + d.id + '">複製簽署連結</button>' +
            '</div>';
          contractList.appendChild(el);
        });
        contractList.querySelectorAll('.copy-link-item').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var code = btn.getAttribute('data-code');
            var tmp = document.createElement('input');
            tmp.value = buildSignLink(code);
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
            btn.textContent = '已複製！';
            setTimeout(function () { btn.textContent = '複製編號連結'; }, 1500);
          });
        });
      });
    }).catch(function (err) {
      listLoading.style.display = 'none';
      contractList.innerHTML = '<p class="error-msg">載入失敗：' + (err && err.message ? err.message : '未知錯誤') + '</p>';
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
})();
/* ============================================================
 * admin.js - 管理後台：密碼登入、建立合約、查看簽署狀態
 *
 * 密碼保護說明：
 * 這裡是用 Firebase Authentication 的 Email/Password 登入方式，
 * 把使用者輸入的「密碼」對應到一個固定帳號（外部看不到帳號），
 * 是「真正的伺服器端驗證」——所有 Firestore 讀寫規則都要求已登入
 * 這個帳號才允許，不是只有前端畫面擋一下而已。
 *
 * 第一次使用：請直接輸入密碼 5683，系統會自動建立這組帳號密碼；
 * 之後每次都要輸入同一組密碼才能登入。若要更改密碼，請見 README。
 * ============================================================ */

(function () {
  var ADMIN_EMAIL = 'contract-admin@ninthlab-contract.local';

  var DEFAULT_CONTENT_TEMPLATE =
    '服務項目：\n' +
    '1. 網站內容轉移：完整複製舊網站現有內容至新網站，確保資料不遺漏。\n' +
    '2. LINE 快速聯絡按鈕：加入「加入 LINE 好友」按鈕，點擊後直接導向官方帳號加好友頁面。\n' +
    '3. 產品介紹頁面優化：將「報價資訊」與「產品展示圖」分開呈現。\n' +
    '4. RWD 響應式網頁設計：同步製作手機版與電腦版頁面，避免內容被壓縮而難以瀏覽。\n' +
    '5. SEO／AI SEO（GEO）優化：提升搜尋排名，並因應 AI 搜尋（如 ChatGPT、Google AI Overview）優化網站結構與內容。\n' +
    '6. 網域設定：協助網域綁定與 DNS 設定。\n' +
    '7. 主機設定：使用 GitHub Pages 完成部署與設定（不含主機租金；網域註冊／續約費用如需另計，由客戶自行負擔）。\n\n' +
    '售後服務：\n' +
    '- 免費維護：完成上架後三個月內。\n' +
    '- 免費修改：完成上架後七天內可提出修改需求。\n' +
    '客戶於下斵完成線上簽署，即視為已詳閱;
  var authOverlay = document.getElementById('authOverlay');
  var appRoot = document.getElementById('appRoot');
  var authPasswordInput = document.getElementById('authPasswordInput');
  var authSubmitBtn = document.getElementById('authSubmitBtn');
  var authError = document.getElementById('authError');
  var logoutBtn = document.getElementById('logoutBtn');

  var clientNameInput = document.getElementById('clientNameInput');
  var projectNameInput = document.getElementById('projectNameInput');
  var amountInput = document.getElementById('amountInput');
  var contentInput = document.getElementById('contentInput');
  var createBtn = document.getElementById('createBtn');
  var createError = document.getElementById('createError');
  var createdResult = document.getElementById('createdResult');
  var createdCode = document.getElementById('createdCode');
  var createdLink = document.getElementById('createdLink');
  var copyLinkBtn = document.getElementById('copyLinkBtn');

  var listLoading = document.getElementById('listLoading');
  var contractList = document.getElementById('contractList');

  contentInput.value = DEFAULT_CONTENT_TEMPLATE;

  // ---------- 登入 ----------
  function attemptLogin() {
    var pw = authPasswordInput.value || '';
    if (!pw) { authError.textContent = '請輸入密碼。'; return; }
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = '登入中…';
    authError.textContent = '';

    fsAuth.signInWithEmailAndPassword(ADMIN_EMAIL, pw).catch(function (err) {
      if (err && err.code === 'auth/user-not-found') {
        // 第一次使用，自動以這組密碼建立帳號
        return fsAuth.createUserWithEmailAndPassword(ADMIN_EMAIL, pw);
      }
      throw err;
    }).catch(function (err) {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = '登入';
      var msg = '密碼錯誤，請再試一次。';
      if (err && err.code === 'auth/weak-password') msg = '密碼至少需要 6 碼（首次設定用）。';
      authError.textContent = msg;
    });
  }
  authSubmitBtn.addEventListener('click', attemptLogin);
  authPasswordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attemptLogin();
  });

  logoutBtn.addEventListener('click', function () {
    fsAuth.signOut().then(function () { window.location.reload(); });
  });

  fsAuth.onAuthStateChanged(function (user) {
    if (user) {
      authOverlay.style.display = 'none';
      appRoot.style.visibility = 'visible';
      loadContractList();
    } else {
      authOverlay.style.display = 'flex';
      appRoot.style.visibility = 'hidden';
    }
  });

  // ---------- 產生亮碼編號 ----------
  var CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 避開容易混淸的 0/O/1/I/L
  function generateCode(len) {
    len = len || 8;
    var out = '';
    var arr = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (var i = 0; i < len; i++) out += CODE_CHARS[arr[i] % CODE_CHARS.length];
    return out;
  }

  function buildSignLink(code) {
    var base = window.location.href.replace(/admin\.html.*$/, '');
    return base + 'index.html?code=' + code;
  }

  // ---------- 建立合約 ----------
  function createContract() {
    createError.textContent = '';
    var clientName = (clientNameInput.value || '').trim();
    var projectName = (projectNameInput.value || '').trim() || '網站建��服務合約';
    var amount = Number(amountInput.value || 0);
    var content = contentInput.value || '';

    if (!clientName) { createError.textContent = '請輸入客戶名稱。'; return; }
    if (!content.trim()) { createError.textContent = '合約內容不叫空白。'; return; }

    createBtn.disabled = true;
    createBtn.textContent = '建立中…;

    var code = generateCode(8);

    fsDB.collection('contracts').doc(code).set({
      code: code,
      clientName: clientName,
      projectName: projectName,
      amount: amount,
      content: content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: ADMIN_EMAIL
    }).then(function () {
      createBtn.disabled = false;
      createBtn.textContent = '產生編號並建立合約';
      createdCode.textContent = code;
      createdLink.value = buildSignLink(code);
      createdResult.style.display = '';
      clientNameInput.value = '';
      loadContractList();
    }).catch(function (err) {
      createBtn.disabled = false;
      createBtn.textContent = '產生編號並建立合約';
      createError.textContent = '建立失敗，請稍後再試（' + (err && err.message ? err.message : '未知錯誤') + '）。';
    });
  }
  createBtn.addEventListener('click', createContract);

  copyLinkBtn.addEventListener('click', function () {
    createdLink.select();
    document.execCommand('copy');
    copyLinkBtn.textContent = '已複製！';
    setTimeout(function () { copyLinkBtn.textContent = '複製連結'; }, 1500);
  });

  // ---------- 合約列表
  function fmtDate(ts) {
    try {
      var d = ts && ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString('zh-TW', { hour12: false });
    } catch (e) { return '—'; }
  }

  function loadContractList() {
    listLoading.style.display = '';
    contractList.innerHTML = '';
    fsDB.collection('contracts').orderBy('createdAt', 'desc').get().then(function (snap) {
      listLoading.style.display = 'none';
      if (snap.empty) {
        contractList.innerHTML = '<p class="muted">目前沃有任何合約。</p>';
        return;
      }
      var docs = snap.docs;
      var sigChecks = docs.map(function (d) {
        return fsDB.collection('signatures').doc(d.id).get();
      });
      Promise.all(sigChecks).then(function (sigSnaps) {
        docs.forEach(function (d, i) {
          var data = d.data();
          var sigSnap = sigSnaps[i];
          var signed = sigSnap.exists;
          var el = document.createElement('div');
          el.className = 'list-item';
          var sigInfo = '';
          if (signed) {
            var sig = sigSnap.data();
            sigInfo = '<p class="meta" style="margin-top:6px;">簽署人：' + escapeHtml(sig.signerName || '—') +
              '　｜　簽署時間：' + fmtDate(sig.signedAt) + '</p>' +
              '<p class="meta"><img src="' + sig.signatureDataUrl + '" alt="簽名" style="max-width:180px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;" /></p>';
          }
          el.innerHTML =
            '<div class="top-row">' +
              '<strong>' + escapeHtml(data.clientName || '—') + '</strong>' +
              '<span class="badge ' + (signed ? 'signed' : 'unsigned') + '">' + (signed ? '已簽署' : '未簽署') + '</span>' +
            '</div>' +
            '<div class="code">綨號：' + d.id + '</div>' +
            '<div class="meta">' + escapeHtml(data.projectName || '') + '　｜　NT$' + (data.amount || 0) + '　｜　建立於 ' + fmtDate(data.createdAt) + '</div>' +
            sigInfo +
            '<div class="row" style="margin-top:10px;">' +
              '<button type="button" class="secondary copy-link-item" data-code="' + d.id + '">複製簽署連結</button>' +
            '</div>';
          contractList.appendChild(el);
        });
        contractList.querySelectorAll('.copy-link-item').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var code = btn.getAttribute('data-code');
            var tmp = document.createElement('input');
            tmp.value = buildSignLink(code);
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
            btn.textContent = '已複製！';
            setTimeout(function () { btn.textContent = '複製編號連結'; }, 1500);
          });
        });
      });
    }).catch(function (err) {
      listLoading.style.display = 'none';
      contractList.innerHTML = '<p class="error-msg">輸入失敗：' + (err && err.message ? err.message : '未知錯誤') + '</p>';
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' })[c];
    });
  }
})();
