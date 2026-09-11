// DeepSeekWeb2API - 渲染进程：控制面板交互与日志渲染
(function () {
  const $ = id => document.getElementById(id);
  const logEl = $('log');
  const MAX_LINES = 2000;
  let autoScroll = true;

  const el = {
    status: $('status'),
    apiUrl: $('api-url'),
    port: $('port'),
    apikey: $('apikey'),
    node: $('node'),
    foot: $('foot'),
    btnStart: $('btn-start'),
    btnStop: $('btn-stop'),
    btnRestart: $('btn-restart'),
    btnLogin: $('btn-login'),
    btnLoginDone: $('btn-login-done'),
    btnOpenApi: $('btn-open-api'),
    btnOpenLogin: $('btn-open-login'),
    btnConfigDir: $('btn-config-dir'),
    btnConfigFile: $('btn-config-file'),
    btnClear: $('btn-clear')
  };

  function appendLine(text, cls) {
    if (!logEl) return;
    const line = document.createElement('div');
    line.className = cls || 'l-info';
    line.textContent = text;
    logEl.appendChild(line);
    while (logEl.childNodes.length > MAX_LINES) logEl.removeChild(logEl.firstChild);
    if (autoScroll) logEl.scrollTop = logEl.scrollHeight;
  }

  // 后端日志是 JSON 行；[app] 开头的是主进程消息
  function handleLog(raw) {
    const text = String(raw).trim();
    if (!text) return;
    if (text.startsWith('[app]')) {
      appendLine(text, 'l-app');
      return;
    }
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj.level === 'string' && typeof obj.message === 'string') {
        const time = (obj.time || '').slice(11, 19);
        const meta = obj.meta ? ' ' + JSON.stringify(obj.meta) : '';
        appendLine(`${time} [${obj.level}] ${obj.message}${meta}`, 'l-' + obj.level);
        return;
      }
    } catch { /* not json */ }
    appendLine(text, 'l-internal');
  }

  function renderState(s) {
    const running = s.serverRunning;
    const login = s.loginRunning;
    el.status.textContent = login ? '登录中' : (running ? '运行中' : '未启动');
    el.status.className = 'status' + (login ? ' login' : running ? ' running' : '');
    el.apiUrl.textContent = s.publicBaseUrl || '-';
    el.port.textContent = String(s.port ?? '-');
    el.apikey.textContent = s.apiKeyConfigured ? '已配置' : '未设置';
    el.node.textContent = s.nodePath || '-';
    el.btnStart.disabled = running;
    el.btnStop.disabled = !running && !login;
    el.btnLogin.disabled = running;
    el.btnLoginDone.disabled = !login;
    el.foot.textContent = `版本 ${s.version}  ·  配置文件 ${s.configPath}`;
  }

  function bind() {
    el.btnStart.addEventListener('click', () => window.desktop.start());
    el.btnStop.addEventListener('click', () => window.desktop.stop());
    el.btnRestart.addEventListener('click', () => window.desktop.restart());
    el.btnLogin.addEventListener('click', () => window.desktop.login());
    el.btnLoginDone.addEventListener('click', () => window.desktop.loginDone());
    el.btnOpenApi.addEventListener('click', () => window.desktop.openApi());
    el.btnOpenLogin.addEventListener('click', () => window.desktop.openLoginPage());
    el.btnConfigDir.addEventListener('click', () => window.desktop.openConfigDir());
    el.btnConfigFile.addEventListener('click', () => window.desktop.openConfigFile());
    el.btnClear.addEventListener('click', () => { if (logEl) logEl.textContent = ''; });

    logEl.addEventListener('scroll', () => {
      autoScroll = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    });

    window.desktop.onLog(handleLog);
    window.desktop.onState(renderState);
  }

  function init() {
    bind();
    appendLine('客户端已就绪，请先完成 DeepSeek 登录，再启动服务。', 'l-app');
    window.desktop.getState().then(renderState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();