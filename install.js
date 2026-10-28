// "Install app" button: one-tap install where the browser allows it (Android Chrome, PC Chrome/Edge),
// step-by-step instructions on iPhone/iPad (Apple only allows Share → Add to Home Screen).
(function () {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  var btn = document.getElementById('btnInstall'), dlg = document.getElementById('dlgInstall'), steps = document.getElementById('installSteps');
  var ua = navigator.userAgent;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var iosSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA/.test(ua);
  var deferred = null;
  if (standalone) return; // already opened from the home-screen icon

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; btn.hidden = false; });
  window.addEventListener('appinstalled', function () { btn.hidden = true; deferred = null; });
  if (isIOS || isAndroid) btn.hidden = false;

  var after = '<p class="tip">After installing, open <strong>Birthday Reminder</strong> from your home screen and add your ePartner PDF there. ' +
    (isIOS ? 'On iPhone the installed app keeps its own data, separate from Safari, so load the PDF (or restore a backup) inside the app.' : 'Your data stays on this phone.') + '</p>';
  var html = {
    iosSafari: '<ol><li>Tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> (square with an arrow) at the bottom of Safari.</li>' +
      '<li>Scroll down and tap <strong>Add to Home Screen</strong> <span aria-hidden="true">➕</span>.</li>' +
      '<li>Tap <strong>Add</strong> (top right). The 🎂 <strong>Birthdays</strong> icon appears on your home screen.</li></ol>',
    iosOther: '<ol><li>Tap the <strong>Share</strong> button <span aria-hidden="true">⬆️</span> (in Chrome it is at the top right, next to the address).</li>' +
      '<li>Tap <strong>Add to Home Screen</strong>.</li><li>Tap <strong>Add</strong>.</li></ol>' +
      '<p class="tip">If you don\'t see "Add to Home Screen", open this page in <strong>Safari</strong> and try again.</p>',
    android: '<ol><li>Tap the <strong>⋮</strong> menu at the top right of Chrome.</li>' +
      '<li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li><li>Tap <strong>Install</strong>. The 🎂 icon appears on your home screen and in your app list.</li></ol>',
    pc: '<p>On your phone, open <strong>' + location.href.replace(/[?#].*$/, '') + '</strong> in Chrome (Android) or Safari (iPhone), then tap <strong>📲 Install app</strong>.</p>' +
      '<p class="tip">On this PC you can also install it: in Chrome or Edge, click the install icon <span aria-hidden="true">⊕</span> at the right end of the address bar.</p>',
  };

  btn.addEventListener('click', function () {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (r) { if (r.outcome === 'accepted') btn.hidden = true; deferred = null; });
      return;
    }
    steps.innerHTML = (isIOS ? (iosSafari ? html.iosSafari : html.iosOther) : isAndroid ? html.android : html.pc) + after;
    dlg.showModal();
  });
})();
