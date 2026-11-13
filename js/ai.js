/* =====================================================
 * AI 服务层（纯前端直连大模型，无需后端）
 * -----------------------------------------------------
 * 设计要点：
 * 1. 全部采用 OpenAI 兼容协议（/chat/completions），一套客户端支持多家：
 *    智谱 GLM / DeepSeek / 通义千问 / Kimi / 硅基流动 / 火山方舟 / 本地 Ollama / 自定义
 *    （2026-10 实测：上述厂商 API 均返回 CORS 头，浏览器可直连）
 * 2. 浏览器直连意味着 Key 存在本机 localStorage —— 适合「学校自己填自己的 Key」的部署形态；
 *    若要公开网站部署，须改为后端代理（见 后端演进/）。
 * 3. 隐私保护：发送前自动脱敏（学生姓名 → 学生A、手机号 → 138****0000），
 *    学情分析只发送统计数字与原因标签，不发送学生姓名。
 * 4. 离线/未配置兜底：通知起草与学情简报内置规则模板，问答内置资料检索，
 *    未配置模型或断网时仍可用（明确标注「离线模板」/「资料检索」）。
 * 5. AI 只产出草稿：任何写入系统的动作都由用户在界面上确认后执行。
 * ===================================================== */

var AI = {
  /** 厂商预设（base 为 OpenAI 兼容根地址，不含 /chat/completions） */
  PROVIDERS: [
    { id: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', hint: '有免费小模型，适合演示' },
    { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-chat', hint: '中文好、价格低' },
    { id: 'dashscope', name: '通义千问（阿里云）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', hint: '有免费额度' },
    { id: 'kimi', name: 'Kimi（月之暗面）', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '长文本能力强' },
    { id: 'siliconflow', name: '硅基流动', base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', hint: '聚合开源模型，部分免费' },
    { id: 'volc', name: '火山方舟（豆包）', base: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k', hint: '字节系，额度大' },
    { id: 'ollama', name: '本地 Ollama（数据不出校内）', base: 'http://localhost:11434/v1', model: 'qwen2.5:7b',
      hint: '需本机安装 Ollama，无需 Key；本机模型首次加载与生成较慢，超时已放宽到 5 分钟',
      noKey: true, local: true, timeout: 300000,
      models: ['qwen2.5:7b', 'qwen2.5:3b', 'qwen2.5:1.5b', 'deepseek-r1:7b', 'llama3.1:8b'] },
    { id: 'campus', name: '校园统一 AI 网关（学校提供）', base: '', model: '',
      hint: '由学校网络信息中心统一提供「OpenAI 兼容」地址与调用凭证；数据在校内闭环，便于并入校园 AI 助手生态' },
    { id: 'custom', name: '自定义（OpenAI 兼容）', base: '', model: '', hint: '任何兼容 /chat/completions 的服务' }
  ],

  DEFAULT_TIMEOUT: 60000,          // 云端模型默认超时
  LOCAL_TIMEOUT: 300000,           // 本机模型（Ollama 等）默认超时：首次加载 + 慢速生成

  /** ---------------- 配置读写（存本机偏好，经 Store 统一出入口） ---------------- */
  config() {
    try {
      var raw = Store.getPref('aiConfig', '');
      var cfg = raw ? JSON.parse(raw) : {};
      return {
        provider: cfg.provider || '',
        base: cfg.base || '',
        model: cfg.model || '',
        key: cfg.key || '',
        updatedAt: cfg.updatedAt || ''
      };
    } catch (e) {
      return { provider: '', base: '', model: '', key: '', updatedAt: '' };
    }
  },
  /** 模型名规范化：常有人把整条终端命令粘进「模型名称」栏（如 "ollama pull qwen2.5:3b"），
   *  而各家模型名都不含空格 —— 因此剥掉命令前缀与引号后取第一个词即可。
   *  例：'ollama pull qwen2.5:3b' → 'qwen2.5:3b'；'"glm-4-flash"' → 'glm-4-flash' */
  normalizeModel(text) {
    var t = String(text == null ? '' : text).trim().replace(/^["'`\s]+|[\"'`\s]+$/g, '');
    t = t.replace(/^ollama\s+(pull|run|serve|show|rm|push|list|ps|cp)\s+/i, '').replace(/^ollama\s+/i, '');
    t = (t.split(/[\s;；,，]+/)[0] || '').replace(/[。；;,，]+$/, '');
    return t;
  },
  saveConfig(cfg) {
    // 保存出口统一规范化：模型名去命令/引号，接口地址去尾部斜杠（避免拼出 //chat/completions）
    if (cfg && typeof cfg.model === 'string') cfg.model = AI.normalizeModel(cfg.model);
    if (cfg && typeof cfg.base === 'string') cfg.base = cfg.base.trim().replace(/\/+$/, '');
    cfg.updatedAt = Utils.nowStr();
    Store.setPref('aiConfig', JSON.stringify(cfg));
  },
  clearConfig() { Store.setPref('aiConfig', ''); },
  providerMeta(id) {
    return AI.PROVIDERS.filter(function (p) { return p.id === id; })[0] || null;
  },
  /** 脱敏开关（默认开启） */
  maskOn() { return Store.getPref('aiMask', '1') === '1'; },
  setMask(on) { Store.setPref('aiMask', on ? '1' : '0'); },
  /** 调用次数（成本意识：每次成功调用 +1，可在设置中查看/清零） */
  calls() { return Number(Store.getPref('aiCalls', '0') || 0); },
  addCall() { Store.setPref('aiCalls', String(AI.calls() + 1)); },
  resetCalls() { Store.setPref('aiCalls', '0'); },

  /** 是否已具备调用条件（Key 必填；Ollama 等本地服务可免 Key） */
  isReady() {
    var c = AI.config();
    var meta = AI.providerMeta(c.provider);
    if (!c.base || !c.model) return false;
    if (meta && meta.noKey) return true;
    return !!c.key;
  },

  /** ---------------- 脱敏 ---------------- */
  /** 将文本中的学生姓名/手机号替换为化名（同一批替换保持一致） */
  mask(text) {
    var out = String(text || '');
    if (!AI.maskOn()) return out;
    // 手机号
    out = out.replace(/1[3-9]\d{9}/g, function (m) { return m.slice(0, 3) + '****' + m.slice(7); });
    // 身份证号
    out = out.replace(/\b\d{17}[\dXx]\b/g, '身份证号已隐去');
    // 学生姓名（按当前数据中的虚构姓名逐一替换，避免误伤故要求长度≥2 且全匹配）
    try {
      var names = Store.list('students').map(function (s) { return s.name; })
        .filter(function (n) { return n && n.length >= 2; });
      var seen = {}, idx = 0;
      var map = {};
      names.forEach(function (n) {
        if (map[n]) return;
        idx++;
        var letter = '';
        var k = idx;
        while (k > 0) { k--; letter = String.fromCharCode(65 + (k % 26)) + letter; k = Math.floor(k / 26); }
        map[n] = '学生' + letter;
      });
      Object.keys(map).forEach(function (n) {
        if (out.indexOf(n) === -1) return;
        out = out.split(n).join(map[n]);
      });
    } catch (e) { /* 数据未就绪时跳过姓名替换 */ }
    return out;
  },

  /** ---------------- 调用 ---------------- */
  /**
   * 调用大模型（非流式）
   * @param {Array} messages [{role, content}]
   * @param {Object} opts {temperature, maxTokens, timeout, onProgress}
   * @returns {Promise<{ok:boolean, content?:string, error?:string}>}
   */
  async chat(messages, opts) {
    opts = opts || {};
    var c = AI.config();
    var meta = AI.providerMeta(c.provider);
    if (!c.base || !c.model) return { ok: false, error: '尚未配置模型：请到「AI 设置」中选择厂商并填写 API Key' };
    if (!(meta && meta.noKey) && !c.key) return { ok: false, error: '尚未填写 API Key：请到「AI 设置」中填写' };

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    // 超时：显式传入 > 厂商预设（本机模型 5 分钟）> 默认 60 秒
    var timeoutMs = opts.timeout || (meta && (meta.timeout || (meta.local ? AI.LOCAL_TIMEOUT : 0))) || AI.DEFAULT_TIMEOUT;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs);
    var started = Date.now();
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (c.key) headers['Authorization'] = 'Bearer ' + c.key;
      var resp = await fetch(c.base.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: c.model,
          messages: messages,
          temperature: opts.temperature === undefined ? 0.6 : opts.temperature,
          max_tokens: opts.maxTokens || 1600,
          stream: false
        }),
        signal: controller ? controller.signal : undefined
      });
      clearTimeout(timer);
      var text = await resp.text();
      if (!resp.ok) {
        var msg = '';
        try { var j = JSON.parse(text); msg = (j.error && (j.error.message || j.error.code)) || j.message || ''; } catch (e) { msg = text.slice(0, 120); }
        var friendly = AI._errorText(resp.status, msg);
        return { ok: false, error: friendly, raw: msg };
      }
      var data = {};
      try { data = JSON.parse(text); } catch (e) { return { ok: false, error: '模型返回内容无法解析（可能不是 OpenAI 兼容接口）' }; }
      var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) return { ok: false, error: '模型未返回内容（请检查模型名称是否正确）' };
      AI.addCall();
      return { ok: true, content: String(content).trim(), ms: Date.now() - started };
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') return { ok: false, error: '请求超时（可换更快的小模型，或检查网络）' };
      return { ok: false, error: '无法连接模型服务：' + (err && err.message ? err.message : '网络错误') + '（若为本地部署请确认服务已启动、允许跨域）' };
    }
  },

  /** 清理模型输出里的 Markdown 标记（小模型常输出 ### /** / - 等），保留纯文本 */
  _clean(text) {
    var t = String(text == null ? '' : text);
    t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '');        // 去掉 Markdown 标题
    t = t.replace(/\*\*(.+?)\*\*/g, '$1');                  // 去掉粗体标记
    t = t.replace(/^[ \t]*[-*][ \t]+/gm, '· ');             // 列表短横线换成间隔点
    t = t.replace(/^[ \t]*```.*$/gm, '');                   // 去掉代码块围栏
    t = t.replace(/\n{3,}/g, '\n\n');                       // 压缩多余空行
    return t.trim();
  },

  _errorText(status, msg) {
    var m = {
      400: '请求被拒绝（模型名或参数不正确）',
      401: 'API Key 无效或已过期',
      402: '账户余额不足，请充值后重试',
      403: '无权访问该模型（可能未开通）',
      404: '接口地址或模型名不存在（请核对「接口地址」与「模型」）',
      429: '调用过于频繁或额度用尽，请稍后重试',
      500: '模型服务内部错误，请稍后重试',
      503: '模型服务暂不可用，请稍后重试'
    };
    var text = (m[status] ? m[status] : '调用失败（HTTP ' + status + '）') + (msg ? '：' + msg.slice(0, 100) : '');
    // 模型相关的报错最常见的原因是「模型名填成了终端命令」或「本机尚未安装该模型」——直接给出可执行的下一步
    if (/model is required|model name|not found|does not exist|no such model|model .* invalid/i.test(String(msg || ''))) {
      var cur = AI.config().model || '';
      text += '。请检查「模型名称」栏是否只填了模型名' + (cur ? '（当前：' + cur + '）' : '（如 qwen2.5:3b）') +
        '——ollama pull … 是终端里的拉取命令，不要填进这一栏；本机已安装的模型可点「读取本机已安装模型」直接选。';
    }
    return text;
  },

  /** 是否为"本机服务"（Ollama / 自定义 localhost），用于放宽超时与给出部署提示 */
  isLocal() {
    var c = AI.config();
    var meta = AI.providerMeta(c.provider);
    return !!(meta && meta.local) || /localhost|127\.0\.0\.1/i.test(c.base || '');
  },

  /**
   * 真实探测模型服务（不靠"猜"）：本机服务探测 /api/tags，云端做最小对话
   * @returns {Promise<{ok:boolean, kind:'local'|'cloud', models?:Array, error?:string, protocol:string}>}
   */
  /** 本机模型服务候选地址（可加自定义：设置里填过的地址优先） */
  LOCAL_CANDIDATES: ['http://localhost:11434/v1', 'http://127.0.0.1:11434/v1'],
  /** 自动接入时优先选的模型（同尺寸里这两个在中文短文本任务上最稳；都没有就取第一个已安装的） */
  LOCAL_PREFERRED: ['qwen2.5:3b', 'qwen2.5:7b', 'qwen2.5:1.5b'],

  /**
   * 探测本机是否已有可用的模型服务（只读 /api/tags，不打日志、不改配置）
   * @returns {Promise<{ok:boolean, base:string, model:string, models:Array}>}
   */
  async autoDetect() {
    var cands = AI.LOCAL_CANDIDATES.slice();
    var saved = AI.config();
    if (saved.base && AI.isLocal() && cands.indexOf(saved.base) === -1) cands.unshift(saved.base);
    for (var i = 0; i < cands.length; i++) {
      var base = cands[i];
      var root = base.replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 1800);
      try {
        var resp = await fetch(root + '/api/tags', { signal: controller ? controller.signal : undefined });
        clearTimeout(timer);
        if (!resp.ok) continue;
        var data = await resp.json();
        var names = (data.models || []).map(function (m) { return m.name || m.model; }).filter(Boolean);
        if (!names.length) continue;
        var pick = '';
        for (var k = 0; k < AI.LOCAL_PREFERRED.length; k++) {
          if (names.indexOf(AI.LOCAL_PREFERRED[k]) !== -1) { pick = AI.LOCAL_PREFERRED[k]; break; }
        }
        return { ok: true, base: base, model: pick || names[0], models: names };
      } catch (e) {
        clearTimeout(timer);
      }
    }
    return { ok: false, base: '', model: '', models: [] };
  },

  /**
   * 零配置接入：只有在「用户还没配置过任何模型服务」时才自动填好本机 Ollama。
   * 已配置云端 Key / 已选过模型 → 一律不覆盖（避免把老师的 Key 换成本地模型）。
   * @param {boolean} force 为 true 时忽略上述判断（设置页的「自动接入本机服务」按钮用）
   * @returns {Promise<{applied:boolean, model?:string, base?:string}>}
   */
  async ensureConfig(force) {
    var cfg = AI.config();
    if (!force && (cfg.base || cfg.key)) return { applied: false };
    var found = await AI.autoDetect();
    if (!found.ok) return { applied: false };
    AI.saveConfig({ provider: 'ollama', base: found.base, model: found.model, key: '' });
    Store.setPref('aiAuto', '1');        // 标记来源：界面据此显示「自动接入」
    return { applied: true, model: found.model, base: found.base };
  },
  /** 当前配置是否由自动接入得来 */
  isAuto() { return Store.getPref('aiAuto', '') === '1'; },

  async probe() {
    var c = AI.config();
    var protocol = (typeof location !== 'undefined' && location.protocol) ? location.protocol : '';
    if (!c.base) return { ok: false, kind: 'local', error: '尚未填写接口地址', protocol: protocol };
    var meta = AI.providerMeta(c.provider);
    if (!AI.isReady() && !(meta && meta.noKey)) {
      return { ok: false, kind: 'cloud', error: '尚未填写 API Key', protocol: protocol };
    }
    if (AI.isLocal()) {
      var r = await AI.listLocalModels();
      return { ok: !!r.ok, kind: 'local', models: r.models || [], error: r.error || '', protocol: protocol };
    }
    var t = await AI.test();
    return { ok: !!t.ok, kind: 'cloud', error: t.ok ? '' : t.error, protocol: protocol };
  },

  /**
   * 本机服务指引：按"探测结果 + 打开方式"给出分步操作（不再仅凭协议报警）
   * @returns {null|{level:'ok'|'bad', title:string, steps:string[]}}
   */
  localGuide(probeResult) {
    if (!AI.isLocal()) return null;
    var proto = (probeResult && probeResult.protocol) || (typeof location !== 'undefined' ? location.protocol : '');
    var byFile = proto === 'file:';
    if (probeResult && probeResult.ok) {
      var n = (probeResult.models || []).length;
      return {
        level: 'ok',
        title: '本机模型服务已连通' + (n ? '，检测到 ' + n + ' 个模型' : ''),
        steps: [
          '数据只在本机流转：不出校、无调用费、断网可用。',
          '首次生成需加载模型（通常 10—60 秒），之后同一模型会保留一段时间；演示前建议先预热一次。',
          byFile ? '你是“双击打开”方式，跨域已放行（OLLAMA_ORIGINS 已生效）。' : ''
        ].filter(Boolean)
      };
    }
    var brief = (probeResult && probeResult.error) ? String(probeResult.error) : '';
    // 精简错误原因：只保留关键短语，避免徽章里出现两层括号的长句
    if (brief.length > 40) brief = brief.split('。')[0].slice(0, 40) + '…';
    return {
      level: 'bad',
      title: '未连接到本机模型服务' + (brief ? '：' + brief : ''),
      steps: [
        '① 启动服务：开始菜单打开「Ollama」（右下角出现托盘图标），或双击《部署指南/启动Ollama服务.bat》。',
        '② 核对地址：http://localhost:11434/v1 —— 带 /v1，末尾不要加 /chat/completions。',
        '③ 确认模型：命令行执行 ollama list；若为空，执行 ollama pull qwen2.5:3b（约 1.9GB）。',
        byFile
          ? '④ 跨域（你正在用“双击打开”方式，必做）：Windows 用户环境变量新增 OLLAMA_ORIGINS = *，重启 Ollama；用 .bat 启动则已内置该项。'
          : '④ 跨域：若命令行可访问而这里失败，多为跨域限制 —— Windows 用户环境变量新增 OLLAMA_ORIGINS = *，重启 Ollama。'
      ]
    };
  },

  /** 本机服务启动命令（供一键复制）：含模型目录、跨域与常驻时长 */
  localStartCommand() {
    return [
      'set OLLAMA_MODELS=E:\\OllamaModels',
      'set OLLAMA_ORIGINS=*',
      'set OLLAMA_KEEP_ALIVE=30m',
      '"%LOCALAPPDATA%\\Programs\\Ollama\\ollama.exe" serve'
    ].join('\r\n');
  },

  /** 读取本机已安装的模型列表（Ollama：GET /api/tags） */
  async listLocalModels() {
    var c = AI.config();
    if (!c.base) return { ok: false, error: '请先填写接口地址（如 http://localhost:11434/v1）' };
    var root = c.base.replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
    try {
      var resp = await fetch(root + '/api/tags', { signal: controller ? controller.signal : undefined });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, error: '服务返回 HTTP ' + resp.status + '（该地址可能不是 Ollama 服务）' };
      var data = await resp.json();
      var list = (data.models || []).map(function (m) {
        return { name: m.name || m.model, size: m.size ? Math.round(m.size / 1024 / 1024 / 1024 * 10) / 10 + ' GB' : '' };
      });
      if (!list.length) return { ok: false, error: '服务已连接，但尚未安装任何模型：请在命令行执行 ollama pull qwen2.5:7b' };
      return { ok: true, models: list };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: '无法连接本机模型服务（' + (err && err.message ? err.message : '网络错误') + '）。'
        + '请确认 Ollama 已安装并正在运行；若你是以 file:// 双击方式打开本系统，还需设置 OLLAMA_ORIGINS' };
    }
  },

  /** 连通性测试：最小调用 */
  async test() {
    return AI.chat([{ role: 'user', content: '请只回复两个字：正常' }], { maxTokens: 16, timeout: 20000, temperature: 0 });
  },

  /* =====================================================
   * 知识库与检索（问答用，纯本地；离线也能给结果）
   * ===================================================== */
  POLICY_KB: [
    { t: '国家奖学金', c: '标准 10000 元/人·学年；面向全日制本专科二年级及以上特别优秀学生，专升本学生自进入本科阶段第 2 年起具备申请资格；每年 9—10 月申报（2026 年为 9 月 23 日—10 月 8 日），学院初评公示后学校组织竞评大会并公示不少于 5 个工作日。需提交申请审批表、加盖教务章成绩单、综合素质测评汇总表、获奖证书复印件与个人事迹报告。' },
    { t: '国家励志奖学金', c: '标准 6000 元/人·学年；面向品学兼优的家庭经济困难学生，申请前须完成当学年家庭经济困难学生认定；同一学年内与国家奖学金不可兼得。' },
    { t: '国家助学金', c: '面向家庭经济困难学生，按认定档次（特别困难/困难/一般困难）分档发放；须先完成家庭经济困难认定，经班级民主评议、学院审核、学校审批后发放至本人银行卡。' },
    { t: '晴川奖学金与晴川助学金（校级）', c: '晴川奖学金甲/乙/丙等分别为 3000/2000/1000 元；晴川助学金甲/乙等分别为 1500/1000 元；申请助学金须先完成困难认定，申请奖学金以综合素质测评成绩为主要依据。' },
    { t: '家庭经济困难学生认定', c: '每年秋季学期认定一次（2026 年为 9 月 7 日—9 月 20 日个人申请与班级评议，9 月 21—24 日学院认定，9 月 28—30 日学校认定，10 月 1—7 日公示建档）。档次分为特别困难、困难、一般困难。一至七类学生填《湖北省家庭经济困难学生确认表》，其他学生填《湖北省家庭经济困难学生认定申请表》，《量化评分表》粘贴在申请表之后。认定结果是本学年各项资助工作的基础和主要依据。咨询：学工处大学生资助中心 027-87934608 王老师，综合楼一 108。' },
    { t: '课程重修', c: '期末考核不及格且补考仍不及格的课程须重修；重修一般在每学期开学初受理报名，具体时间、缴费与组班方式以教务处当学期通知为准；需填写《课程重修申请表》，经任课教师、开课学院、教务处审核；重修成绩按学籍管理规定记载注明“重修”字样。' },
    { t: '缓考', c: '考试前因病、因事无法参加考试可申请缓考，须在考试前提出并附证明材料（因病一般需二级甲等及以上医院证明）；经辅导员、学院、教务处审批；缓考考试随下一学期开学补考一并安排。' },
    { t: '请假', c: '系统内「我的考勤」支持在线请假：提交申请 → 教师/辅导员审批 → 批准后按工作日自动计入考勤（跳过周末与法定节假日）。请假 3 天以上或离汉的，按学校学生管理规定另需学院审批备案；校外请假须家长知情同意。' },
    { t: '在读证明', c: '用于助学贷款、实习、报名等用途；下载模板填写后提交学院或教务处审核，加盖公章后生效；一般需提前 1—3 个工作日提交申请。' },
    { t: '学生证补办', c: '学生证遗失或损坏后填写《学生证补办申请表》，粘贴近期一寸免冠照片，辅导员核实签字、学院审核盖章后到学工处办理（综合楼一 108）。' },
    { t: '休学与复学', c: '填写《休（复）学审批表》并附相关证明材料，辅导员签署意见、学院审核，由教务处审批并办理学籍异动。' },
    { t: '生源地信用助学贷款', c: '面向家庭经济困难的全日制学生，在生源地县（市、区）学生资助管理中心（国家开发银行）办理；共同借款人原则上为父母；申贷要求学生学籍为“在读”状态。' },
    { t: '勤工助学', c: '学有余力的在校学生可申请校内勤工助学岗位，扶困优先；需填写《勤工助学用工申请表》；岗位与薪酬按学校勤工助学管理办法执行。' },
    { t: '成绩与绩点', c: '系统按学年学期统计成绩，平均学分绩点（GPA）按课程学分加权计算；不及格课程在「我的成绩」中给出补考提示；教师端支持总评成绩合成（平时 60% + 期末 40%，权重可调）。' },
    { t: '考勤与签到', c: '考勤状态分为出勤、迟到、请假、缺勤；教师可发起限时签到码，学生在「我的考勤」输入 6 位签到码自助签到并自动记为出勤；出勤率低于 85% 或缺勤 3 次及以上会被列为重点关注。' },
    { t: '健康日报', c: '学生每日在「健康填报」中填报体温与健康状况（每天一条、可修改），打卡自动记录位置（省市区街道）；辅导员端可查看填报率、体温异常名单、未填报名单与校外动向。' },
    { t: '通知频道', c: '通知分两类：辅导员通知（学生工作事务：运动会、晚自习、放假、奖助学金等，由辅导员发布）与教师通知（教学事务：作业、答疑、考试复习等，由任课教师发布）；重要通知可同步推送到手机。' },
    { t: '作业与随堂测验', c: '作业支持在线提交与批改，超过截止时间标记迟交；随堂测验支持单选、多选、判断题，限时作答，客观题自动阅卷，成绩自动计入成绩管理与学期统计。' }
  ],

  /** 组装检索语料：政策知识 + 可见通知 + 资料下载清单 */
  _corpus(user) {
    var docs = [];
    AI.POLICY_KB.forEach(function (d) {
      docs.push({ src: '办理/政策：' + d.t, text: d.t + '。' + d.c });
    });
    try {
      // 通知（按可见范围）
      var scope = Auth.scopeClassIds(user);
      Store.list('notices').filter(function (n) {
        return !n.classId || scope.indexOf(n.classId) !== -1;
      }).forEach(function (n) {
        docs.push({ src: '通知：' + n.title, text: n.title + '。' + String(n.content || '').replace(/\s+/g, ' '), href: '#/my-notices' });
      });
    } catch (e) { /* 忽略 */ }
    [
      ['国家奖学金申请审批表', '国家奖学金申请人', '填写本表并附成绩单、获奖证书与个人事迹报告，交学院初评'],
      ['国家励志奖学金申请审批表', '家庭经济困难且品学兼优学生', '须先完成困难认定，填写本表并附成绩单与获奖证明'],
      ['国家助学金申请审批表', '家庭经济困难学生', '按认定档次申请，经班级民主评议与学院审核'],
      ['家庭经济困难学生认定申请表', '需申请资助的学生', '秋季学期开学初填写，附家庭情况证明与量化评分表'],
      ['晴川奖助学金申请审批表', '全体学生（助学金须先认定）', '校级奖学金甲/乙/丙等、助学金甲/乙等'],
      ['课程重修申请表', '有不及格课程的学生', '开学初填写，任课教师、开课学院、教务处审核'],
      ['缓考申请表', '考试前因病/因事无法参加考试的学生', '考前提出并附证明，辅导员、学院、教务处审批'],
      ['在读证明（模板）', '全体学生', '用于贷款、实习、报名，须加盖公章'],
      ['学生请假条（纸质模板）', '全体学生', '线下留档用，线上请假请用「我的考勤」'],
      ['学生证补办申请表', '学生证遗失或损坏的学生', '辅导员签字、学院盖章后到学工处办理'],
      ['休（复）学审批表', '需办理休学或复学的学生', '附证明材料，学院审核后教务处审批'],
      ['学生素质综合测评表', '全体学生', '综合素质测评，奖助学金与评优评先的重要依据']
    ].forEach(function (r) {
      docs.push({ src: '资料：' + r[0], text: r[0] + '（适用：' + r[1] + '）。' + r[2] + '。可在「资料下载」中下载表格并查看办理说明。', href: '#/downloads' });
    });
    return docs;
  },

  /** 关键词检索（中文按二元切分计分，免依赖） */
  search(query, user, topK) {
    var docs = AI._corpus(user);
    var q = String(query || '').replace(/[\s，。？?！!、；;：:（）()【】\[\]]/g, '');
    var grams = [];
    for (var i = 0; i < q.length - 1; i++) grams.push(q.slice(i, i + 2));
    if (q.length === 1) grams.push(q);
    var scored = docs.map(function (d) {
      var hay = (d.src + ' ' + d.text).replace(/\s/g, '');
      var score = 0;
      grams.forEach(function (g) { if (hay.indexOf(g) !== -1) score += 2; });
      // 标题命中加权
      grams.forEach(function (g) { if (d.src.indexOf(g) !== -1) score += 3; });
      return { doc: d, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, topK || 4).map(function (x) { return x.doc; });
  },

  /* =====================================================
   * 业务封装：通知起草 / 学情简报 / 出题 / 问答
   * 每个封装都返回 {ok, content, offline, sources?, ms?}
   * ===================================================== */

  /** 通知起草（离线走模板） */
  async draftNotice(input) {
    var prompt =
      '你是高校学生工作/教学管理文书助手。请根据以下要点，起草一条学校内部通知。\n' +
      '【通知频道】' + input.channel + '\n' +
      '【发布主体】' + (input.channel === '辅导员通知' ? '辅导员（学生工作线）' : '任课教师（教学线）') + '\n' +
      '【面向对象】' + input.audience + '\n' +
      '【要点】' + input.brief + '\n' +
      '【风格要求】' + (input.style || '简洁规范、条理清楚') + '\n' +
      '输出格式（严格遵守，不要多余说明）：\n' +
      '第一行：通知标题（不超过 30 字，不加引号）\n' +
      '第二行起：通知正文。正文以“各位同学：”开头，分点写清时间、地点、要求、注意事项；'
      + '结尾为“请相互转告，按时参加（完成）。”与落款占位“〇〇〇（发布人）”。'
      + '如要点中缺少时间/地点等要素，用“○○（请补充）”占位，不要编造具体数字。';
    var res = await AI.chat([
      { role: 'system', content: '你是严谨的高校行政文书助手，只输出通知本身，不解释。' },
      { role: 'user', content: AI.mask(prompt) }
    ], { temperature: 0.5, maxTokens: 900 });
    if (res.ok) return { ok: true, content: AI._clean(res.content), offline: false, ms: res.ms };
    return { ok: true, content: AI._noticeTemplate(input), offline: true, reason: res.error };
  },

  _noticeTemplate(input) {
    var brief = String(input.brief || '').trim();
    var title = '关于' + (brief.length > 18 ? brief.slice(0, 18) + '…' : brief) + '的通知';
    return title + '\n' +
      '各位同学：\n' +
      '    现将有关事项通知如下：\n' +
      '    一、事项内容：' + (brief || '○○（请补充事项内容）') + '\n' +
      '    二、时间：○○（请补充）\n' +
      '    三、地点：○○（请补充）\n' +
      '    四、相关要求：请按要求准备并准时参加，注意出行安全；如有特殊情况，请提前向' +
      (input.channel === '辅导员通知' ? '辅导员' : '任课教师') + '说明。\n' +
      '    请相互转告，按时参加（完成）。\n\n' +
      '                                            〇〇〇（发布人）\n' +
      '                                            ○○年○○月○○日\n' +
      '\n（以上为离线模板草稿：未配置 AI 模型时由系统按规范格式生成，请补充占位内容后发布）';
  },

  /** 学情简报（离线走规则模板，数据均为系统真实统计） */
  async forgeReport(stats) {
    var dataText = JSON.stringify(stats, null, 1);
    var prompt =
      '你是高校班级管理助手。以下是系统统计出的演示数据（JSON），请据此撰写一份班级学情简报。\n' +
      '【硬性要求】只依据给定数据，不要编造任何数字或事件；不要出现学生虚构姓名（如需指代用“某同学”）；' +
      '分三部分：一、总体情况；二、主要问题；三、建议措施。全文 300—500 字，简体中文，可直接用于向学院汇报或家长沟通。\n' +
      '【数据】\n' + dataText;
    var res = await AI.chat([
      { role: 'system', content: '你是高校辅导员助手，擅长把统计数据写成简明、克制、可执行的学情简报。' },
      { role: 'user', content: AI.mask(prompt) }
    ], { temperature: 0.4, maxTokens: 1200 });
    if (res.ok) return { ok: true, content: AI._clean(res.content), offline: false, ms: res.ms };
    return { ok: true, content: AI._reportTemplate(stats), offline: true, reason: res.error };
  },

  _reportTemplate(s) {
    var L = [];
    L.push('【' + s.className + ' 学情简报】' + (s.term ? '（' + s.term + '）' : ''));
    L.push('');
    L.push('一、总体情况');
    L.push('    本班在册学生 ' + s.studentCount + ' 人，重点关注学生 ' + s.focusCount + ' 人；'
      + (s.avgScore === null ? '本学期暂无成绩数据' :
        '本学期平均分 ' + s.avgScore + ' 分，及格率 ' + s.passRate + '%，优秀率（≥90 分）' + s.excellentRate + '%')
      + '；近 30 天出勤率 ' + s.attendanceRate + '%，缺勤 ' + s.absentCount + ' 人次。');
    L.push('');
    L.push('二、主要问题');
    if (s.alerts && s.alerts.length) {
      L.push('    1. 学业预警 ' + s.alerts.length + ' 人：' + s.alerts.slice(0, 6).join('；') + '。');
    } else L.push('    1. 本学期暂无学业预警学生。');
    if (s.attendanceRate !== '暂无' && Number(s.attendanceRate) < 90) {
      L.push('    2. 出勤率偏低（' + s.attendanceRate + '%），存在迟到与缺勤情况。');
    } else L.push('    2. 出勤情况总体稳定。');
    if (s.focusCount) L.push('    3. 需重点关注学生 ' + s.focusCount + ' 人（出勤异常或学业预警）。');
    L.push('');
    L.push('三、建议措施');
    L.push('    1. 对重点关注学生逐一谈话，了解学习与生活困难，必要时联系家长共同跟进；');
    L.push('    2. 对不及格课程组织补考复习与学习互助小组，跟踪补考与重修情况；');
    L.push('    3. 加强课堂考勤与请假管理，对连续缺勤学生及时提醒并记录；');
    L.push('    4. 结合期末节点开展诚信考试与心理关怀教育。');
    L.push('');
    L.push('（以上为离线规则模板：数据均来自本系统统计，未配置 AI 模型时按规范体例生成）');
    return L.join('\n');
  },

  /** 出题助手：输出严格 JSON，解析为随堂测验题目数组 */
  async forgeQuiz(req) {
    var prompt =
      '你是高校课程命题助手。请为课程《' + req.subject + '》命制随堂测验题目。\n' +
      '【知识点/范围】' + req.topic + '\n' +
      '【题量】单选 ' + req.nSingle + ' 题、多选 ' + req.nMulti + ' 题、判断 ' + req.nJudge + ' 题\n' +
      '【每题分值】' + req.points + ' 分\n' +
      '【难度】' + (req.level || '中等，适合课堂即时测验') + '\n' +
      '【输出格式】只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块标记。数组元素结构：\n' +
      '{"type":"单选|多选|判断","stem":"题干","options":["A 选项内容","B 选项内容","C 选项内容","D 选项内容"],' +
      '"answer":"单选填一个字母如 A；多选填多个字母如 ABC；判断题填 对 或 错","points":' + req.points + '}\n' +
      '【硬性要求】判断题的 options 固定为 ["对","错"]；只有单选题的 options 为 4 项、多选为 4 项；'
      + '答案必须与选项一致且正确；题目要口语清晰、无歧义、不得抄袭教材原文题目。';
    var res = await AI.chat([
      { role: 'system', content: '你是命题专家，只输出符合要求的 JSON 数组。' },
      { role: 'user', content: prompt }
    ], { temperature: 0.7, maxTokens: 2400 });
    if (!res.ok) return { ok: false, error: res.error };
    var parsed = AI._parseQuizJSON(res.content);
    if (!parsed.ok) return { ok: false, error: parsed.error, raw: res.content };
    return { ok: true, questions: parsed.questions, ms: res.ms };
  },

  _parseQuizJSON(text) {
    var t = String(text || '').replace(/```json/gi, '```').replace(/```/g, '').trim();
    var start = t.indexOf('[');
    var end = t.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return { ok: false, error: '模型未返回 JSON 数组，请重试或换个模型' };
    var arr;
    try { arr = JSON.parse(t.slice(start, end + 1)); } catch (e) {
      return { ok: false, error: '题目 JSON 解析失败（' + e.message.slice(0, 60) + '），请重试' };
    }
    if (!Array.isArray(arr) || !arr.length) return { ok: false, error: '题目为空，请重试' };
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var q = arr[i] || {};
      var type = ['单选', '多选', '判断'].indexOf(String(q.type || '').trim()) !== -1 ? String(q.type).trim() : '单选';
      var stem = String(q.stem || '').trim();
      var options = Array.isArray(q.options) ? q.options.map(function (o) { return String(o || '').trim(); }) : [];
      var answer = String(q.answer || '').trim().toUpperCase();
      if (!stem) return { ok: false, error: '第 ' + (i + 1) + ' 题缺少题干，请重试' };
      if (type === '判断') {
        options = ['对', '错'];
        answer = /对|正确|T|TRUE|是/.test(String(q.answer || '')) ? '对' : '错';
      } else {
        options = options.filter(function (o) { return o; });
        if (options.length < 2) return { ok: false, error: '第 ' + (i + 1) + ' 题选项不足，请重试' };
        options = options.slice(0, 4);
        if (type === '单选' && !/^[A-D]$/.test(answer)) answer = 'A';
        if (type === '多选') {
          answer = answer.replace(/[^A-D]/g, '');
          if (answer.length < 2) return { ok: false, error: '第 ' + (i + 1) + ' 题为多选但答案不足 2 项，请重试' };
        }
      }
      out.push({
        type: type, stem: stem, options: options, answer: answer,
        points: Number(q.points) > 0 ? Number(q.points) : 10
      });
    }
    return { ok: true, questions: out };
  },

  /** 政策/资料问答：有模型时生成答案并附依据；无模型时返回检索结果 */
  async ask(question, user) {
    var hits = AI.search(question, user, 4);
    var context = hits.map(function (d, i) { return '【资料' + (i + 1) + '】' + d.text; }).join('\n');
    if (!AI.isReady()) {
      return { ok: true, offline: true, sources: hits, content: '' };
    }
    var prompt =
      '你是校园办事助手。请依据下面的【参考资料】回答学生的问题。\n' +
      '【硬性要求】只依据参考资料回答，不要编造；资料不足以回答时如实说明并建议咨询辅导员或学工处；' +
      '回答用简体中文、分点、口语化、200 字以内；涉及金额/时间/地点必须与资料一致。\n' +
      '【参考资料】\n' + (context || '（无匹配资料）') + '\n' +
      '【问题】' + question;
    var res = await AI.chat([
      { role: 'system', content: '你是严谨的校园事务助手，只依据给定资料作答。' },
      { role: 'user', content: AI.mask(prompt) }
    ], { temperature: 0.3, maxTokens: 700 });
    if (res.ok) return { ok: true, offline: false, content: AI._clean(res.content), sources: hits, ms: res.ms };
    return { ok: true, offline: true, sources: hits, content: '', reason: res.error };
  },

  /* =====================================================
   * 智能体（Agent）：规划 → 调用系统工具 → 汇报
   * 设计约束（合规与可靠性）：
   * 1. 工具白名单：Agent 只能调用下面注册的只读工具，数据全部来自系统统计，模型不得凭空生成数据；
   * 2. 离线可用：模型不可用时跳过"规划"，直接运行全部工具并用规则模板汇总；
   * 3. 可解释：每份产出都标注用了哪些工具、数据口径与时间；
   * 4. 人在环：所有写操作（发布通知/测验、加入提醒）都由用户点击确认。
   * ===================================================== */

  /** 奖助与认定的时间节点（依据 2026 年秋季学期学校通知整理，跨年自动过期） */
  SCHOLAR_NODES: [
    { event: '国家奖学金 · 学生申请', start: '2026-09-23', end: '2026-10-08', href: '#/downloads' },
    { event: '国家奖学金 · 学院初评公示', start: '2026-10-09', end: '2026-10-11', href: '#/scholarships' },
    { event: '国家奖学金 · 学校审核', start: '2026-10-11', end: '2026-10-13', href: '#/scholarships' },
    { event: '国家奖学金 · 竞评大会', start: '2026-10-14', end: '2026-10-14', href: '#/scholarships' },
    { event: '国家奖学金 · 学校公示', start: '2026-10-16', end: '2026-10-22', href: '#/scholarships' },
    { event: '家庭经济困难认定 · 个人申请与班级评议', start: '2026-09-07', end: '2026-09-20', href: '#/downloads' },
    { event: '家庭经济困难认定 · 学院认定', start: '2026-09-21', end: '2026-09-24', href: '#/downloads' },
    { event: '家庭经济困难认定 · 学校认定', start: '2026-09-28', end: '2026-09-30', href: '#/downloads' },
    { event: '家庭经济困难认定 · 公示与建档', start: '2026-10-01', end: '2026-10-07', href: '#/downloads' }
  ],

  /** ---------- 工具白名单（只读，全部取自系统演示数据） ---------- */
  TOOLS: [
    {
      name: 'pending_leaves', desc: '待审批的请假申请（辅导员/教师待办）',
      run: function (user) {
        var scope = Auth.scopeClassIds(user);
        return Store.list('leaves').filter(function (l) {
          return l.status === '待审批' && scope.indexOf(l.classId) !== -1;
        }).map(function (l) {
          var s = Store.getStudent(l.studentId);
          return { 学生: s ? s.name.slice(0, 1) + '同学' : '未知', 起止: l.startDate + ' 至 ' + l.endDate, 事由: l.reason };
        });
      }
    },
    {
      name: 'health_today', desc: '今日健康日报：填报率、体温异常、未报人数、校外动向',
      run: function (user) {
        var scope = Auth.scopeClassIds(user), today = Utils.today();
        var total = 0, done = 0, abnormal = 0, outside = 0;
        var latest = {};
        scope.forEach(function (cid) {
          var sum = Store.healthSummary(cid, today);
          total += sum.total; done += sum.done; abnormal += sum.abnormal.length;
        });
        Store.list('healthReports').filter(function (r) { return scope.indexOf(r.classId) !== -1; }).forEach(function (r) {
          if (!latest[r.studentId] || String(r.date) > String(latest[r.studentId].date)) latest[r.studentId] = r;
        });
        Object.keys(latest).forEach(function (id) {
          var loc = latest[id].location || '';
          if (loc && !/校内|晴川/.test(loc)) outside++;
        });
        return {
          日期: today, 应报人数: total, 已报人数: done, 未报人数: total - done,
          填报率: total ? Math.round(done / total * 100) + '%' : '暂无',
          体温异常: abnormal, 校外动向人数: outside
        };
      }
    },
    {
      name: 'attendance_trend', desc: '近 7 天出勤率与环比（用于发现下滑班级）',
      run: function (user) {
        var scope = Auth.scopeClassIds(user);
        var classes = Store.list('classes').filter(function (c) { return scope.indexOf(c.id) !== -1; });
        return classes.map(function (c) {
          var rows = Store.list('attendance').filter(function (a) { return a.classId === c.id; });
          var rate = function (from, to) {
            var recs = rows.filter(function (a) { return a.date >= from && a.date <= to; });
            return recs.length ? Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100) : null;
          };
          var recent = rate(Utils.daysAgo(6), Utils.today());
          var prev = rate(Utils.daysAgo(13), Utils.daysAgo(7));
          return {
            班级: c.name, 近7天出勤率: recent === null ? '暂无' : recent + '%',
            前7天出勤率: prev === null ? '暂无' : prev + '%',
            环比: (recent !== null && prev !== null) ? (recent - prev >= 0 ? '+' : '') + (recent - prev) + ' 个百分点' : '—'
          };
        });
      }
    },
    {
      name: 'focus_students', desc: '重点关注学生（出勤率低于 85%、缺勤 3 次以上或学业预警）',
      run: function (user) {
        var scope = Auth.scopeClassIds(user), term = UI.termFilter.get() || Store.currentTerm();
        var alertMap = {};
        scope.forEach(function (cid) {
          Store.alertsFor(cid, term).forEach(function (a) { alertMap[a.studentId] = a.reasons.join('、'); });
        });
        var out = [];
        Store.list('students').filter(function (s) { return scope.indexOf(s.classId) !== -1; }).forEach(function (stu) {
          var recs = Store.list('attendance').filter(function (a) { return a.studentId === stu.id; });
          var reasons = [];
          if (recs.length) {
            var r = Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100);
            var absent = recs.filter(function (a) { return a.status === '缺勤'; }).length;
            if (r < 85) reasons.push('出勤率 ' + r + '%');
            if (absent >= 3) reasons.push('缺勤 ' + absent + ' 次');
          }
          if (alertMap[stu.id]) reasons.push('学业预警（' + alertMap[stu.id] + '）');
          if (reasons.length) out.push({ 学生: stu.name.slice(0, 1) + '同学', 原因: reasons.join('；') });
        });
        return out;
      }
    },
    {
      name: 'scholarship_nodes', desc: '奖助学金与困难认定的时间节点（进行中 / 3 天内到期）',
      run: function () {
        var today = Utils.today();
        var days = function (a, b) {
          var pa = a.split('-'), pb = b.split('-');
          return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
        };
        return AI.SCHOLAR_NODES.filter(function (n) {
          return today >= n.start && today <= n.end;   // 进行中
        }).map(function (n) {
          return { 事项: n.event, 截止: n.end, 剩余天数: days(today, n.end) };
        });
      }
    }
  ],

  runTools(names, user) {
    var out = [];
    (names || []).forEach(function (n) {
      var tool = AI.TOOLS.filter(function (t) { return t.name === n; })[0];
      if (!tool) return;
      var data;
      try { data = tool.run(user); } catch (e) { data = []; }
      out.push({ name: tool.name, desc: tool.desc, data: data });
    });
    return out;
  },

  /** 规划：让模型挑选需要的工具（失败或未配置则全选 —— 离线也能工作） */
  async planTools(task, user) {
    var allowed = AI.TOOLS.map(function (t) { return t.name; });
    if (!AI.isReady()) return { tools: allowed, offline: true };
    var list = AI.TOOLS.map(function (t) { return '- ' + t.name + '：' + t.desc; }).join('\n');
    var res = await AI.chat([
      { role: 'system', content: '你是任务规划器，只输出 JSON 数组，不解释。' },
      { role: 'user', content: '任务：' + task + '\n可用工具：\n' + list + '\n请输出需要调用的工具名数组，如 ["pending_leaves","health_today"]' }
    ], { temperature: 0, maxTokens: 120 });
    if (!res.ok) return { tools: allowed, offline: true, reason: res.error };
    var txt = String(res.content), s = txt.indexOf('['), e = txt.lastIndexOf(']');
    try {
      var arr = JSON.parse(txt.slice(s, e + 1));
      arr = arr.filter(function (x) { return allowed.indexOf(x) !== -1; });
      return { tools: arr.length ? arr : allowed, offline: false, ms: res.ms };
    } catch (err) {
      return { tools: allowed, offline: true };
    }
  },

  /** ============ Agent 1：学工值班日报（辅导员/管理员） ============ */
  async agentDutyReport(user) {
    var plan = await AI.planTools('生成辅导员今日学工日报：需要待办、健康填报、出勤趋势、重点关注学生、奖助节点', user);
    var results = AI.runTools(plan.tools, user);
    var dataText = JSON.stringify(results, null, 1);

    // 处理入口（由工具结果生成，供一键跳转）
    var items = [];
    results.forEach(function (r) {
      if (r.name === 'pending_leaves' && r.data.length) items.push({ label: '处理待审批请假 ' + r.data.length + ' 件', href: '#/leave-approve' });
      if (r.name === 'health_today') {
        if (r.data.未报人数) items.push({ label: '催报健康日报 ' + r.data.未报人数 + ' 人', href: '#/health-report' });
        if (r.data.体温异常) items.push({ label: '查看体温异常 ' + r.data.体温异常 + ' 人', href: '#/health-report' });
        if (r.data.校外动向人数) items.push({ label: '核对校外动向 ' + r.data.校外动向人数 + ' 人', href: '#/health-report' });
      }
      if (r.name === 'focus_students' && r.data.length) items.push({ label: '重点关注学生 ' + r.data.length + ' 人', href: '#/dashboard' });
      if (r.name === 'scholarship_nodes' && r.data.length) items.push({ label: '奖助节点 ' + r.data.length + ' 项在办', href: '#/scholarships' });
      if (r.name === 'attendance_trend') {
        var down = r.data.filter(function (x) { return String(x.环比).indexOf('-') === 0; });
        if (down.length) items.push({ label: '出勤下滑班级 ' + down.length + ' 个', href: '#/attendance-report' });
      }
    });

    var prompt =
      '你是高校辅导员的值班助手。请依据下面的【系统数据】生成《今日学工日报》。\n' +
      '【硬性要求】只依据数据、不得编造；不出现学生虚构姓名（用"某同学"）；' +
      '分四部分：一、今日概况（关键数字）；二、需要立即处理（分条列出，注明人数与班级）；' +
      '三、重点关注（来自重点关注学生数据，按原因归类，不要逐人罗列姓名）；四、建议动作（3—5 条，可执行）。' +
      '全文 300—500 字，简体中文。\n【系统数据】\n' + dataText;
    var res = await AI.chat([
      { role: 'system', content: '你是严谨的辅导员值班助手，只依据给定数据写日报。' },
      { role: 'user', content: AI.mask(prompt) }
    ], { temperature: 0.4, maxTokens: 1200 });

    if (res.ok) return { ok: true, offline: false, content: AI._clean(res.content), items: items, tools: plan.tools, ms: res.ms };
    return { ok: true, offline: true, content: AI._dutyTemplate(results), items: items, tools: plan.tools, reason: res.error };
  },

  _dutyTemplate(results) {
    var map = {};
    results.forEach(function (r) { map[r.name] = r.data; });
    var L = ['【今日学工日报】' + Utils.today()];
    L.push('');
    L.push('一、今日概况');
    var h = map.health_today || {};
    L.push('    健康日报：应报 ' + (h.应报人数 || 0) + ' 人，已报 ' + (h.已报人数 || 0) + ' 人，填报率 ' +
      (h.填报率 || '暂无') + '；体温异常 ' + (h.体温异常 || 0) + ' 人；校外动向 ' + (h.校外动向人数 || 0) + ' 人。');
    L.push('    待审批请假：' + ((map.pending_leaves || []).length) + ' 件；重点关注学生：' + ((map.focus_students || []).length) + ' 人。');
    L.push('');
    L.push('二、需要立即处理');
    if ((map.pending_leaves || []).length) {
      map.pending_leaves.slice(0, 5).forEach(function (x, i) { L.push('    ' + (i + 1) + '. 待审批请假：' + x.起止 + '（' + x.事由 + '）'); });
    }
    if ((h.未报人数 || 0) > 0) L.push('    · 健康日报未报 ' + h.未报人数 + ' 人，请督促补报；');
    if ((h.体温异常 || 0) > 0) L.push('    · 体温异常 ' + h.体温异常 + ' 人，请核实健康状况并跟踪；');
    if ((h.校外动向人数 || 0) > 0) L.push('    · 校外动向 ' + h.校外动向人数 + ' 人，请核对行程与安全；');
    if ((map.scholarship_nodes || []).length) {
      map.scholarship_nodes.forEach(function (n) { L.push('    · 奖助节点：' + n.事项 + '（剩余 ' + n.剩余天数 + ' 天）'); });
    }
    if (!(map.pending_leaves || []).length && !(h.未报人数 || 0) && !(h.体温异常 || 0)) L.push('    暂无紧急事项。');
    L.push('');
    L.push('三、重点关注');
    var focus = map.focus_students || [];
    if (focus.length) {
      var byReason = {};
      focus.forEach(function (f) { f.原因.split('；').forEach(function (r) { byReason[r] = (byReason[r] || 0) + 1; }); });
      Object.keys(byReason).forEach(function (k) { L.push('    · ' + k + '：' + byReason[k] + ' 人'); });
    } else L.push('    暂无需要重点关注的学生。');
    L.push('');
    L.push('四、建议动作');
    L.push('    1. 逐一审批待处理请假，并向学生确认返校时间；');
    L.push('    2. 对未报日报与体温异常学生当天联系核实；');
    L.push('    3. 对重点关注学生安排谈话，必要时联系家长；');
    L.push('    4. 留意在办的奖助节点，提醒学生按期提交材料；');
    L.push('    5. 对出勤下滑班级与班委沟通，了解原因并加强考勤。');
    L.push('');
    L.push('（以上为离线规则模板：数据均来自本系统实时统计，未配置 AI 模型时按固定体例生成）');
    return L.join('\n');
  },

  /** ============ Agent 2：学业帮扶跟踪（教师/管理员） ============ */
  async agentHelpPlan(classId, term, user) {
    var cls = Store.list('classes').filter(function (c) { return c.id === classId; })[0];
    if (!cls) return { ok: false, error: '未找到班级' };
    var students = Store.list('students').filter(function (s) { return s.classId === classId; });
    var scores = Store.list('scores').filter(function (s) { return s.classId === classId && Store.termMatch(s.term, term); });
    var alerts = {};
    Store.alertsFor(classId, term || Store.currentTerm()).forEach(function (a) { alerts[a.studentId] = a.reasons; });

    // 汇总风险学生（工具白名单口径：只读系统数据）
    var risk = [];
    students.forEach(function (stu) {
      var mine = scores.filter(function (s) { return s.studentId === stu.id; });
      var fails = mine.filter(function (s) { return Number(s.score) < 60; }).map(function (s) { return s.subject; });
      var avg = mine.length ? Utils.round1(mine.reduce(function (a, s) { return a + Number(s.score); }, 0) / mine.length) : null;
      var recs = Store.list('attendance').filter(function (a) { return a.studentId === stu.id; });
      var attRate = recs.length ? Math.round(recs.filter(function (a) { return a.status === '出勤'; }).length / recs.length * 100) : null;
      var reasons = [];
      if (fails.length) reasons.push('不及格 ' + fails.length + ' 门（' + fails.slice(0, 3).join('、') + '）');
      if (avg !== null && avg < 70) reasons.push('平均分 ' + avg);
      if (attRate !== null && attRate < 85) reasons.push('出勤率 ' + attRate + '%');
      if (alerts[stu.id]) reasons.push('学业预警（' + alerts[stu.id].join('、') + '）');
      if (reasons.length) risk.push({ studentId: stu.id, name: stu.name, avg: avg, fails: fails, attRate: attRate, reasons: reasons });
    });

    // 与上次运行对比（跟踪改善）
    var key = classId + '|' + (term || Store.currentTerm());
    var snaps = {};
    try { snaps = JSON.parse(Store.getPref('aiHelpSnapshots', '{}') || '{}'); } catch (e) { snaps = {}; }
    var prev = snaps[key] ? snaps[key].ids || [] : null;
    var nowIds = risk.map(function (r) { return r.studentId; });
    var compare = prev === null ? null : {
      已改善: prev.filter(function (id) { return nowIds.indexOf(id) === -1; }).length,
      仍存在: prev.filter(function (id) { return nowIds.indexOf(id) !== -1; }).length,
      新进: nowIds.filter(function (id) { return prev.indexOf(id) === -1; }).length
    };

    var perf = (function () {
      var avg = scores.length ? Utils.round1(scores.reduce(function (a, s) { return a + Number(s.score); }, 0) / scores.length) : null;
      var pass = scores.length ? Math.round(scores.filter(function (s) { return Number(s.score) >= 60; }).length / scores.length * 100) : null;
      return { 平均分: avg, 及格率: pass === null ? '暂无' : pass + '%', 成绩记录数: scores.length };
    })();

    var payload = {
      班级: cls.name, 学期: term || Store.currentTerm(),
      班级整体: perf,
      风险学生人数: risk.length,
      风险学生: risk.slice(0, 15).map(function (r) { return { 学生: r.name.slice(0, 1) + '同学', 原因: r.reasons.join('；') }; }),
      与上次对比: compare
    };
    var prompt =
      '你是高校任课教师/班主任的学业帮扶助手。请依据下面的【班级数据】输出帮扶方案。\n' +
      '【硬性要求】只依据数据、不得编造；不出现学生虚构姓名（用"某同学"）；输出三部分：\n' +
      '一、整体学情（2—3 句，含平均分、及格率与风险人数）；\n' +
      '二、帮扶清单（按"风险类型"归类，每类给出：涉及人数、具体帮扶动作）；\n' +
      '三、家长沟通话术（3 句通用话术，不点名、不贴标签，先肯定后建议）。\n' +
      '全文 300—500 字，简体中文。\n【班级数据】\n' + JSON.stringify(payload, null, 1);
    var res = await AI.chat([
      { role: 'system', content: '你是严谨的学业帮扶助手，只依据数据说话，措辞尊重学生。' },
      { role: 'user', content: AI.mask(prompt) }
    ], { temperature: 0.4, maxTokens: 1200 });

    // 保存快照（供下次对比；由用户点击生成即视为确认）
    snaps[key] = { date: Utils.today(), ids: nowIds, names: risk.map(function (r) { return r.name; }) };
    Store.setPref('aiHelpSnapshots', JSON.stringify(snaps));

    var content = res.ok ? AI._clean(res.content) : AI._helpTemplate(payload);
    return {
      ok: true, offline: !res.ok, content: content, reason: res.ok ? '' : res.error,
      risk: risk, compare: compare, perf: perf, className: cls.name, ms: res.ms
    };
  },

  _helpTemplate(p) {
    var L = ['【' + p.班级 + ' 学业帮扶方案】（' + p.学期 + '）'];
    L.push('');
    L.push('一、整体学情');
    L.push('    本学期共 ' + p.班级整体.成绩记录数 + ' 条成绩记录，平均分 ' + (p.班级整体.平均分 === null ? '暂无' : p.班级整体.平均分) +
      '，及格率 ' + p.班级整体.及格率 + '；需帮扶学生 ' + p.风险学生人数 + ' 人。');
    if (p.与上次对比) {
      L.push('    与上次相比：已改善 ' + p.与上次对比.已改善 + ' 人，仍存在 ' + p.与上次对比.仍存在 + ' 人，新进 ' + p.与上次对比.新进 + ' 人。');
    }
    L.push('');
    L.push('二、帮扶清单');
    var byType = {};
    p.风险学生.forEach(function (r) {
      r.原因.split('；').forEach(function (x) {
        var k = x.indexOf('不及格') === 0 ? '有不及格课程' : (x.indexOf('出勤率') === 0 ? '出勤率偏低' : (x.indexOf('平均分') === 0 ? '平均分偏低' : x));
        byType[k] = (byType[k] || 0) + 1;
      });
    });
    var acts = {
      '有不及格课程': '核对补考与重修安排，指定学习互助伙伴，考前两周集中答疑；',
      '出勤率偏低': '与本人谈话了解原因，同步家长；连续缺勤的按学生管理规定处理；',
      '平均分偏低': '查看各科分布，找出薄弱科目，安排针对性辅导；',
      '学业预警': '按预警原因逐一跟进，记录帮扶过程，两周后复评。'
    };
    var i = 0;
    Object.keys(byType).forEach(function (k) {
      i++;
      L.push('    ' + i + '. ' + k + '（' + byType[k] + ' 人）：' + (acts[k] || '逐一谈话了解情况并记录。'));
    });
    if (!i) L.push('    暂无需要帮扶的学生。');
    L.push('');
    L.push('三、家长沟通话术');
    L.push('    1. "这学期孩子整体状态不错，我们想在学习方法上再帮他调整一下，想听听您在家观察到的情况。"');
    L.push('    2. "最近有几门课成绩有波动，学校这边会安排辅导，也麻烦您在家提醒他按作息复习。"');
    L.push('    3. "如果方便，我们约个时间电话沟通十分钟，一起定个下周能落地的小目标。"');
    L.push('');
    L.push('（以上为离线规则模板：数据均来自本系统统计，未接入模型时按固定体例生成）');
    return L.join('\n');
  },

  /* ============ Agent 3：学生办事指引（学生端） ============ */
  /** 办事流程知识（规则化前置条件 + 材料 + 步骤，模型只负责措辞） */
  FLOWS: [
    { id: 'zhuxuejin', name: '国家助学金', keys: ['助学金', '贫困', '资助'], needDifficulty: true,
      forms: ['国家助学金申请审批表', '家庭经济困难学生认定申请表'],
      steps: ['完成家庭经济困难学生认定（未认定无法申请）', '填写《国家助学金申请审批表》并勾选申请档次', '班级民主评议 → 学院审核 → 学校审批', '公示无异议后发放至本人银行卡'],
      place: '学工处大学生资助中心（综合楼一 108，027-87934608）', due: '每年秋季学期 9—10 月' },
    { id: 'lizhi', name: '国家励志奖学金', keys: ['励志'], needDifficulty: true,
      forms: ['国家励志奖学金申请审批表'],
      steps: ['完成家庭经济困难认定', '填写申请表并附成绩单与获奖证明', '学院初评公示 → 学校审批', '与国家奖学金同一学年不可兼得'],
      place: '学工处大学生资助中心（综合楼一 108）', due: '每年秋季学期 9—10 月' },
    { id: 'guojiang', name: '国家奖学金', keys: ['国奖', '国家奖学金'], needDifficulty: false,
      forms: ['国家奖学金申请审批表'],
      steps: ['确认资格：大二及以上；专升本自本科第 2 年起', '填写申请表 + 教务盖章成绩单 + 综合素质测评汇总表 + 获奖证书复印件', '另附个人事迹报告（纸质与电子版）', '学院初评公示 → 学校竞评大会 → 公示 5 个工作日'],
      place: '学工处大学生资助中心（综合楼一 108）', due: '9 月下旬—10 月上旬' },
    { id: 'qingchuan', name: '晴川奖助学金（校级）', keys: ['晴川'], needDifficulty: false,
      forms: ['晴川奖助学金申请审批表'],
      steps: ['奖学金以综合素质测评成绩为主要依据；助学金须先完成困难认定', '填写申请表并勾选申请项目', '辅导员签署意见 → 学院审核 → 学校审批'],
      place: '学工处大学生资助中心', due: '每年秋季学期' },
    { id: 'rending', name: '家庭经济困难学生认定', keys: ['困难认定', '认定', '建档立卡', '低保'],
      needDifficulty: false,
      forms: ['家庭经济困难学生认定申请表'],
      steps: ['秋季学期开学初填写认定申请表（一至七类学生填省确认表）', '《量化评分表》粘贴在申请表之后', '班级认定评议小组民主评议 → 学院认定 → 学校核准', '公示建档（结果作为本学年各项资助的依据）'],
      place: '辅导员 / 学院（学校：学工处大学生资助中心）', due: '每年 9 月' },
    { id: 'chongxiu', name: '课程重修', keys: ['重修'], needDifficulty: false,
      forms: ['课程重修申请表'],
      steps: ['在「我的成绩」确认不及格课程', '开学初填写《课程重修申请表》', '任课教师、开课学院签署意见', '教务处审核并办理重修（具体安排以教务处通知为准）'],
      place: '教务处 / 开课学院', due: '每学期开学初' },
    { id: 'huankao', name: '缓考', keys: ['缓考'], needDifficulty: false,
      forms: ['缓考申请表'],
      steps: ['考试前提出申请（因病一般需二级甲等及以上医院证明）', '辅导员签署意见 → 学院审核 → 教务处审批', '缓考随下一学期开学补考一并安排'],
      place: '教务处考务科', due: '考试前' },
    { id: 'qingjia', name: '请假', keys: ['请假', '离校', '外出'], needDifficulty: false,
      forms: ['学生请假条（纸质模板）'],
      steps: ['在「我的考勤 → 申请请假」在线提交（推荐）', '教师/辅导员审批，批准后按工作日自动计入考勤', '3 天以上或离汉的需学院审批备案；校外请假须家长知情', '返校后及时销假'],
      place: '辅导员（线上：我的考勤）', due: '随时' },
    { id: 'zaidu', name: '在读证明', keys: ['在读证明', '证明'], needDifficulty: false,
      forms: ['在读证明（模板）'],
      steps: ['下载模板并填写个人信息（可在「我的信息」核对）', '提交学院或教务处审核', '加盖公章后生效'],
      place: '学院办公室 / 教务处', due: '提前 1—3 个工作日' },
    { id: 'xueshengzheng', name: '学生证补办', keys: ['学生证'], needDifficulty: false,
      forms: ['学生证补办申请表'],
      steps: ['填写申请表并粘贴近期一寸免冠照片', '辅导员核实签字 → 学院审核盖章', '到学工处办理'],
      place: '学工处（综合楼一 108）', due: '随时' },
    { id: 'daikuan', name: '生源地信用助学贷款', keys: ['贷款', '助学贷款'], needDifficulty: false,
      forms: ['在读证明（模板）'],
      steps: ['在生源地县（市、区）学生资助管理中心（国家开发银行）办理', '共同借款人原则上为父母', '学籍须为"在读"状态；需学校出具在读证明', '按通知时间回执确认'],
      place: '生源地资助中心 / 学校学工处备案', due: '每年 6—9 月' },
    { id: 'qgzx', name: '勤工助学', keys: ['勤工助学', '兼职', '岗位'], needDifficulty: false,
      forms: ['勤工助学用工申请表'],
      steps: ['关注学校勤工助学岗位征集通知', '填写《勤工助学用工申请表》', '按岗位要求面试/上岗，扶困优先'],
      place: '学工处大学生资助中心', due: '每学年初' }
  ],

  matchFlow(question) {
    var q = String(question || '');
    var best = null, bestScore = 0;
    AI.FLOWS.forEach(function (f) {
      var score = 0;
      f.keys.forEach(function (k) { if (q.indexOf(k) !== -1) score += k.length; });
      if (q.indexOf(f.name) !== -1) score += 4;
      if (score > bestScore) { bestScore = score; best = f; }
    });
    return bestScore > 0 ? best : null;
  },

  /** 检查前置条件（如：申请助学金前是否已获得困难认定支持） */
  checkPrereq(flow, user) {
    if (!flow.needDifficulty) return null;
    var me = Store.list('students').filter(function (s) { return s.id === user.studentId; })[0];
    if (!me) return { ok: false, text: '未找到你的学生档案，请联系管理员绑定' };
    var mine = Store.list('scholarships').filter(function (s) { return s.studentId === me.id; });
    var hasAid = mine.some(function (s) { return /助学金|励志/.test(s.name); });
    return hasAid
      ? { ok: true, text: '你已有受助记录（' + mine.map(function (s) { return s.name; }).join('、') + '），认定前置条件已满足' }
      : { ok: false, text: '系统中暂无你的家庭经济困难认定/受助记录：请先完成当学年困难认定，否则无法申请该资助项目' };
  },

  async agentStudentGuide(question, user) {
    var flow = AI.matchFlow(question);
    if (!flow) {
      var hits = AI.search(question, user, 4);
      return { ok: true, offline: !AI.isReady(), flow: null, sources: hits,
        content: hits.length ? '' : '没有识别到具体办事事项，可换个说法（如"申请助学金""怎么重修""请假流程"），或直接咨询辅导员（综合楼一 108，027-87934608）。' };
    }
    var prereq = AI.checkPrereq(flow, user);
    var steps = flow.steps.slice();
    if (prereq && !prereq.ok) steps.unshift('⚠ 前置条件未满足：' + prereq.text);

    var prompt =
      '你是校园办事助手。学生要办的事项是「' + flow.name + '」。请依据下面的【办理流程资料】给出手把手指引。\n' +
      '【硬性要求】只依据资料、不得编造；用"你"称呼学生；分点写清"第一步做什么、去哪里、带什么材料"；' +
      '最后写 2 条最容易被退回的常见问题提醒。全文 200—350 字，简体中文。\n' +
      '【办理流程资料】\n步骤：' + steps.join(' → ') + '\n所需表格：' + flow.forms.join('、') +
      '\n办理地点：' + flow.place + '\n办理时间：' + flow.due +
      (prereq ? '\n前置条件检查：' + prereq.text : '');
    var res = await AI.chat([
      { role: 'system', content: '你是严谨的校园办事助手，只依据给定资料作答。' },
      { role: 'user', content: AI.mask(prompt) }
    ], { temperature: 0.3, maxTokens: 800 });

    return {
      ok: true, offline: !res.ok, reason: res.ok ? '' : res.error,
      flow: flow, steps: steps, prereq: prereq,
      forms: flow.forms, place: flow.place, due: flow.due,
      content: res.ok ? AI._clean(res.content) : AI._guideTemplate(flow, steps, prereq),
      ms: res.ms
    };
  },

  _guideTemplate(flow, steps, prereq) {
    var L = ['【' + flow.name + ' · 办理指引】'];
    if (prereq && !prereq.ok) L.push('提醒：' + prereq.text);
    L.push('');
    L.push('办理步骤：');
    steps.forEach(function (s, i) { L.push('    ' + (i + 1) + '. ' + s); });
    L.push('');
    L.push('需要的表格：' + flow.forms.join('、') + '（可在「资料下载」中获取，含办理说明）');
    L.push('办理地点：' + flow.place);
    L.push('办理时间：' + flow.due);
    L.push('');
    L.push('常见被退回原因：');
    L.push('    1. 材料不齐（如缺成绩单盖章、缺获奖证书复印件、表格未签字）；');
    L.push('    2. 错过时间节点或未先完成前置环节（如未做困难认定就申请助学金）。');
    L.push('');
    L.push('（以上为离线规则指引：内容依据系统内的办理说明与政策知识整理，未接入模型时按固定体例生成）');
    return L.join('\n');
  },

  /** ---------- 个人提醒（学生端办事跟进，存本机偏好，按用户隔离） ---------- */
  reminders(userId) {
    try {
      var all = JSON.parse(Store.getPref('aiTasks', '{}') || '{}');
      return all[userId] || [];
    } catch (e) { return []; }
  },
  addReminder(userId, task) {
    var all = {};
    try { all = JSON.parse(Store.getPref('aiTasks', '{}') || '{}'); } catch (e) { all = {}; }
    var list = all[userId] || [];
    list.push({
      id: Utils.uid(), text: task.text, href: task.href || '',
      due: task.due || '', done: false, createdAt: Utils.nowStr()
    });
    all[userId] = list;
    Store.setPref('aiTasks', JSON.stringify(all));
    return list;
  },
  toggleReminder(userId, id) {
    var all = {};
    try { all = JSON.parse(Store.getPref('aiTasks', '{}') || '{}'); } catch (e) { all = {}; }
    (all[userId] || []).forEach(function (t) { if (t.id === id) t.done = !t.done; });
    Store.setPref('aiTasks', JSON.stringify(all));
    return all[userId] || [];
  },
  removeReminder(userId, id) {
    var all = {};
    try { all = JSON.parse(Store.getPref('aiTasks', '{}') || '{}'); } catch (e) { all = {}; }
    all[userId] = (all[userId] || []).filter(function (t) { return t.id !== id; });
    Store.setPref('aiTasks', JSON.stringify(all));
    return all[userId] || [];
  }
};
