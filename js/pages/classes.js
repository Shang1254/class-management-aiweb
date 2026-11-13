/* =====================================================
 * 班级管理（仅管理员）：增删改查
 * 字段：班级名称（唯一）、年级、班主任、备注
 * 规则：班级下仍有学生时不允许删除
 * ===================================================== */

Pages.classes = function (container, user) {
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">班级列表</div>' +
        '<div class="toolbar-actions"><button id="btn-add-class" class="btn btn-primary" type="button">＋ 新增班级</button></div>' +
      '</div>' +
      '<div id="class-table"></div>' +
    '</div>';

  $('#btn-add-class', container).addEventListener('click', function () { openClassModal(null); });
  render();

  function render() {
    var classes = Store.list('classes');
    var students = Store.list('students');
    if (!classes.length) {
      $('#class-table', container).innerHTML = UI.empty('暂无班级，点击右上角「新增班级」创建');
      return;
    }
    var head = '<tr><th>班级名称</th><th>年级</th><th>学制 / 届别</th><th>班主任</th><th>学生数</th><th>备注</th><th class="th-ops">操作</th></tr>';
    var body = classes.map(function (c) {
      var count = students.filter(function (s) { return s.classId === c.id; }).length;
      return '<tr>' +
        '<td><b>' + Utils.escapeHtml(c.name) + '</b></td>' +
        '<td>' + Utils.escapeHtml(c.grade) + '</td>' +
        '<td>' + Utils.escapeHtml(Store.programOf(c)) + ' · ' + Utils.escapeHtml(Store.programYearsText(c)) +
          '<small style="display:block;color:var(--muted);margin-top:3px">' + Utils.escapeHtml(Store.gradYearText(c)) + '</small></td>' +
        '<td>' + Utils.escapeHtml(c.headTeacher) + '</td>' +
        '<td>' + count + '</td>' +
        '<td>' + (c.remark ? Utils.escapeHtml(c.remark) : '—') + '</td>' +
        '<td class="td-ops">' +
          '<button class="btn btn-sm btn-ghost" data-edit="' + c.id + '" type="button">编辑</button>' +
          '<button class="btn btn-sm btn-danger-ghost" data-del="' + c.id + '" type="button">删除</button>' +
        '</td></tr>';
    }).join('');
    $('#class-table', container).innerHTML = UI.tableWrap(head, body);

    $$('#class-table [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openClassModal(b.dataset.edit); });
    });
    $$('#class-table [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delClass(b.dataset.del); });
    });
  }

  /** 新增 / 编辑班级弹窗（id 为空表示新增） */
  function openClassModal(id) {
    var isEdit = !!id;
    var cls = isEdit ? (Store.getClass(id) || {}) : { name: '', grade: '', headTeacher: '', remark: '' };
    UI.modal({
      title: isEdit ? '编辑班级' : '新增班级',
      body:
        UI.formRow('班级名称', '<input id="f-name" class="input" value="' + Utils.escapeHtml(cls.name) + '" placeholder="如：计科20252302班">', true) +
        UI.formRow('年级', '<input id="f-grade" class="input" value="' + Utils.escapeHtml(cls.grade) + '" placeholder="如：2025级">', true) +
        UI.formRow('班主任', '<input id="f-head" class="input" value="' + Utils.escapeHtml(cls.headTeacher) + '" placeholder="请输入班主任姓名">', true) +
        UI.formRow('备注', '<textarea id="f-remark" class="input" rows="3" placeholder="选填">' + Utils.escapeHtml(cls.remark) + '</textarea>'),
      onSubmit(root, close) {
        var name = $('#f-name', root).value.trim();
        var grade = $('#f-grade', root).value.trim();
        var head = $('#f-head', root).value.trim();
        var remark = $('#f-remark', root).value.trim();
        // 必填校验
        if (!name) return Toast.warning('请输入班级名称');
        if (!grade) return Toast.warning('请输入年级');
        if (!head) return Toast.warning('请输入班主任姓名');
        // 班级名称唯一校验
        var dup = Store.list('classes').find(function (c) { return c.name === name && c.id !== id; });
        if (dup) return Toast.error('班级名称「' + name + '」已存在');
        if (isEdit) {
          Store.update('classes', id, { name: name, grade: grade, headTeacher: head, remark: remark });
          Toast.success('班级信息已更新');
        } else {
          Store.add('classes', { name: name, grade: grade, headTeacher: head, remark: remark });
          Toast.success('班级创建成功');
        }
        close();
        render();
      }
    });
  }

  /** 删除班级（二次确认；有学生的班级禁止删除） */
  function delClass(id) {
    var cls = Store.getClass(id);
    if (!cls) return;
    var count = Store.list('students').filter(function (s) { return s.classId === id; }).length;
    if (count > 0) {
      Toast.warning('该班级下还有 ' + count + ' 名学生，请先转班或删除学生');
      return;
    }
    UI.confirm({
      title: '删除班级',
      message: '确定要删除班级「' + cls.name + '」吗？\n面向该班级的通知、请假、签到记录将被删除，任教教师也会解除该班绑定，此操作不可恢复！',
      onOk() {
        Store.remove('classes', id);
        // 级联 1：面向该班级的业务数据
        Store.save('notices', Store.list('notices').filter(function (n) { return n.classId !== id; }));
        Store.save('leaves', Store.list('leaves').filter(function (x) { return x.classId !== id; }));
        Store.save('signins', Store.list('signins').filter(function (x) { return x.classId !== id; }));
        // 级联 2：解除教师账号的班级绑定（含多班级数组 teacherClassIds，
        //         旧版只清了已废弃的 user.classId 字段，导致教师仍"任教"一个不存在的班）
        var users = Store.list('users');
        users.forEach(function (u) {
          var changed = false;
          if (u.classId === id) { u.classId = ''; changed = true; }
          if (Array.isArray(u.teacherClassIds) && u.teacherClassIds.indexOf(id) !== -1) {
            u.teacherClassIds = u.teacherClassIds.filter(function (x) { return x !== id; });
            changed = true;
          }
          if (changed) Store.update('users', u.id, { classId: u.classId, teacherClassIds: u.teacherClassIds || [] });
        });
        Store._log('班级管理', '删除', cls.name + '及其关联的通知 / 请假 / 签到记录');
        Toast.success('班级已删除');
        render();
      }
    });
  }
};
