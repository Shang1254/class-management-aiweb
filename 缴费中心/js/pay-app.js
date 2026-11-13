/* =====================================================
 * 班级缴费中心 · 页面层（pay-app.js）
 * -----------------------------------------------------
 * hash 路由 + 单页双端：
 *   收支管理员：总览 / 费项 / 账本 / 公示 / 设置
 *   班级成员：  我的缴费 / 缴费凭证（收银台为全屏浮层）
 * 惯例（与宿主同源）：
 *   · 所有动态插值过 PayUtils.esc；弹窗 Esc 关闭 + 锁滚动；
 *   · 写操作走 PayStore.add/update/remove（自动审计）后手动重绘；
 *   · 错误必须 Toast，不静默吞错；禁止 emoji 图标（用印章单字与 ✓✕！i 字形）。
 * ===================================================== */

var PayApp = window.PayApp = {
  version: '1.0.0',
  state: { route: '', feeKind: '全部', ledgerMonth: '全部', ledgerType: '全部', noticeMonth: '' },

  /* ================= 启动 ================= */

  start: function () {
    this.applyTheme();
    var s = PayStore.session();
    if (PayBridge.mode === 'embed' && !s) { this.renderConnecting(); return; }
    if (!s) { this.renderLogin(); return; }
    this.enter();
  },

  /** 宿主身份到位 / 会话变化后整体重绘 */
  refresh: function () {
    var s = PayStore.session();
    if (!s) { this.renderLogin(); return; }
    this.enter();
  },

  enter: function () {
    var self = this;
    if (!this._hashBound) {
      this._hashBound = true;
      window.addEventListener('hashchange', function () { self.render(); });
    }
    if (!this.state.route) {
      var want = (location.hash || '').replace(/^#\//, '');
      this.state.route = want || (this.me().role === 'manager' ? 'overview' : 'mine');
    }
    this.render();
  },

  me: function () { return PayStore.session() || { name: '未登录', role: 'member' }; },

  fatal: function (msg) {
    var c = document.getElementById('pay-root');
    if (c) c.innerHTML =
      '<div class="pay-login-wrap"><div class="card pay-login">' +
      '<span class="pay-seal pay-seal-lg">缴</span><h1>接入异常</h1>' +
      '<p class="pay-muted">' + PayUtils.esc(msg) + '</p>' +
      '<p class="pay-muted pay-sm">请确认由「班级管理系统 → 缴费中心」进入，或直接双击本页 index.html 独立运行。</p>' +
      '</div></div>';
  },

  /* ================= 壳与导航 ================= */

  NAV: {
    manager: [
      { k: 'overview', t: '总览', i: '览' },
      { k: 'fees', t: '费项', i: '费' },
      { k: 'ledger', t: '账本', i: '账' },
      { k: 'notice', t: '公示', i: '示' },
      { k: 'audit', t: '智能审计', i: '审' },
      { k: 'settings', t: '设置', i: '设' }
    ],
    member: [
      { k: 'mine', t: '我的缴费', i: '缴' },
      { k: 'receipts', t: '缴费凭证', i: '票' }
    ]
  },

  render: function () {
    // 守卫用真实会话（不能用 me() 的兜底对象，否则登出后 hashchange 会渲染出「未登录」空壳）
    var me = PayStore.session();
    if (!me || !me.role) { this.renderLogin(); return; }
    var nav = this.NAV[me.role] || this.NAV.member;
    // hash → route 同步：侧边栏链接（a href="#/fees"）点击后由 hashchange 驱动到这里
    var want = (location.hash || '').replace(/^#\//, '');
    if (want && nav.some(function (n) { return n.k === want; })) PayApp.state.route = want;
    if (nav.filter(function (n) { return n.k === PayApp.state.route; }).length === 0) {
      PayApp.state.route = nav[0].k;
    }
    var root = document.getElementById('pay-root');
    root.innerHTML =
      '<div class="pay-app">' +
      '  <aside class="pay-side">' +
      '    <div class="pay-logo"><span class="pay-seal">缴</span>' +
      '      <div><b>班级缴费中心</b><i>团费 · 班费 · 收支公示</i></div></div>' +
      '    <nav class="pay-nav">' + nav.map(function (n) {
        return '<a class="pay-nav-item' + (n.k === PayApp.state.route ? ' on' : '') + '" href="#/' + n.k + '">' +
          '<span class="pay-nav-seal">' + n.i + '</span>' + PayUtils.esc(n.t) + '</a>';
      }).join('') + '</nav>' +
      '    <div class="pay-side-foot">' + this.gatewayBadgeHTML() +
      '      <div class="pay-userchip"><b>' + PayUtils.esc(me.name) + '</b>' +
      '        <i>' + (me.role === 'manager' ? '收支管理员' + (me.post ? ' · ' + PayUtils.esc(me.post) : '') : '班级成员') + '</i></div>' +
      '      <button class="pay-btn pay-btn-ghost pay-btn-sm" id="pay-logout">退出</button>' +
      '    </div>' +
      '  </aside>' +
      '  <main class="pay-main">' +
      '    <header class="pay-topbar"><h1>' + PayUtils.esc(this.routeTitle()) + '</h1>' +
      '      <div class="pay-topbar-right">' +
      (PayBridge.mode === 'embed' ? '<span class="pay-chip pay-chip-host">已接入：' + PayUtils.esc(me.hostName || '班级管理系统') + '</span>' : '') +
      '        <button class="pay-btn pay-btn-ghost pay-btn-sm" id="pay-theme">主题 ' + (document.body.classList.contains('pay-dark') ? '日' : '月') + '</button>' +
      '      </div></header>' +
      '    <section class="pay-content" id="pay-content"></section>' +
      '  </main>' +
      '</div>' +
      '<div id="pay-toast" class="pay-toast-container"></div>';

    document.getElementById('pay-logout').onclick = function () {
      PayApp.confirm({ title: '退出登录', message: '确定退出缴费中心吗？', onOk: function () { PayBridge.logout(); PayApp.state.route = ''; location.hash = ''; PayApp.renderLogin(); } });
    };
    document.getElementById('pay-theme').onclick = function () { PayApp.toggleTheme(); };

    var fn = {
      overview: 'renderOverview', fees: 'renderFees', ledger: 'renderLedger',
      notice: 'renderNotice', audit: 'renderAudit', settings: 'renderSettings',
      mine: 'renderMine', receipts: 'renderReceipts'
    }[this.state.route];
    this[fn](document.getElementById('pay-content'));
  },

  routeTitle: function () {
    var me = this.me();
    var nav = this.NAV[me.role] || [];
    for (var i = 0; i < nav.length; i++) if (nav[i].k === this.state.route) return nav[i].t;
    return '缴费中心';
  },

  refreshNav: function () { this.render(); },

  /* ================= 主题 / Toast / 弹窗 ================= */

  applyTheme: function () {
    document.body.classList.toggle('pay-dark', PayStore.getPref('theme', '') === 'dark');
  },
  toggleTheme: function () {
    var dark = !document.body.classList.contains('pay-dark');
    document.body.classList.toggle('pay-dark', dark);
    PayStore.setPref('theme', dark ? 'dark' : 'light');
    this.render();
  },

  toast: function (msg, type) {
    var box = document.getElementById('pay-toast');
    if (!box) return;
    var icons = { success: '✓', error: '✕', warning: '！', info: 'i' };
    var el = document.createElement('div');
    el.className = 'pay-toast pay-toast-' + (type || 'info');
    el.innerHTML = '<span class="pay-toast-icon">' + (icons[type] || 'i') + '</span>' + PayUtils.esc(msg);
    box.appendChild(el);
    setTimeout(function () { el.classList.add('on'); }, 20);          // 后台标签页 rAF 冻结规避
    setTimeout(function () {
      el.classList.remove('on');
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  },

  /** 弹窗（自带 Esc 关闭 / 焦点移入 / 锁滚动；mask._close() 关闭） */
  modal: function (opts) {
    var mask = document.createElement('div');
    mask.className = 'pay-mask';
    mask.innerHTML =
      '<div class="pay-modal' + (opts.wide ? ' pay-modal-wide' : '') + '" role="dialog">' +
      '  <div class="pay-modal-header"><b>' + PayUtils.esc(opts.title || '窗口') + '</b>' +
      '    <button class="pay-modal-x" title="关闭">✕</button></div>' +
      '  <div class="pay-modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer === false ? '' : '<div class="pay-modal-footer"></div>') +
      '</div>';
    document.body.appendChild(mask);
    document.body.style.overflow = 'hidden';
    var prevFocus = document.activeElement;
    setTimeout(function () { mask.classList.add('on'); }, 20);

    function close() {
      mask.classList.remove('on');
      document.body.style.overflow = '';
      setTimeout(function () { mask.remove(); }, 200);
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    mask.querySelector('.pay-modal-x').onclick = close;
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    mask._close = close;

    if (opts.onSubmit) {
      var foot = mask.querySelector('.pay-modal-footer');
      if (foot) {
        var ok = document.createElement('button');
        ok.className = 'pay-btn pay-btn-primary';
        ok.textContent = opts.okText || '确定';
        ok.onclick = function () { opts.onSubmit(mask, close); };
        var cancel = document.createElement('button');
        cancel.className = 'pay-btn pay-btn-ghost';
        cancel.textContent = '取消';
        cancel.onclick = close;
        foot.appendChild(cancel); foot.appendChild(ok);
      }
      var first = mask.querySelector('input,select,textarea');
      if (first) setTimeout(function () { first.focus(); }, 60);
    }
    return mask;
  },

  confirm: function (opts) {
    var self = this;
    this.modal({
      title: opts.title || '确认操作',
      body: '<p class="pay-confirm-msg">' + PayUtils.esc(opts.message || '') + '</p>',
      okText: opts.okText || '确定',
      onSubmit: function (mask, close) {
        close();
        if (opts.onOk) opts.onOk();
      }
    });
  },

  badge: function (text, type) {
    return '<span class="pay-badge pay-badge-' + (type || 'muted') + '">' + PayUtils.esc(text) + '</span>';
  },

  STATUS_BADGE: { '待支付': 'muted', '支付中': 'warning', '已支付': 'success', '已核销': 'info', '已退款': 'danger' },
  FEE_BADGE: { '征集中': 'success', '已截止': 'muted', '已结清': 'gold' },

  gatewayBadgeHTML: function () {
    var a = PAY.active();
    var label = a.def.id === 'mock' ? '演示收银台' : (a.def.id === 'local' ? '本机签名服务' : '校园支付网关');
    var cls = a.def.id === 'mock' ? 'gold' : (a.base ? 'success' : 'muted');
    return '<span class="pay-chip pay-chip-gw pay-chip-' + cls + '" title="' + PayUtils.esc(a.def.hint) + '">网关 ' + PayUtils.esc(label) + '</span>';
  },

  openPrint: function (title, bodyHtml) {
    var w = window.open('', '_blank');
    if (!w) { this.toast('浏览器拦截了打印窗口，请允许弹窗', 'warning'); return; }
    w.document.write(
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + PayUtils.esc(title) + '</title>' +
      '<style>body{font-family:"SimSun","Noto Serif CJK SC",serif;color:#1c2333;margin:48px;}' +
      'h1{text-align:center;letter-spacing:6px;font-size:22px;}' +
      '.sub{text-align:center;color:#666;font-size:12px;margin-bottom:28px;letter-spacing:2px;}' +
      'pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:2;}' +
      '.foot{margin-top:36px;text-align:right;color:#666;font-size:13px;}' +
      '@page{margin:18mm;}</style></head><body>' + bodyHtml + '</body></html>');
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) { } }, 350);
  },

  /* ================= 登录（独立模式） ================= */

  renderLogin: function () {
    PayStore.init();
    var roster = PayStore.list('roster');
    var root = document.getElementById('pay-root');
    root.innerHTML =
      '<div class="pay-login-wrap"><div class="card pay-login">' +
      '<span class="pay-seal pay-seal-lg">缴</span>' +
      '<h1>班级缴费中心</h1>' +
      '<p class="pay-muted">团费 · 班费收缴与收支公示（独立演示模式）</p>' +
      '<div class="pay-personas">' +
      '  <button class="pay-persona" id="pay-p-mgr">' +
      '    <span class="pay-seal">管</span><b>收支管理员</b><i>演示 · 王磊（生活委员）</i></button>' +
      '  <div class="pay-persona pay-persona-student">' +
      '    <span class="pay-seal">员</span><b>班级成员</b>' +
      '    <select class="pay-input" id="pay-p-stu">' +
      roster.map(function (s) { return '<option value="' + PayUtils.esc(s.studentNo) + '">' + PayUtils.esc(s.name) + '（' + PayUtils.esc(s.studentNo) + '）</option>'; }).join('') +
      '    </select>' +
      '    <button class="pay-btn pay-btn-primary pay-btn-sm" id="pay-p-enter">进入</button>' +
      '  </div>' +
      '</div>' +
      '<p class="pay-muted pay-sm">被宿主系统嵌入时，身份与班级名册将按契约自动接入，无需手工登录。</p>' +
      '</div></div>' +
      '<div id="pay-toast" class="pay-toast-container"></div>';
    document.getElementById('pay-p-mgr').onclick = function () {
      PayBridge.loginManager('王磊', '生活委员');
      PayApp.state.route = ''; PayApp.enter();
    };
    document.getElementById('pay-p-enter').onclick = function () {
      try {
        PayBridge.loginStudent(document.getElementById('pay-p-stu').value);
        PayApp.state.route = ''; PayApp.enter();
      } catch (e) { PayApp.toast(e.message, 'error'); }
    };
  },

  renderConnecting: function () {
    document.getElementById('pay-root').innerHTML =
      '<div class="pay-login-wrap"><div class="card pay-login">' +
      '<span class="pay-seal pay-seal-lg">缴</span><h1>正在接入宿主会话…</h1>' +
      '<p class="pay-muted">等待「班级管理系统」通过契约桥传入身份与班级名册。</p>' +
      '<p class="pay-muted pay-sm">若长时间无响应，请从系统菜单「缴费中心」重新进入。</p>' +
      '</div></div>' +
      '<div id="pay-toast" class="pay-toast-container"></div>';
  },

  /* ================= 数据组装 ================= */

  ordersOfFee: function (feeId) {
    return PayStore.list('orders').filter(function (o) { return o.feeId === feeId; });
  },
  feeStat: function (feeId) {
    var os = this.ordersOfFee(feeId);
    var st = { total: os.length, verified: 0, paid: 0, unpaid: 0, refund: 0, moneyIn: 0 };
    os.forEach(function (o) {
      if (o.status === '已核销') { st.verified++; st.moneyIn += o.amountFen; }
      else if (o.status === '已支付') { st.paid++; st.moneyIn += o.amountFen; }
      else if (o.status === '已退款') st.refund++;
      else st.unpaid++;
    });
    return st;
  },
  balanceFen: function () {
    var sum = 0;
    PayStore.list('ledger').forEach(function (l) { sum += (l.type === '收入' ? 1 : -1) * l.amountFen; });
    return sum;
  },
  myOrders: function () {
    var no = this.me().studentNo;
    return PayStore.list('orders').filter(function (o) { return String(o.studentNo) === String(no); });
  },

  /* ================= 管理端 · 总览 ================= */

  renderOverview: function (el) {
    var me = this.me();
    var fees = PayStore.list('fees');
    var active = fees.filter(function (f) { return f.status === '征集中'; });
    var a = PAY.active();
    var receivable = 0;
    active.forEach(function (f) {
      // 应收按实际生成的应缴订单计（多班/指定名单口径准确）
      PayApp.ordersOfFee(f.id).forEach(function (o) {
        if (o.status !== '已退款') receivable += o.amountFen;
      });
    });
    var received = 0;
    PayStore.list('orders').forEach(function (o) {
      if (o.status === '已支付' || o.status === '已核销') received += o.amountFen;
    });
    var logs = PayStore.list('logs').slice(-5).reverse();
    var self = this;

    el.innerHTML =
      '<div class="pay-hero card">' +
      '  <div class="pay-hero-main"><span class="pay-seal pay-seal-lg">缴</span>' +
      '    <div><h2>' + PayUtils.esc(me.name) + '，收支一目了然</h2>' +
      '    <p class="pay-muted">团费归团支书、班费归生活委员，收入支出与结余全部留痕可公示。</p></div></div>' +
      '  <div class="pay-hero-side">' + this.gatewayBadgeHTML() +
      '    <span class="pay-chip">名册 ' + PayStore.list('roster').length + ' 人</span>' +
      (me.source === 'host' ? '<span class="pay-chip pay-chip-host">宿主契约接入</span>' : '') +
      '  </div></div>' +
      '<div class="pay-stats">' +
      this.statCard('进行中费项', String(active.length), '个', 'gold') +
      this.statCard('应收合计', '¥ ' + PayUtils.fenYuan(receivable), '', 'blue') +
      this.statCard('实收合计', '¥ ' + PayUtils.fenYuan(received), '已支付+已核销', 'green') +
      this.statCard('账本结余', '¥ ' + PayUtils.fenYuan(this.balanceFen()), '收入 − 支出', 'purple') +
      '</div>' +
      '<div class="card"><div class="pay-card-head"><b>进行中的费项</b>' +
      '  <a class="pay-link" href="#/fees">全部费项 →</a></div>' +
      (active.length ? active.map(function (f) { return self.feeProgressHTML(f); }).join('') : '<div class="pay-empty"><b>空</b><p>暂无进行中的费项，去「费项」发布一笔团费或班费。</p></div>') +
      '</div>' +
      '<div class="card"><div class="pay-card-head"><b>最近动态</b><span class="pay-muted pay-sm">本应用操作留痕（滚动 500 条）</span></div>' +
      (logs.length ? '<table class="pay-table"><tbody>' + logs.map(function (l) {
        return '<tr><td class="pay-td-time">' + PayUtils.esc(PayUtils.fmtDateTime(l.at)) + '</td>' +
          '<td>' + PayUtils.esc(l.who) + ' · ' + PayUtils.esc(l.action) + '</td>' +
          '<td class="pay-muted">' + PayUtils.esc(l.entity) + (l.detail ? ' · ' + PayUtils.esc(l.detail) : '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<div class="pay-empty"><b>空</b><p>暂无操作记录。</p></div>') +
      '</div>';
  },

  statCard: function (label, value, sub, tone) {
    return '<div class="pay-stat pay-stat-' + (tone || 'blue') + '">' +
      '<i>' + PayUtils.esc(label) + '</i><b>' + PayUtils.esc(value) + '</b>' +
      (sub ? '<u>' + PayUtils.esc(sub) + '</u>' : '<u>&nbsp;</u>') + '</div>';
  },

  feeProgressHTML: function (f) {
    var st = this.feeStat(f.id);
    var pct = st.total ? Math.round((st.verified + st.paid) / st.total * 100) : 0;
    return '<div class="pay-progress-row" data-fee="' + PayUtils.esc(f.id) + '">' +
      '<div class="pay-progress-head">' +
      '  <b>' + PayUtils.esc(f.name) + '</b>' + this.badge(f.kind, f.kind === '团费' ? 'gold' : 'blue') + this.badge(f.status, this.FEE_BADGE[f.status] || 'muted') +
      '  <span class="pay-progress-money">¥ ' + PayUtils.fenYuan(f.amountFen) + '/人</span></div>' +
      '<div class="pay-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="pay-progress-foot pay-muted pay-sm">已核销 ' + st.verified + ' · 已支付 ' + st.paid + ' · 待支付 ' + st.unpaid + ' · 共 ' + st.total + ' 人 · 截止 ' + PayUtils.esc(f.deadline) + '</div>' +
      '</div>';
  },

  /* ================= 管理端 · 费项 ================= */

  renderFees: function (el) {
    var self = this;
    var fees = PayStore.list('fees').slice().reverse();
    var kinds = ['全部', '团费', '班费', '活动经费', '其他'];
    el.innerHTML =
      '<div class="card">' +
      '  <div class="pay-toolbar">' +
      '    <select class="pay-input pay-input-auto" id="pay-fee-kind">' +
      kinds.map(function (k) { return '<option' + (k === self.state.feeKind ? ' selected' : '') + '>' + k + '</option>'; }).join('') +
      '    </select>' +
      '    <div class="pay-toolbar-gap"></div>' +
      '    <button class="pay-btn pay-btn-primary" id="pay-fee-new">＋ 发布费项</button>' +
      '  </div>' +
      '  <div id="pay-fee-list">' +
      (fees.filter(function (f) { return self.state.feeKind === '全部' || f.kind === self.state.feeKind; }).length
        ? fees.filter(function (f) { return self.state.feeKind === '全部' || f.kind === self.state.feeKind; }).map(function (f) { return self.feeCardHTML(f); }).join('')
        : '<div class="pay-empty"><b>空</b><p>还没有费项。点击右上角「发布费项」开始收缴。</p></div>') +
      '  </div></div>';
    document.getElementById('pay-fee-kind').onchange = function (e) {
      PayApp.state.feeKind = e.target.value; PayApp.renderFees(el);
    };
    document.getElementById('pay-fee-new').onclick = function () { PayApp.publishModal(el); };
    el.querySelectorAll('[data-fee-act]').forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute('data-fee-act'), id = btn.getAttribute('data-fee');
        var fee = PayStore.find('fees', id);
        if (!fee) return;
        if (act === 'urge') PayApp.urgeModal(fee, el);
        else if (act === 'list') PayApp.rosterModal(fee, el);
        else if (act === 'reconcile') PayApp.reconcileFee(fee, el);
        else if (act === 'close') PayApp.closeFee(fee, el);
        else if (act === 'csv') PayApp.exportFeeCSV(fee);
      };
    });
  },

  feeCardHTML: function (f) {
    var st = this.feeStat(f.id);
    var pct = st.total ? Math.round((st.verified + st.paid) / st.total * 100) : 0;
    return '<div class="pay-fee-card" data-fee="' + PayUtils.esc(f.id) + '">' +
      '<div class="pay-fee-head">' +
      '  <div><b>' + PayUtils.esc(f.name) + '</b>' + this.badge(f.kind, f.kind === '团费' ? 'gold' : 'blue') + this.badge(f.status, this.FEE_BADGE[f.status] || 'muted') + '</div>' +
      '  <div class="pay-fee-amount">¥ <b>' + PayUtils.fenYuan(f.amountFen) + '</b><i>/人</i></div></div>' +
      '<div class="pay-fee-meta pay-muted pay-sm">经办 ' + PayUtils.esc(f.handler || '—') + ' · 截止 ' + PayUtils.esc(f.deadline) +
      (f.note ? ' · ' + PayUtils.esc(f.note) : '') + '</div>' +
      '<div class="pay-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="pay-fee-foot">' +
      '  <span class="pay-muted pay-sm">已核销 ' + st.verified + ' · 已支付 ' + st.paid + ' · 待支付 ' + st.unpaid + (st.refund ? ' · 已退款 ' + st.refund : '') + ' · 实收 ¥ ' + PayUtils.fenYuan(st.moneyIn) + '</span>' +
      '  <span class="pay-fee-ops">' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" data-fee-act="list" data-fee="' + PayUtils.esc(f.id) + '">缴费名单</button>' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" data-fee-act="urge" data-fee="' + PayUtils.esc(f.id) + '">催缴</button>' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" data-fee-act="reconcile" data-fee="' + PayUtils.esc(f.id) + '"' + (st.paid ? '' : ' disabled') + '>对账核销</button>' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" data-fee-act="csv" data-fee="' + PayUtils.esc(f.id) + '">导出</button>' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" data-fee-act="close" data-fee="' + PayUtils.esc(f.id) + '"' + (f.status === '征集中' ? '' : ' disabled') + '>截止</button>' +
      '  </span></div></div>';
  },

  publishModal: function (el) {
    var roster = PayStore.list('roster');
    var self = this;
    // 去重列出名册中的班级（宿主接入时辅导员可能带多个班）
    var classNames = [];
    roster.forEach(function (s) { if (s.className && classNames.indexOf(s.className) === -1) classNames.push(s.className); });
    this.modal({
      title: '发布费项', wide: true, okText: '发布并生成应缴名单',
      body:
        '<div class="pay-form">' +
        this.formRow('费用名称', '<input class="pay-input" id="pf-name" placeholder="如：2026-2027学年 团费（春季）">') +
        this.formRow('所属班级', '<select class="pay-input" id="pf-class">' +
          classNames.map(function (c) { return '<option>' + PayUtils.esc(c) + '</option>'; }).join('') + '</select>') +
        this.formRow('费用类型', '<select class="pay-input" id="pf-kind"><option>团费</option><option selected>班费</option><option>活动经费</option><option>其他</option></select>') +
        this.formRow('金额（元/人）', '<input class="pay-input" id="pf-amount" type="number" min="0.01" step="0.01" placeholder="如 30 或 100">') +
        this.formRow('缴费范围', '<label class="pay-radio"><input type="radio" name="pf-range" value="all" checked> 全员（名册 ' + roster.length + ' 人）</label>' +
          '<label class="pay-radio"><input type="radio" name="pf-range" value="pick"> 指定名单</label>' +
          '<div id="pf-pick" class="pay-pick-grid" style="display:none">' +
          roster.map(function (s) {
            return '<label class="pay-check"><input type="checkbox" value="' + PayUtils.esc(s.studentNo) + '"> ' + PayUtils.esc(s.name) + '</label>';
          }).join('') + '</div>') +
        this.formRow('缴费截止', '<input class="pay-input" id="pf-deadline" type="date" value="' + PayUtils.daysAgo(-14) + '">') +
        this.formRow('经办人', '<input class="pay-input" id="pf-handler" value="' + PayUtils.esc(this.me().name + (this.me().post ? '（' + this.me().post + '）' : '')) + '">') +
        this.formRow('说明', '<textarea class="pay-input" id="pf-note" rows="2" placeholder="用途说明（将出现在公示与催缴文案里）"></textarea>') +
        '</div>',
      onSubmit: function (mask, close) {
        var name = mask.querySelector('#pf-name').value.trim();
        var kind = mask.querySelector('#pf-kind').value;
        var amountFen = PayUtils.yuanToFen(mask.querySelector('#pf-amount').value);
        var deadline = mask.querySelector('#pf-deadline').value;
        var handler = mask.querySelector('#pf-handler').value.trim();
        var note = mask.querySelector('#pf-note').value.trim();
        var pick = mask.querySelector('input[name="pf-range"]:checked').value === 'pick';
        var targetNos = [];
        if (pick) {
          mask.querySelectorAll('#pf-pick input:checked').forEach(function (c) { targetNos.push(c.value); });
          if (!targetNos.length) { self.toast('指定名单至少勾选 1 人', 'warning'); return; }
        }
        if (!name) { self.toast('请填写费用名称', 'warning'); return; }
        if (!amountFen) { self.toast('金额需为大于 0 的数字（最多两位小数）', 'warning'); return; }
        if (!deadline) { self.toast('请选择缴费截止日期', 'warning'); return; }
        var fee = PayStore.add('fees', {
          name: name, kind: kind, amountFen: amountFen, targetNos: targetNos,
          deadline: deadline, status: '征集中', handler: handler, note: note,
          className: mask.querySelector('#pf-class').value || '',
          createdBy: self.me().name
        }, name + '（' + PayUtils.fenYuan(amountFen) + ' 元/人）');
        var n = self.generateOrders(fee);
        close();
        self.toast('费项已发布，应缴名单 ' + n + ' 人', 'success');
        PayStore._log('fees', '生成名单', fee.name + ' · ' + n + ' 人');
        PayApp.renderFees(el);
      }
    });
    var radios = document.querySelectorAll('input[name="pf-range"]');
    radios.forEach(function (r) {
      r.onchange = function () {
        document.getElementById('pf-pick').style.display =
          document.querySelector('input[name="pf-range"]:checked').value === 'pick' ? '' : 'none';
      };
    });
  },

  /** 生成应缴名单（幂等：同费项同人不重复开单；按费项所属班级圈人） */
  generateOrders: function (fee) {
    var roster = PayStore.list('roster');
    if (fee.className) {
      roster = roster.filter(function (s) { return s.className === fee.className; });
    }
    var targets = (fee.targetNos && fee.targetNos.length)
      ? roster.filter(function (s) { return fee.targetNos.indexOf(String(s.studentNo)) !== -1; })
      : roster;
    var exist = {};
    this.ordersOfFee(fee.id).forEach(function (o) { exist[String(o.studentNo)] = 1; });
    var n = 0;
    targets.forEach(function (s) {
      if (exist[String(s.studentNo)]) return;
      PayStore.add('orders', {
        feeId: fee.id, feeName: fee.name, kind: fee.kind, className: s.className || fee.className,
        studentNo: s.studentNo, name: s.name, amountFen: fee.amountFen,
        status: '待支付', channel: '', gatewayId: '', outTradeNo: '', tradeNo: '',
        paidAt: '', verifiedBy: '', verifiedAt: ''
      }, fee.name + ' · ' + s.name);
      n++;
    });
    return n;
  },

  formRow: function (label, inner) {
    return '<div class="pay-form-row"><label>' + PayUtils.esc(label) + '</label><div>' + inner + '</div></div>';
  },

  /** 缴费名单弹窗：逐人状态 + 单笔核销 / 退款 */
  rosterModal: function (fee, el) {
    var self = this;
    var orders = this.ordersOfFee(fee.id);
    var html = '<table class="pay-table"><thead><tr>' +
      '<th>学号</th><th>姓名</th><th class="pay-th-money">金额</th><th>状态</th><th>渠道 / 单号</th><th>操作</th></tr></thead><tbody>' +
      (orders.length ? orders.map(function (o) {
        var act = '';
        if (o.status === '已支付') {
          act = '<button class="pay-btn pay-btn-ghost pay-btn-sm" data-oact="verify" data-oid="' + PayUtils.esc(o.id) + '">单笔核销</button>' +
            '<button class="pay-btn pay-btn-ghost pay-btn-sm pay-btn-danger" data-oact="refund" data-oid="' + PayUtils.esc(o.id) + '">退款</button>';
        }
        return '<tr><td>' + PayUtils.esc(o.studentNo) + '</td><td>' + PayUtils.esc(o.name) + '</td>' +
          '<td class="pay-td-money">¥ ' + PayUtils.fenYuan(o.amountFen) + '</td>' +
          '<td>' + self.badge(o.status, self.STATUS_BADGE[o.status]) + '</td>' +
          '<td class="pay-muted pay-sm">' + PayUtils.esc(o.channel || '—') + (o.outTradeNo ? '<br>' + PayUtils.esc(o.outTradeNo) : '') + '</td>' +
          '<td class="pay-td-ops">' + act + '</td></tr>';
      }).join('') : '<tr><td colspan="6"><div class="pay-empty"><b>空</b><p>尚无应缴名单。</p></div></td></tr>') +
      '</tbody></table>';
    var mask = this.modal({
      title: '缴费名单 · ' + fee.name, wide: true, footer: false,
      body: html + '<p class="pay-muted pay-sm pay-modal-note">单笔核销适用于线下收款补登记；「对账核销」按钮可一键核销全部已支付订单并入账。</p>'
    });
    mask.querySelectorAll('[data-oact]').forEach(function (b) {
      b.onclick = function () {
        var oid = b.getAttribute('data-oid');
        var o = PayStore.find('orders', oid);
        if (!o) return;
        if (b.getAttribute('data-oact') === 'verify') {
          PayStore.update('orders', oid, {
            status: '已核销', verifiedBy: self.me().name + (self.me().post ? '（' + self.me().post + '）' : ''), verifiedAt: PayUtils.fmtDateTime(new Date())
          }, fee.name + ' · ' + o.name + '（单笔）');
          self.toast('已核销：' + o.name, 'success');
          mask._close(); PayApp.rosterModal(fee, el); PayApp.renderFees(el);
        } else {
          self.confirm({
            title: '确认退款', danger: true,
            message: '确认将 ' + o.name + ' 的 ' + PayUtils.fenYuan(o.amountFen) + ' 元标记为已退款？已核销订单请先在账本做冲销支出。',
            onOk: function () {
              PayStore.update('orders', oid, { status: '已退款' }, fee.name + ' · ' + o.name);
              self.toast('已退款：' + o.name, 'success');
              mask._close(); PayApp.rosterModal(fee, el); PayApp.renderFees(el);
            }
          });
        }
      };
    });
  },

  /** 一键对账核销：已支付 → 已核销 + 自动入账（一笔汇总流水） */
  reconcileFee: function (fee, el) {
    var self = this;
    var paid = this.ordersOfFee(fee.id).filter(function (o) { return o.status === '已支付'; });
    if (!paid.length) { this.toast('没有「已支付」订单可核销', 'info'); return; }
    var sum = paid.reduce(function (s, o) { return s + o.amountFen; }, 0);
    this.confirm({
      title: '对账核销',
      message: '将 ' + fee.name + ' 的 ' + paid.length + ' 笔已支付订单核销入账，合计 ¥ ' + PayUtils.fenYuan(sum) + '，并在账本生成一笔汇总收入流水。确认执行？',
      onOk: function () {
        var by = self.me().name + (self.me().post ? '（' + self.me().post + '）' : '');
        var now = PayUtils.fmtDateTime(new Date());
        paid.forEach(function (o) {
          PayStore.update('orders', o.id, { status: '已核销', verifiedBy: by, verifiedAt: now }, fee.name + ' · ' + o.name);
        });
        PayStore.add('ledger', {
          className: fee.className, type: '收入', feeId: fee.id, category: fee.kind + '收缴',
          amountFen: sum, date: PayUtils.today(), desc: fee.name + ' · 对账入账（' + paid.length + ' 人）',
          auto: true, by: by
        }, fee.name + ' · ¥ ' + PayUtils.fenYuan(sum));
        // 全部核销/退款 → 费项结清
        var rest = self.ordersOfFee(fee.id).filter(function (o) { return o.status === '待支付' || o.status === '支付中'; });
        if (!rest.length) PayStore.update('fees', fee.id, { status: '已结清' }, fee.name + ' · 已结清');
        self.toast('已核销 ' + paid.length + ' 笔并入账 ¥ ' + PayUtils.fenYuan(sum), 'success');
        PayApp.renderFees(el);
      }
    });
  },

  closeFee: function (fee, el) {
    var self = this;
    this.confirm({
      title: '截止收费',
      message: '确认将「' + fee.name + '」状态改为已截止？截止后新缴费将不再受理（已支付订单仍可核销）。',
      onOk: function () {
        PayStore.update('fees', fee.id, { status: '已截止' }, fee.name);
        self.toast('费项已截止', 'success');
        PayApp.renderFees(el);
      }
    });
  },

  exportFeeCSV: function (fee) {
    var rows = this.ordersOfFee(fee.id).map(function (o) {
      return [o.studentNo, o.name, o.className, PayUtils.fenYuan(o.amountFen), o.status, o.channel, o.outTradeNo, o.paidAt, o.verifiedBy];
    });
    PayUtils.exportCSV(fee.name + '-缴费名单.csv',
      ['学号', '姓名', '班级', '金额(元)', '状态', '渠道', '缴费单号', '支付时间', '核销人'], rows);
    this.toast('已导出 CSV', 'success');
  },

  /** 催缴弹窗：未缴名单 + AI 文案 / 离线模板 + 复制 + 导出 */
  urgeModal: function (fee, el) {
    var self = this;
    var unpaid = this.ordersOfFee(fee.id).filter(function (o) { return o.status === '待支付' || o.status === '支付中'; });
    if (!unpaid.length) { this.toast('该费项暂无待缴同学', 'info'); return; }
    var names = unpaid.map(function (o) { return o.name; });
    var mask = this.modal({
      title: '催缴 · ' + fee.name, wide: true, footer: false,
      body:
        '<div class="pay-urge-names">' + unpaid.map(function (o) {
          return '<span class="pay-chip">' + PayUtils.esc(o.name) + '（' + PayUtils.esc(o.studentNo) + '）</span>';
        }).join('') + '</div>' +
        '<textarea class="pay-input" id="urge-text" rows="6" placeholder="点击下方按钮生成催缴文案（AI 或离线模板）"></textarea>' +
        '<div class="pay-btn-row">' +
        '  <button class="pay-btn pay-btn-primary pay-btn-sm" id="urge-ai">AI 生成文案</button>' +
        '  <button class="pay-btn pay-btn-ghost pay-btn-sm" id="urge-tpl">离线模板</button>' +
        '  <button class="pay-btn pay-btn-ghost pay-btn-sm" id="urge-copy">复制文案</button>' +
        '  <button class="pay-btn pay-btn-ghost pay-btn-sm" id="urge-csv">导出未缴名单</button>' +
        '  <span class="pay-muted pay-sm" id="urge-note"></span>' +
        '</div>'
    });
    mask.querySelector('#urge-ai').onclick = async function () {
      var note = mask.querySelector('#urge-note');
      note.textContent = '生成中…（本机 Ollama）';
      var r = await PayAI.draftUrge(fee, names, self.me().name);
      mask.querySelector('#urge-text').value = r.text;
      note.textContent = r.offline ? 'AI 未就绪，已用离线模板（' + r.ms + 'ms）' : 'AI 生成（' + r.ms + 'ms）';
      self.toast(r.offline ? 'AI 未配置或未响应，已落离线模板' : 'AI 文案已生成', r.offline ? 'warning' : 'success');
    };
    mask.querySelector('#urge-tpl').onclick = function () {
      mask.querySelector('#urge-text').value = PayAI._urgeTemplate(fee, names, self.me().name);
      mask.querySelector('#urge-note').textContent = '离线模板';
    };
    mask.querySelector('#urge-copy').onclick = function () {
      var t = mask.querySelector('#urge-text').value;
      if (!t) { self.toast('请先生成文案', 'warning'); return; }
      var ok = PayUtils.copy(t);
      self.toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择复制', ok ? 'success' : 'error');
    };
    mask.querySelector('#urge-csv').onclick = function () {
      PayUtils.exportCSV(fee.name + '-未缴名单.csv', ['学号', '姓名', '班级', '金额(元)', '状态'],
        unpaid.map(function (o) { return [o.studentNo, o.name, o.className, PayUtils.fenYuan(o.amountFen), o.status]; }));
      self.toast('已导出未缴名单', 'success');
    };
  },

  /* ================= 管理端 · 账本 ================= */

  renderLedger: function (el) {
    var self = this;
    var all = PayStore.list('ledger').slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var months = [];
    all.forEach(function (l) {
      var m = (l.date || '').slice(0, 7);
      if (m && months.indexOf(m) === -1) months.push(m);
    });
    months.sort().reverse();
    var rows = all.filter(function (l) {
      return (self.state.ledgerMonth === '全部' || (l.date || '').slice(0, 7) === self.state.ledgerMonth) &&
        (self.state.ledgerType === '全部' || l.type === self.state.ledgerType);
    });
    var nowM = PayUtils.today().slice(0, 7);
    var mIn = 0, mOut = 0;
    all.forEach(function (l) {
      if ((l.date || '').slice(0, 7) !== nowM) return;
      if (l.type === '收入') mIn += l.amountFen; else mOut += l.amountFen;
    });
    el.innerHTML =
      '<div class="pay-stats">' +
      this.statCard('本月收入', '¥ ' + PayUtils.fenYuan(mIn), nowM, 'green') +
      this.statCard('本月支出', '¥ ' + PayUtils.fenYuan(mOut), nowM, 'orange') +
      this.statCard('账本结余', '¥ ' + PayUtils.fenYuan(this.balanceFen()), '全部流水累计', 'purple') +
      '</div>' +
      '<div class="card"><div class="pay-toolbar">' +
      '  <select class="pay-input pay-input-auto" id="lg-month"><option>全部</option>' +
      months.map(function (m) { return '<option' + (m === self.state.ledgerMonth ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
      '  <select class="pay-input pay-input-auto" id="lg-type">' + ['全部', '收入', '支出'].map(function (t) {
        return '<option' + (t === self.state.ledgerType ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select>' +
      '  <div class="pay-toolbar-gap"></div>' +
      '  <button class="pay-btn pay-btn-ghost" id="lg-csv">导出 CSV</button>' +
      '  <button class="pay-btn pay-btn-primary" id="lg-add">－ 记一笔支出</button>' +
      '</div>' +
      '<table class="pay-table"><thead><tr><th>日期</th><th>类型</th><th>类别</th><th class="pay-th-money">金额</th><th>事由</th><th>经办</th><th class="pay-th-ops">操作</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (l) {
        return '<tr><td>' + PayUtils.esc(l.date) + '</td>' +
          '<td>' + self.badge(l.type, l.type === '收入' ? 'success' : 'danger') + (l.auto ? ' <span class="pay-muted pay-sm">自动</span>' : '') + '</td>' +
          '<td>' + PayUtils.esc(l.category) + '</td>' +
          '<td class="pay-td-money ' + (l.type === '收入' ? 'pay-money-in' : 'pay-money-out') + '">' +
          (l.type === '收入' ? '+' : '−') + ' ¥ ' + PayUtils.fenYuan(l.amountFen) + '</td>' +
          '<td>' + PayUtils.esc(l.desc) + (l.proof ? '<span class="pay-muted pay-sm">（' + PayUtils.esc(l.proof) + '）</span>' : '') + '</td>' +
          '<td class="pay-muted pay-sm">' + PayUtils.esc(l.by || '—') + '</td>' +
          '<td class="pay-td-ops"><button class="pay-btn pay-btn-ghost pay-btn-sm pay-btn-danger" data-lg-del="' + PayUtils.esc(l.id) + '">删</button></td></tr>';
      }).join('') : '<tr><td colspan="7"><div class="pay-empty"><b>空</b><p>当前筛选下没有流水。</p></div></td></tr>') +
      '</tbody></table></div>';

    document.getElementById('lg-month').onchange = function (e) { PayApp.state.ledgerMonth = e.target.value; PayApp.renderLedger(el); };
    document.getElementById('lg-type').onchange = function (e) { PayApp.state.ledgerType = e.target.value; PayApp.renderLedger(el); };
    document.getElementById('lg-add').onclick = function () { PayApp.expenseModal(el); };
    document.getElementById('lg-csv').onclick = function () {
      PayUtils.exportCSV('班费账本.csv', ['日期', '类型', '类别', '金额(元)', '事由', '经办', '凭证', '是否对账自动'],
        rows.map(function (l) { return [l.date, l.type, l.category, PayUtils.fenYuan(l.amountFen), l.desc, l.by, l.proof || '', l.auto ? '是' : '否']; }));
      self.toast('已导出账本 CSV', 'success');
    };
    el.querySelectorAll('[data-lg-del]').forEach(function (b) {
      b.onclick = function () {
        var l = PayStore.find('ledger', b.getAttribute('data-lg-del'));
        if (!l) return;
        self.confirm({
          title: '删除流水', danger: true,
          message: '确认删除 ' + l.date + '「' + l.desc + '」这笔' + l.type + '流水？' + (l.auto ? '注意：这是对账自动入账，删除后将无法与缴费单核销记录对应。' : ''),
          onOk: function () {
            PayStore.remove('ledger', l.id, l.desc);
            self.toast('流水已删除', 'success');
            PayApp.renderLedger(el);
          }
        });
      };
    });
  },

  expenseModal: function (el) {
    var self = this;
    var cats = ['活动物资', '团日活动', '打印资料', '文体器材', '慰问品', '其他'];
    this.modal({
      title: '记一笔支出', okText: '入账',
      body:
        '<div class="pay-form">' +
        this.formRow('类别', '<select class="pay-input" id="ex-cat">' + cats.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
          '<input class="pay-input" id="ex-cat2" placeholder="选「其他」时填自定义类别" style="margin-top:6px;display:none">') +
        this.formRow('金额（元）', '<input class="pay-input" id="ex-amount" type="number" min="0.01" step="0.01" placeholder="如 45.50">') +
        this.formRow('日期', '<input class="pay-input" id="ex-date" type="date" value="' + PayUtils.today() + '">') +
        this.formRow('事由', '<input class="pay-input" id="ex-desc" placeholder="如：运动会饮用水（2 箱）">') +
        this.formRow('凭证', '<input class="pay-input" id="ex-proof" placeholder="发票/小票留存方式（选填）">') +
        '</div>',
      onSubmit: function (mask, close) {
        var cat = mask.querySelector('#ex-cat').value;
        if (cat === '其他') cat = mask.querySelector('#ex-cat2').value.trim() || '其他';
        var amountFen = PayUtils.yuanToFen(mask.querySelector('#ex-amount').value);
        var date = mask.querySelector('#ex-date').value;
        var desc = mask.querySelector('#ex-desc').value.trim();
        if (!amountFen) { self.toast('金额需为大于 0 的数字', 'warning'); return; }
        if (!date) { self.toast('请选择日期', 'warning'); return; }
        if (!desc) { self.toast('请填写事由', 'warning'); return; }
        PayStore.add('ledger', {
          className: (PayStore.list('roster')[0] || {}).className || '', type: '支出',
          category: cat, amountFen: amountFen, date: date, desc: desc,
          proof: mask.querySelector('#ex-proof').value.trim(), auto: false,
          by: self.me().name + (self.me().post ? '（' + self.me().post + '）' : '')
        }, desc + ' · ¥ ' + PayUtils.fenYuan(amountFen));
        close();
        self.toast('支出已入账', 'success');
        PayApp.renderLedger(el);
      }
    });
    var sel = document.querySelector('#ex-cat');
    sel.onchange = function () {
      document.getElementById('ex-cat2').style.display = sel.value === '其他' ? '' : 'none';
    };
  },

  /* ================= 管理端 · 公示 ================= */

  renderNotice: function (el) {
    var self = this;
    var all = PayStore.list('ledger');
    var months = [];
    all.forEach(function (l) {
      var m = (l.date || '').slice(0, 7);
      if (m && months.indexOf(m) === -1) months.push(m);
    });
    months.sort().reverse();
    if (!this.state.noticeMonth) this.state.noticeMonth = months[0] || PayUtils.today().slice(0, 7);
    el.innerHTML =
      '<div class="card">' +
      '  <div class="pay-toolbar">' +
      '    <label class="pay-muted pay-sm">公示月份</label>' +
      '    <select class="pay-input pay-input-auto" id="nt-month">' +
      (months.length ? months.map(function (m) { return '<option' + (m === self.state.noticeMonth ? ' selected' : '') + '>' + m + '</option>'; }).join('') : '<option>' + self.state.noticeMonth + '</option>') +
      '    </select>' +
      '    <div class="pay-toolbar-gap"></div>' +
      '    <button class="pay-btn pay-btn-primary" id="nt-gen">生成公示文稿</button>' +
      '    <button class="pay-btn pay-btn-ghost" id="nt-copy" disabled>复制</button>' +
      '    <button class="pay-btn pay-btn-ghost" id="nt-print" disabled>打印 / 存档</button>' +
      '  </div>' +
      '  <textarea class="pay-input pay-notice-text" id="nt-text" rows="18" readonly placeholder="选择月份后点击「生成公示文稿」。收入、支出、结余将自动带人民币大写，符合公文口径。"></textarea>' +
      '  <p class="pay-muted pay-sm">公示口径：收入=账本全部收入流水；支出逐笔列示（壹、贰、叁编号）；金额同时给出小写与大写。导语可用 AI 生成（未配置时自动用离线模板）。</p>' +
      '</div>';
    document.getElementById('nt-month').onchange = function (e) { PayApp.state.noticeMonth = e.target.value; PayApp.renderNotice(el); };
    document.getElementById('nt-gen').onclick = async function () { await PayApp.genNotice(el); };
    document.getElementById('nt-copy').onclick = function () {
      var t = document.getElementById('nt-text').value;
      self.toast(PayUtils.copy(t) ? '公示文稿已复制' : '复制失败', PayUtils.copy(t) ? 'success' : 'error');
    };
    document.getElementById('nt-print').onclick = function () {
      var t = document.getElementById('nt-text').value;
      PayApp.openPrint('班级收支公示', '<h1>收支公示</h1><div class="sub">班级缴费中心 · 自动生成</div><pre>' + PayUtils.esc(t) + '</pre>' +
        '<div class="foot">公示人：' + PayUtils.esc(self.me().name) + ' · ' + PayUtils.today() + '</div>');
    };
  },

  genNotice: async function (el) {
    var self = this;
    var m = this.state.noticeMonth;
    var rows = PayStore.list('ledger').filter(function (l) { return (l.date || '').slice(0, 7) === m; });
    if (!rows.length) { this.toast('该月没有流水，无法公示', 'warning'); return; }
    var className = (rows[0] || {}).className || (PayStore.list('roster')[0] || {}).className || '本班';
    var income = 0, expense = 0;
    var expLines = [];
    rows.forEach(function (l) {
      if (l.type === '收入') income += l.amountFen;
      else { expense += l.amountFen; expLines.push(l); }
    });
    var balance = income - expense;
    var ta = document.getElementById('nt-text');
    var btn = document.getElementById('nt-gen');
    btn.disabled = true; btn.textContent = '生成中…';
    var lead = await PayAI.draftNotice(m, className, income, expense, balance);
    btn.disabled = false; btn.textContent = '生成公示文稿';
    var CN = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
    var text =
      className + ' 班费/团费收支公示（' + m.replace('-', ' 年 ') + ' 月）\n' +
      '────────────────────────\n' +
      lead.text + (lead.offline ? '\n（导语：离线模板生成）' : '\n（导语：AI 生成）') + '\n\n' +
      '一、本月收入\n' +
      '  收入合计：¥ ' + PayUtils.fenYuan(income) + '（' + PayUtils.fenCN(income) + '）\n' +
      (rows.filter(function (l) { return l.type === '收入'; }).map(function (l) {
        return '  · ' + l.date + ' ' + l.desc + '：¥ ' + PayUtils.fenYuan(l.amountFen);
      }).join('\n')) + '\n\n' +
      '二、本月支出（共 ' + expLines.length + ' 笔）\n' +
      (expLines.length ? expLines.map(function (l, i) {
        return '  ' + CN[i] + '、' + l.date + ' ' + l.category + ' · ' + l.desc + '：¥ ' + PayUtils.fenYuan(l.amountFen) + '（' + PayUtils.fenCN(l.amountFen) + '）';
      }).join('\n') : '  本月无支出') + '\n' +
      '  支出合计：¥ ' + PayUtils.fenYuan(expense) + '（' + PayUtils.fenCN(expense) + '）\n\n' +
      '三、本月结余\n' +
      '  结余：¥ ' + PayUtils.fenYuan(balance) + '（' + PayUtils.fenCN(balance) + '）\n\n' +
      '经办人：' + this.me().name + (this.me().post ? '（' + this.me().post + '）' : '') + '\n' +
      '监督：辅导员 / 班委会\n公示日期：' + PayUtils.today() + '\n' +
      '（本公示由班级缴费中心按账本流水自动生成）';
    ta.value = text;
    document.getElementById('nt-copy').disabled = false;
    document.getElementById('nt-print').disabled = false;
    this.toast(lead.offline ? '公示文稿已生成（离线模板）' : '公示文稿已生成（AI 导语）', 'success');
  },

  /* ================= 管理端 · 智能审计 ================= */

  renderAudit: function (el) {
    var self = this;
    var last = PayAudit.lastResult();
    el.innerHTML =
      '<div class="card"><div class="pay-card-head"><b>智能审计</b>' +
      '  <span class="pay-muted pay-sm">只读核验 · 不修改任何数据 · 结论全部带证据</span></div>' +
      '  <div class="pay-toolbar">' +
      '    <button class="pay-btn pay-btn-primary" id="au-run">运行审计</button>' +
      '    <button class="pay-btn pay-btn-ghost" id="au-report" disabled>生成 AI 审计意见</button>' +
      '    <button class="pay-btn pay-btn-ghost" id="au-copy" disabled>复制报告</button>' +
      '    <button class="pay-btn pay-btn-ghost" id="au-print" disabled>打印 / 存档</button>' +
      '    <span class="pay-muted pay-sm" id="au-note">' + (last ? '上次审计：' + PayUtils.esc(last.at) : '尚未运行，点击「运行审计」开始') + '</span>' +
      '  </div>' +
      '  <div id="au-summary">' + (last ? this.auditSummaryHTML(last) : '') + '</div>' +
      '</div>' +
      '<div id="au-findings">' + (last ? this.auditFindingsHTML(last) : '') + '</div>' +
      '<div class="card" id="au-report-card" style="display:none"><div class="pay-card-head"><b>审计意见</b><span class="pay-muted pay-sm" id="au-report-mark"></span></div>' +
      '  <textarea class="pay-input pay-notice-text" id="au-report-text" rows="12" readonly></textarea>' +
      '</div>' +
      '<div class="card"><div class="pay-card-head"><b>操作留痕统计（近 30 天）</b><span class="pay-muted pay-sm">来源：本应用审计日志（滚动 500 条）</span></div>' +
      '  <div id="au-activity">' + this.auditActivityHTML() + '</div>' +
      '</div>';

    document.getElementById('au-run').onclick = async function () {
      var btn = this;
      btn.disabled = true; btn.textContent = '审计中…';
      await new Promise(function (r) { setTimeout(r, 400); });   // 让状态先渲染（规则执行本身是同步的）
      var result = PayAudit.run();
      btn.disabled = false; btn.textContent = '运行审计';
      document.getElementById('au-note').textContent = '上次审计：' + result.at;
      document.getElementById('au-summary').innerHTML = self.auditSummaryHTML(result);
      document.getElementById('au-findings').innerHTML = self.auditFindingsHTML(result);
      document.getElementById('au-report').disabled = false;
      // 重跑后旧的报告已过时，隐藏
      document.getElementById('au-report-card').style.display = 'none';
      document.getElementById('au-copy').disabled = true;
      document.getElementById('au-print').disabled = true;
      self.toast('审计完成：高 ' + result.summary.high + ' · 中 ' + result.summary.medium + ' · 低 ' + result.summary.low,
        result.summary.high ? 'error' : (result.summary.medium ? 'warning' : 'success'));
    };
    document.getElementById('au-report').onclick = async function () {
      var last2 = PayAudit.lastResult();
      if (!last2) return;
      var btn = this;
      btn.disabled = true; btn.textContent = '生成中…';
      var r = await PayAudit.report(last2);
      btn.disabled = false; btn.textContent = '生成 AI 审计意见';
      document.getElementById('au-report-card').style.display = '';
      document.getElementById('au-report-text').value = r.text;
      document.getElementById('au-report-mark').textContent = r.offline
        ? '离线规则模板生成（' + r.ms + 'ms）· 可在「设置 → AI 助手」接入本机模型'
        : 'AI 生成（' + r.ms + 'ms · 本机模型）';
      document.getElementById('au-copy').disabled = false;
      document.getElementById('au-print').disabled = false;
      self.toast(r.offline ? '审计意见已生成（离线模板）' : 'AI 审计意见已生成', r.offline ? 'warning' : 'success');
    };
    document.getElementById('au-copy').onclick = function () {
      var t = document.getElementById('au-report-text').value;
      var ok = PayUtils.copy(t);
      self.toast(ok ? '审计意见已复制' : '复制失败', ok ? 'success' : 'error');
    };
    document.getElementById('au-print').onclick = function () {
      var t = document.getElementById('au-report-text').value;
      PayApp.openPrint('缴费事项审计意见', '<h1>缴费事项审计意见</h1><div class="sub">班级缴费中心 · 智能审计 · 只读核验</div>' +
        '<pre>' + PayUtils.esc(t) + '</pre>' +
        '<div class="foot">审计人：' + PayUtils.esc(self.me().name) + ' · ' + PayUtils.today() + '</div>');
    };
    // 上次结论已有，可直接生成报告
    if (last) document.getElementById('au-report').disabled = false;
  },

  auditSummaryHTML: function (result) {
    var s = result.summary;
    var tone = s.high > 0 ? 'danger' : (s.medium > 0 ? 'warning' : (s.low > 0 ? 'info' : 'success'));
    var cls = { danger: 'pay-chip-warn', warning: 'pay-chip-warn', info: 'pay-chip-host', success: 'pay-chip-success' }[tone];
    var riskText = { '高风险': '发现高风险事项，请优先处理', '中风险': '存在需核实的事项', '关注': '仅提示级事项，保持关注', '正常': '未发现异常，账实相符' }[s.risk];
    return '<div class="pay-stats">' +
      this.statCard('总体评级', s.risk, riskText, s.high ? 'orange' : (s.medium ? 'gold' : 'green')) +
      this.statCard('高风险', String(s.high), '项', 'orange') +
      this.statCard('中风险', String(s.medium), '项', 'gold') +
      this.statCard('提示', String(s.low), '项', 'blue') +
      '</div>' +
      '<div style="margin:-6px 0 4px"><span class="pay-chip ' + cls + '">' +
      (s.high ? '✕ ' : (s.medium ? '！ ' : '✓ ')) + PayUtils.esc(s.risk) + '</span>' +
      ' <span class="pay-chip">核验规则 ' + s.total + ' 条</span>' +
      ' <span class="pay-chip">费项 ' + PayStore.list('fees').length + ' · 缴费单 ' + PayStore.list('orders').length + ' · 流水 ' + PayStore.list('ledger').length + '</span>' +
      ' <span class="pay-chip pay-chip-host">审计基准 ' + PayUtils.esc(result.at) + '</span></div>';
  },

  auditFindingsHTML: function (result) {
    var LV = { high: { t: '高风险事项', tone: 'danger' }, medium: { t: '中风险事项', tone: 'warning' }, low: { t: '提示事项', tone: 'info' } };
    var self = this;
    if (!result.findings.length) {
      return '<div class="card"><div class="pay-empty"><b>安</b><p>未发现异常：账实相符、对账闭环、无凭证缺失与重复入账迹象。</p></div></div>';
    }
    var levels = ['high', 'medium', 'low'];
    var html = '';
    levels.forEach(function (lv) {
      var items = result.findings.filter(function (f) { return f.level === lv; });
      if (!items.length) return;
      html += '<div class="card"><div class="pay-card-head"><b>' + LV[lv].t + '</b>' +
        self.badge(items.length + ' 项', LV[lv].tone) + '</div>';
      items.forEach(function (f, i) {
        html += '<div class="pay-fee-card">' +
          '<div class="pay-fee-head"><div><b>' + PayUtils.esc(f.title) + '</b>' +
          self.badge({ high: '高', medium: '中', low: '提示' }[f.level], LV[lv].tone) + '</div></div>' +
          '<div class="pay-fee-meta">' + PayUtils.esc(f.detail) + '</div>' +
          (f.evidence && f.evidence.length
            ? '<div class="pay-audit-evidence">' + f.evidence.map(function (e) {
              return '<div>· ' + PayUtils.esc(e) + '</div>';
            }).join('') +
              (f.evidenceMore > f.evidence.length ? '<div class="pay-muted">… 等共 ' + f.evidenceMore + ' 条</div>' : '') + '</div>'
            : '') +
          '<div class="pay-fee-foot"><span class="pay-muted pay-sm">建议：' + PayUtils.esc(f.suggestion) + '</span></div>' +
          '</div>';
      });
      html += '</div>';
    });
    return html;
  },

  auditActivityHTML: function () {
    var st = PayAudit.activityStats();
    if (!st.rows.length) return '<div class="pay-empty"><b>空</b><p>近 30 天暂无操作留痕。</p></div>';
    var acts = Object.keys(st.actions).map(function (a) { return a + ' ' + st.actions[a]; }).join(' · ');
    return '<div class="pay-muted pay-sm" style="margin-bottom:8px">动作分布：' + PayUtils.esc(acts) + '</div>' +
      '<table class="pay-table"><thead><tr><th>操作人</th><th>动作</th><th class="pay-th-money">次数</th></tr></thead><tbody>' +
      st.rows.slice(0, 10).map(function (r) {
        return '<tr><td>' + PayUtils.esc(r.who) + '</td><td>' + PayUtils.esc(r.action) + '</td>' +
          '<td class="pay-td-money">' + r.count + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (st.rows.length > 10 ? '<div class="pay-muted pay-sm" style="margin-top:6px">仅显示前 10 行（共 ' + st.rows.length + ' 组）</div>' : '');
  },

  /* ================= 管理端 · 设置 ================= */

  renderSettings: function (el) {
    var self = this;
    var cfg = PAY.config();
    var ai = PayAI.cfg();
    el.innerHTML =
      '<div class="card"><div class="pay-card-head"><b>支付网关</b>' + this.gatewayBadgeHTML() + '</div>' +
      '  <div class="pay-form">' +
      this.formRow('通道', '<select class="pay-input" id="st-gw">' +
        PAY.GATEWAYS.map(function (g) { return '<option value="' + g.id + '"' + (g.id === cfg.gateway ? ' selected' : '') + '>' + PayUtils.esc(g.name) + '</option>'; }).join('') + '</select>') +
      '  <p class="pay-muted pay-sm" id="st-gw-hint"></p>' +
      this.formRow('网关地址', '<input class="pay-input" id="st-base" value="' + PayUtils.esc(cfg.base || '') + '" placeholder="http://127.0.0.1:8818">') +
      this.formRow('应用 AppID', '<input class="pay-input" id="st-appid" value="' + PayUtils.esc(cfg.appId || '') + '" placeholder="校园网关 / 支付宝签约应用 appId（选填）">') +
      '  <div class="pay-btn-row">' +
      '    <button class="pay-btn pay-btn-primary pay-btn-sm" id="st-save">保存配置</button>' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" id="st-ping">检测连通</button>' +
      '    <span class="pay-muted pay-sm" id="st-ping-result"></span>' +
      '  </div></div>' +
      '  <p class="pay-muted pay-sm">配置只存本机浏览器，不写进代码；密钥永远只放服务端（pay_server.py 的 config.json 或校园网关），不经浏览器。验签在服务端完成。</p>' +
      '</div>' +

      '<div class="card"><div class="pay-card-head"><b>AI 助手（催缴文案 / 公示导语）</b></div>' +
      '  <div class="pay-form">' +
      this.formRow('启用', '<label class="pay-radio"><input type="checkbox" id="st-ai-on"' + (ai.enabled ? ' checked' : '') + '> 启用 AI 文案（未启用或不可用时自动落离线模板）</label>') +
      this.formRow('接口地址', '<input class="pay-input" id="st-ai-base" value="' + PayUtils.esc(ai.base || '') + '" placeholder="http://localhost:11434/v1">') +
      this.formRow('模型', '<input class="pay-input" id="st-ai-model" value="' + PayUtils.esc(ai.model || '') + '" placeholder="qwen2.5:3b">') +
      '  <div class="pay-btn-row">' +
      '    <button class="pay-btn pay-btn-primary pay-btn-sm" id="st-ai-save">保存</button>' +
      '    <button class="pay-btn pay-btn-ghost pay-btn-sm" id="st-ai-detect">自动探测本机 Ollama</button>' +
      '    <span class="pay-muted pay-sm" id="st-ai-result"></span>' +
      '  </div></div></div>' +

      '<div class="card"><div class="pay-card-head"><b>演示数据</b></div>' +
      '  <p class="pay-muted pay-sm">重置后恢复初始演示名册（12 人）、两个示例费项与账本流水；用于答辩前的数据复位。</p>' +
      '  <div class="pay-btn-row"><button class="pay-btn pay-btn-ghost pay-btn-sm pay-btn-danger" id="st-reset">重置演示数据</button></div>' +
      '</div>' +

      '<div class="card"><div class="pay-card-head"><b>关于</b></div>' +
      '  <p class="pay-muted pay-sm">班级缴费中心 v' + this.version + ' · 独立微应用（与宿主系统契约挂接：身份缝 loginAsExternal · 名册缝 importRoster · 网关缝 GATEWAYS）。' +
      '金额一律以「分」存储；验签在服务端完成；演示模式无任何真实资金流动。</p>' +
      '</div>';

    function fillHint() {
      var id = document.getElementById('st-gw').value;
      var g = PAY.GATEWAYS.filter(function (x) { return x.id === id; })[0];
      document.getElementById('st-gw-hint').textContent = g.hint;
      if (g.base && !document.getElementById('st-base').value) document.getElementById('st-base').value = g.base;
    }
    fillHint();
    document.getElementById('st-gw').onchange = fillHint;
    document.getElementById('st-save').onclick = function () {
      PAY.saveConfig({
        gateway: document.getElementById('st-gw').value,
        base: document.getElementById('st-base').value.trim(),
        appId: document.getElementById('st-appid').value.trim()
      });
      self.toast('网关配置已保存（仅存本机）', 'success');
      PayStore._log('系统', '保存网关配置', document.getElementById('st-gw').value);
    };
    document.getElementById('st-ping').onclick = async function () {
      var r = document.getElementById('st-ping-result');
      r.textContent = '检测中…';
      var res = await PAY.ping();
      r.textContent = (res.ok ? '✓ ' : '✕ ') + res.message;
      self.toast(res.message, res.ok ? 'success' : 'warning');
    };
    document.getElementById('st-ai-save').onclick = function () {
      PayAI.saveCfg({
        enabled: document.getElementById('st-ai-on').checked,
        base: document.getElementById('st-ai-base').value.trim(),
        model: document.getElementById('st-ai-model').value.trim()
      });
      self.toast('AI 配置已保存', 'success');
    };
    document.getElementById('st-ai-detect').onclick = async function () {
      var r = document.getElementById('st-ai-result');
      r.textContent = '探测中…';
      var f = await PayAI.detect();
      if (f.ok) {
        document.getElementById('st-ai-base').value = f.base;
        document.getElementById('st-ai-model').value = f.model;
        PayAI.saveCfg({ enabled: true, base: f.base, model: f.model });
        r.textContent = '✓ 已接入 ' + f.model + '（共 ' + f.models.length + ' 个本机模型）';
        self.toast('本机 Ollama 已接入：' + f.model, 'success');
      } else {
        r.textContent = '✕ 未检测到本机 Ollama（11434 端口）。AI 将自动使用离线模板。';
        self.toast('未检测到本机 Ollama，离线模板兜底', 'warning');
      }
    };
    document.getElementById('st-reset').onclick = function () {
      self.confirm({
        title: '重置演示数据', danger: true,
        message: '确认重置？当前所有费项、缴费单与账本流水将被清空并恢复初始演示数据。',
        onOk: function () {
          PayStore.reset();
          self.state.route = '';
          self.toast('已重置演示数据', 'success');
          PayApp.enter();
        }
      });
    };
  },

  /* ================= 学生端 · 我的缴费 ================= */

  renderMine: function (el) {
    var self = this;
    var me = this.me();
    var orders = this.myOrders();
    var feeMap = {};
    PayStore.list('fees').forEach(function (f) { feeMap[f.id] = f; });
    var due = orders.filter(function (o) { return o.status === '待支付' || o.status === '支付中'; });
    var done = orders.filter(function (o) { return o.status === '已支付' || o.status === '已核销'; });
    var dueSum = due.reduce(function (s, o) { return s + o.amountFen; }, 0);
    el.innerHTML =
      '<div class="pay-hero card"><div class="pay-hero-main"><span class="pay-seal pay-seal-lg">缴</span>' +
      '  <div><h2>' + PayUtils.esc(me.name) + '，你有 ' + due.length + ' 笔待缴费</h2>' +
      '  <p class="pay-muted">待缴合计 ¥ ' + PayUtils.fenYuan(dueSum) + ' · 支持支付宝（演示收银台）</p></div></div></div>' +
      (due.length ? '<div class="pay-due-list">' + due.map(function (o) { return self.dueCardHTML(o, feeMap[o.feeId]); }).join('') + '</div>' : '') +
      '<div class="card"><div class="pay-card-head"><b>缴费记录</b></div>' +
      (orders.length ? '<table class="pay-table"><thead><tr><th>费项</th><th class="pay-th-money">金额</th><th>状态</th><th>支付时间</th><th class="pay-th-ops">凭证</th></tr></thead><tbody>' +
        orders.slice().sort(function (a, b) { return (b.paidAt || '') < (a.paidAt || '') ? -1 : 1; }).map(function (o) {
          return '<tr><td>' + PayUtils.esc(o.feeName) + '</td>' +
            '<td class="pay-td-money">¥ ' + PayUtils.fenYuan(o.amountFen) + '</td>' +
            '<td>' + self.badge(o.status, self.STATUS_BADGE[o.status]) + '</td>' +
            '<td class="pay-muted pay-sm">' + PayUtils.esc(o.paidAt || '—') + '</td>' +
            '<td class="pay-td-ops">' + ((o.status === '已支付' || o.status === '已核销') ? '<button class="pay-btn pay-btn-ghost pay-btn-sm" data-rc="' + PayUtils.esc(o.id) + '">查看凭证</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<div class="pay-empty"><b>空</b><p>暂无缴费记录。</p></div>') +
      '</div>';
    el.querySelectorAll('[data-pay-go]').forEach(function (b) {
      b.onclick = function () { PayApp.openCashier(b.getAttribute('data-pay-go')); };
    });
    el.querySelectorAll('[data-rc]').forEach(function (b) {
      b.onclick = function () {
        var o = PayStore.find('orders', b.getAttribute('data-rc'));
        if (o) PayApp.receiptModal(o);
      };
    });
  },

  dueCardHTML: function (o, fee) {
    return '<div class="pay-due-card card">' +
      '<div class="pay-due-left"><b>' + PayUtils.esc(o.feeName) + '</b>' + this.badge(o.kind, o.kind === '团费' ? 'gold' : 'blue') +
      '<div class="pay-muted pay-sm">' + PayUtils.esc(o.className) + ' · 应缴 ¥ ' + PayUtils.fenYuan(o.amountFen) +
      (fee && fee.deadline ? ' · 截止 ' + PayUtils.esc(fee.deadline) : '') + '</div></div>' +
      '<button class="pay-btn pay-btn-primary" data-pay-go="' + PayUtils.esc(o.id) + '">' + (o.status === '支付中' ? '继续支付' : '去支付') + '</button>' +
      '</div>';
  },

  /* ================= 收银台（全屏浮层） ================= */

  openCashier: function (orderId) {
    var self = this;
    var o = PayStore.find('orders', orderId);
    if (!o) return;
    if (o.status !== '待支付' && o.status !== '支付中') { this.toast('该笔缴费已处理，无需重复支付', 'info'); return; }
    // 幂等：续付复用同一缴费单号
    if (!o.outTradeNo) {
      var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      o.outTradeNo = 'BJ' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
        '-' + Math.floor(1000 + Math.random() * 9000);
      o.gatewayId = PAY.active().def.id;
      PayStore.update('orders', o.id, { outTradeNo: o.outTradeNo, gatewayId: o.gatewayId, status: '支付中' }, o.feeName + ' · ' + o.name);
      o.status = '支付中';
    } else if (o.status === '待支付') {
      PayStore.update('orders', o.id, { status: '支付中' }, o.feeName + ' · ' + o.name);
      o.status = '支付中';
    }
    var a = PAY.active();
    var isMock = a.mode === 'mock';
    var mask = document.createElement('div');
    mask.className = 'pay-mask pay-cashier-mask';
    mask.innerHTML =
      '<div class="pay-cashier" role="dialog">' +
      '  <div class="pay-cashier-head"><b>支付宝 · 班级缴费</b><span class="pay-cashier-demo">演示收银台</span>' +
      '    <button class="pay-modal-x" id="cs-x">✕</button></div>' +
      '  <div class="pay-cashier-body">' +
      '    <div class="pay-cashier-amount"><i>应缴金额</i><b>¥ ' + PayUtils.fenYuan(o.amountFen) + '</b></div>' +
      '    <div class="pay-cashier-info">' +
      '      <div><span>费项</span><u>' + PayUtils.esc(o.feeName) + '</u></div>' +
      '      <div><span>缴费人</span><u>' + PayUtils.esc(o.name) + '（' + PayUtils.esc(o.studentNo) + '）</u></div>' +
      '      <div><span>缴费单号</span><u>' + PayUtils.esc(o.outTradeNo) + '</u></div>' +
      '      <div><span>收款方式</span><u>' + PayUtils.esc(a.def.name) + '</u></div>' +
      '    </div>' +
      '    <div class="pay-cashier-qrwrap"><canvas id="cs-qr" width="220" height="220"></canvas>' +
      '      <div class="pay-muted pay-sm" id="cs-msg">正在向网关下单…</div>' +
      '      <div class="pay-cashier-count pay-muted pay-sm">剩余支付时间 <b id="cs-count">15:00</b></div></div>' +
      '    <div class="pay-btn-row" id="cs-ops">' +
      (isMock
        ? '<button class="pay-btn pay-btn-primary" id="cs-mock-ok">✓ 模拟支付成功</button>' +
          '<button class="pay-btn pay-btn-ghost" id="cs-mock-fail">✕ 模拟支付失败</button>'
        : (a.mode === 'local' ? '<button class="pay-btn pay-btn-ghost" id="cs-mock-gw">模拟网关回调（演练异步通知）</button>' : '')) +
      '    </div>' +
      '  </div></div>';
    document.body.appendChild(mask);
    document.body.style.overflow = 'hidden';
    setTimeout(function () { mask.classList.add('on'); }, 20);

    var paid = false, closed = false, timer = null, poll = null, left = 15 * 60;
    function cleanup() {
      if (timer) clearInterval(timer);
      if (poll) clearInterval(poll);
      poll = timer = null;
    }
    function close() {
      if (closed) return; closed = true;
      cleanup();
      mask.classList.remove('on');
      document.body.style.overflow = '';
      setTimeout(function () { mask.remove(); }, 200);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape' && !paid) release(); else if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    mask.querySelector('#cs-x').onclick = function () { if (paid) close(); else release(); };

    function release() {
      if (paid || closed) return;
      closed = true; cleanup();
      PayStore.update('orders', o.id, { status: '待支付' }, o.feeName + ' · 释放支付锁');
      self.toast('已取消本次支付', 'info');
      closeRender();
    }
    function closeRender() {
      document.body.style.overflow = '';
      mask.remove();
      document.removeEventListener('keydown', onKey);
      if (PayApp.state.route === 'mine') PayApp.renderMine(document.getElementById('pay-content'));
    }

    function expire() {
      if (paid || closed) return;
      closed = true; cleanup();
      PayStore.update('orders', o.id, { status: '待支付' }, o.feeName + ' · 支付超时');
      mask.querySelector('.pay-cashier-body').innerHTML =
        '<div class="pay-cashier-done"><span class="pay-done-icon pay-done-warn">！</span><h3>支付超时</h3>' +
        '<p class="pay-muted">二维码已失效，订单已退回待支付，可重新发起。</p></div>';
    }

    async function markPaid(receipt, verify) {
      if (paid || closed) return;
      paid = true; cleanup();
      var now = PayUtils.fmtDateTime(new Date());
      PayStore.update('orders', o.id, {
        status: '已支付',
        paidAt: (receipt && receipt.paidAt) ? String(receipt.paidAt).replace('T', ' ').slice(0, 16) : now,
        tradeNo: (receipt && receipt.tradeNo) || '',
        channel: (receipt && receipt.channel) || a.def.name
      }, o.feeName + ' · ' + o.name + ' · ¥ ' + PayUtils.fenYuan(o.amountFen));
      var verifyNote = '';
      if (verify && verify.ok) {
        verifyNote = verify.verified ? '<span class="pay-chip pay-chip-success">✓ 网关已验签' + (verify.note && verify.note.indexOf('演示') !== -1 ? '（演示闭环）' : '') + '</span>'
          : '<span class="pay-chip pay-chip-warn">！验签未通过，请联系经办人</span>';
      } else if (isMock) {
        verifyNote = '<span class="pay-chip">演示模式 · 无资金流动</span>';
      }
      mask.querySelector('.pay-cashier-body').innerHTML =
        '<div class="pay-cashier-done"><span class="pay-done-icon pay-done-ok">✓</span><h3>支付成功</h3>' +
        '<p class="pay-cashier-done-amount">¥ ' + PayUtils.fenYuan(o.amountFen) + '</p>' +
        '<p class="pay-muted pay-sm">缴费单号 ' + PayUtils.esc(o.outTradeNo) + '</p>' +
        '<div class="pay-cashier-verify">' + verifyNote + '</div></div>';
      mask.querySelector('.pay-cashier-body').insertAdjacentHTML('beforeend',
        '<div class="pay-btn-row pay-center">' +
        '<button class="pay-btn pay-btn-primary" id="cs-done">完成</button>' +
        '<button class="pay-btn pay-btn-ghost" id="cs-rc">查看凭证</button></div>');
      mask.querySelector('#cs-done').onclick = closeRender;
      mask.querySelector('#cs-rc').onclick = function () {
        var o2 = PayStore.find('orders', o.id);
        closeRender();
        if (o2) PayApp.receiptModal(o2);
      };
      self.toast('支付成功：' + o.feeName, 'success');
    }

    function startPoll() {
      poll = setInterval(async function () {
        var r = await PAY.queryOrder(o.outTradeNo);
        if (!r.ok) return;
        if (r.status === 'PAID') {
          var v = isMock ? null : await PAY.verifyReceipt(o.outTradeNo);
          await markPaid(r.receipt, v);
        }
        else if (r.status === 'CLOSED') expire();
      }, 2000);
    }

    (async function init() {
      var res = await PAY.createOrder({ outTradeNo: o.outTradeNo, subject: o.feeName, amountFen: o.amountFen, studentNo: o.studentNo, name: o.name, feeId: o.feeId });
      var msg = mask.querySelector('#cs-msg');
      if (!res.ok) {
        msg.innerHTML = '<span class="pay-danger-text">✕ ' + PayUtils.esc(res.message) + '</span>';
        return;
      }
      msg.textContent = '请用支付宝扫码支付' + (isMock ? '（演示二维码，也可点下方按钮模拟结果）' : '');
      PAY.drawQr(mask.querySelector('#cs-qr'), res.qrPayload || o.outTradeNo);
      if (res.payUrl && !isMock) msg.insertAdjacentHTML('beforeend', '<br><a class="pay-link" href="' + PayUtils.esc(res.payUrl) + '" target="_blank">打开放付方收银台</a>');
      startPoll();
    })();

    timer = setInterval(function () {
      left--;
      if (left <= 0) { expire(); return; }
      var m = Math.floor(left / 60), s = left % 60;
      var elc = mask.querySelector('#cs-count');
      if (elc) elc.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);

    var okBtn = mask.querySelector('#cs-mock-ok');
    if (okBtn) okBtn.onclick = async function () {
      await PAY.mockPay(o.outTradeNo, 'paid');
      var r = await PAY.queryOrder(o.outTradeNo);
      var v = await PAY.verifyReceipt(o.outTradeNo);
      await markPaid(r.receipt, v);
    };
    var failBtn = mask.querySelector('#cs-mock-fail');
    if (failBtn) failBtn.onclick = function () {
      self.toast('支付失败（模拟）：余额不足', 'error');
      release();
    };
    var gwBtn = mask.querySelector('#cs-mock-gw');
    if (gwBtn) gwBtn.onclick = async function () {
      await PAY.mockPay(o.outTradeNo, 'paid');
      self.toast('已模拟网关异步回调，等待下一次轮询确认…', 'info');
    };
  },

  /* ================= 凭证 ================= */

  receiptModal: function (o) {
    var self = this;
    var noCN = 'No.' + (o.outTradeNo || o.id);
    this.modal({
      title: '缴费凭证', footer: false,
      body:
        '<div class="pay-receipt">' +
        '  <div class="pay-receipt-head"><span class="pay-seal">缴</span><b>班级缴费专用凭证</b><i>班级缴费中心出具</i></div>' +
        '  <div class="pay-receipt-row"><span>费项</span><u>' + PayUtils.esc(o.feeName) + '</u></div>' +
        '  <div class="pay-receipt-row"><span>缴费人</span><u>' + PayUtils.esc(o.name) + '（' + PayUtils.esc(o.studentNo) + '）</u></div>' +
        '  <div class="pay-receipt-row"><span>金额</span><u class="pay-receipt-amount">¥ ' + PayUtils.fenYuan(o.amountFen) + '</u></div>' +
        '  <div class="pay-receipt-row"><span>大写</span><u>' + PayUtils.fenCN(o.amountFen) + '</u></div>' +
        '  <div class="pay-receipt-row"><span>支付渠道</span><u>' + PayUtils.esc(o.channel || '—') + '</u></div>' +
        '  <div class="pay-receipt-row"><span>缴费单号</span><u>' + PayUtils.esc(o.outTradeNo || '—') + '</u></div>' +
        '  <div class="pay-receipt-row"><span>交易号</span><u>' + PayUtils.esc(o.tradeNo || '—') + '</u></div>' +
        '  <div class="pay-receipt-row"><span>支付时间</span><u>' + PayUtils.esc(o.paidAt || '—') + '</u></div>' +
        '  <div class="pay-receipt-row"><span>状态</span><u>' + this.badge(o.status, this.STATUS_BADGE[o.status]) + '</u></div>' +
        (o.status === '已核销' ? '<div class="pay-receipt-stamp">已核销</div>' : '') +
        '</div>' +
        '<div class="pay-btn-row pay-center"><button class="pay-btn pay-btn-ghost pay-btn-sm" id="rc-print">打印凭证</button></div>'
    });
    var p = document.getElementById('rc-print');
    if (p) p.onclick = function () {
      PayApp.openPrint('缴费凭证 ' + noCN,
        '<h1>缴费凭证</h1><div class="sub">班级缴费中心 · ' + PayUtils.esc(noCN) + '</div>' +
        '<pre>费　项：' + PayUtils.esc(o.feeName) + '\n缴费人：' + PayUtils.esc(o.name) + '（' + PayUtils.esc(o.studentNo) + '）' +
        '\n金　额：¥ ' + PayUtils.fenYuan(o.amountFen) + '（' + PayUtils.fenCN(o.amountFen) + '）' +
        '\n渠　道：' + PayUtils.esc(o.channel || '—') + '\n单　号：' + PayUtils.esc(o.outTradeNo || '—') +
        '\n交易号：' + PayUtils.esc(o.tradeNo || '—') + '\n时　间：' + PayUtils.esc(o.paidAt || '—') +
        '\n状　态：' + o.status + '</pre>' +
        '<div class="foot">班级缴费中心 · 自动出具</div>');
    };
  },

  renderReceipts: function (el) {
    var self = this;
    var done = this.myOrders().filter(function (o) { return o.status === '已支付' || o.status === '已核销'; });
    el.innerHTML =
      '<div class="card"><div class="pay-card-head"><b>缴费凭证</b><span class="pay-muted pay-sm">已支付与已核销的缴费均可出具凭证</span></div>' +
      (done.length ? '<div class="pay-rc-list">' + done.map(function (o) {
        return '<div class="pay-rc-card">' +
          '<div class="pay-rc-main"><b>' + PayUtils.esc(o.feeName) + '</b>' +
          '<div class="pay-muted pay-sm">' + PayUtils.esc(o.paidAt || '') + ' · ' + PayUtils.esc(o.channel || '') + '</div></div>' +
          '<div class="pay-rc-amount">¥ ' + PayUtils.fenYuan(o.amountFen) + '</div>' +
          self.badge(o.status, self.STATUS_BADGE[o.status]) +
          '<button class="pay-btn pay-btn-ghost pay-btn-sm" data-rc="' + PayUtils.esc(o.id) + '">凭证</button>' +
          '</div>';
      }).join('') + '</div>' : '<div class="pay-empty"><b>空</b><p>完成首笔缴费后，这里会出现你的电子凭证。</p></div>') +
      '</div>';
    el.querySelectorAll('[data-rc]').forEach(function (b) {
      b.onclick = function () {
        var o = PayStore.find('orders', b.getAttribute('data-rc'));
        if (o) PayApp.receiptModal(o);
      };
    });
  }
};
