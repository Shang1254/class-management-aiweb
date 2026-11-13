/* =====================================================
 * AI 助手（教师/管理员：通知起草 · 学情简报 · 出题助手 · 问答 · 设置）
 * 学生端为「AI 问答」（政策/资料问答，检索兜底离线可用）
 * 原则：AI 只产出草稿，写入系统前一律由用户在界面上确认；
 *       未配置模型时自动降级为离线模板/资料检索，演示与断网均不翻车。
 * ===================================================== */

Pages['ai-assistant'] = function (container, user) {
  var isStudent = Auth.isStudent(user);
  var canManage = Auth.isAdmin(user) || !isStudent;
  var state = { tab: '', busy: false };

  var isCounselor = Auth.isCounselor(user);
  var TABS;
  if (isStudent) {
    TABS = [{ k: 'guide', t: '我要办事' }, { k: 'qa', t: '政策问答' }];
  } else if (isCounselor && !Auth.isAdmin(user)) {
    TABS = [{ k: 'duty', t: '值班日报' }, { k: 'help', t: '帮扶跟踪' }, { k: 'notice', t: '通知起草' },
            { k: 'report', t: '学情简报' }, { k: 'qa', t: '问答' }, { k: 'setting', t: 'AI 设置' }];
  } else if (Auth.isAdmin(user)) {
    TABS = [{ k: 'duty', t: '值班日报' }, { k: 'help', t: '帮扶跟踪' }, { k: 'notice', t: '通知起草' },
            { k: 'report', t: '学情简报' }, { k: 'quiz', t: '出题助手' }, { k: 'qa', t: '问答' },
            { k: 'setting', t: 'AI 设置' }];
  } else {
    TABS = [{ k: 'help', t: '帮扶跟踪' }, { k: 'notice', t: '通知起草' }, { k: 'report', t: '学情简报' },
            { k: 'quiz', t: '出题助手' }, { k: 'qa', t: '问答' }, { k: 'setting', t: 'AI 设置' }];
  }

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">' + (isStudent ? 'AI 问答' : 'AI 助手') + '</div>' +
        '<div class="toolbar-actions" id="ai-status"></div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12px;margin:-6px 0 12px">' +
        (isStudent
          ? '<b>我要办事</b>：说出你要办的事（如"申请助学金""怎么重修"），系统检查前置条件、列出材料清单与步骤，并可加入个人提醒；' +
            '<b>政策问答</b>：先在<b>校规与通知</b>中检索依据，再由 AI 归纳成答案（未配置 AI 时直接展示检索到的依据资料）。'
          : '把耗时的文字工作交给它：<b>值班日报</b>（自动汇总待办与风险）、<b>帮扶跟踪</b>（风险学生清单与改善对比）、<b>通知起草</b>、<b>学情简报</b>、<b>随堂测验出题</b>。所有结果都是草稿，' +
            '确认后才会写入系统；发送给模型的内容已自动脱敏（学生姓名→学生A、手机号→138****0000）。') +
      '</p>' +
      '<div id="ai-tabs" class="att-summary"></div>' +
    '</div>' +
    '<div id="ai-panel"></div>';

  /* ---------------- 顶部状态条 ---------------- */
  function renderStatus() {
    var el = $('#ai-status', container);
    var ready = AI.isReady();
    var cfg = AI.config();
    var meta = AI.providerMeta(cfg.provider);
    el.innerHTML = UI.badge(ready ? '模型已就绪' : '未配置（离线模式）', ready ? 'success' : 'warning') +
      (ready ? ' <span style="color:var(--muted);font-size:12px">' + Utils.escapeHtml((meta ? meta.name + ' · ' : '') + cfg.model) +
        (AI.isAuto() ? '（自动接入，无需配置）' : '') + '</span>' : '') +
      (!ready ? ' <button id="ai-auto-wire" class="btn btn-sm btn-ghost" type="button">自动接入本机模型</button>' : '') +
      ' <span style="color:var(--muted);font-size:12px">累计调用 ' + AI.calls() + ' 次</span>';
    var wire = document.getElementById('ai-auto-wire');
    if (wire) {
      wire.addEventListener('click', async function () {
        wire.disabled = true;
        wire.textContent = '正在检测本机模型服务…';
        var r = await AI.ensureConfig(true);
        if (r.applied) Toast.success('已接入本机模型 ' + r.model + '（地址 ' + r.base + '）');
        else Toast.warning('没有检测到本机模型服务：请确认已安装并启动 Ollama（或改用手动填写接口地址与 Key）');
        renderStatus();
        if (state.tab === 'setting') renderSetting(p);
      });
    }
  }

  /* ---------------- 标签 ---------------- */
  function renderTabs() {
    $('#ai-tabs', container).innerHTML = TABS.map(function (t) {
      return '<span class="chip dl-cat-chip' + (state.tab === t.k ? ' chip-info' : '') + '" data-tab="' + t.k + '">' + t.t + '</span>';
    }).join('') + (isStudent ? '' : '<span class="chip">仅生成草稿，人工确认后写入</span>');
    $$('#ai-tabs .dl-cat-chip', container).forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () { state.tab = el.dataset.tab; renderTabs(); renderPanel(); });
    });
  }

  /* ---------------- 面板渲染 ---------------- */
  function renderPanel() {
    var p = $('#ai-panel', container);
    if (state._tick) { clearInterval(state._tick); state._tick = null; }
    if (state.busy) {
      var local = AI.isLocal();
      // 注意：不能用 UI.empty()（它会转义 HTML），这里需要真实元素承载秒数
      p.innerHTML = '<div class="card">' +
          '<p style="text-align:center;padding:28px 12px;color:var(--muted);letter-spacing:1px">' +
            '正在生成，请稍候…已等待 <b id="ai-busy-sec" style="color:var(--gold-ink)">0</b> 秒' +
            (local ? '<br><small>本机模型首次调用需加载模型，可能 10—60 秒，请耐心等待</small>'
                   : '<br><small>云端模型通常 5—20 秒</small>') +
          '</p>' +
          '<div class="toolbar-actions" style="justify-content:center"><button id="ai-busy-reset" class="btn btn-ghost" type="button">取消并返回</button></div></div>';
      $('#ai-busy-reset', p).addEventListener('click', function () { state.busy = false; renderPanel(); });
      var t0 = Date.now();
      state._tick = setInterval(function () {
        var sec = document.getElementById('ai-busy-sec');
        if (!sec) { clearInterval(state._tick); state._tick = null; return; }
        sec.textContent = String(Math.round((Date.now() - t0) / 1000));
      }, 500);
      return;
    }
    if (state.tab === 'duty') return renderDuty(p);
    if (state.tab === 'help') return renderHelp(p);
    if (state.tab === 'guide') return renderGuide(p);
    if (state.tab === 'notice') return renderNotice(p);
    if (state.tab === 'report') return renderReport(p);
    if (state.tab === 'quiz') return renderQuiz(p);
    if (state.tab === 'qa') return renderQA(p);
    if (state.tab === 'setting') return renderSetting(p);
  }

  function classOptions() {
    return UI.options(Auth.visibleClasses(user), 'id', function (c) { return c.name; }, '', '请选择班级');
  }

  /* ================= 通知起草 ================= */
  var noticeOut = null;
  function renderNotice(p) {
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">通知起草</div>' +
        UI.formRow('通知要点（一句话说清事由，如：下周三下午 2 点秋季运动会报名，每班报 10 人）',
          '<textarea id="ai-n-brief" class="input" rows="3" placeholder="例：11 月 20 日晚 19:00 在综合楼一 108 召开奖助学金材料填写说明会，请获评同学携带身份证复印件参加"></textarea>', true) +
        '<div class="form-grid">' +
          UI.formRow('通知频道', '<select id="ai-n-channel" class="input">' +
            (Auth.isAdmin(user)
              ? Store.NOTICE_CHANNELS.map(function (c) { return '<option>' + c + '</option>'; }).join('')
              : '<option>' + (Auth.isCounselor(user) ? '辅导员通知' : '教师通知') + '</option>') + '</select>') +
          UI.formRow('目标班级', '<select id="ai-n-class" class="input">' +
            (Auth.isAdmin(user) ? '<option value="">全部班级</option>' : '') + classOptions() + '</select>') +
          UI.formRow('语气与篇幅', '<select id="ai-n-style" class="input">' +
            ['简洁规范、条理清楚', '亲切提醒、口语化一点', '正式严肃（适合纪律与安全教育）'].map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select>') +
        '</div>' +
        '<div class="toolbar-actions"><button id="ai-n-go" class="btn btn-primary" type="button">生成通知草稿</button></div>' +
      '</div>' +
      '<div id="ai-n-out"></div>';
    $('#ai-n-go', p).addEventListener('click', async function () {
      // 注意：进入 busy 态会重建面板，必须先把表单值取出来
      var brief = $('#ai-n-brief', p).value.trim();
      if (!brief) return Toast.warning('请先填写通知要点');
      var channel = $('#ai-n-channel', p).value;
      var classId = $('#ai-n-class', p).value;
      var audience = classId
        ? '本班学生（' + $('#ai-n-class', p).selectedOptions[0].textContent + '）' : '全校相关班级学生';
      var style = $('#ai-n-style', p).value;
      state.busy = true; renderPanel();
      var res;
      try {
        res = await AI.draftNotice({ brief: brief, channel: channel, audience: audience, style: style });
      } finally {
        state.busy = false;
      }
      noticeOut = { res: res, channel: channel, classId: classId, brief: brief };
      renderPanel();
    });
    if (noticeOut) {
      var lines = noticeOut.res.content.split('\n');
      var title = lines[0];
      var body = lines.slice(1).join('\n').trim();
      $('#ai-n-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">生成结果 ' +
            (noticeOut.res.offline
              ? UI.badge('离线模板草稿', 'warning')
              : UI.badge('AI 生成草稿', 'success') + ' <span style="color:var(--muted);font-size:12px">' + (noticeOut.res.ms || 0) + ' ms</span>') +
          '</div>' +
          (noticeOut.res.offline && noticeOut.res.reason
            ? '<p style="color:var(--muted);font-size:12px">未使用模型：' + Utils.escapeHtml(noticeOut.res.reason) + '</p>' : '') +
          UI.formRow('标题（可编辑）', '<input id="ai-n-title" class="input" value="' + Utils.escapeHtml(title || '') + '">') +
          UI.formRow('正文（可编辑）', '<textarea id="ai-n-body" class="input" rows="12">' + Utils.escapeHtml(body) + '</textarea>') +
          '<div class="toolbar-actions">' +
            '<button id="ai-n-save" class="btn btn-primary" type="button">保存为通知（发布）</button>' +
            '<button id="ai-n-copy" class="btn btn-ghost" type="button">复制全文</button>' +
          '</div>' +
        '</div>';
      $('#ai-n-copy', p).addEventListener('click', function () {
        Utils.copyText($('#ai-n-title', p).value + '\n\n' + $('#ai-n-body', p).value);
      });
      $('#ai-n-save', p).addEventListener('click', function () {
        var title2 = $('#ai-n-title', p).value.trim();
        var body2 = $('#ai-n-body', p).value.trim();
        if (!title2) return Toast.warning('请填写通知标题');
        if (!body2) return Toast.warning('请填写通知正文');
        UI.confirm({
          title: '保存为通知',
          message: '将以「' + noticeOut.channel + '」发布到' +
            (noticeOut.classId ? '选定班级' : '全部班级') + '。发布后学生端立即可见。确认发布吗？',
          onOk() {
            Store.add('notices', {
              title: title2, content: body2, channel: noticeOut.channel,
              classId: noticeOut.classId || '',
              publisher: user.name || user.username,
              publisherId: user.id,
              publishTime: Utils.nowStr()
            });
            Toast.success('通知已发布，可在「通知管理」中查看或修改');
            location.hash = '#/notices';
          }
        });
      });
    }
  }

  /* ================= 学情简报 ================= */
  var reportOut = null;
  var lastReport = { classId: '', term: '' };
  function gatherStats(classId, term) {
    var classes = Auth.visibleClasses(user);
    var cls = classes.filter(function (c) { return c.id === classId; })[0] || classes[0];
    if (!cls) return null;
    var students = Store.list('students').filter(function (s) { return s.classId === cls.id; });
    var scores = Store.list('scores').filter(function (s) {
      return s.classId === cls.id && Store.termMatch(s.term, term);
    });
    var avg = scores.length ? Utils.round1(scores.reduce(function (a, s) { return a + Number(s.score || 0); }, 0) / scores.length) : null;
    var pass = scores.length ? Math.round(scores.filter(function (s) { return Number(s.score) >= 60; }).length / scores.length * 100) : null;
    var excellent = scores.length ? Math.round(scores.filter(function (s) { return Number(s.score) >= 90; }).length / scores.length * 100) : null;
    var since = Utils.daysAgo(29);
    var att = Store.list('attendance').filter(function (a) { return a.classId === cls.id && a.date >= since; });
    var attRate = att.length ? Math.round(att.filter(function (a) { return a.status === '出勤'; }).length / att.length * 100) + '' : '暂无';
    var absent = att.filter(function (a) { return a.status === '缺勤'; }).length;
    var curTerm = term || Store.currentTerm();
    var alerts = Store.alertsFor(cls.id, curTerm).map(function (a) {
      return a.name.slice(0, 1) + '同学（' + a.reasons.join('、') + '）';
    });
    // 重点关注（与工作台同口径）
    var focus = 0;
    students.forEach(function (stu) {
      var recs = Store.list('attendance').filter(function (a) { return a.studentId === stu.id; });
      var reasons = 0;
      if (recs.length) {
        var rate = Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100);
        if (rate < 85) reasons++;
        if (recs.filter(function (a) { return a.status === '缺勤'; }).length >= 3) reasons++;
      }
      if (Store.alertsFor(cls.id, curTerm).some(function (a) { return a.studentId === stu.id; })) reasons++;
      if (reasons) focus++;
    });
    return {
      className: cls.name, term: curTerm,
      studentCount: students.length,
      avgScore: avg, passRate: pass, excellentRate: excellent,
      attendanceRate: attRate, absentCount: absent,
      focusCount: focus, alerts: alerts.slice(0, 8)
    };
  }

  function renderReport(p) {
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">学情简报（依据本系统真实统计生成）</div>' +
        '<div class="form-grid">' +
          UI.formRow('班级', '<select id="ai-r-class" class="input">' + classOptions() + '</select>', true) +
          UI.formRow('学期', '<select id="ai-r-term" class="input"><option value="">当前学期</option>' +
            UI.termFilter.optionsHTML(lastReport.term) + '</select>') +
        '</div>' +
        '<div class="toolbar-actions"><button id="ai-r-go" class="btn btn-primary" type="button">生成简报</button>' +
          '<span style="color:var(--muted);font-size:12px">提示：只发送统计数字与原因标签，不发送学生姓名</span></div>' +
      '</div>' +
      '<div id="ai-r-out"></div>';
    $('#ai-r-go', p).addEventListener('click', async function () {
      var classId = $('#ai-r-class', p).value;
      if (!classId) return Toast.warning('请选择班级');
      lastReport = { classId: classId, term: $('#ai-r-term', p).value };
      var stats = gatherStats(classId, lastReport.term);
      if (!stats) return Toast.error('未找到班级数据');
      state.busy = true; renderPanel();
      var res;
      try { res = await AI.forgeReport(stats); } finally { state.busy = false; }
      reportOut = { res: res, stats: stats };
      renderPanel();
    });
    if (reportOut) {
      $('#ai-r-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">生成结果 ' +
            (reportOut.res.offline ? UI.badge('离线规则模板', 'warning')
              : UI.badge('AI 生成', 'success') + ' <span style="color:var(--muted);font-size:12px">' + (reportOut.res.ms || 0) + ' ms</span>') +
            '<span style="color:var(--muted);font-size:12px;margin-left:8px">数据：' +
            Utils.escapeHtml(reportOut.stats.className) + ' · ' + reportOut.stats.studentCount + ' 人 · 平均分 ' +
            (reportOut.stats.avgScore === null ? '暂无' : reportOut.stats.avgScore) + '</span>' +
          '</div>' +
          '<textarea id="ai-r-text" class="input" rows="16">' + Utils.escapeHtml(reportOut.res.content) + '</textarea>' +
          '<div class="toolbar-actions">' +
            '<button id="ai-r-copy" class="btn btn-primary" type="button">复制简报</button>' +
            '<button id="ai-r-dl" class="btn btn-ghost" type="button">下载为 TXT</button>' +
          '</div>' +
        '</div>';
      $('#ai-r-copy', p).addEventListener('click', function () { Utils.copyText($('#ai-r-text', p).value); });
      $('#ai-r-dl', p).addEventListener('click', function () {
        Utils.downloadFile('学情简报_' + reportOut.stats.className + '_' + Utils.today() + '.txt',
          $('#ai-r-text', p).value, 'text/plain');
      });
    }
  }

  /* ================= 出题助手 ================= */
  var quizOut = null;
  function renderQuiz(p) {
    var subjects = [];
    Store.list('scores').forEach(function (s) { if (subjects.indexOf(s.subject) === -1) subjects.push(s.subject); });
    Store.list('timetable').forEach(function (t) { if (t.course && subjects.indexOf(t.course) === -1) subjects.push(t.course); });
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">出题助手（生成后可一键导入「随堂测验」）</div>' +
        '<div class="form-grid">' +
          UI.formRow('科目', '<input id="ai-q-subject" class="input" list="ai-q-subjects" placeholder="如：数据结构" value="' +
            Utils.escapeHtml(subjects[0] || '') + '"><datalist id="ai-q-subjects">' +
            subjects.slice(0, 40).map(function (s) { return '<option value="' + Utils.escapeHtml(s) + '">'; }).join('') + '</datalist>', true) +
          UI.formRow('知识点 / 范围', '<input id="ai-q-topic" class="input" placeholder="如：二叉树的前中后序遍历与性质">', true) +
          UI.formRow('单选题数', '<input id="ai-q-single" class="input" type="number" min="0" max="20" value="3">') +
          UI.formRow('多选题数', '<input id="ai-q-multi" class="input" type="number" min="0" max="20" value="1">') +
          UI.formRow('判断题数', '<input id="ai-q-judge" class="input" type="number" min="0" max="20" value="2">') +
          UI.formRow('每题分值', '<input id="ai-q-points" class="input" type="number" min="1" max="50" value="20">') +
        '</div>' +
        '<div class="toolbar-actions"><button id="ai-q-go" class="btn btn-primary" type="button">生成题目</button>' +
          '<span style="color:var(--muted);font-size:12px">出题依赖模型（未配置时无法离线生成）</span></div>' +
      '</div>' +
      '<div id="ai-q-out"></div>';
    $('#ai-q-go', p).addEventListener('click', async function () {
      var subject = $('#ai-q-subject', p).value.trim();
      var topic = $('#ai-q-topic', p).value.trim();
      var nS = Number($('#ai-q-single', p).value || 0), nM = Number($('#ai-q-multi', p).value || 0), nJ = Number($('#ai-q-judge', p).value || 0);
      if (!subject) return Toast.warning('请填写科目');
      if (!topic) return Toast.warning('请填写知识点/范围');
      if (nS + nM + nJ <= 0) return Toast.warning('题量至少 1 题');
      if (!AI.isReady()) return Toast.warning('请先到「AI 设置」中配置模型（出题需要模型能力）');
      var pointsVal = Number($('#ai-q-points', p).value || 20);   // 先取值，再进入 busy 态
      state.busy = true; renderPanel();
      var res;
      try { res = await AI.forgeQuiz({ subject: subject, topic: topic, nSingle: nS, nMulti: nM, nJudge: nJ, points: pointsVal }); }
      finally { state.busy = false; }
      if (!res.ok) { quizOut = null; renderPanel(); return Toast.error(res.error); }
      quizOut = { questions: res.questions, subject: subject, ms: res.ms };
      renderPanel();
    });
    if (quizOut) {
      var total = quizOut.questions.reduce(function (a, q) { return a + q.points; }, 0);
      $('#ai-q-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">生成结果 ' + UI.badge(quizOut.questions.length + ' 题 · 满分 ' + total + ' 分', 'success') +
            '<span style="color:var(--muted);font-size:12px;margin-left:8px">' + (quizOut.ms || 0) + ' ms · 请逐题核对答案后再发布</span></div>' +
          '<div class="table-wrap"><table class="table" style="min-width:620px"><thead><tr><th>#</th><th>题型</th><th>题干</th><th>选项</th><th>答案</th><th>分值</th></tr></thead><tbody>' +
          quizOut.questions.map(function (q, i) {
            return '<tr><td>' + (i + 1) + '</td><td>' + UI.badge(q.type, 'info') + '</td>' +
              '<td>' + Utils.escapeHtml(q.stem) + '</td>' +
              '<td style="font-size:12px">' + q.options.map(function (o, j) {
                return (q.type === '判断' ? '' : String.fromCharCode(65 + j) + '. ') + Utils.escapeHtml(o);
              }).join('<br>') + '</td>' +
              '<td><b>' + Utils.escapeHtml(q.answer) + '</b></td><td>' + q.points + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<div class="form-grid" style="margin-top:12px">' +
            UI.formRow('发布到班级', '<select id="ai-q-class" class="input">' + classOptions() + '</select>', true) +
            UI.formRow('测验标题', '<input id="ai-q-title" class="input" value="' + Utils.escapeHtml(quizOut.subject + '随堂小测') + '">', true) +
            UI.formRow('限时（分钟）', '<input id="ai-q-duration" class="input" type="number" min="1" max="120" value="10">') +
            UI.formRow('截止时间', '<input id="ai-q-deadline" class="input" value="' + Utils.daysAgo(-7) + ' 23:59">') +
          '</div>' +
          '<div class="toolbar-actions"><button id="ai-q-save" class="btn btn-primary" type="button">保存为随堂测验</button></div>' +
        '</div>';
      $('#ai-q-save', p).addEventListener('click', function () {
        var classId = $('#ai-q-class', p).value;
        var title2 = $('#ai-q-title', p).value.trim();
        if (!classId) return Toast.warning('请选择发布班级');
        if (!title2) return Toast.warning('请填写测验标题');
        UI.confirm({
          title: '发布随堂测验',
          message: '将把 ' + quizOut.questions.length + ' 题发布到选定班级，学生端立即可作答（客观题自动阅卷）。确认发布吗？',
          onOk() {
            Store.add('quizzes', {
              classId: classId, title: title2, subject: quizOut.subject,
              durationMin: Number($('#ai-q-duration', p).value || 10),
              deadline: $('#ai-q-deadline', p).value.trim(),
              questions: quizOut.questions,
              publishTime: Utils.nowStr(), createdBy: user.id
            });
            Toast.success('随堂测验已发布，可在「随堂测验」中查看');
            location.hash = '#/quizzes';
          }
        });
      });
    }
  }

  /* ================= Agent 1：值班日报（辅导员/管理员） ================= */
  var dutyOut = null;
  function renderDuty(p) {
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">学工值班日报（智能体：自动选择工具 → 汇总数据 → 生成日报）</div>' +
        '<p style="color:var(--muted);font-size:12.5px;margin:-4px 0 10px">' +
          '点击后系统会自动检查：待审批请假、今日健康填报与体温异常、校外动向、出勤下滑班级、重点关注学生、在办的奖助节点，' +
          '然后汇总成一份可直接上报的日报，并给出处理入口。数据全部来自本系统统计，模型不生成数据。</p>' +
        '<div class="toolbar-actions"><button id="ai-d-go" class="btn btn-primary" type="button">生成今日值班日报</button>' +
          '<span style="color:var(--muted);font-size:12px">可离线生成（未配置模型时使用规则模板）</span></div>' +
      '</div>' +
      '<div id="ai-d-out"></div>';
    $('#ai-d-go', p).addEventListener('click', async function () {
      state.busy = true; renderPanel();
      var res;
      try { res = await AI.agentDutyReport(user); } finally { state.busy = false; }
      dutyOut = { res: res };
      renderPanel();
    });
    if (dutyOut) {
      var res = dutyOut.res;
      $('#ai-d-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">值班日报 ' +
            (res.offline ? UI.badge('离线规则模板', 'warning')
              : UI.badge('智能体生成', 'success') + ' <span style="color:var(--muted);font-size:12px">' + (res.ms || 0) + ' ms</span>') +
            '<span style="color:var(--muted);font-size:12px;margin-left:8px">本次调用工具：' + Utils.escapeHtml((res.tools || []).join('、')) + '</span>' +
          '</div>' +
          (res.reason ? '<p style="color:var(--muted);font-size:12px">未使用模型：' + Utils.escapeHtml(res.reason) + '</p>' : '') +
          '<textarea id="ai-d-text" class="input" rows="18">' + Utils.escapeHtml(res.content) + '</textarea>' +
          ((res.items || []).length
            ? '<div class="chart-title" style="margin-top:12px;font-size:14px">处理入口</div><div class="toolbar-actions">' +
              res.items.map(function (x) { return '<a class="btn btn-sm btn-ghost" href="' + x.href + '">' + Utils.escapeHtml(x.label) + '</a>'; }).join('') + '</div>'
            : '') +
          '<div class="toolbar-actions" style="margin-top:12px">' +
            '<button id="ai-d-copy" class="btn btn-primary" type="button">复制日报</button>' +
            '<button id="ai-d-dl" class="btn btn-ghost" type="button">下载为 TXT</button>' +
          '</div>' +
        '</div>';
      $('#ai-d-copy', p).addEventListener('click', function () { Utils.copyText($('#ai-d-text', p).value); });
      $('#ai-d-dl', p).addEventListener('click', function () {
        Utils.downloadFile('学工值班日报_' + Utils.today() + '.txt', $('#ai-d-text', p).value, 'text/plain');
      });
    }
  }

  /* ================= Agent 2：学业帮扶跟踪（教师/管理员） ================= */
  var helpOut = null;
  var lastHelp = { classId: '', term: '' };
  function renderHelp(p) {
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">学业帮扶跟踪（智能体：扫描成绩/考勤/预警 → 生成帮扶清单 → 与上次对比）</div>' +
        '<p style="color:var(--muted);font-size:12.5px;margin:-4px 0 10px">' +
          '按班级汇总不及格课程、平均分、出勤率与学业预警，生成按风险类型归类的帮扶清单与家长沟通话术；' +
          '每次生成都会保存快照，下次运行自动对比出<b>已改善 / 仍存在 / 新进</b>人数。</p>' +
        '<div class="form-grid">' +
          UI.formRow('班级', '<select id="ai-h-class" class="input">' +
            UI.options(Auth.visibleClasses(user), 'id', function (c) { return c.name; }, lastHelp.classId, '请选择班级') + '</select>', true) +
          UI.formRow('学期', '<select id="ai-h-term" class="input"><option value="">当前学期</option>' +
            UI.termFilter.list().map(function (t) {
              // 默认跟随顶栏「全站学期」（未设置时回退上次选择），保证与全站口径一致
              var sel = UI.termFilter.get() ? (UI.termFilter.get() === t) : (t === lastHelp.term);
              return '<option value="' + t + '"' + (sel ? ' selected' : '') + '>' + (t === Store.currentTerm() ? '本 · ' : '') + Store.termText(t) + '</option>';
            }).join('') + '</select>') +
        '</div>' +
        '<div class="toolbar-actions"><button id="ai-h-go" class="btn btn-primary" type="button">生成帮扶方案</button></div>' +
      '</div>' +
      '<div id="ai-h-out"></div>';
    $('#ai-h-term', p) && $('#ai-h-term', p).addEventListener('change', function () {
      // 帮扶页改学期 → 同步全站口径（避免两处显示不一致）
      Store.setPref('uiTerm', this.value || 'all');
      UI.termFilter.syncTopbar();
    });
    $('#ai-h-go', p).addEventListener('click', async function () {
      var classId = $('#ai-h-class', p).value;
      var term = $('#ai-h-term', p).value;
      if (!classId) return Toast.warning('请选择班级');
      lastHelp = { classId: classId, term: term };
      state.busy = true; renderPanel();
      var res;
      try { res = await AI.agentHelpPlan(classId, term, user); } finally { state.busy = false; }
      if (!res.ok) { helpOut = null; renderPanel(); return Toast.error(res.error); }
      helpOut = { res: res };
      renderPanel();
    });
    if (helpOut) {
      var r = helpOut.res;
      var riskRows = (r.risk || []).map(function (x) {
        return '<tr><td><b>' + Utils.escapeHtml(x.name) + '</b></td>' +
          '<td>' + (x.avg === null ? '—' : x.avg) + '</td>' +
          '<td>' + (x.attRate === null ? '—' : x.attRate + '%') + '</td>' +
          '<td>' + x.reasons.map(function (z) { return UI.badge(z, 'danger'); }).join(' ') + '</td></tr>';
      }).join('');
      $('#ai-h-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">帮扶方案 ' +
            (r.offline ? UI.badge('离线规则模板', 'warning') : UI.badge('智能体生成', 'success') + ' <span style="color:var(--muted);font-size:12px">' + (r.ms || 0) + ' ms</span>') +
          '</div>' +
          '<div class="att-summary">' +
            '<span class="chip">' + Utils.escapeHtml(r.className) + '</span>' +
            '<span class="chip">平均分 <b>' + (r.perf.平均分 === null ? '暂无' : r.perf.平均分) + '</b></span>' +
            '<span class="chip chip-info">及格率 <b>' + r.perf.及格率 + '</b></span>' +
            '<span class="chip chip-bad">需帮扶 <b>' + (r.risk || []).length + ' 人</b></span>' +
            (r.compare
              ? '<span class="chip chip-ok">已改善 <b>' + r.compare.已改善 + '</b></span>' +
                '<span class="chip chip-warn">仍存在 <b>' + r.compare.仍存在 + '</b></span>' +
                '<span class="chip chip-bad">新进 <b>' + r.compare.新进 + '</b></span>'
              : '<span class="chip">首次运行（下次生成可对比改善情况）</span>') +
          '</div>' +
          ((r.risk || []).length
            ? '<div class="table-wrap"><table class="table" style="min-width:620px"><thead><tr><th>学生</th><th>平均分</th><th>出勤率</th><th>风险原因</th></tr></thead><tbody>' + riskRows + '</tbody></table></div>'
            : UI.empty('本班暂无需帮扶学生')) +
          '<div class="chart-title" style="margin-top:14px;font-size:14px">帮扶方案（可编辑后使用）</div>' +
          '<textarea id="ai-h-text" class="input" rows="14">' + Utils.escapeHtml(r.content) + '</textarea>' +
          '<div class="toolbar-actions">' +
            '<button id="ai-h-copy" class="btn btn-primary" type="button">复制方案</button>' +
            '<button id="ai-h-dl" class="btn btn-ghost" type="button">导出名单 CSV</button>' +
          '</div>' +
        '</div>';
      $('#ai-h-copy', p).addEventListener('click', function () { Utils.copyText($('#ai-h-text', p).value); });
      $('#ai-h-dl', p).addEventListener('click', function () {
        if (!(r.risk || []).length) return Toast.warning('没有可导出的名单');
        Utils.exportCSV('帮扶名单_' + r.className + '_' + Utils.today() + '.csv',
          ['姓名', '平均分', '出勤率', '风险原因'],
          r.risk.map(function (x) { return [x.name, x.avg === null ? '' : x.avg, x.attRate === null ? '' : x.attRate + '%', x.reasons.join('；')]; }));
      });
    }
  }

  /* ================= Agent 3：我要办事（学生） ================= */
  var guideOut = null;
  function renderGuide(p) {
    var tasks = AI.reminders(user.id);
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">我要办事（说出要办的事，系统给步骤、材料与提醒）</div>' +
        UI.formRow('你要办什么事？', '<input id="ai-g-q" class="input" placeholder="例：我要申请助学金 / 重修怎么办理 / 请假流程 / 怎么开在读证明">', true) +
        '<div class="toolbar-actions">' +
          '<button id="ai-g-go" class="btn btn-primary" type="button">获取办理指引</button>' +
          '<a class="btn btn-ghost" href="#/downloads">去资料下载</a>' +
        '</div>' +
        '<div class="att-summary" style="margin-top:10px">' +
          ['我要申请助学金', '怎么重修', '困难认定要什么材料', '怎么请假', '缓考怎么申请', '怎么开在读证明', '学生证丢了怎么办', '助学贷款怎么办理']
            .map(function (x) { return '<span class="chip dl-cat-chip" data-guide="' + Utils.escapeHtml(x) + '" style="cursor:pointer">' + Utils.escapeHtml(x) + '</span>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div id="ai-g-out"></div>' +
      '<div class="card">' +
        '<div class="chart-title">我的提醒' + (tasks.length ? '（' + tasks.filter(function (t) { return !t.done; }).length + ' 项待办）' : '') + '</div>' +
        (tasks.length
          ? '<div class="table-wrap"><table class="table" style="min-width:520px"><thead><tr><th>状态</th><th>事项</th><th>时限</th><th>操作</th></tr></thead><tbody>' +
            tasks.map(function (t) {
              return '<tr><td>' + (t.done ? UI.badge('已完成', 'success') : UI.badge('待办', 'warning')) + '</td>' +
                '<td>' + Utils.escapeHtml(t.text) + '</td><td>' + Utils.escapeHtml(t.due || '—') + '</td>' +
                '<td class="td-ops">' +
                  '<button class="btn btn-sm btn-ghost" data-rtoggle="' + t.id + '" type="button">' + (t.done ? '恢复' : '完成') + '</button>' +
                  '<button class="btn btn-sm btn-danger-ghost" data-rdel="' + t.id + '" type="button">删除</button>' +
                '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : UI.empty('暂无提醒：办理指引中点击「加入我的提醒」，截止日期就会记在这里')) +
      '</div>';

    $$('[data-guide]', p).forEach(function (el) {
      el.addEventListener('click', function () { $('#ai-g-q', p).value = el.dataset.guide; run(); });
    });
    $('#ai-g-go', p).addEventListener('click', run);
    $('#ai-g-q', p).addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    $$('[data-rtoggle]', p).forEach(function (b) {
      b.addEventListener('click', function () { AI.toggleReminder(user.id, b.dataset.rtoggle); renderPanel(); });
    });
    $$('[data-rdel]', p).forEach(function (b) {
      b.addEventListener('click', function () { AI.removeReminder(user.id, b.dataset.rdel); Toast.success('提醒已删除'); renderPanel(); });
    });

    async function run() {
      var q = $('#ai-g-q', p).value.trim();
      if (!q) return Toast.warning('请先说明你要办的事');
      state.busy = true; renderPanel();
      var res;
      try { res = await AI.agentStudentGuide(q, user); } finally { state.busy = false; }
      guideOut = { res: res, q: q };
      renderPanel();
    }

    if (guideOut) {
      var g = guideOut.res;
      var srcHtml = (g.sources || []).map(function (d) {
        return '<li>' + (d.href ? '<a href="' + d.href + '">' + Utils.escapeHtml(d.src) + '</a>' : Utils.escapeHtml(d.src)) + '</li>';
      }).join('');
      $('#ai-g-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">办理指引 ' +
            (g.offline ? UI.badge('离线规则指引', 'warning') : UI.badge('智能体生成', 'success') + ' <span style="color:var(--muted);font-size:12px">' + (g.ms || 0) + ' ms</span>') +
            (g.flow ? '<span style="color:var(--muted);font-size:12px;margin-left:8px">识别事项：' + Utils.escapeHtml(g.flow.name) + '</span>' : '') +
          '</div>' +
          (g.prereq ? '<p style="font-size:13px;color:' + (g.prereq.ok ? 'var(--success)' : 'var(--danger)') + '">前置条件检查：' + Utils.escapeHtml(g.prereq.text) + '</p>' : '') +
          (g.flow && (g.steps || []).length
            ? '<div class="chart-title" style="font-size:14px">办理步骤（系统标准流程）</div>' +
              '<ol class="dl-steps">' + g.steps.map(function (x) { return '<li>' + Utils.escapeHtml(x) + '</li>'; }).join('') + '</ol>' +
              '<div class="att-summary" style="margin-top:8px">' +
                '<span class="chip">所需表格：<b>' + Utils.escapeHtml((g.forms || []).join('、')) + '</b></span>' +
                '<span class="chip">办理地点：<b>' + Utils.escapeHtml(g.place || '') + '</b></span>' +
                '<span class="chip chip-warn">办理时间：<b>' + Utils.escapeHtml(g.due || '') + '</b></span>' +
              '</div>'
            : '') +
          (g.content
            ? '<div class="chart-title" style="margin-top:12px;font-size:14px">' + (g.flow ? '办理提示（AI 补充说明）' : '回答') + '</div>' +
              '<div style="white-space:pre-wrap;line-height:1.9;font-size:13.5px">' + Utils.escapeHtml(g.content) + '</div>'
            : (guideOut.res.content ? '<p style="color:var(--muted)">' + Utils.escapeHtml(guideOut.res.content) + '</p>' : '')) +
          (srcHtml ? '<div class="chart-title" style="margin-top:12px;font-size:14px">依据来源</div><ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.9">' + srcHtml + '</ul>' : '') +
          (g.flow
            ? '<div class="toolbar-actions" style="margin-top:12px">' +
                '<a class="btn btn-primary" href="#/downloads">下载所需表格</a>' +
                '<button id="ai-g-remind" class="btn btn-ghost" type="button">加入我的提醒</button>' +
                '<button id="ai-g-copy" class="btn btn-ghost" type="button">复制指引</button>' +
              '</div>'
            : '') +
        '</div>';
      var remindBtn = $('#ai-g-remind', p);
      if (remindBtn) {
        remindBtn.addEventListener('click', function () {
          AI.addReminder(user.id, {
            text: '办理：' + guideOut.res.flow.name + '（所需表格：' + guideOut.res.forms.join('、') + '）',
            href: '#/downloads', due: guideOut.res.due
          });
          Toast.success('已加入我的提醒');
          renderPanel();
        });
      }
      var copyBtn = $('#ai-g-copy', p);
      if (copyBtn) copyBtn.addEventListener('click', function () { Utils.copyText($('#ai-g-out', p).innerText); });
    }
  }

  /* ================= 问答 ================= */
  var qaOut = null;
  function renderQA(p) {
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">' + (isStudent ? '政策与办理问答' : '政策/资料问答') + '</div>' +
        UI.formRow('你的问题', '<input id="ai-qa-q" class="input" placeholder="例：国家奖学金什么时候截止？重修要怎么申请？困难认定需要什么材料？">', true) +
        '<div class="toolbar-actions">' +
          '<button id="ai-qa-go" class="btn btn-primary" type="button">提问</button>' +
          (isStudent ? '<a class="btn btn-ghost" href="#/downloads">去资料下载</a>' : '') +
        '</div>' +
        '<div class="att-summary" style="margin-top:10px">' +
          ['国家奖学金什么时候申请？', '困难认定需要哪些材料？', '重修怎么办理？', '请假流程是什么？', '出勤率多少会被重点关注？']
            .map(function (s) { return '<span class="chip dl-cat-chip" data-ask="' + Utils.escapeHtml(s) + '" style="cursor:pointer">' + s + '</span>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div id="ai-qa-out"></div>';
    $$('#ai-qa-out ~ * , [data-ask]', p).forEach(function () {});
    $$('[data-ask]', p).forEach(function (el) {
      el.addEventListener('click', function () { $('#ai-qa-q', p).value = el.dataset.ask; ask(); });
    });
    $('#ai-qa-go', p).addEventListener('click', ask);
    $('#ai-qa-q', p).addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(); });

    async function ask() {
      var q = $('#ai-qa-q', p).value.trim();
      if (!q) return Toast.warning('请输入问题');
      state.busy = true; renderPanel();
      var res;
      try { res = await AI.ask(q, user); } finally { state.busy = false; }
      qaOut = { res: res, q: q };
      renderPanel();
    }

    if (qaOut) {
      var srcHtml = (qaOut.res.sources || []).map(function (d) {
        return '<li>' + (d.href ? '<a href="' + d.href + '">' + Utils.escapeHtml(d.src) + '</a>' : Utils.escapeHtml(d.src)) + '</li>';
      }).join('');
      $('#ai-qa-out', p).innerHTML =
        '<div class="card">' +
          '<div class="chart-title">回答 ' +
            (qaOut.res.offline ? UI.badge('资料检索（未配置模型或调用失败）', 'warning')
              : UI.badge('AI 归纳', 'success') + ' <span style="color:var(--muted);font-size:12px">' + (qaOut.res.ms || 0) + ' ms</span>') +
          '</div>' +
          (qaOut.res.content
            ? '<div style="white-space:pre-wrap;line-height:1.9;font-size:13.5px">' + Utils.escapeHtml(qaOut.res.content) + '</div>'
            : '<p style="color:var(--muted)">' + (qaOut.res.sources && qaOut.res.sources.length
                ? '未启用 AI 归纳，以下是与你的问题最相关的资料与通知：'
                : '没有找到相关资料，建议直接咨询辅导员（综合楼一 108，027-87934608）或查看「资料下载」中的办理说明。') + '</p>') +
          (qaOut.res.reason ? '<p style="color:var(--muted);font-size:12px">说明：' + Utils.escapeHtml(qaOut.res.reason) + '</p>' : '') +
          (srcHtml ? '<div class="chart-title" style="margin-top:12px;font-size:14px">依据来源</div><ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.9">' + srcHtml + '</ul>' : '') +
          '<p style="color:var(--muted);font-size:12px;margin-top:10px">以上内容依据系统内的政策与通知整理，最终以学校最新文件为准。</p>' +
        '</div>';
    }
  }

  /* ================= AI 设置 ================= */
  function renderSetting(p) {
    var cfg = AI.config();
    var meta = AI.providerMeta(cfg.provider) || AI.PROVIDERS[0];
    p.innerHTML =
      '<div class="card">' +
        '<div class="chart-title">模型设置（保存在本机浏览器，不会随软件分发）</div>' +
        '<div class="form-grid">' +
          UI.formRow('模型厂商', '<select id="ai-s-provider" class="input">' +
            AI.PROVIDERS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === cfg.provider ? ' selected' : '') + '>' + x.name + '</option>'; }).join('') + '</select>') +
          UI.formRow('接口地址（OpenAI 兼容）', '<input id="ai-s-base" class="input" value="' + Utils.escapeHtml(cfg.base || meta.base) + '" placeholder="https://…/v1">', true) +
          UI.formRow('模型名称', '<input id="ai-s-model" class="input" value="' + Utils.escapeHtml(cfg.model || meta.model) + '" placeholder="' +
            (meta.local ? '只填模型名，如 qwen2.5:3b（ollama pull … 是终端命令，不要填这里）' : '如：glm-4-flash') + '">', true) +
          UI.formRow('API Key', '<input id="ai-s-key" class="input" type="password" value="' + Utils.escapeHtml(cfg.key || '') + '" placeholder="粘贴你的 API Key（仅保存在本机）">') +
        '</div>' +
        '<p style="color:var(--muted);font-size:12px">' + Utils.escapeHtml(meta.hint || '') +
          (meta.local ? '' : '　建议演示用免费小模型；若学校要求数据不出校，请选择「本地 Ollama」并在本机启动服务。') + '</p>' +
        '<div id="ai-s-status" style="margin:8px 0"><span style="color:var(--muted);font-size:12px">正在检测模型服务…</span></div>' +
        (meta.local
          ? '<div class="att-summary">' +
              '<button id="ai-s-tags" class="btn btn-sm btn-ghost" type="button">读取本机已安装模型</button>' +
              '<button id="ai-s-recheck" class="btn btn-sm btn-ghost" type="button">重新检测服务</button>' +
              '<button id="ai-s-cmd" class="btn btn-sm btn-ghost" type="button">复制启动命令</button>' +
              '<span style="color:var(--muted);font-size:12px">启动命令与拉取命令都在终端里执行；装好后点「读取本机已安装模型」选择</span>' +
            '</div>' +
            '<div id="ai-s-models" style="margin-top:6px"></div>' +
            '<div class="att-summary" style="margin-top:6px">推荐模型（点一下 = 复制拉取命令，在终端执行；装好后用上面的按钮选择）：' +
              (meta.models || []).map(function (m) {
                return '<span class="chip dl-cat-chip" data-pull="' + Utils.escapeHtml(m) + '" style="cursor:pointer">' + Utils.escapeHtml(m) + '</span>';
              }).join('') +
            '</div>'
          : '') +
        '<div class="att-summary">' +
          '<label class="chip" style="cursor:pointer"><input type="checkbox" id="ai-s-mask"' + (AI.maskOn() ? ' checked' : '') + '> 发送前自动脱敏（学生姓名、手机号）</label>' +
          '<span class="chip">累计调用 <b>' + AI.calls() + '</b> 次</span>' +
        '</div>' +
        '<div class="toolbar-actions" style="margin-top:12px">' +
          '<button id="ai-s-save" class="btn btn-primary" type="button">保存配置</button>' +
          '<button id="ai-s-test" class="btn btn-ghost" type="button">测试连通</button>' +
          '<button id="ai-s-clear" class="btn btn-danger-ghost" type="button">清空配置</button>' +
          '<button id="ai-s-reset-calls" class="btn btn-ghost" type="button">调用计数清零</button>' +
        '</div>' +
        '<div id="ai-s-result" style="margin-top:10px"></div>' +
        '<p style="color:var(--muted);font-size:12px;margin-top:10px">安全提示：Key 保存在本机浏览器（localStorage），' +
          '适合「学校/老师自己填自己的 Key」的使用方式；请勿在公共电脑上保存 Key。' +
          '如需公开网站部署，应改为后端代理转发（见项目《后端演进》文档）。</p>' +
      '</div>';
    /** 渲染真实检测结果：连通=绿色摘要，未连通=分步排查指引（不再只凭协议报警） */
    async function refreshPanelStatus() {
      // 现取 DOM：面板会整体重渲染，捕获的 root 可能已被替换——那样异步结果会写进看不见的旧节点，
      // 屏幕上就留着过期状态（实测：配置已保存并连通，① 服务检测仍是「连接失败：尚未填写接口地址」）
      var box = document.getElementById('ai-s-status');
      if (!box) return;
      box.innerHTML = '<span style="color:var(--muted);font-size:12px">正在检测模型服务…</span>';
      var probe = await AI.probe();
      var guide = AI.localGuide(probe);
      if (!probe.ok && !guide) {
        // 「尚未配置」不等于「连不上」：未填地址/Key 时给中性提示与下一步，而不是红色失败
        var notYet = /尚未填写/.test(probe.error || '');
        box.innerHTML = notYet
          ? '<span style="color:var(--muted);font-size:12.5px">尚未配置模型服务：选择「模型厂商」、填写接口地址与模型名称后，点下方「保存配置」；本地 Ollama 请先在本机启动服务。</span>'
          : UI.badge('连接失败：' + (probe.error || '未知原因'), 'danger');
        return;
      }
      if (guide && guide.level === 'ok') {
        box.innerHTML = UI.badge('① 服务检测：' + guide.title, 'success') +
          '<ul style="margin:6px 0 0;padding-left:20px;font-size:12.5px;color:var(--muted);line-height:1.8">' +
          guide.steps.map(function (x) { return '<li>' + Utils.escapeHtml(x) + '</li>'; }).join('') + '</ul>';
        return;
      }
      if (guide && guide.level === 'bad') {
        box.innerHTML = UI.badge('① 服务检测：' + guide.title, 'danger') +
          '<ul style="margin:6px 0 0;padding-left:20px;font-size:12.5px;color:var(--text);line-height:1.9">' +
          guide.steps.map(function (x) { return '<li>' + Utils.escapeHtml(x) + '</li>'; }).join('') + '</ul>' +
          '<p style="color:var(--muted);font-size:12px;margin-top:6px">上面的「复制启动命令」可直接粘贴到 CMD 执行；' +
          '项目内《部署指南/Ollama本地大模型部署（Windows）.md》有图解步骤。</p>';
      }
    }
    refreshPanelStatus();

    // 模型名称：失焦即把误填的命令规范化成纯模型名（当场纠正，不留到调用时才报错）
    var modelInput = $('#ai-s-model', p);
    if (modelInput) {
      modelInput.addEventListener('blur', function () {
        var raw = this.value;
        var fixed = AI.normalizeModel(raw);
        if (fixed && fixed !== raw.trim()) {
          this.value = fixed;
          Toast.info('模型名称已规范为「' + fixed + '」——ollama pull … 是终端命令，不需要填在这里');
        }
      });
    }
    var provSel = $('#ai-s-provider', p);
    provSel.addEventListener('change', function () {
      var m = AI.providerMeta(this.value);
      if (!m) return;
      $('#ai-s-base', p).value = m.base;
      $('#ai-s-model', p).value = m.model;
    });
    $('#ai-s-save', p).addEventListener('click', function () {
      AI.saveConfig({
        provider: provSel.value,
        base: $('#ai-s-base', p).value.trim(),
        model: $('#ai-s-model', p).value.trim(),
        key: $('#ai-s-key', p).value.trim()
      });
      AI.setMask($('#ai-s-mask', p).checked);
      var typed = $('#ai-s-model', p).value;
      var saved = AI.config().model;
      if (AI.normalizeModel(typed) !== String(typed).trim()) {
        $('#ai-s-model', p).value = saved;
        Toast.info('模型名称已规范为「' + saved + '」并保存（命令请到终端执行）', 4000);
      } else {
        Toast.success('配置已保存到本机');
      }
      renderStatus();
      refreshPanelStatus();   // 用刚保存的配置重新检测，别让过期状态留在屏幕上
    });
    $('#ai-s-test', p).addEventListener('click', async function () {
      AI.saveConfig({
        provider: provSel.value,
        base: $('#ai-s-base', p).value.trim(),
        model: $('#ai-s-model', p).value.trim(),
        key: $('#ai-s-key', p).value.trim()
      });
      document.getElementById('ai-s-result').innerHTML = UI.badge('正在测试…', 'info');
      var res = await AI.test();
      document.getElementById('ai-s-result').innerHTML = res.ok
        ? UI.badge('② 对话测试：连接成功，模型可用（' + String(res.content).slice(0, 20) + '）', 'success')
        : UI.badge('② 对话测试失败：' + res.error, 'danger');
      renderStatus();
      refreshPanelStatus();
    });
    var tagsBtn = $('#ai-s-tags', p);
    if (tagsBtn) {
      tagsBtn.addEventListener('click', async function () {
        // 先把当前填写的地址/模型/Key 存下来再探测（探测用地址）
        AI.saveConfig({
          provider: provSel.value,
          base: $('#ai-s-base', p).value.trim(),
          model: $('#ai-s-model', p).value.trim(),
          key: $('#ai-s-key', p).value.trim()
        });
        var box = document.getElementById('ai-s-models');
        box.innerHTML = UI.badge('正在读取本机模型…', 'info');
        var res = await AI.listLocalModels();
        if (!res.ok) { box.innerHTML = UI.badge(res.error, 'danger'); return; }
        box.innerHTML = '<div style="color:var(--muted);font-size:12px;margin-bottom:4px">本机已安装 ' + res.models.length +
            ' 个模型（点一下 = 填入模型名并保存）：</div>' + res.models.map(function (m) {
          return '<span class="chip dl-cat-chip" data-model="' + Utils.escapeHtml(m.name) + '" style="cursor:pointer">' +
            Utils.escapeHtml(m.name) + (m.size ? ' <b>' + m.size + '</b>' : '') + '</span>';
        }).join('');
        $$('#ai-s-models [data-model]', p).forEach(function (el) {
          el.addEventListener('click', function () {
            $('#ai-s-model', p).value = el.dataset.model;
            AI.saveConfig({
              provider: provSel.value,
              base: $('#ai-s-base', p).value.trim(),
              model: el.dataset.model,
              key: $('#ai-s-key', p).value.trim()
            });
            Toast.success('已选择模型 ' + el.dataset.model + '（已保存）');
            renderStatus();
            refreshPanelStatus();
          });
        });
        refreshPanelStatus();
      });
    }
    // 推荐模型：点击复制拉取命令
    $$('#ai-s-status ~ * [data-pull], [data-pull]', p).forEach(function (el) {
      el.addEventListener('click', function () {
        Utils.copyText('ollama pull ' + el.dataset.pull);
      });
    });
    var recheckBtn = $('#ai-s-recheck', p);
    if (recheckBtn) recheckBtn.addEventListener('click', function () { refreshPanelStatus(); });
    var cmdBtn = $('#ai-s-cmd', p);
    if (cmdBtn) {
      cmdBtn.addEventListener('click', function () {
        Utils.copyText(AI.localStartCommand());
        Toast.info('已复制启动命令：可在 PowerShell/CMD 中粘贴执行（含模型目录与跨域设置）', 5000);
      });
    }
    $('#ai-s-clear', p).addEventListener('click', function () {
      UI.confirm({
        title: '清空 AI 配置',
        message: '将清除本机保存的接口地址、模型与 API Key（不影响系统数据）。确定吗？',
        onOk() { AI.clearConfig(); Toast.success('已清空 AI 配置'); renderStatus(); renderPanel(); }
      });
    });
    $('#ai-s-reset-calls', p).addEventListener('click', function () {
      AI.resetCalls(); Toast.success('调用计数已清零'); renderSetting(p);
    });
  }

  // 支持从其它页面带参定位标签（如学业预警页的「生成帮扶方案」写入 aiOpenTab=help）
  var wantedTab = Store.getPref('aiOpenTab', '');
  if (wantedTab && TABS.some(function (t) { return t.k === wantedTab; })) {
    state.tab = wantedTab;
    Store.setPref('aiOpenTab', '');   // 用后即清，避免下次进入总是跳该标签
  } else {
    state.tab = TABS[0].k;
  }
  renderStatus();
  renderTabs();
  renderPanel();
};
