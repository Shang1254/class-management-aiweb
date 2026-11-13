/* =====================================================
 * 学生端页面（角色为学生，全部只读）
 * 我的信息 / 我的成绩 / 我的考勤 / 通知查看 / 学生版仪表盘
 * ===================================================== */

/** 获取当前学生账号绑定的学生档案 */
function getMyStudent(user) {
  if (!user || !user.studentId) return null;
  return Store.getStudent(user.studentId);
}

/** 分数着色：≥90 绿色，<60 红色 */
function scoreCls(v) {
  return v >= 90 ? 'score-hi' : (v < 60 ? 'score-lo' : '');
}

/** 本人学科竞赛获奖 HTML（无获奖给友好占位） */
function cmpAwardsHTML(stu) {
  var list = Store.list('competitions').filter(function (c) {
    return c.studentIds.indexOf(stu.id) !== -1;
  });
  if (!list.length) return '<span style="color:var(--muted)">暂无获奖记录，期待你的第一次获奖</span>';
  return list.map(function (c) {
    return UI.badge(c.award, 'success') + ' ' + Utils.escapeHtml(c.name) +
      '<small style="display:block;color:var(--muted);margin-top:3px">' +
      Utils.escapeHtml(c.level) + ' · ' + Utils.escapeHtml(c.date) +
      (c.teacher ? ' · 指导教师 ' + Utils.escapeHtml(c.teacher) : '') + '</small>';
  }).join('<br>');
}

/** 本人学习轨迹 SVG 时间轴（按学期聚合成绩/出勤/获奖） */
function studyTimelineSVG(stu) {
  var scores = Store.list('scores').filter(function (s) { return s.studentId === stu.id && s.examName.indexOf('总评') === -1 && s.examName.indexOf('随堂测验') !== 0; });
  var att = Store.list('attendance').filter(function (a) { return a.studentId === stu.id; });
  var comps = Store.list('competitions').filter(function (c) { return c.studentIds.indexOf(stu.id) !== -1; });
  // 按学期汇总
  var terms = {};
  scores.forEach(function (s) {
    var t = s.term || '未归';
    if (!terms[t]) terms[t] = { scores: [], att: [], comps: [] };
    terms[t].scores.push(s);
  });
  att.forEach(function (a) {
    var t = a.term || '未归';
    if (!terms[t]) terms[t] = { scores: [], att: [], comps: [] };
    terms[t].att.push(a);
  });
  comps.forEach(function (c) {
    var t = Store.termOfDate(c.date);
    if (!terms[t]) terms[t] = { scores: [], att: [], comps: [] };
    terms[t].comps.push(c);
  });
  var sortedTerms = Object.keys(terms).sort();
  var w = Math.max(420, 130 * sortedTerms.length);
  var h = 110, pad = 28;
  var colW = (w - pad * 2) / Math.max(1, sortedTerms.length);
  var path = '', dots = '';
  // 平均分折线
  sortedTerms.forEach(function (t, i) {
    var arr = terms[t].scores;
    var avg = arr.length ? arr.reduce(function (a, s) { return a + s.score; }, 0) / arr.length : 0;
    var x = pad + colW * (i + 0.5);
    var y = avg ? (h - pad - (avg / 100) * (h - pad * 2)) : h - pad;
    if (i === 0) path += 'M ' + x + ' ' + y;
    else path += ' L ' + x + ' ' + y;
    dots += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#c9a24b" stroke="#fff" stroke-width="2"></circle>';
  });
  var labels = sortedTerms.map(function (t, i) {
    var x = pad + colW * (i + 0.5);
    var avg = terms[t].scores.length ? (terms[t].scores.reduce(function (a, s) { return a + s.score; }, 0) / terms[t].scores.length).toFixed(1) : '—';
    var att = terms[t].att.length ? Math.round(terms[t].att.filter(function (a) { return a.status === '出勤'; }).length / terms[t].att.length * 100) + '%' : '—';
    var award = terms[t].comps.length;
    return '<g transform="translate(' + x + ',0)">' +
      '<text x="0" y="16" text-anchor="middle" font-family="Microsoft YaHei" font-size="11" fill="#5f6f8a">' + Store.termText(t).slice(0, 11) + '</text>' +
      '<text x="0" y="42" text-anchor="middle" font-family="serif" font-size="20" font-weight="700" fill="#1d5dd8">' + avg + '</text>' +
      '<text x="0" y="60" text-anchor="middle" font-family="Microsoft YaHei" font-size="9" fill="#9fb4dd">出勤 ' + att + '</text>' +
      (award ? '<text x="0" y="76" text-anchor="middle" font-family="Microsoft YaHei" font-size="9" fill="#c9a24b">获奖 ' + award + '</text>' : '') +
      '</g>';
  }).join('');
  return '<div style="overflow-x:auto">' +
    '<svg width="' + w + '" height="' + h + '" style="display:block">' +
    '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="#9fb4dd" stroke-dasharray="3 3"></line>' +
    '<path d="' + path + '" stroke="#1d5dd8" stroke-width="2" fill="none"></path>' +
    dots + labels +
    '</svg></div>';
}

/** 本人奖助学金 HTML（无记录给友好占位） */
function myScholarshipsHTML(stu) {
  var list = Store.list('scholarships').filter(function (x) { return x.studentId === stu.id; })
    .sort(function (a, b) { return String(b.academicYear || '').localeCompare(String(a.academicYear || '')); });
  if (!list.length) return '<span style="color:var(--muted)">暂无奖助记录（助学金需先完成家庭经济困难认定）</span>';
  return list.map(function (x) {
    return UI.badge(x.status, x.status === '已发放' ? 'success' : (x.status === '已公示' ? 'info' : 'warning')) + ' ' +
      Utils.escapeHtml(x.name) + ' ' + UI.badge(x.level, x.level === '国家级' ? 'danger' : 'info') +
      '<small style="display:block;color:var(--muted);margin-top:3px">' +
      x.academicYear + ' 学年 · ' + Number(x.amount || 0).toLocaleString() + ' 元' +
      (x.remark ? ' · ' + Utils.escapeHtml(x.remark) : '') + '</small>';
  }).join('<br>');
}

/* ---------------- 我的信息 ---------------- */
Pages['my-info'] = function (container, user) {
  var stu = getMyStudent(user);
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员在「用户管理」中绑定') + '</div>';
    return;
  }
  function item(label, value) {
    return '<div class="info-item"><div class="info-label">' + label + '</div><div class="info-value">' + (value || '—') + '</div></div>';
  }
  container.innerHTML =
    '<div class="card">' +
      '<div class="profile-head">' +
        '<div class="profile-avatar">' + Utils.escapeHtml(stu.name.charAt(0)) + '</div>' +
        '<div>' +
          '<div class="profile-name">' + Utils.escapeHtml(stu.name) + ' ' + UI.studentBadge(stu.status) + '</div>' +
          '<div class="profile-sub">' + Utils.escapeHtml(Store.className(stu.classId)) + ' · 学号 ' + Utils.escapeHtml(stu.studentNo) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="info-grid">' +
        item('学号', Utils.escapeHtml(stu.studentNo)) +
        item('姓名', Utils.escapeHtml(stu.name)) +
        item('性别', Utils.escapeHtml(stu.gender)) +
        item('出生日期', Utils.escapeHtml(stu.birth)) +
        item('班级', Utils.escapeHtml(Store.className(stu.classId))) +
        item('培养层次 / 学习形式', UI.studentTypeHTML(stu) +
          '<small style="display:block;color:var(--muted);margin-top:3px">招生类别：' + Utils.escapeHtml(stu.enrollType || '普通高考') + '</small>') +
        item('年级 / 学制 / 届别', Utils.escapeHtml(Store.cohortText(stu)) ||
          '—') +
        item('学科竞赛获奖', cmpAwardsHTML(stu)) +
        item('奖助学金记录', myScholarshipsHTML(stu)) +
        item('联系电话', Utils.escapeHtml(stu.phone)) +
        item('家长电话', Utils.escapeHtml(stu.parentPhone)) +
        item('家庭住址', Utils.escapeHtml(stu.address)) +
      '</div>' +
      '<div style="margin-top:18px"><div class="chart-title">学习轨迹（按学期）</div>' +
        studyTimelineSVG(stu) +
        '<p style="color:var(--muted);font-size:11px;margin-top:8px">折线为该学期考试/总评的平均分；节点下方依次展示出勤率、获奖次数。</p></div>' +
    '</div>';
};

/* ---------------- 我的综测（综合素质测评） ---------------- */
Pages['my-evaluation'] = function (container, user) {
  var stu = getMyStudent(user);
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  // 学期口径：优先顶栏选中的学期；未选时优先当前学期，若当前学期无成绩则回退到最近有成绩的学期
  var picked = UI.termFilter.get();
  var term = picked || Store.bestTermFor(stu.classId, stu.id);   // 按本人成绩所在学期回退
  var isYearTerm = /^\d{4}-\d{4}$/.test(String(term));          // 全学年（两学期合计）口径
  var R = Store.EVAL_RULES;
  var list = Store.evalOf(stu.classId, term);
  var me = list.filter(function (x) { return x.studentId === stu.id; })[0] || {};
  var rated = list.filter(function (x) { return x.total !== null; });
  var details = [];
  if (me.absent) details.push(UI.badge('缺勤 ' + me.absent + ' 次（−' + Utils.round1(me.absent * R.moral.absent) + '）', 'danger'));
  if (me.late) details.push(UI.badge('迟到 ' + me.late + ' 次（−' + Utils.round1(me.late * R.moral.late) + '）', 'warning'));
  (me.compDetail || []).forEach(function (t) { details.push(UI.badge(t, 'info')); });
  (me.manual || []).forEach(function (m) {
    details.push(UI.badge((m.type === '扣分' ? '−' : '+') + m.score + ' ' + (m.reason || '') +
      '（' + Utils.escapeHtml(m.recorder || '') + '）', m.type === '扣分' ? 'danger' : 'success'));
  });
  // 分项进度条占比（相对各自上限：智育 60 / 德育 20 / 文体与附加 20）
  var pct = function (v, max) { return Math.max(0, Math.min(100, Math.round(v / max * 100))) + '%'; };
  var totalMax = 100;
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">我的综测</div>' +
        '<div class="toolbar-actions">' +
          '<span class="chip">' + Utils.escapeHtml(Store.className(stu.classId)) + '</span>' +
          // 页内学期选择：与顶栏「全站学期」同步（统一渲染：短文案 + 学生视角的（第N学期））
          '<select id="mve-term" class="input" style="max-width:330px">' + UI.termFilter.optionsHTML(term) + '</select>' +
        '</div>' +
      '</div>' +
      // 自动回退说明：独立提示条（不再挤在工具栏里，也不重复显示学期名）
      (picked ? '' : '<div class="info-bar"><span class="info-ico">ⓘ</span><span>综测按学期计算（不跨学期合计）；当前口径下没有成绩数据，已显示最近有成绩的学期：<b>' +
        Utils.escapeHtml(Store.termText(term)) + '</b>（可切换上方学期查看其它学期）</span></div>') +
      (me.total === null
        ? UI.empty('该学期暂无成绩数据，智育未计入，暂不生成综测排名')
        : '<div class="stat-grid">' +
            '<div class="stat-card"><div class="stat-label">综测总分</div>' +
              '<div class="stat-value">' + me.total + '</div>' +
              '<div class="stat-sub">满分 ' + totalMax + ' 分 · 班级排名第 ' + me.rank + ' 名</div>' +
              '<div class="mini-bar"><i style="width:' + pct(me.total, totalMax) + '"></i></div></div>' +
            '<div class="stat-card"><div class="stat-label">智育</div>' +
              '<div class="stat-value">' + me.study + '</div>' +
              '<div class="stat-sub">学期平均分 ' + me.avg + ' × 0.6（满分 60）</div>' +
              '<div class="mini-bar mb-navy"><i style="width:' + pct(me.study, 60) + '"></i></div></div>' +
            '<div class="stat-card"><div class="stat-label">德育</div>' +
              '<div class="stat-value">' + me.moral + '</div>' +
              '<div class="stat-sub">基础 20，缺勤 ' + me.absent + ' 次、迟到 ' + me.late + ' 次（满分 20）</div>' +
              '<div class="mini-bar mb-green"><i style="width:' + pct(me.moral, 20) + '"></i></div></div>' +
            '<div class="stat-card"><div class="stat-label">文体与附加</div>' +
              '<div class="stat-value">' + me.extra + '</div>' +
              '<div class="stat-sub">竞赛与加减分（封顶 20）</div>' +
              '<div class="mini-bar"><i style="width:' + pct(me.extra, 20) + '"></i></div></div>' +
            '<div class="stat-card"><div class="stat-label">班级排名</div>' +
              '<div class="stat-value">第 ' + me.rank + ' 名</div>' +
              '<div class="stat-sub">参评 ' + rated.length + ' 人</div></div>' +
          '</div>' +
          '<div style="margin-top:16px"><div class="chart-title" style="font-size:14px">分项依据（公示口径）</div>' +
            '<div style="font-size:13px;line-height:2">' +
              (details.length ? details.join(' ') : UI.badge('本学期无扣分与加/扣分条目', 'success')) + '</div>' +
          '</div>') +
      '<p style="color:var(--muted);font-size:12px;margin-top:14px;line-height:1.8;border-top:1px dashed var(--border);padding-top:10px">' +
        '<b>测评口径</b>：总分 100 = 智育 60（学期平均分 × 0.6）+ 德育 20（基础 20，缺勤 ' + R.moral.absent +
        ' 分/次、迟到 ' + R.moral.late + ' 分/次）+ 文体与附加 20（竞赛获奖按级别加分、社会工作等加减分，封顶 ' + R.extra.cap +
        ' 分）。数据取自你的成绩、考勤与竞赛记录（本学期共 ' + (Store.programYears(stu) * 2) + ' 个学期）；' +
        (isYearTerm ? '<b>当前为学年合计口径</b>：智育取该学年两个学期的全部成绩，德育按该学年考勤合计，竞赛与加/扣分按学年累计；' : '') +
        '对结果有疑问请于公示期内联系辅导员（综合楼一 108）。' +
      '</p>' +
    '</div>';
  // 页内学期选择：与顶栏「全站学期」双向同步，学生可自行切回查看不同学期
  var termSel = document.getElementById('mve-term');
  if (termSel) {
    termSel.onchange = function () {
      Store.setPref('uiTerm', this.value);
      UI.termFilter.syncTopbar();
      Pages['my-evaluation'](container, user);   // 重渲染本页（含学期回退提示）
    };
  }
};

/* ---------------- 我的成绩 ---------------- */
Pages['my-scores'] = function (container, user) {
  var stu = getMyStudent(user);
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  var state = { term: UI.termFilter.get(), exam: '' };
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">我的成绩</div>' +
        '<div class="toolbar-actions">' +
          '<select id="ms-term" class="input"></select>' +
          '<select id="ms-exam" class="input"></select>' +
        '</div>' +
      '</div>' +
      '<div id="ms-alert"></div>' +
      '<div id="ms-scope-note" class="info-bar" style="display:none"></div>' +
      '<div id="ms-stats" class="stat-grid"></div>' +
      '<div id="ms-warn"></div>' +
      '<div id="ms-table"></div>' +
    '</div>';

  /** 百分制成绩 → 绩点（常用 4.0 分段算法） */
  function gpaPoint(score) {
    if (score >= 90) return 4.0;
    if (score >= 85) return 3.7;
    if (score >= 82) return 3.3;
    if (score >= 78) return 3.0;
    if (score >= 75) return 2.7;
    if (score >= 72) return 2.3;
    if (score >= 68) return 2.0;
    if (score >= 64) return 1.5;
    if (score >= 60) return 1.0;
    return 0;
  }

  function render() {
    // 学期下拉：与顶栏全站学期筛选同一个值；统一渲染（学生视角含届别学期序号与「本 ·」标记，'' = 全部学期）
    $('#ms-term', container).innerHTML =
      UI.termFilter.optionsHTML(state.term || '', { includeAll: true, allValue: '' });

    var all = Store.list('scores').filter(function (s) {
      return s.studentId === stu.id && Store.termMatch(s.term || Store.currentTerm(), state.term);
    });
    var examSet = [];
    all.forEach(function (s) { if (examSet.indexOf(s.examName) === -1) examSet.push(s.examName); });
    $('#ms-exam', container).innerHTML = Utils.simpleOptions(examSet.sort(), state.exam, '全部考试');

    var list = state.exam ? all.filter(function (s) { return s.examName === state.exam; }) : all;
    // 统计口径：排除「总评」——它由平时+期末合成，若与原始成绩并列统计会重复计入
    var statList = list.filter(function (s) { return s.examName.indexOf('总评') !== 0; });
    var basis = statList.length ? statList : list;
    var avg = basis.length ? Utils.round1(basis.reduce(function (a, s) { return a + s.score; }, 0) / basis.length) : '暂无';
    var max = basis.length ? Math.max.apply(null, basis.map(function (s) { return s.score; })) : '暂无';
    var min = basis.length ? Math.min.apply(null, basis.map(function (s) { return s.score; })) : '暂无';

    // 平均学分绩点：按科目求平均分 → 换算绩点 → 按学分加权
    // 优先使用成绩记录上的真实学分，未标注时按科目学分表兜底
    var subMap = {};
    basis.forEach(function (s) {
      if (!subMap[s.subject]) subMap[s.subject] = [];
      subMap[s.subject].push(s);
    });
    var creditSum = 0, pointSum = 0;
    Object.keys(subMap).forEach(function (sub) {
      var rows = subMap[sub];
      var subAvg = rows.reduce(function (a, s) { return a + s.score; }, 0) / rows.length;
      var credit = (rows[0].credit ? Number(rows[0].credit) : 0) || Store.creditOf(sub);
      creditSum += credit;
      pointSum += gpaPoint(subAvg) * credit;
    });
    var gpa = creditSum ? Math.round(pointSum / creditSum * 100) / 100 : '—';

    $('#ms-stats', container).innerHTML =
      UI.statCard('平均分', avg) +
      UI.statCard('学分绩点', gpa) +
      UI.statCard('最高分', max) +
      UI.statCard('最低分', min) +
      UI.statCard('成绩条数', list.length);

    // 不及格补考提示（同样按统计口径，避免把总评的"及格"当成原始成绩）
    var failCount = basis.filter(function (s) { return s.score < 60; }).length;
    var scopeWord = /^\d{4}-\d{4}$/.test(String(state.term)) ? '本学年' : '本学期';   // 全学年口径时用"本学年"
    $('#ms-warn', container).innerHTML = failCount
      ? '<p style="margin:-6px 0 14px;font-size:13px;color:var(--danger)">' +
        UI.badge('补考提示', 'danger') + ' ' + scopeWord + '有 ' + failCount + ' 门成绩不及格，请及时关注补考 / 重修安排。</p>'
      : '';

    // 学业预警（学生本人知情）：与辅导员端同一套预警规则，学生端展示原因、建议与联系方式
    var myAlert = Store.alertsFor(stu.classId, state.term || Store.currentTerm())
      .filter(function (a) { return a.studentId === stu.id; })[0];
    // 口径说明：所选范围（全部学期 / 学年合计）里若有学期暂无本人成绩，明确写出来——
    // 否则「全部学期」与「学年合计」会给出同一组数字，看起来像同一个选项（用户问过这个问题）
    (function () {
      var el = document.getElementById('ms-scope-note');
      if (!el) return;
      var scopeTerms = UI.termFilter.list().filter(function (t) { return Store.termMatch(t, state.term); });
      var mine = Store.list('scores').filter(function (x) { return x.studentId === stu.id; });
      var empty = scopeTerms.filter(function (t) {
        return !mine.some(function (x) { return (x.term || Store.currentTerm()) === t; });
      });
      if (scopeTerms.length > 1 && empty.length) {
        el.innerHTML = '<span class="info-ico">ⓘ</span><span>范围共 ' + scopeTerms.length + ' 个学期；' +
          empty.map(function (t) { return studentTermLabel(t); }).join('、') + ' 暂无你的成绩，未计入统计。</span>';
        el.style.display = 'flex';
      } else {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    })();

    $('#ms-alert', container).innerHTML = myAlert
      ? '<div class="card" style="margin:-2px 0 14px;border-left:4px solid var(--danger);background:var(--card-soft,rgba(100,116,139,.05))">' +
          '<div class="chart-title" style="font-size:15px">' + UI.badge('学业预警', 'danger') +
            '<span style="color:var(--muted);font-size:12px;margin-left:8px">依据：近 2 周出勤率 &lt; 70% / 近 5 次作业缺交 ≥ 3 / 总评不及格</span></div>' +
          '<div style="font-size:13px;line-height:1.9">' +
            '<b>预警原因：</b>' + myAlert.reasons.map(function (r) { return UI.badge(r, 'danger'); }).join(' ') + '<br>' +
            '<b>建议：</b>尽快联系任课教师与辅导员说明情况，补齐作业 / 复习补考科目，必要时申请学业帮扶；' +
            '本预警会同步给辅导员，用于安排谈话与帮扶。' +
          '</div>' +
          '<p style="color:var(--muted);font-size:12px;margin:8px 0 0">咨询：辅导员（综合楼一 108）· 学工处大学生资助中心 027-87934608</p>' +
        '</div>'
      : (failCount
          ? '<p style="margin:-6px 0 14px;font-size:12.5px;color:var(--muted)">' + UI.badge('本学期暂无学业预警', 'success') + ' 有不及格科目但未触发预警（预警看总评、出勤与作业缺交）。</p>'
          : '');

    list = list.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    $('#ms-table', container).innerHTML = list.length
      ? UI.tableWrap('<tr><th>考试名称</th><th>科目</th><th>性质</th><th>学分</th><th>分数</th><th>考试日期</th></tr>',
          list.map(function (s) {
            return '<tr><td>' + Utils.escapeHtml(s.examName) + '</td><td>' + Utils.escapeHtml(s.subject) + '</td>' +
              '<td>' + (s.nature ? Utils.escapeHtml(s.nature) : '—') + '</td>' +
              '<td>' + (s.credit ? Utils.escapeHtml(String(s.credit)) : '—') + '</td>' +
              '<td><b class="' + scoreCls(s.score) + '">' + s.score + '</b></td><td>' + Utils.escapeHtml(s.date) + '</td></tr>';
          }).join(''))
      : UI.empty('该学期暂无成绩记录');
  }

  $('#ms-term', container).addEventListener('change', function () {
    state.term = this.value;
    state.exam = '';
    Store.setPref('uiTerm', this.value);   // 与顶栏全站学期开关保持同一值
    UI.termFilter.syncTopbar();
    render();
  });
  $('#ms-exam', container).addEventListener('change', function () { state.exam = this.value; render(); });
  render();
};

/* ---------------- 我的考勤（含请假申请） ---------------- */
/* 顶栏「全站学期」的范围文案：空 → 全部学期；2025-2026 → 2025-2026学年；2025-2026-1 → 教务连写学期
 * 学年值由 Store.termText 统一处理（页内不再写「全学年」，与下拉里的「全部学期（跨学年）」区分开） */
function studentTermLabel(term) {
  var t = String(term || '');
  if (!t) return '全部学期';
  return Store.termText(t);
}
/* 记录是否落在当前「全站学期」范围内（唯一入口 Store.termMatch） */
function inTermScope(recTerm) { return Store.termMatch(recTerm, UI.termFilter.get()); }

/* 未读的新通知数：面向本班（或全校）、7 天内发布、且「通知查看」尚未登记已读 */
function newNoticeCount(user) {
  var since = Utils.daysAgo(7);
  return Store.list('notices').filter(function (n) {
    var forMe = n.classId === '' || n.classId === user.classId;
    return forMe && String(n.publishTime || '').slice(0, 10) >= since &&
      Store.noticeReaders(n.id).indexOf(user.username) === -1;
  }).length;
}

Pages['my-attendance'] = function (container, user) {
  var stu = getMyStudent(user);
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  var state = { status: '' };
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">我的考勤</div>' +
        '<div class="toolbar-actions">' +
          '<span class="chip chip-info" id="ma-scope"></span>' +
          '<select id="ma-status" class="input"><option value="">全部状态</option><option>出勤</option><option>迟到</option><option>请假</option><option>缺勤</option></select>' +
          '<button id="btn-ma-leave" class="btn btn-primary" type="button">＋ 申请请假</button>' +
        '</div>' +
      '</div>' +
      '<div id="ma-signin"></div>' +
      '<div id="ma-stats" class="stat-grid"></div>' +
      '<div id="ma-table"></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">我的请假记录</div></div>' +
      '<div id="ma-leaves"></div>' +
    '</div>';

  function weekOf(dateStr) {
    return '周' + '日一二三四五六'.charAt(new Date(dateStr + 'T00:00:00').getDay());
  }

  function render() {
    // 跟随顶栏「全站学期」：考勤记录按记录所属学期筛选（'' = 全部学期）
    var scope = UI.termFilter.get();
    var scopeEl = $('#ma-scope', container);
    if (scopeEl) scopeEl.textContent = '统计范围：' + studentTermLabel(scope);
    var all = Store.list('attendance').filter(function (a) { return a.studentId === stu.id; })
      .filter(function (a) { return Store.termMatch(a.term, scope); })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var list = state.status ? all.filter(function (a) { return a.status === state.status; }) : all;
    var total = all.length;
    function cnt(st) { return all.filter(function (a) { return a.status === st; }).length; }
    var rate = total ? Math.round(cnt('出勤') / total * 100) + '%' : '暂无';
    // 课堂签到横幅
    var sb = signinBarHTML(user);
    $('#ma-signin', container).innerHTML = sb;
    if (sb) bindSigninBar($('#ma-signin', container), user, render);
    $('#ma-stats', container).innerHTML =
      UI.statCard('出勤率', rate) +
      UI.statCard('出勤天数', cnt('出勤')) +
      UI.statCard('迟到次数', cnt('迟到')) +
      UI.statCard('请假/缺勤', cnt('请假') + cnt('缺勤'));

    $('#ma-table', container).innerHTML = list.length
      ? UI.tableWrap('<tr><th>日期</th><th>星期</th><th>状态</th></tr>',
          list.map(function (a) {
            return '<tr><td>' + Utils.escapeHtml(a.date) + '</td><td>' + weekOf(a.date) + '</td><td>' + UI.attendBadge(a.status) + '</td></tr>';
          }).join(''))
      : UI.empty(scope ? studentTermLabel(scope) + '暂无考勤记录（可切换顶部学期，或选最上方的「全部学期」项查看全部）' : '暂无考勤记录');

    renderLeaves();
  }

  /* ---- 我的请假记录 ---- */
  function renderLeaves() {
    var scope = UI.termFilter.get();
    var leaves = Store.list('leaves')
      .filter(function (lv) { return lv.studentId === stu.id; })
      .filter(function (lv) { return Store.termMatch(lv.term, scope); })
      .sort(function (a, b) { return String(b.submitTime || '').localeCompare(String(a.submitTime || '')); });
    $('#ma-leaves', container).innerHTML = leaves.length
      ? leaves.map(function (lv) {
          var line;
          if (lv.status === '待审批') line = UI.badge('待审批', 'warning');
          else if (lv.status === '已批准') line = UI.badge('已批准', 'success') +
            (lv.reviewer ? '<span style="color:var(--muted);font-size:12px">　审批人：' + Utils.escapeHtml(lv.reviewer) + '</span>' : '');
          else line = UI.badge('已驳回', 'danger') +
            (lv.reviewNote ? '<span style="color:var(--muted);font-size:12px">　理由：' + Utils.escapeHtml(lv.reviewNote) + '</span>' : '');
          return '<div class="att-row">' +
            '<span>' + Utils.escapeHtml(lv.startDate) + ' 至 ' + Utils.escapeHtml(lv.endDate) +
              '<small style="color:var(--muted)">　提交于 ' + Utils.escapeHtml(lv.submitTime || '') + '</small></span>' +
            '<span style="display:flex;align-items:center;gap:10px">' + line + '</span>' +
          '</div>';
        }).join('')
      : UI.empty(scope ? studentTermLabel(scope) + '暂无请假记录（可切换顶部学期查看）' : '暂无请假记录');
  }

  /* ---- 提交请假申请（教师批准后自动写入考勤） ---- */
  function applyLeave() {
    UI.modal({
      title: '申请请假',
      submitText: '提交申请',
      body:
        '<div class="form-grid">' +
          UI.formRow('开始日期', '<input id="f-start" type="date" class="input" value="' + Utils.today() + '">', true) +
          UI.formRow('结束日期', '<input id="f-end" type="date" class="input" value="' + Utils.today() + '">', true) +
        '</div>' +
        UI.formRow('请假事由', '<textarea id="f-reason" class="input" rows="4" placeholder="请填写请假事由（不少于 5 个字）"></textarea>', true),
      onSubmit(root, close) {
        var start = $('#f-start', root).value;
        var end = $('#f-end', root).value;
        var reason = $('#f-reason', root).value.trim();
        if (!start || !end) return Toast.warning('请选择请假日期');
        if (end < start) return Toast.error('结束日期不能早于开始日期');
        if (reason.length < 5) return Toast.warning('请假事由不少于 5 个字，请补充完整');
        // 同一学生同时只允许一条待审批申请，避免重复提交
        var pending = Store.list('leaves').some(function (lv) {
          return lv.studentId === stu.id && lv.status === '待审批';
        });
        if (pending) return Toast.warning('你已有一条待审批的请假申请，请等待审批结果');
        Store.add('leaves', {
          studentId: stu.id, classId: stu.classId,
          term: Store.termOfDate(start),
          startDate: start, endDate: end, reason: reason,
          status: '待审批', submitTime: Utils.nowStr()
        });
        Toast.success('请假申请已提交，请等待老师审批');
        close();
        render();
      }
    });
  }

  $('#ma-status', container).addEventListener('change', function () { state.status = this.value; render(); });
  $('#btn-ma-leave', container).addEventListener('click', applyLeave);
  render();
};

/* ---------------- 通知查看（学生） ---------------- */
Pages['my-notices'] = function (container, user) {
  var state = { page: 1, pageSize: 5 };
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">通知列表</div></div>' +
      '<div id="mn-list"></div>' +
      '<div id="mn-page"></div>' +
    '</div>';

  function render() {
    var ids = Auth.scopeClassIds(user);
    var list = Store.list('notices').filter(function (n) {
      return !n.classId || ids.indexOf(n.classId) !== -1;
    }).sort(function (a, b) {
      return String(b.publishTime || '').localeCompare(String(a.publishTime || ''));
    });
    var start = (state.page - 1) * state.pageSize;
    var pageList = list.slice(start, start + state.pageSize);
    $('#mn-list', container).innerHTML = pageList.length
      ? pageList.map(function (n) {
          // 已读回执：渲染即视为已读，未读通知标记后自动登记
          var unread = Store.noticeReaders(n.id).indexOf(user.username) === -1;
          if (unread) Store.markNoticeRead(n.id, user.username);
          return noticeCardHTML(n, unread ? UI.badge('未读', 'warning') : '');
        }).join('')
      : UI.empty('暂无通知');
    $('#mn-page', container).innerHTML = UI.paginationHTML({ total: list.length, page: state.page, pageSize: state.pageSize });
    UI.bindPagination($('#mn-page', container), function (p) { state.page = p; render(); });
  }
  render();
};

/* ---------------- 学生版仪表盘 ---------------- */
function renderStudentDashboard(container, user) {
  var stu = getMyStudent(user);
  var scopeIds = Auth.scopeClassIds(user);

  // 最近通知（全部班级 + 本班）
  var notices = Store.list('notices').filter(function (n) {
    return !n.classId || scopeIds.indexOf(n.classId) !== -1;
  }).sort(function (a, b) {
    return String(b.publishTime || '').localeCompare(String(a.publishTime || ''));
  }).slice(0, 5);
  var noticesHTML = notices.length
    ? notices.map(function (n) {
        // 已读回执：学生查看仪表盘同样登记已读
        Store.markNoticeRead(n.id, user.username);
        return noticeCardHTML(n, '');
      }).join('')
    : UI.empty('暂无通知');

  if (!stu) {
    container.innerHTML =
      '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员在「用户管理」中绑定') + '</div>' +
      '<div class="card"><div class="chart-title">最近通知</div>' + noticesHTML + '</div>';
    return;
  }

  var myScores = Store.list('scores').filter(function (s) { return s.studentId === stu.id; });
  var avg = myScores.length
    ? Utils.round1(myScores.reduce(function (a, s) { return a + s.score; }, 0) / myScores.length)
    : '暂无';
  var myAtt = Store.list('attendance').filter(function (a) { return a.studentId === stu.id; });
  var attRate = myAtt.length
    ? Math.round(myAtt.filter(function (a) { return a.status === '出勤'; }).length / myAtt.length * 100) + '%'
    : '暂无';

  // 班级平均分排名
  var classmates = Store.list('students').filter(function (s) { return s.classId === stu.classId; });
  var allScores = Store.list('scores');
  var avgs = classmates.map(function (c) {
    var list = allScores.filter(function (s) { return s.studentId === c.id; });
    return { id: c.id, avg: list.length ? list.reduce(function (a, s) { return a + s.score; }, 0) / list.length : -1 };
  }).sort(function (a, b) { return b.avg - a.avg; });
  var rank = 0;
  for (var i = 0; i < avgs.length; i++) {
    if (avgs[i].id === stu.id) { rank = i + 1; break; }
  }

  // 各科平均分
  var subMap = {};
  myScores.forEach(function (s) {
    if (!subMap[s.subject]) subMap[s.subject] = [];
    subMap[s.subject].push(s.score);
  });
  var subItems = Object.keys(subMap).map(function (sub) {
    return {
      label: sub,
      value: Utils.round1(subMap[sub].reduce(function (a, b) { return a + b; }, 0) / subMap[sub].length),
      suffix: '分'
    };
  });

  // 最近成绩（5 条）
  var recent = myScores.slice().sort(function (a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  }).slice(0, 5);
  var recentHTML = recent.length
    ? '<div class="table-wrap"><table class="table"><thead><tr><th>科目</th><th>考试</th><th>分数</th><th>日期</th></tr></thead><tbody>' +
      recent.map(function (s) {
        return '<tr><td>' + Utils.escapeHtml(s.subject) + '</td><td>' + Utils.escapeHtml(s.examName) + '</td>' +
          '<td><b class="' + scoreCls(s.score) + '">' + s.score + '</b></td><td>' + Utils.escapeHtml(s.date) + '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : UI.empty('暂无成绩');

  /* ---- 我的待办：待提交作业 / 待作答测验 / 审批中请假 / 班级获奖 ---- */
  var nowStr = Utils.nowStr();
  var mySubs = Store.list('submissions').filter(function (s) { return s.studentId === stu.id; });
  var myAttempts = Store.list('quizAttempts').filter(function (x) { return x.studentId === stu.id; });
  var todoAsg = Store.list('assignments').filter(function (a) {
    return a.classId === stu.classId && a.deadline >= nowStr &&
      !mySubs.some(function (s) { return s.assignmentId === a.id; });
  }).length;
  var todoQuiz = Store.list('quizzes').filter(function (q) {
    return q.classId === stu.classId && q.deadline >= nowStr &&
      !myAttempts.some(function (x) { return x.quizId === q.id; });
  }).length;
  var pendingLeave = Store.list('leaves').filter(function (l) {
    return l.studentId === stu.id && l.status === '待审批';
  }).length;
  var classCmp = Store.list('competitions').filter(function (c) {
    return c.studentIds.some(function (id) {
      var mate = Store.getStudent(id);
      return mate && mate.classId === stu.classId;
    });
  }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  var myAwards = classCmp.filter(function (c) { return c.studentIds.indexOf(stu.id) !== -1; });
  // 有本人获奖展示本人，否则展示班级最近获奖（以赛促学）
  var cmpList = myAwards.length ? myAwards : classCmp.slice(0, 3);

  var signinHtml = signinBarHTML(user); // 课堂签到横幅（有进行中的签到才显示）
  // 学业预警提示（学生本人）：与辅导员端同一套规则，学生第一时间知情
  var myAlertDash = Store.alertsFor(stu.classId, Store.currentTerm())
    .filter(function (a) { return a.studentId === stu.id; })[0];
  var alertHtml = myAlertDash
    ? '<div class="card" style="border-left:4px solid var(--danger)">' +
        '<div class="chart-title" style="font-size:15px">' + UI.badge('学业预警', 'danger') +
          '<span style="color:var(--muted);font-size:12px;margin-left:8px">辅导员已收到同一提示，将与你联系</span></div>' +
        '<div style="font-size:13px;line-height:1.9">' + myAlertDash.reasons.map(function (r) { return UI.badge(r, 'danger'); }).join(' ') +
          '　<a href="#/my-scores">查看我的成绩与建议 ›</a></div>' +
      '</div>'
    : '';
  container.innerHTML =
    signinHtml +
    UI.heroCard({
      name: stu.name,
      sub: Utils.escapeHtml(Store.className(stu.classId)) + ' · 学号 ' + Utils.escapeHtml(stu.studentNo),
      chips: [
        { label: '我的平均分', value: avg },
        { label: '我的出勤率', value: attRate },
        { label: '班级排名', value: rank ? '第 ' + rank + ' 名' : '暂无' }
      ]
    }) +
    alertHtml +
    todoStripHTML([
      { count: newNoticeCount(user), label: '新通知（7 天内）', href: '#/my-notices' },
      { count: Store.hasHealthReportToday(stu.id) ? 0 : 1, label: '今日健康填报', href: '#/my-health' },
      { count: todoAsg, label: '待提交作业', href: '#/my-assignments' },
      { count: todoQuiz, label: '待作答测验', href: '#/my-quizzes' },
      { count: pendingLeave, label: '审批中请假', href: '#/my-attendance' }
    ]) +
    todayCoursesHTML(user) +
    '<div id="dash-weather" class="weather-slot"></div>' +
    '<div class="stat-grid">' +
      UI.statCard('我的平均分', avg) +
      UI.statCard('我的出勤率', attRate) +
      UI.statCard('班级排名', rank ? '第 ' + rank + ' 名' : '暂无') +
      UI.statCard('成绩条数', myScores.length) +
    '</div>' +
    '<div class="grid-cards">' +
      '<div class="card"><div class="chart-title">各科平均分</div>' + (subItems.length ? UI.barChart(subItems) : UI.empty('暂无成绩')) + '</div>' +
      '<div class="card"><div class="chart-title">最近成绩 <a class="link-more" href="#/my-scores">查看全部 ›</a></div>' + recentHTML + '</div>' +
    '</div>' +
    competitionCardHTML(
      cmpList,
      null,
      myAwards.length ? '' : '暂无获奖记录，期待你的第一次获奖（下方为班级最近获奖）'
    ) +
    '<div class="card"><div class="chart-title">最近通知 <a class="link-more" href="#/my-notices">查看全部 ›</a></div>' + noticesHTML + '</div>' +
    campusCardHTML();
  if (signinHtml) bindSigninBar(container, user, function () { renderStudentDashboard(container, user); });
  bindCampusRotator(container);
  if (typeof Weather !== 'undefined') Weather.render($('#dash-weather', container));
}
