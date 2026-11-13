/* =====================================================
 * 考勤月报（管理员 / 教师，教师限本班）
 * - 按月 + 班级统计每名学生出勤/迟到/请假/缺勤次数与出勤率
 * - 出勤率 < 85% 或缺勤 ≥ 3 次标记为“重点关注”
 * - 支持“仅看预警”、导出 CSV
 * ===================================================== */

Pages['attendance-report'] = function (container, user) {
  var classes = Auth.visibleClasses(user);
  var state = {
    month: Utils.today().slice(0, 7), // 默认当前月 YYYY-MM
    // 教师可能任教多个班：取 teacherClassIds 的第一个（旧字段 user.classId 已废弃）
    classId: Auth.isTeacher(user) ? (Auth.teacherClassIds(user)[0] || '')
                                  : (classes[0] ? classes[0].id : ''),
    onlyWarn: false
  };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">考勤月报</div>' +
        '<div class="toolbar-actions">' +
          '<input type="month" id="ar-month" class="input" value="' + state.month + '">' +
          '<select id="ar-class" class="input">' +
            UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '请选择班级') +
          '</select>' +
          '<label class="radio" style="cursor:pointer"><input type="checkbox" id="ar-warn"> 仅看重点关注</label>' +
          '<button id="btn-ar-export" class="btn btn-ghost" type="button">导出CSV</button>' +
        '</div>' +
      '</div>' +
      '<div id="ar-stats" class="stat-grid"></div>' +
      '<div id="ar-table"></div>' +
    '</div>';

  $('#ar-month', container).addEventListener('change', function () {
    state.month = this.value || Utils.today().slice(0, 7);
    render();
  });
  $('#ar-class', container).addEventListener('change', function () {
    state.classId = this.value;
    render();
  });
  $('#ar-warn', container).addEventListener('change', function () {
    state.onlyWarn = this.checked;
    render();
  });
  $('#btn-ar-export', container).addEventListener('click', exportCSV);

  if (!classes.length || !state.classId) {
    $('#ar-stats', container).innerHTML = UI.empty('暂无班级，请先在「班级管理」中创建班级');
    return;
  }
  render();

  /** 取某月某班的按学生统计 */
  function monthlyStats() {
    var recs = Store.list('attendance').filter(function (a) {
      return a.classId === state.classId && String(a.date || '').indexOf(state.month) === 0;
    });
    var dates = {};
    recs.forEach(function (a) { dates[a.date] = true; });
    var students = Store.list('students').filter(function (s) { return s.classId === state.classId; })
      .sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
    var rows = students.map(function (s) {
      var counts = { '出勤': 0, '迟到': 0, '请假': 0, '缺勤': 0 };
      var total = 0;
      recs.forEach(function (a) {
        if (a.studentId === s.id && counts[a.status] !== undefined) {
          counts[a.status]++;
          total++;
        }
      });
      var rate = total ? Math.round(counts['出勤'] / total * 100) : null; // null = 当月无记录
      var warn = (rate !== null && rate < 85) || counts['缺勤'] >= 3;
      return { stu: s, counts: counts, total: total, rate: rate, warn: warn };
    });
    return { dates: Object.keys(dates).sort(), rows: rows, recs: recs };
  }

  function render() {
    var result = monthlyStats();
    var rows = result.rows;

    // 统计卡片
    var totalOf = function (st) { return rows.reduce(function (a, r) { return a + r.counts[st]; }, 0); };
    var withRec = rows.filter(function (r) { return r.rate !== null; });
    var avgRate = withRec.length
      ? Math.round(withRec.reduce(function (a, r) { return a + r.rate; }, 0) / withRec.length)
      : null;
    var warnCount = rows.filter(function (r) { return r.warn; }).length;

    $('#ar-stats', container).innerHTML =
      UI.statCard('记录天数', result.dates.length) +
      UI.statCard('平均出勤率', avgRate === null ? '暂无' : avgRate + '%') +
      UI.statCard('迟到总次数', totalOf('迟到')) +
      UI.statCard('请假/缺勤', totalOf('请假') + ' / ' + totalOf('缺勤')) +
      UI.statCard('重点关注人数', warnCount);

    // 表格
    var view = state.onlyWarn ? rows.filter(function (r) { return r.warn; }) : rows;
    if (!view.length) {
      $('#ar-table', container).innerHTML = UI.empty(
        state.onlyWarn ? '本月没有需要重点关注的学生' : '本月暂无考勤记录');
      return;
    }
    var head = '<tr><th>学号</th><th>姓名</th><th>出勤</th><th>迟到</th><th>请假</th><th>缺勤</th><th>出勤率</th><th>预警</th></tr>';
    var body = view.map(function (r) {
      var rateHtml = r.rate === null ? '<span style="color:var(--muted)">无记录</span>' : '<b class="' + (r.rate < 85 ? 'score-lo' : '') + '">' + r.rate + '%</b>';
      var warnHtml = r.warn
        ? UI.badge(r.rate !== null && r.rate < 85 ? '出勤偏低' : '缺勤较多', 'danger')
        : '<span style="color:var(--muted)">—</span>';
      return '<tr>' +
        '<td>' + Utils.escapeHtml(r.stu.studentNo) + '</td>' +
        '<td><b>' + Utils.escapeHtml(r.stu.name) + '</b></td>' +
        '<td>' + r.counts['出勤'] + '</td>' +
        '<td>' + r.counts['迟到'] + '</td>' +
        '<td>' + r.counts['请假'] + '</td>' +
        '<td>' + (r.counts['缺勤'] ? '<b class="score-lo">' + r.counts['缺勤'] + '</b>' : '0') + '</td>' +
        '<td>' + rateHtml + '</td>' +
        '<td>' + warnHtml + '</td>' +
      '</tr>';
    }).join('');
    $('#ar-table', container).innerHTML = UI.tableWrap(head, body);
  }

  function exportCSV() {
    var result = monthlyStats();
    var clsName = Store.className(state.classId);
    if (!result.rows.length) { Toast.warning('没有可导出的数据'); return; }
    Utils.exportCSV(
      '考勤月报_' + clsName + '_' + state.month + '.csv',
      ['学号', '姓名', '出勤', '迟到', '请假', '缺勤', '出勤率', '重点关注'],
      result.rows.map(function (r) {
        return [r.stu.studentNo, r.stu.name, r.counts['出勤'], r.counts['迟到'], r.counts['请假'], r.counts['缺勤'],
          r.rate === null ? '无记录' : r.rate + '%', r.warn ? '是' : '否'];
      })
    );
    Toast.success('月报已导出');
    Store._log('考勤管理', '导出月报', clsName + ' ' + state.month);
  }
};
