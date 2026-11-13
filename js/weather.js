/* =====================================================
 * 每日天气（武汉 · 晴川学院）
 * - 数据源：Open-Meteo 公开接口（免 API Key、支持跨域，file:// 下亦可请求）
 * - 30 分钟本地缓存，避免频繁请求
 * - 断网 / 接口异常时静默隐藏，不影响系统任何功能
 * - 天气图标沿用「单字印章」语言（晴/云/阴/雾/雨/雪/雷），不使用 emoji
 * ===================================================== */

const Weather = {
  CACHE_KEY: 'cms_weather_cache',
  CACHE_MS: 30 * 60 * 1000,
  LAT: 30.59,          // 武汉（江夏）
  LON: 114.31,
  PLACE: '武汉',

  /** WMO 天气代码 → 中文描述 + 单字印章 */
  _map: [
    { codes: [0], text: '晴', seal: '晴' },
    { codes: [1], text: '晴间多云', seal: '晴' },
    { codes: [2], text: '多云', seal: '云' },
    { codes: [3], text: '阴', seal: '阴' },
    { codes: [45, 48], text: '雾', seal: '雾' },
    { codes: [51, 53, 55, 56, 57], text: '毛毛雨', seal: '雨' },
    { codes: [61, 63, 65, 66, 67, 80, 81, 82], text: '雨', seal: '雨' },
    { codes: [71, 73, 75, 77, 85, 86], text: '雪', seal: '雪' },
    { codes: [95, 96, 99], text: '雷阵雨', seal: '雷' }
  ],

  /** 天气代码 → { text, seal } */
  describe(code) {
    for (var i = 0; i < this._map.length; i++) {
      if (this._map[i].codes.indexOf(Number(code)) !== -1) {
        return { text: this._map[i].text, seal: this._map[i].seal };
      }
    }
    return { text: '—', seal: '云' };
  },

  /** 取天气数据：优先缓存，过期则请求；失败返回 null */
  async load() {
    var cached = Store.read(this.CACHE_KEY, null);
    if (cached && (Date.now() - cached.ts) < this.CACHE_MS) return cached.data;
    try {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + this.LAT + '&longitude=' + this.LON +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
        '&timezone=Asia%2FShanghai&forecast_days=1';
      var res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      var c = json.current || {};
      var d = json.daily || {};
      var data = {
        temp: c.temperature_2m,
        feels: c.apparent_temperature,
        hum: c.relative_humidity_2m,
        wind: c.wind_speed_10m,
        code: c.weather_code,
        tmax: (d.temperature_2m_max || [])[0],
        tmin: (d.temperature_2m_min || [])[0],
        obsTime: String(c.time || '').replace('T', ' ').slice(5, 16)
      };
      Store.write(this.CACHE_KEY, { ts: Date.now(), data: data });
      return data;
    } catch (e) {
      // 接口不可用（离线/被墙）：已过期的缓存也拿来兜底，实在没有就返回 null
      return cached ? cached.data : null;
    }
  },

  /** 渲染天气条到指定容器；无数据时容器保持隐藏 */
  async render(el) {
    if (!el) return;
    var data = await this.load();
    if (!data) { el.style.display = 'none'; return; }
    var w = this.describe(data.code);
    el.innerHTML =
      '<div class="weather-bar">' +
        '<span class="weather-seal" title="' + Utils.escapeHtml(w.text) + '">' + w.seal + '</span>' +
        '<div class="weather-main">' +
          '<b>' + this.PLACE + ' · ' + w.text + '</b>' +
          '<span>' + Utils.escapeHtml(String(data.tmin)) + ' ~ ' + Utils.escapeHtml(String(data.tmax)) + ' ℃' +
            '（当前 ' + Utils.escapeHtml(String(data.temp)) + ' ℃，体感 ' + Utils.escapeHtml(String(data.feels)) + ' ℃）</span>' +
        '</div>' +
        '<span class="chip">湿度 <b>' + Utils.escapeHtml(String(data.hum)) + '%</b></span>' +
        '<span class="chip">风速 <b>' + Utils.escapeHtml(String(data.wind)) + ' m/s</b></span>' +
        '<small class="weather-src">观测 ' + Utils.escapeHtml(data.obsTime || '') + ' · Open-Meteo 公开数据（免密钥）</small>' +
      '</div>';
    el.style.display = '';
  }
};
