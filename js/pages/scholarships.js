/* =====================================================
 * 奖助管理（辅导员 / 管理员专属端口）
 * 奖助体系（依据学校学生工作处公开文件整理）：
 * - 国家奖学金 10000 元/年（大二以上，专升本自本科第二年起可申请）
 * - 国家励志奖学金 6000 元/年；国家助学金分档（困境认定：一般困难/困难/特别困难）
 * - 校级：晴川奖学金甲/乙/丙等 3000/2000/1000；晴川助学金甲/乙等 1500/1000
 * 支持：按奖项筛选、登记/编辑/删除、金额统计、CSV 导出；学生端在「我的信息」查看本人奖助记录
 * ===================================================== */

Pages.scholarships = function (container, user) {
  // 奖助评审属学工线：辅导员专属（管理员可查）
  if (!Auth.isAdmin(user) && !Auth.isCounselor(user)) {
    container.innerHTML = '<div class="card">' + UI.empty('奖助管理为辅导员专属功能：奖助学金评审属学生工作线，由辅导员登记与管理') + '</div>';
    return;
  }
  var scopeIds = Auth.scopeClassIds(user);
  var state = { type: '' };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">奖助管理</div>' +
        '<div class="toolbar-actions">' +
          '<select id="sch-type" class="input">' +
            '<option value="">全部奖项</option>' +
            Store.SCHOLARSHIP_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') +
          '</select>' +
          '<button id="btn-sch-export" class="btn btn-ghost" type="button">导出CSV</button>' +
          '<button id="btn-sch-add" class="btn btn-primary" type="button">＋ 登记奖助</button>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12px;margin:-6px 0 12px">奖助标准依据学校公开文件：国家奖学金 10000 元/年、国家励志奖学金 6000 元/年、国家助学金分档（约 2000/3300/4500 元）、晴川奖学金甲/乙/丙等 3000/2000/1000 元、晴川助学金甲/乙等 1500/1000 元；具体以当年评审通知为准。</p>' +
      '<div id="sch-stats" class="att-summary"></div>' +
      '<div id="sch-table"></div>' +
    '</div>';

  $('#sch-type', container).addEventListener('change', function () { state.type = this.value; render(); });
  $('#btn-sch-add', container).addEventListener('click', function () { openSchModal(null); });
  $('#btn-sch-export', container).addEventListener('click', exportCSV);
  render();

  /** 顶栏「全站学期」的学年维度：奖助记录按学年归档（academicYear 形如 2025-2026） */
  function yearScope() {
    var t = String(UI.termFilter.get() || '');
    if (!t) return '';
    return /^\d{4}-\d{4}$/.test(t) ? t : t.split('-').slice(0, 2).join('-');
  }
  function scoped() {
    var y = yearScope();
    return Store.list('scholarships')
      .filter(function (s) { return scopeIds.indexOf(s.classId) !== -1; })
      .filter(function (s) { return !y || s.academicYear === y; })
      .filter(function (s) { return !state.type || s.name.indexOf(state.type) !== -1; })
      .sort(function (a, b) {
        return String(b.academicYear || '').localeCompare(String(a.academicYear || ''));
      });
  }

  function statusBadge(st) {
    var map = { '评审中': 'warning', '已公示': 'info', '已发放': 'success' };
    return UI.badge(st, map[st] || 'muted');
  }

  function render() {
    var y = yearScope();
    var list = scoped();
    // 统计 chips 与列表同口径（否则会出现「列表只有本年、chips 却是全部」的不一致）
    var all = Store.list('scholarships')
      .filter(function (s) { return scopeIds.indexOf(s.classId) !== -1; })
      .filter(function (s) { return !y || s.academicYear === y; });
    var totalAmount = all.reduce(function (a, s) { return a + Number(s.amount || 0); }, 0);
    var national = all.filter(function (s) { return s.level === '国家级'; }).length;
    var school = all.filter(function (s) { return s.level === '校级'; }).length;
    $('#sch-stats', container).innerHTML =
      '<span class="chip chip-info">统计范围 <b>' + (y ? y + ' 学年' : '全部学年') + '</b></span>' +
      '<span class="chip">奖助人次 <b>' + all.length + '</b></span>' +
      '<span class="chip chip-ok">累计金额 <b>' + totalAmount.toLocaleString() + ' 元</b></span>' +
      '<span class="chip chip-info">国家级 <b>' + national + '</b> 人次</span>' +
      '<span class="chip">校级 <b>' + school + '</b> 人次</span>';

    if (!list.length) {
      $('#sch-table', container).innerHTML = UI.empty(state.type ? '暂无「' + state.type + '」记录' : (y
        ? y + ' 学年暂无奖助记录（可切换顶部学期查看其它学年）'
        : '暂无奖助记录，点击右上角「登记奖助」开始'));
      return;
    }
    var head = '<tr><th>学号</th><th>姓名</th><th>奖项</th><th>级别</th><th>金额（元）</th><th>学年</th><th>状态</th><th>备注</th><th class="th-ops">操作</th></tr>';
    var body = list.map(function (s) {
      var stu = Store.getStudent(s.studentId);
      return '<tr>' +
        '<td>' + Utils.escapeHtml(stu ? stu.studentNo : '—') + '</td>' +
        '<td><b>' + Utils.escapeHtml(stu ? stu.name : '未知学生') + '</b></td>' +
        '<td>' + Utils.escapeHtml(s.name) + '</td>' +
        '<td>' + UI.badge(s.level, s.level === '国家级' ? 'danger' : 'info') + '</td>' +
        '<td><b>' + Number(s.amount || 0).toLocaleString() + '</b></td>' +
        '<td>' + Utils.escapeHtml(s.academicYear || '') + '</td>' +
        '<td>' + statusBadge(s.status) + '</td>' +
        '<td class="td-address" title="' + Utils.escapeHtml(s.remark || '') + '">' + Utils.escapeHtml(s.remark || '—') + '</td>' +
        '<td class="td-ops">' +
          '<button class="btn btn-sm btn-ghost" data-edit="' + s.id + '" type="button">编辑</button>' +
          '<button class="btn btn-sm btn-danger-ghost" data-del="' + s.id + '" type="button">删除</button>' +
        '</td></tr>';
    }).join('');
    $('#sch-table', container).innerHTML = UI.tableWrap(head, body);
    $$('#sch-table [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openSchModal(b.dataset.edit); });
    });
    $$('#sch-table [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delSch(b.dataset.del); });
    });
  }

  function studentOpts(classId, selectedId) {
    if (!classId) return '<option value="">请先选择班级</option>';
    var list = Store.list('students').filter(function (s) { return s.classId === classId; });
    if (!list.length) return '<option value="">该班级暂无学生</option>';
    return '<option value="">请选择学生</option>' + list.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' +
        Utils.escapeHtml(s.name + '（' + s.studentNo + '）') + '</option>';
    }).join('');
  }

  function openSchModal(id) {
    var isEdit = !!id;
    var rec = isEdit ? Store.find('scholarships', id) : null;
    if (isEdit && !rec) return;
    var classes = Auth.visibleClasses(user);
    var model = rec || {
      classId: classes[0] ? classes[0].id : '', studentId: '',
      name: '国家助学金（一般困难）', level: '国家级', amount: 2000,
      academicYear: '2025-2026', status: '评审中', remark: ''
    };
    var mask = UI.modal({
      title: isEdit ? '编辑奖助记录' : '登记奖助记录',
      body:
        UI.formRow('班级', '<select id="f-class" class="input">' +
          UI.options(classes, 'id', function (c) { return c.name; }, model.classId, '请选择班级') + '</select>', true) +
        UI.formRow('学生', '<select id="f-student" class="input">' + studentOpts(model.classId, model.studentId) + '</select>', true) +
        '<div class="form-grid">' +
          UI.formRow('奖项名称', '<select id="f-name" class="input">' +
            Store.SCHOLARSHIP_TYPES.map(function (t) {
              return '<option' + (t === model.name ? ' selected' : '') + '>' + t + '</option>';
            }).join('') + '</select>', true) +
          UI.formRow('级别', '<select id="f-level" class="input">' +
            Store.SCHOLARSHIP_LEVELS.map(function (l) {
              return '<option' + (l === model.level ? ' selected' : '') + '>' + l + '</option>';
            }).join('') + '</select>') +
          UI.formRow('金额（元/学年）', '<input id="f-amount" class="input" type="number" min="0" step="100" value="' + Utils.escapeHtml(String(model.amount)) + '">', true) +
          UI.formRow('学年', '<input id="f-year" class="input" value="' + Utils.escapeHtml(model.academicYear || '') + '" placeholder="如：2025-2026">', true) +
          UI.formRow('状态', '<select id="f-status" class="input">' +
            Store.SCHOLARSHIP_STATUS.map(function (st) {
              return '<option' + (st === model.status ? ' selected' : '') + '>' + st + '</option>';
            }).join('') + '</select>') +
        '</div>' +
        UI.formRow('备注（认定情况 / 评审说明，选填）', '<input id="f-remark" class="input" value="' + Utils.escapeHtml(model.remark || '') + '" placeholder="如：家庭经济困难认定：困难">'),
      onSubmit(root, close) {
        var classId = $('#f-class', root).value;
        var studentId = $('#f-student', root).value;
        var name = $('#f-name', root).value;
        var level = $('#f-level', root).value;
        var amount = Number($('#f-amount', root).value);
        var year = $('#f-year', root).value.trim();
        var status = $('#f-status', root).value;
        var remark = $('#f-remark', root).value.trim();
        if (!classId) return Toast.warning('请选择班级');
        if (!studentId) return Toast.warning('请选择学生');
        if (!year) return Toast.warning('请填写学年');
        if (isNaN(amount) || amount < 0) return Toast.error('金额需为非负数字');
        var data = { studentId: studentId, classId: classId, name: name, level: level, amount: amount, academicYear: year, status: status, remark: remark };
        if (isEdit) {
          Store.update('scholarships', id, data);
          Toast.success('奖助记录已更新');
        } else {
          Store.add('scholarships', data);
          Toast.success('奖助记录登记成功');
        }
        close();
        render();
      }
    });
    $('#f-class', mask).addEventListener('change', function () {
      $('#f-student', mask).innerHTML = studentOpts(this.value, '');
    });
  }

  function delSch(id) {
    var s = Store.find('scholarships', id);
    if (!s) return;
    var stu = Store.getStudent(s.studentId);
    UI.confirm({
      title: '删除奖助记录',
      message: '确定删除「' + (stu ? stu.name : '未知学生') + '」的「' + s.name + '」（' + s.amount + ' 元）记录吗？此操作不可恢复！',
      onOk() {
        Store.remove('scholarships', id);
        Toast.success('奖助记录已删除');
        render();
      }
    });
  }

  function exportCSV() {
    var list = scoped();
    if (!list.length) { Toast.warning('没有可导出的数据'); return; }
    Utils.exportCSV('奖助记录_' + Utils.today() + '.csv',
      ['学号', '姓名', '奖项', '级别', '金额（元）', '学年', '状态', '备注'],
      list.map(function (s) {
        var stu = Store.getStudent(s.studentId);
        return [stu ? stu.studentNo : '', stu ? stu.name : '', s.name, s.level, s.amount, s.academicYear || '', s.status || '', s.remark || ''];
      }));
    Toast.success('已导出 ' + list.length + ' 条奖助记录');
  }
};
