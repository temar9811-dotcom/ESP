'use strict';
(function () {
function setResult(ok, text) {
const el = document.getElementById('test-result');
if (!el) return;
el.textContent = `${ok ? '✓' : '✕'} ${text}`;
el.style.color = ok ? '#9fd6a0' : '#e08585';
}
function summarize(res) {
if (!res || res.ok === undefined) return 'no response';
if (!res.ok) return res.error || 'failed';
if (res.result === undefined) return 'ok';
try {
  const s = JSON.stringify(res.result);
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
} catch {
  return 'ok';
}
}
function build() {
if (!window.eveApi || !window.eveApi.testEnabled) return;
window.eveApi.testEnabled().then((enabled) => {
   if (!enabled) return;
   const style = document.createElement('style');
   style.textContent = `
     #test-panel {
       position: fixed;
       left: 16px;
       bottom: 16px;
       width: 240px;
       background: rgba(18, 24, 32, 0.96);
       border: 1px solid rgba(90, 140, 190, 0.45);
       border-radius: 10px;
       padding: 10px;
       z-index: 999;
       font-family: 'Segoe UI', Arial, sans-serif;
       color: #e8eef5;
     }
     #test-panel-header {
       display: flex;
       justify-content: space-between;
       align-items: center;
       margin-bottom: 8px;
       font-weight: 700;
     }
     #test-panel-header .tp-btns button {
       margin-left: 4px;
     }
     #test-panel-body {
       max-height: 340px;
       overflow-y: auto;
     }
     #test-panel button {
       display: block;
       width: 100%;
       margin-top: 6px;
       padding: 8px 10px;
       background: #24313f;
       color: #e8eef5;
       border: 1px solid rgba(90, 140, 190, 0.35);
       border-radius: 6px;
       cursor: pointer;
     }
     #test-panel button:hover { background: #2d3c4d; }
     #test-panel .tp-small {
       display: inline-block;
       width: auto;
       margin: 0;
       padding: 2px 8px;
     }
     #test-result {
       margin-top: 8px;
       font-size: 11px;
       min-height: 14px;
       word-break: break-word;
     }
     #test-fab {
       position: fixed;
       left: 16px;
       bottom: 16px;
       z-index: 999;
       padding: 8px 12px;
       background: rgba(18, 24, 32, 0.96);
       color: #e8eef5;
       border: 1px solid rgba(90, 140, 190, 0.45);
       border-radius: 999px;
       cursor: pointer;
     }
   `;
   document.head.appendChild(style);
   const panel = document.createElement('div');
   panel.id = 'test-panel';
   panel.innerHTML = `
     <div id="test-panel-header">
       <span>Test Panel</span>
       <span class="tp-btns">
         <button type="button" class="tp-small" id="test-collapse" title="Collapse">–</button>
         <button type="button" class="tp-small" id="test-close" title="Close">✕</button>
       </span>
     </div>
     <div id="test-panel-body">
       <button type="button" data-cmd="ping">Ping</button>
       <button type="button" data-cmd="assets.debug">Assets debug</button>
       <button type="button" data-cmd="assets.debug2">Assets debug 2</button>
       <button type="button" data-cmd="assets.structureAudit">Structure audit</button>
       <button type="button" data-cmd="assets.structureAuditAll">Structure audit (probe all)</button>
       <button type="button" data-cmd="assets.clearStructureFailures">Clear structure failures</button>
       <button type="button" data-cmd="assets.locationClassify">Location classify</button>
       <button type="button" data-cmd="app.version">Version</button>
       <button type="button" data-cache-clear="all">Clear ALL caches</button>
       <button type="button" data-cache-clear="skills">Clear skills cache</button>
       <button type="button" data-cache-clear="wallet">Clear wallet cache</button>
       <button type="button" data-cache-clear="assets">Clear assets cache</button>
       <button type="button" data-cache-clear="assetsNames">Clear asset names cache</button>
       <button type="button" data-cmd="bubble.skill">Skill bubble</button>
       <button type="button" data-cmd="bubble.queue">Queue bubble</button>
       <button type="button" data-cmd="bubble.wallet">Wallet bubble</button>
       <button type="button" data-cmd="accounts.summary">Accounts summary</button>
       <button type="button" data-cmd="app.refresh">Force refresh</button>
       <button type="button" data-cmd="app.showWindow">Show window</button>
       <button type="button" data-cmd="login.cancelIdle">Cancel idle login</button>
       <button type="button" data-cmd="groups.read">Groups read</button>
       <button type="button" data-cmd="settings.roundtrip">Settings roundtrip</button>
       <button type="button" data-cmd="plans.roundtrip">Plans roundtrip</button>
       <button type="button" data-cmd="skills.meta">Skill meta</button>
       <button type="button" data-cmd="wallet.details">Wallet details</button>
       <button type="button" data-cmd="corp.info">Corp info</button>
       <button type="button" data-cmd="history.inject">Inject recent skills</button>
       <button type="button" data-cmd="accounts.exportTokens">Export tokens</button>
     </div>
     <div id="test-result"></div>
   `;
   const fab = document.createElement('button');
   fab.id = 'test-fab';
   fab.type = 'button';
   fab.textContent = 'Tests';
   fab.hidden = true;
   document.body.appendChild(panel);
   document.body.appendChild(fab);
   panel.addEventListener('click', async (event) => {
     const clearBtn = event.target.closest('[data-cache-clear]');
     if (clearBtn) {
       const which = clearBtn.dataset.cacheClear;
       setResult(true, `clearing ${which} cache…`);
       window.eveApi
         .clearCache(which)
         .then((res) => {
           const n = res && res.cleared ? res.cleared.length : 0;
           setResult(true, `cleared ${n} cache file(s): ${(res.cleared || []).join(', ') || 'none present'}`);
         })
         .catch((err) => {
           setResult(false, `clearCache: ${err?.message || String(err)}`);
         });
       return;
     }
     const cmdBtn = event.target.closest('[data-cmd]');
     if (cmdBtn) {
       const probeAll = cmdBtn.dataset.cmd === 'assets.structureAuditAll';
       const cmd = probeAll ? 'assets.structureAudit' : cmdBtn.dataset.cmd;
       const payload = probeAll ? { probeAll: true } : {};
       setResult(true, `running ${cmd}…`);
       window.eveApi
         .testRun(cmd, payload)
         .then((res) => {
           console.log('test:', cmd, res);
           setResult(Boolean(res && res.ok), `${cmd}: ${summarize(res)}`);
         })
         .catch((err) => {
           setResult(false, `${cmd}: ${err?.message || String(err)}`);
         });
       return;
     }
     if (event.target.closest('#test-collapse')) {
       panel.hidden = true;
       fab.hidden = false;
       return;
     }
     if (event.target.closest('#test-close')) {
       try {
         await window.eveApi.testRun('test:disable', {});
       } catch {
         // Still hide the panel even if the write fails.
       }
       if (window.ESP && ESP.state) ESP.state.testEnabled = false;
       panel.hidden = true;
       fab.hidden = true;
     }
   });
   fab.addEventListener('click', () => {
     panel.hidden = false;
     fab.hidden = true;
   });
 });
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', build);
} else {
build();
}
})();