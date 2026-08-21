(function () {
  var STORAGE_KEY = '__skill_market_parent_context_v1__';
  var currentContext = null;

  function readStoredContext() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function writeStoredContext(context) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } catch (_error) {
      // 某些 iframe 沙箱会禁用 sessionStorage；内存缓冲仍然可以接住早到的初始化消息。
    }
  }

  function departmentListFromPayload(payload) {
    var source = payload.departmentList;
    if (source === undefined) source = payload.departmentListStr;
    if (source === undefined) return undefined;
    if (Array.isArray(source)) return source;
    if (typeof source !== 'string') return undefined;
    try {
      var parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  function mergeParentContext(payload) {
    var next = Object.assign({ type: 'Skill_Square_Init' }, currentContext || {});
    if (payload.userId !== undefined) next.userId = payload.userId;
    if (payload.userName !== undefined) next.userName = payload.userName;
    var departmentList = departmentListFromPayload(payload);
    if (departmentList !== undefined) next.departmentList = departmentList;
    currentContext = next;
    window.__SKILL_MARKET_PARENT_CONTEXT__ = next;
    writeStoredContext(next);
  }

  currentContext = readStoredContext();
  if (currentContext) window.__SKILL_MARKET_PARENT_CONTEXT__ = currentContext;

  // 在 Vue 入口脚本下载和执行前监听，避免父页面的一次性初始化消息因加载时序而丢失。
  window.addEventListener('message', function (event) {
    var payload = event.data;
    if (!payload || typeof payload !== 'object' || payload.type !== 'Skill_Square_Init') return;
    mergeParentContext(payload);
  });
})();
