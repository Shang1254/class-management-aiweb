/* =====================================================
 * 个人中心（全部角色）
 * - 查看账号信息与绑定关系
 * - 修改密码（验证原密码，SHA-256 摘要存储）
 * ===================================================== */

Pages.profile = function (container, user) {
  var stu = Auth.isStudent(user) ? getMyStudent(user) : null;

  // 绑定关系描述
  var bindText = '—';
  if (Auth.isTeacher(user) && user.classId) bindText = '管理班级：' + Store.className(user.classId);
  if (stu) bindText = '学生档案：' + stu.name + '（' + stu.studentNo + '）· ' + Store.className(stu.classId);

  var infoHTML =
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">账号信息</div></div>' +
      '<div class="profile-head">' +
        '<div class="profile-avatar">' + Utils.escapeHtml((user.name || user.username).charAt(0)) + '</div>' +
        '<div>' +
          '<div class="profile-name">' + Utils.escapeHtml(user.name || user.username) +
            ' <span class="role-tag role-' + user.role + '">' + Auth.roleName(user.role) + '</span></div>' +
          '<div class="profile-sub">用户名：' + Utils.escapeHtml(user.username) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="info-grid">' +
        '<div class="info-item"><div class="info-label">用户名</div><div class="info-value">' + Utils.escapeHtml(user.username) + '</div></div>' +
        '<div class="info-item"><div class="info-label">姓名</div><div class="info-value">' + Utils.escapeHtml(user.name || '—') + '</div></div>' +
        '<div class="info-item"><div class="info-label">角色</div><div class="info-value">' + Auth.roleName(user.role) + '</div></div>' +
        '<div class="info-item"><div class="info-label">绑定关系</div><div class="info-value">' + Utils.escapeHtml(bindText) + '</div></div>' +
      '</div>' +
    '</div>';

  // 学生额外展示完整档案
  var stuHTML = '';
  if (stu) {
    function item(label, value) {
      return '<div class="info-item"><div class="info-label">' + label + '</div><div class="info-value">' + (value || '—') + '</div></div>';
    }
    stuHTML =
      '<div class="card">' +
        '<div class="toolbar"><div class="toolbar-title">我的档案</div></div>' +
        '<div class="info-grid">' +
          item('学号', Utils.escapeHtml(stu.studentNo)) +
          item('性别', Utils.escapeHtml(stu.gender)) +
          item('出生日期', Utils.escapeHtml(stu.birth)) +
          item('班级', Utils.escapeHtml(Store.className(stu.classId))) +
          item('联系电话', Utils.escapeHtml(stu.phone)) +
          item('家长电话', Utils.escapeHtml(stu.parentPhone)) +
          item('家庭住址', Utils.escapeHtml(stu.address)) +
          item('状态', UI.studentBadge(stu.status)) +
        '</div>' +
      '</div>';
  }

  var pwdHTML =
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">修改密码</div></div>' +
      '<div style="max-width:420px">' +
        UI.formRow('原密码', '<input id="pf-old" class="input" type="password" placeholder="请输入当前密码" autocomplete="current-password">', true) +
        UI.formRow('新密码', '<input id="pf-new" class="input" type="password" placeholder="至少 6 位" autocomplete="new-password">', true) +
        UI.formRow('确认新密码', '<input id="pf-new2" class="input" type="password" placeholder="再次输入新密码" autocomplete="new-password">', true) +
        '<button id="btn-pf-save" class="btn btn-primary" type="button">保存新密码</button>' +
        '<p style="color:var(--muted);font-size:12px;margin-top:12px">密码使用 SHA-256 摘要加密存储，系统不保存明文。</p>' +
      '</div>' +
    '</div>';

  container.innerHTML = infoHTML + stuHTML + pwdHTML;

  $('#btn-pf-save', container).addEventListener('click', async function () {
    var oldPwd = $('#pf-old', container).value;
    var newPwd = $('#pf-new', container).value;
    var newPwd2 = $('#pf-new2', container).value;
    // 表单验证
    if (!oldPwd) return Toast.warning('请输入原密码');
    if (!newPwd) return Toast.warning('请输入新密码');
    if (newPwd.length < 6) return Toast.warning('新密码至少 6 位');
    if (newPwd !== newPwd2) return Toast.error('两次输入的新密码不一致');
    try {
      await Auth.changePassword(user, oldPwd, newPwd);
      Toast.success('密码修改成功，下次登录请使用新密码');
      $('#pf-old', container).value = '';
      $('#pf-new', container).value = '';
      $('#pf-new2', container).value = '';
    } catch (err) {
      Toast.error(err.message);
    }
  });
};
