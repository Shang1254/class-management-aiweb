/* =====================================================
 * 通用工具函数（全局对象：Utils / Toast / $ / $$）
 * ===================================================== */

/** 简写选择器：返回单个元素 */
function $(sel, root) { return (root || document).querySelector(sel); }
/** 简写选择器：返回元素数组 */
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

const Utils = {
  /** 生成唯一 ID */
  uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  },

  /** HTML 转义，防止 XSS */
  escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  },

  /** 格式化 Date 为本地日期字符串 YYYY-MM-DD */
  formatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  },

  /** 今天的日期字符串 YYYY-MM-DD */
  today() { return Utils.formatDate(new Date()); },

  /** 相对今天偏移 days 天的日期字符串（days 为正表示过去，负表示未来） */
  daysAgo(days) {
    var d = new Date();
    d.setDate(d.getDate() - days);
    return Utils.formatDate(d);
  },

  /**
   * 复制文本到剪贴板（兼容 file:// 与 http(s)：优先 Clipboard API，
   * 不可用时回退到临时 textarea + execCommand）
   */
  copyText(text) {
    var s = String(text == null ? '' : text);
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) Toast.success('已复制到剪贴板');
        else Toast.warning('复制失败，请手动选中文本复制');
      } catch (e) {
        Toast.warning('复制失败，请手动选中文本复制');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(function () {
        Toast.success('已复制到剪贴板');
      }).catch(fallback);
    } else {
      fallback();
    }
  },

  /** 当前时间字符串 YYYY-MM-DD HH:mm */
  nowStr() {
    var d = new Date();
    return Utils.formatDate(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },

  /** 中国大陆手机号校验（11 位，1 开头第二位 3-9） */
  isPhone(v) { return /^1[3-9]\d{9}$/.test(String(v || '').trim()); },

  /** 防抖：输入搜索等场景使用 */
  debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
    };
  },

  /** 平均分等保留 1 位小数 */
  round1(n) { return Math.round(n * 10) / 10; },

  /**
   * 导出 CSV 文件（带 UTF-8 BOM，防止 Excel 打开中文乱码）
   * @param {string} filename 下载文件名
   * @param {string[]} headers 表头数组
   * @param {Array<Array>} rows 数据二维数组
   */
  exportCSV(filename, headers, rows) {
    // 单元格转义：包含逗号/引号/换行时用双引号包裹
    function cell(v) {
      v = String(v === null || v === undefined ? '' : v);
      if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    }
    var lines = [headers.map(cell).join(',')].concat(
      (rows || []).map(function (r) { return r.map(cell).join(','); })
    );
    // \uFEFF 即 UTF-8 BOM
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  },

  /**
   * 生成简单下拉选项 HTML（选项值与文字相同）
   * @param {string[]} values 选项值数组
   * @param {string} selected 选中值
   * @param {string} [placeholder] 首个占位选项（value 为空字符串）
   */
  simpleOptions(values, selected, placeholder) {
    var html = placeholder !== undefined
      ? '<option value="">' + Utils.escapeHtml(placeholder) + '</option>' : '';
    (values || []).forEach(function (v) {
      html += '<option value="' + Utils.escapeHtml(v) + '"' + (v === selected ? ' selected' : '') + '>' + Utils.escapeHtml(v) + '</option>';
    });
    return html;
  },

  /**
   * SHA-256 摘要（Web Crypto API，file:// 属于安全上下文可用）
   * 用于密码加密存储：数据库中只保存 64 位十六进制摘要，不保存明文
   * @returns {Promise<string>} 64 位十六进制字符串
   */
  async sha256(text) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  },

  /** 判断是否为 SHA-256 十六进制摘要（用于兼容新旧密码格式） */
  isSha256Hex(v) { return /^[0-9a-f]{64}$/i.test(String(v || '')); },

  /**
   * 自动识别分隔符：制表符（Excel 复制粘贴）/ 英文逗号 / 分号 / 中文逗号
   * 顺序优先：制表符 > 逗号 > 分号 > 中文逗号（中文逗号常见于地址文本，故最后兜底）
   */
  detectDelimiter(text) {
    var lines = String(text || '').split(/\r\n|\n|\r/).filter(function (l) { return l.trim(); }).slice(0, 5);
    if (!lines.length) return ',';
    var count = function (d) {
      var n = 0;
      lines.forEach(function (l) {
        var inQ = false;
        for (var i = 0; i < l.length; i++) {
          var ch = l[i];
          if (ch === '"') inQ = !inQ;
          else if (!inQ && ch === d) n++;
        }
      });
      return n;
    };
    var cands = ['\t', ',', ';', '，'];
    for (var i = 0; i < cands.length; i++) {
      if (count(cands[i]) > 0) return cands[i];
    }
    return ',';
  },

  /**
   * 解析分隔文本为二维数组（支持引号包裹、转义引号、\r\n 换行、BOM；
   * 分隔符自动识别，兼容 Excel 复制粘贴的制表符文本）
   * @returns {string[][]}
   */
  parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var delim = Utils.detectDelimiter(text);
    var rows = [], row = [], cell = '', inQuote = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuote) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } // "" 转义为 "
          else inQuote = false;
        } else cell += ch;
      } else if (ch === '"') inQuote = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row); // 跳过空行
        row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
    }
    return rows;
  },

  /**
   * 读取 Excel/CSV 文件为二维数组（首页工作表）。
   * 依赖 js/vendor/xlsx.full.min.js（SheetJS，本地内置、离线可用）。
   * raw:false → 单元格按显示文本读取（日期等按格式化值），与“复制粘贴”的口径一致。
   * @param {File} file 用户选择的 .xlsx/.xls/.csv 文件
   * @returns {Promise<string[][]>} 行数组（首行通常是表头）
   */
  readSheetFile(file) {
    return new Promise(function (resolve, reject) {
      if (typeof XLSX === 'undefined') {
        reject(new Error('Excel 解析组件未加载：请改用「复制粘贴」方式，或检查 js/vendor/xlsx.full.min.js 是否存在'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(e.target.result, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
            .map(function (r) { return r.map(function (c) { return String(c == null ? '' : c).trim(); }); })
            .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
          resolve(rows);
        } catch (err) {
          reject(new Error('文件解析失败：' + (err && err.message ? err.message : '不是有效的 Excel/CSV 文件')));
        }
      };
      reader.onerror = function () { reject(new Error('文件读取失败，请重试')); };
      reader.readAsArrayBuffer(file);
    });
  },

  /** 二维数组 → TSV 文本（供粘贴式解析器复用：与“从 Excel 复制”得到的格式一致） */
  rowsToTSV(rows) {
    return (rows || []).map(function (r) { return r.join('\t'); }).join('\n');
  },

  /** base64 字符串 → Uint8Array（PNG 等二进制下载专用，纯文本不要走这里） */
  base64ToBytes(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },

  /**
   * 下载文件（JSON 备份 / CSV 模板 / PNG 报告等）
   * - 文本类：前置 UTF-8 BOM，避免 Excel 打开中文 CSV 乱码
   * - 二进制类：content 传 base64 字符串，按字节写入（加了 BOM 图片就打不开）
   * @param {string} filename 文件名
   * @param {string} content 文本内容，或二进制内容的 base64 字符串
   * @param {string} mime MIME 类型，默认 text/plain
   */
  downloadFile(filename, content, mime) {
    var type = mime || 'text/plain';
    // 只有文本类才加 BOM/charset；二进制（image/png 等）必须按字节原样写入
    var isText = /^(text\/|application\/(json|csv|xml|javascript))/i.test(type);
    var blob = isText
      ? new Blob(['\uFEFF' + content], { type: type + ';charset=utf-8;' })
      : new Blob([this.base64ToBytes(content)], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  },

  /** 读取用户选择的本地文本文件（File 对象 → 字符串） */
  readFileText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('文件读取失败')); };
      reader.readAsText(file, 'utf-8');
    });
  },

  /** 校验日期格式 YYYY-MM-DD 且为合法日期 */
  isDateStr(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return false;
    var d = new Date(v + 'T00:00:00');
    return !isNaN(d.getTime());
  }
};

/* =====================================================
 * 统计数字滚动动画（无侵入实现）
 * 通过 MutationObserver 监听 .stat-value[data-count]，
 * 元素渲染后数字从 0 平滑滚动到目标值，页面代码无需任何改动
 * ===================================================== */
(function () {
  function animate(el) {
    if (el.dataset.animated) return; // 防止重复动画
    el.dataset.animated = '1';
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var decimals = (String(el.dataset.count).split('.')[1] || '').length;
    var start = null, DURATION = 650;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / DURATION);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      var val = (target * eased).toFixed(decimals);
      el.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('.stat-value[data-count]')) animate(node);
        if (node.querySelectorAll) {
          Array.prototype.forEach.call(node.querySelectorAll('.stat-value[data-count]'), animate);
        }
      });
    });
  });

  window.addEventListener('DOMContentLoaded', function () {
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();

/** Toast 轻提示：操作成功 / 失败 / 警告 / 提示 */
const Toast = {
  show(msg, type) {
    type = type || 'success';
    var container = $('#toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    // 与整体「字形化」设计统一：用简洁字形而非 emoji 作提示符号
    var icons = { success: '✓', error: '✕', warning: '！', info: 'i' };
    el.innerHTML = '<span class="toast-icon">' + (icons[type] || '') + '</span><span>' + Utils.escapeHtml(msg) + '</span>';
    container.appendChild(el);
    // 延时添加 show 类触发滑入（与弹窗同理，避开后台标签页 rAF 节流）
    setTimeout(function () { el.classList.add('show'); }, 20);
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 2200);
  },
  success(m) { Toast.show(m, 'success'); },
  error(m) { Toast.show(m, 'error'); },
  warning(m) { Toast.show(m, 'warning'); },
  info(m) { Toast.show(m, 'info'); }
};
