/* =====================================================
 * 班级缴费中心 · 核心层（pay-core.js）
 * -----------------------------------------------------
 * 独立微应用：自带数据层与身份契约桥，不依赖宿主任何脚本。
 * 设计对标宿主系统三条「接入缝」：
 *   · PayBridge.loginAsExternal  ← 镜像 Auth.loginAsExternal（trusted 可信标记）
 *   · PayBridge.importRoster     ← 镜像 Store.syncFromEdu（幂等契约导入 + skipped 容错）
 *   · PAY.GATEWAYS（pay-gateway.js）← 镜像 AI.PROVIDERS（空预设，配置存本机）
 * 数据键一律 pay_ 前缀，与宿主 cms_ 前缀隔离，互不触碰。
 * 铁律遵守：金额一律以「分」为单位的整数存储；日期用本地时区格式化；
 * 所有写操作写审计日志；页面不得裸调 localStorage（唯一出入口在 PayStore）。
 * ===================================================== */

var PayUtils = window.PayUtils = {};

/* ---------------- 基础工具 ---------------- */

/** 生成唯一 id（时间戳 + 随机段） */
PayUtils.uid = function () {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

/** 本地时区日期格式化 YYYY-MM-DD（禁用 toISOString，东八区会偏移一天） */
PayUtils.fmtDate = function (d) {
  var t = d ? new Date(d) : new Date();
  if (isNaN(t.getTime())) return '';
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
};

/** 本地时区日期时间格式化 YYYY-MM-DD HH:mm */
PayUtils.fmtDateTime = function (d) {
  var t = d ? new Date(d) : new Date();
  if (isNaN(t.getTime())) return '';
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return PayUtils.fmtDate(t) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes());
};

/** 今天（YYYY-MM-DD） */
PayUtils.today = function () { return PayUtils.fmtDate(new Date()); };

/** n 天前（n 为负则往后推） */
PayUtils.daysAgo = function (n) {
  var d = new Date(); d.setDate(d.getDate() - (n || 0));
  return PayUtils.fmtDate(d);
};

/** HTML 转义（所有动态插值必须过这里，全站惯例） */
PayUtils.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

/** 元（字符串输入）→ 分（整数）；非法或非正数返回 null */
PayUtils.yuanToFen = function (v) {
  var n = parseFloat(v);
  if (isNaN(n) || n <= 0 || n > 999999) return null;
  return Math.round(n * 100);
};

/** 分 → 「1,234.50」元字符串 */
PayUtils.fenYuan = function (fen) {
  fen = Math.round(fen || 0);
  var neg = fen < 0; fen = Math.abs(fen);
  var s = (fen / 100).toFixed(2);
  var parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + parts[0] + '.' + parts[1];
};

/** 分 → 人民币大写（公文公示用）：1234.56 → 壹仟贰佰叁拾肆元伍角陆分 */
PayUtils.fenCN = function (fen) {
  fen = Math.round(fen || 0);
  if (fen === 0) return '零元整';
  var neg = fen < 0; fen = Math.abs(fen);
  var D = '零壹贰叁肆伍陆柒捌玖';
  // 0~9999 → 中文（金额大写一律「壹拾」，不用「拾」简写）
  function sec(n) {
    var out = '';
    var q = Math.floor(n / 1000), b = Math.floor(n % 1000 / 100),
        s = Math.floor(n % 100 / 10), g = n % 10;
    if (q) out += D[q] + '仟';
    if (b) { if (q === 0 && out === '' && n >= 1000) out += '零'; out += D[b] + '佰'; }
    else if (q && (s || g)) out += '零';
    if (s) { out += D[s] + '拾'; }
    else if ((q || b) && g) out += '零';
    if (g) out += D[g];
    return out;
  }
  var yuan = Math.floor(fen / 100), jiao = Math.floor(fen % 100 / 10), feny = fen % 10;
  var text = '';
  var yi = Math.floor(yuan / 100000000),
      wan = Math.floor(yuan % 100000000 / 10000),
      rest = yuan % 10000;
  if (yi) text += sec(yi) + '亿';
  if (wan) {
    text += sec(wan) + '万';
    if (rest > 0 && rest < 1000) text += '零';
  }
  if (rest || (!wan && !yi)) text += sec(rest);
  if (text) text += '元';
  if (jiao) text += D[jiao] + '角';
  else if (feny && yuan) text += '零';
  if (feny) text += D[feny] + '分';
  if (yuan > 0 && jiao === 0 && feny === 0) text += '整';
  return (neg ? '负' : '') + text;
};

/** CSV 导出（带 BOM，Excel 直开不乱码） */
PayUtils.exportCSV = function (filename, head, rows) {
  var lines = [head.join(',')].concat(rows.map(function (r) {
    return r.map(function (c) {
      c = String(c == null ? '' : c);
      return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
    }).join(',');
  }));
  var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
};

/** 复制文本到剪贴板，成功返回 true */
PayUtils.copy = function (text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
};

/* =====================================================
 * PayStore：本应用唯一数据出入口（对标宿主 store.js 的角色）
 * ===================================================== */

var PayStore = window.PayStore = {
  /* 存储键（pay_ 前缀，与宿主 cms_ 完全隔离） */
  KEYS: {
    fees: 'pay_fees',        // 费项（团费/班费/活动经费…）
    orders: 'pay_orders',    // 缴费单（每人每费项一张）
    ledger: 'pay_ledger',    // 班费账本（收入/支出流水）
    roster: 'pay_roster',    // 班级名册（宿主契约导入或演示种子）
    logs: 'pay_logs',        // 本应用审计日志
    session: 'pay_session',  // 当前会话
    meta: 'pay_meta'         // 版本信息
  },

  /** 偏好键白名单（存 pay_pref_*） */
  PREF_KEYS: ['config', 'theme', 'audit'],

  ENTITY_NAMES: { fees: '费项', orders: '缴费单', ledger: '账本流水', roster: '班级名册' },

  /** 演示种子版本：示例内容变更时 +1，旧浏览器自动刷新种子 */
  SEED_VERSION: 2,

  /* ---------------- 底层读写 ---------------- */

  _raw: function (key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  _put: function (key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },

  read: function (key, fallback) { return this._raw(this.KEYS[key] || key, fallback == null ? null : fallback); },
  write: function (key, val) { this._put(this.KEYS[key] || key, val); },

  list: function (key) { var v = this.read(key, []); return Array.isArray(v) ? v : []; },

  find: function (key, pred) {
    if (typeof pred === 'string') { var id = pred; pred = function (x) { return x.id === id; }; }
    return this.list(key).filter(pred)[0] || null;
  },

  save: function (key, list) { this.write(key, list); },

  /** 新增：自动补 id/createdAt，并写审计日志 */
  add: function (key, rec, logDetail) {
    var list = this.list(key);
    rec.id = rec.id || PayUtils.uid();
    rec.createdAt = rec.createdAt || new Date().toISOString();
    list.push(rec);
    this.save(key, list);
    this._log(key, '新增', logDetail || rec.name || rec.studentNo || rec.id);
    return rec;
  },

  /** 更新：按 id 打补丁，自动补 updatedAt，并写审计日志 */
  update: function (key, id, patch, logDetail) {
    var list = this.list(key);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        for (var k in patch) if (patch[k] !== undefined) list[i][k] = patch[k];
        list[i].updatedAt = new Date().toISOString();
        this.save(key, list);
        this._log(key, '更新', logDetail || list[i].name || list[i].studentNo || id);
        return list[i];
      }
    }
    return null;
  },

  remove: function (key, id, logDetail) {
    var list = this.list(key);
    var next = list.filter(function (x) { return x.id !== id; });
    if (next.length !== list.length) {
      this.save(key, next);
      this._log(key, '删除', logDetail || id);
      return true;
    }
    return false;
  },

  /** 审计日志（滚动上限 500 条） */
  _log: function (entity, action, detail) {
    try {
      var logs = this.list('logs');
      logs.push({
        id: PayUtils.uid(),
        at: new Date().toISOString(),
        who: (this.session() && this.session().name) || '系统',
        entity: this.ENTITY_NAMES[entity] || entity,
        action: action,
        detail: detail || ''
      });
      if (logs.length > 500) logs = logs.slice(logs.length - 500);
      this.write('logs', logs);
    } catch (e) { /* 审计失败不阻断业务 */ }
  },

  /* ---------------- 偏好（对标 Store.getPref/setPref） ---------------- */

  getPref: function (name, fallback) {
    if (this.PREF_KEYS.indexOf(name) === -1) return fallback;
    return this._raw('pay_pref_' + name, fallback == null ? null : fallback);
  },
  setPref: function (name, val) {
    if (this.PREF_KEYS.indexOf(name) === -1) return;
    this._put('pay_pref_' + name, val);
  },

  /* ---------------- 会话 ---------------- */

  session: function () { return this.read('session', null); },
  setSession: function (s) { this.write('session', s); },

  /* ---------------- 初始化与演示种子 ---------------- */

  init: function () {
    var meta = this.read('meta', {}) || {};
    if (!meta.seeded) {
      this.seed();
      this.write('meta', { seeded: true, seedVersion: this.SEED_VERSION, seededAt: new Date().toISOString() });
      return;
    }
    if ((meta.seedVersion || 0) < this.SEED_VERSION) {
      // 演示数据内容升级：仅刷新种子，不动用户已建的费项之外的偏好
      this.seed();
      this.write('meta', { seeded: true, seedVersion: this.SEED_VERSION, seededAt: new Date().toISOString() });
    }
  },

  /** 重置演示数据（设置页入口） */
  reset: function () {
    var self = this;
    Object.keys(this.KEYS).forEach(function (k) { localStorage.removeItem(self.KEYS[k]); });
    this.seed();
    this.write('meta', { seeded: true, seedVersion: this.SEED_VERSION, seededAt: new Date().toISOString() });
  },

  /**
   * 演示种子：名册 12 人 + 两个进行中的费项 + 已对账流水。
   * 日期一律相对「今天」生成，任何时间打开数据看起来都是新的。
   */
  seed: function () {
    var names = ['张晓', '王磊', '李雨桐', '赵子轩', '陈嘉怡', '刘一鸣', '杨帆', '黄诗涵', '周子墨', '吴思远', '徐若琳', '孙浩然'];
    var cls = '计科20252302班';
    var roster = names.map(function (n, i) {
      return {
        id: 'stu-seed-' + (i + 1),
        studentNo: '2025230401' + (100 + i + 1),   // 2025230401101~112，13 位与宿主学号口径一致
        name: n,
        className: cls
      };
    });
    this.write('roster', roster);

    var feeTuan = {
      id: 'fee-seed-tuan', name: '2026-2027学年 团费（秋季）', kind: '团费',
      className: cls, amountFen: 3000, targetNos: [],   // 空 = 全员
      deadline: PayUtils.daysAgo(-12), status: '征集中',
      handler: '李雨桐（团支书）', note: '按校团委标准，秋季学期团费 30 元/人。',
      createdBy: '王磊', createdAt: new Date().toISOString()
    };
    var feeBan = {
      id: 'fee-seed-ban', name: '2026-2027学年 班费（秋季）', kind: '班费',
      className: cls, amountFen: 10000, targetNos: [],
      deadline: PayUtils.daysAgo(-20), status: '征集中',
      handler: '王磊（生活委员）', note: '用于班级集体活动、物资与打印，学期末公示结余。',
      createdBy: '王磊', createdAt: new Date().toISOString()
    };
    this.write('fees', [feeTuan, feeBan]);

    // 缴费单：团费 9 已核销 / 2 已支付 / 1 待支付；班费 6 已核销 / 3 已支付 / 3 待支付
    function mkOrders(fee, nPaid, nVerified, prefix) {
      var arr = [];
      roster.forEach(function (s, i) {
        var status = '待支付';
        if (i < nVerified) status = '已核销';
        else if (i < nVerified + nPaid) status = '已支付';
        var o = {
          id: prefix + '-' + (i + 1),
          feeId: fee.id, feeName: fee.name, kind: fee.kind, className: fee.className,
          studentNo: s.studentNo, name: s.name, amountFen: fee.amountFen,
          status: status, channel: '', gatewayId: '',
          outTradeNo: '', tradeNo: '', paidAt: '', verifiedBy: '', verifiedAt: '',
          createdAt: fee.createdAt
        };
        if (status !== '待支付') {
          o.channel = '支付宝（演示）';
          o.gatewayId = 'mock';
          o.outTradeNo = 'BJDEMO' + (i + 1) + (fee.kind === '团费' ? 'T' : 'B');
          o.tradeNo = 'TRD2026' + (i + 1) + (fee.kind === '团费' ? 'T' : 'B');
          o.paidAt = PayUtils.daysAgo(fee.kind === '团费' ? 6 : 4) + ' 1' + (i % 9) + ':2' + (i % 9);
        }
        if (status === '已核销') {
          o.verifiedBy = '王磊（生活委员）';
          o.verifiedAt = o.paidAt;
        }
        arr.push(o);
      });
      return arr;
    }
    this.write('orders', mkOrders(feeTuan, 2, 9).concat(mkOrders(feeBan, 3, 6)));

    // 账本：两笔自动对账入账 + 三笔支出（日期相对今天）
    var ledger = [
      { id: 'lg-seed-1', className: cls, type: '收入', feeId: feeTuan.id, category: '团费收缴',
        amountFen: 27000, date: PayUtils.daysAgo(5),
        desc: '2026-2027学年 团费（秋季）· 对账入账（9/12 人）', auto: true, by: '王磊（生活委员）', createdAt: new Date().toISOString() },
      { id: 'lg-seed-2', className: cls, type: '收入', feeId: feeBan.id, category: '班费收缴',
        amountFen: 60000, date: PayUtils.daysAgo(3),
        desc: '2026-2027学年 班费（秋季）· 对账入账（6/12 人）', auto: true, by: '王磊（生活委员）', createdAt: new Date().toISOString() },
      { id: 'lg-seed-3', className: cls, type: '支出', category: '活动物资', amountFen: 4550,
        date: PayUtils.daysAgo(4), desc: '运动会饮用水（2 箱）', proof: '纸质发票 · 王磊留存', auto: false, by: '王磊（生活委员）', createdAt: new Date().toISOString() },
      { id: 'lg-seed-4', className: cls, type: '支出', category: '团日活动', amountFen: 3200,
        date: PayUtils.daysAgo(2), desc: '团日活动材料（横幅、徽章）', proof: '电子发票 · 李雨桐转发', auto: false, by: '李雨桐（团支书）', createdAt: new Date().toISOString() },
      { id: 'lg-seed-5', className: cls, type: '支出', category: '打印资料', amountFen: 6000,
        date: PayUtils.daysAgo(1), desc: '期末复习资料印刷（12 份）', proof: '店家小票 · 拍照存档', auto: false, by: '王磊（生活委员）', createdAt: new Date().toISOString() }
    ];
    this.write('ledger', ledger);
  }
};

/* =====================================================
 * PayBridge：宿主契约桥（嵌入模式）与独立演示登录（独立模式）
 * -----------------------------------------------------
 * 嵌入模式握手时序：
 *   ① 缴费中心加载后向 window.parent 周期发送 {type:'pay:ready'}；
 *   ② 宿主（js/pages/payment-host.js）收到后回传
 *      {type:'pay:auth', profile:{trusted:true, user:…, roster:[…]}}；
 *   ③ 本侧校验 trusted 后建立会话并幂等导入名册。
 * 安全边界（与宿主 loginAsExternal 同口径）：
 *   「trusted 必须由可信宿主置位」——真实部署时票据校验在服务端完成，
 *   本应用只信契约消息，不做任何票据解析；生产环境应校验 event.origin。
 * ===================================================== */

var PayBridge = window.PayBridge = {
  mode: 'standalone',        // 'embed' | 'standalone'
  _readyTimer: null,
  _readyTries: 0,
  _bound: false,

  /** 启动：判断嵌入/独立，绑定消息监听 */
  boot: function () {
    this.mode = (window.parent && window.parent !== window) ? 'embed' : 'standalone';
    if (!this._bound) {
      this._bound = true;
      var self = this;
      window.addEventListener('message', function (e) {
        self._onMessage(e);
      });
    }
    if (this.mode === 'embed') this._pingReady();
    else PayStore.init();
  },

  _pingReady: function () {
    var self = this;
    PayStore.init();           // 先种子，握手成功后名册会被契约覆盖/合并
    this._authed = false;      // 本次加载是否已收到宿主身份（iframe 每次重载都会重置）
    function ping() {
      try { window.parent.postMessage({ type: 'pay:ready' }, '*'); } catch (e) { /* parent 不可达 */ }
    }
    ping();
    clearInterval(this._readyTimer);
    this._readyTimer = setInterval(function () {
      self._readyTries++;
      if (self._authed || self._readyTries > 10) { clearInterval(self._readyTimer); return; }
      ping();
    }, 600);
  },

  _onMessage: function (e) {
    var d = e.data;
    if (!d || d.type !== 'pay:auth') return;
    if (this.mode !== 'embed' || e.source !== window.parent) return;   // 只信直接父窗口
    this._authed = true;
    clearInterval(this._readyTimer);
    try {
      this.loginAsExternal(d.profile);
      if (window.PayApp && PayApp.refresh) PayApp.refresh();
    } catch (err) {
      if (window.PayApp && PayApp.fatal) PayApp.fatal('宿主身份接入失败：' + err.message);
    }
  },

  /**
   * 宿主契约登录（镜像 Auth.loginAsExternal 的信任语义）
   * profile = {trusted:true, via, host:{name,version},
   *            user:{name, username, role, post, studentNo, className, manager},
   *            roster:[{name, studentNo, className}]}
   */
  loginAsExternal: function (profile) {
    var p = profile || {};
    if (!p.trusted) {
      throw new Error('宿主身份必须由可信宿主会话置位 trusted 后传入（profile.trusted 未置位）');
    }
    var u = p.user || {};
    var session = {
      name: u.name || u.username || '宿主用户',
      username: u.username || '',
      role: u.manager ? 'manager' : 'member',
      post: u.post || '',
      studentNo: u.studentNo || '',
      className: u.className || '',
      via: p.via || '宿主会话',
      source: 'host',
      hostName: (p.host && p.host.name) || '班级管理系统',
      loginAt: new Date().toISOString()
    };
    if (p.roster && p.roster.length) {
      var r = this.importRoster(p.roster);
      session.rosterApplied = r.applied;
      session.rosterSkipped = r.skipped;
    }
    PayStore.setSession(session);
    PayStore._log('系统', '宿主身份接入', session.name + '（' + (session.role === 'manager' ? '收支管理员' : '班级成员') + '）· ' + session.via);
    return session;
  },

  /**
   * 名册契约导入（镜像 Store.syncFromEdu）：按学号幂等 upsert，缺字段计 skipped
   */
  importRoster: function (roster) {
    var list = PayStore.list('roster');
    var byNo = {};
    list.forEach(function (s) { byNo[String(s.studentNo)] = s; });
    var applied = 0, skipped = 0;
    (roster || []).forEach(function (r) {
      if (!r || !r.studentNo || !r.name) { skipped++; return; }
      var cur = byNo[String(r.studentNo)];
      if (cur) {
        cur.name = r.name;
        cur.className = r.className || cur.className;
        applied++;
      } else {
        var rec = { id: PayUtils.uid(), studentNo: String(r.studentNo), name: r.name, className: r.className || '' };
        list.push(rec); byNo[String(rec.studentNo)] = rec;
        applied++;
      }
    });
    PayStore.save('roster', list);
    PayStore._log('roster', '契约导入', '应用 ' + applied + ' 条，跳过 ' + skipped + ' 条');
    return { applied: applied, skipped: skipped };
  },

  /** 独立模式演示登录：收支管理员 */
  loginManager: function (name, post) {
    PayStore.init();
    var s = {
      name: name || '王磊', post: post || '生活委员', role: 'manager',
      studentNo: '', className: '', via: '独立演示登录', source: 'local',
      loginAt: new Date().toISOString()
    };
    PayStore.setSession(s);
    PayStore._log('系统', '登录成功', s.name + '（收支管理员）· 独立演示');
    return s;
  },

  /** 独立模式演示登录：班级成员（从名册选人） */
  loginStudent: function (studentNo) {
    PayStore.init();
    var stu = PayStore.find('roster', function (x) { return String(x.studentNo) === String(studentNo); });
    if (!stu) throw new Error('名册中找不到该学号：' + studentNo);
    var s = {
      name: stu.name, post: '学生', role: 'member',
      studentNo: stu.studentNo, className: stu.className,
      via: '独立演示登录', source: 'local',
      loginAt: new Date().toISOString()
    };
    PayStore.setSession(s);
    PayStore._log('系统', '登录成功', s.name + '（班级成员）· 独立演示');
    return s;
  },

  logout: function () {
    PayStore._log('系统', '退出登录', (PayStore.session() || {}).name || '');
    PayStore.write('session', null);
  }
};
