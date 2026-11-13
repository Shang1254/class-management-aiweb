/* =====================================================
 * 综合增强模块：顶栏学期切换器 / 学业预警 / 班级对比报告
 * 总评成绩合成 UI 入口（scores.js 通过 mixin 复用 Store.finalizeGrades）
 * ===================================================== */

/** 纯前端用 Canvas 生成 PNG 报告（横版柱状对比 + 表格）—— 暴露为全局供 Pages['class-report'] 调用 */
window.renderReportPng = function renderReportPng(rows, term) {
    try {
      var w = 1200, h = 720;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fbfbf4'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#16337a'; ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
      ctx.fillText('武汉晴川学院 · 班级对比报告', 18, 36);
      ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#5f6f8a';
      ctx.fillText('学期：' + term + ' · 生成时间：' + Utils.nowStr(), 18, 60);
      ctx.fillStyle = '#c9a24b'; ctx.fillRect(18, 76, w - 36, 3);
      var baseY = 480, baseX = 60, gap = 18;
      var barW = Math.min(90, (w - 120 - gap * rows.length) / Math.max(1, rows.length));
      rows.forEach(function (r, i) {
        var x = baseX + i * (barW + gap);
        var h1 = (r.avg / 100) * 360;
        ctx.fillStyle = i === 0 ? '#c9a24b' : '#1d5dd8';
        ctx.fillRect(x, baseY - h1, barW, h1);
        ctx.fillStyle = '#182338';
        ctx.font = 'bold 18px "Microsoft YaHei"';
        ctx.fillText(String(r.avg), x + barW / 2 - 10, baseY - h1 - 8);
        ctx.font = '12px "Microsoft YaHei"'; ctx.fillStyle = '#5f6f8a';
        ctx.fillText(r.name, x + 4, baseY + 18);
      });
      ctx.strokeStyle = '#9fb4dd'; ctx.beginPath(); ctx.moveTo(40, baseY); ctx.lineTo(w - 40, baseY); ctx.stroke();
      var tx = 700, ty = 120;
      ctx.fillStyle = '#16337a'; ctx.font = 'bold 14px "Microsoft YaHei"';
      ctx.fillText('关键指标', tx, ty); ty += 14;
      ctx.font = '12px "Microsoft YaHei"'; ctx.fillStyle = '#182338';
      rows.forEach(function (r) {
        ctx.fillText(r.name + '：' + r.avg + ' 分 · 及格率 ' + r.pass + '% · 出勤 ' + r.attendance + '% · 预警 ' + r.alerts + ' 人',
          tx, ty); ty += 18;
      });
      ctx.fillStyle = '#c9a24b'; ctx.fillRect(18, h - 60, w - 36, 1);
      ctx.fillStyle = '#5f6f8a'; ctx.font = '11px "Microsoft YaHei"';
      ctx.fillText('武汉晴川学院 · 计算机学院 · 班级管理系统 · 毕业设计作品', 18, h - 28);
      return c.toDataURL('image/png').split(',')[1];
    } catch (e) { console.error(e); return null; }
  };

/* ---------------- 顶栏学期切换器（全站唯一学期开关） ---------------- */

/**
 * 渲染顶栏学期下拉。
 * 这是全站唯一的学期入口：选中的值写入 Store 偏好（cms_ui_term），
 * 各页面用 UI.termFilter.get() 读取初值，页面内下拉改动后回写，
 * 保证「顶栏选学期」与「页面内选学期」永远是同一个值。
 */
function renderTermSelector() {
  var el = document.getElementById('topbar-term');
  if (!el) return;
  var terms = UI.termFilter.list();
  var cur = Store.getPref('uiTerm', 'all');
  if (cur !== 'all' && terms.indexOf(cur) === -1) cur = 'all';
  // 与页内学期下拉**同一套渲染**（学年与学期连写、学生视角带（第N学期）、当前学期标（本学期））
  el.innerHTML = UI.termFilter.optionsHTML(cur, { includeAll: true });
  el.onchange = function () {
    Store.setPref('uiTerm', this.value);
    if (typeof App !== 'undefined' && App.route) App.route();
  };
  el.title = cur === 'all'
    ? '当前显示全部学期（跨学年合计）'
    : '当前按「' + Store.termText(cur) + '」筛选';
}

/** 当前 UI 选定的学期（'' = 全部），供各页面在 filter 中使用 */
function currentUiTerm() { return UI.termFilter.get(); }

/* ---------------- 学业预警 ---------------- */

Pages.alerts = function (container, user) {
  var scopeIds = Auth.scopeClassIds(user);
  var isCounselor = Auth.isCounselor(user) && !Auth.isAdmin(user);
  var state = { classId: '' };
  // 同一份预警数据，两条线用途不同：辅导员做帮扶台账，任课教师做课堂关注
  var purpose = isCounselor
    ? '帮扶台账：以下学生需近期谈话与跟踪，可在「AI 助手 → 帮扶跟踪」生成帮扶方案与家长沟通话术。'
    : '课堂关注名单：仅显示你任教班级，用于课业辅导、作业补交与课堂提醒（谈话帮扶由辅导员负责）。';
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">学业预警</div>' +
        '<div class="toolbar-actions">' +
          '<select id="al-class" class="input"></select>' +
          '<span class="chip" style="margin-left:8px">预警规则：近 2 周出勤率 &lt; 70% / 近 5 次作业缺交 ≥ 3 / 总评不及格</span>' +
          ((isCounselor || Auth.isAdmin(user))
            ? '<button id="al-help" class="btn btn-sm btn-primary" type="button">生成帮扶方案</button>' : '') +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12.5px;margin:-6px 0 12px">' +
        Utils.escapeHtml(purpose) +
        '　预警结果同时会显示在学生端「我的成绩」中，学生本人可知情并联系辅导员。' +
      '</p>' +
      '<div id="al-list"></div>' +
    '</div>';

  var sel = document.getElementById('al-class');
  sel.innerHTML = UI.options(Auth.visibleClasses(user), 'id', function (c) { return c.name; }, '', '全部班级');
  if (sel.options.length > 1 && !Auth.isAdmin(user)) state.classId = scopeIds[0] || '';
  sel.value = state.classId;
  sel.onchange = function () { state.classId = this.value; render(); };
  var helpBtn = document.getElementById('al-help');
  if (helpBtn) {
    helpBtn.addEventListener('click', function () {
      Store.setPref('aiOpenTab', 'help');   // 打开 AI 助手时直接落在「帮扶跟踪」
      location.hash = '#/ai-assistant';
    });
  }
  render();

  function render() {
    var ids = state.classId ? [state.classId] : scopeIds;
    var all = [];
    ids.forEach(function (id) {
      all = all.concat(Store.alertsFor(id, currentUiTerm()));
    });
    var el = document.getElementById('al-list');
    if (!all.length) {
      el.innerHTML = UI.empty(currentUiTerm() ? '本学期当前班级无学业预警' : '当前班级无学业预警');
      return;
    }
    var byClass = {};
    all.forEach(function (a) { (byClass[a.className] = byClass[a] || []).push(a); });
    var html = '';
    Object.keys(byClass).forEach(function (cn) {
      html += '<h3 style="margin:16px 0 10px;font-family:var(--serif);font-size:16px;color:var(--navy,#16337a);letter-spacing:2px">· ' + Utils.escapeHtml(cn) + '（预警 ' + byClass[cn].length + ' 人）</h3>';
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>学生</th><th>预警项</th></tr></thead><tbody>';
      html += byClass[cn].map(function (a) {
        return '<tr><td>' + Utils.escapeHtml(a.name) + '</td><td>' +
          a.reasons.map(function (r) { return UI.badge(r, 'danger'); }).join(' ') + '</td></tr>';
      }).join('');
      html += '</tbody></table></div>';
    });
    el.innerHTML = html;
  }
};

/* ---------------- 班级对比报告导出（PNG，matplotlib 调用） ---------------- */

Pages['class-report'] = function (container, user) {
  if (!Auth.isAdmin(user) && !Auth.isTeacher(user)) {
    container.innerHTML = '<div class="card">' + UI.empty('仅管理员 / 教师可使用') + '</div>';
    return;
  }
  var scopeIds = Auth.scopeClassIds(user);
  var state = { term: UI.termFilter.fallback() };
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">班级对比报告（导出 PNG）</div>' +
        '<div class="toolbar-actions">' +
          '<select id="cr-term" class="input"></select>' +
          '<button id="btn-cr-export" class="btn btn-primary" type="button">生成并下载</button>' +
        '</div>' +
      '</div>' +
      '<div id="cr-preview"></div>' +
    '</div>';

  var sel = document.getElementById('cr-term');
  sel.innerHTML = UI.termFilter.optionsHTML(state.term);   // 全站统一渲染（含「本 ·」标记）
  sel.onchange = function () {
    state.term = this.value;
    Store.setPref('uiTerm', this.value);   // 回写全站筛选，与顶栏保持一致
    UI.termFilter.syncTopbar();
    preview();
  };
  preview();

  function classesInScope() {
    var all = Store.list('classes');
    if (Auth.isAdmin(user)) return all;
    return all.filter(function (c) { return scopeIds.indexOf(c.id) !== -1; });
  }

  /** 收集全学期/全班的对比数据（学校领导真实使用场景） */
  function collect() {
    var scores = Store.list('scores').filter(function (s) { return Store.termMatch(s.term, state.term); });
    var att = Store.list('attendance').filter(function (a) { return Store.termMatch(a.term, state.term); });
    var comps = Store.list('competitions').filter(function (c) {
      return Store.termOfDate(c.date) === state.term;
    });
    return classesInScope().map(function (c) {
      var sCount = Store.list('students').filter(function (s) { return s.classId === c.id; }).length;
      var cls = scores.filter(function (s) { return s.classId === c.id; });
      var avg = cls.length ? Utils.round1(cls.reduce(function (a, s) { return a + s.score; }, 0) / cls.length) : 0;
      var pass = cls.length ? Math.round(cls.filter(function (s) { return s.score >= 60; }).length / cls.length * 100) : 0;
      var excellent = cls.length ? Math.round(cls.filter(function (s) { return s.score >= 90; }).length / cls.length * 100) : 0;
      var aRecs = att.filter(function (a) { return a.classId === c.id; });
      var aRate = aRecs.length ? Math.round(aRecs.filter(function (a) { return a.status === '出勤'; }).length / aRecs.length * 100) : 0;
      var cAwards = comps.filter(function (cp) { return cp.studentIds.some(function (id) {
        var s = Store.getStudent(id); return s && s.classId === c.id;
      }); }).length;
      return {
        name: c.name, grade: c.grade,
        students: sCount, avg: avg, excellent: excellent, pass: pass,
        attendance: aRate, awards: cAwards,
        scores: cls.length,
        alerts: Store.alertsFor(c.id, state.term).length
      };
    });
  }

  function preview() {
    var rows = collect();
    var html = '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th>班级</th><th>年级</th><th>学生</th><th>考试人次</th><th>平均分</th><th>优秀率</th><th>及格率</th><th>出勤率</th><th>竞赛</th><th>预警</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><b>' + Utils.escapeHtml(r.name) + '</b></td><td>' + Utils.escapeHtml(r.grade || '') + '</td>' +
          '<td>' + r.students + '</td><td>' + r.scores + '</td><td><b>' + r.avg + '</b></td>' +
          '<td>' + r.excellent + '%</td><td>' + r.pass + '%</td><td>' + r.attendance + '%</td>' +
          '<td>' + r.awards + '</td><td>' + (r.alerts ? UI.badge(r.alerts + ' 人', 'danger') : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    document.getElementById('cr-preview').innerHTML = html;
  }

  document.getElementById('btn-cr-export').addEventListener('click', function () {
    var rows = collect();
    var lines = ['武汉晴川学院班级管理系统 · 班级对比报告', '学期:' + state.term, '生成时间:' + Utils.nowStr(), '',
      '班级\t年级\t学生数\t考试人次\t平均分\t优秀率%\t及格率%\t出勤率%\t竞赛数\t预警人数'];
    rows.forEach(function (r) {
      lines.push([r.name, r.grade, r.students, r.scores, r.avg, r.excellent, r.pass, r.attendance, r.awards, r.alerts].join('\t'));
    });
    // CSV 作为底稿（PNG 由控制台另行说明）
    Utils.downloadFile('班级对比报告_' + state.term + '.csv', lines.join('\n'), 'text/csv;charset=utf-8');
    // PNG 报告：使用浏览器内置 Canvas 渲染表格 + 柱状对比图（不依赖 python）
    var png = window.renderReportPng(rows, state.term);
    if (png) Utils.downloadFile('班级对比报告_' + state.term + '.png', png, 'image/png');
    Toast.success('已下载 CSV 底稿与 PNG 报告');
  });
}