/* =====================================================
 * 通用 UI 组件：弹窗 / 二次确认 / 分页 / 空状态 / 徽章 / 条形图
 * 同时声明全局页面注册表 Pages（各页面文件向其注册渲染函数）
 * ===================================================== */

const Pages = {}; // 页面注册表：Pages[key] = function(container, user)

window.UI = UI = {
  /* ---------------- 弹窗通用行为 ----------------
   * 所有弹窗（modal/confirm）共用：淡入、Esc 关闭、焦点移入与归还、
   * 打开期间锁定页面滚动。集中在这里，避免各页面重复实现。 */
  _overlayCount: 0,

  /**
   * 挂载遮罩并对接键盘 / 焦点
   * @param {HTMLElement} mask 遮罩元素
   * @param {Function} close 关闭函数（Esc 时调用）
   */
  _openOverlay(mask, close) {
    var prevFocus = document.activeElement;
    document.body.appendChild(mask);
    this._overlayCount++;
    if (this._overlayCount === 1) document.body.style.overflow = 'hidden';
    // 用 setTimeout 而非 requestAnimationFrame：后台标签页中 rAF 会被节流导致弹窗无法淡入
    setTimeout(function () { mask.classList.add('show'); }, 20);
    // 焦点移入弹窗第一个可输入控件（无表单时落到"确定"按钮）
    setTimeout(function () {
      var target = $('input:not([type="hidden"]), select, textarea', mask) || $('[data-act="ok"]', mask);
      if (target && target.focus) { try { target.focus(); } catch (e) { /* 忽略 */ } }
    }, 20);
    function onKey(e) {
      if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey);
    mask._teardown = function () {
      document.removeEventListener('keydown', onKey);
      UI._overlayCount = Math.max(0, UI._overlayCount - 1);
      if (UI._overlayCount === 0) document.body.style.overflow = '';
      var ok = !document.contains || document.contains(prevFocus);
      if (prevFocus && prevFocus.focus && ok) { try { prevFocus.focus(); } catch (e) { /* 忽略 */ } }
    };
  },

  /** 关闭遮罩时的收尾（幂等：重复调用只执行一次） */
  _closeOverlay(mask) {
    if (mask._teardown) { var fn = mask._teardown; mask._teardown = null; fn(); }
  },

  /* ---------------- 表单弹窗 ---------------- */
  /**
   * 打开一个弹窗
   * @param {Object} opts
   *   title       弹窗标题
   *   body        内容区 HTML（一般为表单）
   *   onSubmit    点击“保存”回调：function(bodyRoot, close)，校验失败时
   *               Toast 提示并 return 即可（弹窗不关闭），成功后自行调用 close()
   *   submitText  保存按钮文字，默认“保 存”
   *   wide        是否加宽（批量录入等）
   * @returns 弹窗根元素（mask），可用于后续查询内部控件
   */
  modal(opts) {
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-header"><span>' + Utils.escapeHtml(opts.title || '弹窗') + '</span>' +
          '<button class="modal-close" type="button" title="关闭">✕</button></div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-ghost" data-act="cancel" type="button">' + Utils.escapeHtml(opts.cancelText || '取 消') + '</button>' +
          '<button class="btn btn-primary" data-act="ok" type="button">' + Utils.escapeHtml(opts.submitText || '保 存') + '</button>' +
        '</div>' +
      '</div>';

    function close() {
      mask.classList.remove('show');
      UI._closeOverlay(mask);
      setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
    }

    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    $('.modal-close', mask).addEventListener('click', close);
    $('[data-act="cancel"]', mask).addEventListener('click', close);
    $('[data-act="ok"]', mask).addEventListener('click', function () {
      if (typeof opts.onSubmit === 'function') opts.onSubmit($('.modal-body', mask), close);
    });
    UI._openOverlay(mask, close);
    // 页面若需自行关闭弹窗（如交卷后强制关闭），请用 mask._close()，
    // 不要直接 removeChild——那样会漏掉 Esc 解绑与滚动锁恢复
    mask._close = close;
    return mask;
  },

  /* ---------------- 打印区（常驻 body 直下，@media print 时仅显示这一块） ----------------
     必须挂在 body 下：打印样式用 `body > *:not(#print-area)` 隐藏其余元素，
     若打印区嵌在页面容器里，会连同容器一起被隐藏（导致打印空白页）。
     页面只需 UI.printArea().innerHTML = 内容，再 window.print()。 ---------------- */
  printArea() {
    var area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    return area;
  },

  /* ---------------- 二次确认框（删除等危险操作） ---------------- */
  /**
   * @param {Object} opts
   *   title    标题，默认“操作确认”
   *   message  提示文字（\n 会转为换行）
   *   onOk     点击“确定”后的回调
   */
  confirm(opts) {
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    var text = Utils.escapeHtml(opts.message || '确定要执行该操作吗？').replace(/\n/g, '<br>');
    mask.innerHTML =
      '<div class="modal modal-sm" role="dialog" aria-modal="true">' +
        '<div class="modal-header"><span>' + Utils.escapeHtml(opts.title || '操作确认') + '</span>' +
          '<button class="modal-close" type="button" title="关闭">✕</button></div>' +
        '<div class="modal-body"><div class="confirm-text">' + text + '</div></div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-ghost" data-act="cancel" type="button">取 消</button>' +
          '<button class="btn btn-danger" data-act="ok" type="button">确 定</button>' +
        '</div>' +
      '</div>';
    function close() {
      mask.classList.remove('show');
      UI._closeOverlay(mask);
      setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
    }
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    $('.modal-close', mask).addEventListener('click', close);
    $('[data-act="cancel"]', mask).addEventListener('click', close);
    $('[data-act="ok"]', mask).addEventListener('click', function () {
      close();
      if (typeof opts.onOk === 'function') opts.onOk();
    });
    UI._openOverlay(mask, close);
    mask._close = close;
  },

  /* ---------------- 小部件 ---------------- */

  /** 空状态提示 HTML：衬线「空」字虚线印章 + 提示语 */
  empty(text) {
    return '<div class="empty-state"><div class="empty-icon">空</div>' +
      '<div class="empty-text">' + Utils.escapeHtml(text || '暂无数据') + '</div></div>';
  },

  /** 彩色徽章：type 可选 success / warning / info / danger / muted */
  badge(text, type) {
    return '<span class="badge badge-' + (type || 'muted') + '">' + Utils.escapeHtml(text) + '</span>';
  },

  /** 学生状态徽章 */
  studentBadge(status) {
    var map = { '在读': 'success', '休学': 'warning', '转出': 'info', '毕业': 'muted' };
    return UI.badge(status, map[status] || 'muted');
  },

  /** 考勤状态徽章（空值显示“未记录”） */
  attendBadge(status) {
    var map = { '出勤': 'success', '迟到': 'warning', '请假': 'info', '缺勤': 'danger' };
    if (!status) return UI.badge('未记录', 'muted');
    return UI.badge(status, map[status] || 'muted');
  },

  /** 招生类别徽章：普通高考（统招）/ 专升本（统招）/ 自考助学（非全日制） */
  enrollBadge(enrollType) {
    var map = { '普通高考': 'info', '专升本': 'success', '自考助学': 'warning' };
    return UI.badge(enrollType || '普通高考', map[enrollType] || 'muted');
  },

  /** 学生类型完整展示：培养层次 + 招生类别徽章 + 非全日制标识 */
  studentTypeHTML(s) {
    var html = Utils.escapeHtml(s.eduLevel || '本科') + ' ' + UI.enrollBadge(s.enrollType);
    if ((s.studyForm || '全日制') === '非全日制') html += ' ' + UI.badge('非全日制', 'danger');
    return html;
  },

  /** 教师编制徽章：专任 / 外聘（聘期已到的外聘显示红色标识） */
  teacherTypeBadge(u) {
    if (!u || u.role !== 'teacher') return '';
    if (u.teacherType === '外聘') {
      var expired = u.validUntil && u.validUntil < Utils.today();
      return UI.badge(expired ? '外聘·聘期已到' : '外聘', expired ? 'danger' : 'warning');
    }
    return UI.badge('专任', 'muted');
  },

  /** 统计卡英文小注：编辑排版式双语标签（未收录的标签不显示小注） */
  STAT_EN: {
    '学生总数': 'STUDENTS', '班级数': 'CLASSES', '我的班级': 'MY CLASS', '任教班级': 'MY CLASSES',
    '今日出勤率': 'TODAY', '平均分': 'AVERAGE', '及格率': 'PASS RATE', '学分绩点': 'GPA',
    '优秀率': 'EXCELLENCE', '最高分': 'HIGHEST', '最低分': 'LOWEST',
    '成绩条数': 'RECORDS', '记录天数': 'DAYS LOGGED', '平均出勤率': 'ATTENDANCE',
    '迟到总次数': 'LATE TIMES', '请假/缺勤': 'LEAVE / ABSENT', '重点关注人数': 'FOCUS',
    '我的平均分': 'MY AVERAGE', '我的出勤率': 'MY ATTENDANCE', '班级排名': 'CLASS RANK',
    '参评人次': 'ENTRIES', '出勤率': 'ATTENDANCE', '出勤天数': 'PRESENT', '迟到次数': 'LATE'
  },

  /**
   * 统计卡片 HTML：彩色书脊 + 双语标签 + 衬线大数字
   * 纯数字值标记 data-count，渲染后由 utils.js 的观察器做滚动动画
   */
  statCard(label, value) {
    var raw = String(value === undefined || value === null || value === '' ? '—' : value);
    var isNum = /^\d+(\.\d+)?$/.test(raw);
    var isPct = /^\d+(\.\d+)?%$/.test(raw);
    var attrs = '';
    if (isNum) attrs = ' data-count="' + raw + '"';
    else if (isPct) attrs = ' data-count="' + raw.slice(0, -1) + '" data-suffix="%"';
    var en = UI.STAT_EN[label] || '';
    return '<div class="stat-card">' +
      '<div class="stat-label">' + Utils.escapeHtml(label) +
        (en ? '<span class="stat-en">' + en + '</span>' : '') + '</div>' +
      '<div class="stat-value"' + attrs + '>' + Utils.escapeHtml(raw) + '</div>' +
    '</div>';
  },

  /**
   * 仪表盘 Hero 横幅：日历牌 + 问候语 + 楷体每日箴言 + 红色印章
   * @param {Object} opts { name, sub, chips: [{label, value}] }
   */
  heroCard(opts) {
    opts = opts || {};
    var d = new Date();
    var months = ['一月', '二月', '三月', '四月', '五月', '六月',
                  '七月', '八月', '九月', '十月', '十一月', '十二月'];
    var week = '星期' + '日一二三四五六'.charAt(d.getDay());
    // 每日箴言：按一年中的第几天轮换，让每天打开都略有不同
    var mottos = [
      ['业精于勤，荒于嬉。', '韩愈《进学解》'],
      ['博学之，审问之，慎思之，明辨之，笃行之。', '《礼记·中庸》'],
      ['学而不思则罔，思而不学则殆。', '《论语·为政》'],
      ['千里之行，始于足下。', '《道德经》'],
      ['不积跬步，无以至千里。', '《荀子·劝学》'],
      ['如切如磋，如琢如磨。', '《诗经·卫风》'],
      ['天行健，君子以自强不息。', '《周易·乾》'],
      ['知之者不如好之者，好之者不如乐之者。', '《论语·雍也》']
    ];
    var doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    var motto = mottos[doy % mottos.length];
    var hour = d.getHours();
    var greeting = hour < 12 ? '早上好' : (hour < 18 ? '下午好' : '晚上好');

    /* 中国日历：农历 / 节气 / 假期（引擎缺失时优雅降级） */
    var calLine = '', calBadge = '';
    if (typeof CnCalendar !== 'undefined') {
      try {
        var cal = CnCalendar.info(Utils.formatDate(d));
        var bits = [];
        if (cal.lunar) bits.push('农历' + cal.lunar.text);
        if (cal.term) bits.push(cal.term);
        if (cal.period.current) {
          bits.push(cal.period.current.name + '假期 · 第 ' + cal.period.current.dayIndex + ' 天');
        } else if (cal.period.next) {
          bits.push('距' + cal.period.next.name + ' ' + cal.period.next.daysUntil + ' 天');
        }
        calLine = bits.join(' · ');
        if (cal.holiday.type === 'holiday') calBadge = '<span class="hero-hb hero-hb-holiday">休</span>';
        else if (cal.holiday.type === 'workday') calBadge = '<span class="hero-hb hero-hb-work">班</span>';
      } catch (e) { /* 引擎异常不影响渲染 */ }
    }

    var chips = (opts.chips || []).map(function (c) {
      return '<span class="hero-chip">' + Utils.escapeHtml(c.label) +
        '<b>' + Utils.escapeHtml(String(c.value)) + '</b></span>';
    }).join('');

    return '<div class="hero">' +
      '<div class="hero-row">' +
        '<div class="hero-date">' +
          '<div class="hero-day">' + d.getDate() + calBadge + '</div>' +
          '<div class="hero-my"><b>' + months[d.getMonth()] + '</b>' +
            '<span>' + d.getFullYear() + ' · ' + week + '</span></div>' +
        '</div>' +
        '<div class="hero-text">' +
          '<h2>' + greeting + '，' + Utils.escapeHtml(opts.name || '') + '</h2>' +
          '<p class="hero-sub">' + (opts.sub || '') + '</p>' +
          '<p class="hero-motto">「' + motto[0] + '」<small>—— ' + motto[1] + '</small></p>' +
          (calLine ? '<p class="hero-cal">' + Utils.escapeHtml(calLine) + '</p>' : '') +
        '</div>' +
        '<div class="hero-seal" aria-hidden="true">' +
          '<span>晴</span><span>川</span><span>教</span><span>务</span></div>' +
      '</div>' +
      (chips ? '<div class="hero-chips">' + chips + '</div>' : '') +
    '</div>';
  },

  /**
   * 纯 CSS 横向条形图
   * @param {Array<{label:string,value:number,suffix?:string}>} items
   */
  barChart(items) {
    items = items || [];
    if (!items.length) return UI.empty('暂无数据');
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.value || 0; })));
    var html = '<div class="bar-chart">';
    items.forEach(function (it) {
      var pct = Math.round((it.value || 0) / max * 100);
      html += '<div class="bar-row">' +
        '<span class="bar-label">' + Utils.escapeHtml(it.label) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="bar-value">' + (it.value || 0) + Utils.escapeHtml(it.suffix || '') + '</span>' +
      '</div>';
    });
    return html + '</div>';
  },

  /** 表格骨架 HTML */
  tableWrap(headHtml, bodyHtml) {
    return '<div class="table-wrap"><table class="table"><thead>' + headHtml + '</thead><tbody>' + bodyHtml + '</tbody></table></div>';
  },

  /** 下拉选项 HTML（对象数组） */
  options(list, valueKey, labelFn, selectedValue, placeholder) {
    var html = placeholder !== undefined
      ? '<option value="">' + Utils.escapeHtml(placeholder) + '</option>' : '';
    (list || []).forEach(function (item) {
      var v = item[valueKey];
      html += '<option value="' + Utils.escapeHtml(v) + '"' +
        (String(v) === String(selectedValue || '') ? ' selected' : '') + '>' +
        Utils.escapeHtml(labelFn(item)) + '</option>';
    });
    return html;
  },

  /** 表单项：label + 控件（required 时显示红星） */
  formRow(label, inner, required) {
    return '<div class="form-item"><label>' + Utils.escapeHtml(label) +
      (required ? ' <i class="req">*</i>' : '') + '</label>' + inner + '</div>';
  },

  /* ---------------- 全站学期筛选（顶栏唯一开关） ----------------
   * 顶栏切换器写这个偏好，各页面读 UI.term.get() 决定初始筛选，
   * 页面内的学期下拉改动后回写，保证两处永远一致。 */

  /** 全站学期：'' 表示不限学期（全部） */
  termFilter: {
    /** 当前全站学期，'' = 全部 */
    get() {
      var v = Store.getPref('uiTerm', 'all');
      if (!v || v === 'all') return '';
      // 校验：学年合计值必须仍成立（该学年有 ≥2 个学期），学期值必须在学期列表里；
      // 失效值（如上一版本选的"本学年（全学年）"）清掉，避免下拉显示与统计口径不一致
      var ok = /^\d{4}-\d{4}$/.test(v) ? this.validYear(v) : (this.list().indexOf(v) !== -1);
      if (ok) return v;
      Store.setPref('uiTerm', 'all');
      return '';
    },
    /** 设置全站学期；reload 为 true 时立即刷新当前页面 */
    set(v, reload) {
      Store.setPref('uiTerm', v || 'all');
      if (reload !== false && typeof App !== 'undefined' && App.route) App.route();
    },
    /** 页面内学期下拉的默认值：优先全站筛选，其次当前自然学期 */
    fallback() { return this.get() || Store.currentTerm(); },
    /** 页面内改了学期后，把顶栏下拉同步为同一值（避免两处显示不一致） */
    syncTopbar() {
      var el = document.getElementById('topbar-term');
      if (el) el.value = Store.getPref('uiTerm', 'all');
    },
    /** 该学年在现有数据里有几个学期（学年合计是否成立：≥2 个学期才有"合计"的意义） */
    termCountOfYear(year) {
      var n = 0;
      this.list().forEach(function (t) { if (String(t).indexOf(year + '-') === 0) n++; });
      return n;
    },
    /** 学年值当前是否可用（如「本学年」在第二学期开始前不提供合计，见 optionsHTML 注释） */
    validYear(year) {
      return /^\d{4}-\d{4}$/.test(year) && this.termCountOfYear(year) >= 2;
    },
    /**
     * 统一的学期下拉选项渲染（全站一致，避免各页面文案/标记不一）
     * 排序：**按学年成组**——每个学年的「合计」项紧跟它自己的各学期，时间顺序不打乱
     *      （此前把所有合计项排在所有学期之前，会出现"2026-2027学年（全学年）"排在
     *        "2025-2026学年第一学期"前面这种时间线来回跳的读法）。
     * 合计项：仅在该学年确有 ≥2 个学期时提供——只有 1 个学期时"合计"就等于那个学期本身，
     *      提供只会让人困惑（本学年第二学期还没开始时即属此列）；
     *      当前学年标「本学年 · 至今」（学年未结束，不谎称全学年），历史学年标「全学年」。
     * 学期项：学生统一附「（第N学期）」（届别口径，第1、2学期也标，否则只有第三学期有标注会让人找不到第一学期）；
     *      当前自然学期附「（本学期）」。
     * opts.includeAll 时在首项加「全部 N 个学期（跨学年）」；opts.allLabel 可自定义该文案
     */
    optionsHTML(selected, opts) {
      opts = opts || {};
      var uid = (typeof App !== 'undefined') ? App.user : null;
      var isStudent = !!(uid && uid.role === 'student' && uid.classId);
      var cur = Store.currentTerm();
      var terms = this.list();
      var html = '';
      if (opts.includeAll) {
        // 「全部学期」是跨学年的合计（可能横跨多个学年），与「学年合计」必须区分开：
        var allText = opts.allLabel || ('全部 ' + terms.length + ' 个学期（跨学年）');
        var allVal = (opts.allValue === undefined) ? 'all' : opts.allValue;   // 兼容以 '' 表示"全部"的页面
        html += '<option value="' + allVal + '"' + ((!selected || selected === 'all' || selected === allVal) ? ' selected' : '') +
          ' title="统计口径：跨学年合计——把系统里全部 ' + terms.length + ' 个学期一起算，会混合多个学期与多个学年">' + allText + '</option>';
      }
      var curYear = cur.split('-').slice(0, 2).join('-');
      var grade = isStudent && Store.getClass(uid.classId) ? Store.getClass(uid.classId).grade : '';
      var groups = [];                       // [{year, terms: [...]}]，按学期顺序自然成组
      terms.forEach(function (t) {
        var y = String(t).split('-').slice(0, 2).join('-');
        var g = null;
        for (var i = 0; i < groups.length; i++) { if (groups[i].year === y) g = groups[i]; }
        if (!g) { g = { year: y, terms: [] }; groups.push(g); }
        g.terms.push(t);
      });
      groups.forEach(function (g) {
        if (opts.includeYear !== false && /^\d{4}-\d{4}$/.test(g.year) && g.terms.length >= 2) {
          var isCur = g.year === curYear;
          // 学年合计只说「本学年内」：不写「全学年」，避免与「全部学期（跨学年）」读起来一样
          var label = g.year + '学年' + (isCur ? '（本学年 · 至今）' : ('（' + g.terms.length + ' 个学期合计）'));
          var tip = isCur ? ('本学年已发生学期（' + g.terms.length + ' 个）的合计，不跨学年')
            : ('该学年内 ' + g.terms.length + ' 个学期合计，不跨学年');
          html += '<option value="' + g.year + '"' + (selected === g.year ? ' selected' : '') +
            ' title="' + tip + '">' + label + '</option>';
        }
        g.terms.forEach(function (t) {
          var label = Store.termText(t);
          if (grade) {
            var seq = Store.termSeq(grade, t);
            if (seq) label += '（第' + seq + '学期）';
          }
          if (t === cur) label += '（本学期）';
          html += '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + label + '</option>';
        });
      });
      return html;
    },

    /** 可供选择的学期列表（升序，含当前学期） */
    list() {
      var t = (Store.allTerms && Store.allTerms()) || [];
      if (t.indexOf(Store.currentTerm()) === -1) t.push(Store.currentTerm());
      return t.sort();
    }
  },

  /* ---------------- 分页 ---------------- */
  /**
   * 生成分页条 HTML（之后用 bindPagination 绑定事件）
   * @param {Object} opts { total, page, pageSize }
   */
  paginationHTML(opts) {
    var totalPages = Math.max(1, Math.ceil((opts.total || 0) / opts.pageSize));
    var page = Math.min(Math.max(1, opts.page || 1), totalPages);
    var html = '<div class="pagination">';
    html += '<button class="page-btn" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>‹ 上一页</button>';
    // 最多显示 5 个页码，超出时窗口滑动
    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    for (var p = start; p <= end; p++) {
      html += '<button class="page-btn' + (p === page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }
    html += '<button class="page-btn" data-page="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '>下一页 ›</button>';
    html += '<span class="page-info">共 ' + (opts.total || 0) + ' 条 / ' + totalPages + ' 页</span>';
    html += '</div>';
    return html;
  },

/** 给容器内分页按钮绑定点击事件 */
  bindPagination(container, onPage) {
    if (!container) return;
    $$('.page-btn', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        onPage(parseInt(btn.dataset.page, 10));
      });
    });
  },

  /* ---------------- 表格横向滚动可发现性 ----------------
   * 宽表（学生名册、成绩表等）在窄屏上会横向溢出，而滚动条默认隐藏，
   * 用户容易误以为「住址/电话这一列没做」。这里给每张表包一层定位容器，
   * 只有真实溢出时才显示右缘渐隐 +「左右滑动」提示；滚到最右自动收起。
   * 由 app.js 的 MutationObserver 在页面重渲染后自动调用，页面无需改动。 */

  /** 同步容器内全部表格的滚动提示（幂等，可重复调用） */
  syncTableScroll(root) {
    var scope = root || document;
    var wraps = $$('.table-wrap', scope);
    wraps.forEach(function (wrap) {
      if (!wrap.dataset.scrollReady) {
        var parent = wrap.parentNode;
        if (!parent) return;
        var box = document.createElement('div');
        box.className = 'table-scroll';
        parent.insertBefore(box, wrap);
        box.appendChild(wrap);

        var hint = document.createElement('span');
        hint.className = 'table-scroll-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = '左右滑动查看全部列';
        box.insertBefore(hint, wrap); // 放在表格上方，避免压住末行操作按钮

        // 让键盘用户也能横向滚动；读屏用户听到表格用途
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', '数据表格，可左右滚动查看');
        wrap.addEventListener('scroll', function () { UI._measureTable(wrap); });
        wrap.dataset.scrollReady = '1';
      }
      UI._measureTable(wrap);
    });
  },

  /** 量一次溢出状态：决定是否显示提示 / 渐隐，以及是否已滚到最右 */
  _measureTable(wrap) {
    var box = wrap.parentNode;
    if (!box || box.className.indexOf('table-scroll') === -1) return;
    var overflow = wrap.scrollWidth - wrap.clientWidth > 2;
    box.classList.toggle('is-scrollable', overflow);
    var atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
    box.classList.toggle('at-end', overflow && atEnd);
  }
};
