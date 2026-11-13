/* =====================================================
 * 操作日志（仅管理员）—— 系统安全审计
 * 记录来源：
 * 1. Store 增删改接口自动埋点（谁在何时对哪个模块做了什么）
 * 2. 登录成功 / 登录失败 / 退出（auth.js 记录）
 * 支持按模块筛选、分页、清空
 * ===================================================== */

Pages.logs = function (container, user) {
  var state = { module: '', page: 1, pageSize: 15 };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">操作日志</div>' +
        '<div class="toolbar-actions">' +
          '<select id="lg-module" class="input"></select>' +
          '<button id="btn-lg-export" class="btn btn-ghost" type="button">导出CSV</button>' +
          '<button id="btn-lg-clear" class="btn btn-danger-ghost" type="button">清空日志</button>' +
        '</div>' +
      '</div>' +
      '<div id="lg-table"></div>' +
    '</div>';

  /**
   * 模块下拉选项：以 Store.ENTITY_NAMES 的实体模块为准，
   * 再并入日志中实际出现过的模块。
   * （此前是硬编码的 7 项清单，请假 / 课堂 / 测验 / 竞赛等模块选不到，
   *   新增业务模块还得回来改这里）
   */
  function moduleList() {
    var set = ['系统'];
    var names = Store.ENTITY_NAMES || {};
    Object.keys(names).forEach(function (k) {
      if (set.indexOf(names[k]) === -1) set.push(names[k]);
    });
    Store.list('logs').forEach(function (l) {
      if (l.module && set.indexOf(l.module) === -1) set.push(l.module);
    });
    return set;
  }

  $('#lg-module', container).addEventListener('change', function () {
    state.module = this.value;
    state.page = 1;
    render();
  });
  /* 审计日志导出（教务检查/值班交接留档） */
  $('#btn-lg-export', container).addEventListener('click', function () {
    var list = Store.list('logs').slice().reverse();
    if (!list.length) { Toast.warning('暂无日志可导出'); return; }
    Utils.exportCSV('操作日志_' + Utils.today() + '.csv',
      ['时间', '操作人', '角色', '模块', '动作', '详情'],
      list.map(function (l) {
        return [l.time || '', l.userName || '', Auth.roleName(l.role) || l.role || '', l.module || '', l.action || '', l.detail || ''];
      }));
    Toast.success('已导出 ' + list.length + ' 条操作日志');
  });

  $('#btn-lg-clear', container).addEventListener('click', function () {
    UI.confirm({
      title: '清空日志',
      message: '确定要清空全部操作日志吗？此操作不可恢复！',
      onOk() {
        Store.save('logs', []);
        Toast.success('操作日志已清空');
        render();
      }
    });
  });

  var roleMap = { admin: '管理员', teacher: '教师', student: '学生', '-': '—' };

  function render() {
    // 每次渲染重建模块下拉（选项随日志内容变化），并保持当前选择
    var sel = $('#lg-module', container);
    sel.innerHTML = Utils.simpleOptions(moduleList(), state.module, '全部模块');

    var list = Store.list('logs').filter(function (l) {
      return !state.module || l.module === state.module;
    }).slice().reverse(); // 最新的在前

    var totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.pageSize;
    var rows = list.slice(start, start + state.pageSize);

    if (!list.length) {
      $('#lg-table', container).innerHTML = UI.empty('暂无操作日志，进行增删改或登录操作后自动记录');
      return;
    }
    var head = '<tr><th>时间</th><th>操作人</th><th>角色</th><th>模块</th><th>动作</th><th>详情</th></tr>';
    var body = rows.map(function (l) {
      // 删除/失败类动作红色高亮，便于审计
      var actCls = (l.action === '删除' || l.action === '登录失败') ? 'score-lo' : '';
      return '<tr>' +
        '<td style="white-space:nowrap">' + Utils.escapeHtml(l.time) + '</td>' +
        '<td><b>' + Utils.escapeHtml(l.userName) + '</b></td>' +
        '<td>' + Utils.escapeHtml(roleMap[l.role] || l.role) + '</td>' +
        '<td>' + Utils.escapeHtml(l.module) + '</td>' +
        '<td><b class="' + actCls + '">' + Utils.escapeHtml(l.action) + '</b></td>' +
        '<td>' + Utils.escapeHtml(l.detail) + '</td>' +
      '</tr>';
    }).join('');
    $('#lg-table', container).innerHTML = UI.tableWrap(head, body) +
      UI.paginationHTML({ total: list.length, page: state.page, pageSize: state.pageSize });
    UI.bindPagination($('#lg-table', container), function (p) { state.page = p; render(); });
  }

  render();
};
