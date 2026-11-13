/* =====================================================
 * 学生管理（管理员 / 教师）
 * - 教师：数据范围为其任教的所有班级（支持跨班）
 * - 支持姓名/学号搜索、班级筛选、办学类型筛选、状态筛选、分页
 * - 学生档案含培养层次（本科/专科）与办学类型（统招/专升本/助学班）
 * - 支持导出 CSV（UTF-8 BOM）
 * - 删除学生时级联删除其成绩、考勤、请假记录和登录账号
 * ===================================================== */

Pages.students = function (container, user) {
  var classes = Auth.visibleClasses(user);
  var isTeacher = Auth.isTeacher(user);
  var state = { search: '', classId: '', enrollType: '', studyForm: '', status: '', page: 1, pageSize: 8 };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">' + (Auth.isCounselor(App.user) || Auth.isAdmin(App.user) ? '学生列表' : '任教班级学生名册') + '</div>' +
        '<div class="toolbar-actions">' +
          '<input id="stu-search" class="input input-search" type="text" placeholder="搜索姓名 / 学号">' +
          '<select id="stu-class" class="input"></select>' +
          '<select id="stu-enroll" class="input"><option value="">全部类别</option>' +
            Store.ENROLL_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
          '<select id="stu-form" class="input"><option value="">全部形式</option>' +
            Store.STUDY_FORMS.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select>' +
          '<select id="stu-status" class="input"><option value="">全部状态</option><option>在读</option><option>休学</option><option>转出</option><option>毕业</option></select>' +
          '<button id="btn-add-stu" class="btn btn-primary" type="button">＋ 新增学生</button>' +
          '<button id="btn-export-stu" class="btn btn-ghost" type="button">导出CSV</button>' +
        '</div>' +
      '</div>' +
      '<div id="stu-table"></div>' +
    '</div>';

  /* ---- 班级筛选下拉：数据范围已按角色圈定（教师=任教班级），默认全部 ---- */
  var classSel = $('#stu-class', container);
  classSel.innerHTML = classes.length
    ? UI.options(classes, 'id', function (c) { return c.name; }, '', '全部班级')
    : '<option value="">未绑定班级</option>';
  classSel.disabled = classes.length === 0;

  /* ---- 工具栏事件 ---- */
  $('#stu-search', container).addEventListener('input', Utils.debounce(function () {
    state.search = this.value;
    state.page = 1;
    render();
  }, 250));
  classSel.addEventListener('change', function () { state.classId = this.value; state.page = 1; render(); });
  $('#stu-enroll', container).addEventListener('change', function () { state.enrollType = this.value; state.page = 1; render(); });
  $('#stu-form', container).addEventListener('change', function () { state.studyForm = this.value; state.page = 1; render(); });
  $('#stu-status', container).addEventListener('change', function () { state.status = this.value; state.page = 1; render(); });
  $('#btn-add-stu', container).addEventListener('click', function () {
    if (!classes.length) { Toast.warning('请先在「班级管理」中创建班级'); return; }
    openStuModal(null);
  });
  $('#btn-export-stu', container).addEventListener('click', exportCSV);

  render();

  /* ---- 按当前筛选条件取数据（导出也使用同一份结果） ---- */
  function filtered() {
    var scopeIds = Auth.scopeClassIds(user);
    var list = Store.list('students').filter(function (s) { return scopeIds.indexOf(s.classId) !== -1; });
    var kw = state.search.trim().toLowerCase();
    if (kw) {
      list = list.filter(function (s) {
        return String(s.name || '').toLowerCase().indexOf(kw) !== -1 ||
               String(s.studentNo || '').toLowerCase().indexOf(kw) !== -1;
      });
    }
    if (state.classId) list = list.filter(function (s) { return s.classId === state.classId; });
    if (state.enrollType) list = list.filter(function (s) { return (s.enrollType || '普通高考') === state.enrollType; });
    if (state.studyForm) list = list.filter(function (s) { return (s.studyForm || '全日制') === state.studyForm; });
    if (state.status) list = list.filter(function (s) { return s.status === state.status; });
    return list.slice().sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
  }

  function render() {
    var list = filtered();
    var totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var rows = list.slice(start, start + state.pageSize);

    if (!list.length) {
      var hint = (state.search || state.status || state.classId || state.enrollType || state.studyForm) ? '没有符合条件的学生' : '暂无学生，点击右上角「新增学生」添加';
      $('#stu-table', container).innerHTML = UI.empty(hint);
      return;
    }

    var head = '<tr><th>学号</th><th>姓名</th><th>性别</th><th>层次·类型·届别</th><th>班级</th><th>电话</th><th>家长电话</th><th>住址</th><th>状态</th><th class="th-ops">操作</th></tr>';
    var body = rows.map(function (s) {
      return '<tr>' +
        '<td>' + Utils.escapeHtml(s.studentNo) + '</td>' +
        '<td><b>' + Utils.escapeHtml(s.name) + '</b></td>' +
        '<td>' + Utils.escapeHtml(s.gender) + '</td>' +
        '<td>' + UI.studentTypeHTML(s) +
          '<small style="display:block;color:var(--muted);margin-top:3px">' +
          Utils.escapeHtml(Store.programYearsText(s)) + ' · ' + Utils.escapeHtml(Store.gradYearText(s)) + '</small></td>' +
        '<td>' + Utils.escapeHtml(Store.className(s.classId)) + '</td>' +
        '<td>' + Utils.escapeHtml(s.phone) + '</td>' +
        '<td>' + (Auth.canSeeSensitive(App.user)
          ? Utils.escapeHtml(s.parentPhone)
          : '<span style="color:var(--muted);font-size:12px">仅辅导员可见</span>') + '</td>' +
        '<td class="td-address" title="' + Utils.escapeHtml(s.address) + '">' + (s.address ? Utils.escapeHtml(s.address) : '—') + '</td>' +
        '<td>' + UI.studentBadge(s.status) + '</td>' +
        '<td class="td-ops">' +
          '<button class="btn btn-sm btn-ghost" data-edit="' + s.id + '" type="button">编辑</button>' +
          '<button class="btn btn-sm btn-danger-ghost" data-del="' + s.id + '" type="button">删除</button>' +
        '</td></tr>';
    }).join('');
    $('#stu-table', container).innerHTML = UI.tableWrap(head, body) +
      UI.paginationHTML({ total: list.length, page: state.page, pageSize: state.pageSize });

    UI.bindPagination($('#stu-table', container), function (p) { state.page = p; render(); });
    $$('#stu-table [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openStuModal(b.dataset.edit); });
    });
    $$('#stu-table [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delStu(b.dataset.del); });
    });
  }

  /* ---- 新增 / 编辑学生弹窗 ---- */
  function openStuModal(id) {
    var isEdit = !!id;
    var s = isEdit ? (Store.getStudent(id) || {}) : {
      studentNo: '', name: '', gender: '男', birth: '',
      classId: isTeacher ? (classes[0] ? classes[0].id : '') : state.classId,
      eduLevel: '', enrollType: '', studyForm: '',
      phone: '', parentPhone: '', address: '', status: '在读'
    };
    var classOpts = UI.options(classes, 'id', function (c) { return c.name; }, s.classId, '请选择班级');
    var statusOpts = Utils.simpleOptions(['在读', '休学', '转出', '毕业'], s.status);
    var levelOpts = Utils.simpleOptions(Store.EDU_LEVELS, s.eduLevel || '本科');
    var enrollOpts = Utils.simpleOptions(Store.ENROLL_TYPES, s.enrollType || '普通高考');
    var formOpts = Utils.simpleOptions(Store.STUDY_FORMS, s.studyForm || '全日制');
    var mask = UI.modal({
      title: isEdit ? '编辑学生' : '新增学生',
      body:
        '<div class="form-grid">' +
          UI.formRow('学号', '<input id="f-no" class="input" value="' + Utils.escapeHtml(s.studentNo) + '" placeholder="如：2025990401001">', true) +
          UI.formRow('姓名', '<input id="f-name" class="input" value="' + Utils.escapeHtml(s.name) + '" placeholder="请输入姓名">', true) +
          UI.formRow('性别', '<select id="f-gender" class="input"><option' + (s.gender === '男' ? ' selected' : '') + '>男</option><option' + (s.gender === '女' ? ' selected' : '') + '>女</option></select>') +
          UI.formRow('出生日期', '<input id="f-birth" type="date" class="input" value="' + Utils.escapeHtml(s.birth) + '">', true) +
          UI.formRow('班级', '<select id="f-class" class="input">' + classOpts + '</select>', true) +
          UI.formRow('状态', '<select id="f-status" class="input">' + statusOpts + '</select>') +
          UI.formRow('培养层次', '<select id="f-level" class="input">' + levelOpts + '</select>') +
          UI.formRow('招生类别', '<select id="f-enroll" class="input">' + enrollOpts + '</select>') +
          UI.formRow('学习形式', '<select id="f-sform" class="input">' + formOpts + '</select>') +
          UI.formRow('联系电话', '<input id="f-phone" class="input" value="' + Utils.escapeHtml(s.phone) + '" placeholder="11位手机号" maxlength="11">', true) +
          UI.formRow('家长电话', '<input id="f-pphone" class="input" value="' + Utils.escapeHtml(s.parentPhone) + '" placeholder="11位手机号" maxlength="11">', true) +
        '</div>' +
        UI.formRow('家庭住址', '<input id="f-address" class="input" value="' + Utils.escapeHtml(s.address) + '" placeholder="选填">'),
      onSubmit(root, close) {
        var no = $('#f-no', root).value.trim();
        var name = $('#f-name', root).value.trim();
        var gender = $('#f-gender', root).value;
        var birth = $('#f-birth', root).value;
        var classId = $('#f-class', root).value;
        var status = $('#f-status', root).value;
        var eduLevel = $('#f-level', root).value;
        var enrollType = $('#f-enroll', root).value;
        var studyForm = $('#f-sform', root).value;
        var phone = $('#f-phone', root).value.trim();
        var pphone = $('#f-pphone', root).value.trim();
        var address = $('#f-address', root).value.trim();

        // 表单验证：必填项
        if (!no) return Toast.warning('请输入学号');
        if (!name) return Toast.warning('请输入姓名');
        if (!birth) return Toast.warning('请选择出生日期');
        if (!classId) return Toast.warning('请选择班级');
        // 手机号格式校验
        if (!Utils.isPhone(phone)) return Toast.error('联系电话格式不正确（11位手机号）');
        if (!Utils.isPhone(pphone)) return Toast.error('家长电话格式不正确（11位手机号）');
        // 学号唯一校验（编辑时排除自身）
        var dup = Store.list('students').find(function (x) { return x.studentNo === no && x.id !== id; });
        if (dup) return Toast.error('学号「' + no + '」已存在');

        var data = { studentNo: no, name: name, gender: gender, birth: birth, classId: classId, status: status, eduLevel: eduLevel, enrollType: enrollType, studyForm: studyForm, phone: phone, parentPhone: pphone, address: address };
        if (isEdit) {
          Store.update('students', id, data);
          Toast.success('学生信息已更新');
        } else {
          Store.add('students', data);
          Toast.success('学生添加成功');
        }
        close();
        render();
      }
    });

    // 切换班级时，培养层次/招生类别/学习形式自动带出该班的设置（可手动改）
    $('#f-class', mask).addEventListener('change', function () {
      var cls = Store.getClass(this.value);
      if (!cls) return;
      $('#f-level', mask).value = cls.eduLevel || '本科';
      $('#f-enroll', mask).value = cls.enrollType || '普通高考';
      $('#f-sform', mask).value = cls.studyForm || '全日制';
    });
    // 招生类别联动学习形式：普通高考/专升本均为全日制统招，自考助学为非全日制；专升本培养层次必为本科
    $('#f-enroll', mask).addEventListener('change', function () {
      $('#f-sform', mask).value = Store.enrollForm(this.value);
      if (this.value === '专升本') $('#f-level', mask).value = '本科';
    });
  }

  /* ---- 删除学生（二次确认 + 级联清理） ---- */
  function delStu(id) {
    var s = Store.getStudent(id);
    if (!s) return;
    UI.confirm({
      title: '删除学生',
      message: '确定要删除学生「' + s.name + '」（' + s.studentNo + '）吗？\n其成绩、考勤、请假、作业提交、测验作答、竞赛记录和登录账号将一并删除，此操作不可恢复！',
      onOk() {
        Store.remove('students', id);
        Store.save('scores', Store.list('scores').filter(function (x) { return x.studentId !== id; }));
        Store.save('attendance', Store.list('attendance').filter(function (x) { return x.studentId !== id; }));
        Store.save('leaves', Store.list('leaves').filter(function (x) { return x.studentId !== id; }));
        // 课堂模块：作业提交与测验作答
        Store.save('submissions', Store.list('submissions').filter(function (x) { return x.studentId !== id; }));
        Store.save('quizAttempts', Store.list('quizAttempts').filter(function (x) { return x.studentId !== id; }));
        // 签到名单里剔除该生（保留签到场次本身，只删学生条目）
        Store.save('signins', Store.list('signins').map(function (sn) {
          if (!Array.isArray(sn.signed)) return sn;
          var left = sn.signed.filter(function (x) { return x !== id && !(x && x.studentId === id); });
          if (left.length === sn.signed.length) return sn;
          sn.signed = left;
          return sn;
        }));
        // 竞赛获奖名单里剔除该生；该生是唯一参与人时整条删除
        Store.save('competitions', Store.list('competitions').map(function (c) {
          if (!Array.isArray(c.studentIds) || c.studentIds.indexOf(id) === -1) return c;
          c.studentIds = c.studentIds.filter(function (x) { return x !== id; });
          return c;
        }).filter(function (c) { return c.studentIds.length; }));
        Store.save('users', Store.list('users').filter(function (u) {
          return !(u.role === 'student' && u.studentId === id);
        }));
        Store._log('学生管理', '删除', s.name + '（' + s.studentNo + '）及其关联记录');
        Toast.success('学生已删除');
        render();
      }
    });
  }

  /* ---- 导出 CSV（UTF-8 BOM） ---- */
  function exportCSV() {
    var list = filtered();
    if (!list.length) { Toast.warning('没有可导出的数据'); return; }
    Utils.exportCSV(
      '学生列表_' + Utils.today() + '.csv',
      ['学号', '姓名', '性别', '出生日期', '班级', '培养层次', '招生类别', '学习形式', '学制', '届别', '电话', '家长电话', '住址', '状态'],
      list.map(function (s) {
        var sensitive = Auth.canSeeSensitive(App.user);   // 任课教师导出不含家长电话
        return [s.studentNo, s.name, s.gender, s.birth, Store.className(s.classId), s.eduLevel || '本科', s.enrollType || '普通高考', s.studyForm || '全日制',
          Store.programYearsText(s), Store.gradYearText(s), s.phone, sensitive ? s.parentPhone : '', sensitive ? s.address : s.address, s.status];
      })
    );
    Toast.success('已导出 ' + list.length + ' 条学生数据');
  }
};
