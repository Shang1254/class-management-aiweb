/* =====================================================
 * 班级缴费中心 · 支付网关层（pay-gateway.js）
 * -----------------------------------------------------
 * 对标宿主系统 AI.PROVIDERS 的「预设 + 空缝」设计：
 *   · mock    内置演示收银台（浏览器内闭环，零配置）
 *   · local   本机签名服务 pay_server.py（真实 HTTP 下单 → 轮询 → 服务端验签 → 对账）
 *   · campus  支付宝商家网关（学校/班级主体签约后的空预设，填 base+appId 即启用）
 * 配置只存本机（PayStore 偏好 pay_pref_config），不写进代码。
 * 安全边界：验签一律在网关服务端完成（notify/verify 接口），
 * 前端只展示「已验签」结果——与宿主 loginAsExternal 的 trusted 语义同源。
 * ===================================================== */

var PAY = window.PAY = {

  /* ---------------- 通道预设 ---------------- */

  GATEWAYS: [
    {
      id: 'mock', name: '内置演示收银台（无需配置）', base: '', appId: '',
      hint: '浏览器内完成「下单 → 出码 → 支付 → 回执」全流程闭环，用于教学演示与答辩；不产生任何真实资金流动。',
      local: true
    },
    {
      id: 'local', name: '本机签名服务（pay_server.py）', base: 'http://127.0.0.1:8818', appId: '',
      hint: '真实 HTTP 链路：签名下单、异步回调、HMAC 验签、按日对账；在服务端 config.json 填入支付宝沙箱/正式密钥后即真实签名。',
      timeout: 8000
    },
    {
      id: 'campus', name: '支付宝商家网关（学校/班级主体签约后启用）', base: '', appId: '',
      hint: '由学校网络信息中心或财务处提供「与支付宝开放平台签约」的网关地址与应用 appId（当面付/手机网站支付）；填入即启用，密钥只存服务端、不经浏览器。',
      empty: true
    }
  ],

  DEFAULT_CONFIG: { gateway: 'mock', base: '', appId: '' },

  /* ---------------- 配置（存本机偏好） ---------------- */

  config: function () {
    var c = PayStore.getPref('config', null);
    if (!c || !c.gateway) return JSON.parse(JSON.stringify(this.DEFAULT_CONFIG));
    return c;
  },

  saveConfig: function (patch) {
    var c = this.config();
    for (var k in (patch || {})) c[k] = patch[k];
    PayStore.setPref('config', c);
    return c;
  },

  /** 当前生效的通道预设（配置值覆盖预设 base/appId） */
  active: function () {
    var c = this.config();
    var def = this.GATEWAYS.filter(function (g) { return g.id === c.gateway; })[0] || this.GATEWAYS[0];
    return {
      def: def,
      base: (c.base || def.base || '').replace(/\/+$/, ''),
      appId: c.appId || def.appId || '',
      mode: def.id
    };
  },

  /* ---------------- 连通性 ---------------- */

  _fetch: function (url, opts, timeout) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, timeout || 8000);
    return fetch(url, Object.assign({ signal: ctl.signal }, opts || {})).finally(function () { clearTimeout(t); });
  },

  /** 探测通道状态：mock 恒通；local/campus 探测 ping 接口 */
  async ping() {
    var a = this.active();
    if (a.mode === 'mock') return { ok: true, mode: 'mock', message: '演示收银台就绪（浏览器内闭环）' };
    if (!a.base) return { ok: false, mode: a.mode, message: '未配置网关地址——填入后即启用（未配置 ≠ 坏了）' };
    try {
      var r = await this._fetch(a.base + '/api/pay/ping', {}, 4000);
      var d = await r.json();
      return { ok: !!d.ok, mode: a.mode, message: d.message || (d.ok ? '已连通' : '服务异常'), detail: d };
    } catch (e) {
      return { ok: false, mode: a.mode, message: '无法连接 ' + a.base + '（服务未启动或跨域被拦截）' };
    }
  },

  /* ---------------- 下单 / 查单 / 验签 ---------------- */

  /**
   * 创建支付订单
   * @param order {outTradeNo, subject, amountFen, studentNo, name, feeId}
   * @returns {ok, qrPayload?, payUrl?, gatewayTradeNo?, message?, mode}
   */
  async createOrder(order) {
    var a = this.active();
    if (a.mode === 'mock') {
      return {
        ok: true, mode: 'mock',
        qrPayload: 'DEMOQR|' + order.outTradeNo + '|' + order.amountFen + '|' + (order.subject || ''),
        gatewayTradeNo: 'TRDDEMO' + Date.now().toString(36).toUpperCase(),
        message: '演示收银台（无真实资金流动）'
      };
    }
    if (!a.base) {
      return { ok: false, mode: a.mode, message: '该通道尚未配置网关地址：请到「设置 → 支付网关」填入（未配置 ≠ 坏了）。' };
    }
    try {
      var r = await this._fetch(a.base + '/api/pay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outTradeNo: order.outTradeNo, subject: order.subject,
          amountFen: order.amountFen, appId: a.appId || undefined
        })
      }, a.def.timeout);
      var d = await r.json();
      if (!d.ok) return { ok: false, mode: a.mode, message: d.message || '下单被网关拒绝' };
      return { ok: true, mode: a.mode, qrPayload: d.qrPayload, payUrl: d.payUrl || '', gatewayTradeNo: d.gatewayTradeNo || '', message: d.message || '' };
    } catch (e) {
      return { ok: false, mode: a.mode, message: '连接网关失败（' + a.base + '）：请确认签名服务已启动。' };
    }
  },

  /**
   * 查询订单状态（收银台轮询用）
   * @returns {ok, status:'WAIT'|'PAID'|'CLOSED', receipt?{no,amountFen,status,paidAt,tradeNo,channel,sig?}, message?}
   */
  async queryOrder(outTradeNo) {
    var a = this.active();
    if (a.mode === 'mock') {
      var st = PAY._mockState[outTradeNo];
      if (st === 'PAID') {
        return {
          ok: true, status: 'PAID',
          receipt: {
            no: outTradeNo, status: 'PAID',
            // 本地时区时间（铁律：禁用 toISOString，东八区会偏移一天/八小时）
            paidAt: PayUtils.fmtDateTime(new Date()),
            tradeNo: PAY._mockState[outTradeNo + ':trade'] || ('TRDDEMO' + Date.now().toString(36).toUpperCase()),
            channel: '支付宝（演示收银台）'
          }
        };
      }
      if (st === 'CLOSED') return { ok: true, status: 'CLOSED' };
      return { ok: true, status: 'WAIT' };
    }
    if (!a.base) return { ok: false, status: 'WAIT', message: '通道未配置' };
    try {
      var r = await this._fetch(a.base + '/api/pay/query?no=' + encodeURIComponent(outTradeNo), {}, a.def.timeout);
      var d = await r.json();
      return { ok: !!d.ok, status: d.status || 'WAIT', receipt: d.receipt || null, message: d.message };
    } catch (e) {
      return { ok: false, status: 'WAIT', message: '查询失败（网关不可达）' };
    }
  },

  /**
   * 请求网关服务端验签（演示「验签在服务端完成」的边界）
   * @returns {ok, verified, note}
   */
  async verifyReceipt(outTradeNo) {
    var a = this.active();
    if (a.mode === 'mock') {
      return { ok: true, verified: true, note: '演示模式：浏览器内闭环，无外部网关参与，无资金流动' };
    }
    if (!a.base) return { ok: false, verified: false, note: '通道未配置' };
    try {
      var r = await this._fetch(a.base + '/api/pay/verify?no=' + encodeURIComponent(outTradeNo), {}, a.def.timeout);
      var d = await r.json();
      return { ok: !!d.ok, verified: !!d.verified, note: d.note || '' };
    } catch (e) {
      return { ok: false, verified: false, note: '验签请求失败' };
    }
  },

  /**
   * 演示辅助：驱动一次「支付结果」
   * mock 模式：置内存状态；local 模式：调 pay_server 的 /api/pay/mockpay（演练异步回调）
   */
  async mockPay(outTradeNo, result) {
    var a = this.active();
    if (a.mode === 'mock') {
      if (result === 'fail') return { ok: true, simulated: 'fail' };
      PAY._mockState[outTradeNo] = 'PAID';
      PAY._mockState[outTradeNo + ':trade'] = 'TRDDEMO' + Date.now().toString(36).toUpperCase();
      return { ok: true, simulated: 'paid' };
    }
    if (a.mode === 'local' && a.base) {
      try {
        var r = await this._fetch(a.base + '/api/pay/mockpay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ no: outTradeNo, result: result || 'paid' })
        }, 5000);
        return await r.json();
      } catch (e) { return { ok: false, message: '网关不可达' }; }
    }
    return { ok: false, message: '当前通道不支持模拟支付' };
  },

  /** mock 模式内存态（刷新即清零，演示语义：模拟支付不落库） */
  _mockState: {},

  /* ---------------- 演示二维码渲染（伪二维码，带「演示」水印） ---------------- */

  drawQr: function (canvas, payload) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, W);

    // 稳定伪随机：同一订单号每次画出的码一致（答辩可复现）
    var seed = 0;
    for (var i = 0; i < payload.length; i++) { seed = (seed * 131 + payload.charCodeAt(i)) >>> 0; }
    var rand = function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    var n = 25, quiet = 2;
    var cell = Math.floor(W / (n + quiet * 2));
    var ox = Math.floor((W - cell * n) / 2), oy = ox;
    var grid = [];
    for (var y = 0; y < n; y++) { grid.push([]); for (var x = 0; x < n; x++) grid[y].push(false); }
    for (var y2 = 0; y2 < n; y2++) for (var x2 = 0; x2 < n; x2++) grid[y2][x2] = rand() < 0.47;

    // 定位角（7×7 回字）覆盖三隅
    function finder(cx, cy) {
      for (var y = -1; y < 8; y++) for (var x = -1; x < 8; x++) {
        var gy = cy + y, gx = cx + x;
        if (gy < 0 || gx < 0 || gy >= n || gx >= n) continue;
        var inBorder = (y >= 0 && y <= 6 && (x === 0 || x === 6)) || (x >= 0 && x <= 6 && (y === 0 || y === 6));
        var inCore = y >= 2 && y <= 4 && x >= 2 && x <= 4;
        grid[gy][gx] = (inBorder || inCore) && !(y >= 1 && y <= 5 && x >= 1 && x <= 5 && !inCore);
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);

    // 时序线（第 6 行/列黑白交替）
    for (var t = 8; t < n - 8; t++) { grid[6][t] = t % 2 === 0; grid[t][6] = t % 2 === 0; }

    ctx.fillStyle = '#1a1a1a';
    for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) {
      if (grid[yy][xx]) ctx.fillRect(ox + xx * cell, oy + yy * cell, cell, cell);
    }

    // 「演示」斜排水印：明确本码非真实收款码
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-Math.PI / 9);
    ctx.fillStyle = 'rgba(29,93,216,0.16)';
    ctx.font = 'bold ' + Math.floor(W / 9) + 'px "SimHei","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('演示二维码', 0, 0);
    ctx.restore();
  }
};
