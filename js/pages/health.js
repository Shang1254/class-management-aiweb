/* =====================================================
 * 健康日报（校园健康监测场景）
 * - 学生端：每日填报体温与健康状况（每天一条，可当日修改）
 * - 教师端：按班级+日期查看填报进度、异常名单（发热/超体温阈值）
 * - 异常联动：异常学生自动进入班级健康提醒，可导出 CSV 上报
 * ===================================================== */

/* ---------------- 教师 / 管理员：班级健康日报汇总 ---------------- */

Pages['health-report'] = function (container, user) {
  // 健康日报为辅导员专属端口（管理员可查）：任课教师不可查看学生健康数据
  if (!Auth.isAdmin(user) && !Auth.isCounselor(user)) {
    container.innerHTML = '<div class="card">' + UI.empty('健康日报为辅导员专属功能：学生健康与校外动向由辅导员查看管理，任课教师无需接触该类敏感数据') + '</div>';
    return;
  }
  var classes = Auth.visibleClasses(user);
  var scopeIds = Auth.scopeClassIds(user);
  var state = {
    date: Utils.today(),
    classId: Auth.isTeacher(user) ? (scopeIds[0] || '') : (classes[0] ? classes[0].id : '')
  };

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">健康日报</div>' +
        '<div class="toolbar-actions">' +
          '<input type="date" id="hr-date" class="input" value="' + state.date + '">' +
          '<select id="hr-class" class="input">' +
            UI.options(classes, 'id', function (c) { return c.name; }, state.classId, '请选择班级') +
          '</select>' +
          '<button id="btn-hr-export" class="btn btn-ghost" type="button">导出CSV</button>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12px;margin:-6px 0 12px">打卡位置用于辅导员掌握学生动向（假期出行 / 校外居住 / 安全排查）：学生在校外打卡时自动进入下方「校外动向」列表，遇突发情况可快速定位。</p>' +
      '<div id="hr-summary"></div>' +
      '<div id="hr-outside"></div>' +
      '<div id="hr-list"></div>' +
    '</div>';

  if (!classes.length) {
    $('#hr-summary', container).innerHTML = UI.empty('暂无班级，请先在「班级管理」中创建班级');
    return;
  }

  $('#hr-date', container).addEventListener('change', function () {
    state.date = this.value || Utils.today();
    render();
  });
  $('#hr-class', container).addEventListener('change', function () {
    state.classId = this.value;
    render();
  });
  $('#btn-hr-export', container).addEventListener('click', exportCSV);

  render();

  function render() {
    if (!state.classId) {
      $('#hr-summary', container).innerHTML = UI.empty('请选择班级');
      $('#hr-outside', container).innerHTML = '';
      $('#hr-list', container).innerHTML = '';
      return;
    }
    var sum = Store.healthSummary(state.classId, state.date);
    var rate = sum.total ? Math.round(sum.done / sum.total * 100) : 0;

    /* 校外动向（辅导员视角）：取每位学生最近一次打卡位置，筛出校园外的 */
    var studentsAll = Store.list('students').filter(function (s) { return s.classId === state.classId; });
    var latestByStu = {};
    Store.list('healthReports').filter(function (r) {
      return r.classId === state.classId && r.location;
    }).forEach(function (r) {
      var cur = latestByStu[r.studentId];
      if (!cur || r.date > cur.date || (r.date === cur.date && String(r.submitTime || '') > String(cur.submitTime || ''))) {
        latestByStu[r.studentId] = r;
      }
    });
    var isInside = function (loc) { return /校内|晴川/.test(loc || ''); };
    var outsideList = studentsAll.filter(function (s) {
      var r = latestByStu[s.id];
      return r && !isInside(r.location);
    }).map(function (s) {
      var r = latestByStu[s.id];
      return { stu: s, report: r, today: r.date === Utils.today() };
    });

    $('#hr-summary', container).innerHTML =
      '<div class="att-summary">' +
        '<span class="chip">应报 <b>' + sum.total + '</b></span>' +
        '<span class="chip chip-ok">已报 <b>' + sum.done + '</b></span>' +
        '<span class="chip ' + (sum.total - sum.done ? 'chip-warn' : '') + '">未报 <b>' + (sum.total - sum.done) + '</b></span>' +
        '<span class="chip chip-bad">异常 <b>' + sum.abnormal.length + '</b></span>' +
        '<span class="chip ' + (outsideList.length ? 'chip-warn' : '') + '">校外动向 <b>' + outsideList.length + '</b> 人</span>' +
        '<span class="chip">填报率 <b>' + rate + '%</b></span>' +
      '</div>';

    /* 校外动向列表（辅导员重点关注：假期出行 / 校外居住 / 安全排查） */
    if (outsideList.length) {
      $('#hr-outside', container).innerHTML =
        '<h3 style="margin:16px 0 10px;font-family:var(--serif);font-size:15px;letter-spacing:2px;color:var(--warning)">· 校外动向（辅导员重点关注 · 最新打卡位置）</h3>' +
        '<div class="table-wrap"><table class="table"><thead><tr>' +
          '<th>学号</th><th>姓名</th><th>最新位置</th><th>打卡日期</th><th>今日状态</th></tr></thead><tbody>' +
        outsideList.map(function (o) {
          return '<tr>' +
            '<td>' + Utils.escapeHtml(o.stu.studentNo) + '</td>' +
            '<td><b>' + Utils.escapeHtml(o.stu.name) + '</b></td>' +
            '<td class="td-address" title="' + Utils.escapeHtml(o.report.location) + '">' + Utils.escapeHtml(o.report.location) + '</td>' +
            '<td>' + Utils.escapeHtml(o.report.date) + ' ' + Utils.escapeHtml(String(o.report.submitTime || '').slice(11)) + '</td>' +
            '<td>' + (o.today ? UI.badge('今日已打卡', 'success') : UI.badge('今日未打卡', 'danger')) + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p style="color:var(--muted);font-size:12px;margin-top:8px">如有学生假期出行或校外居住，建议辅导员核对行程与紧急联系人；今日未打卡的校外学生请优先跟进。</p>';
    } else {
      $('#hr-outside', container).innerHTML = '';
    }

    var html = '';

    // 异常名单（最优先展示）
    if (sum.abnormal.length) {
      html += '<h3 style="margin:14px 0 10px;font-family:var(--serif);font-size:15px;letter-spacing:2px;color:var(--danger)">· 健康异常（需重点关注）</h3>';
      html += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>学号</th><th>姓名</th><th>体温</th><th>健康状况</th><th>打卡位置</th><th>备注</th><th>填报时间</th></tr></thead><tbody>' +
        sum.abnormal.map(function (a) {
          return '<tr>' +
            '<td>' + Utils.escapeHtml(a.stu.studentNo) + '</td>' +
            '<td><b>' + Utils.escapeHtml(a.stu.name) + '</b></td>' +
            '<td><b class="' + (Number(a.report.temp) > Store.HEALTH_TEMP_MAX ? 'score-lo' : '') + '">' + Utils.escapeHtml(String(a.report.temp)) + ' ℃</b></td>' +
            '<td>' + UI.badge(a.report.status, a.report.status === '发热' ? 'danger' : 'warning') + '</td>' +
            '<td class="td-address" title="' + Utils.escapeHtml(a.report.location || '') + '">' + Utils.escapeHtml(a.report.location || '—') + '</td>' +
            '<td>' + Utils.escapeHtml(a.report.remark || '—') + '</td>' +
            '<td>' + Utils.escapeHtml(a.report.submitTime || '') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';
    }

    // 未填报名单
    if (sum.pending.length) {
      html += '<h3 style="margin:16px 0 10px;font-family:var(--serif);font-size:15px;letter-spacing:2px;color:var(--warning)">· 未填报（' + sum.pending.length + ' 人）</h3>';
      html += '<div class="att-summary">' + sum.pending.map(function (s) {
        return '<span class="chip">' + Utils.escapeHtml(s.name) + '</span>';
      }).join('') + '</div>';
    }

    // 全部填报记录
    var all = Store.list('healthReports').filter(function (r) {
      return r.date === state.date && r.classId === state.classId;
    }).sort(function (a, b) { return String(a.submitTime || '').localeCompare(String(b.submitTime || '')); });
    if (all.length) {
      html += '<h3 style="margin:16px 0 10px;font-family:var(--serif);font-size:15px;letter-spacing:2px">· 全部填报记录（' + all.length + ' 条）</h3>';
      html += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>学号</th><th>姓名</th><th>体温</th><th>健康状况</th><th>打卡位置</th><th>填报时间</th></tr></thead><tbody>' +
        all.map(function (r) {
          var stu = Store.getStudent(r.studentId);
          return '<tr>' +
            '<td>' + Utils.escapeHtml(stu ? stu.studentNo : '—') + '</td>' +
            '<td>' + Utils.escapeHtml(stu ? stu.name : '未知学生') + '</td>' +
            '<td>' + Utils.escapeHtml(String(r.temp)) + ' ℃</td>' +
            '<td>' + UI.badge(r.status, r.status === '健康' ? 'success' : (r.status === '发热' ? 'danger' : 'warning')) + '</td>' +
            '<td class="td-address" title="' + Utils.escapeHtml(r.location || '') + '">' + Utils.escapeHtml(r.location || '—') + '</td>' +
            '<td>' + Utils.escapeHtml(r.submitTime || '') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';
    } else if (!sum.abnormal.length && !sum.pending.length) {
      html = UI.empty('该班级当日暂无填报记录');
    }

    $('#hr-list', container).innerHTML = html;
  }

  function exportCSV() {
    var sum = Store.healthSummary(state.classId, state.date);
    var all = Store.list('healthReports').filter(function (r) {
      return r.date === state.date && r.classId === state.classId;
    });
    if (!all.length) { Toast.warning('当日暂无填报数据'); return; }
    Utils.exportCSV('健康日报_' + Store.className(state.classId) + '_' + state.date + '.csv',
      ['学号', '姓名', '体温(℃)', '健康状况', '打卡位置', '备注', '填报时间'],
      all.map(function (r) {
        var stu = Store.getStudent(r.studentId);
        return [stu ? stu.studentNo : '', stu ? stu.name : '', r.temp, r.status, r.location || '', r.remark || '', r.submitTime || ''];
      }));
    Toast.success('已导出 ' + all.length + ' 条健康日报');
  }
};

/* ---------------- 学生端：每日健康填报 ---------------- */

Pages['my-health'] = function (container, user) {
  var stu = user.studentId ? Store.getStudent(user.studentId) : null;
  if (!stu) {
    container.innerHTML = '<div class="card">' + UI.empty('未找到与你关联的学生档案，请联系管理员') + '</div>';
    return;
  }
  var today = Utils.today();
  var myReport = Store.list('healthReports').find(function (r) {
    return r.studentId === stu.id && r.date === today;
  });

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">健康日报 · ' + Utils.escapeHtml(today) + '</div>' +
        '<div class="toolbar-actions">' +
          (myReport
            ? UI.badge('今日已填报', 'success') + ' <button id="btn-hr-edit" class="btn btn-ghost btn-sm" type="button">修改填报</button>'
            : '<button id="btn-hr-submit" class="btn btn-primary" type="button">立即填报</button>') +
        '</div>' +
      '</div>' +
      /* 打卡人身份（实时展示姓名 / 学号 / 班级） */
      '<div class="att-summary" style="margin-bottom:12px">' +
        '<span class="chip">打卡人 <b>' + Utils.escapeHtml(stu.name) + '</b></span>' +
        '<span class="chip">学号 <b>' + Utils.escapeHtml(stu.studentNo) + '</b></span>' +
        '<span class="chip">班级 <b>' + Utils.escapeHtml(Store.className(stu.classId)) + '</b></span>' +
      '</div>' +
      '<div id="hr-today"></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="toolbar"><div class="toolbar-title">我的填报记录</div></div>' +
      '<div id="hr-history"></div>' +
    '</div>';

  renderToday();
  renderHistory();

  function renderToday() {
    var el = $('#hr-today', container);
    if (!myReport) {
      el.innerHTML = UI.empty('今日尚未填报健康日报，请点击右上角「立即填报」（填报时可一键获取打卡位置）');
      return;
    }
    var abnormal = myReport.status !== '健康' || Number(myReport.temp) > Store.HEALTH_TEMP_MAX;
    el.innerHTML =
      '<div class="att-summary">' +
        '<span class="chip">体温 <b>' + Utils.escapeHtml(String(myReport.temp)) + ' ℃</b></span>' +
        '<span class="chip ' + (abnormal ? 'chip-bad' : 'chip-ok') + '">状态 <b>' + Utils.escapeHtml(myReport.status) + '</b></span>' +
        '<span class="chip">填报时间 <b>' + Utils.escapeHtml(myReport.submitTime || '') + '</b></span>' +
        '<span class="chip chip-info">打卡位置 <b>' + Utils.escapeHtml(myReport.location || '未记录') + '</b></span>' +
      '</div>' +
      (myReport.remark ? '<div class="asg-content">' + Utils.escapeHtml(myReport.remark) + '</div>' : '') +
      (abnormal
        ? '<p style="color:var(--danger);font-size:13px;line-height:1.9">如有发热等不适请及时就医并联系辅导员，系统已将你的情况列入班级健康关注名单。</p>'
        : '<p style="color:var(--muted);font-size:13px">你的健康状况正常，注意勤洗手、多通风，规律作息。</p>');
  }

  function renderHistory() {
    var list = Store.list('healthReports').filter(function (r) { return r.studentId === stu.id; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .slice(0, 14);
    $('#hr-history', container).innerHTML = list.length
      ? UI.tableWrap('<tr><th>日期</th><th>体温</th><th>健康状况</th><th>打卡位置</th><th>填报时间</th></tr>',
          list.map(function (r) {
            return '<tr><td>' + Utils.escapeHtml(r.date) + '</td>' +
              '<td>' + Utils.escapeHtml(String(r.temp)) + ' ℃</td>' +
              '<td>' + UI.badge(r.status, r.status === '健康' ? 'success' : (r.status === '发热' ? 'danger' : 'warning')) + '</td>' +
              '<td class="td-address" title="' + Utils.escapeHtml(r.location || '') + '">' + Utils.escapeHtml(r.location || '—') + '</td>' +
              '<td>' + Utils.escapeHtml(r.submitTime || '') + '</td></tr>';
          }).join(''))
      : UI.empty('暂无健康填报记录');
  }

  /**
   * 逆地理编码：输出「省 · 市 · 区 · 街道」完整行政链 + 道路/门牌明细
   * - 主源 BigDataCloud（浏览器可直连，含街道级行政链，免密钥）
   * - 增强源 OpenStreetMap Nominatim（补充道路/门牌/地物名，5 秒超时，失败自动省略）
   */
  async function reverseGeocode(lat, lng) {
    var coords = lat.toFixed(5) + ', ' + lng.toFixed(5);
    var chain = [], detail = '', sources = [];
    // ① 行政链（省/市/区/街道，按 order 从大到小排列去重）
    try {
      var r1 = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat +
        '&longitude=' + lng + '&localityLanguage=zh');
      var g = await r1.json();
      var adm = ((g.localityInfo || {}).administrative) || [];
      chain = adm.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
        .map(function (a) { return String(a.name || '').trim(); })
        .filter(function (n, i, arr) { return n && n !== g.countryName && arr.indexOf(n) === i; });
      if (!chain.length) chain = [g.principalSubdivision, g.city, g.locality].filter(Boolean);
      if (chain.length) sources.push('BigDataCloud');
    } catch (e) { /* 静默降级 */ }
    // ② 道路/门牌明细（OSM，可选增强）
    try {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 5000) : null;
      var r2 = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=zh-CN&lat=' +
        lat + '&lon=' + lng, ctrl ? { signal: ctrl.signal } : {});
      if (timer) clearTimeout(timer);
      var n = await r2.json();
      var a = n.address || {};
      var parts = [];
      if (a.road) parts.push(a.road + (a.house_number ? ' ' + a.house_number + '号' : ''));
      else if (n.name) parts.push(n.name);
      ['neighbourhood', 'suburb'].forEach(function (k) { if (a[k]) parts.push(a[k]); });
      detail = parts.filter(function (x, i, arr) { return arr.indexOf(x) === i; }).join(' · ');
      if (detail) sources.push('OSM');
    } catch (e) { /* 静默省略 */ }
    var text = chain.join(' · ');
    if (detail) text += (text ? ' · ' : '') + detail;
    if (!text) text = '经纬度 ' + coords;
    else text += '（' + coords + '）';
    return { text: text, source: sources.join(' + ') || '坐标定位' };
  }

  /** 实时定位：浏览器定位 + 逆地理编码（省市区街道/道路门牌），失败可手动填写 */
  async function locateInto(inputEl, statusEl) {
    if (!navigator.geolocation) {
      statusEl.textContent = '当前环境不支持定位（本地文件打开时浏览器会限制），请手动填写打卡位置（如：湖北省武汉市江夏区…）';
      return;
    }
    statusEl.textContent = '正在获取当前位置…（如弹出授权提示请选择「允许」）';
    navigator.geolocation.getCurrentPosition(async function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      var coords = lat.toFixed(5) + ', ' + lng.toFixed(5);
      var t = new Date(pos.timestamp || Date.now());
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      inputEl.value = '定位中…（' + coords + '）';
      statusEl.textContent = '已获取坐标，正在解析行政地址（省 · 市 · 区 · 街道）…';
      var g = await reverseGeocode(lat, lng);
      inputEl.value = g.text;
      statusEl.textContent = '已定位 · ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds()) +
        ' · 精度约 ' + Math.round(pos.coords.accuracy || 0) + ' 米 · 数据源：' + g.source + '（免密钥）';
    }, function (err) {
      statusEl.textContent = '定位失败（' + (err && err.code === 1 ? '权限被拒绝' : '设备/环境不支持') + '），请手动填写打卡位置';
    }, { timeout: 8000, enableHighAccuracy: true });
  }

  function openForm(isEdit) {
    var model = isEdit && myReport ? myReport : { temp: '36.5', status: '健康', remark: '', location: '' };
    var mask = UI.modal({
      title: isEdit ? '修改今日健康填报' : '健康日报填报 · ' + today,
      submitText: '提 交',
      body:
        '<div class="att-summary" style="margin-bottom:12px">' +
          '<span class="chip">打卡人 <b>' + Utils.escapeHtml(stu.name) + '（' + Utils.escapeHtml(stu.studentNo) + '）</b></span>' +
          '<span class="chip">' + Utils.escapeHtml(Store.className(stu.classId)) + '</span>' +
        '</div>' +
        '<div class="form-grid">' +
          UI.formRow('今日体温（℃）', '<input id="f-temp" class="input" type="number" min="34" max="42" step="0.1" value="' + Utils.escapeHtml(String(model.temp)) + '">', true) +
          UI.formRow('健康状况', '<select id="f-status" class="input">' +
            Store.HEALTH_STATUS.map(function (s) {
              return '<option' + (s === model.status ? ' selected' : '') + '>' + s + '</option>';
            }).join('') + '</select>', true) +
        '</div>' +
        UI.formRow('打卡位置（实时定位 · 可手动修改）',
          '<div class="loc-row">' +
            '<input id="f-loc" class="input" value="' + Utils.escapeHtml(model.location || '') + '" placeholder="点击右侧按钮获取当前位置（省 · 市 · 区 · 街道），或手动填写">' +
            '<button id="btn-loc" class="btn btn-ghost" type="button">获取当前位置</button>' +
          '</div>' +
          '<div id="loc-status" class="loc-status"></div>') +
        UI.formRow('备注（不适症状说明 / 就医情况，选填）', '<textarea id="f-remark" class="input" rows="3" placeholder="如有发热、咳嗽等情况请简要说明">' + Utils.escapeHtml(model.remark || '') + '</textarea>') +
        '<p style="color:var(--muted);font-size:12px;line-height:1.8;margin-top:6px">提示：体温超过 ' + Store.HEALTH_TEMP_MAX + ' ℃ 或状态非「健康」时，系统将自动通知班级教师重点关注；打卡位置将记录在日报中备查。</p>',
      onSubmit(root, close) {
        var temp = Number($('#f-temp', root).value);
        var status = $('#f-status', root).value;
        var location = $('#f-loc', root).value.trim();
        var remark = $('#f-remark', root).value.trim();
        if (!temp || temp < 34 || temp > 42) return Toast.error('请输入有效体温（34 ~ 42 ℃）');
        if (status !== '健康' && !remark) return Toast.warning('身体不适时请填写备注说明情况');
        if (!location) return Toast.warning('请获取当前位置或手动填写打卡位置');
        var data = {
          date: today, classId: stu.classId, studentId: stu.id,
          temp: Math.round(temp * 10) / 10, status: status, remark: remark,
          location: location,
          submitTime: Utils.nowStr()
        };
        if (myReport) {
          // 注：Store.update/add 已自动写入操作日志，此处不重复记录
          Store.update('healthReports', myReport.id, data);
          myReport = Store.find('healthReports', myReport.id);
          Toast.success('今日健康填报已更新');
        } else {
          myReport = Store.add('healthReports', data);
          Toast.success('健康日报提交成功');
        }
        close();
        // 重新渲染
        Pages['my-health'](container, user);
        if (status !== '健康' || temp > Store.HEALTH_TEMP_MAX) {
          Toast.warning('已记录异常，班委/教师将重点关注');
        }
      }
    });
    // 定位按钮绑定（UI.modal 返回 mask，内部元素在此查询）
    $('#btn-loc', mask).addEventListener('click', function () {
      locateInto($('#f-loc', mask), $('#loc-status', mask));
    });
  }

  var submitBtn = $('#btn-hr-submit', container);
  if (submitBtn) submitBtn.addEventListener('click', function () { openForm(false); });
  var editBtn = $('#btn-hr-edit', container);
  if (editBtn) editBtn.addEventListener('click', function () { openForm(true); });
};
