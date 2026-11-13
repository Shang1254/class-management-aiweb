/* =====================================================
 * 升学 · 就业（学生端）
 * -----------------------------------------------------
 * 面向毕业后三条主要去向，把系统里已有的数据变成**可直接使用的材料**：
 *   ① 考研/复试：成绩排名证明、在校学业信息卡（GPA + 排名 + 获奖 + 资助 + 学生工作）
 *   ② 出国留学：英文成绩单（English Transcript，含 GPA 与绩点算法说明、课程英文名对照）
 *   ③ 考公考编/就业：一页式「在校表现信息卡」（可打印/另存 PDF，作为报名与简历附件）
 *   ④ 学年成绩单（一页 A4，两学期并列）
 * 打印版式：**统一为「一张连续表格」的教务表格样式**——标题、信息行、节标题行、明细行、
 * 落款行、页脚说明全部落在同一个列网格里，边框/灰底表头/居中规则完全一致，跨页自动重复表头。
 * 所有材料均为参考模板，正式证明须经学院/教务处审核盖章（表内已预留盖章位）。
 * ===================================================== */

Pages.career = function (container, user) {
  var stu = getMyStudent(user);
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  var cls = Store.getClass(stu.classId);
  var major = Store.majorOf(cls);

  // 学业口径：在校全部成绩（升学材料默认看全部在校成绩）
  var all = Store.academicSummary(stu.id, '');
  var rank = Store.classRankOf(stu.id, stu.classId, '');
  var yearKey = (function () {   // 最近学年（取学年里最后一个有数据的年份区间）
    var terms = {};
    Store.list('scores').filter(function (s) { return s.studentId === stu.id; })
      .forEach(function (s) { if (s.term) terms[String(s.term).split('-').slice(0, 2).join('-')] = true; });
    var list = Object.keys(terms).sort();
    return list.length ? list[list.length - 1] : null;
  })();
  var yearSum = yearKey ? Store.academicSummary(stu.id, yearKey) : null;
  var awards = Store.list('competitions').filter(function (c) { return (c.studentIds || []).indexOf(stu.id) !== -1; });
  var aids = Store.list('scholarships').filter(function (s) { return s.studentId === stu.id; });
  var works = Store.list('evaluations').filter(function (e) { return e.studentId === stu.id; });

  // 资格参考：与学生端/辅导员端共用同一套口径（Store.qualifyOf）
  var qualify = Store.qualifyOf(stu.id, stu.classId);
  var RULES = qualify.rules;
  var passCount = qualify.passCount;

  function esc(v) { return Utils.escapeHtml(String(v == null ? '' : v)); }
  function dash(v) { return (v === null || v === undefined || v === '') ? '—' : esc(v); }

  container.innerHTML =
    // ---- 顶部：身份与学业概览 ----
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">升学 · 就业</div>' +
        '<div class="toolbar-actions"><span class="chip">' + esc(Store.className(stu.classId)) + '</span>' +
          '<span class="chip chip-info">' + esc(major.name) + (major.en ? ' · ' + esc(major.en) : '') + '</span></div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12.5px;margin:-6px 0 12px">' +
        '把系统里的学业数据变成毕业后要用的材料：<b>考研复试</b>用成绩排名证明与学业信息卡，<b>出国留学</b>用英文成绩单，' +
        '<b>考公考编/就业</b>用一页式在校表现信息卡。以下材料均为参考模板，<b>正式证明须经学院/教务处审核盖章</b>（打印稿为统一表格版式，可直接另存 PDF）。' +
      '</p>' +
      '<div class="stat-grid">' +
        '<div class="stat-card"><div class="stat-label">学分加权平均分</div><div class="stat-value">' + dash(all.weightedAvg) + '</div>' +
          '<div class="stat-sub">在校 ' + all.count + ' 门课程 · 共 ' + dash(all.credits) + ' 学分</div></div>' +
        '<div class="stat-card"><div class="stat-label">平均学分绩点（GPA）</div><div class="stat-value">' + dash(all.gpa) + '</div>' +
          '<div class="stat-sub">4.0 制（学分加权）</div></div>' +
        '<div class="stat-card"><div class="stat-label">班级学业排名</div><div class="stat-value">' + (rank.rank ? '第 ' + rank.rank + ' 名' : '—') + '</div>' +
          '<div class="stat-sub">参评 ' + rank.total + ' 人' + (yearKey ? ' · 最近学年 ' + esc(yearKey + '学年') + ' GPA ' + dash(yearSum.gpa) : '') + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">获奖 / 资助</div><div class="stat-value">' + awards.length + ' / ' + aids.length + '</div>' +
          '<div class="stat-sub">竞赛获奖 / 奖助学金记录</div></div>' +
      '</div>' +
    '</div>' +

    // ---- 四份材料 ----
    '<div class="card">' +
      '<div class="chart-title">可生成的材料 <span style="color:var(--muted);font-size:12px;font-weight:400">（均为统一表格版式，表内预留盖章位）</span></div>' +
      '<div class="eval-grid">' +
        '<div class="dl-item" style="display:block">' +
          '<div class="dl-name">① 在校学业信息卡（中文 · 一页）</div>' +
          '<div class="dl-desc">学籍信息 + 学业成绩（加权平均分/GPA/班级排名/不及格门数）+ 竞赛获奖 + 奖助学金 + 学生工作记录 + 联系方式。' +
          '<b>用于</b>：考研复试材料、考公考编报名附件、就业简历附录。</div>' +
          '<div class="dl-actions"><button class="btn btn-sm btn-primary" type="button" data-print="card">预览 · 打印</button>' +
            '<a class="btn btn-sm btn-ghost" href="#/my-scores">核对我的成绩</a></div>' +
        '</div>' +
        '<div class="dl-item" style="display:block">' +
          '<div class="dl-name">② English Transcript（英文成绩单）</div>' +
          '<div class="dl-desc">英文表头 + 课程（英文名对照）/学分/性质/成绩/绩点 + GPA 算法与 4.0 分对照说明，附教务处盖章位。' +
          '<b>用于</b>：留学申请（正式英文翻译件由教务处出具）。</div>' +
          '<div class="dl-actions"><button class="btn btn-sm btn-primary" type="button" data-print="en">预览 · 打印</button>' +
            '<a class="btn btn-sm btn-ghost" href="#/downloads">留学材料模板</a></div>' +
        '</div>' +
        '<div class="dl-item" style="display:block">' +
          '<div class="dl-name">③ 学年成绩单（一页 A4）</div>' +
          '<div class="dl-desc">按学年汇总：课程 × 第一/第二学期成绩、学分、性质与学年绩点，附学年加权平均分、GPA 与盖章位。' +
          '<b>用于</b>：家长沟通、奖学金材料、留学申请的学年成绩概况。</div>' +
          '<div class="dl-actions">' +
            '<select id="ca-year" class="input" style="max-width:150px"></select>' +
            '<button class="btn btn-sm btn-primary" type="button" data-print="year">预览 · 打印</button></div>' +
        '</div>' +
        '<div class="dl-item" style="display:block">' +
          '<div class="dl-name">④ 学业成绩排名证明（参考稿）</div>' +
          '<div class="dl-desc">含学分加权平均分、GPA、班级排名与参评人数，落款处预留学院/教务处盖章位。' +
          '<b>用于</b>：考研复试、奖学金与推免材料。</div>' +
          '<div class="dl-actions"><button class="btn btn-sm btn-primary" type="button" data-print="rank">预览 · 打印</button>' +
            '<a class="btn btn-sm btn-ghost" href="#/downloads">成绩排名证明模板</a></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // ---- 资格参考 + 办理提示 ----
    '<div class="card">' +
      '<div class="chart-title">推免 / 评优资格参考 <span style="color:var(--muted);font-size:12px;font-weight:400">' +
        '（常见门槛测算，' + passCount + ' / ' + RULES.length + ' 项满足；<b>以学校当年文件为准</b>）</span></div>' +
      '<div class="table-wrap"><table class="table" style="min-width:520px"><thead><tr><th>参考条件</th><th>你的情况</th><th>是否满足</th></tr></thead><tbody>' +
        RULES.map(function (r) {
          return '<tr><td>' + esc(r.text) + '</td><td>' + esc(r.detail) + '</td>' +
            '<td>' + UI.badge(r.ok ? '满足' : '未满足', r.ok ? 'success' : 'warning') + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      '<p style="color:var(--muted);font-size:12px;margin-top:10px">' +
        '推免（保研）名额与细则每年由学校/学院发布，通常综合<b>学业排名 + 综合素质测评排名 + 无违纪</b>；' +
        '本条为系统按常见门槛的<b>参考测算</b>，不构成资格认定。综合素质测评结果见「我的综测」。' +
      '</p>' +
      '<div class="att-summary" style="margin-top:8px">' +
        '<span class="chip">办理路径</span>' +
        '<span class="chip chip-info">学院办公室：在读证明 / 排名证明 盖章</span>' +
        '<span class="chip chip-info">教务处：正式成绩单 / 英文成绩单</span>' +
        '<span class="chip chip-warn">建议提前 3—5 个工作日办理</span>' +
      '</div>' +
    '</div>';

  // 学年下拉（该生有成绩的所有学年）
  (function () {
    var sel = document.getElementById('ca-year');
    if (!sel) return;
    var years = {};
    Store.list('scores').filter(function (x) { return x.studentId === stu.id && x.term; })
      .forEach(function (x) { years[String(x.term).split('-').slice(0, 2).join('-')] = true; });
    var list = Object.keys(years).sort();
    sel.innerHTML = list.map(function (y) { return '<option value="' + y + '">' + y + '学年</option>'; }).join('')
      || '<option value="">暂无学年</option>';
  })();

  /* =====================================================
   * 打印：统一表格版式
   * 每份材料 = 标题 + 副标题 + **一张连续表格**（同一个列网格）
   *   · 信息行  th 标签（灰底）+ td 值
   *   · 节标题行 整行合并、浅灰底
   *   · 表头行   th.pr-th（灰底加粗）
   *   · 明细行   td（居中，长文本左对齐）
   *   · 落款行、页脚说明行 同样在表格内
   * ===================================================== */
  var COLS4 = [22, 28, 22, 28];          // 信息卡 / 排名证明：标签-值-标签-值
  var COLS6 = [16, 26, 12, 16, 16, 14];  // 英文成绩单：学期-课程-学分-性质-成绩-绩点
  var COLSY = [30, 12, 12, 16, 16, 14];  // 学年成绩单：课程-学分-性质-第一学期-第二学期-学年绩点
  var NATURE_EN = { '必修': 'Compulsory', '选修': 'Elective' };

  function tbl(widths, body) {
    return '<table class="pr-tbl"><colgroup>' +
      widths.map(function (w) { return '<col style="width:' + w + '%">'; }).join('') +
      '</colgroup>' + body + '</table>';
  }
  function label(v) { return '<th>' + esc(v) + '</th>'; }
  function td(v, align) { return '<td' + (align ? ' class="pr-' + align + '"' : '') + '>' + v + '</td>'; }
  function infoRow(pairs) {   // 4 列网格：标签-值-标签-值
    return '<tr>' + pairs.map(function (p) { return label(p[0]) + td(p[1]); }).join('') + '</tr>';
  }
  function spanRow(cells) {   // 6 列网格的两字段信息行：[[标签, 值, 值列跨列数], ...]
    return '<tr>' + cells.map(function (c) { return label(c[0]) + '<td colspan="' + (c[2] || 1) + '">' + c[1] + '</td>'; }).join('') + '</tr>';
  }
  function secRow(title, cols) { return '<tr class="pr-sec"><td colspan="' + cols + '">' + esc(title) + '</td></tr>'; }
  function thRow(cells) { return '<tr>' + cells.map(function (c) { return '<th class="pr-th">' + esc(c) + '</th>'; }).join('') + '</tr>'; }
  function tdRow(cells, aligns) {
    return '<tr>' + cells.map(function (c, i) { return td(c, aligns && aligns[i]); }).join('') + '</tr>';
  }
  function mergeRow(html, cols, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td colspan="' + cols + '">' + html + '</td></tr>';
  }
  function signRow(cols) {
    var half = Math.ceil(cols / 2);
    return '<tr class="pr-sign">' +
      '<th colspan="' + half + '">学院审核（盖章）：______________________　经办人：__________</th>' +
      '<th colspan="' + (cols - half) + '">教务处审核（盖章）：__________________　日期：______ 年 ____ 月 ____ 日</th>' +
      '</tr>';
  }
  function footRow(cols) {
    return mergeRow('<span style="color:#666">本页由「晴川学院班级管理系统」按系统内数据自动生成（生成时间 ' +
      esc(Utils.nowStr()) + '），仅作参考；正式证明以学校审核盖章件为准。</span>', cols, 'pr-foot');
  }
  function head(title, sub) {
    return '<h2>' + esc(title) + '</h2>' +
      (sub ? '<div class="print-meta">' + esc(sub) + '</div>' : '') +
      '<div class="print-meta">武汉晴川学院 · 计算机学院</div>';
  }
  function noRec(text, cols) { return mergeRow('<span style="color:#777">' + esc(text) + '</span>', cols || 4); }

  $$('[data-print]', container).forEach(function (b) {
    b.addEventListener('click', function () { previewDoc(b.dataset.print); });
  });

  /* ---- 打印前预览：屏幕按纸张外观显示同一份表格稿，确认后再调起浏览器打印 ---- */
  function previewDoc(kind) {
    var doc = buildDoc(kind);
    UI.printArea().innerHTML = doc.html;   // 打印区（body 下）与预览共用同一份 HTML
    UI.modal({
      title: '打印预览 · ' + doc.name,
      wide: true,
      body: '<p class="pr-doc-hint">下方即打印稿（A4 纸张，统一表格版式）：可直接打印，或在打印窗口中选择「另存为 PDF」。</p>' +
        '<div class="pr-doc">' + doc.html + '</div>',
      cancelText: '关 闭',
      submitText: '打 印 / 另存 PDF',
      onSubmit: function (root, close) {
        close();
        setTimeout(function () { window.print(); }, 220);
      }
    });
  }

  function buildDoc(kind) {
    var html = '';

    if (kind === 'card') {
      /* ① 在校学业信息卡：4 列网格 */
      var b1 = '';
      b1 += infoRow([['姓名', esc(stu.name)], ['学号', esc(stu.studentNo)]]);
      b1 += infoRow([['学院 / 专业', esc('计算机学院 · ' + major.name)], ['班级', esc(Store.className(stu.classId))]]);
      b1 += infoRow([['培养层次 / 学制', esc(Store.programOf(stu) + '（' + Store.programYearsText(stu) + '）')],
        ['年级 / 届别', esc((Store.enrollYearOf(stu) || '') + '级 · ' + Store.gradYearText(stu))]]);
      b1 += infoRow([['学习形式', esc((stu.studyForm || '全日制') + ' · ' + (stu.enrollType || '普通高考'))],
        ['联系电话', dash(stu.phone)]]);

      b1 += secRow('一、学业成绩（在校全部课程）', 4);
      b1 += thRow(['学分加权平均分', '平均学分绩点（4.0 制）', '算术平均分', '课程门数 / 总学分']);
      b1 += tdRow([dash(all.weightedAvg), dash(all.gpa), dash(all.avg), all.count + ' 门 / ' + dash(all.credits) + ' 学分']);
      b1 += thRow(['班级学业排名', '参评人数', '不及格课程', '最近学年 GPA']);
      b1 += tdRow([rank.rank ? '第 ' + rank.rank + ' 名' : '—', rank.total + ' 人', all.fails + ' 门',
        (yearKey ? esc(yearKey + '学年') + ' ' : '') + dash(yearSum ? yearSum.gpa : null)]);

      b1 += secRow('二、竞赛获奖（' + awards.length + ' 项）', 4);
      if (awards.length) {
        b1 += thRow(['竞赛名称', '级别', '获奖等级', '获奖日期']);
        awards.forEach(function (a) { b1 += tdRow([esc(a.name), esc(a.level), esc(a.award), esc(a.date)], ['left']); });
      } else b1 += noRec('暂无记录');

      b1 += secRow('三、奖助学金（' + aids.length + ' 项）', 4);
      if (aids.length) {
        b1 += thRow(['奖项名称', '级别', '金额（元）', '学年 / 状态']);
        aids.forEach(function (s) {
          b1 += tdRow([esc(s.name), esc(s.level), dash(s.amount),
            esc((s.academicYear || '') + (s.status ? ' · ' + s.status : ''))], ['left']);
        });
      } else b1 += noRec('暂无记录');

      b1 += secRow('四、学生工作与综合素质加分（' + works.length + ' 条）', 4);
      if (works.length) {
        b1 += thRow(['类型', '分值', '事由', '学期']);
        works.forEach(function (w) { b1 += tdRow([esc(w.type), esc(w.score), esc(w.reason), esc(w.term)], [null, null, 'left']); });
      } else b1 += noRec('暂无记录');

      b1 += signRow(4) + footRow(4);
      html = head('在校学业信息卡', 'Student Academic Record (Reference)') + tbl(COLS4, b1);

    } else if (kind === 'en') {
      /* ② English Transcript：6 列网格 */
      var rows = Store.list('scores').filter(function (s) { return s.studentId === stu.id; });
      var picked = {};   // 同一科目同学期取一条（优先总评）
      rows.forEach(function (s) {
        var key = (s.subject || '') + '|' + (s.term || '');
        var isFinal = String(s.examName || '').indexOf('总评') === 0;
        if (!picked[key] || (isFinal && String(picked[key].examName || '').indexOf('总评') !== 0)) picked[key] = s;
      });
      var list = Object.keys(picked).map(function (k) { return picked[k]; })
        .sort(function (a, b) { return String(a.term).localeCompare(String(b.term)) || String(a.subject).localeCompare(String(b.subject)); });

      var b2 = '';
      b2 += spanRow([['Name 姓名', esc(stu.name), 2], ['ID 学号', esc(stu.studentNo), 2]]);
      b2 += spanRow([['College 学院', 'School of Computer Science', 2], ['Major 专业', (major.en ? esc(major.en) : esc(major.name)), 2]]);
      b2 += spanRow([['Program 层次', esc(Store.programOf(stu) + ' (' + Store.programYearsText(stu) + ')'), 2],
        ['Class 班级', esc(Store.className(stu.classId)), 2]]);
      b2 += spanRow([['Duration 期间', esc((Store.enrollYearOf(stu) || '') + '—' + Store.gradYearOf(stu)), 2],
        ['Grad. 届别', esc(Store.gradYearOf(stu) + '届'), 2]]);
      b2 += secRow('Courses 课程成绩', 6);
      b2 += thRow(['Term 学期', 'Course 课程', 'Credit', 'Type', 'Score', 'Grade Point']);
      list.forEach(function (s) {
        var en = Store.courseEnOf(s.subject);
        var cell = en ? (esc(en) + '<br><span style="color:#666;font-size:11px">' + esc(s.subject) + '</span>') : esc(s.subject);
        b2 += tdRow([esc(s.term), cell, esc(Number(s.credit) || Store.creditOf(s.subject)),
          esc(NATURE_EN[s.nature] || s.nature || '—'),
          esc(s.score), Store.gpaPoint(s.score).toFixed(1)], [null, 'left']);
      });
      b2 += secRow('Summary 汇总', 6);
      b2 += thRow(['Courses 门数', 'Credits 学分', 'Weighted Avg.', 'GPA (4.0)', 'Rank 排名', 'Fails']);
      b2 += tdRow([all.count + ' courses', dash(all.credits) + ' credits', dash(all.weightedAvg) + ' / 100',
        '<b>' + dash(all.gpa) + '</b>',
        rank.rank ? rank.rank + ' / ' + rank.total : '—', all.fails + ' course(s)']);
      b2 += secRow('Grading System 成绩与绩点说明', 6);
      b2 += mergeRow('<b>GPA</b>：4.0 scale, credit-weighted. 90+/85+/82+/78+/75+/72+/68+/64+/60 → 4.0/3.7/3.3/3.0/2.7/2.3/2.0/1.5/1.0; below 60 → 0.<br>' +
        '未收录英文译名的课程保留中文原名；正式英文成绩单由教务处出具。Courses without an English title are shown in Chinese; ' +
        'an official English transcript can be issued by the Academic Affairs Office upon request.', 6, 'pr-text');
      b2 += signRow(6) + footRow(6);
      html = head('English Transcript', '武汉晴川学院 · 在校成绩英文成绩单（参考件）') + tbl(COLS6, b2);

    } else if (kind === 'year') {
      /* ③ 学年成绩单：6 列网格（课程 × 两学期） */
      var ySel = document.getElementById('ca-year');
      var y = ySel ? ySel.value : '';
      var rows3 = Store.list('scores').filter(function (x) { return x.studentId === stu.id && Store.termMatch(x.term, y); });
      var bySubject = {};
      rows3.forEach(function (r) {
        var k = r.subject;
        if (!bySubject[k]) bySubject[k] = { subject: k, credit: Number(r.credit) || Store.creditOf(k), nature: r.nature || '', t1: null, t2: null };
        var sem = String(r.term).slice(-1);
        var isFinal = String(r.examName || '').indexOf('总评') === 0;
        if (sem === '1' && (bySubject[k].t1 === null || isFinal)) bySubject[k].t1 = Number(r.score);
        if (sem === '2' && (bySubject[k].t2 === null || isFinal)) bySubject[k].t2 = Number(r.score);
      });
      var subjRows = Object.keys(bySubject).map(function (k) { return bySubject[k]; })
        .sort(function (a, b) { return String(a.subject).localeCompare(String(b.subject)); });
      var ySum = Store.academicSummary(stu.id, y);
      var yRank = Store.classRankOf(stu.id, stu.classId, y);   // 本学年内的班级排名（与学年数据口径一致）

      var b3 = '';
      b3 += spanRow([['姓名', esc(stu.name), 2], ['学号', esc(stu.studentNo), 2]]);
      b3 += spanRow([['专业', esc(major.name), 2], ['学年', '<b>' + esc((y || '') + '学年') + '</b>', 2]]);
      b3 += spanRow([['班级', esc(Store.className(stu.classId)), 2],
        ['年级 / 届别', esc((Store.enrollYearOf(stu) || '') + '级 · ' + Store.gradYearOf(stu) + '届'), 2]]);
      b3 += spanRow([['培养层次 / 学制', esc(Store.programOf(stu) + '（' + Store.programYearsText(stu) + '）'), 2],
        ['GPA', '<b>' + dash(ySum.gpa) + '</b>', 2]]);
      b3 += secRow('课程成绩（按学期并列）', 6);
      b3 += thRow(['课程', '学分', '性质', '第一学期', '第二学期', '学年绩点']);
      subjRows.forEach(function (r) {
        var best = Math.max(r.t1 === null ? -1 : r.t1, r.t2 === null ? -1 : r.t2);
        b3 += tdRow([esc(r.subject), r.credit, esc(r.nature || '—'),
          (r.t1 === null ? '—' : r.t1), (r.t2 === null ? '—' : r.t2),
          (best < 0 ? '—' : Store.gpaPoint(best).toFixed(1))], ['left']);
      });
      b3 += secRow('学年汇总', 6);
      b3 += thRow(['课程门数', '总学分', '加权平均分', '平均绩点', '不及格', '班级排名']);
      b3 += tdRow([ySum.count + ' 门', dash(ySum.credits) + ' 学分', dash(ySum.weightedAvg), dash(ySum.gpa), ySum.fails + ' 门',
        yRank.rank ? '第 ' + yRank.rank + ' 名 / 共 ' + yRank.total + ' 人' : '—']);
      b3 += signRow(6) + footRow(6);
      html = head((y || '') + '学年成绩单', 'Annual Transcript（参考件 · 一页 A4）') + tbl(COLSY, b3);

    } else {
      /* ④ 学业成绩排名证明：4 列网格，正文与数据同处一张表 */
      var b4 = '';
      b4 += mergeRow('兹证明 <b>' + esc(stu.name) + '</b>（学号 ' + esc(stu.studentNo) + '）系我院 <b>' + esc(major.name) +
        '</b> 专业 ' + esc(Store.className(stu.classId)) + ' 班学生（' + esc((Store.enrollYearOf(stu) || '') + '级 · ' + Store.gradYearText(stu)) +
        '），在校期间学业情况如下：', 4, 'pr-text');
      b4 += thRow(['学分加权平均分', '平均学分绩点（4.0 制）', '已修课程 / 总学分', '班级学业排名']);
      b4 += tdRow([dash(all.weightedAvg), dash(all.gpa), all.count + ' 门 / ' + dash(all.credits) + ' 学分',
        (rank.rank ? '第 ' + rank.rank + ' 名' : '—') + ' / 共 ' + rank.total + ' 人']);
      b4 += thRow(['最近学年', '学年学分加权平均分', '学年平均学分绩点', '不及格课程']);
      b4 += tdRow([yearKey ? esc(yearKey + '学年') : '—', dash(yearSum ? yearSum.weightedAvg : null),
        dash(yearSum ? yearSum.gpa : null), all.fails + ' 门']);
      b4 += mergeRow('特此证明。', 4, 'pr-text');
      b4 += signRow(4) + footRow(4);
      html = head('学业成绩排名证明', 'Certificate of Academic Ranking (Reference)') + tbl(COLS4, b4);
    }

    // 预览弹窗标题直接取自文档内的 h2，避免两处标题不一致
    var m = html.match(/<h2>([^<]*)<\/h2>/);
    return { name: m ? m[1] : '材料', html: html };
  }
};
