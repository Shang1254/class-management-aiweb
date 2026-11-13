/* =====================================================
 * 成绩分析（管理员 / 教师，教师限本班）
 * - 统计卡片：平均分、及格率、优秀率、最高/最低分、参评人次
 * - 图表：分数段分布、各科目平均分、单科考试趋势（折线）、
 *         学生画像雷达（个人 vs 班级）、班级对比（管理员）
 * - 图表基于 ECharts（CDN 加载）；未联网时自动降级为
 *   CSS 条形图 / 统计表格，功能不丢失（优雅降级）
 * ===================================================== */

Pages['score-analysis'] = function (container, user) {
  /* 科目排序库：与成绩录入共用真实课程清单 */
  var SUBJECTS = Store.COURSES;
  var isAdmin = Auth.isAdmin(user);
  var scopeIds = Auth.scopeClassIds(user);
  var charts = []; // 当前页 ECharts 实例（用于窗口缩放时重绘）
  var state = {
    // 初始学期取自顶栏「全站学期」开关（'' = 全部学期）
    term: UI.termFilter.get(),
    classId: isAdmin ? '' : (Auth.teacherClassIds(user)[0] || ''),
    exam: '',
    trendSubject: '',
    radarStudent: ''
  };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">成绩分析</div>' +
        '<div class="toolbar-actions">' +
          '<select id="sa-term" class="input"></select>' +
          '<select id="sa-class" class="input"></select>' +
          '<select id="sa-exam" class="input"></select>' +
        '</div>' +
      '</div>' +
      '<div id="sa-stats" class="stat-grid"></div>' +
    '</div>' +
    '<div class="grid-cards">' +
      '<div class="card"><div class="chart-title">分数段分布</div><div id="sa-dist"></div></div>' +
      '<div class="card"><div class="chart-title">各科目平均分</div><div id="sa-subavg"></div></div>' +
      (isAdmin ? '<div class="card"><div class="chart-title">班级对比</div><div id="sa-classcmp"></div></div>' : '') +
    '</div>' +
    '<div class="grid-cards">' +
      '<div class="card">' +
        '<div class="chart-title">单科考试趋势</div>' +
        '<select id="sa-trend-subject" class="input" style="width:auto;margin-bottom:12px"></select>' +
        '<div id="sa-trend"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="chart-title">学生画像雷达</div>' +
        '<select id="sa-radar-student" class="input" style="width:auto;margin-bottom:12px"></select>' +
        '<div id="sa-radar"></div>' +
      '</div>' +
    '</div>';

  $('#sa-term', container).addEventListener('change', function () {
    state.term = this.value;
    state.exam = '';
    state.radarStudent = '';
    Store.setPref('uiTerm', this.value);   // 与顶栏全站学期开关保持同一值
    UI.termFilter.syncTopbar();
    render();
  });
  $('#sa-class', container).addEventListener('change', function () {
    state.classId = this.value;
    state.radarStudent = '';
    render();
  });
  $('#sa-exam', container).addEventListener('change', function () { state.exam = this.value; render(); });
  $('#sa-trend-subject', container).addEventListener('change', function () { state.trendSubject = this.value; renderTrend(); });
  $('#sa-radar-student', container).addEventListener('change', function () { state.radarStudent = this.value; renderRadar(); });

  // 页面随窗口缩放重绘图表
  window.addEventListener('resize', Utils.debounce(function () {
    if (!container.isConnected) return;
    charts.forEach(function (c) { try { c.resize(); } catch (e) { /* 已销毁则忽略 */ } });
  }, 200));

  render();

  /* ---------- 数据工具 ---------- */

  function scopedByClass() {
    var list = Store.list('scores').filter(function (s) {
      return scopeIds.indexOf(s.classId) !== -1 &&
        Store.termMatch(s.term || Store.currentTerm(), state.term);
    });
    if (state.classId) list = list.filter(function (s) { return s.classId === state.classId; });
    return list;
  }

  /** 当前筛选（班级 + 考试）下的成绩 */
  function filtered() {
    var list = scopedByClass();
    if (state.exam) list = list.filter(function (s) { return s.examName === state.exam; });
    return list;
  }

  /** 品牌图表配色：学术藏青 / 晴空蓝 / 翠绿 */
  var C1 = '#1d5dd8', C2 = '#0a7fd0', C3 = '#10b981';

  /** 给图表选项注入当前主题的文本/网格/提示框配色（深浅模式自适应） */
  function themedOption(option) {
    var dark = document.documentElement.dataset.theme === 'dark';
    var txt = dark ? '#94a3b8' : '#64748b';
    var line = dark ? 'rgba(148,163,184,.22)' : 'rgba(100,116,139,.16)';
    option.textStyle = Object.assign({ color: txt }, option.textStyle || {});
    option.tooltip = Object.assign({
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      borderWidth: 0,
      textStyle: { color: dark ? '#e2e8f0' : '#334155' }
    }, option.tooltip || {});
    ['xAxis', 'yAxis'].forEach(function (ax) {
      if (!option[ax]) return;
      var arr = Array.isArray(option[ax]) ? option[ax] : [option[ax]];
      arr.forEach(function (a) {
        a.axisLabel = Object.assign({ color: txt }, a.axisLabel || {});
        a.axisLine = Object.assign({ lineStyle: { color: line } }, a.axisLine || {});
        a.splitLine = Object.assign({ lineStyle: { color: line } }, a.splitLine || {});
      });
    });
    if (option.legend) option.legend.textStyle = Object.assign({ color: txt }, option.legend.textStyle || {});
    if (option.radar) {
      option.radar.axisName = Object.assign({ color: txt }, option.radar.axisName || {});
      option.radar.axisLine = Object.assign({ lineStyle: { color: line } }, option.radar.axisLine || {});
      option.radar.splitLine = Object.assign({ lineStyle: { color: line } }, option.radar.splitLine || {});
      option.radar.splitArea = Object.assign({
        areaStyle: { color: dark ? ['rgba(148,163,184,.06)', 'transparent'] : ['rgba(47,123,255,.04)', 'transparent'] }
      }, option.radar.splitArea || {});
    }
    return option;
  }

  /** 绘图统一入口：优先 ECharts，未加载时使用降级 HTML */
  function draw(el, optionBuilder, fallbackHTML) {
    el.innerHTML = '';
    charts = charts.filter(function (c) { return !c.isDisposed(); });
    if (window.echarts) {
      // 同一个容器重新绘制时必须先销毁旧实例，否则 ECharts 会告警
      // "There is a chart instance already initialized on the dom." 并复用旧配置
      var old = window.echarts.getInstanceByDom(el);
      if (old && !old.isDisposed()) old.dispose();
      var instance = window.echarts.init(el);
      instance.setOption(themedOption(optionBuilder()));
      charts.push(instance);
    } else {
      el.innerHTML = fallbackHTML;
    }
  }

  function barOption(categories, values, color, name) {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 44, right: 16, top: 28, bottom: 26 },
      xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: categories.length > 6 ? 30 : 0, fontSize: 11 } },
      yAxis: { type: 'value' },
      series: [{ name: name || '数量', type: 'bar', data: values, barWidth: '52%', itemStyle: { color: color || C1, borderRadius: [6, 6, 0, 0] } }]
    };
  }

  function avg(list) {
    return list.length ? Utils.round1(list.reduce(function (a, s) { return a + s.score; }, 0) / list.length) : 0;
  }

  /* ---------- 主渲染 ---------- */

  function render() {
    // 学期下拉：与顶栏全站学期筛选同一个值（'' = 全部学期）
    // 选项由统一函数渲染（含「本 ·」标记与学期数）；本页以 '' 表示"全部学期"
    $('#sa-term', container).innerHTML =
      UI.termFilter.optionsHTML(state.term || '', { includeAll: true, allValue: '' });

    var classes = Auth.visibleClasses(user);
    var classSel = $('#sa-class', container);
    if (isAdmin) {
      classSel.innerHTML = UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '全部班级');
    } else {
      classSel.innerHTML = classes.length
        ? UI.options(classes, 'id', function (c) { return c.name; }, state.classId)
        : '<option value="">未绑定班级</option>';
      classSel.disabled = classes.length === 0;
    }

    var scoped = scopedByClass();
    var examSet = [];
    scoped.forEach(function (s) { if (examSet.indexOf(s.examName) === -1) examSet.push(s.examName); });
    $('#sa-exam', container).innerHTML = Utils.simpleOptions(examSet.sort(), state.exam, '全部考试');

    var list = filtered();

    // 统计卡片：平均分 / 及格率 / 优秀率 / 最高 / 最低 / 人次
    if (list.length) {
      var pass = list.filter(function (s) { return s.score >= 60; }).length;
      var good = list.filter(function (s) { return s.score >= 90; }).length;
      var max = Math.max.apply(null, list.map(function (s) { return s.score; }));
      var min = Math.min.apply(null, list.map(function (s) { return s.score; }));
      $('#sa-stats', container).innerHTML =
        UI.statCard('平均分', avg(list)) +
        UI.statCard('及格率', Math.round(pass / list.length * 100) + '%') +
        UI.statCard('优秀率', Math.round(good / list.length * 100) + '%') +
        UI.statCard('最高分', max) +
        UI.statCard('最低分', min) +
        UI.statCard('参评人次', list.length);
    } else {
      $('#sa-stats', container).innerHTML = UI.empty('当前筛选范围内暂无成绩数据');
    }

    renderDist(list);
    renderSubAvg(scoped);
    if (isAdmin) renderClassCmp();
    renderTrendSelect(scoped);
    renderTrend();
    renderRadarSelect();
    renderRadar();
  }

  /* ---------- 分数段分布 ---------- */
  function renderDist(list) {
    var ranges = [
      { label: '不及格', min: 0, max: 59 },
      { label: '及格', min: 60, max: 69 },
      { label: '中等', min: 70, max: 79 },
      { label: '良好', min: 80, max: 89 },
      { label: '优秀', min: 90, max: 100 }
    ];
    var counts = ranges.map(function (r) {
      return list.filter(function (s) { return s.score >= r.min && s.score <= r.max; }).length;
    });
    draw($('#sa-dist', container), function () {
      return barOption(ranges.map(function (r) { return r.label; }), counts, '#6366f1', '人数');
    }, list.length ? UI.barChart(ranges.map(function (r, i) { return { label: r.label, value: counts[i], suffix: '人' }; })) : UI.empty('暂无数据'));
  }

  /* ---------- 各科目平均分 ---------- */
  function renderSubAvg(scoped) {
    var subSet = [];
    scoped.forEach(function (s) { if (subSet.indexOf(s.subject) === -1) subSet.push(s.subject); });
    subSet.sort(function (a, b) { return SUBJECTS.indexOf(a) - SUBJECTS.indexOf(b); });
    var avgs = subSet.map(function (sub) {
      return avg(scoped.filter(function (s) { return s.subject === sub; }));
    });
    draw($('#sa-subavg', container), function () {
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 28, bottom: 26 },
        xAxis: { type: 'category', data: subSet, axisLabel: { interval: 0, fontSize: 11 } },
        yAxis: { type: 'value', max: 100 },
        series: [{ name: '平均分', type: 'bar', data: avgs, barWidth: '52%', itemStyle: { color: C2, borderRadius: [6, 6, 0, 0] } }]
      };
    }, subSet.length ? UI.barChart(subSet.map(function (sub, i) { return { label: sub, value: avgs[i], suffix: '分' }; })) : UI.empty('暂无数据'));
  }

  /* ---------- 班级对比（管理员） ---------- */
  function renderClassCmp() {
    // 只对比管理员可见范围内的班级，并跟随当前学期筛选（此前忽略学期/范围，
    // 会出现"切了学期图表数字不动"的错觉）
    var classes = Store.list('classes').filter(function (c) { return scopeIds.indexOf(c.id) !== -1; });
    var avgs = [], rates = [];
    classes.forEach(function (c) {
      var list = Store.list('scores').filter(function (s) {
        return s.classId === c.id && Store.termMatch(s.term || Store.currentTerm(), state.term);
      });
      avgs.push(avg(list));
      rates.push(list.length ? Math.round(list.filter(function (s) { return s.score >= 60; }).length / list.length * 100) : 0);
    });
    draw($('#sa-classcmp', container), function () {
      return {
        tooltip: { trigger: 'axis' },
        legend: { data: ['平均分', '及格率(%)'], top: 0 },
        grid: { left: 44, right: 44, top: 34, bottom: 26 },
        xAxis: { type: 'category', data: classes.map(function (c) { return c.name; }) },
        yAxis: [
          { type: 'value', name: '分', max: 100 },
          { type: 'value', name: '%', max: 100, splitLine: { show: false } }
        ],
        series: [
          { name: '平均分', type: 'bar', data: avgs, barWidth: '30%', itemStyle: { color: C1, borderRadius: [6, 6, 0, 0] } },
          { name: '及格率(%)', type: 'bar', yAxisIndex: 1, data: rates, barWidth: '30%', itemStyle: { color: C3, borderRadius: [6, 6, 0, 0] } }
        ]
      };
    }, classes.length ? UI.barChart(classes.map(function (c, i) { return { label: c.name, value: avgs[i], suffix: '分' }; })) : UI.empty('暂无数据'));
  }

  /* ---------- 单科考试趋势（折线） ---------- */
  function renderTrendSelect(scoped) {
    var subSet = [];
    scoped.forEach(function (s) { if (subSet.indexOf(s.subject) === -1) subSet.push(s.subject); });
    subSet.sort(function (a, b) { return SUBJECTS.indexOf(a) - SUBJECTS.indexOf(b); });
    if (!state.trendSubject || subSet.indexOf(state.trendSubject) === -1) {
      state.trendSubject = subSet[0] || '';
    }
    $('#sa-trend-subject', container).innerHTML = Utils.simpleOptions(subSet, state.trendSubject);
  }

  function renderTrend() {
    var el = $('#sa-trend', container);
    if (!state.trendSubject) { el.innerHTML = UI.empty('暂无数据'); return; }
    // 该科目在各次考试中的平均分，按考试日期排序
    var byExam = {};
    scopedByClass().forEach(function (s) {
      if (s.subject !== state.trendSubject) return;
      if (!byExam[s.examName]) byExam[s.examName] = { date: s.date, scores: [] };
      byExam[s.examName].scores.push(s.score);
    });
    var exams = Object.keys(byExam).sort(function (a, b) {
      return String(byExam[a].date).localeCompare(String(byExam[b].date));
    });
    if (!exams.length) { el.innerHTML = UI.empty('该科目暂无成绩'); return; }
    var avgs = exams.map(function (e) { return avg(byExam[e].scores); });

    draw(el, function () {
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 28, bottom: 26 },
        xAxis: { type: 'category', data: exams, boundaryGap: false },
        yAxis: { type: 'value', max: 100 },
        series: [{
          name: state.trendSubject + '平均分', type: 'line', data: avgs, smooth: true,
          symbolSize: 8, itemStyle: { color: C2 },
          lineStyle: { width: 3, shadowColor: 'rgba(10,127,208,.4)', shadowBlur: 10, shadowOffsetY: 4 },
          areaStyle: { color: 'rgba(10,127,208,.12)' },
          label: { show: true, formatter: '{c}' }
        }]
      };
    }, UI.barChart(exams.map(function (e, i) { return { label: e, value: avgs[i], suffix: '分' }; })));
  }

  /* ---------- 学生画像雷达（个人 vs 班级平均） ---------- */
  function renderRadarSelect() {
    var students = Store.list('students').filter(function (s) {
      return scopeIds.indexOf(s.classId) !== -1 && (!state.classId || s.classId === state.classId);
    }).sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
    if (!state.radarStudent || !students.some(function (s) { return s.id === state.radarStudent; })) {
      state.radarStudent = students.length ? students[0].id : '';
    }
    $('#sa-radar-student', container).innerHTML = students.length
      ? UI.options(students, 'id', function (s) { return s.name + '（' + s.studentNo + '）'; }, state.radarStudent)
      : '<option value="">暂无学生</option>';
  }

  function renderRadar() {
    var el = $('#sa-radar', container);
    var stu = state.radarStudent ? Store.getStudent(state.radarStudent) : null;
    if (!stu) { el.innerHTML = UI.empty('暂无学生'); return; }

    // 班级同学集合（与所选学生同班）
    var mateIds = Store.list('students').filter(function (s) { return s.classId === stu.classId; })
      .map(function (s) { return s.id; });
    // 只取原始成绩：总评是「平时+期末」的合成结果、随堂测验另有专门面板，
    // 三者混在一起会把画像平均分重复加权；同时跟随当前学期筛选
    var all = Store.list('scores').filter(function (s) {
      if (s.examName.indexOf('总评') === 0) return false;
      if (s.examName.indexOf('随堂测验') === 0) return false;
      return Store.termMatch(s.term || Store.currentTerm(), state.term);
    });
    var myScores = all.filter(function (s) { return s.studentId === stu.id; });
    var subSet = [];
    myScores.forEach(function (s) { if (subSet.indexOf(s.subject) === -1) subSet.push(s.subject); });
    subSet.sort(function (a, b) { return SUBJECTS.indexOf(a) - SUBJECTS.indexOf(b); });
    if (!subSet.length) { el.innerHTML = UI.empty('该学生暂无成绩'); return; }

    var myAvgs = subSet.map(function (sub) {
      return avg(myScores.filter(function (s) { return s.subject === sub; }));
    });
    var clsAvgs = subSet.map(function (sub) {
      var list = all.filter(function (s) { return s.subject === sub && mateIds.indexOf(s.studentId) !== -1; });
      return avg(list);
    });

    draw(el, function () {
      return {
        tooltip: {},
        legend: { data: ['个人平均分', '班级平均分'], bottom: 0 },
        radar: {
          indicator: subSet.map(function (sub) { return { name: sub, max: 100 }; }),
          radius: '62%'
        },
        series: [{
          type: 'radar',
          data: [
            { value: myAvgs, name: '个人平均分', itemStyle: { color: C1 }, areaStyle: { color: 'rgba(47,123,255,.25)' } },
            { value: clsAvgs, name: '班级平均分', itemStyle: { color: C3 }, areaStyle: { color: 'rgba(16,185,129,.15)' } }
          ]
        }]
      };
    }, function () {
      // 降级：对比表格
      return '<div class="table-wrap"><table class="table" style="min-width:auto"><thead><tr><th>科目</th><th>个人平均</th><th>班级平均</th><th>差值</th></tr></thead><tbody>' +
        subSet.map(function (sub, i) {
          var diff = Utils.round1(myAvgs[i] - clsAvgs[i]);
          return '<tr><td>' + Utils.escapeHtml(sub) + '</td><td><b>' + myAvgs[i] + '</b></td><td>' + clsAvgs[i] +
            '</td><td class="' + (diff >= 0 ? 'score-hi' : 'score-lo') + '">' + (diff >= 0 ? '+' : '') + diff + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }());
  }
};
