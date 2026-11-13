/* =====================================================
 * 学科竞赛管理（管理员 / 教师，教师限任教班级）
 * 民办高校"以赛促学"场景：登记蓝桥杯、计算机设计大赛等竞赛获奖，
 * 支持级别（校级/市级/省级/国家级）与获奖等级统计，学生端在
 * 「我的信息」中查看本人获奖记录
 * ===================================================== */

Pages.competitions = function (container, user) {
  var scopeIds = Auth.scopeClassIds(user);
  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">学科竞赛</div>' +
        '<div class="toolbar-actions">' +
          '<button id="btn-cmp-export" class="btn btn-ghost" type="button">导出CSV</button>' +
          '<button id="btn-cmp-add" class="btn btn-primary" type="button">＋ 登记获奖</button>' +
        '</div>' +
      '</div>' +
      '<div id="cmp-stats" class="att-summary"></div>' +
      '<div id="cmp-list"></div>' +
    '</div>';

  $('#btn-cmp-add', container).addEventListener('click', function () { openCmpModal(null); });
  $('#btn-cmp-export', container).addEventListener('click', exportCSV);
  render();

  function scoped() {
    // 学生姓名与班级用于范围过滤：任一获奖学生落在任教班级内即可见
    var all = Store.list('competitions');
    var stuMap = {};
    Store.list('students').forEach(function (s) { stuMap[s.id] = s; });
    return all.filter(function (c) {
      return c.studentIds.some(function (id) {
        var stu = stuMap[id];
        return stu && scopeIds.indexOf(stu.classId) !== -1;
      });
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }

  /** 竞赛级别 → 徽章色 */
  function levelBadge(level) {
    var map = { '国家级': 'danger', '省级': 'warning', '市级': 'info', '校级': 'muted' };
    return UI.badge(level || '校级', map[level] || 'muted');
  }

  function studentNames(cmp) {
    return cmp.studentIds.map(function (id) {
      var stu = Store.getStudent(id);
      return stu ? stu.name : '未知学生';
    }).join('、');
  }

  function render() {
    var list = scoped();
    var byLevel = {};
    list.forEach(function (c) {
      byLevel[c.level] = (byLevel[c.level] || 0) + c.studentIds.length;
    });
    $('#cmp-stats', container).innerHTML =
      '<span class="chip chip-bad">国家级 <b>' + (byLevel['国家级'] || 0) + '</b> 人次</span>' +
      '<span class="chip chip-warn">省级 <b>' + (byLevel['省级'] || 0) + '</b> 人次</span>' +
      '<span class="chip chip-info">市级 <b>' + (byLevel['市级'] || 0) + '</b> 人次</span>' +
      '<span class="chip">校级 <b>' + (byLevel['校级'] || 0) + '</b> 人次</span>';

    $('#cmp-list', container).innerHTML = list.length
      ? list.map(function (c) {
          return '<div class="notice-card">' +
            '<div class="notice-head"><span class="notice-title">' + Utils.escapeHtml(c.name) + '</span>' +
              levelBadge(c.level) + UI.badge(c.award, 'success') + '</div>' +
            '<div class="notice-meta">' +
              '<span>获奖学生：' + Utils.escapeHtml(studentNames(c)) + '</span>' +
              '<span>获奖时间 ' + Utils.escapeHtml(c.date) + '</span>' +
              (c.teacher ? '<span>指导教师：' + Utils.escapeHtml(c.teacher) + '</span>' : '') +
              (c.remark ? '<span>' + Utils.escapeHtml(c.remark) + '</span>' : '') +
              '<span style="display:flex;gap:6px;margin-left:auto">' +
                '<button class="btn btn-sm btn-ghost" data-edit="' + c.id + '" type="button">编辑</button>' +
                '<button class="btn btn-sm btn-danger-ghost" data-del="' + c.id + '" type="button">删除</button>' +
              '</span>' +
            '</div></div>';
        }).join('')
      : UI.empty('暂无竞赛获奖记录，点击右上角「登记获奖」');
    bind();
  }

  function bind() {
    $$('[data-edit]', container).forEach(function (b) {
      b.addEventListener('click', function () { openCmpModal(b.dataset.edit); });
    });
    $$('[data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delCmp(b.dataset.del); });
    });
  }

  function openCmpModal(id) {
    var isEdit = !!id;
    var c = isEdit ? Store.find('competitions', id) : null;
    if (isEdit && !c) return;
    var model = c || { name: '', level: '校级', award: '三等奖', studentIds: [], date: Utils.today(), teacher: '', remark: '' };
    var classes = Auth.visibleClasses(user);
    var stuBox = '<div>' + classes.map(function (cls) {
      var sts = Store.list('students').filter(function (s) { return s.classId === cls.id; })
        .sort(function (x, y) { return String(x.studentNo).localeCompare(String(y.studentNo)); });
      if (!sts.length) return '';
      return '<div style="margin-bottom:6px"><small style="color:var(--muted)">' + Utils.escapeHtml(cls.name) + '</small><br>' +
        sts.map(function (s) {
          return '<label class="radio" style="margin:3px 8px 3px 0"><input type="checkbox" class="cmp-stu" value="' + s.id + '"' +
            (model.studentIds.indexOf(s.id) !== -1 ? ' checked' : '') + '>' + Utils.escapeHtml(s.name) + '</label>';
        }).join('') + '</div>';
    }).join('') + '</div>';

    UI.modal({
      title: isEdit ? '编辑竞赛获奖' : '登记竞赛获奖',
      wide: true,
      body:
        UI.formRow('竞赛名称', '<input id="f-name" class="input" value="' + Utils.escapeHtml(model.name) + '" placeholder="如：蓝桥杯全国软件和信息技术专业人才大赛">', true) +
        '<div class="form-grid">' +
          UI.formRow('竞赛级别', '<select id="f-level" class="input">' +
            Store.COMP_LEVELS.map(function (L) { return '<option' + (L === model.level ? ' selected' : '') + '>' + L + '</option>'; }).join('') + '</select>') +
          UI.formRow('获奖等级', '<select id="f-award" class="input">' +
            Store.COMP_AWARDS.map(function (A) { return '<option' + (A === model.award ? ' selected' : '') + '>' + A + '</option>'; }).join('') + '</select>') +
          UI.formRow('获奖时间', '<input id="f-date" type="date" class="input" value="' + Utils.escapeHtml(model.date) + '">', true) +
          UI.formRow('指导教师', '<input id="f-teacher" class="input" value="' + Utils.escapeHtml(model.teacher || '') + '" placeholder="选填">') +
        '</div>' +
        UI.formRow('获奖学生（可多选）', stuBox, true) +
        UI.formRow('备注', '<input id="f-remark" class="input" value="' + Utils.escapeHtml(model.remark || '') + '" placeholder="如：C/C++ 程序设计组（选填）">'),
      onSubmit(root, close) {
        var name = $('#f-name', root).value.trim();
        var date = $('#f-date', root).value;
        var ids = $$('.cmp-stu:checked', root).map(function (x) { return x.value; });
        if (!name) return Toast.warning('请输入竞赛名称');
        if (!date) return Toast.warning('请选择获奖时间');
        if (!ids.length) return Toast.warning('请至少勾选一名获奖学生');
        var data = {
          name: name, level: $('#f-level', root).value, award: $('#f-award', root).value,
          date: date, teacher: $('#f-teacher', root).value.trim(),
          remark: $('#f-remark', root).value.trim(), studentIds: ids
        };
        if (isEdit) {
          Store.update('competitions', id, data);
          Toast.success('获奖记录已更新');
        } else {
          Store.add('competitions', data);
          Toast.success('获奖记录登记成功');
        }
        close();
        render();
      }
    });
  }

  function delCmp(id) {
    var c = Store.find('competitions', id);
    if (!c) return;
    UI.confirm({
      title: '删除获奖记录',
      message: '确定删除「' + c.name + '」（' + c.award + '）的获奖记录吗？此操作不可恢复！',
      onOk() {
        Store.remove('competitions', id);
        Toast.success('获奖记录已删除');
        render();
      }
    });
  }

  function exportCSV() {
    var list = scoped();
    if (!list.length) { Toast.warning('没有可导出的数据'); return; }
    Utils.exportCSV('学科竞赛获奖_' + Utils.today() + '.csv',
      ['竞赛名称', '级别', '获奖等级', '获奖学生', '获奖时间', '指导教师', '备注'],
      list.map(function (c) {
        return [c.name, c.level, c.award, studentNames(c), c.date, c.teacher || '', c.remark || ''];
      }));
    Toast.success('已导出 ' + list.length + ' 条获奖记录');
  }
};
