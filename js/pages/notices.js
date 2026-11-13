/* =====================================================
 * 通知管理（管理员 / 教师）
 * - 管理员：查看全部，可管理所有通知
 * - 教师：可查看“全部班级”+ 本班通知，只能编辑/删除自己发布的
 * - 学生端查看入口在 student-view.js（my-notices）
 * ===================================================== */

/** 通知卡片 HTML（仪表盘 / 通知页 / 学生端共用）
 *  @param n 通知对象  @param ops 操作按钮 HTML（无则传 ''） */
function noticeCardHTML(n, ops) {
  // 频道徽章：辅导员通知（学工/学校事务）金色 / 教师通知（教学事务）蓝色
  var channelBadge = n.channel
    ? UI.badge(n.channel, n.channel === '教师通知' ? 'info' : 'warning')
    : '';
  return '<div class="notice-card">' +
    '<div class="notice-head">' +
      '<span class="notice-title">' + Utils.escapeHtml(n.title) + '</span>' +
      '<span>' + channelBadge + ' ' + UI.badge(n.classId ? Store.className(n.classId) : '全部班级', 'info') + '</span>' +
    '</div>' +
    '<div class="notice-content">' + Utils.escapeHtml(n.content) + '</div>' +
    '<div class="notice-meta">' +
      '<span>' + Utils.escapeHtml(n.publisher || '系统') + '</span>' +
      '<span>' + Utils.escapeHtml(n.publishTime || '') + '</span>' + (ops || '') +
    '</div></div>';
}

Pages.notices = function (container, user) {
  var state = { page: 1, pageSize: 5, channel: '' };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">通知列表</div>' +
        '<div class="toolbar-actions">' +
          '<select id="ntc-channel" class="input">' +
            '<option value="">全部频道</option>' +
            Store.NOTICE_CHANNELS.map(function (ch) { return '<option>' + ch + '</option>'; }).join('') +
          '</select>' +
          '<button id="btn-ntc-push" class="btn btn-ghost" type="button">手机推送设置</button>' +
          '<button id="btn-ntc-add" class="btn btn-primary" type="button">＋ 发布通知</button>' +
        '</div>' +
      '</div>' +
      '<div id="ntc-list"></div>' +
      '<div id="ntc-page"></div>' +
    '</div>';

  $('#btn-ntc-add', container).addEventListener('click', function () { openNoticeModal(null); });
  $('#ntc-channel', container).addEventListener('change', function () {
    state.channel = this.value;
    state.page = 1;
    render();
  });
  $('#btn-ntc-push', container).addEventListener('click', openPushSettings);
  render();

  /* ---------------- 手机推送（ntfy.sh 公开通道，免注册免密钥） ---------------- */

  /** UTF-8 → Base64（用于 RFC 2047 编码非 ASCII 的 Title 头） */
  function b64Utf8(s) {
    var bytes = new TextEncoder().encode(s);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  /** 推送一条消息到配置的 ntfy topic；失败不抛错（静默降级） */
  async function pushToPhone(title, content, fromLabel) {
    var topic = Store.getPref('ntfyTopic', '');
    if (!topic) return false;
    try {
      var res = await fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
        method: 'POST',
        headers: {
          'Title': '=?UTF-8?B?' + b64Utf8(title) + '?=',  // RFC 2047 编码中文标题
          'Priority': '3'
        },
        body: content + '\n—— ' + fromLabel + ' · 晴川学院班级管理系统'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      Store._log('通知管理', '手机推送', title);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 推送设置弹窗：配置 topic + 发送测试 */
  function openPushSettings() {
    var topic = Store.getPref('ntfyTopic', '');
    var mask = UI.modal({
      title: '手机推送设置（ntfy）',
      submitText: '保 存',
      body:
        '<p style="color:var(--muted);font-size:12.5px;line-height:1.9;margin-bottom:10px">' +
        '基于 <b>ntfy.sh</b> 公开推送通道（免注册、免 API Key）：手机安装 ntfy App 或打开 ' +
        '<b>ntfy.sh/你的topic</b> 订阅后，发布通知时可一键推送到学生手机。' +
        'topic 建议用班级专属名称（字母数字短横线，如 <b>qcu-jk20252302</b>），避免与他人撞名。</p>' +
        UI.formRow('推送主题（topic，留空则关闭推送）',
          '<input id="f-topic" class="input" value="' + Utils.escapeHtml(topic) + '" placeholder="如 qcu-jk20252302">') +
        '<div class="toolbar-actions" style="margin-top:4px">' +
          '<button id="btn-ntfy-test" class="btn btn-ghost btn-sm" type="button">发送测试推送</button>' +
        '</div>',
      onSubmit(root, close) {
        var v = $('#f-topic', root).value.trim();
        if (v && !/^[A-Za-z0-9_-]{2,64}$/.test(v)) return Toast.error('topic 只能包含字母、数字、下划线或短横线（2-64 位）');
        Store.setPref('ntfyTopic', v);
        Store._log('通知管理', '推送设置', v ? '启用 topic：' + v : '关闭手机推送');
        Toast.success(v ? '已启用手机推送（topic：' + v + '）' : '已关闭手机推送');
        close();
      }
    });
    $('#btn-ntfy-test', mask).addEventListener('click', async function () {
      var v = $('#f-topic', mask).value.trim();
      if (!v) return Toast.warning('请先填写 topic');
      Store.setPref('ntfyTopic', v);
      Toast.info('正在发送测试推送…');
      var ok = await pushToPhone('推送测试', '如果你在手机上收到这条消息，说明推送通道已配置成功。', '系统');
      if (ok) Toast.success('测试推送已发送，请查看手机');
      else Toast.error('推送失败：请检查网络，或确认 topic 名称有效');
    });
  }

  /** 可见通知：目标为“全部班级”或自己可见的班级 */
  function visibleNotices() {
    var ids = Auth.scopeClassIds(user);
    return Store.list('notices').filter(function (n) {
      if (n.classId && ids.indexOf(n.classId) === -1) return false;
      if (state.channel && n.channel !== state.channel) return false;
      return true;
    }).sort(function (a, b) {
      return String(b.publishTime || '').localeCompare(String(a.publishTime || ''));
    });
  }

  /** 是否有权管理该通知：管理员全部，教师仅自己发布的 */
  function canManage(n) {
    return Auth.isAdmin(user) || n.publisherId === user.id;
  }

  /** 已读回执：x/y（y = 通知目标范围内绑定了账号的学生数，无学生账号时只显示已读数） */
  function readReceiptHTML(n) {
    var readers = Store.noticeReaders(n.id);
    var audience = Store.list('users').filter(function (u) {
      if (u.role !== 'student' || !u.studentId) return false;
      if (!n.classId) return true;
      var stu = Store.getStudent(u.studentId);
      return stu && stu.classId === n.classId;
    });
    if (!audience.length) {
      return readers.length ? UI.badge('已读 ' + readers.length + ' 人', 'success') : '';
    }
    var read = audience.filter(function (u) { return readers.indexOf(u.username) !== -1; }).length;
    return UI.badge('已读 ' + read + '/' + audience.length + ' 人', read >= audience.length ? 'success' : 'info');
  }

  function render() {
    var list = visibleNotices();
    var totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var pageList = list.slice(start, start + state.pageSize);

    $('#ntc-list', container).innerHTML = pageList.length
      ? pageList.map(function (n) {
          var ops = readReceiptHTML(n) +
            (canManage(n)
              ? '<button class="btn btn-sm btn-ghost" data-edit="' + n.id + '" type="button">编辑</button>' +
                '<button class="btn btn-sm btn-danger-ghost" data-del="' + n.id + '" type="button">删除</button>'
              : '');
          return noticeCardHTML(n, ops);
        }).join('')
      : UI.empty('暂无通知，点击右上角「发布通知」发布');

    $('#ntc-page', container).innerHTML = UI.paginationHTML({ total: list.length, page: state.page, pageSize: state.pageSize });
    UI.bindPagination($('#ntc-page', container), function (p) { state.page = p; render(); });

    $$('#ntc-list [data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openNoticeModal(b.dataset.edit); });
    });
    $$('#ntc-list [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delNotice(b.dataset.del); });
    });
  }

  /* ---- 发布 / 编辑通知弹窗 ---- */
  function openNoticeModal(id) {
    var isEdit = !!id;
    var n = isEdit ? Store.find('notices', id) : null;
    if (isEdit && !n) return;
    if (isEdit && !canManage(n)) { Toast.error('只能编辑自己发布的通知'); return; }
    var model = n || { title: '', classId: '', content: '' };

    // 目标班级：管理员可发"全部班级"/任意班级；辅导员/教师仅可发给自己管理、任教的班级
    var classOpts = (Auth.isAdmin(user) ? '<option value="">全部班级</option>' : '') +
      (Auth.isAdmin(user) ? '' : '<option value="">请选择班级</option>') +
      Auth.visibleClasses(user).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === model.classId ? ' selected' : '') + '>' + Utils.escapeHtml(c.name) + '</option>';
      }).join('');

    // 通知频道：辅导员固定"辅导员通知"、任课教师固定"教师通知"，管理员二选一
    var isCounselor = Auth.isCounselor(user);
    var defaultChannel = model.channel || (isCounselor ? '辅导员通知' : (Auth.isAdmin(user) ? '辅导员通知' : '教师通知'));
    var channelRow;
    if (Auth.isAdmin(user)) {
      channelRow = UI.formRow('通知频道',
        '<select id="f-channel" class="input">' +
          Store.NOTICE_CHANNELS.map(function (ch) {
            return '<option' + (ch === defaultChannel ? ' selected' : '') + '>' + ch + '</option>';
          }).join('') + '</select>' +
        '<small style="color:var(--muted);font-size:11.5px;display:block;margin-top:4px">辅导员通知 = 学工/学校事务；教师通知 = 教学事务</small>');
    } else {
      channelRow = UI.formRow('通知频道',
        '<input id="f-channel" class="input" value="' + Utils.escapeHtml(defaultChannel) + '" disabled>' +
        '<small style="color:var(--muted);font-size:11.5px;display:block;margin-top:4px">' +
        (isCounselor ? '辅导员账号发布学工/学校事务通知' : '任课教师账号发布教学事务通知') + '</small>');
    }

    // 手机推送选项（已配置 ntfy topic 时显示；仅新发布时生效）
    var topic = Store.getPref('ntfyTopic', '');
    var pushRow = (!isEdit && topic)
      ? '<label class="radio" style="margin-top:2px"><input type="checkbox" id="f-push" checked> 同时推送到学生手机（ntfy · ' +
        Utils.escapeHtml(topic) + '）</label>'
      : '';

    UI.modal({
      title: isEdit ? '编辑通知' : '发布通知',
      body:
        channelRow +
        UI.formRow('标题', '<input id="f-title" class="input" value="' + Utils.escapeHtml(model.title) + '" placeholder="请输入通知标题">', true) +
        UI.formRow('目标班级', '<select id="f-class" class="input">' + classOpts + '</select>', !Auth.isAdmin(user)) +
        pushRow +
        UI.formRow('内容', '<textarea id="f-content" class="input" rows="6" placeholder="请输入通知内容">' + Utils.escapeHtml(model.content) + '</textarea>', true),
      async onSubmit(root, close) {
        var title = $('#f-title', root).value.trim();
        var classId = $('#f-class', root).value;
        var content = $('#f-content', root).value.trim();
        var channel = $('#f-channel', root) ? $('#f-channel', root).value : defaultChannel;
        var doPush = $('#f-push', root) ? $('#f-push', root).checked : false;
        // 表单验证：必填项
        if (!title) return Toast.warning('请输入通知标题');
        if (!content) return Toast.warning('请输入通知内容');
        if (!Auth.isAdmin(user) && !classId) return Toast.warning('请选择目标班级');
        if (isEdit) {
          Store.update('notices', id, { title: title, classId: classId, content: content, channel: channel });
          Toast.success('通知已更新');
        } else {
          Store.add('notices', {
            title: title, classId: classId, content: content, channel: channel,
            publisher: user.name || user.username,
            publisherId: user.id,
            publishTime: Utils.nowStr()
          });
          Toast.success('通知发布成功');
          if (doPush) {
            var ok = await pushToPhone(title, content,
              (classId ? Store.className(classId) : '全部班级') + ' · ' + (user.name || user.username));
            if (ok) Toast.success('已同步推送到手机（ntfy）');
            else Toast.warning('手机推送未送达（不影响通知发布，请检查网络或推送设置）');
          }
        }
        close();
        render();
      }
    });
  }

  /* ---- 删除通知（二次确认） ---- */
  function delNotice(id) {
    var n = Store.find('notices', id);
    if (!n) return;
    if (!canManage(n)) { Toast.error('只能删除自己发布的通知'); return; }
    UI.confirm({
      title: '删除通知',
      message: '确定要删除通知「' + n.title + '」吗？此操作不可恢复！',
      onOk() {
        Store.remove('notices', id);
        Toast.success('通知已删除');
        render();
      }
    });
  }
};
