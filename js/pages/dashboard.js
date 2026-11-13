/* =====================================================
 * 仪表盘（管理员 / 教师 / 学生共用入口）
 * - 管理员/教师：统计卡片 + 成绩分布 / 近7天出勤率 / 班级人数 + 最近通知
 * - 学生：个人统计 + 各科平均分 + 最近成绩 + 最近通知
 * ===================================================== */

/** 晴川掠影卡片 HTML（教师端与学生端仪表盘共用） */
function campusCardHTML() {
  return '<div class="card"><div class="chart-title">晴川掠影</div>' +
    '<div class="campus-card"><img id="campus-img" src="images/campus-1.jpg" alt="武汉晴川学院校园">' +
    '<div class="campus-caption"><b>武汉晴川学院</b><span>校园掠影 · 每 6 秒轮换 · 图片来源学校官网</span></div></div></div>';
}

/** 晴川掠影轮换器（离开页面后自动停止计时器） */
function bindCampusRotator(container) {
  var imgs = ['images/campus-1.jpg', 'images/campus-2.jpg'];
  var i = 0;
  var timer = setInterval(function () {
    if (!container.isConnected) { clearInterval(timer); return; }
    i = (i + 1) % imgs.length;
    var img = $('#campus-img', container);
    if (!img) { clearInterval(timer); return; }
    img.style.opacity = '0';
    setTimeout(function () {
      img.src = imgs[i];
      img.style.opacity = '1';
    }, 350);
  }, 6000);
}

/** 待办直达条 HTML：items = [{count, label, href}]，0 时置灰 */
/* 今日课程（超级课程表式）：今天有什么课 / 正在上 / 下一节。
 * 数据源：学生 → 优先「我的课表」（个人导入），否则班级课表（本学期）；教师 → 任教班级的课表（本学期）。 */
function todayCoursesHTML(user) {
  var now = new Date();
  var day = now.getDay() === 0 ? 7 : now.getDay();            // 0=周日 → 7（部分专业周日也有课）
  var times = (typeof TT_PERIOD_TIMES !== 'undefined') ? TT_PERIOD_TIMES : null;
  var cur = ('0' + now.getHours()).slice(-2) + ('0' + now.getMinutes()).slice(-2);

  function normalize(list) {                                  // 合并连堂：同课程+教师+教室的相邻节次
    var out = [];
    list.sort(function (a, b) { return a.period - b.period; }).forEach(function (sl) {
      var last = out[out.length - 1];
      if (last && last.course === sl.course && last.teacher === sl.teacher && last.room === sl.room && sl.period === last.to + 1) {
        last.to = sl.period;
      } else {
        out.push({ from: sl.period, to: sl.period, course: sl.course, teacher: sl.teacher || '', room: sl.room || '', className: sl.className || '' });
      }
    });
    return out;
  }

  var slots, label;
  if (user.role === 'student') {
    var mine = Store.getPref('myTimetable', '');
    try { mine = mine ? JSON.parse(mine) : []; } catch (e) { mine = []; }
    if (mine.length) {
      slots = mine.filter(function (x) { return Number(x.day) === day; });
      label = '我的课表';
    } else {
      var term = Store.currentTerm();
      slots = Store.list('timetable').filter(function (t) {
        return t.classId === user.classId && Number(t.day) === day && (t.term || term) === term;
      });
      label = '班级课表';
    }
  } else {
    var ids = (user.teacherClassIds && user.teacherClassIds.length) ? user.teacherClassIds :
      (user.classId ? [user.classId] : []);
    var tTerm = Store.currentTerm();
    slots = [];
    Store.list('timetable').forEach(function (t) {
      if (ids.indexOf(t.classId) !== -1 && Number(t.day) === day && (t.term || tTerm) === tTerm) {
        slots.push(Object.assign({}, t, { className: Store.className(t.classId) }));
      }
    });
    label = '今日教学安排';
  }
  var blocks = normalize(slots);
  if (!blocks.length) {
    // 今天没课：如果该学期本来就有课表数据，明确写一句"今日无课"，避免用户以为没加载出来；
    // 完全没有课表数据时保持隐藏（避免给没导入课表的班级一个空卡）
    var hasAny = false;
    if (user.role === 'student') {
      var term2 = Store.currentTerm();
      hasAny = Store.list('timetable').some(function (t) {
        return t.classId === user.classId && (t.term || term2) === term2;
      });
    } else {
      var ids2 = (user.teacherClassIds && user.teacherClassIds.length) ? user.teacherClassIds : (user.classId ? [user.classId] : []);
      var tTerm2 = Store.currentTerm();
      hasAny = Store.list('timetable').some(function (t) {
        return ids2.indexOf(t.classId) !== -1 && (t.term || tTerm2) === tTerm2;
      });
    }
    if (!hasAny) return '';
    return '<div class="card"><div class="chart-title">今日课程 <span style="color:var(--muted);font-size:12px;font-weight:400">' +
      Utils.escapeHtml(label) + ' · 周' + '一二三四五六日'[day - 1] + '</span></div>' +
      '<p style="color:var(--muted);font-size:13px;margin:4px 0 0">今日无课安排。</p></div>';
  }

  var rowsHtml = '';
  var nextMarked = false;
  var rows = blocks.map(function (bk) {
    var st = '';
    if (times && times[bk.from] && times[bk.to]) {
      var s0 = times[bk.from][0], e0 = times[bk.to][1];
      if (cur >= s0 && cur <= e0) st = UI.badge('进行中', 'danger');
      else if (cur < s0 && !nextMarked) { st = UI.badge('下一节', 'info'); nextMarked = true; }
    }
    var seg = bk.from <= 4 ? '上午' : (bk.from <= 8 ? '下午' : '晚上');
    rowsHtml += '<div class="att-row"><span>' + seg + ' 第 ' + bk.from + (bk.to > bk.from ? '—' + bk.to : '') + ' 节　<b>' +
      Utils.escapeHtml(bk.course) + '</b>' + (bk.className ? '<small style="color:var(--muted)">　' + Utils.escapeHtml(bk.className) + '</small>' : '') +
      '<small style="color:var(--muted)">' + (bk.teacher ? '　' + Utils.escapeHtml(bk.teacher) : '') + (bk.room ? ' · ' + Utils.escapeHtml(bk.room) : '') + '</small></span>' +
      '<span style="display:flex;gap:8px;align-items:center">' + st + '</span></div>';
    return bk;
  });
  return '<div class="card"><div class="chart-title">今日课程 <span style="color:var(--muted);font-size:12px;font-weight:400">' +
    Utils.escapeHtml(label) + ' · 共 ' + blocks.length + ' 节（次） · 周' + '一二三四五六日'[day - 1] + '</span></div>' + rowsHtml + '</div>';
}

function todoStripHTML(items) {
  return '<div class="todo-grid">' + items.map(function (t) {
    return '<a class="todo-card' + (t.count === 0 ? ' zero' : '') + '" href="' + t.href + '">' +
      '<b>' + t.count + '</b><span>' + t.label + '</span><i>›</i></a>';
  }).join('') + '</div>';
}

/** 竞赛荣誉卡片 HTML（列表为空时显示鼓励语） */
function competitionCardHTML(list, linkHref, emptyText) {
  var body = list.length
    ? list.map(function (c) {
        var stuNames = c.studentIds.map(function (id) {
          var stu = Store.getStudent(id);
          return stu ? stu.name : '';
        }).filter(Boolean).join('、');
        var levelMap = { '国家级': 'danger', '省级': 'warning', '市级': 'info', '校级': 'muted' };
        return '<div class="notice-card"><div class="notice-head"><span>' + Utils.escapeHtml(c.name) + '</span>' +
          '<span>' + UI.badge(c.level, levelMap[c.level] || 'muted') + UI.badge(c.award, 'success') + '</span></div>' +
          '<div class="notice-meta"><span>' + Utils.escapeHtml(stuNames) + '</span>' +
          '<span>' + Utils.escapeHtml(c.date) + '</span>' +
          (c.teacher ? '<span>指导教师 ' + Utils.escapeHtml(c.teacher) + '</span>' : '') + '</div></div>';
      }).join('')
    : UI.empty(emptyText || '暂无获奖记录');
  return '<div class="card"><div class="chart-title">学科竞赛 · 以赛促学' +
    (linkHref ? ' <a class="link-more" href="' + linkHref + '">查看全部 ›</a>' : '') +
    '</div>' + body + '</div>';
}

Pages.dashboard = function (container, user) {
  // 学生登录时走学生版仪表盘（函数在 student-view.js 中定义）
  if (Auth.isStudent(user)) {
    renderStudentDashboard(container, user);
    return;
  }
  // 辅导员登录时走学工工作台（学生工作线：安全/健康/请假/奖助/帮扶，不出现教学工具）
  if (!Auth.isAdmin(user) && Auth.isCounselor(user)) {
    renderCounselorDashboard(container, user);
    return;
  }

  var isAdmin = Auth.isAdmin(user);
  var scopeIds = Auth.scopeClassIds(user);
  var inScope = function (id) { return scopeIds.indexOf(id) !== -1; };

  var classes = Store.list('classes').filter(function (c) { return inScope(c.id); });
  var students = Store.list('students').filter(function (s) { return inScope(s.classId); });
  // 成绩统计跟随顶栏「全站学期」开关（未指定时用当前自然学期），避免跨学期数据混算
  var curTerm = UI.termFilter.get() || Store.currentTerm();
  var scores = Store.list('scores').filter(function (s) {
    return inScope(s.classId) && (s.term || curTerm) === curTerm;
  });
  var attendance = Store.list('attendance').filter(function (a) { return inScope(a.classId); });

  /* ---- 统计卡片 ---- */
  var today = Utils.today();
  var todayRecs = attendance.filter(function (a) { return a.date === today; });
  var todayRate = todayRecs.length
    ? Math.round(todayRecs.filter(function (a) { return a.status === '出勤'; }).length / todayRecs.length * 100) + '%'
    : '暂无';
  var avgScore = scores.length
    ? Utils.round1(scores.reduce(function (a, s) { return a + s.score; }, 0) / scores.length)
    : '暂无';
  var passRate = scores.length
    ? Math.round(scores.filter(function (s) { return s.score >= 60; }).length / scores.length * 100) + '%'
    : '暂无';

  // 教师/管理员的数据范围文案（支持多班级：超过 2 个折叠显示）
  // 教师说"任教"、辅导员说"负责/管理"——同一系统里的两种真实身份，不该混用
  var scopeNames = classes.map(function (c) { return c.name; });
  var mySubjects = (user.teachSubjects || []);
  var classPart = scopeNames.length > 2
    ? '「' + Utils.escapeHtml(scopeNames.slice(0, 2).join('、')) + '」等 ' + scopeNames.length + ' 个班级'
    : '「' + Utils.escapeHtml(scopeNames.join('、') || '未绑定班级') + '」';
  var subText = isAdmin
    ? '欢迎使用班级管理系统，以下是全校数据概览。'
    : (Auth.isCounselor(user)
        ? '您负责' + classPart + '的学生工作，以下是学工概览。'
        : '您任教' + classPart +
          (mySubjects.length ? '，任教科目：' + Utils.escapeHtml(mySubjects.join('、')) : '') +
          '，以下是教学概览。');

  /* ---- 图表数据 ---- */
  // 成绩分布（分数段人数）
  var ranges = [
    { label: '不及格 0-59', min: 0, max: 59 },
    { label: '及格 60-69', min: 60, max: 69 },
    { label: '中等 70-79', min: 70, max: 79 },
    { label: '良好 80-89', min: 80, max: 89 },
    { label: '优秀 90-100', min: 90, max: 100 }
  ];
  var distChart = scores.length
    ? UI.barChart(ranges.map(function (r) {
        return { label: r.label, value: scores.filter(function (s) { return s.score >= r.min && s.score <= r.max; }).length, suffix: '人' };
      }))
    : UI.empty('暂无成绩数据');

  // 近 7 天出勤率
  var trendItems = [];
  for (var d = 6; d >= 0; d--) {
    var ds = Utils.daysAgo(d);
    var recs = attendance.filter(function (a) { return a.date === ds; });
    trendItems.push({
      label: ds.slice(5),
      value: recs.length ? Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100) : 0,
      suffix: '%'
    });
  }
  var trendChart = UI.barChart(trendItems);

  // 各班级人数（仅管理员展示）
  var classChart = UI.barChart(classes.map(function (c) {
    return { label: c.name, value: students.filter(function (s) { return s.classId === c.id; }).length, suffix: '人' };
  }));

  /* ---- 教学待办：课堂模块待处理数量（点击直达对应页面） ---- */
  var now = new Date();
  var asgInScope = {};
  Store.list('assignments').forEach(function (a) {
    if (inScope(a.classId)) asgInScope[a.id] = true;
  });
  var pendingGrade = Store.list('submissions').filter(function (s) {
    return asgInScope[s.assignmentId] && s.status === '已提交';
  }).length;
  var pendingLeave = Store.list('leaves').filter(function (l) {
    return inScope(l.classId) && l.status === '待审批';
  }).length;
  var nowStr = Utils.nowStr();
  var activeQuizzes = Store.list('quizzes').filter(function (q) {
    return inScope(q.classId) && q.deadline >= nowStr;
  }).length;
  var cmpCount = Store.list('competitions').filter(function (c) {
    return c.studentIds.some(function (id) {
      var stu = Store.getStudent(id);
      return stu && inScope(stu.classId);
    });
  }).length;

  /* 学业预警（本学期任教班级聚合） */
  var uniqAlerts = {};
  scopeIds.forEach(function (id) {
    Store.alertsFor(id, curTerm).forEach(function (a) { uniqAlerts[a.studentId] = a; });
  });
  var alertCount = Object.keys(uniqAlerts).length;

  /* 健康日报：任教班级今日未填报人数 + 异常人数 */
  var healthPending = 0, healthAbnormal = 0;
  scopeIds.forEach(function (id) {
    var sum = Store.healthSummary(id, Utils.today());
    healthPending += sum.total - sum.done;
    healthAbnormal += sum.abnormal.length;
  });

  /* ---- 页面结构 ---- */
  container.innerHTML =
    UI.heroCard({
      name: user.name || user.username,
      sub: subText,
      chips: (isAdmin || Auth.isCounselor(user))
        ? [
            { label: '今日出勤', value: todayRate },
            { label: '平均分', value: avgScore },
            { label: '及格率', value: passRate }
          ]
        : [   // 任课教师关心的是"我的课"：课程数、待批作业、任教班级
            { label: '我的课程', value: mySubjects.length ? mySubjects.length + ' 门' : '未设置' },
            { label: '待批作业', value: pendingGrade },
            { label: '任教班级', value: classes.length + ' 个' }
          ]
    }) +
    // 待办按线区分：辅导员看学工待办（健康日报、请假审批），任课教师看教学待办（作业、测验）
    todoStripHTML((isAdmin || Auth.isCounselor(user)
      ? [{ count: healthPending, label: '未报健康日报', href: '#/health-report' },
         { count: pendingLeave, label: '待审批请假', href: '#/leave-approve' }]
      : []).concat([
      { count: pendingGrade, label: '待批改作业', href: '#/assignments' },
      { count: activeQuizzes, label: '进行中测验', href: '#/quizzes' },
      { count: cmpCount, label: '竞赛获奖记录', href: '#/competitions' },
      { count: alertCount, label: '学业预警学生', href: '#/alerts' }
    ])) +
    todayCoursesHTML(user) +
    '<div id="dash-weather" class="weather-slot"></div>' +
    // 「我的课程」：按"科目 × 班级"汇总教学情况（仅任课教师，管理员可见全量）
    myCourseCardHTML(user) +
    '<div class="stat-grid">' +
      UI.statCard('学生总数', students.length) +
      UI.statCard(isAdmin ? '班级数' : '任教班级', classes.length) +
      UI.statCard('今日出勤率', todayRate) +
      UI.statCard('平均分', avgScore) +
      UI.statCard('及格率', passRate) +
    '</div>' +
    '<div class="grid-cards">' +
      '<div class="card"><div class="chart-title">成绩分布</div>' + distChart + '</div>' +
      '<div class="card"><div class="chart-title">近7天出勤率</div>' + trendChart + '</div>' +
      (isAdmin ? '<div class="card"><div class="chart-title">各班级人数</div>' + classChart + '</div>' : '') +
    '</div>' +
    (alertCount
      ? '<div class="card"><div class="chart-title">学业预警 <a class="link-more" href="#/alerts">查看全部 ›</a></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>学生</th><th>预警原因</th></tr></thead><tbody>' +
        Object.keys(uniqAlerts).slice(0, 8).map(function (id) {
          var a = uniqAlerts[id];
          return '<tr><td><b>' + Utils.escapeHtml(a.name) + '</b><small style="color:var(--muted)"> ' + Utils.escapeHtml(a.className) + '</small></td><td>' +
            a.reasons.map(function (r) { return UI.badge(r, 'danger'); }).join(' ') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '') +
    competitionCardHTML(
      Store.list('competitions').filter(function (c) {
        return c.studentIds.some(function (id) {
          var stu = Store.getStudent(id);
          return stu && inScope(stu.classId);
        });
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 3),
      '#/competitions',
      '暂无获奖记录，鼓励学生积极参加学科竞赛'
    ) +
    '<div class="card"><div class="chart-title">最近通知 <a class="link-more" href="#/notices">查看全部 ›</a></div>' +
      '<div id="dash-notices"></div></div>' +
    campusCardHTML();

  // 最近 5 条通知（全部班级 + 可见班级）
  var notices = Store.list('notices')
    .filter(function (n) { return !n.classId || inScope(n.classId); })
    .sort(function (a, b) { return String(b.publishTime || '').localeCompare(String(a.publishTime || '')); })
    .slice(0, 5);
  $('#dash-notices', container).innerHTML = notices.length
    ? notices.map(function (n) { return noticeCardHTML(n, ''); }).join('')
    : UI.empty('暂无通知');

  bindCampusRotator(container);
  if (typeof Weather !== 'undefined') Weather.render($('#dash-weather', container));
};

/* =====================================================
 * 「我的课程」卡片（任课教师视角）
 * 教师真正关心的是"我教的课教得怎么样"，而不是笼统的班级统计：
 * 按「科目 × 班级」汇总该科目的平均分、及格率、进行中测验，并给出一键入口。
 * 任教科目在用户管理中维护（teachSubjects），未设置时给出提示。
 * ===================================================== */
function myCourseCardHTML(user) {
  if (!Auth.isTeacher(user) || Auth.isCounselor(user)) return '';
  var subjects = user.teachSubjects || [];
  var scopeIds = Auth.scopeClassIds(user);
  var classes = Store.list('classes').filter(function (c) { return scopeIds.indexOf(c.id) !== -1; });
  var curTerm = (typeof UI !== 'undefined' && UI.termFilter) ? (UI.termFilter.get() || Store.currentTerm()) : Store.currentTerm();
  if (!subjects.length) {
    return '<div class="card"><div class="chart-title">我的课程</div>' +
      '<p style="color:var(--muted);font-size:13px;margin:4px 0 0">尚未设置任教科目：请管理员在「用户管理 → 编辑」中填写（如“数据结构、Java程序设计”），' +
      '系统即可按科目为你汇总成绩、测验与作业情况。</p></div>';
  }
  var rows = '';
  subjects.forEach(function (subj) {
    classes.forEach(function (cls) {
      var scores = Store.list('scores').filter(function (s) {
        return s.classId === cls.id && s.subject === subj && Store.termMatch(s.term, curTerm);
      });
      var avg = scores.length ? Utils.round1(scores.reduce(function (a, s) { return a + Number(s.score || 0); }, 0) / scores.length) : null;
      var pass = scores.length ? Math.round(scores.filter(function (s) { return Number(s.score) >= 60; }).length / scores.length * 100) : null;
      var quizzes = Store.list('quizzes').filter(function (q) { return q.classId === cls.id && q.subject === subj && q.deadline >= Utils.nowStr(); });
      if (!scores.length && !quizzes.length) return;   // 该科目在本班无数据则不占行
      rows += '<tr>' +
        '<td><b>' + Utils.escapeHtml(subj) + '</b></td>' +
        '<td>' + Utils.escapeHtml(cls.name) + '</td>' +
        '<td>' + (avg === null ? '<span style="color:var(--muted)">暂无成绩</span>' : '<b>' + avg + '</b>') + '</td>' +
        '<td>' + (pass === null ? '—' : pass + '%') + '</td>' +
        '<td>' + (quizzes.length ? UI.badge(quizzes.length + ' 个进行中', 'info') : '<span style="color:var(--muted)">—</span>') + '</td>' +
        '<td class="td-ops">' +
          '<a class="btn btn-sm btn-ghost" href="#/scores">成绩</a>' +
          '<a class="btn btn-sm btn-ghost" href="#/quizzes">测验</a>' +
          '<a class="btn btn-sm btn-ghost" href="#/analysis">分析</a>' +
        '</td></tr>';
    });
  });
  return '<div class="card">' +
    '<div class="chart-title">我的课程 <span style="color:var(--muted);font-size:12px;font-weight:400">' +
      Utils.escapeHtml(subjects.join('、')) + ' · ' + Utils.escapeHtml(Store.termText(curTerm)) + '</span></div>' +
    (rows
      ? '<div class="table-wrap"><table class="table" style="min-width:560px"><thead><tr>' +
        '<th>科目</th><th>班级</th><th>平均分</th><th>及格率</th><th>我的测验</th><th class="th-ops">快捷入口</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      : UI.empty('本学期你的任教科目还没有成绩或测验数据，录入成绩后这里会自动汇总')) +
    '</div>';
}

/* =====================================================
 * 辅导员学工工作台（学生工作线）
 * 与教师仪表盘的差异：不做教学待办（作业/测验/成绩分布），
 * 聚焦学生工作：健康日报与安全（校外动向）、请假审批、奖助评审、
 * 重点关注学生（出勤异常 + 学业预警）、班级学情概览
 * ===================================================== */
function renderCounselorDashboard(container, user) {
  var scopeIds = Auth.scopeClassIds(user);
  var inScope = function (id) { return scopeIds.indexOf(id) !== -1; };
  var classes = Store.list('classes').filter(function (c) { return inScope(c.id); });
  var students = Store.list('students').filter(function (s) { return inScope(s.classId); });
  var stuById = {};
  students.forEach(function (s) { stuById[s.id] = s; });
  var classNameOf = function (classId) {
    var c = classes.filter(function (x) { return x.id === classId; })[0];
    return c ? c.name : '';
  };
  var today = Utils.today();
  var curTerm = UI.termFilter.get() || Store.currentTerm();
  var attendance = Store.list('attendance').filter(function (a) { return inScope(a.classId); });

  /* ---- 今日出勤 / 近 7 天出勤率 ---- */
  var todayRecs = attendance.filter(function (a) { return a.date === today; });
  var todayRate = todayRecs.length
    ? Math.round(todayRecs.filter(function (a) { return a.status === '出勤'; }).length / todayRecs.length * 100) + '%'
    : '暂无';
  var trendItems = [];
  for (var d = 6; d >= 0; d--) {
    var ds = Utils.daysAgo(d);
    var recs = attendance.filter(function (a) { return a.date === ds; });
    trendItems.push({
      label: ds.slice(5),
      value: recs.length ? Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100) : 0,
      suffix: '%'
    });
  }

  /* ---- 健康日报（今日）：填报率 / 异常 / 校外动向 ---- */
  var healthTotal = 0, healthDone = 0, abnormal = [];
  scopeIds.forEach(function (cid) {
    var sum = Store.healthSummary(cid, today);
    healthTotal += sum.total;
    healthDone += sum.done;
    abnormal = abnormal.concat(sum.abnormal);
  });
  var healthPending = healthTotal - healthDone;
  var healthRate = healthTotal ? Math.round(healthDone / healthTotal * 100) + '%' : '暂无';

  // 校外动向：取每位学生最新一次打卡位置，非校内即列出（假期出行/安全排查）
  var latest = {};
  Store.list('healthReports').filter(function (r) { return inScope(r.classId); }).forEach(function (r) {
    if (!latest[r.studentId] || String(r.date) > String(latest[r.studentId].date)) latest[r.studentId] = r;
  });
  var outside = [];
  Object.keys(latest).forEach(function (sid) {
    var r = latest[sid];
    var loc = r.location || '';
    if (loc && !/校内|晴川/.test(loc)) {
      var stu = stuById[sid];
      if (stu) outside.push({ name: stu.name, className: classNameOf(stu.classId), loc: loc, date: r.date, today: r.date === today });
    }
  });
  outside.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

  /* ---- 学生工作待办 ---- */
  var pendingLeaves = Store.list('leaves').filter(function (l) {
    return inScope(l.classId) && l.status === '待审批';
  });
  var schReview = Store.list('scholarships').filter(function (s) {
    return inScope(s.classId) && s.status !== '已发放';
  });
  var uniqAlerts = {};
  scopeIds.forEach(function (id) {
    Store.alertsFor(id, curTerm).forEach(function (a) { uniqAlerts[a.studentId] = a; });
  });
  var alertCount = Object.keys(uniqAlerts).length;

  /* ---- 重点关注学生：出勤率 <85% / 缺勤 ≥3 次 / 学业预警 ---- */
  var focus = [];
  students.forEach(function (stu) {
    var recs = attendance.filter(function (a) { return a.studentId === stu.id; });
    var reasons = [];
    if (recs.length) {
      var rate = Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100);
      var absent = recs.filter(function (a) { return a.status === '缺勤'; }).length;
      if (rate < 85) reasons.push('出勤率 ' + rate + '%');
      if (absent >= 3) reasons.push('缺勤 ' + absent + ' 次');
    }
    if (uniqAlerts[stu.id]) reasons.push('学业预警');
    if (reasons.length) focus.push({ name: stu.name, className: classNameOf(stu.classId), reasons: reasons });
  });
  focus.sort(function (a, b) { return b.reasons.length - a.reasons.length; });

  /* ---- 页面结构 ---- */
  var scopeNames = classes.map(function (c) { return c.name; });
  // 届别信息（按官方口径：本科四年、专科三年、专升本两年；届 = 入学年 + 学制）
  var cohortLine = '';
  if (classes.length === 1) {
    cohortLine = '（' + Store.cohortText(classes[0]) + '）';
  } else if (classes.length > 1) {
    var gys = [];
    classes.forEach(function (c) {
      var g = Store.gradYearText(c);
      if (gys.indexOf(g) === -1) gys.push(g);
    });
    cohortLine = '（届别：' + gys.join('、') + '）';
  }
  container.innerHTML =
    UI.heroCard({
      name: user.name || user.username,
      sub: '您当前负责' + (scopeNames.length > 2
        ? '「' + Utils.escapeHtml(scopeNames.slice(0, 2).join('、')) + '」等 ' + scopeNames.length + ' 个班级'
        : '「' + Utils.escapeHtml(scopeNames.join('、') || '未绑定班级') + '」') + Utils.escapeHtml(cohortLine) + '的学生工作，以下是学工工作台概览。',
      chips: [
        { label: '今日出勤', value: todayRate },
        { label: '日报填报', value: healthRate },
        { label: '校外动向', value: outside.length + ' 人' }
      ]
    }) +
    todoStripHTML([
      { count: pendingLeaves.length, label: '待审批请假', href: '#/leave-approve' },
      { count: healthPending, label: '未报健康日报', href: '#/health-report' },
      { count: abnormal.length, label: '体温异常', href: '#/health-report' },
      { count: schReview.length, label: '奖助评审待办', href: '#/scholarships' },
      { count: alertCount, label: '学业预警学生', href: '#/alerts' }
    ]) +
    todayCoursesHTML(user) +
    '<div id="dash-weather" class="weather-slot"></div>' +
    '<div class="stat-grid">' +
      UI.statCard('学生总数', students.length) +
      UI.statCard('负责班级', classes.length) +
      UI.statCard('今日出勤率', todayRate) +
      UI.statCard('健康填报率', healthRate) +
      UI.statCard('重点关注学生', focus.length) +
    '</div>' +
    '<div class="grid-cards">' +
      '<div class="card"><div class="chart-title">近7天出勤率</div>' + UI.barChart(trendItems) + '</div>' +
      '<div class="card"><div class="chart-title">校外动向 <a class="link-more" href="#/health-report">查看全部 ›</a></div>' +
        (outside.length
          ? '<div class="table-wrap"><table class="table"><thead><tr><th>学生</th><th>最新打卡位置</th><th>日期</th></tr></thead><tbody>' +
            outside.slice(0, 5).map(function (o) {
              return '<tr><td><b>' + Utils.escapeHtml(o.name) + '</b><small style="color:var(--muted)"> ' + Utils.escapeHtml(o.className) + '</small></td>' +
                '<td class="td-address" title="' + Utils.escapeHtml(o.loc) + '">' + Utils.escapeHtml(o.loc) + '</td>' +
                '<td>' + Utils.escapeHtml(o.date) + (o.today ? ' ' + UI.badge('今日', 'success') : '') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : UI.empty('暂无校外打卡记录（假期出行时重点关注）')) +
      '</div>' +
    '</div>' +
    '<div class="card"><div class="chart-title">重点关注学生（出勤异常 / 学业预警）</div>' +
      (focus.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>学生</th><th>班级</th><th>关注原因</th></tr></thead><tbody>' +
          focus.slice(0, 10).map(function (f) {
            return '<tr><td><b>' + Utils.escapeHtml(f.name) + '</b></td><td><small>' + Utils.escapeHtml(f.className) + '</small></td><td>' +
              f.reasons.map(function (r) { return UI.badge(r, 'danger'); }).join(' ') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : UI.empty('暂无需要重点关注的学生')) +
    '</div>' +
    (alertCount
      ? '<div class="card"><div class="chart-title">学业预警 <a class="link-more" href="#/alerts">查看全部 ›</a></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>学生</th><th>预警原因</th></tr></thead><tbody>' +
        Object.keys(uniqAlerts).slice(0, 8).map(function (id) {
          var a = uniqAlerts[id];
          return '<tr><td><b>' + Utils.escapeHtml(a.name) + '</b><small style="color:var(--muted)"> ' + Utils.escapeHtml(a.className) + '</small></td><td>' +
            a.reasons.map(function (r) { return UI.badge(r, 'danger'); }).join(' ') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '') +
    (schReview.length
      ? '<div class="card"><div class="chart-title">奖助评审进行中 <a class="link-more" href="#/scholarships">前往奖助管理 ›</a></div>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>学生</th><th>奖项</th><th>金额</th><th>状态</th></tr></thead><tbody>' +
        schReview.slice(0, 6).map(function (s) {
          var stu = Store.getStudent(s.studentId);
          var color = s.status === '已公示' ? 'info' : 'warning';
          return '<tr><td><b>' + Utils.escapeHtml(stu ? stu.name : '未知学生') + '</b></td><td>' + Utils.escapeHtml(s.name) + '</td>' +
            '<td>' + Number(s.amount || 0).toLocaleString() + ' 元</td><td>' + UI.badge(s.status, color) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>'
      : '') +
    '<div class="card"><div class="chart-title">最近通知 <a class="link-more" href="#/notices">查看全部 ›</a></div>' +
      '<div id="dash-notices"></div></div>' +
    campusCardHTML();

  // 最近 5 条通知（全部班级 + 负责班级）
  var notices = Store.list('notices')
    .filter(function (n) { return !n.classId || inScope(n.classId); })
    .sort(function (a, b) { return String(b.publishTime || '').localeCompare(String(a.publishTime || '')); })
    .slice(0, 5);
  $('#dash-notices', container).innerHTML = notices.length
    ? notices.map(function (n) { return noticeCardHTML(n, ''); }).join('')
    : UI.empty('暂无通知');

  bindCampusRotator(container);
  if (typeof Weather !== 'undefined') Weather.render($('#dash-weather', container));
}
