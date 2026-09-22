/* ============================================================
 * sign.js - 客戶端：輸入編號查詢合約並簽署
 * ============================================================ */

(function () {
  var lookupCard = document.getElementById('lookupCard');
  var contractCard = document.getElementById('contractCard');
  var successCard = document.getElementById('successCard');
  var codeInput = document.getElementById('codeInput');
  var lookupBtn = document.getElementById('lookupBtn');
  var lookupError = document.getElementById('lookupError');
  var contractTitle = document.getElementById('contractTitle');
  var contractMeta = document.getElementById('contractMeta');
  var contractContent = document.getElementById('contractContent');
  var signSection = document.getElementById('signSection');
  var signedNotice = document.getElementById('signedNotice');
  var signedInfo = document.getElementById('signedInfo');
  var signerNameInput = document.getElementById('signerNameInput');
  var agreeCheckbox = document.getElementById('agreeCheckbox');
  var submitSignBtn = document.getElementById('submitSignBtn');
  var signError = document.getElementById('signError');
  var clearSigBtn = document.getElementById('clearSigBtn');
  var printBtn = document.getElementById('printBtn');
  var printBtn2 = document.getElementById('printBtn2');

  var currentCode = null;

  function fmtDate(ts) {
    try {
      var d = ts && ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString('zh-TW', { hour12: false });
    } catch (e) { return ''; }
  }

  // ---------- 簽名板 ----------
  var canvas = document.getElementById('sigPad');
  var ctx = canvas.getContext('2d');
  var drawing = false;
  var hasSignature = false;

  function resizeCanvas() {
    var ratio = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2933';
  }
  window.addEventListener('resize', function () {
    var data = hasSignature ? canvas.toDataURL() : null;
    resizeCanvas();
    if (data) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio||1), canvas.height / (window.devicePixelRatio||1)); };
      img.src = data;
    }
  });

  function getPos(evt) {
    var rect = canvas.getBoundingClientRect();
    var x, y;
    if (evt.touches && evt.touches.length) {
      x = evt.touches[0].clientX - rect.left;
      y = evt.touches[0].clientY - rect.top;
    } else {
      x = evt.clientX - rect.left;
      y = evt.clientY - rect.top;
    }
    return { x: x, y: y };
  }

  function startDraw(evt) {
    drawing = true;
    hasSignature = true;
    var p = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    evt.preventDefault();
  }
  function moveDraw(evt) {
    if (!drawing) return;
    var p = getPos(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    evt.preventDefault();
  }
  function endDraw(evt) { drawing = false; }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', moveDraw, { passive: false });
  canvas.addEventListener('touchend', endDraw);

  clearSigBtn.addEventListener('click', function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
  });

  // ---------- 查詢合約 ----------
  function showError(el, msg) { el.textContent = msg || ''; }

  function loadContract(code) {
    showError(lookupError, '');
    lookupBtn.disabled = true;
    lookupBtn.textContent = '查詢中…';
    fsDB.collection('contracts').doc(code).get().then(function (snap) {
      lookupBtn.disabled = false;
      lookupBtn.textContent = '查詢合約';
      if (!snap.exists) {
        showError(lookupError, '找不到此合約，請確認編號是否正確。');
        return;
      }
      var data = snap.data();
      currentCode = code;
      renderContract(code, data);
    }).catch(function (err) {
      lookupBtn.disabled = false;
      lookupBtn.textContent = '查詢合約';
      showError(lookupError, '查詢失敗，請稍後再試（' + (err && err.message ? err.message : '未知錯誤') + '）。');
    });
  }

  function renderContract(code, data) {
    lookupCard.style.display = 'none';
    contractCard.style.display = '';
    contractTitle.textContent = (data.projectName || '網站建置服務合約');
    contractMeta.textContent = '客戶：' + (data.clientName || '—') + '　｜　合約編號：' + code;
    contractContent.textContent = data.content || '';

    // 檢查是否已簽署
    fsDB.collection('signatures').doc(code).get().then(function (sigSnap) {
      if (sigSnap.exists) {
        var sig = sigSnap.data();
        signSection.style.display = 'none';
        signedNotice.style.display = '';
        signedInfo.textContent = '簽署人：' + (sig.signerName || '—') + '　｜　簽署時間：' + fmtDate(sig.signedAt);
      } else {
        signSection.style.display = '';
        signedNotice.style.display = 'none';
        setTimeout(resizeCanvas, 0);
      }
    }).catch(function () {
      signSection.style.display = '';
      setTimeout(resizeCanvas, 0);
    });
  }

  lookupBtn.addEventListener('click', function () {
    var code = (codeInput.value || '').trim().toUpperCase();
    if (!code) { showError(lookupError, '請輸入合約編號。'); return; }
    loadContract(code);
  });
  codeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') lookupBtn.click();
  });

  // ---------- 送出簽署 ----------
  submitSignBtn.addEventListener('click', function () {
    showError(signError, '');
    var name = (signerNameInput.value || '').trim();
    if (!name) { showError(signError, '請輸入簽署人姓名。'); return; }
    if (!hasSignature) { showError(signError, '請在簽名區手寫簽名。'); return; }
    if (!agreeCheckbox.checked) { showError(signError, '請勾選「已詳閱並合意」。'); return; }

    submitSignBtn.disabled = true;
    submitSignBtn.textContent = '送出中…';

    var signatureDataUrl = canvas.toDataURL('image/png');

    fsDB.collection('signatures').doc(currentCode).set({
      code: currentCode,
      signerName: name,
      signatureDataUrl: signatureDataUrl,
      signedAt: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent
    }).then(function () {
      contractCard.style.display = 'none';
      successCard.style.display = '';
      window.scrollTo(0, 0);
    }).catch(function (err) {
      submitSignBtn.disabled = false;
      submitSignBtn.textContent = '確認簽署';
      showError(signError, '送出失敗，請稍後再試（' + (err && err.message ? err.message : '未知錯誤') + '）。');
    });
  });

  printBtn.addEventListener('click', function () { window.print(); });
  printBtn2.addEventListener('click', function () { window.print(); });

  // ---------- 網址帶編號自動查詢 ----------
  var params = new URLSearchParams(window.location.search);
  var codeFromUrl = params.get('code');
  if (codeFromUrl) {
    codeInput.value = codeFromUrl.toUpperCase();
    loadContract(codeFromUrl.toUpperCase());
  }
})();
