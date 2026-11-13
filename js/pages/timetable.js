/* =====================================================
 * 班级课表（管理员 / 教师 / 学生通用）
 * - 周视图网格：行为节次（1~12，按上午/下午/晚上分组）、列为星期
 * - 单元格显示：课程 / 教师·教室 / 周次
 * - 学生：固定展示本班课表；教师/管理员：可切换任教/任意班级
 * - 数据来源：教务系统导出课表（见「数据管理 → 教务数据导入 → 课表」）
 * ===================================================== */

/* 12 节次时刻表（45 分钟一节，课间 5 分钟；晚间为常见安排）——文件级常量：仪表盘「今日课程」也使用 */
var TT_PERIOD_TIMES = {
  1: ['0800', '0845'], 2: ['0850', '0935'], 3: ['0950', '1035'], 4: ['1040', '1125'],
  5: ['1400', '1445'], 6: ['1450', '1535'], 7: ['1550', '1635'], 8: ['1640', '1725'],
  9: ['1900', '1945'], 10: ['1950', '2035'], 11: ['2040', '2125'], 12: ['2130', '2215']
};

Pages.timetable = function (container, user) {
  var PERIOD_TIMES = TT_PERIOD_TIMES;
  var isStudent = Auth.isStudent(user);
  var stu = isStudent && user.studentId ? Store.getStudent(user.studentId) : null;
  var classes = Auth.visibleClasses(user);
  /* 「我的课表」：学生从教务网页复制表格粘贴导入，存本机（cms_my_timetable，不进共享库）；
   * 用于重修、选课等与班级课表不同的个人情形。来源可在两份课表间切换。 */
  var mySlots = Store.getPref('myTimetable', '');
  try { mySlots = mySlots ? JSON.parse(mySlots) : []; } catch (e) { mySlots = []; }
  var state = {
    classId: isStudent ? (stu ? stu.classId : '') : (classes[0] ? classes[0].id : ''),
    term: UI.termFilter.fallback(),
    source: (isStudent && mySlots.length) ? 'mine' : 'class'
  };
  function saveMySlots() {
    Store.setPref('myTimetable', JSON.stringify(mySlots));
  }

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">班级课表</div>' +
        '<div class="toolbar-actions">' +
          (isStudent
            ? '<span class="chip">' + Utils.escapeHtml(stu ? Store.className(stu.classId) : '未绑定班级') + '</span>'
            : '<select id="tt-class" class="input">' +
                UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '请选择班级') +
              '</select>') +
          '<select id="tt-term" class="input">' +
            Store.allTerms().map(function (t) {
              return '<option value="' + t + '"' + (t === state.term ? ' selected' : '') + '>' + Store.termText(t) + '</option>';
            }).join('') +
          '</select>' +
          '<button id="btn-tt-ics" class="btn btn-ghost" type="button">导出到手机日历</button>' +
          (isStudent ? '<button id="btn-tt-import" class="btn btn-ghost" type="button">导入我的课表</button>' : '') +
          (isStudent && mySlots.length ? '<button id="btn-tt-clear" class="btn btn-danger-ghost" type="button">清除我的课表</button>' : '') +
        '</div>' +
      '</div>' +
      (isStudent ? '<div id="tt-src-bar" class="att-summary" style="margin:-4px 0 10px"></div>' : '') +
      '<div id="tt-grid"></div>' +
    '</div>';

  if (!isStudent) {
    $('#tt-class', container).addEventListener('change', function () {
      state.classId = this.value;
      render();
    });
  }
  $('#tt-term', container).addEventListener('change', function () {
    state.term = this.value;
    render();
  });
  $('#btn-tt-ics', container).addEventListener('click', exportICS);
  if (isStudent) {
    $('#btn-tt-import', container).addEventListener('click', openImport);
  }
  render();

  /* ---------------- 「我的课表」导入（超级课程表式：粘贴即可，无需任何账号） ----------------
   * 支持两种粘贴形态（从教务网页或 Excel 复制都会得到这两种之一）：
   *  A. 矩阵：第一列节次，后面各列星期一~星期日，格内"课程 教师 地点"或仅课程
   *  B. 长表：每行"星期 节次 课程 (教师)(地点)"，表头可有可无
   * 只存在本机（cms_my_timetable），不进共享库，不影响他人。 */
  function normalizeDayLabel(t) {
    var m = String(t || '').replace(/\s/g, '').match(/^(?:星期|周)([一二三四五六日天1-7])$/);
    if (!m) return 0;
    var map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
    if (map[m[1]]) return map[m[1]];
    var n = parseInt(m[1], 10);
    return (n >= 1 && n <= 7) ? n : 0;
  }
  function normalizePeriodLabel(t) {
    var txt = String(t || '').replace(/第|节/g, '').replace(/[（(].*?[)）]/g, '').trim();
    var nums = txt.match(/\d{1,2}/g) || [];
    if (nums.length >= 2) {
      var a = parseInt(nums[0], 10), b = parseInt(nums[1], 10);
      var out = [];
      for (var k = Math.min(a, b); k <= Math.max(a, b); k++) { if (k >= 1 && k <= 12) out.push(k); }
      return out;
    }
    if (nums.length === 1) { var v = parseInt(nums[0], 10); return (v >= 1 && v <= 12) ? [v] : []; }
    var cnMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 };
    var cn = txt.match(/[一二三四五六七八九十]+/g) || [];
    var vals = cn.map(function (x) { return cnMap[x]; }).filter(Boolean);
    return vals.length ? vals : [];
  }
  function parseMyTimetable(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    var out = [];
    // 形态判定：第一行里是否含 3 个及以上「星期X / 周X」表头 → 矩阵
    var headCols = [];
    (lines[0] || '').split(/[\t,，]+/).forEach(function (h, i) {
      var d = normalizeDayLabel(h);
      if (d) headCols.push({ col: i, day: d });
    });
    if (headCols.length >= 2) {   // 两列星期也算矩阵（如只有周一/周三的实践课表）
      lines.slice(1).forEach(function (ln) {
        var cells = ln.split(/[\t,，]+/).map(function (x) { return x.trim(); });
        var periods = normalizePeriodLabel(cells[0]);
        if (!periods.length) return;
        headCols.forEach(function (hc) {
          var cell = cells[hc.col] || '';
          if (!cell) return;
          // 格内可能是"课程/教师/地点"或"课程(教师,地点)"或仅课程；同一格多门课用换行/分号分隔
          String(cell).split(/[;；\n]+/).forEach(function (chunk) {
            var t = chunk.trim();
            if (!t) return;
            // 统一规则：空格/斜杠分隔「课程 教师 地点」，括号备注（如（重修））保留在课程名里——
            // 规则可预期，预览里能看到解析结果，不合意就调整粘贴文本
            var seg = t.split(/[\/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
            var course = seg[0] || t, teacher = seg[1] || '', room = seg[2] || '';
            if (!course) return;
            periods.forEach(function (pp) {
              out.push({ _eid: Utils.uid(), day: hc.day, period: pp, course: course, teacher: teacher, room: room });
            });
          });
        });
      });
      return out;
    }
    // 长表：星期 / 节次 / 课程 (…)；支持制表符或逗号分隔
    lines.forEach(function (ln, idx) {
      var cells = ln.split(/[\t,，]+/).map(function (x) { return x.trim(); });
      if (cells.length < 3 && idx === 0) return;   // 可能是表头
      var day = normalizeDayLabel(cells[0]);
      var periods = normalizePeriodLabel(cells[1]);
      if (!day && normalizeDayLabel(cells[1])) {   // 兼容「星期,节次」列序（星期在第一列）
        day = normalizeDayLabel(cells[1]);
        periods = normalizePeriodLabel(cells[0]);
      }
      if (!day || !periods.length) return;
      var rest = cells.slice(2).join(' ');
      var seg2 = rest.split(/[\/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      var course = seg2[0] || rest, teacher = seg2[1] || '', room = seg2[2] || '';
      if (!course) return;
      periods.forEach(function (pp) {
        out.push({ _eid: Utils.uid(), day: day, period: pp, course: course, teacher: teacher, room: room });
      });
    });
    return out;
  }

  function bindImportFile(mask) {
    var fileBtn = mask.querySelector('#tt-imp-file');
    var input = mask.querySelector('#tt-imp-input');
    if (!fileBtn || !input || input._bound) return;
    input._bound = true;
    fileBtn.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', async function () {
      var f = this.files[0];
      if (!f) return;
      try {
        var rows = await Utils.readSheetFile(f);
        if (!rows.length) { Toast.warning('文件里没有数据（首个工作表为空）'); return; }
        mask.querySelector('#tt-imp-text').value = Utils.rowsToTSV(rows);
        Toast.info('已读取「' + f.name + '」（' + rows.length + ' 行），正在解析…');
        var parseBtn = Array.from(mask.querySelectorAll('button')).filter(function (b) { return b.textContent.replace(/\s/g, '') === '解析并预览'; })[0];
        if (parseBtn) parseBtn.click();   // 与粘贴同一条解析链路
      } catch (e) {
        Toast.error(e.message);
      }
      this.value = '';
    });
  }

  function openImport() {
    UI.modal({
      title: '导入我的课表',
      wide: true,
      submitText: '解析并预览',
      body:
        '<p style="color:var(--muted);font-size:12.5px;line-height:1.8">' +
          '像超级课程表一样把课表装进来，但<b>不需要登录教务账号</b>：打开学校教务系统的课表页面（或辅导员下发的课表），' +
          '<b>全选复制</b>后粘贴到下面——支持「节次 × 星期」矩阵和「星期,节次,课程…」长表两种格式（从网页或 Excel 复制均可）。' +
          '课表只保存在<b>你自己的浏览器</b>里，不影响班级课表，可随时清除。</p>' +
        '<div class="toolbar-actions" style="margin:0 0 8px"><button id="tt-imp-file" class="btn btn-ghost btn-sm" type="button">选择 Excel / CSV 文件</button>' +
          '<input id="tt-imp-input" type="file" accept=".xlsx,.xls,.csv" style="display:none"></div>' +
        UI.formRow('或粘贴课表文本', '<textarea id="tt-imp-text" class="input" rows="10" placeholder="例（矩阵）：\n节次\t星期一\t星期二\t…\n1-2节\t数据结构 王建国 A101\t…\n\n例（长表）：\n周三,1-2节,嵌入式系统应用开发,顾承泽,实2-303"></textarea>', true) +
        '<div id="tt-imp-preview" style="margin-top:10px"></div>',
      onSubmit: function (root, close) {
        var text = document.getElementById('tt-imp-text').value.trim();
        if (!text) return Toast.warning('请先粘贴课表文本');
        var parsed = parseMyTimetable(text);
        if (!parsed.length) return Toast.warning('没有解析出课程：请确认复制的是完整课表（含星期与节次）');
        // 预览
        var daysTxt = [1, 2, 3, 4, 5, 6, 7].map(function (d) {
          var n = parsed.filter(function (x) { return x.day === d; }).length;
          return n ? '周' + '一二三四五六日'[d - 1] + ' ' + n + ' 节' : '';
        }).filter(Boolean).join('，');
        document.getElementById('tt-imp-preview').innerHTML =
          '<div class="dm-summary">' + UI.badge('解析到 ' + parsed.length + ' 节课', 'success') + ' ' +
            '<span class="chip">' + Utils.escapeHtml(daysTxt) + '</span></div>' +
          '<div class="table-wrap" style="max-height:220px;overflow:auto"><table class="table"><thead><tr><th>星期</th><th>节次</th><th>课程</th><th>教师</th><th>地点</th></tr></thead><tbody>' +
          parsed.slice(0, 12).map(function (x) {
            return '<tr><td>周' + '一二三四五六日'[x.day - 1] + '</td><td>第 ' + x.period + ' 节</td><td><b>' + Utils.escapeHtml(x.course) + '</b></td><td>' +
              Utils.escapeHtml(x.teacher || '—') + '</td><td>' + Utils.escapeHtml(x.room || '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (parsed.length > 12 ? '<p style="color:var(--muted);font-size:12px">仅预览前 12 节，共 ' + parsed.length + ' 节</p>' : '') +
          '<div class="toolbar-actions" style="margin-top:10px"><button id="tt-imp-save" class="btn btn-primary" type="button">保存为我的课表（' + parsed.length + ' 节）</button></div>';
        document.getElementById('tt-imp-save').addEventListener('click', function () {
          mySlots = parsed;
          saveMySlots();
          state.source = 'mine';
          Store._log('班级课表', '导入我的课表', parsed.length + ' 节（存本机）');
          Toast.success('已保存：本学期个人课表 ' + parsed.length + ' 节（存本机，可随时清除）');
          close();
          render();
        });
      }
    });
    bindImportFile(Array.from(document.querySelectorAll('.modal-mask')).pop());
  }

  /* ---------------- 课表导出 .ics（导入手机系统日历） ---------------- */

  /** 节次时间表（45 分钟一节，课间 5 分钟；晚间为常见安排） */

  /** 学期开学日：已知的按真实校历填写，未知按惯例推算（9 月第一个周一 / 3 月第一个周一） */
  function termStart(term) {
    var KNOWN = { '2026-2027-1': '2026-09-07' }; // 真实校历：本学期 2026-09-07 正式上课
    if (KNOWN[term]) return KNOWN[term];
    var p = String(term || '').split('-');
    if (p.length !== 3) return Utils.today();
    var year = p[2] === '1' ? +p[0] : +p[1];
    var month = p[2] === '1' ? 8 : 2; // 0-based：9 月 / 3 月
    var d = new Date(Date.UTC(year, month, 1));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); // 首个周一
    return Utils.formatDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** 解析上课周次文本：'1-3,5-9周' → [[1,3],[5,9]]；空 → [[1,20]] */
  function parseWeeks(txt) {
    var t = String(txt || '');
    var nums = t.match(/\d+/g);
    if (!nums) return [[1, 20]];
    var list = [];
    for (var i = 0; i < nums.length; i += 2) {
      var a = parseInt(nums[i], 10);
      var b = nums[i + 1] ? parseInt(nums[i + 1], 10) : a;
      if (a && b) list.push([Math.min(a, b), Math.max(a, b)]);
    }
    return list.length ? list : [[1, 20]];
  }

  /** ICS 文本转义（RFC 5545） */
  function esc(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  /** 日期 + n 天 → YYYYMMDD */
  function addDays(dateStr, n) {
    var p = String(dateStr).split('-');
    var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    dt.setUTCDate(dt.getUTCDate() + n);
    return String(dt.getUTCFullYear()) + String(dt.getUTCMonth() + 1).padStart(2, '0') + String(dt.getUTCDate()).padStart(2, '0');
  }

  function exportICS() {
    var mine = state.source === 'mine' && isStudent;
    var slots = mine ? mySlots : Store.list('timetable').filter(function (t) {
      return t.classId === state.classId && Store.termMatch(t.term, state.term);
    });
    if (!slots.length) { Toast.warning('当前学期没有可导出的课表数据'); return; }
    var tStart = termStart(state.term);
    var stamp = Utils.nowStr().replace(/[-: ]/g, '').slice(0, 15) + 'Z';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'PRODID:-//QCUWH//Class Management System//CN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + esc((mine ? (stu ? stu.name + ' 的课表' : '我的课表') : Store.className(state.classId) + ' 课表') + ' · ' + (mine ? '个人' : Store.termText(state.term)))
    ];
    var count = 0;
    slots.forEach(function (s) {
      var times = PERIOD_TIMES[Number(s.period)] || ['0800', '0845'];
      parseWeeks(s.weeks).forEach(function (rg, gi) {
        var dtStart = addDays(tStart, (rg[0] - 1) * 7 + (Number(s.day) - 1));
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + s.id + '-' + rg[0] + '-' + gi + '@qcu-cms');
        lines.push('DTSTAMP:' + stamp);
        lines.push('DTSTART:' + dtStart + 'T' + times[0] + '00');
        lines.push('DTEND:' + dtStart + 'T' + times[1] + '00');
        lines.push('RRULE:FREQ=WEEKLY;COUNT=' + (rg[1] - rg[0] + 1));
        lines.push('SUMMARY:' + esc(s.course));
        if (s.room) lines.push('LOCATION:' + esc(s.room));
        lines.push('DESCRIPTION:' + esc((s.teacher ? '教师：' + s.teacher + '；' : '') +
          '第 ' + rg[0] + '-' + rg[1] + ' 周 · ' + ((PERIOD_TIMES[s.period] ? '第 ' + s.period + ' 节' : '第 ' + s.period + ' 节'))));
        lines.push('END:VEVENT');
        count++;
      });
    });
    lines.push('END:VCALENDAR');
    Utils.downloadFile((mine ? '我的课表' : Store.className(state.classId)) + '_课表_' + (mine ? '个人' : (state.term || '')) + '.ics',
      lines.join('\r\n'), 'text/calendar');
    Toast.success('已生成 .ics 日历文件（' + count + ' 组课程），用手机打开即可导入系统日历');
    Store._log('班级课表', '导出iCS', Store.className(state.classId) + ' · ' + Store.termText(state.term) + ' · ' + count + ' 组');
  }

  /** 来源切换条：每次 render 重建（保存 / 清除后 chip 计数与清除按钮必须跟着变） */
  function renderSourceBar() {
    var bar = document.getElementById('tt-src-bar');
    if (!bar) return;
    bar.innerHTML =
      '<span class="chip dl-cat-chip' + (state.source === 'mine' ? ' chip-info' : '') + '" data-src="mine" style="cursor:pointer">我的课表 <b>' + mySlots.length + '</b> 节</span>' +
      '<span class="chip dl-cat-chip' + (state.source === 'class' ? ' chip-info' : '') + '" data-src="class" style="cursor:pointer">班级课表</span>' +
      '<span style="color:var(--muted);font-size:12px">重修、选课等个人情形可粘贴教务网页的课表生成「我的课表」（存本机）</span>' +
      (mySlots.length ? '<button id="btn-tt-clear" class="btn btn-danger-ghost btn-sm" type="button">清除我的课表</button>' : '');
    $$('[data-src]', bar).forEach(function (el) {
      el.addEventListener('click', function () { state.source = el.dataset.src; render(); });
    });
    var clr = document.getElementById('btn-tt-clear');
    if (clr) clr.addEventListener('click', function () {
      UI.confirm({
        title: '清除我的课表',
        message: '将清空导入的个人课表（不影响班级课表），确定吗？',
        onOk() { mySlots = []; saveMySlots(); state.source = 'class'; Toast.success('已清除'); render(); }
      });
    });
  }

  function render() {
    if (isStudent) renderSourceBar();
    var grid = $('#tt-grid', container);
    if (!state.classId) {
      grid.innerHTML = UI.empty('暂无可展示的班级课表');
      return;
    }
    var slots;
    var mine = state.source === 'mine' && isStudent;
    // 编辑权限：管理员 / 数据范围覆盖该班级的教师与辅导员；「我的课表」本人可编辑
    // （每次 render 时重算——教师切换班级下拉后，权限要跟着新班级走）
    var canEditTT = mine ? true
      : (Auth.isAdmin(user) || Auth.scopeClassIds(user).indexOf(state.classId) !== -1);
    if (mine) {
      slots = mySlots;   // 个人课表不分学期（反映当前实际）
    } else {
      slots = Store.list('timetable').filter(function (t) {
        return t.classId === state.classId && Store.termMatch(t.term, state.term);
      });
    }
    if (!slots.length) {
      grid.innerHTML = UI.empty(mine
        ? '还没有「我的课表」：点上方「导入我的课表」，把教务网页里的课表粘贴进来'
        : Store.termText(state.term) + ' 暂无课表数据' +
          (isStudent ? '' : '，可在「数据管理 → 教务数据导入 → 课表」中导入教务导出文件'));
      return;
    }

    // 数据中出现的星期列（默认周一至周五，有周末课时自动扩展）
    // 恒定显示 周一~周日：部分专业周六/周日有课（此前「无课即隐藏」会让这些列看不到，
    // 周日还会连带「今天」高亮消失）。空列保留，反而能明确表达「这天没有课」。
    var days = Store.WEEKDAYS.map(function (w, i) { return { idx: i + 1, label: w }; });

    /* 教学周计算：今天在第几教学周 + 今天列高亮（仅当查看的学期包含今天） */
    var tStart = termStart(state.term);
    var todayStr = Utils.today();
    var dow = new Date(todayStr + 'T00:00:00').getDay(); // 0=周日
    var todayIdx = dow === 0 ? 7 : dow;
    var weekNo = 0;
    if (todayStr >= tStart) {
      var diff = Math.floor((new Date(todayStr + 'T00:00:00') - new Date(tStart + 'T00:00:00')) / 86400000);
      weekNo = Math.floor(diff / 7) + 1;
      if (weekNo > 25) weekNo = 0; // 超过 25 周视为非本学期
    }
    var cls = Store.getClass(state.classId);
    var seq = cls ? Store.termSeq(cls.grade, state.term) : 0;
    var infoLine = '<div class="att-summary" style="margin-bottom:12px">' +
      '<span class="chip">' + Utils.escapeHtml(Store.termText(state.term)) + '</span>' +
      (seq ? '<span class="chip chip-info">' + Utils.escapeHtml(cls.grade) + ' · 第 <b>' + Store.numToCn(seq) + '</b> 学期</span>' : '') +
      '<span class="chip">开学 <b>' + Utils.escapeHtml(tStart) + '</b></span>' +
      (weekNo
        ? '<span class="chip chip-ok">今天是第 <b>' + weekNo + '</b> 教学周（' + Store.WEEKDAYS[todayIdx - 1] + '）</span>'
        : '<span class="chip">当前不在本教学周范围内</span>') +
      '</div>';

    // 数据中用到的最大节次（默认到第 8 节，晚上有课自动扩展到 12）
    var maxPeriod = 8;
    slots.forEach(function (s) { maxPeriod = Math.max(maxPeriod, Number(s.period) || 0); });

    var html = infoLine + '<div class="tt-wrap"><table class="tt-table"><thead><tr><th class="tt-period">节次</th>' +
      days.map(function (d) {
        var cls = (weekNo && d.idx === todayIdx) ? ' class="tt-today"' : '';
        return '<th' + cls + '>' + d.label + (weekNo && d.idx === todayIdx ? ' · 今天' : '') + '</th>';
      }).join('') + '</tr></thead><tbody>';
    Store.PERIOD_GROUPS.forEach(function (group) {
      if (group.from > maxPeriod) return;
      var to = Math.min(group.to, maxPeriod);
      html += '<tr class="tt-group"><td colspan="' + (days.length + 1) + '">' + group.label + '（第 ' + group.from + '-' + to + ' 节）</td></tr>';
      for (var p = group.from; p <= to; p++) {
        html += '<tr><td class="tt-period">第 ' + p + ' 节</td>';
        days.forEach(function (d) {
          var isToday = weekNo && d.idx === todayIdx;
          var tdAttr = isToday ? ' class="tt-today"' : '';
          var cell = slots.filter(function (s) {
            return Number(s.day) === d.idx && Number(s.period) === p;
          });
          if (!cell.length) {
            html += '<td class="tt-empty' + (isToday ? ' tt-today' : '') + '"' +
              (canEditTT ? ' data-add="' + d.idx + '-' + p + '" title="点击新增课程"' : '') + '></td>';
          } else {
            html += '<td' + tdAttr + '>' + cell.map(function (s) {
              return '<div class="tt-slot' + (canEditTT ? ' tt-editable' : '') + '"' +
                (canEditTT ? ' data-edit="' + (s._eid || s.id) + '" title="点击编辑"' : '') + '>' +
                '<b>' + Utils.escapeHtml(s.course) + '</b>' +
                '<small>' + Utils.escapeHtml(s.teacher || '') + (s.room ? ' · ' + Utils.escapeHtml(s.room) : '') + '</small>' +
                (s.weeks ? '<small class="tt-weeks">' + Utils.escapeHtml(s.weeks) + '</small>' : '') +
              '</div>';
            }).join('') + '</td>';
          }
        });
        html += '</tr>';
      }
    });
    html += '</tbody></table></div>' +
      '<p style="color:var(--muted);font-size:12px;margin-top:12px">' +
      Utils.escapeHtml(Store.className(state.classId)) + ' · ' + Store.termText(state.term) +
      ' · 共 ' + slots.length + ' 节课。课表数据可在「数据管理 → 教务数据导入 → 课表」中按教务导出格式批量更新。</p>';
    grid.innerHTML = html;
    if (canEditTT) {
      $$('#tt-grid .tt-slot.tt-editable', container).forEach(function (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function () { openSlotEdit(el.dataset.edit); });
      });
      $$('#tt-grid td.tt-empty[data-add]', container).forEach(function (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function () {
          var pp = el.dataset.add.split('-');
          openSlotEdit(null, { day: parseInt(pp[0], 10), period: parseInt(pp[1], 10) });
        });
      });
    }
  }

  /**
   * 单格编辑：id 为空 = 新增（empty 给出 星期/节次）。
   * 班级课表写共享库（Store），「我的课表」写本机（cms_my_timetable）。
   */
  function openSlotEdit(id, addPos) {
    var isMine = state.source === 'mine' && isStudent;
    var editMask = null;
    var rec = null, ctx = null;
    if (isMine) {
      // 「我的课表」条目在本机数组里，用 _eid 定位
      ctx = mySlots.filter(function (x) { return String(x._eid) === String(id); })[0] || null;
    } else {
      rec = id ? Store.find('timetable', id) : null;
      ctx = rec || null;
    }
    if (id && !ctx) { Toast.warning('这条课程已被删除，请刷新页面'); render(); return; }
    if (!ctx) ctx = { day: addPos.day, period: addPos.period, course: '', teacher: '', room: '', weeks: '' };
    editMask = UI.modal({
      title: (id ? '编辑课程' : '新增课程') + ' · 周' + '一二三四五六日'[ctx.day - 1] + ' 第 ' + ctx.period + ' 节' +
        (isMine ? '（我的课表）' : '（' + Store.className(state.classId) + '）'),
      submitText: id ? '保 存' : '新 增',
      body:
        UI.formRow('课程名称', '<input id="f-tt-course" class="input" value="' + Utils.escapeHtml(ctx.course || '') + '">', true) +
        '<div class="form-grid">' +
          UI.formRow('教师', '<input id="f-tt-teacher" class="input" value="' + Utils.escapeHtml(ctx.teacher || '') + '">') +
          UI.formRow('地点', '<input id="f-tt-room" class="input" value="' + Utils.escapeHtml(ctx.room || '') + '">') +
          UI.formRow('上课周次', '<input id="f-tt-weeks" class="input" value="' + Utils.escapeHtml(ctx.weeks || '') + '" placeholder="如：1-16周（留空=全部周）">') +
        '</div>' +
        (id ? '<div class="toolbar-actions"><button id="f-tt-del" class="btn btn-danger-ghost" type="button">删除这节课</button></div>' : ''),
      onSubmit: function (root, close) {
        var course = document.getElementById('f-tt-course').value.trim();
        if (!course) return Toast.warning('请填写课程名称');
        var data = {
          course: course,
          teacher: document.getElementById('f-tt-teacher').value.trim(),
          room: document.getElementById('f-tt-room').value.trim(),
          weeks: document.getElementById('f-tt-weeks').value.trim()
        };
        if (isMine) {
          if (id) {
            var hit = mySlots.filter(function (x) { return String(x._eid) === String(id); })[0];
            if (hit) Object.assign(hit, data);
          } else {
            mySlots.push(Object.assign({ _eid: Utils.uid(), day: ctx.day, period: ctx.period }, data));
          }
          saveMySlots();
        } else if (rec) {
          Store.update('timetable', rec.id, data);
        } else {
          Store.add('timetable', Object.assign({ id: Utils.uid(), classId: state.classId, term: state.term, day: ctx.day, period: ctx.period }, data));
        }
        Store._log('班级课表', id ? '编辑课程' : '新增课程', '周' + ctx.day + ' 第 ' + ctx.period + ' 节 · ' + course +
          '（' + (isMine ? '我的课表' : Store.className(state.classId)) + '）');
        Toast.success(id ? '课程已更新' : '课程已添加');
        close();
        render();
      }
    });
    // 删除（二次确认；「我的课表」从本机数组移除，班级课表走 Store.remove）
    var del = document.getElementById('f-tt-del');
    if (del) del.addEventListener('click', function () {
      UI.confirm({
        title: '删除这节课',
        message: '确定删除「' + (ctx.course || '') + '」（周' + ctx.day + ' 第 ' + ctx.period + ' 节）吗？',
        onOk() {
          if (isMine) {
            mySlots = mySlots.filter(function (x) { return String(x._eid) !== String(id); });
            saveMySlots();
          } else if (rec) {
            Store.remove('timetable', rec.id);
          }
          Store._log('班级课表', '删除课程', '周' + ctx.day + ' 第 ' + ctx.period + ' 节 · ' + (ctx.course || '') +
            '（' + (isMine ? '我的课表' : Store.className(state.classId)) + '）');
          Toast.success('已删除');
          if (editMask) editMask._close();   // 关闭编辑弹窗（确认框已自行关闭）
          render();
        }
      });
    });
  }
};
