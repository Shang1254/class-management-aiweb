/* =====================================================
 * 应用入口：启动初始化 / 登录登出 / 侧边栏菜单 / Hash 路由
 * 不同角色登录后看到不同菜单：
 *   管理员：仪表盘 班级 学生 成绩 考勤 通知 用户
 *   教师：  仪表盘 学生 成绩 考勤 通知（数据限定本班）
 *   学生：  仪表盘 我的信息 我的成绩 我的考勤 通知查看
 * ===================================================== */

const App = {
  /** 系统版本（侧边栏页脚 / 登录页 / 软著材料保持一致：高校班级综合管理系统 V1.0） */
  VERSION: 'V1.0',
  /**
   * 菜单配置：key 对应 Pages 中注册的页面函数
   * icon 为「单字印章」式导航字（览班生绩析勤报告……），
   * 取代千篇一律的 emoji 图标，是本系统视觉原创点之一
   *
   * 角色与岗位双维度过滤：
   *   roles  —— 角色（admin/teacher/student）
   *   posts  —— 教师岗位线，仅对 role=teacher 生效（管理员不受限）：
   *             posts: ['教师']   教学线（任课教师的授课工具）
   *             posts: ['辅导员'] 学工线（学生工作端口）
   *             不填 = 两条线共用（辅导员与任课教师都能用）
   *   guard  —— 特殊情况守卫（须同时满足，菜单与直连双重生效）
   */
  MENUS: [
    // —— 共用 ——
    { key: 'dashboard',           label: '仪表盘',   icon: '览', roles: ['admin', 'teacher', 'student'] },
    { key: 'timetable',           label: '班级课表', icon: '课', roles: ['admin', 'teacher', 'student'] },
    { key: 'classes',             label: '班级管理', icon: '班', roles: ['admin'] },
    { key: 'students',            label: '学生管理', icon: '生', roles: ['admin', 'teacher'] },
    { key: 'score-analysis',      label: '成绩分析', icon: '析', roles: ['admin', 'teacher'], posts: ['教师'] },
    { key: 'attendance',          label: '考勤管理', icon: '勤', roles: ['admin', 'teacher'], posts: ['教师'] },
    // 考勤月报是辅导员汇总上报的材料（学生工作线），任课教师只负责课堂考勤录入
    { key: 'attendance-report',   label: '考勤月报', icon: '报', roles: ['admin', 'teacher'], posts: ['辅导员'],
      guard: function (u) { return Auth.isAdmin(u) || Auth.isCounselor(u); } },
    // 请假审批属学生工作线（辅导员/班主任事务）
    { key: 'leave-approve',       label: '请假审批', icon: '假', roles: ['admin', 'teacher'], posts: ['辅导员'],
      guard: function (u) { return Auth.isAdmin(u) || Auth.isCounselor(u); } },
    { key: 'alerts',              label: '学业预警', icon: '警', roles: ['admin', 'teacher'] },
    { key: 'notices',             label: '通知管理', icon: '告', roles: ['admin', 'teacher'] },
    // —— 教学线（任课教师）——
    { key: 'scores',              label: '成绩管理', icon: '绩', roles: ['admin', 'teacher'], posts: ['教师'] },
    { key: 'assignments',         label: '作业管理', icon: '业', roles: ['admin', 'teacher'], posts: ['教师'] },
    { key: 'quizzes',             label: '随堂测验', icon: '测', roles: ['admin', 'teacher'], posts: ['教师'] },
    { key: 'competitions',        label: '竞赛管理', icon: '赛', roles: ['admin', 'teacher'], posts: ['教师'] },
    { key: 'class-report',        label: '班级对比报告', icon: '报', roles: ['admin', 'teacher'], posts: ['教师'] },
    // —— 学工线（辅导员）——
    // 综合素质测评：奖助评定/评优的第一依据，由辅导员按学期组织（学生端只读本人）
    { key: 'evaluations',         label: '综合素质测评', icon: '评', roles: ['admin', 'teacher'], posts: ['辅导员'],
      guard: function (u) { return Auth.isAdmin(u) || Auth.isCounselor(u); } },
    { key: 'scholarships',        label: '奖助管理', icon: '奖', roles: ['admin', 'teacher'], posts: ['辅导员'],
      guard: function (u) { return Auth.isAdmin(u) || Auth.isCounselor(u); } }, // 奖助评审属学生工作线
    { key: 'health-report',       label: '健康日报', icon: '健', roles: ['admin', 'teacher'], posts: ['辅导员'],
      guard: function (u) { return Auth.isAdmin(u) || Auth.isCounselor(u); } }, // 学生健康与安全属学生工作线
    // 缴费中心：团费/班费发布、催缴、核销、账本与公示。独立微应用（缴费中心/），
    // 经契约桥挂接（身份 + 名册只读快照），宿主侧仅此一个入口页 —— 见《集成方案/支付宝缴费接入方案.md》
    { key: 'payment',             label: '缴费中心', icon: '缴', roles: ['admin', 'teacher'], posts: ['辅导员'],
      guard: function (u) { return Auth.isAdmin(u) || Auth.isCounselor(u); } },
    // —— 系统管理 ——
    { key: 'users',               label: '用户管理', icon: '众', roles: ['admin'] },
    { key: 'logs',                label: '操作日志', icon: '志', roles: ['admin'] },
    { key: 'data-mgmt',           label: '数据管理', icon: '存', roles: ['admin'] },
    { key: 'profile',             label: '个人中心', icon: '设', roles: ['admin', 'teacher', 'student'] },
    // —— 学生端 ——
    { key: 'my-info',             label: '我的信息', icon: '档', roles: ['student'] },
    { key: 'my-scores',           label: '我的成绩', icon: '卷', roles: ['student'] },
    { key: 'my-attendance',       label: '我的考勤', icon: '迹', roles: ['student'] },
    { key: 'my-assignments',      label: '我的作业', icon: '业', roles: ['student'] },
    { key: 'my-quizzes',          label: '随堂测验', icon: '测', roles: ['student'] },
    { key: 'my-health',           label: '健康填报', icon: '健', roles: ['student'] },
    { key: 'my-notices',          label: '通知查看', icon: '闻', roles: ['student'] },
    { key: 'my-evaluation',       label: '我的综测', icon: '评', roles: ['student'] },
    // 我的缴费：学生端进入同一个缴费中心微应用（同 key 双角色，见上方「缴费中心」条目）
    { key: 'payment',             label: '我的缴费', icon: '缴', roles: ['student'] },
    // 升学·就业：考研复试/留学申请/考公考编要用的一页式材料（信息卡、英文成绩单、排名证明）
    { key: 'career',              label: '升学·就业', icon: '途', roles: ['student'] },
    { key: 'downloads',           label: '资料下载', icon: '载', roles: ['student'] },
    // AI：教师/管理员为「AI 助手」（通知起草/学情简报/出题/问答/设置），学生为「AI 问答」（政策资料问答）
    { key: 'ai-assistant',        label: 'AI 助手', icon: '智', roles: ['admin', 'teacher'] },
    { key: 'ai-assistant',        label: 'AI 问答', icon: '智', roles: ['student'] },
    // 同一页面的管理视角：辅导员/管理员维护面向学生的资料清单（学生端口不出现「学生用品」以外的管理项）
    { key: 'downloads',           label: '资料管理', icon: '载', roles: ['admin', 'teacher'], posts: ['辅导员'] }
  ],

  user: null,

/** 应用启动 */
  start() {
    Store.init();          // 首次运行自动生成示例数据
    this.bindErrorGuards();
    this.flushStartupErrors();
    this.initTheme();
    this.bindGlobal();
    this.user = Auth.currentUser(); // 会话保持：刷新后自动登录
    if (this.user) this.enterApp();
    else { this.showLogin(); this.startTyper(); }
  },

  /* ---------------- 全局异常兜底 ----------------
   * 浏览器会静默吞掉脚本异常（交接文档里已踩过），用户只看到“点了没反应”。
   * 这里接住 window.onerror / unhandledrejection：写入审计日志 + 一次性 Toast，
   * 并在下次打开「操作日志」时可以直接定位到出错页面。 */

  /** 接管页首队列收集到的异常（index.html 中的早期监听器） */
  bindErrorGuards() {
    var self = this;
    window.__CMS_ON_ERROR__ = function (err) { self.reportError(err); };
  },

  /** 启动阶段队列中的异常：合并成一条提示，避免连续弹窗 */
  flushStartupErrors() {
    var list = (window.__CMS_ERRORS__ || []).slice();
    window.__CMS_ERRORS__ = [];
    var real = list.filter(function (e) { return e && e.message && e.message !== 'Script error.'; });
    if (!real.length) return;
    real.slice(0, 5).forEach(function (e) {
      try {
        Store._log('系统', '启动异常', e.message + (e.source ? '（' + e.source + ':' + e.line + '）' : ''));
      } catch (err) { /* 日志写入失败不阻断启动 */ }
    });
    Toast.warning('检测到 ' + real.length + ' 个启动异常，已记入「操作日志」');
  },

  /** 运行期异常：审计留痕 + Toast（3 秒节流，避免连环报错刷屏） */
  reportError(err) {
    var msg = String((err && err.message) || err || '未知异常');
    if (!msg || msg === 'Script error.') return; // 跨域脚本拿不到详情，不制造噪声
    var now = Date.now();
    var detail = msg + (err && err.source ? '（' + err.source + ':' + err.line + '）' : '');

    // 审计日志每次都写：不同错误不能在节流窗口里被吞掉
    try { Store._log('系统', '运行异常', detail); } catch (e) { /* 忽略 */ }

    // 同一类错误 3 秒内只 Toast 一次，避免连环报错刷屏；不同错误照常提示
    if (this._lastErrMsg === msg && this._lastErrAt && now - this._lastErrAt < 3000) return;
    this._lastErrMsg = msg;
    this._lastErrAt = now;
    try { Toast.error('页面出现异常，已记入「操作日志」：' + msg.slice(0, 50)); } catch (e) { /* 忽略 */ }
    console.error('[CMS]', detail);
  },

  /* ---------------- 深浅主题 ---------------- */

  /** 初始化主题：优先读取用户选择，否则跟随系统偏好 */
  initTheme() {
    var t = Store.getPref('theme', '');
    if (!t) {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = t;
    this.syncThemeBtns();
  },

  /** 切换深浅主题（保存偏好 + 重渲染当前页以刷新图表配色） */
  toggleTheme() {
    var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    Store.setPref('theme', t);
    this.syncThemeBtns();
    if (this.user) this.route(); // ECharts 等按主题取色的内容需要重绘
    Toast.info(t === 'dark' ? '已切换到深色模式' : '已切换到浅色模式');
  },

  /** 同步所有主题按钮的字形（日/月，与单字印章风格统一） */
  syncThemeBtns() {
    var icon = document.documentElement.dataset.theme === 'dark' ? '日' : '月';
    ['#btn-theme', '#btn-theme-login'].forEach(function (sel) {
      var btn = $(sel);
      if (btn) btn.textContent = icon;
    });
  },

  /* ---------------- 登录页打字机标语 ---------------- */

  startTyper() {
    var el = $('#login-slogan');
    if (!el) return;
    var lines = [
      '让每一个班级的数据，一目了然',
      '把老师从手工统计中解放出来',
      '成绩 · 考勤 · 通知 · 分析，一站式管理'
    ];
    var li = 0, ci = 0, deleting = false, hold = 0;
    this.stopTyper();
    this._typer = setInterval(function () {
      var text = lines[li];
      if (!deleting) {
        ci++;
        el.textContent = text.slice(0, ci) + '▍';
        if (ci >= text.length) { deleting = true; hold = 9; }
      } else if (hold > 0) {
        hold--;
      } else {
        ci--;
        el.textContent = text.slice(0, ci) + '▍';
        if (ci <= 0) { deleting = false; li = (li + 1) % lines.length; }
      }
    }, 130);
  },

  stopTyper() {
    if (this._typer) { clearInterval(this._typer); this._typer = null; }
  },

  /** 全局事件绑定（只绑定一次） */
  bindGlobal() {
    var self = this;

    // 登录表单提交（Auth.login 为异步：需计算 SHA-256 摘要）
    $('#login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var username = $('#login-username').value.trim();
      var password = $('#login-password').value;
      var errEl = $('#login-error');
      errEl.classList.add('hidden');
      // 登录表单验证
      if (!username) { errEl.textContent = '请输入用户名'; errEl.classList.remove('hidden'); return; }
      if (!password) { errEl.textContent = '请输入密码'; errEl.classList.remove('hidden'); return; }
      var btn = $('#login-form button[type="submit"]');
      btn.disabled = true;
      try {
        var user = await Auth.login(username, password);
        Toast.success('登录成功，欢迎回来，' + user.name);
        self.user = user;
        self.enterApp();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });

    // 退出登录（二次确认）
    $('#btn-logout').addEventListener('click', function () {
      UI.confirm({
        title: '退出登录',
        message: '确定要退出当前账号吗？',
        onOk() {
          Auth.logout();
          self.user = null;
          self.showLogin();
          Toast.info('已退出登录');
        }
      });
    });

    // 深浅主题切换（登录页 + 应用内两处按钮共用）
    $('#btn-theme').addEventListener('click', function () { self.toggleTheme(); });
    $('#btn-theme-login').addEventListener('click', function () { self.toggleTheme(); });

// 移动端侧边栏开关
    $('#btn-menu').addEventListener('click', function () {
      document.body.classList.toggle('sidebar-open');
    });
    $('#sidebar-mask').addEventListener('click', function () {
      document.body.classList.remove('sidebar-open');
    });

    // 「跳到主内容」：拦截默认锚点跳转，避免把 #page-content 当成路由吃掉
    var skip = document.querySelector('.skip-link');
    if (skip) {
      skip.addEventListener('click', function (e) {
        e.preventDefault();
        var main = $('#page-content');
        if (!main) return;
        main.focus();
        main.scrollIntoView({ block: 'start' });
      });
    }

    // 全站检索：顶栏「检」字按钮与 Ctrl/⌘ + K（登录后生效）
    $('#btn-search').addEventListener('click', function () {
      if (self.user && window.Palette) Palette.open();
    });
    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        if (!self.user) return; // 未登录时不劫持浏览器快捷键
        e.preventDefault();     // 阻止浏览器把 Ctrl+K 解释为「聚焦地址栏」
        if (window.Palette) Palette.open();
      }
    });

    // 表格渲染后自动补「左右滑动」提示：页面重渲染（筛选/翻页）也只需包一次
    var pageEl = $('#page-content');
    if (window.MutationObserver) {
      var mtTimer = null;
      new MutationObserver(function () {
        clearTimeout(mtTimer);
        mtTimer = setTimeout(function () { UI.syncTableScroll(pageEl); }, 60);
      }).observe(pageEl, { childList: true, subtree: true });
    }
    window.addEventListener('resize', Utils.debounce(function () {
      UI.syncTableScroll(pageEl);
    }, 200));

    // 支持浏览器前进/后退
    window.addEventListener('hashchange', function () {
      if (self.user) self.route();
    });
  },

/** 显示登录页 */
  showLogin() {
    if (window.Palette) Palette.close(); // 退出登录时收起可能开着的检索面板
    $('#app-view').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
    $('#login-form').reset();
    $('#login-error').classList.add('hidden');
    // 校园实景背景：每次随机一张（来自学校官网公开图集，已压缩并去除位置信息）
    var img = $('#login-photo');
    if (img) {
      var photos = ['images/campus-1.jpg', 'images/campus-2.jpg'];
      img.onerror = function () { img.style.display = 'none'; }; // 图片缺失时回退为深蓝渐变
      img.style.display = '';
      img.src = photos[Math.floor(Math.random() * photos.length)];
    }
    this.startTyper(); // 重启打字机标语
  },

  /** 进入应用主界面 */
  enterApp() {
    this.stopTyper(); // 登录页打字机停止
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    this.renderUserBar();
    this.renderMenu();
    this.startClock();
    if (typeof renderTermSelector === 'function') renderTermSelector();
    // 当前 hash 无权限或非法时重定向到仪表盘（hashchange 会触发路由）
    if (!this.menuByKey(this.hashKey())) {
      location.hash = '#/dashboard';
      return;
    }
    this.route();
  },

  /** 顶部用户信息 */
  renderUserBar() {
    var u = this.user;
    $('#topbar-user').innerHTML =
      '<span class="user-avatar">' + Utils.escapeHtml((u.name || u.username).charAt(0)) + '</span>' +
      '<span class="user-name">' + Utils.escapeHtml(u.name || u.username) + '</span>' +
      '<span class="role-tag role-' + u.role + '">' + Auth.roleName(u.role) + '</span>';
  },

  /** 当前 hash 对应的页面 key */
  hashKey() {
    var h = location.hash.replace(/^#\//, '');
    return h || 'dashboard';
  },

  /**
   * 菜单项对当前用户是否可见（角色 + 岗位线 + 特殊守卫，三关全过）
   * 岗位线 posts 仅约束 role=teacher（管理员不受限）：
   * 教学线条目（posts:['教师']）辅导员看不到；学工线条目（posts:['辅导员']）任课教师看不到
   */
  menuAllowed(m, u) {
    if (!u) return false;
    if (m.roles.indexOf(u.role) === -1) return false;
    if (m.posts && u.role === 'teacher') {
      var post = u.post || '教师';
      var okPost = m.posts.indexOf(post) !== -1;
      // 兼任授课的辅导员（alsoTeach）：可同时使用教学线功能（授课需要）
      if (!okPost && post === '辅导员' && u.alsoTeach && m.posts.indexOf('教师') !== -1) okPost = true;
      if (!okPost) return false;
    }
    if (m.guard && !m.guard(u)) return false;
    return true;
  },

  /** 按 key 与角色/岗位取菜单项（同一 key 可按角色配置不同入口，如 资料下载 / 资料管理） */
  menuByKey(key) {
    var me = this.user;
    return App.MENUS.find(function (m) {
      return m.key === key && App.menuAllowed(m, me);
    }) || null;
  },

  /** 渲染侧边栏菜单（按角色 + 岗位线过滤） */
  renderMenu() {
    var me = this.user;
    var html = '';
    App.MENUS.forEach(function (m) {
      if (!App.menuAllowed(m, me)) return;

      html += '<a class="nav-item" data-key="' + m.key + '" href="#/' + m.key + '">' +
        '<span class="nav-icon">' + m.icon + '</span><span>' + m.label + '</span></a>';
    });
    $('#nav-menu').innerHTML = html;

// 侧边栏底部：全站检索入口（带快捷键提示）+ 管理员「重置示例数据」
    var extra = $('#sidebar-extra');
    extra.innerHTML =
      '<button id="btn-search-side" class="sidebar-search" type="button">全站检索' +
        '<span class="sidebar-kbd">Ctrl K</span></button>' +
      (Auth.isAdmin(this.user)
        ? '<button id="btn-reset-data" class="sidebar-reset" type="button">重置示例数据</button>'
        : '');
    $('#btn-search-side').addEventListener('click', function () {
      if (window.Palette) Palette.open();
    });
    if (Auth.isAdmin(this.user)) {
      $('#btn-reset-data').addEventListener('click', function () {
        UI.confirm({
          title: '重置数据',
          message: '将清空全部数据并恢复为初始示例数据，确定继续吗？',
          onOk() {
            Store.reset();
            location.reload();
          }
        });
      });
    }

    // 侧边栏页脚：当前学年学期 + 学制/届别 + 版本
    // 复用 Store 的学期推算（此前这里按月份另写一套，8 月会与全站口径差一年）
    $('#sidebar-version').innerHTML = this.sidebarInfoHTML();
  },

  /**
   * 侧边栏页脚信息：当前学年学期（学生按届别附学期序号与总学期数）+ 学制/届别 + 版本
   * 学制按学校官方口径：本科四年、专科三年、专升本（本科段）两年；届 = 入学年 + 学制
   */
  /** 侧边栏文案换行：末尾括号说明单独一行，避免在「共四/学期）」这类词中间断行 */
  _sidebarWrap(text) {
    var t = String(text || '');
    var m = t.match(/^(.*)（([^（）]+)）$/);   // 贪心前缀 → 只拆最后一组括号说明
    if (!m) return Utils.escapeHtml(t);
    return Utils.escapeHtml(m[1]) + '<br><span class="sidebar-note">（' + Utils.escapeHtml(m[2]) + '）</span>';
  },
  /* 与「学期」无关的页面（当期待办 / 今日数据 / 静态资料 / 名册与配置）：
   * 顶栏学期选择器在这些页面上不做任何筛选——所以把它显示为「本页不适用」，
   * 而不是让用户点了没反应、误以为系统坏了（页面 key 见 App.MENUS）。 */
  TERM_NA_KEYS: ['users', 'logs', 'data-mgmt', 'profile', 'notices', 'my-notices', 'my-info',
    'health-report', 'my-health', 'downloads', 'ai-assistant', 'students', 'attendance-report',
    'leave-approve', 'attendance', 'classroom', 'assignments', 'quizzes', 'competitions', 'scholarships'],
  /** 当前页面是否按学期统计（顶栏据此把选择器置灰并给出说明） */
  termApplies() {
    var key = this.currentKey || '';
    return this.TERM_NA_KEYS.indexOf(key) === -1;
  },
  sidebarInfoHTML() {
    var u = this.user || {};
    var lines = [];
    if (u.role === 'student' && u.classId) {
      // 侧边栏只有约 190px 宽：把「学年学期」和其后的括号说明分成两行，
      // 否则会出现「共四 / 学期）」这种在词中间断行的读法（见 sidebarWrap 注释）
      lines.push(this._sidebarWrap(Store.termTextWithSeq(u.classId, Store.currentTerm())));
      var stu = u.studentId ? Store.getStudent(u.studentId) : null;
      var cohort = stu ? Store.cohortText(stu) : '';
      if (cohort) lines.push(this._sidebarWrap(cohort));
    } else if (u.role === 'teacher') {
      lines.push(Utils.escapeHtml(Store.termText(Store.currentTerm())));
      var ids = Auth.scopeClassIds(u);
      var cls = Store.list('classes').filter(function (c) { return ids.indexOf(c.id) !== -1; });
      var subj = (u.teachSubjects || []);
      if (Auth.isCounselor(u)) {
        // 辅导员：说"负责"，并带所带班级的届别
        if (cls.length === 1) {
          lines.push(Utils.escapeHtml(Store.cohortText(cls[0])));
        } else if (cls.length > 1) {
          var years = [];
          cls.forEach(function (c) {
            var g = Store.gradYearText(c);
            if (years.indexOf(g) === -1) years.push(g);
          });
          lines.push(Utils.escapeHtml('负责 ' + cls.length + ' 个班级 · ' + years.join('、')));
        }
      } else {
        // 任课教师：说"任教"，科目比届别更有用
        lines.push(Utils.escapeHtml('任教 ' + cls.length + ' 个班级' + (subj.length ? ' · ' + subj.join('、') : '')));
      }
    } else {
      lines.push(Utils.escapeHtml(Store.termText(Store.currentTerm())));
    }
    lines.push(this.VERSION + ' · 本地存储版');
    return lines.join('<br>');
  },

  /** 顶栏时钟：登录后常驻，每 30 秒刷新一次 */
  startClock() {
    var el = $('#topbar-clock');
    if (!el) return;
    function tick() {
      var d = new Date();
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) +
        ' · ' + (d.getMonth() + 1) + '/' + d.getDate() +
        ' 周' + '日一二三四五六'.charAt(d.getDay());
    }
    tick();
    if (this._clock) clearInterval(this._clock);
    this._clock = setInterval(tick, 30000);
  },

  /** 路由：根据 hash 渲染对应页面 */
  /** 零配置接入本机大模型：只在用户尚未配置过模型服务时尝试一次（异步、限时、失败静默）
   *  这样「装有 Ollama 的机器」打开即用，不必去设置里填地址与模型名 */
  autoWireAI() {
    if (this._aiWired || typeof AI === 'undefined') return;
    this._aiWired = true;
    try {
      AI.ensureConfig().then(function (r) {
        if (r && r.applied) {
          Toast.info('已自动接入本机大模型（' + r.model + '），无需配置；可在「AI 助手 → AI 设置」中更改', 5000);
        }
      }).catch(function () { /* 探测失败即静默：离线模板照常可用 */ });
    } catch (e) { /* 忽略 */ }
  },
  route() {
    var key = this.hashKey();
    if (this.user) this.autoWireAI();
    var menu = this.menuByKey(key);
    if (!menu) { location.hash = '#/dashboard'; return; }

// 高亮菜单 + 更新标题（aria-current 让读屏用户知道当前所在页）
    $$('#nav-menu .nav-item').forEach(function (el) {
      var on = el.dataset.key === key;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    $('#topbar-title').textContent = menu.label;
    document.title = menu.label + ' · 晴川学院班级管理系统';
    // 顶栏学期选择器是否对本页生效（不生效时置灰并说明，避免「点了没反应」的错觉）
    this.currentKey = key;
    var termEl = document.getElementById('topbar-term');
    if (termEl) {
      var applies = this.termApplies();
      termEl.classList.toggle('term-na', !applies);
      termEl.title = applies ? '切换后全站按月学期统计（各页面共用）'
        : '本页数据与学期无关（如当期待办、今日数据、静态资料、名册与配置），切换学期不影响本页';
    }
    document.body.classList.remove('sidebar-open'); // 移动端跳转后收起抽屉

    // 渲染页面
    var container = $('#page-content');
    container.innerHTML = '';
    var fn = Pages[key];
    if (typeof fn === 'function') {
      try {
        fn(container, this.user);
      } catch (err) {
        // 页面异常不能静默吞掉：控制台留栈 + 审计日志留痕，便于定位
        console.error('页面渲染失败：' + key, err);
        Store._log('系统', '页面异常', key + '：' + err.message);
        container.innerHTML = '<div class="card">' +
          '<div class="empty-state"><div class="empty-icon">误</div>' +
          '<div class="empty-text">页面加载出错：' + Utils.escapeHtml(err.message) + '</div></div></div>';
      }
} else {
      container.innerHTML = '<div class="card">' + UI.empty('页面不存在') + '</div>';
    }

    // 宽表横向滚动的可发现性提示（首次渲染即刻生效；页面内筛选/翻页由 MutationObserver 兜住）
    if (UI.syncTableScroll) UI.syncTableScroll(container);
  }
};

window.addEventListener('DOMContentLoaded', function () {
  App.start();
});
