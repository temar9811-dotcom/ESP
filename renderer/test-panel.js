'use strict';

(function () {
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
          width: 220px;
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
          <button type="button" data-cmd="bubble.skill">Skill bubble</button>
          <button type="button" data-cmd="bubble.wallet">Wallet bubble</button>
          <button type="button" data-cmd="app.refresh">Force refresh</button>
          <button type="button" data-cmd="app.showWindow">Show window</button>
        </div>
      `;

      const fab = document.createElement('button');
      fab.id = 'test-fab';
      fab.type = 'button';
      fab.textContent = 'Tests';
      fab.hidden = true;

      document.body.appendChild(panel);
      document.body.appendChild(fab);

      panel.addEventListener('click', (event) => {
        const cmdBtn = event.target.closest('[data-cmd]');

        if (cmdBtn) {
          window.eveApi
            .testRun(cmdBtn.dataset.cmd)
            .then((res) => console.log('test:', cmdBtn.dataset.cmd, res))
            .catch(() => {});
          return;
        }

        if (event.target.closest('#test-collapse')) {
          panel.hidden = true;
          fab.hidden = false;
          return;
        }

        if (event.target.closest('#test-close')) {
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