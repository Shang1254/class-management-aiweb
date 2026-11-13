/* =====================================================
 * 综合素质测评（辅导员 / 管理员端口 · 学生工作线）
 * -----------------------------------------------------
 * 为什么做：奖助学金评定、评优评先、推免与就业推荐都以"综测排名"为第一依据，
 * 但多数班级管理系统只给一张空白测评表 —— 本模块把测评口径数字化：
 *   总分 100 = 智育 60（学期平均分 × 0.6）+ 德育 20（考勤：缺勤 -2/次、迟到 -0.5/次）+ 文体与附加 20（竞赛加分 + 手工加减分，封顶 20）
 * 数据来源全部为系统已有记录（成绩、考勤、竞赛）+ 辅导员录入的加分/扣分条目（cms_evaluations），
 * 可导出公示表；学生端「我的综测」同步可见本人得分、分项明细与依据。
 * ===================================================== */

Pages.evaluations = function (container, user) {
  // 综测属学生工作线：辅导员专属（管理员可查）
  if (!Auth.isAdmin(user) && !Auth.isCounselor(user)) {
    container.innerHTML = '<div class="card">' + UI.empty('综合素质测评属学生工作线（辅导员）功能') + '</div>';
    return;
  }
  var scopeIds = Auth.scopeClassIds(user);
  var classes = Auth.visibleClasses(user);
  var state = {
    classId: classes[0] ? classes[0].id : '',
    // 默认：顶栏学期 > 当前学期（若无成绩则取该班最近有成绩的学期）
    term: UI.termFilter.get() || (classes[0] ? Store.bestTermFor(classes[0].id) : Store.currentTerm())
  };
  var R = Store.EVAL_RULES;

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">综合素质测评</div>' +
        '<div class="toolbar-actions">' +
          '<select id="ev-class" class="input"></select>' +
          '<select id="ev-term" class="input"></select>' +
          '<button id="ev-export" class="btn btn-ghost" type="button">导出公示表</button>' +
          '<button id="ev-add" class="btn btn-primary" type="button">＋ 录入加分 / 扣分</button>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12.5px;margin:-6px 0 12px">' +
        '测评口径：<b>总分 100 = 智育 60</b>（学期平均分 × 0.6）<b> + 德育 20</b>（基础 20，缺勤 ' + R.moral.absent +
        ' 分/次、迟到 ' + R.moral.late + ' 分/次）<b> + 文体与附加 20</b>（竞赛获奖按级别加分，加/扣分手工录入，封顶 ' + R.extra.cap +
        ' 分）。数据取自成绩、考勤与竞赛记录；测评结果学生端「我的综测」同步可见。' +
      '</p>' +
      '<div id="ev-stats" class="att-summary"></div>' +
      '<div id="ev-hint"></div>' +
      '<div id="ev-table"></div>' +
    '</div>' +
    '<div id="ev-qualify"></div>';

  var classSel = $('#ev-class', container);
  classSel.innerHTML = UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '请选择班级');
  var termSel = $('#ev-term', container);
  termSel.innerHTML = UI.termFilter.optionsHTML(state.term) ||
    '<option value="' + Store.currentTerm() + '">本 · ' + Store.termText(Store.currentTerm()) + '</option>';
  classSel.onchange = function () {
    state.classId = this.value;
    if (!UI.termFilter.get()) state.term = Store.bestTermFor(this.value);   // 跟随班级智能选学期
    termSel.value = state.term;
    render();
  };
  termSel.onchange = function () {
    state.term = this.value;
    Store.setPref('uiTerm', this.value);   // 与顶栏「全站学期」保持同一值
    UI.termFilter.syncTopbar();
    render();
  };
  $('#ev-export', container).addEventListener('click', exportCSV);
  $('#ev-add', container).addEventListener('click', function () { openExtraModal(); });
  render();

  function render() {
    if (!state.classId) {
      $('#ev-table', container).innerHTML = UI.empty('请选择班级');
      $('#ev-stats', container).innerHTML = '';
      return;
    }
    var rows = Store.evalOf(state.classId, state.term);
    var withScore = rows.filter(function (x) { return x.total !== null; });
    // 该学期尚无成绩时给出明确说明（否则表格全是"—"，看起来像数据缺失）
    var scoreCnt = Store.list('scores').filter(function (x) {
      return x.classId === state.classId && Store.termMatch(x.term, state.term);
    }).length;
    var hint = $('#ev-hint', container);
    if (hint) {
      hint.innerHTML = (rows.length && !withScore.length)
        ? '<div class="info-bar"><span class="info-ico">ⓘ</span><span><b>' + Utils.escapeHtml(Store.termText(state.term)) +
          '</b> 尚无成绩录入（该学期成绩数 0），智育未计入、综测总分暂不生成；可切换上方学期查看，或先在「成绩管理」录入本学期成绩（共 ' + scoreCnt + ' 条）。</span></div>'
        : '';
    }
    var avgTotal = withScore.length
      ? Utils.round1(withScore.reduce(function (a, x) { return a + x.total; }, 0) / withScore.length) : '暂无';
    $('#ev-stats', container).innerHTML =
      '<span class="chip">' + Utils.escapeHtml(Store.className(state.classId)) + '</span>' +
      '<span class="chip">' + Utils.escapeHtml(Store.termText(state.term)) + '</span>' +
      '<span class="chip">参评 <b>' + rows.length + '</b> 人</span>' +
      '<span class="chip chip-info">班级平均综测 <b>' + avgTotal + '</b></span>' +
      '<span class="chip chip-ok">最高 <b>' + (withScore[0] ? withScore[0].total : '—') + '</b>（' + (withScore[0] ? Utils.escapeHtml(withScore[0].name) : '—') + '）</span>' +
      '<span class="chip chip-warn">加/扣分条目 <b>' + Store.list('evaluations').filter(function (e) {
        return e.classId === state.classId && Store.termMatch(e.term, state.term);
      }).length + '</b></span>';

    if (!rows.length) {
      $('#ev-table', container).innerHTML = UI.empty('该班级暂无学生');
      return;
    }
    var head = '<tr><th>排名</th><th>姓名</th><th>智育（60）</th><th>德育（20）</th><th>文体与附加（20）</th><th>总分</th><th>明细</th><th class="th-ops">操作</th></tr>';
    var body = rows.map(function (x) {
      var details = [];
      if (x.absent) details.push(UI.badge('缺勤 ' + x.absent + ' 次', 'danger'));
      if (x.late) details.push(UI.badge('迟到 ' + x.late + ' 次', 'warning'));
      if (x.compDetail.length) details.push(UI.badge('竞赛 +' + x.compScore, 'info'));
      x.manual.forEach(function (m) {
        details.push(UI.badge((m.type === '扣分' ? '−' : '+') + m.score + ' ' + (m.reason || ''), m.type === '扣分' ? 'danger' : 'success'));
      });
      var manualIds = x.manual.map(function (m) { return m.id; }).join(',');
      return '<tr>' +
        '<td>' + (x.rank ? '<b>' + x.rank + '</b>' : '—') + '</td>' +
        '<td><b>' + Utils.escapeHtml(x.name) + '</b>' + (x.note ? '<small style="display:block;color:var(--muted)">' + Utils.escapeHtml(x.note) + '</small>' : '') + '</td>' +
        '<td>' + (x.avg === null ? '—' : x.study + ' <small style="color:var(--muted)">(' + x.avg + '×0.6)</small>') + '</td>' +
        '<td>' + x.moral + '</td>' +
        '<td>' + x.extra + (x.extraRaw > R.extra.cap ? ' <small style="color:var(--muted)">已封顶</small>' : '') + '</td>' +
        '<td>' + (x.total === null ? '—' : '<b class="' + (x.total >= 80 ? 'score-hi' : (x.total >= 60 ? '' : 'score-lo')) + '">' + x.total + '</b>') + '</td>' +
        '<td style="font-size:12px">' + (details.join(' ') || '<span style="color:var(--muted)">无</span>') + '</td>' +
        '<td class="td-ops">' + (manualIds
          ? '<button class="btn btn-sm btn-ghost" data-del-extra="' + manualIds + '" type="button">撤销加减分</button>'
          : '<span style="color:var(--muted);font-size:12px">—</span>') + '</td>' +
        '</tr>';
    }).join('');
    $('#ev-table', container).innerHTML = UI.tableWrap(head, body);
    $$('#ev-table [data-del-extra]', container).forEach(function (b) {
      b.addEventListener('click', function () { delExtras(b.dataset.delExtra.split(',')); });
    });
    renderQualify(rows);
  }

  /** 推免 / 评优资格参考（全班名单 · 与学生端共用同一套口径 Store.qualifyListOf） */
  function renderQualify(rankRows) {
    var box = $('#ev-qualify', container);
    if (!box) return;
    var list = Store.qualifyListOf(state.classId);
    if (!list.length) { box.innerHTML = ''; return; }
    var full = list.filter(function (x) { return x.passCount === x.rulesTotal; }).length;
    var rkMap = {};
    (rankRows || []).forEach(function (r) { rkMap[r.studentId] = r.rank; });
    box.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">推免 / 评优资格参考（全班）' +
          '<span style="color:var(--muted);font-size:12px;font-weight:400">' +
            '口径：无不及格 + 学业排名前 ' + Math.round(Store.QUALIFY_RULES.rankTopRatio * 100) +
            '% + GPA ≥ ' + Store.QUALIFY_RULES.gpaMin.toFixed(1) + ' + 有获奖或学生工作；' +
            '全班完全满足 <b>' + full + ' / ' + list.length + '</b> 人，<b>以学校当年文件为准</b></span>' +
          '<button id="ev-qualify-export" class="btn btn-sm btn-ghost" style="float:right" type="button">导出名单 CSV</button>' +
        '</div>' +
        '<div class="table-wrap"><table class="table" style="min-width:640px"><thead><tr>' +
          '<th>姓名</th><th>加权平均分</th><th>GPA</th><th>学业排名</th><th>不及格</th><th>综测排名</th><th>满足项</th><th>结论（参考）</th>' +
        '</tr></thead><tbody>' +
        list.map(function (x) {
          var ok = x.passCount === x.rulesTotal;
          return '<tr>' +
            '<td><b>' + Utils.escapeHtml(x.name) + '</b></td>' +
            '<td>' + (x.weightedAvg === null ? '—' : x.weightedAvg) + '</td>' +
            '<td>' + (x.gpa === null ? '—' : x.gpa) + '</td>' +
            '<td>' + (x.rank ? '第 ' + x.rank + ' / ' + x.total : '—') + '</td>' +
            '<td>' + (x.fails ? UI.badge(x.fails + ' 门', 'danger') : UI.badge('无', 'success')) + '</td>' +
            '<td>' + (rkMap[x.studentId] ? '第 ' + rkMap[x.studentId] : '—') + '</td>' +
            '<td>' + x.passCount + ' / ' + x.rulesTotal + '</td>' +
            '<td>' + (ok ? UI.badge('建议列入候选', 'success')
                          : (x.passCount === x.rulesTotal - 1 ? UI.badge('差 1 项', 'warning') : UI.badge('暂不满足', 'muted'))) + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>' +
      '</div>';
    var btn = $('#ev-qualify-export', container);
    if (btn) {
      btn.addEventListener('click', function () {
        Utils.exportCSV('推免评优资格参考_' + Store.className(state.classId) + '_' + Utils.today() + '.csv',
          ['姓名', '加权平均分', 'GPA', '学业排名', '参评人数', '不及格门数', '综测排名', '满足项', '结论（参考）'],
          list.map(function (x) {
            return [x.name, x.weightedAvg === null ? '' : x.weightedAvg, x.gpa === null ? '' : x.gpa,
              x.rank || '', x.total, x.fails, rkMap[x.studentId] || '', x.passCount + '/' + x.rulesTotal,
              x.passCount === x.rulesTotal ? '建议列入候选' : (x.passCount === x.rulesTotal - 1 ? '差 1 项' : '暂不满足')];
          }));
        Toast.success('资格参考名单已导出（供推免评议留档）');
      });
    }
  }

  /** 录入加分 / 扣分（社会工作、志愿服务、违纪扣分等无法自动计算的项） */
  function openExtraModal() {
    if (!state.classId) return Toast.warning('请先选择班级');
    var students = Store.list('students').filter(function (s) { return s.classId === state.classId; });
    if (!students.length) return Toast.warning('该班级暂无学生');
    UI.modal({
      title: '录入加分 / 扣分',
      body:
        UI.formRow('学生', '<select id="e-student" class="input">' +
          students.map(function (s) { return '<option value="' + s.id + '">' + Utils.escapeHtml(s.name + '（' + s.studentNo + '）') + '</option>'; }).join('') + '</select>', true) +
        '<div class="form-grid">' +
          UI.formRow('类型', '<select id="e-type" class="input"><option>加分</option><option>扣分</option></select>', true) +
          UI.formRow('分值', '<input id="e-score" class="input" type="number" min="0.5" max="20" step="0.5" value="2">', true) +
        '</div>' +
        UI.formRow('事由（将显示在公示表与学生端明细中）', '<input id="e-reason" class="input" placeholder="如：担任班级学习委员 / 参加志愿服务 20 小时 / 违纪扣分">', true),
      onSubmit(root, close) {
        var reason = $('#e-reason', root).value.trim();
        var score = Number($('#e-score', root).value);
        if (!reason) return Toast.warning('请填写事由');
        if (!(score > 0)) return Toast.warning('分值需大于 0');
        Store.add('evaluations', {
          studentId: $('#e-student', root).value, classId: state.classId, term: state.term,
          type: $('#e-type', root).value, score: score, reason: reason,
          recorder: user.name || user.username, createdAt: Utils.nowStr()
        });
        Toast.success('已录入（学生端「我的综测」同步可见）');
        close(); render();
      }
    });
  }

  function delExtras(ids) {
    UI.confirm({
      title: '撤销加减分',
      message: '将删除该学生本学期的 ' + ids.length + ' 条加/扣分记录，确定吗？',
      onOk() {
        ids.forEach(function (id) { Store.remove('evaluations', id); });
        Toast.success('已撤销');
        render();
      }
    });
  }

  function exportCSV() {
    var rows = Store.evalOf(state.classId, state.term);
    if (!rows.length) return Toast.warning('没有可导出的数据');
    Utils.exportCSV('综合素质测评公示表_' + Store.className(state.classId) + '_' + state.term + '.csv',
      ['排名', '姓名', '智育（60）', '德育（20）', '文体与附加（20）', '总分', '缺勤次数', '迟到次数', '竞赛加分', '加/扣分明细'],
      rows.map(function (x) {
        return [x.rank || '', x.name, x.avg === null ? '' : x.study, x.moral, x.extra,
          x.total === null ? '' : x.total, x.absent, x.late, x.compScore,
          x.manual.map(function (m) { return (m.type === '扣分' ? '−' : '+') + m.score + ' ' + (m.reason || ''); }).join('；')];
      }));
    Toast.success('公示表已导出（含测评口径与明细，可直接张贴/上报）');
  }
};
