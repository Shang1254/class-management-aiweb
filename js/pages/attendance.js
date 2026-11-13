/* =====================================================
 * 考勤管理（管理员 / 教师，教师限本班）
 * - 按日期 + 班级记录考勤，状态：出勤 / 迟到 / 请假 / 缺勤
 * - 支持逐个学生快捷标记、全班批量录入
 * - 统计当日各状态人数与出勤率，展示近 7 天出勤率趋势
 * ===================================================== */

Pages.attendance = function (container, user) {
  var classes = Auth.visibleClasses(user);
  var scopeIds = Auth.scopeClassIds(user);
  var state = {
    date: Utils.today(),
    classId: Auth.isTeacher(user) ? (Auth.teacherClassIds(user)[0] || '') : (classes[0] ? classes[0].id : '')
  };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">每日考勤</div>' +
        '<div class="toolbar-actions">' +
          '<input type="date" id="att-date" class="input" value="' + state.date + '">' +
          '<select id="att-class" class="input">' +
            UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '请选择班级') +
          '</select>' +
          '<button id="btn-att-signin" class="btn btn-ghost" type="button">发起签到</button>' +
          '<button id="btn-att-batch" class="btn btn-primary" type="button">录入考勤</button>' +
          (Auth.isAdmin(user) || Auth.isCounselor(user) ? '<button id="btn-att-clear-day" class="btn btn-danger-ghost" type="button">清空当日记录</button>' : '') +
        '</div>' +
      '</div>' +
      '<div id="att-signin"></div>' +
      '<div id="att-stats"></div>' +
      '<div id="att-table"></div>' +
    '</div>' +
    '<div class="card"><div class="chart-title">近7天出勤率</div><div id="att-trend"></div></div>';

  /* ---- 工具栏事件 ---- */

  $('#btn-att-clear-day', container).addEventListener('click', function () {
    var list = Store.list('attendance').filter(function (a) {
      return a.date === state.date && a.classId === state.classId;
    });
    if (!list.length) { Toast.warning(Store.className(state.classId) + ' 在 ' + state.date + ' 没有考勤记录'); return; }
    UI.confirm({
      title: '清空当日考勤记录',
      message: '将删除 ' + Store.className(state.classId) + ' 在 ' + state.date + ' 的 ' + list.length +
        ' 条考勤记录（该日考勤统计随之清零）。此操作不可恢复，确定吗？',
      onOk() {
        var ids = {};
        list.forEach(function (a) { ids[a.id] = true; });
        Store.save('attendance', Store.list('attendance').filter(function (a) { return !ids[a.id]; }));
        Store._log('考勤管理', '清空当日记录', Store.className(state.classId) + ' · ' + state.date + ' · ' + list.length + ' 条');
        Toast.success('已清空 ' + list.length + ' 条考勤记录');
        render();
      }
    });
  });
  $('#att-date', container).addEventListener('change', function () {
    state.date = this.value || Utils.today();
    render();
  });
  $('#att-class', container).addEventListener('change', function () {
    state.classId = this.value;
    render();
  });
  $('#btn-att-batch', container).addEventListener('click', openBatchModal);
  $('#btn-att-signin', container).addEventListener('click', openSigninModal);

  /* ---- 课堂签到：发起限时签到码，学生端输码自助签到 ---- */
  function renderSigninPanel() {
    var el = $('#att-signin', container);
    if (!el) return;
    var now = Date.now();
    var actives = Store.list('signins').filter(function (s) {
      return s.classId === state.classId && s.expiresAt > now;
    });
    if (!actives.length) { el.innerHTML = ''; return; }
    var total = Store.list('students').filter(function (s) { return s.classId === state.classId; }).length;
    el.innerHTML = actives.map(function (s) {
      var remain = Math.max(0, Math.ceil((s.expiresAt - now) / 60000));
      return '<div class="signin-bar">' +
        '<span class="signin-dot"></span><b>课堂签到进行中</b>' +
        '<span>签到码 <b class="signin-code-txt">' + Utils.escapeHtml(s.code) + '</b></span>' +
        '<span class="chip chip-ok">剩余约 <b>' + remain + '</b> 分钟</span>' +
        '<span class="chip chip-info">已签 <b>' + s.signed.length + '/' + total + '</b> 人</span>' +
        '<button class="btn btn-sm btn-danger-ghost signin-end" data-id="' + s.id + '" type="button">手动结束</button>' +
      '</div>';
    }).join('');
    $$('.signin-end', el).forEach(function (b) {
      b.addEventListener('click', function () {
        Store.remove('signins', b.dataset.id);
        Store._log('课堂签到', '手动结束', Store.className(state.classId));
        Toast.info('签到已结束');
        renderSigninPanel();
      });
    });
  }

  function openSigninModal() {
    if (!state.classId) { Toast.warning('请先选择班级'); return; }
    if (activeSignin(state.classId)) return Toast.warning('该班级已有进行中的签到，请先手动结束');
    UI.modal({
      title: '发起课堂签到 · ' + Store.className(state.classId),
      submitText: '发起签到',
      body: UI.formRow('有效时长', '<select id="f-duration" class="input">' +
        [5, 10, 15, 20].map(function (m) { return '<option value="' + m + '"' + (m === 10 ? ' selected' : '') + '>' + m + ' 分钟</option>'; }).join('') + '</select>') +
        '<p style="color:var(--muted);font-size:12px;line-height:1.8">发起后系统生成 6 位签到码，学生在「我的考勤 / 仪表盘」的签到横幅中输入签到码即完成签到，考勤自动记为「出勤」。超过时长签到自动失效。</p>',
      onSubmit(root, close) {
        var min = Number($('#f-duration', root).value);
        var code = String(Math.floor(100000 + Math.random() * 900000));
        Store.add('signins', {
          code: code, classId: state.classId,
          date: Utils.today(), term: Store.termOfDate(Utils.today()),
          expiresAt: Date.now() + min * 60000, signed: [], createdBy: user.id
        });
        Store._log('课堂签到', '发起', Store.className(state.classId) + '，有效期 ' + min + ' 分钟');
        close();
        render();
        renderSigninPanel();
        // 再次弹出展示签到码（大字）
        UI.modal({
          title: '签到码已生成',
          body: '<div style="text-align:center;padding:10px 0">' +
            '<div style="font-family:var(--serif);font-size:44px;letter-spacing:14px;font-weight:700;color:var(--navy,#16337a)">' + code + '</div>' +
            '<p style="color:var(--muted);font-size:13px;margin-top:8px">请将签到码公布给学生，有效期 ' + min + ' 分钟<br>（也可在考勤页顶部查看与结束签到）</p></div>',
          submitText: '知道了',
          onSubmit(root, close) { close(); }
        });
      }
    });
  }

  if (!classes.length || !state.classId) {
    $('#att-stats', container).innerHTML = UI.empty('暂无班级，请先在「班级管理」中创建班级');
    $('#att-table', container).innerHTML = '';
    $('#att-trend', container).innerHTML = UI.empty('暂无数据');
    return;
  }

  render();
  renderTrend();

  /* ---- 主渲染：统计 + 学生考勤表 ---- */
  function render() {
    var students = Store.list('students').filter(function (s) { return s.classId === state.classId; })
      .sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
    var recs = Store.list('attendance').filter(function (a) {
      return a.date === state.date && a.classId === state.classId;
    });
    var recMap = {};
    recs.forEach(function (r) { recMap[r.studentId] = r; });

    // 统计
    var counts = { '出勤': 0, '迟到': 0, '请假': 0, '缺勤': 0 };
    recs.forEach(function (r) { if (counts[r.status] !== undefined) counts[r.status]++; });
    var total = students.length;
    var rate = total ? Math.round(counts['出勤'] / total * 100) + '%' : '—';
    $('#att-stats', container).innerHTML =
      '<div class="att-summary">' +
        '<span class="chip">应到 <b>' + total + '</b></span>' +
        '<span class="chip chip-ok">出勤 <b>' + counts['出勤'] + '</b></span>' +
        '<span class="chip chip-warn">迟到 <b>' + counts['迟到'] + '</b></span>' +
        '<span class="chip chip-info">请假 <b>' + counts['请假'] + '</b></span>' +
        '<span class="chip chip-bad">缺勤 <b>' + counts['缺勤'] + '</b></span>' +
        '<span class="chip">出勤率 <b>' + rate + '</b></span>' +
      '</div>';

    if (!students.length) {
      $('#att-table', container).innerHTML = UI.empty('该班级暂无学生');
      return;
    }

    var head = '<tr><th>学号</th><th>姓名</th><th>考勤状态（更改后立即保存）</th></tr>';
    var statusList = ['', '出勤', '迟到', '请假', '缺勤'];
    var body = students.map(function (s) {
      var rec = recMap[s.id];
      var val = rec ? rec.status : '';
      var sel = '<select class="input att-select" data-stu="' + s.id + '">' +
        statusList.map(function (op) {
          return '<option value="' + op + '"' + (op === val ? ' selected' : '') + '>' + (op || '未记录') + '</option>';
        }).join('') + '</select>';
      return '<tr><td>' + Utils.escapeHtml(s.studentNo) + '</td><td><b>' + Utils.escapeHtml(s.name) + '</b></td><td>' + sel + '</td></tr>';
    }).join('');
    $('#att-table', container).innerHTML = UI.tableWrap(head, body);

    // 每行状态下拉：更改即保存
    $$('.att-select', container).forEach(function (sel) {
      sel.addEventListener('change', function () {
        setStatus(sel.dataset.stu, sel.value);
      });
    });
    renderSigninPanel();
  }

  /** 记录 / 修改 / 清除单个学生的考勤 */
  function setStatus(studentId, status) {
    var stu = Store.getStudent(studentId);
    var name = stu ? stu.name : '学生';
    var arr = Store.list('attendance');
    var rec = arr.find(function (a) {
      return a.date === state.date && a.classId === state.classId && a.studentId === studentId;
    });
    if (!status) {
      if (rec) {
        Store.save('attendance', arr.filter(function (a) { return a.id !== rec.id; }));
        Toast.info(name + ' 的考勤记录已清除');
      }
    } else if (rec) {
      Store.update('attendance', rec.id, { status: status });
      Toast.success(name + ' 已记为「' + status + '」');
    } else {
      Store.add('attendance', { date: state.date, classId: state.classId, studentId: studentId, status: status, term: Store.termOfDate(state.date) });
      Toast.success(name + ' 已记为「' + status + '」');
    }
    render();
  }

  /* ---- 全班批量录入弹窗 ---- */
  function openBatchModal() {
    if (!state.classId) { Toast.warning('请先选择班级'); return; }
    var students = Store.list('students').filter(function (s) { return s.classId === state.classId; })
      .sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
    if (!students.length) { Toast.warning('该班级暂无学生'); return; }

    // 已有记录映射，弹窗内回显
    var recMap = {};
    Store.list('attendance').forEach(function (a) {
      if (a.date === state.date && a.classId === state.classId) recMap[a.studentId] = a.status;
    });

    var statusList = ['出勤', '迟到', '请假', '缺勤'];
    var rowsHTML = students.map(function (s) {
      var cur = recMap[s.id] || '出勤';
      return '<div class="att-row">' +
        '<span class="att-name">' + Utils.escapeHtml(s.name) + ' <small style="color:var(--muted)">' + Utils.escapeHtml(s.studentNo) + '</small></span>' +
        '<div class="att-opts">' +
          statusList.map(function (st) {
            return '<label class="radio"><input type="radio" name="att-' + s.id + '" value="' + st + '"' + (st === cur ? ' checked' : '') + '>' + st + '</label>';
          }).join('') +
        '</div></div>';
    }).join('');

    var mask = UI.modal({
      title: '录入考勤 — ' + Store.className(state.classId) + ' · ' + state.date,
      wide: true,
      submitText: '保存考勤',
      body:
        '<div class="batch-tools"><button id="btn-all-present" class="btn btn-sm btn-ghost" type="button">全部标为出勤</button></div>' +
        rowsHTML,
      onSubmit(root, close) {
        // 一次性收集全班单选结果并保存
        var arr = Store.list('attendance');
        students.forEach(function (s) {
          var checked = $('input[name="att-' + s.id + '"]:checked', root);
          if (!checked) return;
          var v = checked.value;
          var rec = arr.find(function (a) {
            return a.date === state.date && a.classId === state.classId && a.studentId === s.id;
          });
          if (rec) {
            rec.status = v;
          } else {
            arr.push({ id: Utils.uid(), date: state.date, classId: state.classId, studentId: s.id, status: v, term: Store.termOfDate(state.date), createdAt: new Date().toISOString() });
          }
        });
        Store.save('attendance', arr);
        Toast.success('考勤保存成功');
        close();
        render();
        renderTrend();
      }
    });

    // 快捷：全部标为出勤
    $('#btn-all-present', mask).addEventListener('click', function () {
      students.forEach(function (s) {
        var radio = $('input[name="att-' + s.id + '"][value="出勤"]', mask);
        if (radio) radio.checked = true;
      });
    });
  }

  /* ---- 近 7 天出勤率趋势 ---- */
  function renderTrend() {
    var items = [];
    for (var d = 6; d >= 0; d--) {
      var ds = Utils.daysAgo(d);
      var recs = Store.list('attendance').filter(function (a) {
        return a.date === ds && scopeIds.indexOf(a.classId) !== -1;
      });
      items.push({
        label: ds.slice(5),
        value: recs.length ? Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100) : 0,
        suffix: '%'
      });
    }
    $('#att-trend', container).innerHTML = UI.barChart(items);
  }
};
