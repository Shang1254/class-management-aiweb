/* =====================================================
 * 请假审批（管理员 / 教师，教师限任教班级）
 * - 学生在「我的考勤」提交请假申请（起止日期 + 事由）
 * - 教师在这里审批：批准后自动为学生写入请假期间的考勤（按工作日：跳过周末与法定节假日）
 * - 状态流转：待审批 → 已批准 / 已驳回（驳回需填写理由）
 * - 全程写入操作日志，可追溯审批人与审批时间
 * ===================================================== */

Pages['leave-approve'] = function (container, user) {
  var scopeIds = Auth.scopeClassIds(user);

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">请假审批</div>' +
        '<div class="toolbar-actions">' +
          '<select id="lv-status" class="input">' +
            '<option value="待审批">待审批</option>' +
            '<option value="已批准">已批准</option>' +
            '<option value="已驳回">已驳回</option>' +
            '<option value="">全部状态</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div id="lv-stats" class="att-summary"></div>' +
      '<div id="lv-list"></div>' +
    '</div>';

  $('#lv-status', container).addEventListener('change', render);

  render();

  /* ---- 数据范围：教师限任教班级，管理员全部 ---- */
  function scopedLeaves() {
    return Store.list('leaves')
      .filter(function (lv) { return scopeIds.indexOf(lv.classId) !== -1; })
      .sort(function (a, b) {
        // 待审批在前，其余按提交时间倒序
        if ((a.status === '待审批') !== (b.status === '待审批')) return a.status === '待审批' ? -1 : 1;
        return String(b.submitTime || '').localeCompare(String(a.submitTime || ''));
      });
  }

  /** 学生显示名：姓名（学号）+ 招生类别徽章 */
  function studentHTML(lv) {
    var stu = Store.getStudent(lv.studentId);
    if (!stu) return '<b>未知学生</b>';
    return '<b>' + Utils.escapeHtml(stu.name) + '</b>（' + Utils.escapeHtml(stu.studentNo) + '）' +
      ' ' + UI.enrollBadge(stu.enrollType);
  }

  /** 请假天数（自然日，含首尾） */
  function daysBetween(a, b) {
    var s = new Date(a + 'T00:00:00'), e = new Date(b + 'T00:00:00');
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
  }

  function render() {
    var all = scopedLeaves();
    var pend = all.filter(function (lv) { return lv.status === '待审批'; }).length;
    var ok = all.filter(function (lv) { return lv.status === '已批准'; }).length;
    var no = all.filter(function (lv) { return lv.status === '已驳回'; }).length;
    $('#lv-stats', container).innerHTML =
      '<span class="chip chip-warn">待审批 <b>' + pend + '</b></span>' +
      '<span class="chip chip-ok">已批准 <b>' + ok + '</b></span>' +
      '<span class="chip chip-bad">已驳回 <b>' + no + '</b></span>';

    var filter = $('#lv-status', container).value;
    var list = filter ? all.filter(function (lv) { return lv.status === filter; }) : all;
    if (!list.length) {
      $('#lv-list', container).innerHTML = UI.empty(filter ? '暂无「' + filter + '」的请假申请' : '暂无请假申请');
      return;
    }

    $('#lv-list', container).innerHTML = list.map(function (lv) {
      var ops = '';
      if (lv.status === '待审批') {
        ops = '<button class="btn btn-sm btn-primary" data-ok="' + lv.id + '" type="button">批准</button>' +
              '<button class="btn btn-sm btn-danger-ghost" data-no="' + lv.id + '" type="button">驳回</button>';
      }
      var reviewLine = '';
      if (lv.status === '已批准') {
        reviewLine = '<span>' + UI.badge('已批准', 'success') + ' 审批人：' + Utils.escapeHtml(lv.reviewer || '—') + ' ' + Utils.escapeHtml(lv.reviewTime || '') + '</span>';
      } else if (lv.status === '已驳回') {
        reviewLine = '<span>' + UI.badge('已驳回', 'danger') + ' 审批人：' + Utils.escapeHtml(lv.reviewer || '—') +
          (lv.reviewNote ? '｜理由：' + Utils.escapeHtml(lv.reviewNote) : '') + '</span>';
      } else {
        reviewLine = '<span>' + UI.badge('待审批', 'warning') + '</span>';
      }
      return '<div class="notice-card">' +
        '<div class="notice-head">' +
          '<span class="notice-title">' + studentHTML(lv) + '</span>' +
          UI.badge('共 ' + daysBetween(lv.startDate, lv.endDate) + ' 天' +
            (typeof CnCalendar !== 'undefined'
              ? ' · 工作日 ' + CnCalendar.workdaysBetween(lv.startDate, lv.endDate) + ' 天'
              : ''), 'info') +
        '</div>' +
        '<div class="notice-content">' + Utils.escapeHtml(lv.reason || '（未填写事由）') + '</div>' +
        '<div class="notice-meta">' +
          '<span>' + Utils.escapeHtml(Store.className(lv.classId)) + '</span>' +
          '<span>' + Utils.escapeHtml(lv.startDate) + ' 至 ' + Utils.escapeHtml(lv.endDate) + '</span>' +
          '<span>提交于 ' + Utils.escapeHtml(lv.submitTime || '') + '</span>' +
          reviewLine + (ops ? '<span style="display:flex;gap:6px;margin-left:auto">' + ops + '</span>' : '') +
        '</div></div>';
    }).join('');

    // 审批事件
    $$('#lv-list [data-ok]', container).forEach(function (b) {
      b.addEventListener('click', function () { approve(b.dataset.ok); });
    });
    $$('#lv-list [data-no]', container).forEach(function (b) {
      b.addEventListener('click', function () { reject(b.dataset.no); });
    });
  }

  /** 批准：更新状态 + 为请假期间（按工作日）写入「请假」考勤 */
  function approve(id) {
    var lv = Store.find('leaves', id);
    if (!lv || lv.status !== '待审批') return;
    var stu = Store.getStudent(lv.studentId);
    UI.confirm({
      title: '批准请假',
      message: '确定批准 ' + (stu ? stu.name : '该学生') + ' ' + lv.startDate + ' 至 ' + lv.endDate +
        ' 的请假申请吗？\n批准后将自动为其写入请假期间的「请假」考勤（按工作日：跳过周末与法定节假日）。',
      onOk() {
        Store.update('leaves', id, {
          status: '已批准',
          reviewer: user.name || user.username,
          reviewTime: Utils.nowStr(),
          reviewNote: ''
        });
        // 联动考勤：区间内每个工作日 upsert 一条「请假」记录
        // （工作日 = 排除周末与法定节假日，计入调休上班日，经 CnCalendar 计算）
        var arr = Store.list('attendance');
        var cur = new Date(lv.startDate + 'T00:00:00');
        var end = new Date(lv.endDate + 'T00:00:00');
        var wrote = 0;
        while (cur <= end) {
          var ds = Utils.formatDate(cur); // 本地日期，避免 toISOString 的时区偏移
          var isWork = (typeof CnCalendar !== 'undefined') ? CnCalendar.isWorkday(ds) : (cur.getDay() !== 0 && cur.getDay() !== 6);
          if (isWork) {
            var rec = arr.find(function (a) {
              return a.studentId === lv.studentId && a.date === ds && a.classId === lv.classId;
            });
            if (rec) {
              rec.status = '请假';
            } else {
              arr.push({
                id: Utils.uid(), date: ds, classId: lv.classId, studentId: lv.studentId,
                status: '请假', term: Store.termOfDate(ds), createdAt: new Date().toISOString()
              });
            }
            wrote++;
          }
          cur.setDate(cur.getDate() + 1);
        }
        Store.save('attendance', arr);
        Store._log('请假审批', '批准', (stu ? stu.name : '') + ' ' + lv.startDate + ' 至 ' + lv.endDate + '，联动考勤 ' + wrote + ' 天');
        Toast.success('已批准，并写入 ' + wrote + ' 天请假考勤');
        render();
      }
    });
  }

  /** 驳回：需填写理由 */
  function reject(id) {
    var lv = Store.find('leaves', id);
    if (!lv || lv.status !== '待审批') return;
    var stu = Store.getStudent(lv.studentId);
    UI.modal({
      title: '驳回请假申请',
      submitText: '确认驳回',
      body: '<p style="margin-bottom:12px;line-height:1.8">' +
          (stu ? Utils.escapeHtml(stu.name) : '该学生') + '（' + Utils.escapeHtml(lv.startDate) + ' 至 ' + Utils.escapeHtml(lv.endDate) + '）：<br>' +
          Utils.escapeHtml(lv.reason || '') + '</p>' +
        UI.formRow('驳回理由', '<textarea id="f-note" class="input" rows="3" placeholder="请填写驳回理由，将展示给学生（选填）"></textarea>'),
      onSubmit(root, close) {
        Store.update('leaves', id, {
          status: '已驳回',
          reviewer: user.name || user.username,
          reviewTime: Utils.nowStr(),
          reviewNote: $('#f-note', root).value.trim()
        });
        Toast.success('已驳回该请假申请');
        close();
        render();
      }
    });
  }
};
