/* =====================================================
 * 中国日历引擎（自包含 · 零 API · 无外部依赖）
 * - 公历 ⇄ 农历互转（基于 1900-2100 标准农历数据表）
 * - 二十四节气（经典天文近似算法）
 * - 法定节假日 / 调休上班（数据表可按国务院通知维护）
 * - 工作日计算（排除周末与法定节假日，计入调休上班日）
 * 说明：节假日安排每年由国务院办公厅发文，HOLIDAYS 表中
 *       2025 为正式安排；2026 为预填（请以学校通知为准，改表即可）。
 * ===================================================== */

const CnCalendar = (function () {
  /* 农历数据表（1900-2100），每年 1 个十六进制数：
   * 低 4 位=闰月月份(0 无闰月)，0x10000 位=闰月大小(1=30天)，
   * 其余 12 位对应正月~腊月大小(1=30天) */
  var lunarInfo = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
    0x0d520 // 2100
  ];

  var lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  var lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  var termNames = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
    '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];
  var gan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var zhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var zodiacs = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

  /**
   * 法定节假日与调休表（格式：'YYYY-MM-DD': '休:名称' 或 '班:调休'）
   * 2025 为国务院办公厅正式安排；2026 为常规预填（节假日日期由农历推算，
   * 调休细节请以国办最新通知为准——直接修改本表即可，无需改代码）
   */
  var HOLIDAYS = {
    // ---- 2025 年（正式安排） ----
    '2025-01-01': '休:元旦',
    '2025-01-28': '休:春节', '2025-01-29': '休:春节', '2025-01-30': '休:春节', '2025-01-31': '休:春节',
    '2025-02-01': '休:春节', '2025-02-02': '休:春节', '2025-02-03': '休:春节', '2025-02-04': '休:春节',
    '2025-01-26': '班:春节调休', '2025-02-08': '班:春节调休',
    '2025-04-04': '休:清明节', '2025-04-05': '休:清明节', '2025-04-06': '休:清明节',
    '2025-05-01': '休:劳动节', '2025-05-02': '休:劳动节', '2025-05-03': '休:劳动节',
    '2025-05-04': '休:劳动节', '2025-05-05': '休:劳动节', '2025-04-27': '班:劳动节调休',
    '2025-05-31': '休:端午节', '2025-06-01': '休:端午节', '2025-06-02': '休:端午节',
    '2025-10-01': '休:国庆节', '2025-10-02': '休:国庆节', '2025-10-03': '休:国庆节',
    '2025-10-04': '休:国庆节', '2025-10-05': '休:国庆节', '2025-10-06': '休:国庆中秋',
    '2025-10-07': '休:国庆节', '2025-10-08': '休:国庆节',
    '2025-09-28': '班:国庆调休', '2025-10-11': '班:国庆调休',
    // ---- 2026 年（预填，调休以国办通知为准） ----
    '2026-01-01': '休:元旦',
    '2026-02-16': '休:春节', '2026-02-17': '休:春节', '2026-02-18': '休:春节', '2026-02-19': '休:春节',
    '2026-02-20': '休:春节', '2026-02-21': '休:春节', '2026-02-22': '休:春节',
    '2026-04-04': '休:清明节', '2026-04-05': '休:清明节', '2026-04-06': '休:清明节',
    '2026-05-01': '休:劳动节', '2026-05-02': '休:劳动节', '2026-05-03': '休:劳动节',
    '2026-05-04': '休:劳动节', '2026-05-05': '休:劳动节',
    '2026-06-19': '休:端午节', '2026-06-20': '休:端午节', '2026-06-21': '休:端午节',
    '2026-09-25': '休:中秋节', '2026-09-26': '休:中秋节', '2026-09-27': '休:中秋节',
    '2026-10-01': '休:国庆节', '2026-10-02': '休:国庆节', '2026-10-03': '休:国庆节',
    '2026-10-04': '休:国庆节', '2026-10-05': '休:国庆节', '2026-10-06': '休:国庆节', '2026-10-07': '休:国庆节'
  };

  /* ---------------- 农历核心计算 ---------------- */

  /** 某农历年闰月月份（0 表示无闰月） */
  function leapMonth(y) { return lunarInfo[y - 1900] & 0xf; }
  /** 某农历年闰月天数（0 表示无闰月） */
  function leapDays(y) { return leapMonth(y) ? ((lunarInfo[y - 1900] & 0x10000) ? 30 : 29) : 0; }
  /** 某农历年某月天数（1-12，不区分闰月） */
  function monthDays(y, m) { return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
  /** 某农历年总天数 */
  function lYearDays(y) {
    var sum = 348;
    for (var i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
    return sum + leapDays(y);
  }

  /** 公历日期 → 农历 { ly, lm, ld, isLeap, monthName, dayName, text } */
  function solar2lunar(y, m, d) {
    if (y < 1900 || y > 2100) return null;
    var offset = (Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000;
    var i, temp = 0;
    for (i = 1900; i < 2101 && offset > 0; i++) { temp = lYearDays(i); offset -= temp; }
    if (offset < 0) { offset += temp; i--; }
    var ly = i;
    var leap = leapMonth(ly), isLeap = false;
    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === leap + 1 && !isLeap) { --i; isLeap = true; temp = leapDays(ly); }
      else { temp = monthDays(ly, i); }
      if (isLeap && i === leap + 1) isLeap = false;
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) { isLeap = false; } else { isLeap = true; --i; }
    }
    if (offset < 0) { offset += temp; --i; }
    var lm = i, ld = offset + 1;
    return {
      ly: ly, lm: lm, ld: ld, isLeap: isLeap,
      monthName: (isLeap ? '闰' : '') + lunarMonths[lm - 1],
      dayName: lunarDays[ld - 1],
      text: (isLeap ? '闰' : '') + lunarMonths[lm - 1] + lunarDays[ld - 1]
    };
  }

  /* ---------------- 二十四节气 ---------------- */

  /* 节气分钟偏移表（经典算法，1900-2100 适用，个别年份误差 ≤1 天） */
  var sTermInfo = [0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693,
    263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758];

  /** 某年某节气（0=小寒 …… 23=冬至）所在的公历日 */
  function termDay(y, n) {
    var offDate = new Date((31556925974.7 * (y - 1900) + sTermInfo[n] * 60000) + Date.UTC(1900, 0, 6, 2, 5));
    return offDate.getUTCDate();
  }

  /** 公历日期当天的节气名（不是节气日返回 ''） */
  function solarTerm(y, m, d) {
    var n1 = (m - 1) * 2, n2 = n1 + 1;
    if (termDay(y, n1) === d) return termNames[n1];
    if (termDay(y, n2) === d) return termNames[n2];
    return '';
  }

  /* ---------------- 干支 / 生肖 ---------------- */

  function ganZhi(ly) {
    var idx = (ly - 4) % 60;
    return gan[idx % 10] + zhi[idx % 12];
  }
  function zodiac(ly) { return zodiacs[(ly - 4) % 12]; }

  /* ---------------- 节假日与工作日 ---------------- */

  /** 格式化 YYYY-MM-DD */
  function fmt(y, m, d) {
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  /** 解析 YYYY-MM-DD */
  function parse(dateStr) {
    var p = String(dateStr || '').split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }

  /**
   * 查询某日的节假日信息
   * @returns { type: 'holiday'|'workday'|'', name: '' }（workday 指调休上班日）
   */
  function holiday(dateStr) {
    var v = HOLIDAYS[dateStr];
    if (!v) return { type: '', name: '' };
    var parts = v.split(':');
    return { type: parts[0] === '休' ? 'holiday' : 'workday', name: parts[1] || '' };
  }

  /** 是否工作日：周一至周五且非法定节假日；调休上班日（周末）算工作日 */
  function isWorkday(dateStr) {
    var h = holiday(dateStr);
    if (h.type === 'holiday') return false;
    if (h.type === 'workday') return true;
    var p = parse(dateStr);
    var wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    return wd !== 0 && wd !== 6;
  }

  /** 区间内工作日数量（含首尾） */
  function workdaysBetween(startStr, endStr) {
    var s = parse(startStr), e = parse(endStr);
    var cur = Date.UTC(s.y, s.m - 1, s.d), end = Date.UTC(e.y, e.m - 1, e.d);
    if (cur > end) return 0;
    var count = 0;
    var guard = 0;
    while (cur <= end && guard++ < 1000) {
      var dt = new Date(cur);
      var ds = fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      if (isWorkday(ds)) count++;
      cur += 86400000;
    }
    return count;
  }

  /** 把 HOLIDAYS 中的「休」合并成连续假期区间：[{name, start, end, total}] */
  function holidayPeriods() {
    var days = Object.keys(HOLIDAYS).filter(function (k) { return HOLIDAYS[k].indexOf('休:') === 0; }).sort();
    var periods = [];
    var cur = null;
    days.forEach(function (ds) {
      var name = HOLIDAYS[ds].split(':')[1];
      if (cur && (Date.UTC.apply(null, [parse(ds).y, parse(ds).m - 1, parse(ds).d]) -
                  Date.UTC.apply(null, [parse(cur.end).y, parse(cur.end).m - 1, parse(cur.end).d])) === 86400000 * (cur.total)) {
        // 与前一日连续：并入当前假期
        cur.end = ds; cur.total++;
      } else if (cur && Date.UTC.apply(null, [parse(ds).y, parse(ds).m - 1, parse(ds).d]) ===
                 Date.UTC.apply(null, [parse(cur.end).y, parse(cur.end).m - 1, parse(cur.end).d]) + 86400000) {
        cur.end = ds; cur.total++;
      } else {
        cur = { name: name, start: ds, end: ds, total: 1 };
        periods.push(cur);
      }
    });
    return periods;
  }

  /**
   * 某日的完整日历信息（供界面展示）
   * @returns { lunar, term, holiday, isWorkday, period: { current: {name, dayIndex, total}|null, next: {name, date, daysUntil}|null } }
   */
  function info(dateStr) {
    var p = parse(dateStr);
    var lunar = solar2lunar(p.y, p.m, p.d);
    var term = solarTerm(p.y, p.m, p.d);
    var h = holiday(dateStr);
    // 当前假期 / 下一个假期
    var periods = holidayPeriods();
    var current = null, next = null;
    var todayUtc = Date.UTC(p.y, p.m - 1, p.d);
    periods.forEach(function (pd) {
      var s = Date.UTC.apply(null, [parse(pd.start).y, parse(pd.start).m - 1, parse(pd.start).d]);
      var e = Date.UTC.apply(null, [parse(pd.end).y, parse(pd.end).m - 1, parse(pd.end).d]);
      if (todayUtc >= s && todayUtc <= e) {
        current = { name: pd.name, dayIndex: Math.round((todayUtc - s) / 86400000) + 1, total: pd.total };
      } else if (s > todayUtc && !next) {
        next = { name: pd.name, date: pd.start, daysUntil: Math.round((s - todayUtc) / 86400000) };
      }
    });
    return {
      lunar: lunar, term: term, holiday: h,
      isWorkday: isWorkday(dateStr),
      period: { current: current, next: next },
      nextHoliday: next // 兼容旧字段
    };
  }

  /** 顶部一行式文案：'农历八月廿三 · 秋分 · 国庆假期' */
  function lineText(dateStr) {
    var it = info(dateStr);
    var parts = [];
    if (it.lunar) parts.push('农历' + it.lunar.text);
    if (it.term) parts.push(it.term);
    if (it.holiday.type === 'holiday') parts.push(it.holiday.name + '假期');
    else if (it.holiday.type === 'workday') parts.push(it.holiday.name + '（上班）');
    return parts.join(' · ');
  }

  return {
    solar2lunar: solar2lunar,
    solarTerm: solarTerm,
    holiday: holiday,
    isWorkday: isWorkday,
    workdaysBetween: workdaysBetween,
    ganZhi: ganZhi,
    zodiac: zodiac,
    info: info,
    lineText: lineText,
    HOLIDAYS: HOLIDAYS
  };
})();
