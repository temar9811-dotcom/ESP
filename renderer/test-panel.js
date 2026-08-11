(function () {
  'use strict';

  const api = window.eveApi;

  if (!api || !api.testEnabled || !api.testRun) {
    return;
  }

  let panel = null;
  let visible = false;
  let userHidden = false;
  let lastEnabled = false;

  function injectStyle() {
    const style = document.createElement('style');

    style.textContent = `
      #test-panel {
        position: fixed;
        left: 12px;
        bottom: 40px;
        z-index: 1500;
        width: 230px;
        background: rgba(22, 29, 38, 0.97);
        border: 1px solid #33455a;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
      }

      #test-panel .test-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      #test-panel button {
        display: block;
        width: 100%;
        margin: 4px 0;
        padding: 6px 8px;
        border: 1px solid #33455a;
        border-radius: 6px;
        background: #223140;
        color: #dfe7ef;
        cursor: pointer;
        text-align: left;
      }

      #test-panel button:hover {
        background: #2c3f52;
      }

      #test-panel #test-hide {
        width: auto;
        padding: 2px 8px;
      }

      #test-panel #test-log {
        margin-top: 6px;
        color: #9fb2c5;
        word-break: break-all;
        max-height: 80px;
        overflow: auto;
      }
    `;

    document.head.appendChild(style);
  }

  function log(text) {
    const el = panel ? panel.querySelector('#test-log') : null;
    if (el) {
      el.textContent = text;
    }
  }

  function setVisible(value) {
    visible = value;

    if (panel) {
      panel.style.display = value ? 'block' : 'none';
    }
  }

  function build() {
    injectStyle();

    panel = document.createElement('div');
    panel.id = 'test-panel';

    panel.innerHTML = `
      <div class="test-panel-header">
        <strong>Test Panel</strong>
        <button type="button" id="test-hide" title="Hide test panel">✕</button>
      </div>
      <div class="test-panel-body">
        <button type="button" data-cmd="ping">Ping</button>
        <button type="button" data-cmd="bubble.skill">Skill bubble</button>
        <button type="button" data-cmd="bubble.wallet">Wallet bubble</button>
        <button type="button" data-cmd="app.refresh">Force refresh</button>
        <button type="button" data-cmd="app.showWindow">Show window</button>
      </div>
      <div id="test-log"></div>
    `;

    document.body.appendChild(panel);

    panel.querySelector('#test-hide').addEventListener('click', () => {
      userHidden = true;
      setVisible(false);
    });

    panel.querySelector('.test-panel-body').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-cmd]');
      if (!button) {
        return;
      }

      const command = button.getAttribute('data-cmd');

      try {
        const result = await api.testRun(command);
        log(`${command} -> ${JSON.stringify(result)}`);
      } catch (err) {
        log(`${command} -> ERROR ${err && err.message ? err.message : String(err)}`);
      }
    });
  }

  async function poll() {
    let enabled = false;

    try {
      enabled = await api.testEnabled();
    } catch {
      enabled = false;
    }

    if (enabled && !lastEnabled) {
      userHidden = false;
    }

    lastEnabled = enabled;

    if (!enabled) {
      if (panel && visible) {
        setVisible(false);
      }
      return;
    }

    if (!panel) {
      build();
    }

    if (!visible && !userHidden) {
      setVisible(true);
    }
  }

  poll();
  setInterval(poll, 5000);
})();