/* =====================================================
 * 数据管理（仅管理员）
 * 1. 数据备份：全量导出 JSON；恢复：导入 JSON 覆盖（二次确认）
 * 2. 学生批量导入：CSV 模板下载 / 粘贴或选择文件 → 逐行校验预览 → 确认导入
 * ===================================================== */

Pages['data-mgmt'] = function (container, user) {
  var CSV_HEADERS = ['学号', '姓名', '性别', '出生日期', '班级', '培养层次', '招生类别', '学习形式', '电话', '家长电话', '住址', '状态'];

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">数据备份与恢复</div>' +
        '<div id="dm-backup-status"></div>' +
      '</div>' +
      '<p style="color:var(--muted);margin-bottom:14px">备份包含用户、班级、学生、成绩、考勤、通知全部数据（JSON 格式）；恢复将覆盖当前所有数据。建议每学期期末、批量导入前各导出一份备份。' +
        '<b>导出的文件可直接通过微信 / QQ / 邮件发送</b>给他人或存档，也可拷到 U 盘留存。</p>' +
      '<div class="toolbar-actions">' +
        '<button id="btn-dm-export" class="btn btn-primary" type="button">导出备份文件</button>' +
        '<button id="btn-dm-import-file" class="btn btn-ghost" type="button">选择备份文件恢复</button>' +
        '<input id="dm-file" type="file" accept=".json,application/json" style="display:none">' +
      '</div>' +
      '<div style="margin-top:14px">' +
        UI.formRow('或粘贴备份 JSON 内容', '<textarea id="dm-json" class="input" rows="4" placeholder="将备份文件内容粘贴到这里（与选择文件二选一）"></textarea>') +
        '<button id="btn-dm-import" class="btn btn-ghost" type="button">恢复粘贴的备份</button>' +
      '</div>' +
    '</div>' +

    /* ---- 存储容量监控（全校投产前的容量规划） ---- */
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">存储容量监控</div>' +
        '<span class="chip" id="dm-storage-total"></span>' +
      '</div>' +
      '<p style="color:var(--muted);margin-bottom:12px">浏览器本地存储（localStorage）单站点上限约 5MB。下方实时统计各数据实体的占用；接近上限时请导出备份并清理历史学期数据，或按「后端演进」方案迁移中心化存储。</p>' +
      '<div class="cap-bar"><div class="cap-fill" id="dm-cap-fill"></div></div>' +
      '<div id="dm-storage-detail"></div>' +
    '</div>' +

    /* ---- 导出记录（审计日志的汇总视图：导出过什么、何时、给谁看过） ---- */
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">导出记录</div>' +
        '<span class="chip">来源：操作审计日志 · 不可篡改</span>' +
      '</div>' +
      '<div id="dm-export-log"></div>' +
    '</div>' +

    /* ---- 数据体检（一致性与孤儿数据） ---- */
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">数据体检</div>' +
        '<div class="toolbar-actions">' +
          '<button id="btn-dm-check" class="btn btn-ghost" type="button">开始体检</button>' +
          '<button id="btn-dm-clean" class="btn btn-danger-ghost" type="button">清理孤儿数据</button>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);margin-bottom:12px">长期运行中（如删除学生/班级后）可能残留引用了不存在实体的「孤儿数据」。体检会扫描成绩、考勤、请假、健康日报、测验作答、作业提交、签到名单、竞赛获奖、奖助记录、课表与用户绑定，并支持一键清理，保证数据一致性。</p>' +
      '<div id="dm-check-result"></div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">学生批量导入</div></div>' +
      '<p style="color:var(--muted);margin-bottom:14px"><b>三种导入方式任选</b>：① 直接打开 Excel，全选名单（含表头）复制，粘贴到下方文本框即可——系统自动识别制表符，无需另存为 CSV；' +
      '② 选择 CSV 文件；③ 下载模板填写后导入。<br>' +
      'CSV 列顺序：<b>' + CSV_HEADERS.join('，') + '</b>（培养层次 / 招生类别 / 学习形式 / 住址 / 状态可留空：默认按所在班级带出，学习形式由招生类别联动，状态默认“在读”；' +
      '班级若尚未创建，预览时会提示<b>一键创建</b>）。导入前自动校验学号唯一性与手机号格式，错误行会逐条提示。</p>' +
      '<div class="toolbar-actions" style="margin-bottom:14px">' +
        '<button id="btn-dm-template" class="btn btn-ghost" type="button">下载 CSV 模板</button>' +
        '<button id="btn-dm-csv-file" class="btn btn-ghost" type="button">选择 CSV 文件</button>' +
        '<input id="dm-csv" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" style="display:none">' +
      '</div>' +
      UI.formRow('或从 Excel 复制后粘贴（支持制表符 / 英文逗号）', '<textarea id="dm-csv-text" class="input" rows="6" placeholder="在 Excel 中选中名单区域 → Ctrl+C → 粘贴到这里即可（列之间是制表符也能识别）&#10;学号,姓名,性别,出生日期,班级,培养层次,招生类别,学习形式,电话,家长电话,住址,状态&#10;S2024901,张三,男,2005-01-15,计科2301班,本科,普通高考,全日制,13800000000,13900000000,学生宿舍5栋,在读"></textarea>') +
      '<div class="toolbar-actions">' +
        '<button id="btn-dm-preview" class="btn btn-primary" type="button">校验并预览</button>' +
      '</div>' +
      '<div id="dm-preview"></div>' +
    '</div>' +

    /* ---- 教务数据导入中心 ---- */
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">教务数据导入 · 成绩单</div></div>' +
      '<p style="color:var(--muted);margin-bottom:14px">导入<b>教务系统导出的成绩单</b>（CSV 格式）：列名自动识别，支持「学号、姓名、科目、考试名称、分数、学分、课程性质、学期」——其中<b>学号、科目、分数</b>必填；<b>考试名称可留空</b>（按「总评」记录），学期留空按下方默认学期归入。<br>' +
      '兼容正方教务的常见导出：<b>「学年 + 学期（1/2）」分两列</b>时自动合并为 <code>2025-2026-1</code>；表头可为「课程名称/总评成绩/课程性质」等教务叫法。<br>' +
      '同一学生 + 同科目 + 同考试名称 + 同学期的成绩将<b>覆盖更新</b>（便于每学期从教务重新同步）。</p>' +
      '<div class="toolbar-actions" style="margin-bottom:14px">' +
        '<button id="btn-edu-score-tpl" class="btn btn-ghost" type="button">下载成绩单模板</button>' +
        '<button id="btn-edu-score-file" class="btn btn-ghost" type="button">选择 Excel / CSV 文件</button>' +
        '<input id="edu-score-file" type="file" accept=".csv,.xlsx,.xls,text/csv" style="display:none">' +
      '</div>' +
      UI.formRow('默认学期（CSV 里没有学期信息时使用）', '<select id="edu-score-term" class="input">' +
        '<option value="">按 CSV 学期列识别，识别不到则用当前学期</option>' +
        UI.termFilter.list().map(function (t) { return '<option value="' + t + '">' + Store.termText(t) + '</option>'; }).join('') +
        '</select>') +
      UI.formRow('或粘贴成绩单 CSV', '<textarea id="edu-score-text" class="input" rows="5" placeholder="学号,姓名,科目,考试名称,分数,学分,课程性质,学期&#10;2025990401001,林一舟,软件工程,期末考试,85,3,必修,2025-2026-2"></textarea>') +
      '<div class="toolbar-actions"><button id="btn-edu-score-preview" class="btn btn-primary" type="button">校验并预览</button></div>' +
      '<div id="edu-score-preview"></div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">教务数据导入 · 课表</div></div>' +
      '<p style="color:var(--muted);margin-bottom:14px">导入<b>教务系统导出的课表</b>（CSV 格式），两种形态都支持：<br>' +
      '① <b>长表</b>：列名自动识别，支持「班级、星期、节次、课程、教师、地点、上课周次、学期」——<b>班级、星期、节次、课程</b>必填；<br>' +
      '② <b>正方常用「周课表矩阵」</b>：表头是「节次 + 星期一…星期日」，每格写「课程 / 教师 / 地点 / 周次」（多行或斜杠分隔均可，自动拆分）。<br>' +
      '同班级 + 同星期 + 同节次 + 同学期的课程将<b>覆盖更新</b>（重新导入即整表刷新该时段）。</p>' +
      '<div class="toolbar-actions" style="margin-bottom:14px">' +
        '<button id="btn-edu-tt-tpl" class="btn btn-ghost" type="button">下载课表模板</button>' +
        '<button id="btn-edu-tt-file" class="btn btn-ghost" type="button">选择 Excel / CSV 文件</button>' +
        '<input id="edu-tt-file" type="file" accept=".csv,.xlsx,.xls,text/csv" style="display:none">' +
      '</div>' +
      UI.formRow('默认班级（矩阵课表没有班级列时使用）', '<select id="edu-tt-class" class="input">' +
        '<option value="">按 CSV 里的班级列或文件标题识别</option>' +
        Store.list('classes').map(function (c) { return '<option value="' + c.id + '">' + Utils.escapeHtml(c.name) + '</option>'; }).join('') +
        '</select>') +
      UI.formRow('默认学期（CSV 里没有学期信息时使用）', '<select id="edu-tt-term" class="input">' +
        '<option value="">按 CSV 学期列识别，识别不到则用当前学期</option>' +
        UI.termFilter.list().map(function (t) { return '<option value="' + t + '">' + Store.termText(t) + '</option>'; }).join('') +
        '</select>') +
      UI.formRow('或粘贴课表 CSV', '<textarea id="edu-tt-text" class="input" rows="5" placeholder="班级,星期,节次,课程,教师,地点,学期&#10;计科20252302班,周三,3-4节,大数据分析,王建国,一教A307,2026-2027-1"></textarea>') +
      '<div class="toolbar-actions"><button id="btn-edu-tt-preview" class="btn btn-primary" type="button">校验并预览</button></div>' +
      '<div id="edu-tt-preview"></div>' +
    '</div>';

  /* ---------------- 备份与恢复 ---------------- */

  function buildBackup() {
    return {
      app: 'class-management-system',
      version: (typeof App !== 'undefined' && App.VERSION) ? App.VERSION : 'V1.0',   // 与软著登记版本一致
      format: 2,   // 备份结构版本（与软件版本分开：结构变更时递增，恢复时据此兼容）
      exportedAt: Utils.nowStr(),
      data: {
        users: Store.list('users'),
        classes: Store.list('classes'),
        students: Store.list('students'),
        scores: Store.list('scores'),
        attendance: Store.list('attendance'),
        notices: Store.list('notices'),
        leaves: Store.list('leaves'),
        signins: Store.list('signins'),
        assignments: Store.list('assignments'),
        submissions: Store.list('submissions'),
        quizzes: Store.list('quizzes'),
        quizAttempts: Store.list('quizAttempts'),
        competitions: Store.list('competitions'),
        scholarships: Store.list('scholarships'),
        downloads: Store.list('downloads'),
        evaluations: Store.list('evaluations'),
        healthReports: Store.list('healthReports'),
        timetable: Store.list('timetable'),
        noticeReads: Store.read(Store.KEYS.noticeReads, {}),
        meta: Store.read(Store.KEYS.meta, null)
      }
    };
  }

  function doRestore(text) {
    var backup;
    try {
      backup = JSON.parse(text);
    } catch (e) {
      Toast.error('JSON 解析失败：' + e.message);
      return;
    }
    var d = backup && backup.data;
    if (!d || !Array.isArray(d.users) || !Array.isArray(d.classes) || !Array.isArray(d.students)) {
      Toast.error('备份文件格式不正确（缺少 users/classes/students 数据）');
      return;
    }
    UI.confirm({
      title: '恢复备份',
      message: '恢复将覆盖当前系统中的全部数据（备份时间：' + (backup.exportedAt || '未知') + '），\n恢复后需重新登录。确定继续吗？',
      onOk() {
        // 先清空全部实体集合：否则旧浏览器里"备份中没有的实体"会残留旧数据，
        // 恢复后出现新旧数据混在一起的假象（历史 bug）
        Object.keys(Store.KEYS).forEach(function (k) {
          if (k === 'meta' || k === 'session' || k === 'logs') return;
          Store.save(k, []);
        });
        Store.write(Store.KEYS.noticeReads, {});
        Store.save('users', d.users);
        Store.save('classes', d.classes);
        Store.save('students', d.students);
        Store.save('scores', Array.isArray(d.scores) ? d.scores : []);
        Store.save('attendance', Array.isArray(d.attendance) ? d.attendance : []);
        Store.save('notices', Array.isArray(d.notices) ? d.notices : []);
        Store.save('leaves', Array.isArray(d.leaves) ? d.leaves : []);
        Store.save('signins', Array.isArray(d.signins) ? d.signins : []);
        Store.save('assignments', Array.isArray(d.assignments) ? d.assignments : []);
        Store.save('submissions', Array.isArray(d.submissions) ? d.submissions : []);
        Store.save('quizzes', Array.isArray(d.quizzes) ? d.quizzes : []);
        Store.save('quizAttempts', Array.isArray(d.quizAttempts) ? d.quizAttempts : []);
        Store.save('competitions', Array.isArray(d.competitions) ? d.competitions : []);
        Store.save('scholarships', Array.isArray(d.scholarships) ? d.scholarships : []);
        Store.save('downloads', Array.isArray(d.downloads) ? d.downloads : []);
        Store.save('evaluations', Array.isArray(d.evaluations) ? d.evaluations : []);
        Store.save('healthReports', Array.isArray(d.healthReports) ? d.healthReports : []);
        Store.save('timetable', Array.isArray(d.timetable) ? d.timetable : []);
        Store.write(Store.KEYS.noticeReads, d.noticeReads || {});
        if (d.meta) Store.write(Store.KEYS.meta, d.meta);
        Store.clearSession(); // 数据已变，强制重新登录
        Toast.success('备份恢复成功，页面即将刷新');
        setTimeout(function () { location.reload(); }, 800);
      }
    });
  }

  $('#btn-dm-export', container).addEventListener('click', function () {
    Utils.downloadFile('晴川学院班级管理系统备份_' + Utils.today() + '.json', JSON.stringify(buildBackup(), null, 2), 'application/json');
    Store.setPref('lastBackupAt', String(Date.now()));
    Store._log('系统', '导出备份', '全量数据备份');
    Toast.success('备份文件已导出，可直接通过微信/QQ 发送或存档');
    renderBackupStatus();
  });

  /* =====================================================
   * 运维工具：备份提醒 / 存储容量监控 / 数据体检
   * ===================================================== */

  /** 上次备份时间与超期提醒（超过 7 天红色警示） */
  function renderBackupStatus() {
    var el = $('#dm-backup-status', container);
    if (!el) return;
    var ts = Number(Store.getPref('lastBackupAt', '0') || 0);
    if (!ts) {
      el.innerHTML = UI.badge('从未备份，建议立即导出', 'danger');
      return;
    }
    var days = Math.floor((Date.now() - ts) / 86400000);
    var d = new Date(ts);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var text = '上次备份 ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    el.innerHTML = days >= 7
      ? UI.badge(text + '（已 ' + days + ' 天，建议重新备份）', 'danger')
      : UI.badge(text, 'success');
  }

  /** 存储容量统计：各实体占用（UTF-8 实际字节数）+ 5MB 水位进度 */
  function renderStorage() {
    var QUOTA = 5 * 1024 * 1024;
    var rows = Object.keys(Store.KEYS).map(function (name) {
      var key = Store.KEYS[name];
      var raw = localStorage.getItem(key) || '';
      var bytes = 0;
      try { bytes = new Blob([raw]).size; } catch (e) { bytes = raw.length * 2; }
      var count = 0;
      try {
        var v = JSON.parse(raw || 'null');
        if (Array.isArray(v)) count = v.length;
        else if (v && typeof v === 'object') count = Object.keys(v).length;
        else if (raw) count = 1;
      } catch (e) { /* 忽略解析失败 */ }
      return { name: name, label: Store.ENTITY_NAMES[name] || name, bytes: bytes, count: count };
    }).filter(function (r) { return r.bytes > 0; })
      .sort(function (a, b) { return b.bytes - a.bytes; });

    var total = rows.reduce(function (a, r) { return a + r.bytes; }, 0);
    var pct = Math.min(100, Math.round(total / QUOTA * 100));
    var fmt = function (b) {
      return b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB';
    };
    $('#dm-storage-total', container).innerHTML = '总占用 <b>' + fmt(total) + '</b> / 5 MB（' + pct + '%）';
    var fill = $('#dm-cap-fill', container);
    fill.style.width = pct + '%';
    fill.className = 'cap-fill' + (pct >= 80 ? ' cap-danger' : (pct >= 60 ? ' cap-warn' : ''));
    $('#dm-storage-detail', container).innerHTML =
      '<div class="table-wrap" style="margin-top:12px"><table class="table" style="min-width:520px"><thead><tr>' +
        '<th>数据实体</th><th>记录数</th><th>占用</th><th>占比</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + Utils.escapeHtml(r.label) + ' <small style="color:var(--muted)">' + Utils.escapeHtml(r.name) + '</small></td>' +
          '<td>' + r.count + '</td><td>' + fmt(r.bytes) + '</td>' +
          '<td>' + (total ? Math.round(r.bytes / total * 100) : 0) + '%</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (pct >= 80
        ? '<p style="color:var(--danger);font-size:13px;margin-top:10px">存储水位已超过 80%：请导出备份后清理历史学期数据（可按学期删除成绩/考勤），或迁移到后端数据库。</p>'
        : (pct >= 60
          ? '<p style="color:var(--warning);font-size:13px;margin-top:10px">存储水位超过 60%，请留意增长趋势，建议每学期末归档导出。</p>'
          : '<p style="color:var(--muted);font-size:12px;margin-top:10px">存储水位充足。按当前规模估算，单个班级每学期全部数据约 200-400KB。</p>'));
  }

  /**
   * 数据体检：扫描引用不存在学生/班级的孤儿数据
   * 覆盖：成绩、考勤、请假、健康日报、测验作答、作业提交、签到名单、竞赛获奖、奖助记录、课表、用户绑定
   */
  function integrityScan() {
    var stuIds = {}, clsIds = {};
    Store.list('students').forEach(function (s) { stuIds[s.id] = true; });
    Store.list('classes').forEach(function (c) { clsIds[c.id] = true; });
    var issues = [];
    function check(entity, label, predicate, fix) {
      var bad = Store.list(entity).filter(predicate);
      if (bad.length) issues.push({ entity: entity, label: label, count: bad.length, bad: bad, fix: fix });
    }
    check('scores', '成绩（学生不存在）', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
    check('attendance', '考勤（学生不存在）', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
    check('leaves', '请假申请（学生不存在）', function (r) { return !stuIds[r.studentId]; });
    check('healthReports', '健康日报（学生不存在）', function (r) { return !stuIds[r.studentId]; });
    check('quizAttempts', '测验作答（学生不存在）', function (r) { return !stuIds[r.studentId]; });
    check('submissions', '作业提交（学生不存在）', function (r) { return !stuIds[r.studentId]; });
    check('timetable', '课表（班级不存在）', function (r) { return !clsIds[r.classId]; });
    check('signins', '课堂签到（班级不存在）', function (r) { return !clsIds[r.classId]; });
    check('evaluations', '综测加减分（学生不存在）', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
    check('scholarships', '奖助记录（学生不存在）', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
    check('competitions', '竞赛获奖（含不存在的学生）', function (r) {
      return (r.studentIds || []).some(function (id) { return !stuIds[id]; });
    });
    // 用户绑定：教师任教班级失效 / 学生档案失效
    var badUsers = Store.list('users').filter(function (u) {
      if (u.role === 'teacher') {
        var ids = u.teacherClassIds || (u.classId ? [u.classId] : []);
        return ids.some(function (id) { return !clsIds[id]; });
      }
      if (u.role === 'student') return u.studentId && !stuIds[u.studentId];
      return false;
    });
    if (badUsers.length) issues.push({ entity: 'users', label: '用户绑定（指向已删除对象）', count: badUsers.length, bad: badUsers, users: true });
    return issues;
  }

  function renderCheckResult(issues) {
    var el = $('#dm-check-result', container);
    if (!issues.length) {
      el.innerHTML = '<div class="att-summary"><span class="chip chip-ok">数据体检通过 <b>未发现孤儿数据</b></span></div>';
      return;
    }
    var total = issues.reduce(function (a, i) { return a + i.count; }, 0);
    el.innerHTML =
      '<div class="att-summary"><span class="chip chip-bad">发现 <b>' + total + '</b> 条孤儿数据</span>' +
      issues.map(function (i) { return '<span class="chip chip-warn">' + Utils.escapeHtml(i.label) + ' <b>' + i.count + '</b></span>'; }).join('') +
      '</div><p style="color:var(--muted);font-size:12px;margin-top:8px">点击右上角「清理孤儿数据」可一键移除；清理仅删除上述失效记录，不影响有效数据。</p>';
  }

  $('#btn-dm-check', container).addEventListener('click', function () {
    renderCheckResult(integrityScan());
    Toast.info('数据体检完成');
  });

  $('#btn-dm-clean', container).addEventListener('click', function () {
    var issues = integrityScan();
    if (!issues.length) { Toast.success('未发现孤儿数据，无需清理'); return; }
    var total = issues.reduce(function (a, i) { return a + i.count; }, 0);
    UI.confirm({
      title: '清理孤儿数据',
      message: '将删除 ' + total + ' 条引用了已不存在学生/班级的记录（成绩/考勤/请假/健康/作答/奖助/课表/绑定等）。\n此操作只移除非孤儿数据之外的失效记录，不可撤销，确定继续吗？',
      onOk() {
        var stuIds = {}, clsIds = {};
        Store.list('students').forEach(function (s) { stuIds[s.id] = true; });
        Store.list('classes').forEach(function (c) { clsIds[c.id] = true; });
        var removed = 0;
        function clean(entity, predicate) {
          var before = Store.list(entity);
          var after = before.filter(function (r) { return !predicate(r); });
          removed += before.length - after.length;
          if (after.length !== before.length) Store.save(entity, after);
        }
        clean('scores', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
        clean('attendance', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
        clean('leaves', function (r) { return !stuIds[r.studentId]; });
        clean('healthReports', function (r) { return !stuIds[r.studentId]; });
        clean('quizAttempts', function (r) { return !stuIds[r.studentId]; });
        clean('submissions', function (r) { return !stuIds[r.studentId]; });
        clean('evaluations', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
        clean('scholarships', function (r) { return !stuIds[r.studentId] || (r.classId && !clsIds[r.classId]); });
        clean('timetable', function (r) { return !clsIds[r.classId]; });
        clean('signins', function (r) { return !clsIds[r.classId]; });
        clean('competitions', function (r) {
          var kept = (r.studentIds || []).filter(function (id) { return stuIds[id]; });
          if (kept.length !== (r.studentIds || []).length) r.studentIds = kept;
          return false; // 竞赛只清理失效学生引用，记录保留
        });
        // 用户绑定修复
        var users = Store.list('users');
        var fixed = 0;
        users.forEach(function (u) {
          if (u.role === 'teacher' && Array.isArray(u.teacherClassIds)) {
            var kept = u.teacherClassIds.filter(function (id) { return clsIds[id]; });
            if (kept.length !== u.teacherClassIds.length) { u.teacherClassIds = kept; u.classId = kept[0] || ''; fixed++; }
          }
          if (u.role === 'student' && u.studentId && !stuIds[u.studentId]) { u.studentId = ''; u.classId = ''; fixed++; }
        });
        if (fixed) Store.save('users', users);
        Store._log('系统', '清理孤儿数据', '删除 ' + removed + ' 条失效记录，修复 ' + fixed + ' 个用户绑定');
        Toast.success('清理完成：删除 ' + removed + ' 条记录，修复 ' + fixed + ' 个用户绑定');
        renderCheckResult(integrityScan());
        renderStorage();
      }
    });
  });

  /* 页面初始化：备份提醒 + 容量统计 */
  renderBackupStatus();
  renderStorage();

  $('#btn-dm-import-file', container).addEventListener('click', function () {
    $('#dm-file', container).click();
  });
  $('#dm-file', container).addEventListener('change', async function () {
    var file = this.files[0];
    if (!file) return;
    try {
      doRestore(await Utils.readFileText(file));
    } catch (err) {
      Toast.error(err.message);
    }
    this.value = '';
  });
  $('#btn-dm-import', container).addEventListener('click', function () {
    var text = $('#dm-json', container).value.trim();
    if (!text) { Toast.warning('请先选择备份文件或粘贴 JSON 内容'); return; }
    doRestore(text);
  });

  /* ---------------- 学生批量导入 ---------------- */

  $('#btn-dm-template', container).addEventListener('click', function () {
    var classes = Store.list('classes');
    var sampleClass = classes.length ? classes[0].name : '计科2501班';
    var rows = [CSV_HEADERS.join(',')].concat([
      ['S2024901', '张三', '男', '2009-01-15', sampleClass, '本科', '普通高考', '全日制', '13800000001', '13900000001', '幸福小区1号楼101室', '在读'],
      ['S2024902', '李四', '女', '2009-03-20', sampleClass, '', '', '', '13800000002', '13900000002', '', '']
    ].map(function (r) { return r.join(','); }));
    Utils.downloadFile('学生导入模板.csv', rows.join('\r\n'), 'text/csv');
    Toast.success('模板已下载');
  });

  $('#btn-dm-csv-file', container).addEventListener('click', function () {
    $('#dm-csv', container).click();
  });
  $('#dm-csv', container).addEventListener('change', async function () {
    var file = this.files[0];
    if (!file) return;
    try {
      // Excel 二进制文件无法在前端直接解析（无需任何依赖的取舍）：给出可直接照做的替代操作
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        Toast.warning('Excel 文件请这样导入：在 Excel 中全选名单 → 复制 → 粘贴到下方文本框（或另存为 CSV）', 6000);
        this.value = '';
        return;
      }
      var text = await Utils.readFileText(file);
      if (/^PK/.test(text) || /^\xD0\xCF\x11\xE0/.test(text)) {
        Toast.warning('这是 Excel 二进制文件：请在 Excel 中全选复制后粘贴到下方文本框，或另存为 CSV', 6000);
        this.value = '';
        return;
      }
      $('#dm-csv-text', container).value = text;
      Toast.info('文件已读取（分隔符自动识别），点击“校验并预览”继续');
    } catch (err) {
      Toast.error(err.message);
    }
    this.value = '';
  });

  /** 按导入内容推断班级属性，用于“一键创建缺失班级” */
  function guessClassMeta(name) {
    var enroll = '普通高考', study = '全日制', edu = '本科';
    if (name.indexOf('专升本') !== -1) enroll = '专升本';
    else if (name.indexOf('助学') !== -1) { enroll = '自考助学'; study = '非全日制'; }
    if (/专[科科]?班|专科/.test(name) && name.indexOf('专升本') === -1) edu = '专科';
    var digits = (name.match(/\d+/) || [''])[0];
    var grade;
    if (digits.length >= 8) grade = digits.slice(0, 4) + '级';        // 20252302 → 2025级
    else if (digits.length >= 4) grade = '20' + digits.slice(0, 2) + '级'; // 2301 → 2023级
    else grade = String(new Date().getFullYear()) + '级';
    return { name: name, grade: grade, eduLevel: edu, enrollType: enroll, studyForm: study, headTeacher: '', remark: '由学生导入时自动创建' };
  }

  /** 校验一行学生数据，返回错误信息（null 表示通过） */
  function validateRow(row, index, classMap, existingNos, seenNos) {
    var no = (row[0] || '').trim();
    var name = (row[1] || '').trim();
    var gender = (row[2] || '').trim() || '男';
    var birth = (row[3] || '').trim();
    var className = (row[4] || '').trim();
    var cls = classMap[className];
    var eduLevel = (row[5] || '').trim() || (cls ? cls.eduLevel : '') || '本科';
    // 兼容 v2 旧值：统招→普通高考、助学班→自考助学（专升本两版同名）
    var legacyMap = { '统招': '普通高考', '助学班': '自考助学' };
    var enrollType = (row[6] || '').trim();
    enrollType = legacyMap[enrollType] || enrollType || (cls ? cls.enrollType : '') || '普通高考';
    var studyForm = (row[7] || '').trim() || (enrollType ? Store.enrollForm(enrollType) : '') || '全日制';
    var phone = (row[8] || '').trim();
    var pphone = (row[9] || '').trim();
    var address = (row[10] || '').trim();
    var status = (row[11] || '').trim() || '在读';
    if (!no) return '学号为空';
    if (!name) return '姓名为空';
    if (existingNos[no] || seenNos[no]) return '学号 ' + no + ' 已存在（重复）';
    if (['男', '女'].indexOf(gender) === -1) return '性别应为 男/女，当前为“' + gender + '”';
    if (!Utils.isDateStr(birth)) return '出生日期格式应为 YYYY-MM-DD';
    if (!cls) return '班级“' + className + '”不存在';
    if (Store.EDU_LEVELS.indexOf(eduLevel) === -1) return '培养层次应为 本科/专科，当前为“' + eduLevel + '”';
    if (Store.ENROLL_TYPES.indexOf(enrollType) === -1) return '招生类别应为 普通高考/专升本/自考助学，当前为“' + enrollType + '”';
    if (Store.STUDY_FORMS.indexOf(studyForm) === -1) return '学习形式应为 全日制/非全日制，当前为“' + studyForm + '”';
    if (!Utils.isPhone(phone)) return '电话格式不正确';
    if (!Utils.isPhone(pphone)) return '家长电话格式不正确';
    if (['在读', '休学', '转出', '毕业'].indexOf(status) === -1) return '状态应为 在读/休学/转出/毕业';
    seenNos[no] = true;
    return null;
  }

  var validRows = []; // 校验通过、待确认导入的数据

  function runPreview() {
    var text = $('#dm-csv-text', container).value.trim();
    var previewEl = $('#dm-preview', container);
    validRows = [];
    if (!text) { Toast.warning('请先粘贴名单内容（或从 Excel 复制后粘贴）'); return; }

    var rows = Utils.parseCSV(text);
    if (!rows.length) { Toast.error('未解析到任何数据'); return; }
    // 表头检查（允许列名不完全一致，但列数须 >= 7）
    var header = rows[0];
    if (header[0] && header[0].indexOf('学号') !== -1) rows.shift(); // 跳过表头行
    if (rows.some(function (r) { return r.length < 9; })) {
      previewEl.innerHTML = UI.empty('CSV 列数不足（至少需要：学号、姓名、性别、出生日期、班级、培养层次、办学类型、电话、家长电话）');
      return;
    }

    // 班级名称 → 班级对象映射；现有学号集合
    var classMap = {};
    Store.list('classes').forEach(function (c) { classMap[c.name] = c; });
    var existingNos = {}, seenNos = {};
    Store.list('students').forEach(function (s) { existingNos[s.studentNo] = true; });

    // 收集名单中出现但系统里还没有的班级 → 支持一键创建（现场导入他校/他班名单时免去先建班级）
    var missingClasses = [];
    rows.forEach(function (row) {
      var nm = (row[4] || '').trim();
      if (nm && !classMap[nm] && missingClasses.indexOf(nm) === -1) missingClasses.push(nm);
    });

    var errors = [];
    rows.forEach(function (row, i) {
      // 兼容旧格式：
      // v1 九列（无类型列）：电话列在第 6 列 → 班级后补 3 个空类型列
      // v2 十一列（办学类型列）：电话在第 8 列 → 类型列后补「学习形式」空列
      var r = row;
      if (r.length === 9 && /^1\d{10}$/.test((r[5] || '').trim())) {
        r = r.slice(0, 5).concat(['', '', ''], r.slice(5));
      } else if (r.length === 11 && /^1\d{10}$/.test((r[7] || '').trim())) {
        r = r.slice(0, 7).concat([''], r.slice(7));
      }
      var err = validateRow(r, i, classMap, existingNos, seenNos);
      if (err) {
        errors.push({ line: i + 1, text: r.slice(0, 4).join(' '), reason: err });
      } else {
        var cls = classMap[(r[4] || '').trim()];
        var enroll = (r[6] || '').trim();
        enroll = ({ '统招': '普通高考', '助学班': '自考助学' })[enroll] || enroll || cls.enrollType || '普通高考';
        validRows.push({
          studentNo: (r[0] || '').trim(),
          name: (r[1] || '').trim(),
          gender: (r[2] || '').trim() || '男',
          birth: (r[3] || '').trim(),
          classId: cls.id,
          eduLevel: (r[5] || '').trim() || cls.eduLevel || '本科',
          enrollType: enroll,
          studyForm: (r[7] || '').trim() || Store.enrollForm(enroll),
          phone: (r[8] || '').trim(),
          parentPhone: (r[9] || '').trim(),
          address: (r[10] || '').trim(),
          status: (r[11] || '').trim() || '在读'
        });
      }
    });

    if (!validRows.length && !errors.length) {
      previewEl.innerHTML = UI.empty('没有解析到有效数据行');
      return;
    }

    var html = '<div class="dm-summary">' +
      UI.badge('可导入 ' + validRows.length + ' 条', 'success') + ' ' +
      UI.badge('错误 ' + errors.length + ' 条', errors.length ? 'danger' : 'muted') +
    '</div>';
    if (missingClasses.length) {
      html += '<div class="dm-summary" style="align-items:center">' +
        UI.badge('发现 ' + missingClasses.length + ' 个未创建的班级', 'warning') +
        '<span style="font-size:12.5px;color:var(--muted)">' + Utils.escapeHtml(missingClasses.join('、')) + '</span>' +
        '<button id="btn-dm-makeclass" class="btn btn-sm btn-ghost" type="button">＋ 一键创建并继续</button>' +
      '</div>';
    }
    if (errors.length) {
      html += '<div class="table-wrap"><table class="table" style="min-width:520px"><thead><tr><th>行号</th><th>内容</th><th>错误原因</th></tr></thead><tbody>' +
        errors.slice(0, 20).map(function (e) {
          return '<tr><td>' + e.line + '</td><td>' + Utils.escapeHtml(e.text) + '</td><td class="score-lo">' + Utils.escapeHtml(e.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (errors.length > 20 ? '<p style="color:var(--muted);font-size:12px">仅显示前 20 条错误…</p>' : '');
    }
    if (validRows.length) {
      html += '<button id="btn-dm-commit" class="btn btn-primary" type="button" style="margin-top:12px">确认导入 ' + validRows.length + ' 名学生</button>';
    }
    previewEl.innerHTML = html;

    var mkBtn = $('#btn-dm-makeclass', container);
    if (mkBtn) {
      mkBtn.addEventListener('click', function () {
        missingClasses.forEach(function (nm) {
          if (Store.list('classes').some(function (c) { return c.name === nm; })) return;
          Store.add('classes', guessClassMeta(nm));
        });
        Toast.success('已创建 ' + missingClasses.length + ' 个班级，正在重新校验…');
        runPreview();   // 重新校验：班级错误消失，可直接导入
      });
    }

    var commitBtn = $('#btn-dm-commit', container);
    if (commitBtn) {
      commitBtn.addEventListener('click', function () {
        var arr = Store.list('students');
        validRows.forEach(function (r) {
          r.id = Utils.uid();
          r.createdAt = new Date().toISOString();
          arr.push(r);
        });
        Store.save('students', arr);
        Store._log('学生管理', '批量导入', '成功导入 ' + validRows.length + ' 名学生' + (errors.length ? '，跳过 ' + errors.length + ' 条错误数据' : ''));
        Toast.success('成功导入 ' + validRows.length + ' 名学生');
        var imported = validRows.length;
        validRows = [];
        $('#dm-csv-text', container).value = '';
        // 导入完成：给出“当场查看结果”的直达入口（演示闭环）
        previewEl.innerHTML =
          '<div class="dm-summary">' + UI.badge('已导入 ' + imported + ' 名学生', 'success') + '</div>' +
          '<div class="toolbar-actions" style="margin-top:10px">' +
            '<a class="btn btn-primary" href="#/students">去学生管理查看名单</a>' +
            '<a class="btn btn-ghost" href="#/classes">查看班级</a>' +
          '</div>';
      });
    }
  }

  $('#btn-dm-preview', container).addEventListener('click', runPreview);

  /* ---------------- 导出记录（审计汇总） ---------------- */
  function renderExportLog() {
    var el = document.getElementById('dm-export-log');
    if (!el) return;
    // 导出类动作：动作名含「导出 / CSV / 下载」（覆盖 学生CSV/成绩单打印/考勤月报/综测公示表/奖助CSV/备份 等）
    var rows = Store.list('logs').filter(function (l) {
      var a = String(l.action || '');
      return a.indexOf('导出') !== -1 || a.indexOf('CSV') !== -1 || a.indexOf('打印') !== -1 || a.indexOf('备份') !== -1;
    }).sort(function (a, b) { return String(b.time || '').localeCompare(String(a.time || '')); });
    var total = rows.length;
    var last7 = rows.filter(function (l) { return String(l.time || '').slice(0, 10) >= Utils.daysAgo(7); }).length;
    var html = '<div class="dm-summary">' +
      '<span class="chip">累计 <b>' + total + '</b> 次</span>' +
      '<span class="chip chip-info">近 7 天 <b>' + last7 + '</b> 次</span>' +
      '<span class="chip">学生数据导出均写入审计日志，可在「操作日志」追溯</span>' +
      '</div>';
    if (!rows.length) {
      html += UI.empty('暂无导出记录：学生名单 / 成绩 / 考勤月报 / 综测公示表 / 奖助等导出都会记录在这里');
    } else {
      html += '<div class="table-wrap"><table class="table" style="min-width:560px"><thead><tr><th>时间</th><th>操作人</th><th>模块 / 动作</th><th>内容</th></tr></thead><tbody>' +
        rows.slice(0, 10).map(function (l) {
          return '<tr><td style="white-space:nowrap">' + Utils.escapeHtml(String(l.time || '').slice(0, 16)) + '</td>' +
            '<td>' + Utils.escapeHtml(l.userName || '—') + '</td>' +
            '<td>' + Utils.escapeHtml((l.module || '') + ' · ' + (l.action || '')) + '</td>' +
            '<td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + Utils.escapeHtml(String(l.detail || '')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (total > 10 ? '<p style="color:var(--muted);font-size:12px;margin-top:8px">仅显示最近 10 条，共 ' + total + ' 条；完整记录见「操作日志」（可导出 CSV）。</p>' : '');
    }
    el.innerHTML = html;
  }
  renderExportLog();

  /* =====================================================
   * 教务数据导入中心（成绩单 / 课表）
   * - 列名智能识别：不依赖固定列序，按表头关键词定位列
   * - 学期归一化：兼容「2025-2026学年第一学期 / 2025-2026-1 / 2025-2026-2」等写法
   * ===================================================== */

  /** 表头关键词 → 列号映射（返回 {key: colIndex}） */
  function detectColumns(header, spec) {
    var map = {};
    (header || []).forEach(function (h, i) {
      var name = String(h || '').replace(/\s/g, '').replace(/[（(].*?[)）]/g, '');
      if (!name) return;
      Object.keys(spec).forEach(function (key) {
        if (map[key] !== undefined) return;
        if (spec[key].some(function (kw) { return name.indexOf(kw) !== -1; })) map[key] = i;
      });
    });
    return map;
  }

  /**
   * 学年 + 学期序号 合并为学期键：('2025','1') / ('2025-2026','第一学期') / ('2025','3') → '2025-2026-1'
   * 正方教务的成绩单与课表常把学年、学期拆成两列，学期列里只写 1/2/一/二
   */
  function termFromYearSeq(yearTxt, seqTxt) {
    var y = String(yearTxt || '').trim();
    var s = String(seqTxt || '').trim();
    if (!y || !s) return '';
    var ym = y.match(/(\d{4})\s*[-—~\/]\s*(\d{4})/);
    var y1, y2;
    if (ym) { y1 = ym[1]; y2 = ym[2]; }
    else {
      var m = y.match(/(\d{4})/);
      if (!m) return '';
      y1 = m[1]; y2 = String(Number(y1) + 1);
    }
    var n = '';
    var sm = s.match(/([一二12])\s*(?:学期|期)?/) || s.match(/([12])/);
    if (sm) n = (sm[1] === '一' ? '1' : (sm[1] === '二' ? '2' : sm[1]));
    else if (s.indexOf('秋') !== -1) n = '1';
    else if (s.indexOf('春') !== -1) n = '2';
    if (n !== '1' && n !== '2') return '';      // 小学期（3）系统无对应学期，交由默认学期处理
    return y1 + '-' + y2 + '-' + n;
  }

  /** 从表头上方若干行里找班级名（正方导出的标题常写「XX班 课表」） */
  function detectClassFromTitle(rows, upto, classMap) {
    var text = rows.slice(0, upto).map(function (r) { return (r || []).join(' '); }).join(' ');
    var names = Object.keys(classMap).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < names.length; i++) {
      if (text.indexOf(names[i]) !== -1) return classMap[names[i]];
    }
    return null;
  }

  /** 从表头上方若干行里找学期（正方导出标题常写「2025-2026学年第一学期」） */
  function detectTermFromTitle(rows, upto) {
    var text = rows.slice(0, upto).map(function (r) { return (r || []).join(' '); }).join(' ');
    return normalizeTerm(text);
  }

  /* =====================================================
   * 正方「周课表矩阵」解析
   * 表头形如：节次 | 星期一 | 星期二 … 星期日（列名可能是 周一/星期1）
   * 单元格形如：'数据结构\n王建国\n实2-302\n1-16周' 或 '数据结构/王建国/实2-302/1-16周'
   *          或 '数据结构(王建国,实2-302)1-16周'，一格多门课时按行/分号拆开
   * ===================================================== */

  /** 矩阵表头识别：返回 {星期序号: 列号}，不足两天视为非矩阵 */
  function detectMatrixDays(header) {
    var cols = {};
    (header || []).forEach(function (h, i) {
      var t = String(h || '').replace(/\s/g, '');
      // 只认「纯日名」表头：星期一 / 周一 / 星期1 …… 不能用 normalizeDay（它会把「3-4节」也算成周三）
      var m = t.match(/^(?:星期|周)([一二三四五六日天1-7])$/);
      if (!m) return;
      var chMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
      var d = chMap[m[1]] || parseInt(m[1], 10);
      if (d >= 1 && d <= 7) cols[d] = i;
    });
    return Object.keys(cols).length >= 3 ? cols : null;   // 真矩阵至少 3 天，长表数据行不会命中
  }

  var PLACE_RE = /楼|室|场|馆|厅|中心|园|区|号|机房|实验室|操场|一教|二教|三教|四教|教学楼/;

  /** 单行小段分类：周次 / 地点 / 教师 / 课程（按内容特征判断，不依赖顺序） */
  function classifySegment(seg) {
    var t = String(seg || '').trim();
    if (!t) return '';
    if (/周/.test(t) && /\d/.test(t)) return 'weeks';
    if (PLACE_RE.test(t)) return 'room';
    if (/^[A-Za-z]{1,4}\d+([-–—]\d+)?$/.test(t)) return 'room';               // A307 / B2-201
    if (/^\d{3,4}$/.test(t)) return 'room';                                    // 302
    if (/^[\u4e00-\u9fa5]{0,3}[A-Za-z]?\d+[-–—]\d+$/.test(t)) return 'room';   // 实1-201 / 教2-302
    return 'text';
  }

  /** 括号配平：从网页表格复制来的单元格若含逗号会被 CSV 拆成多格，这里按未闭合的括号合并回去 */
  function mergeUnbalancedCells(row) {
    function cnt(s, ch) { var n = 0; for (var i = 0; i < s.length; i++) if (s[i] === ch) n++; return n; }
    var out = [];
    for (var i = 0; i < row.length; i++) {
      var cell = String(row[i] == null ? '' : row[i]);
      var guard = 0;
      while (cnt(cell, '(') + cnt(cell, '（') > cnt(cell, ')') + cnt(cell, '）') && i + 1 < row.length && guard < 8) {
        i++;
        cell += ',' + String(row[i] == null ? '' : row[i]);
        guard++;
      }
      out.push(cell);
    }
    return out;
  }

  /**
   * 解析一个单元格 → [{course, teacher, room, weeks}, ...]
   * 切分：换行 / 分号 = 一段（可能是一门课的一行，也可能是同一格里并列的另一门课）；
   * 段内再按 / | │ 制表符、连续空格、逗号 拆，括号里的「(教师,地点)」也拆出来一起归类；
   * 归类：含「周」+数字 → 周次；楼室号样式 → 地点；教师名单命中、或 2~4 个汉字且不是已知课程名 → 教师；
   * 其余第一段充当课程名；课程名在「已有课程名 + 已有教师/地点」之后再次出现 → 视为下一门课。
   * 教师/地点靠特征判断，预览表会列出来，导入前可先核对。
   */
  function parseTimetableCell(cell, teacherSet, courseSet) {
    var out = [], cur = null;
    function flush() { if (cur && cur.course) out.push(cur); cur = null; }
    function feed(seg, kind) {
      if (!cur) cur = { course: '', teacher: '', room: '', weeks: '' };
      if (kind === 'weeks') { cur.weeks = (cur.weeks ? cur.weeks + ' ' : '') + seg; return; }
      if (kind === 'room' && !cur.room) { cur.room = seg; return; }
      var isTeacherWord = teacherSet.indexOf(seg.replace(/\s/g, '')) !== -1;
      var isCourseWord = courseSet.indexOf(seg.replace(/\s/g, '')) !== -1;
      if (!cur.course) { cur.course = seg; return; }
      if (!cur.teacher && !isCourseWord && (isTeacherWord || /^[\u4e00-\u9fa5]{2,4}$/.test(seg))) { cur.teacher = seg; return; }
      if (isTeacherWord && cur.teacher && cur.teacher !== seg) { cur.teacher += '/' + seg; return; }
      if ((cur.teacher || cur.room) && kind === 'text') {        // 另一门课
        flush(); cur = { course: seg, teacher: '', room: '', weeks: '' }; return;
      }
      cur.course += ' ' + seg;                                   // 其余并入课程名
    }
    String(cell || '').split(/\r?\n|[;；]+/).forEach(function (chunk) {
      var line = String(chunk || '').trim();
      if (!line) return;
      var extras = [];
      line = line.replace(/[(（]([^)）]*)[)）]/g, function (all, inner) {
        inner.split(/[,，、;；]+/).forEach(function (x) { if (String(x).trim()) extras.push(String(x).trim()); });
        return ' ';
      });
      var segs = line.split(/[\/|│\t]+|\s{2,}|[,，]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (segs.length === 1 && /\s/.test(segs[0])) segs = segs[0].split(/\s+/);   // 「课程 教师 地点 周次」
      segs.concat(extras).forEach(function (seg) { feed(seg, classifySegment(seg)); });
    });
    flush();
    return out;
  }


  /** 学期文本归一化：'2025-2026学年第一学期' / '2025-2026第一学期' / '2025—2026-1' → '2025-2026-1'；已是键则原样返回 */
  function normalizeTerm(txt) {
    var t = String(txt || '').trim();
    if (!t) return '';
    // 注意：'学年'/'学期' 里的「学」必须整体可选，否则 '2025-2026第一学期'、'2025—2026-1' 这类写法会解析失败
    var m = t.match(/(\d{4})\s*[-—~至]\s*(\d{4})\s*学?年?\s*第?\s*([一二12])\s*(?:学期|期)?/) ||
            t.match(/(\d{4})\s*[-—~]\s*(\d{4})\s*[-—~]\s*([12])/);
    if (m) return m[1] + '-' + m[2] + '-' + (m[3] === '一' ? '1' : (m[3] === '二' ? '2' : m[3]));
    if (/^\d{4}-\d{4}-[12]$/.test(t)) return t;
    return '';
  }

  /** 星期归一化：'周三' / '星期三' / '3' → 1~7；非法返回 0 */
  function normalizeDay(txt) {
    var t = String(txt || '').trim();
    var m = t.match(/[周星期]\s*([一二三四五六日天1-7])/);
    var ch = m ? m[1] : t;
    var chMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    if (chMap[ch]) return chMap[ch];
    var n = parseInt(ch, 10);
    return (n >= 1 && n <= 7) ? n : 0;
  }

  /** 节次归一化：'3-4节' / '三四节' / '第7节' / '7' → [3,4]（单节次数组）；非法返回 [] */
  function normalizePeriods(txt) {
    var t = String(txt || '').trim();
    if (!t) return [];
    var chMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 };
    var nums = [];
    (t.match(/十[一二]|[一二三四五六七八九十]|\d+/g) || []).forEach(function (seg) {
      if (/^\d+$/.test(seg)) { nums.push(parseInt(seg, 10)); return; }
      if (chMap[seg]) nums.push(chMap[seg]);
    });
    if (!nums.length) return [];
    var from = nums[0], to = nums.length >= 2 ? nums[1] : nums[0];
    if (to < from) { var tmp = from; from = to; to = tmp; }
    if (from < 1 || to > 12) return [];
    var out = [];
    for (var p = from; p <= to; p++) out.push(p);
    return out;
  }

  $('#btn-edu-score-tpl', container).addEventListener('click', function () {
    Utils.downloadFile('教务成绩单导入模板.csv',
      '学号,姓名,科目,考试名称,分数,学分,课程性质,学期\r\n2025990401001,林一舟,软件工程,期末考试,85,3,必修,2025-2026-2\r\n2025230401046,张三,人工智能,期末考试,92,2,选修,2025-2026-2\r\n',
      'text/csv');
    Toast.success('成绩单模板已下载');
  });
  $('#btn-edu-tt-tpl', container).addEventListener('click', function () {
    Utils.downloadFile('教务课表导入模板.csv',
      '班级,星期,节次,课程,教师,地点,学期\r\n计科20252302班,周三,1-2节,Python程序设计,李秀芳,实验楼B201,2026-2027-1\r\n计科20252302班,周三,3-4节,大数据分析,王建国,一教A307,2026-2027-1\r\n',
      'text/csv');
    Toast.success('课表模板已下载');
  });
  /** Excel/CSV 文件 → 二维数组 → TSV 文本（复用下方的粘贴式解析器，读取失败给出可执行的下一步） */
  async function readSheetToTextarea(f, taId, previewBtnId) {
    try {
      var rows = await Utils.readSheetFile(f);
      if (!rows.length) { Toast.warning('文件里没有数据（首个工作表为空）'); return; }
      document.getElementById(taId).value = Utils.rowsToTSV(rows);
      Toast.info('已读取「' + f.name + '」（' + rows.length + ' 行），正在校验…');
      var btn = document.getElementById(previewBtnId);
      if (btn) btn.click();   // 读取后直接进入预览，少点一步
    } catch (e) {
      Toast.error(e.message);
    }
  }
  $('#btn-edu-score-file', container).addEventListener('click', function () { $('#edu-score-file', container).click(); });
  $('#edu-score-file', container).addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    readSheetToTextarea(f, 'edu-score-text', 'btn-edu-score-preview');
    this.value = '';
  });
  $('#btn-edu-tt-file', container).addEventListener('click', function () { $('#edu-tt-file', container).click(); });
  $('#edu-tt-file', container).addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    readSheetToTextarea(f, 'edu-tt-text', 'btn-edu-tt-preview');
    this.value = '';
  });

  /* ---------- 成绩单导入 ---------- */

  var SCORE_SPEC = {
    studentNo: ['学号', '学生学号'],
    name: ['姓名', '学生姓名'],
    subject: ['科目', '课程名称', '课程', '课程名'],
    examName: ['考试名称', '考试', '考核方式', '考试性质'],
    score: ['分数', '总评成绩', '成绩', '得分'],
    credit: ['学分'],
    nature: ['课程性质', '性质', '修读', '课程属性'],
    term: ['学期', '学年学期'],
    year: ['学年']                      // 正方常把学年单列，与「学期（1/2）」合并
  };

  $('#btn-edu-score-preview', container).addEventListener('click', function () {
    var text = $('#edu-score-text', container).value.trim();
    var previewEl = $('#edu-score-preview', container);
    previewEl.innerHTML = '';
    if (!text) { Toast.warning('请先粘贴 CSV 内容或选择文件'); return; }
    var rows = Utils.parseCSV(text);
    if (!rows.length) { Toast.error('未解析到任何数据'); return; }
    var header = rows[0];
    var cols = detectColumns(header, SCORE_SPEC);
    // 有表头（能识别到学号列且首行不像数据）则跳过首行
    var hasHeader = cols.studentNo !== undefined && String(header[cols.studentNo] || '').indexOf('学号') !== -1;
    if (hasHeader) rows = rows.slice(1);
    // 考试名称列已可缺省（默认记「总评」），识别表头只要求 学号 + 科目 + 分数，避免误退化为固定列序
    if (cols.studentNo === undefined || cols.subject === undefined || cols.score === undefined) {
      // 未识别到表头：按固定列序（学号,姓名,科目,考试名称,分数,学分,课程性质,学期）
      cols = { studentNo: 0, name: 1, subject: 2, examName: 3, score: 4, credit: 5, nature: 6, term: 7 };
      Toast.info('未识别到表头，已按模板列序解析');
    }

    var stuMap = {};
    Store.list('students').forEach(function (s) { stuMap[s.studentNo] = s; });
    var errors = [], valid = [];
    rows.forEach(function (row, i) {
      var get = function (k) { return cols[k] === undefined ? '' : String(row[cols[k]] || '').trim(); };
      var studentNo = get('studentNo');
      var subject = get('subject');
      var examName = get('examName') || '总评';    // 正方等教务导出的成绩单通常是总评成绩，无「考试名称」列
      var scoreTxt = get('score');
      var line = i + (hasHeader ? 2 : 1);
      if (!studentNo) { errors.push({ line: line, text: subject, reason: '学号为空' }); return; }
      var stu = stuMap[studentNo];
      if (!stu) { errors.push({ line: line, text: studentNo + ' ' + subject, reason: '学号 ' + studentNo + ' 不存在于系统中' }); return; }
      if (!subject) { errors.push({ line: line, text: studentNo, reason: '科目为空' }); return; }
      var score = Number(scoreTxt);
      if (scoreTxt === '' || isNaN(score) || score < 0 || score > 100) {
        errors.push({ line: line, text: studentNo + ' ' + subject, reason: '分数应为 0~100，当前为“' + scoreTxt + '”' });
        return;
      }
      var term = normalizeTerm(get('term')) || termFromYearSeq(get('year'), get('term')) ||
        ($('#edu-score-term', container) ? $('#edu-score-term', container).value : '') || Store.currentTerm();
      var creditTxt = get('credit');
      var credit = creditTxt === '' ? '' : Number(creditTxt);
      if (creditTxt !== '' && (isNaN(credit) || credit <= 0)) {
        errors.push({ line: line, text: studentNo + ' ' + subject, reason: '学分应为正数，当前为“' + creditTxt + '”' });
        return;
      }
      valid.push({
        studentId: stu.id, classId: stu.classId, studentNo: studentNo, stuName: stu.name,
        subject: subject, examName: examName, score: score,
        credit: credit, nature: get('nature'), term: term,
        date: get('date') || Utils.today()
      });
    });

    var html = '<div class="dm-summary">' +
      UI.badge('可导入 ' + valid.length + ' 条', 'success') + ' ' +
      UI.badge('错误 ' + errors.length + ' 条', errors.length ? 'danger' : 'muted') +
      '</div>';
    if (errors.length) {
      html += '<div class="table-wrap"><table class="table" style="min-width:520px"><thead><tr><th>行号</th><th>内容</th><th>错误原因</th></tr></thead><tbody>' +
        errors.slice(0, 20).map(function (e) {
          return '<tr><td>' + e.line + '</td><td>' + Utils.escapeHtml(e.text) + '</td><td class="score-lo">' + Utils.escapeHtml(e.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (errors.length > 20 ? '<p style="color:var(--muted);font-size:12px">仅显示前 20 条错误…</p>' : '');
    }
    if (valid.length) {
      html += '<div class="table-wrap" style="margin-top:10px"><table class="table" style="min-width:640px"><thead><tr>' +
        '<th>学号</th><th>姓名</th><th>科目</th><th>考试</th><th>分数</th><th>学分</th><th>性质</th><th>学期</th></tr></thead><tbody>' +
        valid.slice(0, 8).map(function (v) {
          return '<tr><td>' + Utils.escapeHtml(v.studentNo) + '</td><td>' + Utils.escapeHtml(v.stuName) + '</td>' +
            '<td>' + Utils.escapeHtml(v.subject) + '</td><td>' + Utils.escapeHtml(v.examName) + '</td>' +
            '<td><b>' + v.score + '</b></td><td>' + (v.credit === '' ? '—' : v.credit) + '</td>' +
            '<td>' + (v.nature ? Utils.escapeHtml(v.nature) : '—') + '</td><td>' + Store.termText(v.term) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (valid.length > 8 ? '<p style="color:var(--muted);font-size:12px">预览前 8 条，共 ' + valid.length + ' 条…</p>' : '') +
        '<button id="btn-edu-score-commit" class="btn btn-primary" type="button" style="margin-top:12px">确认导入 ' + valid.length + ' 条成绩</button>';
    }
    previewEl.innerHTML = html;

    var commitBtn = $('#btn-edu-score-commit', container);
    if (commitBtn) {
      commitBtn.addEventListener('click', function () {
        var arr = Store.list('scores');
        var inserted = 0, updated = 0;
        valid.forEach(function (v) {
          var rec = arr.find(function (x) {
            return x.studentId === v.studentId && x.subject === v.subject && x.examName === v.examName && x.term === v.term;
          });
          if (rec) {
            rec.score = v.score;
            if (v.credit !== '') rec.credit = v.credit;
            if (v.nature) rec.nature = v.nature;
            rec.date = v.date;
            updated++;
          } else {
            arr.push({
              id: Utils.uid(), studentId: v.studentId, classId: v.classId,
              subject: v.subject, examName: v.examName, score: v.score,
              credit: v.credit, nature: v.nature, date: v.date, term: v.term,
              createdAt: new Date().toISOString()
            });
            inserted++;
          }
        });
        Store.save('scores', arr);
        Store._log('成绩管理', '教务成绩单导入', '新增 ' + inserted + ' 条、覆盖 ' + updated + ' 条，来源：教务导出 CSV');
        Toast.success('导入完成：新增 ' + inserted + ' 条，覆盖更新 ' + updated + ' 条');
        previewEl.innerHTML = UI.empty('导入完成（新增 ' + inserted + ' · 覆盖 ' + updated + '）');
        $('#edu-score-text', container).value = '';
      });
    }
  });

  /* ---------- 课表导入 ---------- */

  var TT_SPEC = {
    className: ['班级', '行政班', '班级名称'],
    day: ['星期'],
    period: ['节次', '节'],
    course: ['课程名称', '课程', '科目'],
    teacher: ['教师', '任课教师', '授课教师'],
    room: ['地点', '教室', '上课地点'],
    weeks: ['上课周次', '周次', '周数'],
    term: ['学期', '学年学期']
  };

  $('#btn-edu-tt-preview', container).addEventListener('click', function () {
    var text = $('#edu-tt-text', container).value.trim();
    var previewEl = $('#edu-tt-preview', container);
    previewEl.innerHTML = '';
    if (!text) { Toast.warning('请先粘贴 CSV 内容或选择文件'); return; }
    var rows = Utils.parseCSV(text);
    if (!rows.length) { Toast.error('未解析到任何数据'); return; }

    var classMap = {};
    Store.list('classes').forEach(function (c) { classMap[c.name] = c; });
    var defClassId = $('#edu-tt-class', container) ? $('#edu-tt-class', container).value : '';
    var defTerm = $('#edu-tt-term', container) ? $('#edu-tt-term', container).value : '';

    // ---- 形态二：正方「周课表矩阵」（表头里出现「星期一…星期日」）----
    var headerIdx = -1, dayCols = null;
    for (var r = 0; r < Math.min(rows.length, 3); r++) {
      var d = detectMatrixDays(rows[r]);
      if (d) { headerIdx = r; dayCols = d; break; }
    }
    if (dayCols) {
      var cls = detectClassFromTitle(rows, headerIdx, classMap);
      if (!cls && defClassId) cls = Store.getClass(defClassId);
      var mTerm = detectTermFromTitle(rows, headerIdx) || defTerm || Store.currentTerm();
      var mErrors = [], mValid = [], mNotes = [];
      if (!cls) {
        mErrors.push({ line: headerIdx + 1, text: '未识别到班级', reason: '矩阵课表里没有班级信息，请在上方「默认班级」中选择本课表所属班级' });
      }
      // 教师名单（系统里的教师账号名 + 现有课表里出现过的教师名）与课程名单，
      // 用于把单元格里的短词正确认成「教师」而不是「另一门课」
      var teacherSet = [];
      Store.list('users').forEach(function (u) { if (u.name) teacherSet.push(u.name); });
      Store.list('timetable').forEach(function (t) { if (t.teacher) String(t.teacher).split(/[\/、,，]/).forEach(function (n) { if (n.trim()) teacherSet.push(n.trim()); }); });
      var courseSet = (Store.COURSES || []).slice();
      Store.list('scores').forEach(function (s) { if (s.subject && courseSet.indexOf(s.subject) === -1) courseSet.push(s.subject); });
      Store.list('timetable').forEach(function (t) { if (t.course && courseSet.indexOf(t.course) === -1) courseSet.push(t.course); });

      rows.slice(headerIdx + 1).forEach(function (rawRow, ri) {
        var row = mergeUnbalancedCells(rawRow);      // 网页复制来的单元格可能被逗号拆开，先合并回去
        var line = headerIdx + ri + 2;
        var label = String(row[0] || '').trim();
        if (!label) return;
        var periods = normalizePeriods(label);
        if (!periods.length) return;                       // 「上午/下午/备注」这类分行，跳过
        if (!cls) return;
        Object.keys(dayCols).forEach(function (dayKey) {
          var cell = String(row[dayCols[dayKey]] || '').trim();
          if (!cell) return;
          var items = parseTimetableCell(cell, teacherSet, courseSet);
          if (items.length > 1) {
            mNotes.push(Store.WEEKDAYS[Number(dayKey) - 1] + ' 第 ' + periods.join('、') + ' 节有 ' + items.length +
              ' 门课（' + items.map(function (x) { return x.course; }).join('、') + '）：系统每个时段只存一门，已导入第一门，请到「班级课表」手工调整。');
          }
          if (!items.length) {
            mErrors.push({ line: line, text: label + ' ' + Store.WEEKDAYS[Number(dayKey) - 1], reason: '单元格里没有解析出课程名：' + cell.slice(0, 20) });
            return;
          }
          var it = items[0];
          mValid.push({
            classId: cls.id, className: cls.name, day: Number(dayKey), periods: periods,
            course: it.course, teacher: it.teacher, room: it.room, weeks: it.weeks, term: mTerm
          });
        });
      });
      previewEl.innerHTML = renderTTPreview(mValid, mErrors, mNotes, '矩阵（周课表）', cls ? cls.name : '');
      bindTTCommit(mValid);
      return;
    }

    // ---- 形态一：长表（一行一节课）----
    var header = rows[0];
    var cols = detectColumns(header, TT_SPEC);
    var hasHeader = cols.className !== undefined && String(header[cols.className] || '').indexOf('班级') !== -1;
    if (hasHeader) rows = rows.slice(1);
    if (cols.className === undefined || cols.day === undefined || cols.period === undefined || cols.course === undefined) {
      cols = { className: 0, day: 1, period: 2, course: 3, teacher: 4, room: 5, term: 6 };
      Toast.info('未识别到表头，已按模板列序解析');
    }

    var errors = [], valid = [];
    var defCls = defClassId ? Store.getClass(defClassId) : null;
    rows.forEach(function (row, i) {
      var get = function (k) { return cols[k] === undefined ? '' : String(row[cols[k]] || '').trim(); };
      var line = i + (hasHeader ? 2 : 1);
      var className = get('className');
      var cls = classMap[className];
      if (!className && defCls) { cls = defCls; className = defCls.name; }
      if (!className) { errors.push({ line: line, text: '', reason: '班级为空' }); return; }
      if (!cls) { errors.push({ line: line, text: className, reason: '班级“' + className + '”不存在' }); return; }
      var day = normalizeDay(get('day'));
      if (!day) { errors.push({ line: line, text: className + ' ' + get('day'), reason: '星期无法识别（应如 周三 / 3）' }); return; }
      var periods = normalizePeriods(get('period'));
      if (!periods.length) {
        errors.push({ line: line, text: className + ' ' + get('period'), reason: '节次无法识别（应如 3-4节 / 第7节 / 7）' });
        return;
      }
      var course = get('course');
      if (!course) { errors.push({ line: line, text: className, reason: '课程为空' }); return; }
      valid.push({
        classId: cls.id, className: className, day: day, periods: periods,
        course: course, teacher: get('teacher'), room: get('room'), weeks: get('weeks'),
        term: normalizeTerm(get('term')) || termFromYearSeq(get('year'), get('term')) || defTerm || Store.currentTerm()
      });
    });
    previewEl.innerHTML = renderTTPreview(valid, errors, [], '长表', '');
    bindTTCommit(valid);
  });

  /** 课表预览渲染（长表 / 矩阵共用） */
  function renderTTPreview(valid, errors, notes, modeLabel, classLabel) {
    var html = '<div class="dm-summary">' +
      UI.badge('可导入 ' + valid.reduce(function (a, v) { return a + v.periods.length; }, 0) + ' 节', 'success') + ' ' +
      UI.badge('错误 ' + errors.length + ' 条', errors.length ? 'danger' : 'muted') + ' ' +
      UI.badge('识别为' + modeLabel + (classLabel ? ' · ' + classLabel : ''), 'info') +
      '</div>';
    if (errors.length) {
      html += '<div class="table-wrap"><table class="table" style="min-width:520px"><thead><tr><th>行号</th><th>内容</th><th>错误原因</th></tr></thead><tbody>' +
        errors.slice(0, 20).map(function (e) {
          return '<tr><td>' + e.line + '</td><td>' + Utils.escapeHtml(e.text) + '</td><td class="score-lo">' + Utils.escapeHtml(e.reason) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (errors.length > 20 ? '<p style="color:var(--muted);font-size:12px">仅显示前 20 条错误…</p>' : '');
    }
    if (notes && notes.length) {
      html += '<div class="info-bar" style="margin-top:10px">' + Utils.escapeHtml(notes.slice(0, 3).join(' ')) +
        (notes.length > 3 ? '（另有 ' + (notes.length - 3) + ' 处）' : '') + '</div>';
    }
    if (valid.length) {
      html += '<div class="table-wrap" style="margin-top:10px"><table class="table" style="min-width:680px"><thead><tr>' +
        '<th>班级</th><th>星期</th><th>节次</th><th>课程</th><th>教师</th><th>地点</th><th>周次</th></tr></thead><tbody>' +
        valid.slice(0, 10).map(function (v) {
          return '<tr><td>' + Utils.escapeHtml(v.className) + '</td><td>' + Store.WEEKDAYS[v.day - 1] + '</td>' +
            '<td>第 ' + v.periods.join('、') + ' 节</td><td><b>' + Utils.escapeHtml(v.course) + '</b></td>' +
            '<td>' + Utils.escapeHtml(v.teacher || '—') + '</td><td>' + Utils.escapeHtml(v.room || '—') + '</td>' +
            '<td>' + Utils.escapeHtml(v.weeks || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (valid.length > 10 ? '<p style="color:var(--muted);font-size:12px">预览前 10 条，共 ' + valid.length + ' 行（按节次展开为 ' +
          valid.reduce(function (a, v) { return a + v.periods.length; }, 0) + ' 节）…</p>' : '') +
        '<button id="btn-edu-tt-commit" class="btn btn-primary" type="button" style="margin-top:12px">确认导入 ' +
          valid.reduce(function (a, v) { return a + v.periods.length; }, 0) + ' 节课</button>';
    }
    return html;
  }

  /** 绑定课表导入按钮（长表 / 矩阵共用）：同班级+同星期+同节次+同学期 → 覆盖更新 */
  function bindTTCommit(valid) {
    var btn = $('#btn-edu-tt-commit', container);
    if (!btn || !valid.length) return;
    btn.addEventListener('click', function () {
      var arr = Store.list('timetable');
      var count = 0, inserted = 0, updated = 0;
      valid.forEach(function (v) {
        v.periods.forEach(function (p) {
          var rec = arr.find(function (x) {
            return x.classId === v.classId && Number(x.day) === v.day && Number(x.period) === p && x.term === v.term;
          });
          if (rec) {
            rec.course = v.course; rec.teacher = v.teacher; rec.room = v.room;
            if (v.weeks) rec.weeks = v.weeks;
            updated++;
          } else {
            arr.push({
              id: Utils.uid(), classId: v.classId, term: v.term, day: v.day, period: p,
              course: v.course, teacher: v.teacher, room: v.room, weeks: v.weeks || '',
              createdAt: new Date().toISOString()
            });
            inserted++;
          }
          count++;
        });
      });
      Store.save('timetable', arr);
      Store._log('班级课表', '教务课表导入', '新增 ' + inserted + ' 节、覆盖 ' + updated + ' 节，来源：教务导出文件');
      Toast.success('导入完成：新增 ' + inserted + ' 节，覆盖更新 ' + updated + ' 节');
      $('#edu-tt-preview', container).innerHTML = UI.empty('导入完成（新增 ' + inserted + ' · 覆盖 ' + updated + '，共 ' + count + ' 节）');
      $('#edu-tt-text', container).value = '';
    });
  }
};
