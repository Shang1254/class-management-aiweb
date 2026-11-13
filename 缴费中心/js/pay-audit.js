/* =====================================================
 * 班级缴费中心 · 智能审计层（pay-audit.js）
 * -----------------------------------------------------
 * 定位：规则引擎查异常（只读，不修改任何数据）+ AI 出审计报告（离线兜底）
 * 设计对标宿主三个 Agent 的四条约束：
 *   · 规则白名单：每条审计规则只读 PayStore，结论必须带证据（可解释）
 *   · 离线降级：AI 未配置/断网时自动落离线审计意见模板
 *   · 只读：审计不产生任何写操作（仅把上次审计结论存本机偏好供回看）
 *   · 留痕联动：直接分析 pay_logs 操作日志（删除密集等行为异常可检出）
 * ===================================================== */

var PayAudit = window.PayAudit = {

  /** 单条证据最多展示行数（超出折叠为「等 N 条」） */
  EVIDENCE_MAX: 6,

  /* ---------------- 规则白名单（每条返回 finding 或 null） ---------------- */

  RULES: [

    {
      id: 'negative-balance', level: 'high',
      title: '账本出现负结余',
      hint: '按日期重放全部流水，任一时点结余为负都说明支出先于收入入账。',
      run: function (ctx) {
        var rows = ctx.ledger.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        var bal = 0, bad = [];
        for (var i = 0; i < rows.length; i++) {
          bal += (rows[i].type === '收入' ? 1 : -1) * rows[i].amountFen;
          if (bal < 0) bad.push({ date: rows[i].date, bal: bal, desc: rows[i].desc });
        }
        if (!bad.length) return null;
        return {
          detail: '有 ' + bad.length + ' 个时点结余为负，最低到 ' + PayUtils.fenYuan(bad[bad.length - 1].bal) + ' 元。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (b) {
            return b.date + ' 结余 ' + PayUtils.fenYuan(b.bal) + ' 元（' + b.desc + ' 之后）';
          }),
          evidenceMore: bad.length,
          suggestion: '核对支出入账日期是否早于对应费项的对账入账；确有垫支的，请在说明中注明并经辅导员确认。'
        };
      }
    },

    {
      id: 'reconcile-gap', level: 'high',
      title: '对账缺口：核销与入账不一致',
      hint: '账本「自动对账入账」合计应与已核销缴费单合计一致，不一致即存在漏入账或多入账。',
      run: function (ctx) {
        var autoIn = 0;
        ctx.ledger.forEach(function (l) { if (l.auto && l.type === '收入') autoIn += l.amountFen; });
        var verified = 0;
        ctx.orders.forEach(function (o) { if (o.status === '已核销') verified += o.amountFen; });
        if (autoIn === verified) return null;
        var diff = verified - autoIn;
        return {
          detail: '已核销缴费单合计 ' + PayUtils.fenYuan(verified) + ' 元，账本自动入账合计 ' + PayUtils.fenYuan(autoIn) + ' 元，差额 ' + PayUtils.fenYuan(Math.abs(diff)) + ' 元（' + (diff > 0 ? '少入账' : '多入账') + '）。',
          evidence: ['已核销订单 ' + ctx.orders.filter(function (o) { return o.status === '已核销'; }).length + ' 笔',
            '自动入账流水 ' + ctx.ledger.filter(function (l) { return l.auto && l.type === '收入'; }).length + ' 笔'],
          evidenceMore: 0,
          suggestion: '在「费项 → 对账核销」补齐未入账的已核销订单；若误删过自动流水，请按缴费名单逐笔核对补记。'
        };
      }
    },

    {
      id: 'duplicate-expense', level: 'high',
      title: '疑似重复入账的支出',
      hint: '同一天、同一类别、同一金额的支出多次入账，可能是重复报销。',
      run: function (ctx) {
        var map = {};
        ctx.ledger.forEach(function (l) {
          if (l.type !== '支出') return;
          var key = l.date + '|' + l.category + '|' + l.amountFen;
          (map[key] = map[key] || []).push(l);
        });
        var groups = Object.keys(map).map(function (k) { return map[k]; }).filter(function (g) { return g.length >= 2; });
        if (!groups.length) return null;
        return {
          detail: groups.length + ' 组支出存在「同日·同类·同金额」多笔入账。',
          evidence: groups.slice(0, PayAudit.EVIDENCE_MAX).map(function (g) {
            return g[0].date + ' ' + g[0].category + ' ' + PayUtils.fenYuan(g[0].amountFen) + ' 元 × ' + g.length + ' 笔（' + g[0].desc + ' 等）';
          }),
          evidenceMore: groups.length,
          suggestion: '逐组核对原始凭证：确属两笔不同业务的请补充事由区分；重复入账的删除多余流水并留痕。'
        };
      }
    },

    {
      id: 'paid-after-deadline', level: 'medium',
      title: '截止日期之后的缴费',
      hint: '费项截止后仍有订单转为已支付，需说明是宽限收款还是登记口径问题。',
      run: function (ctx) {
        var bad = ctx.orders.filter(function (o) {
          var fee = ctx.feeById[o.feeId];
          if (!fee || !fee.deadline || !o.paidAt) return false;
          return o.paidAt.slice(0, 10) > fee.deadline;
        });
        if (!bad.length) return null;
        return {
          detail: bad.length + ' 笔缴费发生在费项截止日之后。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (o) {
            return o.feeName + ' · ' + o.name + ' · 支付 ' + o.paidAt.slice(0, 10) + '（截止 ' + (ctx.feeById[o.feeId].deadline) + '）';
          }),
          evidenceMore: bad.length,
          suggestion: '补收属正常业务的，在费项说明中注明宽限期；否则应退款并在催缴环节重新截止。'
        };
      }
    },

    {
      id: 'paid-not-booked', level: 'medium',
      title: '收款超过 7 天未核销入账',
      hint: '学生已付款但长期停在「已支付」，班费账本体现不出这笔钱。',
      run: function (ctx) {
        var limit = PayUtils.daysAgo(7);
        var bad = ctx.orders.filter(function (o) {
          return o.status === '已支付' && o.paidAt && o.paidAt.slice(0, 10) < limit;
        });
        if (!bad.length) return null;
        var sum = bad.reduce(function (s, o) { return s + o.amountFen; }, 0);
        return {
          detail: bad.length + ' 笔已支付订单（合计 ' + PayUtils.fenYuan(sum) + ' 元）超过 7 天未核销。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (o) {
            return o.feeName + ' · ' + o.name + ' · 支付于 ' + o.paidAt.slice(0, 10);
          }),
          evidenceMore: bad.length,
          suggestion: '尽快在「费项 → 对账核销」入账；线下收款补登记的请先补渠道信息。'
        };
      }
    },

    {
      id: 'overdue-fee-open', level: 'medium',
      title: '费项已过截止日仍为「征集中」',
      hint: '截止日已过但费项未截止/未结清，新缴费会继续被受理。',
      run: function (ctx) {
        var today = PayUtils.today();
        var bad = ctx.fees.filter(function (f) {
          return f.status === '征集中' && f.deadline && f.deadline < today;
        });
        if (!bad.length) return null;
        return {
          detail: bad.length + ' 个费项已过截止日仍开放收费。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (f) {
            var st = PayAudit._feeStat(ctx, f.id);
            return f.name + ' · 截止 ' + f.deadline + ' · 待缴 ' + st.unpaid + ' 人';
          }),
          evidenceMore: bad.length,
          suggestion: '先催缴再「截止」；全部核销后费项会自动转为已结清。'
        };
      }
    },

    {
      id: 'expense-no-proof', level: 'medium',
      title: '支出缺少凭证说明',
      hint: '无凭证的支出在公示与核查时无法佐证。',
      run: function (ctx) {
        var bad = ctx.ledger.filter(function (l) { return l.type === '支出' && !l.proof; });
        if (!bad.length) return null;
        var sum = bad.reduce(function (s, l) { return s + l.amountFen; }, 0);
        return {
          detail: bad.length + ' 笔支出（合计 ' + PayUtils.fenYuan(sum) + ' 元）未登记凭证留存方式。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (l) {
            return l.date + ' ' + PayUtils.fenYuan(l.amountFen) + ' 元 · ' + l.desc + '（经办 ' + (l.by || '—') + '）';
          }),
          evidenceMore: bad.length,
          suggestion: '补记发票/小票留存方式（如「电子发票 · 经办人留存」）；确实无凭证的经辅导员确认后补注说明。'
        };
      }
    },

    {
      id: 'large-expense', level: 'medium',
      title: '大额支出（显著高于日常水平）',
      hint: '单笔支出达到日常均值 3 倍且不少于 100 元时提示复核。',
      run: function (ctx) {
        var exp = ctx.ledger.filter(function (l) { return l.type === '支出'; });
        if (exp.length < 3) return null;
        var avg = exp.reduce(function (s, l) { return s + l.amountFen; }, 0) / exp.length;
        var th = Math.max(avg * 3, 10000);
        var bad = exp.filter(function (l) { return l.amountFen >= th; });
        if (!bad.length) return null;
        return {
          detail: bad.length + ' 笔支出达到复核线（' + PayUtils.fenYuan(Math.round(th)) + ' 元 = 日常均值 ' + PayUtils.fenYuan(Math.round(avg)) + ' 元 × 3）。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (l) {
            return l.date + ' ' + PayUtils.fenYuan(l.amountFen) + ' 元 · ' + l.category + ' · ' + l.desc;
          }),
          evidenceMore: bad.length,
          suggestion: '大额支出建议班委会/辅导员知悉后再执行，并在凭证中附比价或审批记录。'
        };
      }
    },

    {
      id: 'delete-heavy', level: 'medium',
      title: '近期删除操作频繁',
      hint: '审计留痕中出现密集删除，提示账目可能被人为调整。',
      run: function (ctx) {
        var limit = PayUtils.daysAgo(30);
        var dels = ctx.logs.filter(function (l) {
          return l.action === '删除' && l.at && l.at.slice(0, 10) >= limit;
        });
        if (dels.length < 3) return null;
        return {
          detail: '近 30 天操作留痕中有 ' + dels.length + ' 条删除记录。',
          evidence: dels.slice(0, PayAudit.EVIDENCE_MAX).map(function (l) {
            return l.at.slice(0, 16).replace('T', ' ') + ' · ' + (l.who || '—') + ' · ' + (l.detail || '');
          }),
          evidenceMore: dels.length,
          suggestion: '逐条核对删除原因；对账自动流水不应手工删除，纠错请用冲销支出并注明。'
        };
      }
    },

    {
      id: 'channel-missing', level: 'low',
      title: '已收款订单缺少渠道/单号信息',
      hint: '影响与支付宝账单逐笔核对。',
      run: function (ctx) {
        var bad = ctx.orders.filter(function (o) {
          return (o.status === '已支付' || o.status === '已核销') && (!o.channel || !o.outTradeNo);
        });
        if (!bad.length) return null;
        return {
          detail: bad.length + ' 笔已收款订单未登记支付渠道或缴费单号（多为线下补登记）。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (o) {
            return o.feeName + ' · ' + o.name + ' · ' + PayUtils.fenYuan(o.amountFen) + ' 元';
          }),
          evidenceMore: bad.length,
          suggestion: '线下收款补登记时至少注明「线下收款 · 经办人」，并保留转账截图对账。'
        };
      }
    },

    {
      id: 'weekend-expense', level: 'low',
      title: '周末/休息日入账的支出',
      hint: '非工作日集中报销属常见但值得留意的情形，仅提示不定性。',
      run: function (ctx) {
        var bad = ctx.ledger.filter(function (l) {
          if (l.type !== '支出' || !l.date) return false;
          var d = new Date(l.date + 'T00:00:00');
          var w = d.getDay();
          return w === 0 || w === 6;
        });
        if (!bad.length) return null;
        return {
          detail: bad.length + ' 笔支出入账于周六/周日。',
          evidence: bad.slice(0, PayAudit.EVIDENCE_MAX).map(function (l) {
            return l.date + ' ' + PayUtils.fenYuan(l.amountFen) + ' 元 · ' + l.desc;
          }),
          evidenceMore: bad.length,
          suggestion: '核对是否为活动当日实际垫支；入账日期应与业务发生日期一致。'
        };
      }
    }
  ],

  /* ---------------- 执行审计 ---------------- */

  _feeStat: function (ctx, feeId) {
    var st = { unpaid: 0 };
    ctx.orders.forEach(function (o) {
      if (o.feeId === feeId && (o.status === '待支付' || o.status === '支付中')) st.unpaid++;
    });
    return st;
  },

  /**
   * 运行全部规则（只读）
   * @returns {at, summary:{high,medium,low,total,risk}, findings:[...]}
   */
  run: function () {
    var ctx = {
      fees: PayStore.list('fees'),
      orders: PayStore.list('orders'),
      ledger: PayStore.list('ledger'),
      logs: PayStore.list('logs'),
      feeById: {}
    };
    ctx.fees.forEach(function (f) { ctx.feeById[f.id] = f; });

    var findings = [];
    var summary = { high: 0, medium: 0, low: 0, total: this.RULES.length, risk: '正常' };
    for (var i = 0; i < this.RULES.length; i++) {
      var rule = this.RULES[i];
      var f = null;
      try { f = rule.run(ctx); } catch (e) { f = null; /* 单条规则异常不阻断整体审计 */ }
      if (!f) continue;
      f.id = rule.id; f.level = rule.level; f.title = rule.title; f.hint = rule.hint;
      findings.push(f);
      summary[rule.level]++;
    }
    if (summary.high > 0) summary.risk = '高风险';
    else if (summary.medium > 0) summary.risk = '中风险';
    else if (summary.low > 0) summary.risk = '关注';
    var result = { at: PayUtils.fmtDateTime(new Date()), summary: summary, findings: findings };
    PayStore.setPref('audit', result);     // 只落本机偏好，不碰业务数据
    PayStore._log('系统', '智能审计', '规则 ' + summary.total + ' 条 · 发现 高' + summary.high + '/中' + summary.medium + '/低' + summary.low);
    return result;
  },

  lastResult: function () { return PayStore.getPref('audit', null); },

  /* ---------------- 操作留痕统计（谁在什么时候做了什么） ---------------- */

  activityStats: function () {
    var limit = PayUtils.daysAgo(30);
    var map = {};
    var actions = {};
    PayStore.list('logs').forEach(function (l) {
      if (!l.at || l.at.slice(0, 10) < limit) return;
      var k = (l.who || '—') + '｜' + l.action;
      map[k] = (map[k] || 0) + 1;
      actions[l.action] = (actions[l.action] || 0) + 1;
    });
    var rows = Object.keys(map).map(function (k) {
      var p = k.split('｜');
      return { who: p[0], action: p[1], count: map[k] };
    }).sort(function (a, b) { return b.count - a.count; });
    return { rows: rows, actions: actions };
  },

  /* ---------------- AI 审计报告（离线模板兜底） ---------------- */

  async report(result) {
    var t0 = Date.now();
    var s = result.summary;
    var ctxText = this._findingsText(result);
    var prompt = '你是高校班级收费事项的内部审计助手。请依据下面的审计发现，输出一份 300 字以内的正式审计意见，' +
      '结构为：总体结论 → 主要发现（逐条一句）→ 审计建议（两条以内）。语气客观克制，不要罗列全部数据：\n' + ctxText;
    if (PayAI.isReady()) {
      try {
        var text = await PayAI.chat(prompt, '你是严谨的内部审计助手，只依据给定事实，不虚构问题。输出纯文本。');
        return { ok: true, offline: false, text: text, ms: Date.now() - t0 };
      } catch (e) { /* 落离线模板 */ }
    }
    return { ok: true, offline: true, text: this._reportTemplate(result), ms: Date.now() - t0 };
  },

  _findingsText: function (result) {
    var s = result.summary;
    var lines = ['核验规则 ' + s.total + ' 条；发现：高 ' + s.high + '、中 ' + s.medium + '、低 ' + s.low + '；总体评级：' + s.risk + '。'];
    result.findings.forEach(function (f, i) {
      var lv = { high: '高', medium: '中', low: '低' }[f.level];
      lines.push((i + 1) + '.（' + lv + '）' + f.title + '：' + f.detail);
    });
    if (!result.findings.length) lines.push('未发现异常事项。');
    return lines.join('\n');
  },

  _reportTemplate: function (result) {
    var s = result.summary;
    var head = '审计意见（规则引擎自动生成）\n' +
      '────────────────────────\n' +
      '一、总体结论\n  本次共核验 ' + s.total + ' 条规则，发现高风险 ' + s.high + ' 项、中风险 ' + s.medium +
      ' 项、提示 ' + s.low + ' 项，总体评级：' + s.risk + '。\n\n二、主要发现\n';
    var body = result.findings.length
      ? result.findings.map(function (f, i) {
        var lv = { high: '高', medium: '中', low: '低' }[f.level];
        return '  ' + ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'][i] + '、（' + lv + '）' + f.title + '\n      ' + f.detail;
      }).join('\n')
      : '  未发现异常事项：账实相符、对账闭环、无凭证缺失与重复入账迹象。';
    var sugg = result.findings.length
      ? '\n\n三、审计建议\n  1. 按上列发现逐项核实并在账本/缴费单中补充说明或更正留痕。\n  2. 下次公示前复核一次，重点复核高风险项对应费项。'
      : '\n\n三、审计建议\n  保持现有「收支留痕 + 对账核销 + 月度公示」节奏即可。';
    return head + body + sugg + '\n\n（本报告只读生成，不改动任何数据；审计基准时间 ' + result.at + '）';
  }
};
