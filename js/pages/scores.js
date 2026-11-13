/* =====================================================
 * 成绩管理（管理员 / 教师，教师限本班）
 * - 单条录入 / 批量录入 / 修改 / 删除
 * - 按班级、科目、考试筛选
 * - 统计平均分、最高分、最低分，并计算排名（同分同名次）
 * ===================================================== */

Pages.scores = function (container, user) {
  /* 科目建议库：源自真实学业成绩表的课程清单 */
  // 科目候选 = 预置课程表 ∪ 系统内已有科目（成绩里出现过的）
  // —— 否则教师在录入时无法选到本校实际开设的课程（如"数据结构"）
  var SUBJECTS = (function () {
    var list = Store.COURSES.slice();
    Store.list('scores').forEach(function (x) {
      if (x.subject && list.indexOf(x.subject) === -1) list.push(x.subject);
    });
    return list;
  })();

  /** 科目默认值：任课教师优先选中自己的任教科目（用户管理里维护），否则用科目表第一项 */
  function defaultSubject() {
    var me = (typeof App !== 'undefined') ? App.user : null;
    var mine = (me && me.teachSubjects) ? me.teachSubjects : [];
    for (var i = 0; i < mine.length; i++) {
      if (SUBJECTS.indexOf(mine[i]) !== -1) return mine[i];
    }
    return SUBJECTS[0];
  }

  var isAdmin = Auth.isAdmin(user);
  var scopeIds = Auth.scopeClassIds(user);
  var state = {
    // 初始学期取自顶栏「全站学期」开关（'' = 全部学期）
    term: UI.termFilter.get(),
    classId: isAdmin ? '' : (Auth.teacherClassIds(user)[0] || ''),
    subject: '', exam: '',
    page: 1, pageSize: 10
  };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">成绩列表</div>' +
        '<div class="toolbar-actions">' +
          '<select id="sc-term" class="input"></select>' +
          '<select id="sc-class" class="input"></select>' +
          '<select id="sc-subject" class="input"></select>' +
          '<select id="sc-exam" class="input"></select>' +
          '<button id="btn-sc-add" class="btn btn-primary" type="button">＋ 单条录入</button>' +
          '<button id="btn-sc-batch" class="btn btn-ghost" type="button">批量录入</button>' +
          '<button id="btn-sc-finalize" class="btn btn-ghost" type="button">总评合成</button>' +
          '<button id="btn-sc-print" class="btn btn-ghost" type="button">成绩单打印</button>' +
        '</div>' +
      '</div>' +
      '<div id="sc-stats" class="stat-grid"></div>' +
      '<div id="sc-table"></div>' +
    '</div>';

  $('#btn-sc-add', container).addEventListener('click', function () { openScoreModal(null); });
  $('#btn-sc-batch', container).addEventListener('click', openBatchModal);
  $('#btn-sc-print', container).addEventListener('click', openPrintModal);
  $('#btn-sc-finalize', container).addEventListener('click', openFinalizeModal);
  $('#sc-term', container).addEventListener('change', function () {
    state.term = this.value;
    state.page = 1;
    Store.setPref('uiTerm', this.value);  // 与顶栏全站学期开关保持同一值
    UI.termFilter.syncTopbar();
    render();
  });
  $('#sc-class', container).addEventListener('change', function () { state.classId = this.value; state.page = 1; render(); });
  $('#sc-subject', container).addEventListener('change', function () { state.subject = this.value; state.page = 1; render(); });
  $('#sc-exam', container).addEventListener('change', function () { state.exam = this.value; state.page = 1; render(); });

  render();

  /* ---- 数据筛选 ---- */

  /** 按班级范围过滤（教师限任教班级；管理员可选具体班级） */
  function scopedByClass() {
    var list = Store.list('scores').filter(function (s) {
      return scopeIds.indexOf(s.classId) !== -1 &&
        Store.termMatch(s.term || Store.currentTerm(), state.term);
    });
    if (state.classId) list = list.filter(function (s) { return s.classId === state.classId; });
    return list;
  }

  /** 全部筛选条件生效后的结果（统计与排名基于它） */
  function filtered() {
    var list = scopedByClass();
    if (state.subject) list = list.filter(function (s) { return s.subject === state.subject; });
    if (state.exam) list = list.filter(function (s) { return s.examName === state.exam; });
    return list;
  }

  /** 范围内出现过的考试名称（供 datalist 选择） */
  function distinctExams() {
    var set = [];
    scopedByClass().forEach(function (s) {
      if (set.indexOf(s.examName) === -1) set.push(s.examName);
    });
    return set;
  }

  /* ---- 主渲染 ---- */
  function render() {
    // 学期下拉（出现在系统中的所有学期，默认当前学期）
    // 选项由统一函数渲染（含「本 ·」标记与学期数）；本页以 '' 表示"全部学期"
    $('#sc-term', container).innerHTML =
      UI.termFilter.optionsHTML(state.term || '', { includeAll: true, allValue: '' });

    var classes = Auth.visibleClasses(user);
    var classSel = $('#sc-class', container);
    if (isAdmin) {
      classSel.innerHTML = UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '全部班级');
    } else {
      classSel.innerHTML = classes.length
        ? UI.options(classes, 'id', function (c) { return c.name; }, state.classId)
        : '<option value="">未绑定班级</option>';
      classSel.disabled = classes.length === 0;
    }

    var list = filtered();
    // 科目/考试下拉选项来自“班级范围”内的演示数据
    var subjectSet = [], examSet = [];
    scopedByClass().forEach(function (s) {
      if (subjectSet.indexOf(s.subject) === -1) subjectSet.push(s.subject);
      if (examSet.indexOf(s.examName) === -1) examSet.push(s.examName);
    });
    $('#sc-subject', container).innerHTML = Utils.simpleOptions(subjectSet.sort(), state.subject, '全部科目');
    $('#sc-exam', container).innerHTML = Utils.simpleOptions(examSet.sort(), state.exam, '全部考试');

    // 统计卡片
    var avg = list.length ? Utils.round1(list.reduce(function (a, s) { return a + s.score; }, 0) / list.length) : '暂无';
    var max = list.length ? Math.max.apply(null, list.map(function (s) { return s.score; })) : '暂无';
    var min = list.length ? Math.min.apply(null, list.map(function (s) { return s.score; })) : '暂无';
    $('#sc-stats', container).innerHTML =
      UI.statCard('平均分', avg) +
      UI.statCard('最高分', max) +
      UI.statCard('最低分', min) +
      UI.statCard('成绩条数', list.length);

    // 表格（按分数降序 + 排名）
    if (!list.length) {
      $('#sc-table', container).innerHTML = UI.empty('暂无成绩记录，点击右上角「单条录入」或「批量录入」添加');
      return;
    }
    var sorted = list.slice().sort(function (a, b) { return b.score - a.score; });
    var rankMap = {};
    sorted.forEach(function (s, i) {
      // 同分并列：与上一位分数相同则沿用其名次
      rankMap[s.id] = (i > 0 && s.score === sorted[i - 1].score) ? rankMap[sorted[i - 1].id] : (i + 1);
    });

    var totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = sorted.slice(start, start + state.pageSize);

    var head = '<tr><th>排名</th><th>学生</th><th>班级</th><th>科目</th><th>考试</th><th>分数</th><th>考试日期</th><th class="th-ops">操作</th></tr>';
    var body = pageRows.map(function (s) {
      var rk = rankMap[s.id];
      var rkCls = rk === 1 ? ' rank-1' : (rk === 2 ? ' rank-2' : (rk === 3 ? ' rank-3' : ''));
      var stu = Store.getStudent(s.studentId);
      var scoreCls = s.score >= 90 ? 'score-hi' : (s.score < 60 ? 'score-lo' : '');
      return '<tr>' +
        '<td><span class="rank' + rkCls + '">' + rk + '</span></td>' +
        '<td><b>' + Utils.escapeHtml(stu ? stu.name : '未知学生') + '</b></td>' +
        '<td>' + Utils.escapeHtml(Store.className(s.classId)) + '</td>' +
        '<td>' + Utils.escapeHtml(s.subject) + '</td>' +
        '<td>' + Utils.escapeHtml(s.examName) + '</td>' +
        '<td><b class="' + scoreCls + '">' + s.score + '</b></td>' +
        '<td>' + Utils.escapeHtml(s.date) + '</td>' +
        '<td class="td-ops">' +
          '<button class="btn btn-sm btn-ghost" data-edit="' + s.id + '" type="button">编辑</button>' +
          '<button class="btn btn-sm btn-danger-ghost" data-del="' + s.id + '" type="button">删除</button>' +
        '</td></tr>';
    }).join('');
    $('#sc-table', container).innerHTML = UI.tableWrap(head, body) +
      UI.paginationHTML({ total: sorted.length, page: state.page, pageSize: state.pageSize });

    UI.bindPagination($('#sc-table', container), function (p) { state.page = p; render(); });
    $$('#sc-table [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openScoreModal(b.dataset.edit); });
    });
    $$('#sc-table [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delScore(b.dataset.del); });
    });
  }

  /* ---- 学生下拉选项（跟随班级联动） ---- */
  function studentOpts(classId, selectedId) {
    if (!classId) return '<option value="">请先选择班级</option>';
    var list = Store.list('students').filter(function (s) { return s.classId === classId; });
    if (!list.length) return '<option value="">该班级暂无学生</option>';
    return '<option value="">请选择学生</option>' + list.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' +
        Utils.escapeHtml(s.name + '（' + s.studentNo + '）') + '</option>';
    }).join('');
  }

  /* ---- 总评成绩合成（按平时 60% + 期末 40% 合成总评） ---- */
  function openFinalizeModal() {
    if (!state.classId) { Toast.warning('请先选择班级'); return; }
    UI.modal({
      title: '总评成绩合成 · ' + Store.className(state.classId),
      submitText: '一键合成',
      body:
        '<p style="color:var(--muted);font-size:12.5px;line-height:1.9;margin-bottom:14px">' +
        '依据教务口径将<b>平时成绩</b>（同科作业 + 随堂测验的平均分）和<b>期末成绩</b>按权重合成为<b>总评成绩</b>，作为成绩记录入库（参与绩点与学期统计）。' +
        '合成前提：该学期、该科目必须既有<b>期末成绩</b>，也有可用的<b>平时成绩</b>（作业批改或随堂测验），二者缺一的学生会被如实跳过并给出原因。</p>' +
        '<div class="form-grid">' +
          UI.formRow('学期', '<select id="f-final-term" class="input">' +
            UI.termFilter.list().map(function (t) {
              var sel = t === (state.term || Store.currentTerm());
              return '<option value="' + t + '"' + (sel ? ' selected' : '') + '>' + (t === Store.currentTerm() ? '本 · ' : '') + Store.termText(t) + '</option>';
            }).join('') + '</select>') +
          UI.formRow('期末考试名称', '<select id="f-final-exam" class="input">' +
            Array.from(new Set(Store.list('scores').filter(function (s) { return s.classId === state.classId; }).map(function (s) { return s.examName; })))
              .filter(function (n) { return n.indexOf('总评') !== 0 && n !== '期末补考'; })
              .map(function (n) { return '<option' + (n === '期末考试' ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>') +
          UI.formRow('平时 / 期末权重', '<span>平时 <input id="f-w-usual" type="number" min="0" max="100" step="5" value="60" style="width:60px"> % · 期末 <input id="f-w-final" type="number" min="0" max="100" step="5" value="40" style="width:60px"> %</span>') +
        '</div>',
      onSubmit(root, close) {
        var term = $('#f-final-term', root).value;
        var examName = $('#f-final-exam', root).value;
        var u = Number($('#f-w-usual', root).value);
        var f = Number($('#f-w-final', root).value);
        if (!examName) return Toast.warning('请选择期末考试名称');
        if (!u || !f || u + f !== 100) return Toast.error('权重之和必须为 100，且不能为 0');
        var r = Store.finalizeGrades(state.classId, term, examName, { weights: { usual: u / 100, final: f / 100 } });
        Store._log('成绩管理', '总评合成', Store.className(state.classId) + ' · ' + examName + ' · 平时' + u + '%/期末' + f + '% · 合成 ' + r.synthesized + ' 门');
        var msg = '已合成 ' + r.synthesized + ' 门总评成绩';
        if (r.skipped.length) {
          var reasons = {};
          r.skipped.forEach(function (s) { reasons[s.reason] = (reasons[s.reason] || 0) + 1; });
          msg += '；跳过 ' + r.skipped.length + ' 条（' + Object.keys(reasons).map(function (k) { return k + ' ' + reasons[k] + ' 条'; }).join('、') + '）';
        }
        Toast.success(msg);
        close();
        render();
      }
    });
  }

  /* ---- 单条录入 / 编辑 ---- */
  function openScoreModal(id) {
    var isEdit = !!id;
    var rec = isEdit ? Store.find('scores', id) : null;
    if (isEdit && !rec) return;
    var classes = Auth.visibleClasses(user);
    var model = rec || {
      classId: state.classId || (classes[0] ? classes[0].id : ''),
      studentId: '', subject: SUBJECTS[0], examName: '', score: '', credit: '', nature: '', date: Utils.today()
    };

    var mask = UI.modal({
      title: isEdit ? '编辑成绩' : '单条录入成绩',
      body:
        UI.formRow('班级', '<select id="f-class" class="input">' +
          UI.options(classes, 'id', function (c) { return c.name; }, model.classId, '请选择班级') + '</select>', true) +
        UI.formRow('学生', '<select id="f-student" class="input">' + studentOpts(model.classId, model.studentId) + '</select>', true) +
        '<div class="form-grid">' +
          UI.formRow('科目', '<select id="f-subject" class="input">' + Utils.simpleOptions(SUBJECTS, model.subject) + '</select>', true) +
          UI.formRow('考试名称', '<input id="f-exam" class="input" list="exam-datalist" value="' + Utils.escapeHtml(model.examName) + '" placeholder="如：期末考试">' +
            '<datalist id="exam-datalist">' + distinctExams().map(function (e) { return '<option value="' + Utils.escapeHtml(e) + '">'; }).join('') + '</datalist>', true) +
          UI.formRow('分数', '<input id="f-score" class="input" type="number" min="0" max="100" step="0.5" value="' + Utils.escapeHtml(model.score) + '">', true) +
          UI.formRow('学分（选填）', '<input id="f-credit" class="input" type="number" min="0" max="20" step="0.5" value="' + Utils.escapeHtml(model.credit || '') + '" placeholder="如：3（不填不影响成绩统计，仅影响绩点）">') +
          UI.formRow('课程性质', '<select id="f-nature" class="input"><option value="">未标注</option>' +
            ['必修', '选修'].map(function (n) { return '<option' + (model.nature === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>') +
          UI.formRow('考试日期', '<input id="f-date" class="input" type="date" value="' + Utils.escapeHtml(model.date) + '">', true) +
        '</div>',
      onSubmit(root, close) {
        var studentId = $('#f-student', root).value;
        var subject = $('#f-subject', root).value;
        var examName = $('#f-exam', root).value.trim();
        var scoreVal = $('#f-score', root).value.trim();
        var creditVal = $('#f-credit', root).value.trim();
        var nature = $('#f-nature', root).value;
        var date = $('#f-date', root).value;
        // 表单验证
        if (!studentId) return Toast.warning('请选择学生');
        if (!examName) return Toast.warning('请输入考试名称');
        if (scoreVal === '' || isNaN(Number(scoreVal))) return Toast.warning('请输入分数');
        var score = Number(scoreVal);
        if (score < 0 || score > 100) return Toast.error('分数需在 0 ~ 100 之间');
        if (creditVal !== '' && (isNaN(Number(creditVal)) || Number(creditVal) <= 0)) return Toast.error('学分需为正数');
        if (!date) return Toast.warning('请选择考试日期');
        var stu = Store.getStudent(studentId);
        // 学期由考试日期自动推算（8月起为学年第一学期，2—7月为第二学期）
        var data = {
          studentId: studentId, classId: stu ? stu.classId : model.classId,
          subject: subject, examName: examName, score: score,
          credit: creditVal === '' ? '' : Number(creditVal), nature: nature,
          date: date, term: Store.termOfDate(date)
        };
        if (isEdit) {
          Store.update('scores', id, data);
          Toast.success('成绩已更新');
        } else {
          Store.add('scores', data);
          Toast.success('成绩录入成功');
        }
        close();
        render();
      }
    });

    // 切换班级时联动刷新学生下拉
    $('#f-class', mask).addEventListener('change', function () {
      $('#f-student', mask).innerHTML = studentOpts(this.value, '');
    });
  }

  /* ---- 批量录入：选班级 + 考试 + 科目，给全班学生填分 ---- */
  function openBatchModal() {
    var classes = Auth.visibleClasses(user);
    if (!classes.length) { Toast.warning('暂无可用班级'); return; }
    var defClass = state.classId || classes[0].id;

    var mask = UI.modal({
      title: '批量录入成绩',
      wide: true,
      submitText: '保存全部',
      body:
        '<div class="batch-head">' +
          UI.formRow('班级', '<select id="b-class" class="input">' +
            UI.options(classes, 'id', function (c) { return c.name; }, defClass, '请选择班级') + '</select>', true) +
          '<div class="form-grid">' +
            UI.formRow('考试名称', '<input id="b-exam" class="input" list="batch-exam-list" placeholder="如：期末考试">' +
              '<datalist id="batch-exam-list">' + distinctExams().map(function (e) { return '<option value="' + Utils.escapeHtml(e) + '">'; }).join('') + '</datalist>', true) +
            UI.formRow('科目', '<select id="b-subject" class="input">' + Utils.simpleOptions(SUBJECTS, defaultSubject()) + '</select>', true) +
            UI.formRow('学分（选填）', '<input id="b-credit" class="input" type="number" min="0" max="20" step="0.5" placeholder="如：3（可留空，先录分数）">') +
            UI.formRow('课程性质', '<select id="b-nature" class="input"><option value="">未标注</option><option>必修</option><option>选修</option></select>') +
            UI.formRow('考试日期', '<input id="b-date" class="input" type="date" value="' + Utils.today() + '">', true) +
          '</div>' +
        '</div>' +
        '<p style="color:var(--muted);font-size:12px;margin:0 0 8px">提示：按学生顺序填分，<b>Enter 跳到下一位</b>；留空表示该生缺考/暂不录入。</p>' +
        '<div id="b-rows">' + UI.empty('请先填写考试名称') + '</div>',
      onSubmit(root, close) {
        var classId = $('#b-class', root).value;
        var examName = $('#b-exam', root).value.trim();
        var subject = $('#b-subject', root).value;
        var creditVal = $('#b-credit', root).value.trim();
        var nature = $('#b-nature', root).value;
        var date = $('#b-date', root).value || Utils.today();
        if (!classId) return Toast.warning('请选择班级');
        if (!examName) return Toast.warning('请输入考试名称');
        if (creditVal !== '' && (isNaN(Number(creditVal)) || Number(creditVal) < 0)) return Toast.warning('学分需为非负数字（可留空）');
        // 收集并校验所有已填写的分数
        var inputs = $$('input[data-stu]', root);
        var updates = [];
        for (var i = 0; i < inputs.length; i++) {
          var v = inputs[i].value.trim();
          if (v === '') continue; // 留空表示该生缺考/暂不录入
          var n = Number(v);
          if (isNaN(n) || n < 0 || n > 100) {
            return Toast.error('有分数超出 0 ~ 100 范围，请检查后重试');
          }
          updates.push({ studentId: inputs[i].dataset.stu, score: n });
        }
        if (!updates.length) return Toast.warning('请至少填写一个分数');
        // 批量保存：已存在（同学生+同考试+同科目）则更新，否则新增
        var arr = Store.list('scores');
        var credit = Number(creditVal);
        var term = Store.termOfDate(date);
        updates.forEach(function (u) {
          // 同一学生 + 同科目 + 同考试名 + 同学期 才算同一条记录，避免跨学期互相覆盖
          var rec = arr.find(function (x) {
            return x.studentId === u.studentId && x.examName === examName && x.subject === subject &&
              (x.term || term) === term;
          });
          if (rec) {
            rec.score = u.score;
            rec.date = date;
            rec.term = Store.termOfDate(date);
            rec.credit = credit;
            rec.nature = nature;
          } else {
            arr.push({ id: Utils.uid(), studentId: u.studentId, classId: classId, subject: subject, examName: examName, score: u.score, credit: credit, nature: nature, date: date, term: term, createdAt: new Date().toISOString() });
          }
        });
        Store.save('scores', arr);
        Store._log('成绩管理', '批量录入', Store.className(classId) + ' · ' + subject + ' · ' + examName + ' · ' + updates.length + ' 条');
        Toast.success('已保存 ' + updates.length + ' 条成绩');
        close();
        render();
      }
    });

    var rowsEl = $('#b-rows', mask);

    /** 根据当前班级/考试/科目渲染学生分数输入行（已有成绩自动带出） */
    function renderRows() {
      var classId = $('#b-class', mask).value;
      var examName = $('#b-exam', mask).value.trim();
      var subject = $('#b-subject', mask).value;
      var term = Store.termOfDate($('#b-date', mask).value || Utils.today());
      if (!classId) { rowsEl.innerHTML = UI.empty('请选择班级'); return; }
      var students = Store.list('students').filter(function (s) { return s.classId === classId; })
        .sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
      if (!students.length) { rowsEl.innerHTML = UI.empty('该班级暂无学生'); return; }
      // 已有成绩映射（考试与科目都填了才带出）
      var existing = {};
      if (examName && subject) {
        Store.list('scores').forEach(function (s) {
          if (s.classId === classId && s.examName === examName && s.subject === subject &&
              (s.term || term) === term) existing[s.studentId] = s.score;
        });
      }
      rowsEl.innerHTML = '<div class="batch-grid">' + students.map(function (s) {
        return '<div class="batch-item">' +
          '<label>' + Utils.escapeHtml(s.name) + '<small>' + Utils.escapeHtml(s.studentNo) + '</small></label>' +
          '<input class="input" type="number" min="0" max="100" step="0.5" data-stu="' + s.id + '" value="' + (existing[s.id] !== undefined ? existing[s.id] : '') + '">' +
        '</div>';
      }).join('') + '</div>';
    }

    $('#b-class', mask).addEventListener('change', renderRows);
    $('#b-subject', mask).addEventListener('change', renderRows);
    $('#b-exam', mask).addEventListener('input', Utils.debounce(renderRows, 300));
    renderRows();

    /** 录入节奏：填完一格按 Enter 直接跳到下一位学生（教师高频操作，手不用离开数字键区）；
     *  最后一位按 Enter 聚焦「保存全部」，直接回车即可提交 */
    $$('#b-rows input[data-stu]', mask).forEach(function (inp, idx, all) {
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var next = all[idx + 1];
        if (next) { next.focus(); next.select && next.select(); }
        else { var ok = mask.querySelector('.modal-footer [data-act="ok"]'); if (ok) ok.focus(); }
      });
    });
  }

  /* ---- 删除单条成绩（二次确认） ---- */
  function delScore(id) {
    var rec = Store.find('scores', id);
    if (!rec) return;
    var stu = Store.getStudent(rec.studentId);
    UI.confirm({
      title: '删除成绩',
      message: '确定要删除「' + (stu ? stu.name : '未知学生') + '」的' + rec.subject + '（' + rec.examName + '）成绩吗？此操作不可恢复！',
      onOk() {
        Store.remove('scores', id);
        Toast.success('成绩记录已删除');
        render();
      }
    });
  }

  /* ---- 成绩单打印：按班级 + 考试生成透视表（学生 × 科目）后调用系统打印 ---- */
  function openPrintModal() {
    var classes = Auth.visibleClasses(user);
    if (!classes.length) { Toast.warning('暂无可用班级'); return; }
    var exams = distinctExams();
    if (!exams.length) { Toast.warning('暂无考试数据，请先录入成绩'); return; }

    UI.modal({
      title: '打印成绩单',
      body: '<div class="form-grid">' +
        UI.formRow('班级', '<select id="p-class" class="input">' +
          UI.options(classes, 'id', function (c) { return c.name; }, state.classId || classes[0].id, '请选择班级') + '</select>', true) +
        UI.formRow('考试名称', '<input id="p-exam" class="input" list="print-exam-list" placeholder="如：期末考试">' +
          '<datalist id="print-exam-list">' + exams.map(function (e) { return '<option value="' + Utils.escapeHtml(e) + '">'; }).join('') + '</datalist>', true) +
        '</div>' +
        '<p style="color:var(--muted);font-size:12px">将生成「学生 × 科目」成绩总表（含总分、平均分、班级排名），通过浏览器打印为纸质或 PDF 成绩单。</p>',
      submitText: '生 成 并 打 印',
      onSubmit(root, close) {
        var classId = $('#p-class', root).value;
        var examName = $('#p-exam', root).value.trim();
        if (!classId) return Toast.warning('请选择班级');
        if (!examName) return Toast.warning('请输入考试名称');
        buildPrintArea(classId, examName);
        close();
        // 等待打印区渲染完成后再唤起打印
        setTimeout(function () { window.print(); }, 150);
        Store._log('成绩管理', '打印成绩单', Store.className(classId) + ' ' + examName);
      }
    });
  }

  /** 生成打印区域内容（@media print 时仅显示该区域） */
  function buildPrintArea(classId, examName) {
    var students = Store.list('students').filter(function (s) { return s.classId === classId; })
      .sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
    var recs = Store.list('scores').filter(function (s) {
      return s.classId === classId && s.examName === examName;
    });
    // 科目列按固定顺序
    var subSet = [];
    recs.forEach(function (r) { if (subSet.indexOf(r.subject) === -1) subSet.push(r.subject); });
    subSet.sort(function (a, b) { return SUBJECTS.indexOf(a) - SUBJECTS.indexOf(b); });

    var perStu = {};
    recs.forEach(function (r) {
      if (!perStu[r.studentId]) perStu[r.studentId] = {};
      perStu[r.studentId][r.subject] = r.score;
    });

    var rowsData = students.map(function (s) {
      var m = perStu[s.id] || {};
      var total = 0, has = false;
      var cells = subSet.map(function (sub) {
        if (m[sub] === undefined) return '—';
        total += m[sub];
        has = true;
        return m[sub];
      });
      return { stu: s, cells: cells, total: has ? total : null };
    });
    // 总分班级排名（仅统计有成绩的学生，同分同名次）
    var ranked = rowsData.filter(function (r) { return r.total !== null; })
      .sort(function (a, b) { return b.total - a.total; });
    var rankMap = {};
    ranked.forEach(function (r, i) {
      rankMap[r.stu.id] = (i > 0 && r.total === ranked[i - 1].total) ? rankMap[ranked[i - 1].stu.id] : (i + 1);
    });

    var head = '<tr><th>学号</th><th>姓名</th>' + subSet.map(function (sub) { return '<th>' + Utils.escapeHtml(sub) + '</th>'; }).join('') +
      '<th>总分</th><th>平均分</th><th>班级排名</th></tr>';
    var body = rowsData.map(function (r) {
      var avgTxt = r.total === null ? '—' : Utils.round1(r.total / subSet.length);
      return '<tr><td>' + Utils.escapeHtml(r.stu.studentNo) + '</td><td>' + Utils.escapeHtml(r.stu.name) + '</td>' +
        r.cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') +
        '<td>' + (r.total === null ? '—' : r.total) + '</td><td>' + avgTxt + '</td>' +
        '<td>' + (rankMap[r.stu.id] || '—') + '</td></tr>';
    }).join('');

    // 打印区（常驻 body 下，打印时仅显示这一块——见 UI.printArea 注释）
    var area = UI.printArea();
    var colCount = subSet.length + 5;   // 学号、姓名 + 科目 + 总分、平均分、班级排名
    // 与升学·就业材料共用同一套打印版式：标题 + 副标题 + 一张连续表格（含落款行）
    area.innerHTML =
      '<h2>' + Utils.escapeHtml(Store.className(classId)) + ' ' + Utils.escapeHtml(examName) + ' 成绩单</h2>' +
      '<div class="print-meta">武汉晴川学院 · 计算机学院</div>' +
      '<div class="print-meta">' + Utils.escapeHtml(examName) + ' ｜ 参考人数 ' + ranked.length + ' 人 ｜ 科目：' + Utils.escapeHtml(subSet.join('、')) + '</div>' +
      '<table><thead>' + head + '</thead><tbody>' + body +
        '<tr class="pr-sign"><th colspan="' + colCount + '">任课教师（签字）：________________　教研室审核（盖章）：________________　打印时间：' +
          Utils.escapeHtml(Utils.nowStr()) + '</th></tr>' +
      '</tbody></table>';
  }
};
