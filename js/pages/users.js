/* =====================================================
 * 用户管理（仅管理员）
 * - 增删改查系统账号，分配角色与班级/学生绑定
 * - 教师 → 任教多个班级（复选）+ 岗位（教师/辅导员）+ 职称（助教/讲师/工程师/副教授/教授）+ 编制类型（专任/外聘）+ 外聘聘期
 * - 学生 → 绑定对应学生档案
 * - 保护：不能删除自己、不能删除内置 admin 账号
 * ===================================================== */

Pages.users = function (container, user) {
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">用户列表</div>' +
        '<div class="toolbar-actions">' +
          '<button id="btn-u-resetpwd" class="btn btn-ghost" type="button">批量重置学生密码</button>' +
          '<button id="btn-u-add" class="btn btn-primary" type="button">＋ 新增用户</button>' +
        '</div>' +
      '</div>' +
      '<div id="u-table"></div>' +
    '</div>';

  $('#btn-u-add', container).addEventListener('click', function () { openUserModal(null); });
  /* 批量重置学生密码（学校运维高频操作：开学/遗忘密码潮） */
  $('#btn-u-resetpwd', container).addEventListener('click', function () {
    var students = Store.list('users').filter(function (u) { return u.role === 'student'; });
    if (!students.length) { Toast.warning('暂无学生账号'); return; }
    UI.confirm({
      title: '批量重置学生密码',
      message: '将把 ' + students.length + ' 个学生账号的密码统一重置为「123456」。\n用于开学发放账号或学生遗忘密码场景；重置后请提醒学生尽快在「个人中心」修改密码。确定继续吗？',
      onOk() {
        var arr = Store.list('users');
        var n = 0;
        arr.forEach(function (u) {
          if (u.role === 'student') { u.password = Store.HASH_123456; n++; }
        });
        Store.save('users', arr);
        Store._log('用户管理', '批量重置密码', '重置 ' + n + ' 个学生账号密码为初始密码');
        Toast.success('已重置 ' + n + ' 个学生账号密码为 123456');
        render();
      }
    });
  });
  render();

  function render() {
    var users = Store.list('users');
    if (!users.length) {
      $('#u-table', container).innerHTML = UI.empty('暂无用户');
      return;
    }
    var head = '<tr><th>用户名</th><th>姓名</th><th>角色</th><th>编制</th><th>绑定 / 聘期</th><th class="th-ops">操作</th></tr>';
    var body = users.map(function (u) {
      var bind = '—';
      if (u.role === 'teacher') {
        var ids = Auth.teacherClassIds(u);
        bind = ids.length
          ? '任教：' + ids.map(function (id) { return Utils.escapeHtml(Store.className(id)); }).join('、')
          : '<span class="score-lo">未绑定班级</span>';
        if (u.teacherType === '外聘' && u.validUntil) {
          var expired = u.validUntil < Utils.today();
          bind += '<br><small style="color:' + (expired ? 'var(--danger)' : 'var(--muted)') + '">聘期至 ' + Utils.escapeHtml(u.validUntil) + (expired ? '（已到期）' : '') + '</small>';
        }
      }
      if (u.role === 'student' && u.studentId) {
        var st = Store.getStudent(u.studentId);
        if (st) bind = '学生：' + st.name + '（' + st.studentNo + '）';
      }
      return '<tr>' +
        '<td><b>' + Utils.escapeHtml(u.username) + '</b></td>' +
        '<td>' + Utils.escapeHtml(u.name) + '</td>' +
        '<td><span class="role-tag role-' + u.role + '">' + Auth.roleName(u.role) + '</span></td>' +
        '<td>' + (u.role === 'teacher' && u.post ? UI.badge(u.post, u.post === '辅导员' ? 'warning' : 'muted') + ' ' : '') +
          (u.role === 'teacher' && u.alsoTeach ? UI.badge('兼授课', 'info') + ' ' : '') + UI.teacherTypeBadge(u) +
          (u.role === 'teacher' && u.teachSubjects && u.teachSubjects.length
            ? ' <small style="color:var(--muted)">任教：' + Utils.escapeHtml(u.teachSubjects.join('、')) + '</small>' : '') + (u.role === 'teacher' && u.teacherTitle ? ' <small style="color:var(--muted)">' + Utils.escapeHtml(u.teacherTitle) + '</small>' : '') + '</td>' +
        '<td>' + bind + '</td>' +
        '<td class="td-ops">' +
          '<button class="btn btn-sm btn-ghost" data-edit="' + u.id + '" type="button">编辑</button>' +
          '<button class="btn btn-sm btn-danger-ghost" data-del="' + u.id + '" type="button">删除</button>' +
        '</td></tr>';
    }).join('');
    $('#u-table', container).innerHTML = UI.tableWrap(head, body);

    $$('#u-table [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openUserModal(b.dataset.edit); });
    });
    $$('#u-table [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delUser(b.dataset.del); });
    });
  }

  /** 角色对应的“绑定”表单项（切换角色时动态替换） */
  function bindRowHTML(role, model) {
    if (role === 'teacher') {
      // 教师任教班级：复选框组（支持跨班级任教）
      var curIds = Auth.teacherClassIds(model);
      var boxes = Store.list('classes').map(function (c) {
        return '<label class="radio" style="margin:0 10px 8px 0">' +
          '<input type="checkbox" name="f-tclass" value="' + c.id + '"' +
          (curIds.indexOf(c.id) !== -1 ? ' checked' : '') + '>' + Utils.escapeHtml(c.name) + '</label>';
      }).join('');
      var teacherType = model.teacherType || '专任';
      var html = UI.formRow('任教班级（可多选）',
        '<div>' + (boxes || '<span style="color:var(--muted);font-size:13px">暂无班级，请先在「班级管理」中创建</span>') + '</div>', true);
      var teacherPost = model.post || '教师';
      var teacherTitle = model.teacherTitle || '讲师';
      html += '<div class="form-grid">' +
        UI.formRow('岗位', '<select id="f-post" class="input">' +
          Store.TEACHER_POSTS.map(function (ps) {
            return '<option' + (ps === teacherPost ? ' selected' : '') + '>' + ps + '</option>';
          }).join('') + '</select>') +
        UI.formRow('职称', '<select id="f-title2" class="input">' +
          Store.TEACHER_TITLES.map(function (tt) {
            return '<option' + (tt === teacherTitle ? ' selected' : '') + '>' + tt + '</option>';
          }).join('') + '</select>') +
        UI.formRow('编制类型', '<select id="f-ttype" class="input">' +
          Store.TEACHER_TYPES.map(function (t) {
            return '<option' + (t === teacherType ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select>') +
        UI.formRow('外聘聘期（专任可留空）', '<input id="f-valid" type="date" class="input" value="' + Utils.escapeHtml(model.validUntil || '') + '">') +
      '</div>' +
      // 辅导员默认只走学工线（行政与学生工作）；兼课的老师可勾选后同时获得教学线功能
      '<label class="chip" style="cursor:pointer;margin-top:6px"><input type="checkbox" id="f-also-teach"' +
        (model.alsoTeach ? ' checked' : '') + '> 兼任授课（勾选后同时启用教学线：成绩、作业、随堂测验、竞赛、对比报告）</label>' +
      // 任教科目：教师端「我的课程」卡片与成绩/测验的科目默认值都取自这里
      UI.formRow('任教科目（顿号或逗号分隔，用于教师端按科目汇总「我的课程」）',
        '<input id="f-subjects" class="input" list="f-subject-list" value="' +
        Utils.escapeHtml((model.teachSubjects || []).join('、')) +
        '" placeholder="如：数据结构、Java程序设计（填课程数据里出现的科目名）">' +
        '<datalist id="f-subject-list">' +
          Store.list('scores').map(function (x) { return x.subject; })
            .filter(function (x, i, arr) { return x && arr.indexOf(x) === i; }).slice(0, 60)
            .map(function (x) { return '<option value="' + Utils.escapeHtml(x) + '">'; }).join('') +
        '</datalist>');
      return html;
    }
    if (role === 'student') {
      var opts = '<option value="">请选择学生</option>';
      Store.list('classes').forEach(function (c) {
        var sts = Store.list('students').filter(function (s) { return s.classId === c.id; });
        if (!sts.length) return;
        opts += '<optgroup label="' + Utils.escapeHtml(c.name) + '">' + sts.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === model.studentId ? ' selected' : '') + '>' +
            Utils.escapeHtml(s.name + '（' + s.studentNo + '）') + '</option>';
        }).join('') + '</optgroup>';
      });
      return UI.formRow('绑定学生（该账号登录后查看的学生档案）', '<select id="f-student" class="input">' + opts + '</select>', true);
    }
    return ''; // 管理员无需绑定
  }

  /* ---- 新增 / 编辑用户弹窗 ---- */
  function openUserModal(id) {
    var isEdit = !!id;
    var u = isEdit ? (Store.getUser(id) || {}) : { username: '', password: '', name: '', role: 'student', teacherType: '专任', validUntil: '', teacherClassIds: [], classId: '', studentId: '' };

    var mask = UI.modal({
      title: isEdit ? '编辑用户' : '新增用户',
      body:
        UI.formRow('用户名', '<input id="f-username" class="input" value="' + Utils.escapeHtml(u.username) + '"' +
          (isEdit ? ' disabled' : '') + ' placeholder="字母 / 数字 / 下划线，3-20位">', true) +
        UI.formRow('密码', '<input id="f-password" class="input" type="password" placeholder="' +
          (isEdit ? '留空则不修改密码' : '至少 6 位') + '">', true) +
        UI.formRow('姓名', '<input id="f-name" class="input" value="' + Utils.escapeHtml(u.name) + '" placeholder="请输入姓名">', true) +
        UI.formRow('角色', '<select id="f-role" class="input">' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>管理员</option>' +
          '<option value="teacher"' + (u.role === 'teacher' ? ' selected' : '') + '>教师</option>' +
          '<option value="student"' + (u.role === 'student' ? ' selected' : '') + '>学生</option>' +
        '</select>', true) +
        '<div id="f-bind">' + bindRowHTML(u.role, u) + '</div>',
      async onSubmit(root, close) {
        var username = $('#f-username', root).value.trim();
        var password = $('#f-password', root).value;
        var name = $('#f-name', root).value.trim();
        var role = $('#f-role', root).value;

        // 表单验证
        if (!isEdit) {
          if (!username) return Toast.warning('请输入用户名');
          if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return Toast.error('用户名需为 3-20 位字母、数字或下划线');
          var dup = Store.list('users').some(function (x) { return x.username === username; });
          if (dup) return Toast.error('用户名「' + username + '」已存在');
          if (!password || password.length < 6) return Toast.warning('密码至少 6 位');
        } else if (password && password.length < 6) {
          return Toast.error('新密码至少 6 位');
        }
        if (!name) return Toast.warning('请输入姓名');

        var patch = { name: name, role: role };
        // 密码统一以 SHA-256 摘要存储，不保存明文
        if (password) patch.password = await Utils.sha256(password);

        // 按角色处理绑定关系
        if (role === 'teacher') {
          // 任教班级（复选，至少一个）
          var checked = $$('input[name="f-tclass"]:checked', root).map(function (c) { return c.value; });
          if (!checked.length) return Toast.warning('请至少为一个班级勾选任教');
          var validUntil = $('#f-valid', root) ? $('#f-valid', root).value : '';
          if ($('#f-ttype', root) && $('#f-ttype', root).value === '外聘' && validUntil && validUntil < Utils.today() && !isEdit) {
            return Toast.warning('外聘聘期已早于今天，请核对日期');
          }
          patch.teacherClassIds = checked;
          patch.classId = checked[0]; // 兼容旧字段：主班级取第一个
          patch.teacherType = $('#f-ttype', root) ? $('#f-ttype', root).value : '专任';
          patch.post = $('#f-post', root) ? $('#f-post', root).value : '教师'; // 岗位：教师 / 辅导员
          patch.alsoTeach = $('#f-also-teach', root) ? !!$('#f-also-teach', root).checked : false; // 兼任授课
          // 任教科目：支持顿号/中英文逗号分隔，去重去空白
          var subjRaw = $('#f-subjects', root) ? $('#f-subjects', root).value : '';
          patch.teachSubjects = subjRaw.split(/[、,，;；]+/).map(function (x) { return x.trim(); })
            .filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
          patch.teacherTitle = $('#f-title2', root) ? $('#f-title2', root).value : '讲师'; // 职称：助教/讲师/工程师/副教授/教授
          patch.validUntil = validUntil;
          patch.studentId = '';
        } else if (role === 'student') {
          var sid = $('#f-student', root) ? $('#f-student', root).value : '';
          if (!sid) return Toast.warning('请为学生账号绑定学生');
          var stu = Store.getStudent(sid);
          patch.studentId = sid;
          patch.classId = stu ? stu.classId : '';
          patch.teacherClassIds = [];
          patch.teacherType = '';
          patch.post = '';
          patch.teacherTitle = '';
          patch.validUntil = '';
        } else {
          patch.classId = '';
          patch.studentId = '';
          patch.teacherClassIds = [];
          patch.teacherType = '';
          patch.post = '';
          patch.teacherTitle = '';
          patch.validUntil = '';
        }

        if (isEdit) {
          Store.update('users', id, patch);
          Toast.success('用户信息已更新');
        } else {
          Store.add('users', {
            username: username, password: password,
            name: name, role: role,
            post: patch.post, alsoTeach: patch.alsoTeach, teachSubjects: patch.teachSubjects,
            teacherTitle: patch.teacherTitle, teacherType: patch.teacherType, validUntil: patch.validUntil,
            teacherClassIds: patch.teacherClassIds,
            classId: patch.classId, studentId: patch.studentId
          });
          Toast.success('用户创建成功');
        }
        close();
        render();
      }
    });

    // 切换角色时动态替换绑定行
    $('#f-role', mask).addEventListener('change', function () {
      $('#f-bind', mask).innerHTML = bindRowHTML(this.value, u);
    });
  }

  /* ---- 删除用户（二次确认 + 内置保护） ---- */
  function delUser(id) {
    var u = Store.getUser(id);
    if (!u) return;
    if (u.id === user.id) { Toast.warning('不能删除当前登录的账号'); return; }
    if (u.username === 'admin') { Toast.warning('内置管理员账号不可删除'); return; }
    UI.confirm({
      title: '删除用户',
      message: '确定要删除用户「' + u.username + '」（' + u.name + '）吗？此操作不可恢复！',
      onOk() {
        Store.remove('users', id);
        Toast.success('用户已删除');
        render();
      }
    });
  }
};
