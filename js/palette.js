/* =====================================================
 * 全站检索（命令面板）
 * - 入口：顶栏「检」字按钮 / 侧边栏「全站检索」/ Ctrl(⌘) + K
 * - 范围：可访问的页面 + 学生 + 班级 + 通知（均按当前角色与班级范围过滤）
 * - 键盘：↑ ↓ 选择 · Enter 打开 · Esc 关闭；中文输入法组合期间 Enter 不触发
 * - 不直接读写 localStorage，一律经 Store / Auth，与全站架构铁律一致
 * ===================================================== */

const Palette = window.Palette = {
  mask: null,
  input: null,
  listEl: null,
  items: [],
  index: 0,
  isOpen: false,

  /** 打开检索面板（登录后才可用；已有弹窗打开时不叠加） */
  open() {
    if (!App.user || this.isOpen) {
      if (this.isOpen && this.input) this.input.select();
      return;
    }
    if (document.querySelector('.modal-mask')) return; // 表单弹窗优先，避免两层遮罩

    var mask = document.createElement('div');
    mask.className = 'palette-mask';
    mask.innerHTML =
      '<div class="palette" role="dialog" aria-modal="true" aria-label="全站检索">' +
        '<div class="palette-head">' +
          '<span class="palette-glyph" aria-hidden="true">检</span>' +
          '<input id="pal-input" class="palette-input" type="text" placeholder="搜索页面、学生、班级、通知…" ' +
            'autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" ' +
            'aria-controls="pal-list" aria-autocomplete="list" aria-label="检索关键词">' +
          '<button id="pal-close" class="palette-esc" type="button" title="关闭（Esc）">Esc</button>' +
        '</div>' +
        '<div id="pal-list" class="palette-list" role="listbox" aria-label="检索结果"></div>' +
        '<div class="palette-foot">' +
          '<span><b>↑ ↓</b> 选择</span>' +
          '<span><b>Enter</b> 打开</span>' +
          '<span><b>Esc</b> 关闭</span>' +
          '<span class="palette-count" aria-live="polite"></span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);
    this.mask = mask;
    this.input = document.getElementById('pal-input');
    this.listEl = document.getElementById('pal-list');
    this.isOpen = true;

    var self = this;
    // 复用全局遮罩行为：Esc 关闭 / 焦点移入 / 锁定页面滚动 / 关闭后归还焦点
    UI._openOverlay(mask, function () { self.close(); });

    document.getElementById('pal-close').addEventListener('click', function () { self.close(); });
    mask.addEventListener('click', function (e) { if (e.target === mask) self.close(); });

    this.input.addEventListener('input', function () { self.render(this.value); });
    this.input.addEventListener('keydown', function (e) { self.onKey(e); });

    // 鼠标与触摸：点选结果；移动指针时同步高亮
    this.listEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.pal-item') : null;
      if (!btn) return;
      self.run(parseInt(btn.dataset.idx, 10));
    });
    this.listEl.addEventListener('mousemove', function (e) {
      var btn = e.target.closest ? e.target.closest('.pal-item') : null;
      if (!btn) return;
      var idx = parseInt(btn.dataset.idx, 10);
      if (idx !== self.index) self.highlight(idx, false);
    });

    this.input.value = '';
    this.render('');
    setTimeout(function () { if (self.input) self.input.focus(); }, 30);
  },

  /** 关闭面板 */
  close() {
    if (!this.mask) return;
    var mask = this.mask;
    this.mask = null;
    this.input = null;
    this.listEl = null;
    this.items = [];
    this.index = 0;
    this.isOpen = false;
    mask.classList.remove('show');
    UI._closeOverlay(mask);
    setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
  },

  /** 键盘：上下选择、Enter 打开（输入法组合中不 intercept） */
  onKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); this.run(this.index); return; }
    if (e.key === 'Home') { e.preventDefault(); this.highlight(0); return; }
    if (e.key === 'End') { e.preventDefault(); this.highlight(this.items.length - 1); }
  },

  move(step) {
    if (!this.items.length) return;
    var next = (this.index + step + this.items.length) % this.items.length;
    this.highlight(next);
  },

  /** 高亮第 idx 项；scroll 为 true 时把该项滚入可视区 */
  highlight(idx, scroll) {
    if (!this.items.length) return;
    this.index = Math.max(0, Math.min(idx, this.items.length - 1));
    var nodes = this.listEl.querySelectorAll('.pal-item');
    nodes.forEach(function (n, i) {
      var on = i === this.index;
      n.classList.toggle('active', on);
      n.setAttribute('aria-selected', on ? 'true' : 'false');
    }, this);
    this.input.setAttribute('aria-activedescendant', 'pal-item-' + this.index);
    if (scroll !== false && nodes[this.index] && nodes[this.index].scrollIntoView) {
      nodes[this.index].scrollIntoView({ block: 'nearest' });
    }
  },

  /** 按关键词生成结果并渲染 */
  render(keyword) {
    var q = String(keyword || '').trim().toLowerCase();
    this.items = this.collect(q);
    this.index = 0;
    if (!this.items.length) {
      this.listEl.innerHTML = '<div class="palette-empty">' +
        (q ? '未找到与「' + Utils.escapeHtml(keyword.trim()) + '」相关的内容' : '暂无可检索内容') +
        '<span>试试姓名、学号、班级名，或直接输入页面名</span></div>';
      this.listEl.setAttribute('aria-busy', 'false');
      this.setCount(0);
      return;
    }
    var html = '';
    var lastType = '';
    this.items.forEach(function (it, i) {
      if (it.type !== lastType) {
        html += '<div class="pal-group" aria-hidden="true">' + it.group + '</div>';
        lastType = it.type;
      }
      html += '<button type="button" class="pal-item" role="option" id="pal-item-' + i + '" ' +
        'data-idx="' + i + '" aria-selected="false">' +
        '<span class="pal-glyph" aria-hidden="true">' + Utils.escapeHtml(it.icon) + '</span>' +
        '<span class="pal-main"><span class="pal-title">' + Palette._hl(it.title, q) + '</span>' +
        '<span class="pal-meta">' + Utils.escapeHtml(it.meta) + '</span></span>' +
        '<span class="pal-type">' + Utils.escapeHtml(it.typeLabel) + '</span></button>';
    });
    this.listEl.innerHTML = html;
    this.setCount(this.items.length);
    this.highlight(0, false);
  },

  setCount(n) {
    var el = this.mask && this.mask.querySelector('.palette-count');
    if (el) el.textContent = n ? n + ' 项结果' : '';
  },

  /** 关键词高亮（先转义再包 <mark>，避免 XSS） */
  _hl(text, q) {
    var safe = Utils.escapeHtml(String(text || ''));
    if (!q) return safe;
    // 转义正则元字符后再做大小写不敏感替换，避免用户输入 .* 之类把高亮打乱
    var needle = Utils.escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.toLowerCase().indexOf(needle.toLowerCase()) !== -1
      ? safe.replace(new RegExp(needle, 'ig'), function (m) { return '<mark>' + m + '</mark>'; })
      : safe;
  },

  /** 汇总四类结果（按角色与班级范围过滤） */
  collect(q) {
    var user = App.user;
    var out = [];
    var self = this;

    /* 1. 页面：菜单里当前角色可见的全部入口 */
    var seen = {};
    var pages = [];
    App.MENUS.forEach(function (m) {
      if (!App.menuAllowed(m, user) || seen[m.key]) return;
      seen[m.key] = 1;
      pages.push(m);
    });
    self._take(pages, q, 6, function (m) {
      return { title: m.label, text: m.label + ' ' + m.key, icon: m.icon, type: 'page' };
    }).forEach(function (m) {
      out.push({ type: 'page', group: '页面', typeLabel: '前往', icon: m.icon, title: m.label,
        meta: '菜单入口 · #/' + m.key, key: m.key });
    });

/* 1.5 学生本人：搜自己的姓名/学号直接进「我的信息」（学生角色没有学生名册权限） */
    if (user.role === 'student' && user.name) {
      var me = user.studentId ? Store.getStudent(user.studentId) : null;
      var meText = [user.name, me && me.studentNo].filter(Boolean).join(' ');
      if (!q || meText.toLowerCase().indexOf(q) !== -1) {
        out.push({ type: 'page', group: '本人', typeLabel: '我的', icon: '我', title: user.name,
          meta: [me && me.studentNo, '我的信息'].filter(Boolean).join(' · '), key: 'my-info' });
      }
    }

    /* 2. 学生：管理员看全校，教师看任教班级（学生角色不检索他人档案） */
    if (App.menuByKey('students')) {
      var students = Auth.visibleStudents(user);
      self._take(students, q, 9, function (s) {
        return { title: s.name + ' ' + (s.studentNo || ''), text: (s.name || '') + ' ' + (s.studentNo || '') + ' ' + (s.classId ? Store.className(s.classId) : ''), icon: '生', type: 'student' };
      }).forEach(function (s) {
        var cls = s.classId ? Store.getClass(s.classId) : null;
        out.push({ type: 'student', group: '学生', typeLabel: '学生', icon: '生', title: s.name,
          meta: [s.studentNo, cls ? cls.name : '', s.status].filter(Boolean).join(' · '),
          q: s.studentNo || s.name, key: s.id });
      });
    }

    /* 3. 班级：仅管理员有「班级管理」入口 */
    if (App.menuByKey('classes')) {
      self._take(Store.list('classes'), q, 5, function (c) {
        return { title: c.name, text: (c.name || '') + ' ' + (c.grade || '') + ' ' + (c.major || ''), icon: '班', type: 'class' };
      }).forEach(function (c) {
        var n = Store.list('students').filter(function (s) { return s.classId === c.id; }).length;
        out.push({ type: 'class', group: '班级', typeLabel: '班级', icon: '班', title: c.name,
          meta: [c.grade ? c.grade + '级' : '', c.major || '', n + ' 名学生'].filter(Boolean).join(' · '), key: c.id });
      });
    }

    /* 4. 通知：与通知管理页同一套可见性（全部班级 + 本人可见班级） */
    if (App.menuByKey('notices')) {
      var ids = Auth.scopeClassIds(user);
      var notices = Store.list('notices').filter(function (n) {
        return !n.classId || ids.indexOf(n.classId) !== -1;
      });
      self._take(notices, q, 5, function (n) {
        return { title: n.title || '', text: (n.title || '') + ' ' + (n.content || ''), icon: '告', type: 'notice' };
      }).forEach(function (n) {
        out.push({ type: 'notice', group: '通知', typeLabel: '通知', icon: '告', title: n.title,
          meta: [n.channel, n.classId ? Store.className(n.classId) : '全部班级', n.publishTime].filter(Boolean).join(' · '),
          key: n.id });
      });
    }

    return out;
  },

  /**
   * 从候选里挑出匹配关键词的前 n 个：完全匹配 > 前缀匹配 > 包含匹配，同档保持原顺序
   * @param {Array} list 候选数组
   * @param {string} q 已转小写的关键词
   * @param {number} n 最多取几项
   * @param {Function} pick 从候选中取 {text} 参与匹配
   */
  _take(list, q, n, pick) {
    if (!q) return list.slice(0, n);
    var hit = [];
    (list || []).forEach(function (item, i) {
      var text = String((pick(item) || {}).text || '').toLowerCase();
      var score = text === q ? 0 : (text.indexOf(q) === 0 ? 1 : (text.indexOf(q) !== -1 ? 2 : 9));
      if (score < 9) hit.push({ item: item, score: score, i: i });
    });
    hit.sort(function (a, b) { return a.score - b.score || a.i - b.i; });
    return hit.slice(0, n).map(function (h) { return h.item; });
  },

  /** 执行第 idx 项：关闭面板并跳到对应页面（学生结果顺带填好搜索框） */
  run(idx) {
    var it = this.items[idx];
    if (!it) return;
    this.close();
    if (it.type === 'page') { location.hash = '#/' + it.key; return; }
    if (it.type === 'student') {
      location.hash = '#/students';
      setTimeout(function () {
        var input = document.getElementById('stu-search');
        if (input) {
          input.value = it.q;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
      }, 120);
      return;
    }
    if (it.type === 'class') { location.hash = '#/classes'; return; }
    if (it.type === 'notice') { location.hash = '#/notices'; }
  }
};