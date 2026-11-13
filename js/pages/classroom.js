
/**
 * 科目候选（作业/测验/成绩统一口径）：预置课程表 ∪ 系统内已有科目
 * —— 只给预置列表会让教师选不到本校实际开设的课程（如"数据结构"），
 *    也会让"任教科目默认值"匹配不上（实测踩到）
 */
function subjectOptions() {
  var list = Store.COURSES.slice();
  Store.list('scores').forEach(function (x) {
    if (x.subject && list.indexOf(x.subject) === -1) list.push(x.subject);
  });
  Store.list('quizzes').forEach(function (q) {
    if (q.subject && list.indexOf(q.subject) === -1) list.push(q.subject);
  });
  return list;
}

/** 任教科目默认值：教师在用户管理里设置的任教科目优先用于测验/作业的科目选择 */
function mySubject() {
  var me = (typeof App !== 'undefined') ? App.user : null;
  var mine = (me && me.teachSubjects) ? me.teachSubjects : [];
  var list = subjectOptions();
  for (var i = 0; i < mine.length; i++) {
    if (list.indexOf(mine[i]) !== -1) return mine[i];
  }
  return '';
}
/* =====================================================
 * 课堂模块（对标学习通课堂能力，纯前端实现）
 * - 作业管理：教师发布/批改（评分+评语+迟交标记+未交名单+CSV 导出）
 * - 我的作业：学生提交/修改/查看批改结果
 * - 随堂测验：教师组卷（单选/多选/判断），客观题自动阅卷，
 *             成绩自动写入成绩管理（可参与学期统计与绩点计算）
 * - 课堂签到：教师发起限时签到码，学生端横幅输码自助签到并写考勤
 * ===================================================== */

/* ---------------- 课堂签到（共享助手） ---------------- */

/** 指定班级进行中的签到（未过期），无则返回 null */
function activeSignin(classId) {
  var now = Date.now();
  return Store.list('signins').find(function (s) {
    return s.classId === classId && s.expiresAt > now;
  }) || null;
}

/** 学生端签到横幅 HTML（无进行中签到时返回空串） */
function signinBarHTML(user) {
  var stu = user.studentId ? Store.getStudent(user.studentId) : null;
  if (!stu) return '';
  var sin = activeSignin(stu.classId);
  if (!sin) return '';
  var remain = Math.max(1, Math.ceil((sin.expiresAt - Date.now()) / 60000));
  var already = sin.signed.indexOf(stu.id) !== -1;
  return '<div class="signin-bar">' +
    '<span class="signin-dot"></span><b>课堂签到进行中</b>' +
    '<span class="chip chip-ok">剩余约 <b>' + remain + '</b> 分钟</span>' +
    (already
      ? UI.badge('已签到', 'success')
      : '<input class="input signin-code" maxlength="6" placeholder="输入 6 位签到码">' +
        '<button class="btn btn-primary btn-sm signin-go" type="button">签 到</button>') +
  '</div>';
}

/** 给签到横幅绑定提交事件（配合 signinBarHTML 使用） */
function bindSigninBar(root, user, onDone) {
  var btn = $('.signin-go', root);
  if (!btn) return;
  btn.addEventListener('click', function () {
    var stu = Store.getStudent(user.studentId);
    // 注意：从同一份列表中取出引用再修改，避免“改旧引用、存新列表”的别名问题
    var list = Store.list('signins');
    var now = Date.now();
    var sin = list.find(function (s) {
      return s.classId === stu.classId && s.expiresAt > now;
    });
    var code = $('.signin-code', root).value.trim();
    if (!sin) return Toast.warning('签到已结束');
    if (!code) return Toast.warning('请输入签到码');
    if (code !== sin.code) return Toast.error('签到码不正确');
    if (sin.signed.indexOf(stu.id) !== -1) return Toast.info('你已签到过');
    sin.signed.push(stu.id);
    Store.save('signins', list);
    // 联动考勤：当天记录置为「出勤」
    var today = Utils.today();
    var arr = Store.list('attendance');
    var rec = arr.find(function (a) {
      return a.studentId === stu.id && a.date === today && a.classId === stu.classId;
    });
    if (rec) {
      Store.update('attendance', rec.id, { status: '出勤' });
    } else {
      Store.add('attendance', { date: today, classId: stu.classId, studentId: stu.id, status: '出勤', term: Store.termOfDate(today) });
    }
    Store._log('课堂签到', '学生签到', stu.name + '（' + stu.studentNo + '）');
    Toast.success('签到成功，今日考勤已记为出勤');
    if (typeof onDone === 'function') onDone();
  });
}

/* ---------------- 作业管理（教师 / 管理员） ---------------- */

Pages.assignments = function (container, user) {
  var scopeIds = Auth.scopeClassIds(user);
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">作业管理</div>' +
        '<div class="toolbar-actions">' +
          '<select id="asg-class" class="input"></select>' +
          '<button id="btn-asg-add" class="btn btn-primary" type="button">＋ 发布作业</button>' +
        '</div>' +
      '</div>' +
      '<div id="asg-list"></div>' +
    '</div>';

  var classSel = $('#asg-class', container);
  classSel.innerHTML = UI.options(Auth.visibleClasses(user), 'id', function (c) { return c.name; }, '', '全部班级');
  classSel.addEventListener('change', render);
  $('#btn-asg-add', container).addEventListener('click', function () { openAsgModal(null); });
  render();

  function scoped() {
    return Store.list('assignments').filter(function (a) { return scopeIds.indexOf(a.classId) !== -1; })
      .filter(function (a) { return !$('#asg-class', container).value || a.classId === $('#asg-class', container).value; })
      .sort(function (a, b) { return String(b.publishTime || '').localeCompare(String(a.publishTime || '')); });
  }

  function classSize(classId) {
    return Store.list('students').filter(function (s) { return s.classId === classId; }).length;
  }

  function render() {
    var list = scoped();
    $('#asg-list', container).innerHTML = list.length
      ? list.map(function (a) {
          var subs = Store.list('submissions').filter(function (s) { return s.assignmentId === a.id; });
          var graded = subs.filter(function (s) { return s.status === '已批改'; }).length;
          var late = subs.filter(function (s) { return s.submitTime.slice(0, 16) > a.deadline; }).length;
          var ops = '<button class="btn btn-sm btn-primary" data-grade="' + a.id + '" type="button">批改 / 查看</button>' +
            '<button class="btn btn-sm btn-ghost" data-export="' + a.id + '" type="button">导出CSV</button>' +
            '<button class="btn btn-sm btn-ghost" data-edit="' + a.id + '" type="button">编辑</button>' +
            '<button class="btn btn-sm btn-danger-ghost" data-del="' + a.id + '" type="button">删除</button>';
          return '<div class="notice-card">' +
            '<div class="notice-head"><span class="notice-title">' + Utils.escapeHtml(a.title) + '</span>' +
              UI.badge(a.deadline < Utils.nowStr() ? '已截止' : '进行中', a.deadline < Utils.nowStr() ? 'muted' : 'success') + '</div>' +
            '<div class="notice-meta">' +
              '<span>' + Utils.escapeHtml(Store.className(a.classId)) + '</span>' +
              '<span>截止 ' + Utils.escapeHtml(a.deadline) + '</span>' +
              '<span class="chip">应交 <b>' + classSize(a.classId) + '</b></span>' +
              '<span class="chip chip-info">已交 <b>' + subs.length + '</b></span>' +
              '<span class="chip chip-ok">已批改 <b>' + graded + '</b></span>' +
              (late ? '<span class="chip chip-warn">迟交 <b>' + late + '</b></span>' : '') +
              '<span style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap">' + ops + '</span>' +
            '</div></div>';
        }).join('')
      : UI.empty('暂无作业，点击右上角「发布作业」布置');
    bindList();
  }

  function bindList() {
    $$('#asg-list [data-grade]', container).forEach(function (b) {
      b.addEventListener('click', function () { openGradeModal(b.dataset.grade); });
    });
    $$('#asg-list [data-export]', container).forEach(function (b) {
      b.addEventListener('click', function () { exportSubs(b.dataset.export); });
    });
    $$('#asg-list [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openAsgModal(b.dataset.edit); });
    });
    $$('#asg-list [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delAsg(b.dataset.del); });
    });
  }

  function openAsgModal(id) {
    var isEdit = !!id;
    var a = isEdit ? Store.find('assignments', id) : null;
    if (isEdit && !a) return;
    // 新建时给一个合理的默认截止时间（7 天后），避免每次都要手填被校验拦下
    var model = a || { classId: $('#asg-class', container).value || (Auth.visibleClasses(user)[0] || {}).id || '',
      title: '', requirement: '', deadline: Utils.daysAgo(-7) + ' 23:59' };
    UI.modal({
      title: isEdit ? '编辑作业' : '发布作业',
      body:
        UI.formRow('班级', '<select id="f-class" class="input">' +
          UI.options(Auth.visibleClasses(user), 'id', function (c) { return c.name; }, model.classId, '请选择班级') + '</select>', true) +
        UI.formRow('作业标题', '<input id="f-title" class="input" value="' + Utils.escapeHtml(model.title) + '" placeholder="如：课程作业一：需求分析">', true) +
        UI.formRow('作业要求', '<textarea id="f-req" class="input" rows="6" placeholder="请输入作业内容与提交要求">' + Utils.escapeHtml(model.requirement) + '</textarea>', true) +
        UI.formRow('截止时间', '<input id="f-deadline" type="datetime-local" class="input" value="' + Utils.escapeHtml(String(model.deadline || '').replace(' ', 'T')) + '">', true),
      onSubmit(root, close) {
        var classId = $('#f-class', root).value;
        var title = $('#f-title', root).value.trim();
        var req = $('#f-req', root).value.trim();
        var deadline = $('#f-deadline', root).value.replace('T', ' ');
        if (!classId) return Toast.warning('请选择班级');
        if (!title) return Toast.warning('请输入作业标题');
        if (!req) return Toast.warning('请输入作业要求');
        if (!deadline) return Toast.warning('请选择截止时间');
        if (isEdit) {
          Store.update('assignments', id, { classId: classId, title: title, requirement: req, deadline: deadline });
          Toast.success('作业已更新');
        } else {
          Store.add('assignments', { classId: classId, title: title, requirement: req, deadline: deadline, publishTime: Utils.nowStr(), createdBy: user.id });
          Toast.success('作业发布成功');
        }
        close();
        render();
      }
    });
  }

  /** 批改视图：已交学生逐个评分 + 未交名单 */
  function openGradeModal(id) {
    var a = Store.find('assignments', id);
    if (!a) return;
    var students = Store.list('students').filter(function (s) { return s.classId === a.classId; })
      .sort(function (x, y) { return String(x.studentNo).localeCompare(String(y.studentNo)); });
    var subs = Store.list('submissions').filter(function (s) { return s.assignmentId === id; });
    var byStu = {};
    subs.forEach(function (s) { byStu[s.studentId] = s; });

    var cards = students.map(function (stu) {
      var sub = byStu[stu.id];
      if (!sub) {
        return '<div class="att-row"><span><b>' + Utils.escapeHtml(stu.name) + '</b>' +
          '<small style="color:var(--muted)"> ' + Utils.escapeHtml(stu.studentNo) + '</small></span>' +
          UI.badge('未提交', 'muted') + '</div>';
      }
      var late = sub.submitTime.slice(0, 16) > a.deadline;
      return '<div class="qz-q">' +
        '<div class="notice-head"><b>' + Utils.escapeHtml(stu.name) + '</b>' +
          '<small style="color:var(--muted)">' + Utils.escapeHtml(stu.studentNo) + '</small>' +
          UI.badge('提交于 ' + sub.submitTime.slice(5, 16), 'info') + (late ? UI.badge('迟交', 'warning') : '') + '</div>' +
        '<div class="asg-content">' + Utils.escapeHtml(sub.content) + '</div>' +
        '<div class="form-grid">' +
          UI.formRow('评分（百分制，留空则未批改）', '<input class="input sub-score" data-sub="' + sub.id + '" type="number" min="0" max="100" step="0.5" value="' + Utils.escapeHtml(sub.score === '' ? '' : sub.score) + '">') +
          UI.formRow('评语', '<input class="input sub-feedback" data-sub="' + sub.id + '" value="' + Utils.escapeHtml(sub.feedback || '') + '" placeholder="评语将展示给学生">') +
        '</div></div>';
    }).join('');

    var mask = UI.modal({
      title: '批改作业 · ' + a.title,
      wide: true,
      submitText: '保存全部批改',
      body: cards,
      onSubmit(root, close) {
        // 先整体校验，全部合法才落库，避免半批改状态
        var inputs = $$('.sub-score', root);
        for (var i = 0; i < inputs.length; i++) {
          var v = inputs[i].value.trim();
          if (v !== '' && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100)) {
            return Toast.error('有评分超出 0 ~ 100 范围，请检查后重试');
          }
        }
        var arr = Store.list('submissions');
        var gradedCount = 0;
        inputs.forEach(function (input) {
          var sub = arr.find(function (x) { return x.id === input.dataset.sub; });
          if (!sub) return;
          var fb = $('.sub-feedback[data-sub="' + sub.id + '"]', root).value.trim();
          var v = input.value.trim();
          if (v === '') {
            // 未评分：仅同步评语，状态保持不变
            if (fb && fb !== sub.feedback) Store.update('submissions', sub.id, { feedback: fb });
            return;
          }
          Store.update('submissions', sub.id, {
            score: Number(v),
            feedback: fb,
            gradedBy: user.name || user.username,
            gradedTime: Utils.nowStr(),
            status: '已批改'
          });
          gradedCount++;
        });
        Store._log('作业管理', '批改', a.title + '（' + Store.className(a.classId) + '），本次批改 ' + gradedCount + ' 份');
        Toast.success('批改结果已保存（本次批改 ' + gradedCount + ' 份）');
        close();
        render();
      }
    });
  }

  function exportSubs(id) {
    var a = Store.find('assignments', id);
    var subs = Store.list('submissions').filter(function (s) { return s.assignmentId === id; });
    var stuMap = {};
    Store.list('students').forEach(function (s) { stuMap[s.id] = s; });
    Utils.exportCSV('作业提交_' + a.title + '_' + Utils.today() + '.csv',
      ['学号', '姓名', '提交时间', '迟交', '评分', '评语', '作业内容'],
      students0(a).map(function (stu) {
        var sub = subs.find(function (x) { return x.studentId === stu.id; });
        return [stu.studentNo, stu.name,
          sub ? sub.submitTime : '未提交',
          sub ? (sub.submitTime.slice(0, 16) > a.deadline ? '是' : '否') : '—',
          sub && sub.score !== '' ? sub.score : '未批改',
          sub ? (sub.feedback || '') : '',
          sub ? sub.content : ''];
      }));
    Toast.success('已导出提交情况');
  }

  function students0(a) {
    return Store.list('students').filter(function (s) { return s.classId === a.classId; })
      .sort(function (x, y) { return String(x.studentNo).localeCompare(String(y.studentNo)); });
  }

  function delAsg(id) {
    var a = Store.find('assignments', id);
    if (!a) return;
    UI.confirm({
      title: '删除作业',
      message: '确定删除作业「' + a.title + '」吗？\n其全部学生提交与批改记录将一并删除，不可恢复！',
      onOk() {
        Store.remove('assignments', id);
        Store.save('submissions', Store.list('submissions').filter(function (x) { return x.assignmentId !== id; }));
        Toast.success('作业已删除');
        render();
      }
    });
  }
};

/* ---------------- 我的作业（学生） ---------------- */

Pages['my-assignments'] = function (container, user) {
  var stu = user.studentId ? Store.getStudent(user.studentId) : null;
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  container.innerHTML = '<div class="card"><div class="toolbar"><div class="toolbar-title">我的作业</div>'
    + '<div class="toolbar-actions"><span class="chip chip-info" id="mas-scope"></span></div></div>'
    + '<div id="ma-list"></div></div>';
  render();

  function render() {
    // 跟随顶栏「全站学期」：进行中的作业（未截止且未提交/未批改）始终显示，
    // 其余按「截止时间所属学期」筛选（作业本身没有学期字段，用截止时间推算）
    var scope = UI.termFilter.get();
    var scopeEl = $('#mas-scope', container);
    if (scopeEl) scopeEl.textContent = '统计范围：' + studentTermLabel(scope) + '（进行中的作业始终显示）';
    var list = Store.list('assignments').filter(function (a) { return a.classId === stu.classId; })
      .filter(function (a) {
        var sub = Store.list('submissions').find(function (s) { return s.assignmentId === a.id && s.studentId === stu.id; });
        var active = a.deadline >= Utils.nowStr() && (!sub || sub.status !== '已批改');
        return active || Store.termMatch(Store.termOfDate(a.deadline), scope);
      })
      .sort(function (a, b) { return String(a.deadline).localeCompare(String(b.deadline)); });
    $('#ma-list', container).innerHTML = list.length
      ? list.map(function (a) {
          var sub = Store.list('submissions').find(function (s) { return s.assignmentId === a.id && s.studentId === stu.id; });
          var closed = a.deadline < Utils.nowStr();
          var late = sub && sub.submitTime.slice(0, 16) > a.deadline;
          var status, ops = '';
          if (sub && sub.status === '已批改') {
            status = UI.badge('已批改', 'success');
            ops = '<div class="asg-content"><b>得分：' + sub.score + '</b>　' + Utils.escapeHtml(sub.feedback || '（无评语）') + '</div>';
          } else if (sub) {
            status = UI.badge('已提交', 'info') + (late ? UI.badge('迟交', 'warning') : '');
            ops = '<button class="btn btn-sm btn-ghost" data-edit="' + a.id + '" type="button">修改我的提交</button>';
          } else if (closed) {
            status = UI.badge('已截止 · 未提交', 'danger');
          } else {
            status = UI.badge('待提交', 'warning');
            ops = '<button class="btn btn-sm btn-primary" data-submit="' + a.id + '" type="button">提交作业</button>';
          }
          return '<div class="notice-card">' +
            '<div class="notice-head"><span class="notice-title">' + Utils.escapeHtml(a.title) + '</span>' + status + '</div>' +
            '<div class="asg-content">' + Utils.escapeHtml(a.requirement) + '</div>' +
            '<div class="notice-meta"><span>截止 ' + Utils.escapeHtml(a.deadline) + '</span>' +
              (sub ? '<span>提交于 ' + Utils.escapeHtml(sub.submitTime) + '</span>' : '') + ops + '</div></div>';
        }).join('')
      : UI.empty(scope ? studentTermLabel(scope) + '暂无作业记录（可切换顶部学期，或选最上方的「全部学期」项查看全部）' : '暂无作业');
    bind();
  }

  function bind() {
    $$('[data-submit], [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openSubmit(b.dataset.submit || b.dataset.edit); });
    });
  }

  function openSubmit(asgId) {
    var a = Store.find('assignments', asgId);
    if (!a) return;
    var sub = Store.list('submissions').find(function (s) { return s.assignmentId === asgId && s.studentId === stu.id; });
    if (sub && sub.status === '已批改') return Toast.warning('作业已批改，不能再修改');
    UI.modal({
      title: '提交作业 · ' + a.title,
      submitText: sub ? '重新提交' : '提交作业',
      body:
        '<div class="asg-content">' + Utils.escapeHtml(a.requirement) + '</div>' +
        UI.formRow('作业内容', '<textarea id="f-content" class="input" rows="8" placeholder="请输入作业内容（文字形式，不少于 10 个字）">' + Utils.escapeHtml(sub ? sub.content : '') + '</textarea>', true),
      onSubmit(root, close) {
        var content = $('#f-content', root).value.trim();
        if (content.length < 10) return Toast.warning('作业内容不少于 10 个字');
        var late = Utils.nowStr() > a.deadline;
        if (sub) {
          Store.update('submissions', sub.id, { content: content, submitTime: Utils.nowStr(), score: '', feedback: '', status: '已提交' });
          Toast.success(late ? '已重新提交（迟交）' : '作业已重新提交');
        } else {
          Store.add('submissions', { assignmentId: asgId, studentId: stu.id, content: content, submitTime: Utils.nowStr(), score: '', feedback: '', status: '已提交' });
          Toast.success(late ? '已提交（超过截止时间，将标记迟交）' : '作业提交成功');
        }
        close();
        render();
      }
    });
  }
};

/* ---------------- 随堂测验（教师 / 管理员） ---------------- */

Pages.quizzes = function (container, user) {
  var scopeIds = Auth.scopeClassIds(user);
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">随堂测验</div>' +
        '<div class="toolbar-actions"><button id="btn-qz-add" class="btn btn-primary" type="button">＋ 新建测验</button></div>' +
      '</div>' +
      '<div id="qz-list"></div>' +
    '</div>';

  $('#btn-qz-add', container).addEventListener('click', function () { openQuizModal(null); });
  render();

  function quizTotal(q) {
    return q.questions.reduce(function (a, x) { return a + Number(x.points || 0); }, 0);
  }

  function render() {
    var list = Store.list('quizzes').filter(function (q) { return scopeIds.indexOf(q.classId) !== -1; })
      .sort(function (a, b) { return String(b.publishTime || '').localeCompare(String(a.publishTime || '')); });
    var size = function (classId) {
      return Store.list('students').filter(function (s) { return s.classId === classId; }).length;
    };
    $('#qz-list', container).innerHTML = list.length
      ? list.map(function (q) {
          var atts = Store.list('quizAttempts').filter(function (x) { return x.quizId === q.id; });
          var avg = atts.length ? Utils.round1(atts.reduce(function (a, x) { return a + x.score; }, 0) / atts.length) : '—';
          return '<div class="notice-card">' +
            '<div class="notice-head"><span class="notice-title">' + Utils.escapeHtml(q.title) + '</span>' +
              UI.badge(q.deadline < Utils.nowStr() ? '已截止' : '进行中', q.deadline < Utils.nowStr() ? 'muted' : 'success') + '</div>' +
            '<div class="notice-meta">' +
              '<span>' + Utils.escapeHtml(Store.className(q.classId)) + '</span>' +
              '<span>' + Utils.escapeHtml(q.subject) + ' · ' + q.questions.length + ' 题 · 满分 ' + quizTotal(q) + ' 分</span>' +
              '<span>限时 ' + q.durationMin + ' 分钟 · 截止 ' + Utils.escapeHtml(q.deadline) + '</span>' +
              '<span class="chip chip-info">已完成 <b>' + atts.length + '/' + size(q.classId) + '</b></span>' +
              '<span class="chip">平均分 <b>' + avg + '</b></span>' +
              '<span style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap">' +
                '<button class="btn btn-sm btn-ghost" data-view="' + q.id + '" type="button">预览</button>' +
                '<button class="btn btn-sm btn-primary" data-score="' + q.id + '" type="button">成绩</button>' +
                '<button class="btn btn-sm btn-danger-ghost" data-del="' + q.id + '" type="button">删除</button>' +
              '</span>' +
            '</div></div>';
        }).join('')
      : UI.empty('暂无测验，点击右上角「新建测验」组卷');
    bind();
  }

  function bind() {
    $$('#qz-list [data-view]', container).forEach(function (b) {
      b.addEventListener('click', function () { previewQuiz(b.dataset.view); });
    });
    $$('#qz-list [data-score]', container).forEach(function (b) {
      b.addEventListener('click', function () { viewScores(b.dataset.score); });
    });
    $$('#qz-list [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delQuiz(b.dataset.del); });
    });
  }

  function previewQuiz(id) {
    var q = Store.find('quizzes', id);
    if (!q) return;
    var html = q.questions.map(function (x, i) {
      return '<div class="qz-q"><b>' + (i + 1) + '. [' + x.type + ' ' + x.points + '分] ' + Utils.escapeHtml(x.stem) + '</b>' +
        '<div style="margin-top:6px;color:var(--muted);font-size:13px">' +
        x.options.map(function (o, j) {
          var letter = String.fromCharCode(65 + j);
          return letter + '. ' + Utils.escapeHtml(o) + (x.type !== '判断' && x.answer.indexOf(letter) !== -1 ? '（正确答案）' : (x.answer === o ? '（正确答案）' : ''));
        }).join('　') + '</div></div>';
    }).join('');
    UI.modal({ title: '预览测验 · ' + q.title, wide: true, body: html });
  }

  /** 组卷弹窗：题目以数组暂存，块内输入实时写回 */
  function openQuizModal(id) {
    var isEdit = !!id;
    var q = isEdit ? Store.find('quizzes', id) : null;
    if (isEdit && !q) return;
    var model = q || {
      classId: (Auth.visibleClasses(user)[0] || {}).id || '', title: '',
      // 科目默认取任课教师的任教科目（用户管理里维护），没有则退回首项
      subject: mySubject() || Store.COURSES[0],
      durationMin: 10, deadline: Utils.daysAgo(-7) + ' 23:59', questions: []
    };
    var tmp = JSON.parse(JSON.stringify(model.questions));
    if (!tmp.length) {
      tmp.push({ type: '单选', stem: '', options: ['', '', '', ''], answer: 'A', points: 10 });
    }

    function optRow(x, i) {
      if (x.type === '判断') {
        // 判断题不需要填选项：这里给出说明即可（此前渲染了一个不可操作的假单选框）
        return '<p style="margin:0;color:var(--muted);font-size:12.5px">' +
          '判断题选项固定为「对 / 错」，无需填写选项，请在下方选择正确答案。</p>';
      }
      var letters = ['A', 'B', 'C', 'D'];
      return '<div class="qz-opts">' + letters.map(function (L, j) {
        return '<input class="input qz-opt" data-i="' + i + '" data-j="' + j + '" value="' + Utils.escapeHtml(x.options[j] || '') + '" placeholder="选项 ' + L + '">';
      }).join('') + '</div>';
    }
    function ansSel(x, i) {
      if (x.type === '判断') {
        return '<select class="input qz-answer" data-i="' + i + '"><option' + (x.answer === '对' ? ' selected' : '') + '>对</option><option' + (x.answer === '错' ? ' selected' : '') + '>错</option></select>';
      }
      var letters = ['A', 'B', 'C', 'D'];
      if (x.type === '多选') {
        // 多选：勾选若干正确答案
        return '<div>' + letters.map(function (L) {
          return '<label class="radio" style="margin:2px 8px 2px 0"><input type="checkbox" class="qz-answer-chk" data-i="' + i + '" data-l="' + L + '"' +
            (x.answer.indexOf(L) !== -1 ? ' checked' : '') + '>' + L + '</label>';
        }).join('') + '</div>';
      }
      return '<select class="input qz-answer" data-i="' + i + '">' + letters.map(function (L) {
        return '<option value="' + L + '"' + (x.answer === L ? ' selected' : '') + '>' + L + '</option>';
      }).join('') + '</select>';
    }
    function blockHTML(x, i) {
      return '<div class="qz-q" data-i="' + i + '">' +
        '<div class="notice-head"><b>第 ' + (i + 1) + ' 题</b>' +
          '<button class="btn btn-sm btn-danger-ghost qz-del" data-i="' + i + '" type="button">删除本题</button></div>' +
        UI.formRow('题干', '<textarea class="input qz-stem" data-i="' + i + '" rows="2" placeholder="请输入题干">' + Utils.escapeHtml(x.stem) + '</textarea>', true) +
        '<div class="form-grid">' +
          UI.formRow('题型', '<select class="input qz-type" data-i="' + i + '">' +
            ['单选', '多选', '判断'].map(function (t) { return '<option' + (x.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>') +
          UI.formRow('分值', '<input class="input qz-points" data-i="' + i + '" type="number" min="1" max="100" value="' + (x.points || 10) + '">') +
        '</div>' +
        '<div class="form-item"><label>选项（判断题固定为 对/错）</label>' + optRow(x, i) + '</div>' +
        UI.formRow('正确答案', ansSel(x, i)) +
      '</div>';
    }

    var mask = UI.modal({
      title: isEdit ? '编辑测验' : '新建测验',
      wide: true,
      submitText: '发布测验',
      body:
        '<div class="form-grid">' +
          UI.formRow('测验标题', '<input id="f-title" class="input" value="' + Utils.escapeHtml(model.title) + '" placeholder="如：软件工程随堂小测">', true) +
          UI.formRow('班级', '<select id="f-class" class="input">' +
            UI.options(Auth.visibleClasses(user), 'id', function (c) { return c.name; }, model.classId, '请选择班级') + '</select>', true) +
          UI.formRow('关联科目（成绩归属）', '<select id="f-subject" class="input">' +
            Utils.simpleOptions(subjectOptions(), model.subject || mySubject()) + '</select>', true) +
          UI.formRow('限时（分钟）', '<select id="f-duration" class="input">' + [5, 10, 15, 20, 30].map(function (m) {
            return '<option value="' + m + '"' + (m === model.durationMin ? ' selected' : '') + '>' + m + '</option>';
          }).join('') + '</select>') +
          UI.formRow('作答截止', '<input id="f-deadline" type="datetime-local" class="input" value="' + Utils.escapeHtml(String(model.deadline || '').replace(' ', 'T')) + '">', true) +
        '</div>' +
        '<div id="qz-questions"></div>' +
        '<button id="btn-qz-addq" class="btn btn-ghost btn-block" type="button">＋ 添加题目</button>',
      onSubmit(root, close) {
        // 暂存区里的数据即最终数据（输入时已实时写回）
        var title = $('#f-title', root).value.trim();
        var classId = $('#f-class', root).value;
        var subject = $('#f-subject', root).value;
        var durationMin = Number($('#f-duration', root).value);
        var deadline = $('#f-deadline', root).value.replace('T', ' ');
        if (!title) return Toast.warning('请输入测验标题');
        if (!classId) return Toast.warning('请选择班级');
        if (!deadline) return Toast.warning('请选择作答截止时间');
        if (!tmp.length) return Toast.warning('请至少添加一道题目');
        for (var i = 0; i < tmp.length; i++) {
          var x = tmp[i];
          if (!x.stem.trim()) return Toast.warning('第 ' + (i + 1) + ' 题题干为空');
          if (x.type !== '判断') {
            var filled = x.options.filter(function (o) { return o.trim(); });
            if (filled.length < 2) return Toast.warning('第 ' + (i + 1) + ' 题至少填写 2 个选项');
            if (x.type === '多选' && x.answer.length < 2) return Toast.warning('第 ' + (i + 1) + ' 题为多选，请设置至少 2 个正确答案');
          }
        }
        var data = { classId: classId, title: title, subject: subject, durationMin: durationMin, deadline: deadline, questions: tmp };
        if (isEdit) {
          Store.update('quizzes', id, data);
          Toast.success('测验已更新');
        } else {
          var rec = { publishTime: Utils.nowStr(), createdBy: user.id };
          Object.assign(rec, data);
          Store.add('quizzes', rec);
          Toast.success('测验发布成功，学生端即刻可见');
        }
        close();
        render();
      }
    });

    var listEl = $('#qz-questions', mask);
    function renderBlocks() {
      listEl.innerHTML = tmp.map(function (x, i) { return blockHTML(x, i); }).join('');
      bindBlocks();
    }
    function bindBlocks() {
      $$('.qz-q', listEl).forEach(function (blk) {
        var i = Number(blk.dataset.i);
        var stem = $('.qz-stem', blk);
        stem.addEventListener('input', function () { tmp[i].stem = this.value; });
        var pts = $('.qz-points', blk);
        pts.addEventListener('input', function () { tmp[i].points = Number(this.value) || 1; });
        $$('.qz-opt', blk).forEach(function (opt) {
          opt.addEventListener('input', function () { tmp[i].options[Number(opt.dataset.j)] = this.value; });
        });
        $('.qz-answer', blk).addEventListener('change', function () {
          tmp[i].answer = this.value;
        });
        $$('.qz-answer-chk', blk).forEach(function (chk) {
          chk.addEventListener('change', function () {
            var set = $$('.qz-answer-chk', blk).filter(function (c) { return c.checked; })
              .map(function (c) { return c.dataset.l; }).sort();
            if (!set.length) {
              chk.checked = true;
              return Toast.warning('多选题至少保留一个正确答案');
            }
            tmp[i].answer = set.join('');
          });
        });
        $('.qz-type', blk).addEventListener('change', function () {
          var t = this.value;
          tmp[i].type = t;
          if (t === '判断') { tmp[i].options = ['对', '错']; tmp[i].answer = '对'; }
          else {
            var old = tmp[i].options && tmp[i].options.length === 4 ? tmp[i].options : ['', '', '', ''];
            tmp[i].options = old;
            if (t === '多选') tmp[i].answer = 'AB'; else tmp[i].answer = 'A';
          }
          renderBlocks();
        });
        $('.qz-del', blk).addEventListener('click', function () {
          if (tmp.length <= 1) return Toast.warning('至少保留一道题目');
          tmp.splice(i, 1);
          renderBlocks();
        });
      });
    }
    $('#btn-qz-addq', mask).addEventListener('click', function () {
      tmp.push({ type: '单选', stem: '', options: ['', '', '', ''], answer: 'A', points: 10 });
      renderBlocks();
    });
    renderBlocks();
  }

  function viewScores(id) {
    var q = Store.find('quizzes', id);
    if (!q) return;
    var students = Store.list('students').filter(function (s) { return s.classId === q.classId; })
      .sort(function (x, y) { return String(x.studentNo).localeCompare(String(y.studentNo)); });
    var atts = Store.list('quizAttempts').filter(function (x) { return x.quizId === id; });
    var byStu = {};
    atts.forEach(function (x) { byStu[x.studentId] = x; });
    var rows = students.map(function (stu) {
      var att = byStu[stu.id];
      return '<tr><td>' + Utils.escapeHtml(stu.studentNo) + '</td><td>' + Utils.escapeHtml(stu.name) + '</td>' +
        '<td>' + (att ? UI.badge(att.score + ' 分', att.score >= 60 ? 'success' : 'danger') : UI.badge('未完成', 'muted')) + '</td>' +
        '<td>' + (att ? Utils.escapeHtml(att.submitTime) : '—') + '</td></tr>';
    }).join('');
    UI.modal({
      title: '测验成绩 · ' + q.title,
      wide: true,
      body: '<div class="table-wrap"><table class="table"><thead><tr><th>学号</th><th>姓名</th><th>得分（满分 ' +
        q.questions.reduce(function (a, x) { return a + Number(x.points || 0); }, 0) + '）</th><th>提交时间</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
      submitText: '导出CSV',
      onSubmit() {
        Utils.exportCSV('随堂测验成绩_' + q.title + '_' + Utils.today() + '.csv',
          ['学号', '姓名', '得分', '提交时间'],
          students.map(function (stu) {
            var att = atts.find(function (x) { return x.studentId === stu.id; });
            return [stu.studentNo, stu.name, att ? att.score : '未完成', att ? att.submitTime : ''];
          }));
        Toast.success('已导出测验成绩');
      }
    });
  }

  function delQuiz(id) {
    var q = Store.find('quizzes', id);
    if (!q) return;
    UI.confirm({
      title: '删除测验',
      message: '确定删除测验「' + q.title + '」吗？\n学生作答记录将一并删除（已写入成绩管理的分数保留），不可恢复！',
      onOk() {
        Store.remove('quizzes', id);
        Store.save('quizAttempts', Store.list('quizAttempts').filter(function (x) { return x.quizId !== id; }));
        Toast.success('测验已删除');
        render();
      }
    });
  }
};

/* ---------------- 随堂测验（学生端：限时作答 + 自动阅卷） ---------------- */

Pages['my-quizzes'] = function (container, user) {
  var stu = user.studentId ? Store.getStudent(user.studentId) : null;
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  container.innerHTML = '<div class="card"><div class="toolbar"><div class="toolbar-title">随堂测验</div>'
    + '<div class="toolbar-actions"><span class="chip chip-info" id="mqs-scope"></span></div></div>'
    + '<div id="mq-list"></div></div>';
  render();

  function quizTotal(q) {
    return q.questions.reduce(function (a, x) { return a + Number(x.points || 0); }, 0);
  }

  function render() {
    // 跟随顶栏「全站学期」：待作答（未截止且未完成）始终显示，其余按「截止时间所属学期」筛选
    var scope = UI.termFilter.get();
    var scopeEl = $('#mqs-scope', container);
    if (scopeEl) scopeEl.textContent = '统计范围：' + studentTermLabel(scope) + '（待作答的始终显示）';
    var list = Store.list('quizzes').filter(function (q) { return q.classId === stu.classId; })
      .filter(function (q) {
        var att = Store.list('quizAttempts').find(function (x) { return x.quizId === q.id && x.studentId === stu.id; });
        var pending = q.deadline >= Utils.nowStr() && !att;
        return pending || Store.termMatch(Store.termOfDate(q.deadline), scope);
      })
      .sort(function (a, b) { return String(b.publishTime || '').localeCompare(String(a.publishTime || '')); });
    $('#mq-list', container).innerHTML = list.length
      ? list.map(function (q) {
          var att = Store.list('quizAttempts').find(function (x) { return x.quizId === q.id && x.studentId === stu.id; });
          var closed = q.deadline < Utils.nowStr();
          var status, ops = '';
          if (att) {
            status = UI.badge('已完成', 'success');
            ops = '<div class="asg-content"><b>得分：' + att.score + ' / ' + quizTotal(q) + '</b>　提交于 ' + Utils.escapeHtml(att.submitTime) + '</div>';
          } else if (closed) {
            status = UI.badge('已截止 · 未作答', 'danger');
          } else {
            status = UI.badge('待作答', 'warning');
            ops = '<button class="btn btn-sm btn-primary" data-take="' + q.id + '" type="button">进入测验</button>';
          }
          return '<div class="notice-card">' +
            '<div class="notice-head"><span class="notice-title">' + Utils.escapeHtml(q.title) + '</span>' + status + '</div>' +
            '<div class="notice-meta">' +
              '<span>' + Utils.escapeHtml(q.subject) + ' · ' + q.questions.length + ' 题 · 满分 ' + quizTotal(q) + ' 分</span>' +
              '<span>限时 ' + q.durationMin + ' 分钟</span>' +
              '<span>截止 ' + Utils.escapeHtml(q.deadline) + '</span>' + ops +
            '</div></div>';
        }).join('')
      : UI.empty(scope ? studentTermLabel(scope) + '暂无测验记录（可切换顶部学期，或选最上方的「全部学期」项查看全部）' : '暂无测验');
    $$('[data-take]', container).forEach(function (b) {
      b.addEventListener('click', function () { takeQuiz(b.dataset.take); });
    });
  }

  /** 进入测验：倒计时 + 客观题自动阅卷 */
  function takeQuiz(id) {
    var q = Store.find('quizzes', id);
    if (!q) return;
    if (Store.list('quizAttempts').some(function (x) { return x.quizId === id && x.studentId === stu.id; })) {
      return Toast.warning('该测验已完成，不能重复作答');
    }
    if (q.deadline < Utils.nowStr()) return Toast.warning('测验已截止');
    var total = quizTotal(q);
    var end = Date.now() + q.durationMin * 60000;
    var done = false;
    var timer = null;

    var qHtml = q.questions.map(function (x, i) {
      var isMulti = x.type === '多选';
      var isJudge = x.type === '判断';
      var inputs = x.options.map(function (o, j) {
        var val = isJudge ? o : String.fromCharCode(65 + j);
        var label = isJudge ? o : val + '. ' + Utils.escapeHtml(o);
        return '<label class="radio" style="margin:4px 10px 4px 0"><input type="' + (isMulti ? 'checkbox' : 'radio') +
          '" name="qz-' + i + '" value="' + val + '">' + label + '</label>';
      }).join('');
      return '<div class="qz-q"><b>' + (i + 1) + '. [' + x.type + ' ' + x.points + '分] ' + Utils.escapeHtml(x.stem) + '</b>' +
        '<div style="margin-top:8px">' + inputs + (isMulti ? '<small style="color:var(--muted)">（多选）</small>' : '') + '</div></div>';
    }).join('');

    var mask = UI.modal({
      title: '随堂测验 · ' + q.title,
      wide: true,
      submitText: '交 卷',
      body: '<div class="signin-bar" style="margin-bottom:14px">' +
          '<b>剩余时间</b><span id="qz-timer" style="font-family:var(--serif);font-size:20px;letter-spacing:2px">--:--</span>' +
          '<span>共 ' + q.questions.length + ' 题 · 满分 ' + total + ' 分 · 交卷后自动阅卷</span></div>' + qHtml,
      onSubmit() { /* 交卷走下方 grade()（含二次确认） */ }
    });

    function collect() {
      return q.questions.map(function (x, i) {
        if (x.type === '多选') {
          var set = $$('input[name="qz-' + i + '"]:checked', mask).map(function (c) { return c.value; }).sort();
          return set.join('');
        }
        var r = $('input[name="qz-' + i + '"]:checked', mask);
        return r ? r.value : '';
      });
    }
    function grade() {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      var answers = collect();
      var score = 0;
      q.questions.forEach(function (x, i) {
        var ans = String(x.answer);
        var got = answers[i] || '';
        if (x.type === '多选') {
          var expect = ans.split('').sort().join('');
          if (got.split('').sort().join('') === expect) score += Number(x.points || 0);
        } else if (got === ans) {
          score += Number(x.points || 0);
        }
      });
      Store.add('quizAttempts', {
        quizId: q.id, studentId: stu.id, answers: answers,
        score: score, total: total, submitTime: Utils.nowStr(),
        term: Store.termOfDate(Utils.today())
      });
      // 成绩自动写入成绩管理（可参与学期统计与绩点）
      var examName = '随堂测验·' + q.title;
      var arr = Store.list('scores');
      var rec = arr.find(function (x) {
        return x.studentId === stu.id && x.examName === examName &&
          x.subject === q.subject && x.classId === q.classId;
      });
      if (rec) {
        rec.score = score; rec.date = Utils.today(); rec.term = Store.termOfDate(Utils.today());
        Store.save('scores', arr);
      } else {
        Store.add('scores', { studentId: stu.id, classId: q.classId, subject: q.subject, examName: examName, score: score, credit: '', nature: '', date: Utils.today(), term: Store.termOfDate(Utils.today()) });
      }
      Store._log('测验作答', '自动阅卷', stu.name + '「' + q.title + '」得分 ' + score + '/' + total);
      if (mask._close) mask._close();   // 走 UI 的关闭流程，正确解绑 Esc 并恢复滚动
      Toast.success('交卷成功，自动阅卷得分：' + score + ' / ' + total);
      render();
    }

    // 倒计时
    function tick() {
      if (!document.body.contains(mask)) { clearInterval(timer); return; } // 弹窗已关闭则停止计时
      var left = end - Date.now();
      if (left <= 0) {
        $('#qz-timer', mask).textContent = '00:00';
        Toast.warning('时间到，系统自动交卷');
        grade();
        return;
      }
      var m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      $('#qz-timer', mask).textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    tick();
    timer = setInterval(tick, 1000);

    // 交卷按钮：二次确认后阅卷
    $('[data-act="ok"]', mask).addEventListener('click', function () {
      if (done) return;
      var unanswered = collect().filter(function (a) { return a === ''; }).length;
      UI.confirm({
        title: '确认交卷',
        message: unanswered ? '还有 ' + unanswered + ' 题未作答，确认交卷吗？交卷后自动阅卷。' : '确认交卷吗？交卷后系统自动阅卷并计入成绩。',
        onOk() { grade(); }
      });
    });
  }
};
