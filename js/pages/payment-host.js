/* =====================================================
 * 缴费中心 · 宿主桥接页（js/pages/payment-host.js）
 * -----------------------------------------------------
 * 「缴费中心」是独立微应用（缴费中心/index.html，自带存储/UI/路由，
 * 与宿主大框架零耦合）。本页是宿主侧的**唯一**接入点，职责仅一件事：
 * 把「登录身份 + 班级名册」按契约传给 iframe 里的缴费中心。
 *
 * 契约（与 Auth.loginAsExternal 的 trusted 语义同源）：
 *   缴费中心加载后向宿主发 {type:'pay:ready'}；
 *   宿主回传 {type:'pay:auth', profile:{trusted:true, user, roster}}；
 *   缴费中心校验 trusted 后建立会话并幂等导入名册（PayBridge.importRoster）。
 * 安全说明：本页传出的只是「本机已登录会话」的只读快照；真实对接学校
 * 统一认证时，trusted 应由服务端验签后置位（见 集成方案/ 支付宝缴费接入方案）。
 * ===================================================== */

(function () {
  'use strict';

  var APP_URL = '缴费中心/index.html?embed=1';

  /** 组装契约载荷：身份快照 + 名册（按数据范围过滤） */
  function buildPayload(user) {
    var scope = Auth.scopeClassIds(user);
    var clsName = {};
    Store.list('classes').forEach(function (c) { clsName[c.id] = c.name; });
    var roster = Store.list('students')
      .filter(function (s) { return scope.indexOf(s.classId) !== -1; })
      .map(function (s) {
        return { name: s.name, studentNo: String(s.studentNo), className: clsName[s.classId] || '' };
      });
    var stu = null;
    if (user.role === 'student' && user.studentId) {
      stu = Store.list('students').filter(function (s) { return s.id === user.studentId; })[0] || null;
    }
    var isMgr = Auth.isAdmin(user) || Auth.isCounselor(user);
    return {
      type: 'pay:auth',
      profile: {
        trusted: true,   // 本机会话快照；生产环境由服务端验签后置位
        via: '班级管理系统会话（' + (isMgr ? (Auth.isAdmin(user) ? '管理员' : '辅导员') : '学生') + '）',
        host: { name: '班级管理系统', version: 'v110' },
        user: {
          name: user.name || user.username || '用户',
          username: user.username || '',
          role: user.role || '',
          post: user.post || '',
          duties: user.duties || [],
          studentNo: stu ? String(stu.studentNo) : '',
          className: stu ? (clsName[stu.classId] || '') : '',
          manager: isMgr
        },
        roster: roster
      }
    };
  }

  /** 全局只绑一次的消息监听：响应 iframe 内缴费中心的 pay:ready 握手 */
  function bindOnce() {
    if (window._payHostBound) return;
    window._payHostBound = true;
    window.addEventListener('message', function (e) {
      var frame = document.getElementById('pay-frame');
      if (!frame || e.source !== frame.contentWindow) return;
      if (e.data && e.data.type === 'pay:ready') {
        // 注意：app.js 的 App 是顶层 const 全局词法绑定（非 window.App 属性），
        // 且本文件先于 app.js 加载，这里只能在消息回调运行时取值
        var user = (typeof App !== 'undefined' && App.user) ? App.user : null;
        if (!user) return;
        var payload = buildPayload(user);
        frame.contentWindow.postMessage(payload, '*');
        if (!window._payHostToast) {
          window._payHostToast = true;
          Toast.info('缴费中心已按契约接入（名册 ' + payload.profile.roster.length + ' 人）');
        }
      }
    });
  }

  Pages['payment'] = function (container, user) {
    var isMgr = Auth.isAdmin(user) || Auth.isCounselor(user);
    var isStu = user.role === 'student';
    // 页面内第二道防线（防直连 hash，与 scholarships.js 同范式）
    if (!isMgr && !isStu) {
      container.innerHTML = '<div class="card">' +
        UI.empty('缴费中心仅对辅导员 / 管理员开放（学生请使用「我的缴费」入口）。') + '</div>';
      return;
    }

    container.innerHTML =
      '<div class="card">' +
      '  <div class="toolbar" style="margin-bottom:12px">' +
      '    <div>' +
      '      <b style="font-family:var(--serif);letter-spacing:1px">缴费中心</b>' +
      '      <span style="color:var(--muted);font-size:12px;margin-left:8px">团费 / 班费收缴 · 独立微应用（身份与名册按契约自动接入，配置在应用内「设置」）</span>' +
      '    </div>' +
      '    <div style="flex:1"></div>' +
      '    <button class="btn btn-ghost btn-sm" id="pay-host-open" type="button">新窗口独立打开</button>' +
      '  </div>' +
      '  <iframe id="pay-frame" src="' + APP_URL + '" title="班级缴费中心"' +
      '    style="width:100%;height:calc(100vh - 240px);min-height:560px;border:1px solid var(--border);' +
      'border-radius:12px;background:#fff;display:block"></iframe>' +
      '</div>';

    bindOnce();
    document.getElementById('pay-host-open').onclick = function () {
      window.open(APP_URL, '_blank');
    };
  };
})();
