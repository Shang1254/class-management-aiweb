/* =====================================================
 * 班级缴费中心 · AI 助手层（pay-ai.js）
 * -----------------------------------------------------
 * 可选能力：催缴提醒文案 / 月度公示导语。
 * 设计对标宿主 ai.js 的「零配置 + 离线兜底」：
 *   · 自动探测本机 Ollama（11434），仅在用户从未配置过时自动填入；
 *   · 未配置 / 断网 / 超时 → 自动落离线公文模板，并明确标注「离线模板」；
 *   · 配置存本机偏好（pay_pref_config.ai），不写进代码。
 * ===================================================== */

var PayAI = window.PayAI = {

  LOCAL_CANDIDATES: ['http://localhost:11434/v1', 'http://127.0.0.1:11434/v1'],
  LOCAL_PREFERRED: ['qwen2.5:3b', 'qwen2.5:7b', 'qwen2.5:1.5b'],

  cfg: function () {
    var c = PayStore.getPref('config', {}) || {};
    return c.ai || { enabled: false, base: '', model: '' };
  },

  saveCfg: function (ai) {
    var c = PayStore.getPref('config', {}) || {};
    c.ai = ai;
    PayStore.setPref('config', c);
  },

  /** 只读探测本机 Ollama（1.8s 超时，不打日志不改配置） */
  async detect() {
    for (var i = 0; i < this.LOCAL_CANDIDATES.length; i++) {
      var root = this.LOCAL_CANDIDATES[i];
      try {
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, 1800);
        var r = await fetch(root.replace(/\/v1$/, '') + '/api/tags', { signal: ctl.signal });
        clearTimeout(t);
        var d = await r.json();
        var names = (d.models || []).map(function (m) { return m.name; });
        if (!names.length) continue;
        var pick = '';
        for (var j = 0; j < this.LOCAL_PREFERRED.length; j++) {
          if (names.indexOf(this.LOCAL_PREFERRED[j]) !== -1) { pick = this.LOCAL_PREFERRED[j]; break; }
        }
        if (!pick) pick = names[0];
        return { ok: true, base: root, model: pick, models: names };
      } catch (e) { clearTimeout(t); /* 尝试下一个候选 */ }
    }
    return { ok: false };
  },

  /** 零配置接入：仅当从未配置过 AI 时自动填入本机模型 */
  async ensure(force) {
    var c = this.cfg();
    if (!force && (c.base || c.model)) return { applied: false };
    var found = await this.detect();
    if (!found.ok) return { applied: false };
    this.saveCfg({ enabled: c.enabled !== false, base: found.base, model: found.model });
    return { applied: true, model: found.model };
  },

  isReady: function () {
    var c = this.cfg();
    return !!(c.enabled && c.base && c.model);
  },

  /** OpenAI 兼容 chat（Ollama /v1）；失败抛错由调用方落离线模板 */
  async chat(prompt, system) {
    var c = this.cfg();
    if (!this.isReady()) throw new Error('AI 未配置');
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, 60000);
    try {
      var r = await fetch(c.base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: c.model, temperature: 0.6, max_tokens: 500, stream: false,
          messages: [
            { role: 'system', content: system || '你是高校班级的学生干部助手，文风正式、简明、有礼，输出纯文本。' },
            { role: 'user', content: prompt }
          ]
        }),
        signal: ctl.signal
      });
      clearTimeout(t);
      var d = await r.json();
      var text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (!text) throw new Error('AI 返回为空');
      return text.trim();
    } catch (e) { clearTimeout(t); throw e; }
  },

  /* ---------------- 催缴提醒 ---------------- */

  /**
   * @returns {ok, offline, text, ms}
   */
  async draftUrge(fee, unpaidNames, managerName) {
    var t0 = Date.now();
    var title = fee.name + '：' + PayUtils.fenYuan(fee.amountFen) + ' 元/人，截止 ' + fee.deadline;
    var prompt = '请为下面这笔班级费用写一条催缴提醒（120 字以内，面向未缴费同学，' +
      '礼貌但明确，包含费用名、金额、截止日期、两种缴费路径（系统内支付宝缴费 / 联系经办人），结尾感谢）：\n' +
      '费用：' + title + '\n尚未缴费 ' + unpaidNames.length + ' 人：' + unpaidNames.slice(0, 8).join('、') +
      (unpaidNames.length > 8 ? ' 等' : '') + '\n经办人：' + (managerName || '生活委员');
    if (this.isReady()) {
      try {
        var text = await this.chat(prompt);
        return { ok: true, offline: false, text: text, ms: Date.now() - t0 };
      } catch (e) { /* 落离线模板 */ }
    }
    return { ok: true, offline: true, text: this._urgeTemplate(fee, unpaidNames, managerName), ms: Date.now() - t0 };
  },

  _urgeTemplate: function (fee, unpaidNames, managerName) {
    return '【缴费提醒】' + fee.name + '\n' +
      '标准：' + PayUtils.fenYuan(fee.amountFen) + ' 元/人 · 截止：' + fee.deadline + '\n' +
      '目前还有 ' + unpaidNames.length + ' 位同学未完成缴费（' + unpaidNames.slice(0, 6).join('、') +
      (unpaidNames.length > 6 ? ' 等' : '') + '）。\n' +
      '请尽快在「缴费中心 → 我的缴费」用支付宝完成，或直接联系经办人 ' + (managerName || '生活委员') + ' 现场办理。\n' +
      '截止后不再补收，感谢大家配合！';
  },

  /* ---------------- 公示导语 ---------------- */

  async draftNotice(monthText, className, incomeFen, expenseFen, balanceFen) {
    var t0 = Date.now();
    var prompt = '请为班级月度收支公示写一段导语（80 字以内，正式公文风，强调账目公开透明、接受监督）：\n' +
      className + ' ' + monthText + '：收入 ' + PayUtils.fenYuan(incomeFen) + ' 元，支出 ' +
      PayUtils.fenYuan(expenseFen) + ' 元，结余 ' + PayUtils.fenYuan(balanceFen) + ' 元。';
    if (this.isReady()) {
      try {
        var text = await this.chat(prompt);
        return { ok: true, offline: false, text: text, ms: Date.now() - t0 };
      } catch (e) { /* 落离线模板 */ }
    }
    return { ok: true, offline: true, text: this._noticeTemplate(className, incomeFen, expenseFen, balanceFen), ms: Date.now() - t0 };
  },

  _noticeTemplate: function (className, incomeFen, expenseFen, balanceFen) {
    return '为规范班费、团费管理，现将' + className + '本月收支情况公示如下，接受全体同学监督。' +
      '本月收入 ' + PayUtils.fenYuan(incomeFen) + ' 元，支出 ' + PayUtils.fenYuan(expenseFen) + ' 元，' +
      '结余 ' + PayUtils.fenYuan(balanceFen) + ' 元。如对账目有疑问，请向经办人或辅导员反映。';
  }
};
