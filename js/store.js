/* =====================================================
 * 数据层：localStorage 封装 + 示例数据初始化 + 结构迁移
 * 所有数据以 JSON 存储在 localStorage，key 统一前缀 cms_
 * 实体：users / classes / students / scores / attendance /
 *       notices / leaves(请假申请) / noticeReads(通知已读回执)
 * 数据结构版本：v2（学生类型 / 教师多班级 / 学期维度）
 * ===================================================== */

const Store = {
  KEYS: {
    users: 'cms_users',
    classes: 'cms_classes',
    students: 'cms_students',
    scores: 'cms_scores',
    attendance: 'cms_attendance',
    notices: 'cms_notices',
    leaves: 'cms_leaves',
    signins: 'cms_signins',
    assignments: 'cms_assignments',
    submissions: 'cms_submissions',
    quizzes: 'cms_quizzes',
    quizAttempts: 'cms_quiz_attempts',
    competitions: 'cms_competitions',
    scholarships: 'cms_scholarships',
    downloads: 'cms_downloads',
    evaluations: 'cms_evaluations',
    healthReports: 'cms_health_reports',
    timetable: 'cms_timetable',
    noticeReads: 'cms_notice_reads',
    session: 'cms_session',
    meta: 'cms_meta',
    logs: 'cms_logs',
    loginFails: 'cms_login_fails'
  },

  /** 竞赛级别与获奖等级（学科竞赛管理用） */
  COMP_LEVELS: ['校级', '市级', '省级', '国家级'],
  COMP_AWARDS: ['特等奖', '一等奖', '二等奖', '三等奖', '优秀奖', '参与奖'],

  /** 健康日报：填报状态枚举与异常阈值（体温超过 37.3 视为异常） */
  HEALTH_STATUS: ['健康', '发热', '咳嗽', '其他不适'],
  HEALTH_TEMP_MAX: 37.3,

  /** 课表：节次与星期（与教务系统导出口径一致：上午1-4节 / 下午5-8节 / 晚上9-12节） */
  PERIODS: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  PERIOD_GROUPS: [
    { label: '上午', from: 1, to: 4 },
    { label: '下午', from: 5, to: 8 },
    { label: '晚上', from: 9, to: 12 }
  ],
  WEEKDAYS: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],

  /** "123456" 的 SHA-256 摘要（示例数据使用，避免明文存储密码） */
  HASH_123456: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',

  /* ---------------- 业务枚举（按真实教务口径建模） ---------------- */

  /** 培养层次 */
  EDU_LEVELS: ['本科', '专科'],
  /**
   * 招生类别（入学方式）：
   * - 普通高考：统招，全日制（含本科与专科/高职）
   * - 专升本：统招，全日制，专科起点进入本科学习（属统招范畴）
   * - 自考助学：高等教育自学考试助学班，非全日制，不属于统招
   */
  ENROLL_TYPES: ['普通高考', '专升本', '自考助学'],
  /** 学习形式：全日制 / 非全日制（自考助学班为非全日制） */
  STUDY_FORMS: ['全日制', '非全日制'],
  /** 教师编制类型：校内专任 / 校外聘请 */
  TEACHER_TYPES: ['专任', '外聘'],
  /** 教师岗位：任课教师 / 辅导员（辅导员负责学生日常与健康日报、校外动向） */
  TEACHER_POSTS: ['教师', '辅导员'],
  /** 教师职称（教学/工程序列） */
  TEACHER_TITLES: ['助教', '讲师', '工程师', '副教授', '教授'],
  /** 通知频道：辅导员通知（学工/学校事务，由辅导员传达） / 教师通知（教学事务，任课教师发布） */
  NOTICE_CHANNELS: ['辅导员通知', '教师通知'],

  /**
   * 奖助体系（依据学校学生工作处公开文件与教育部标准整理）：
   * 国家奖学金 10000 元/年（专科生同标准）；国家励志奖学金 6000 元/年；
   * 国家助学金分档发放（平均约 3700 元/年）；晴川奖学金甲乙丙三等 3000/2000/1000；
   * 晴川助学金甲乙两等 1500/1000
   */
  SCHOLARSHIP_LEVELS: ['国家级', '校级'],
  SCHOLARSHIP_STATUS: ['评审中', '已公示', '已发放'],
  SCHOLARSHIP_TYPES: [
    '国家奖学金', '国家励志奖学金', '国家助学金',
    '晴川奖学金（甲等）', '晴川奖学金（乙等）', '晴川奖学金（丙等）',
    '晴川助学金（甲等）', '晴川助学金（乙等）'
  ],

  /** 招生类别 → 学习形式 默认联动 */
  enrollForm(type) { return type === '自考助学' ? '非全日制' : '全日制'; },

  /* ---------------- 学年学期工具 ---------------- */

  /**
   * 由日期推算所属学年学期（学期编码：如 2026-2027-1）
   * 规则：8 月及以后属「Y—Y+1 学年第 1 学期」；2—7 月为第 2 学期；1 月为上学年第 1 学期
   */
  termOfDate(dateStr) {
    var d = String(dateStr || '');
    var y = parseInt(d.slice(0, 4), 10);
    var m = parseInt(d.slice(5, 7), 10);
    if (!y || !m) return '';
    if (m >= 8) return y + '-' + (y + 1) + '-1';
    if (m >= 2) return (y - 1) + '-' + y + '-2';
    return (y - 1) + '-' + y + '-1';
  },

  /** 学期编码 → 中文名（2026-2027-1 → 2026-2027学年第一学期；学年与学期连写，与学校教务口径一致） */
  termText(term) {
    // 学年合计口径（如 '2025-2026'）：显示为「2025-2026学年」——
    // 不单独处理的话页面上会露出「未知学期」（辅导员端综测页的 chip 实测踩到）
    if (/^\d{4}-\d{4}$/.test(String(term || ''))) return String(term) + '学年';
    var p = String(term || '').split('-');
    if (p.length !== 3) return '未知学期';
    // 与学校教务口径一致：学年与学期**连写**（2026-2027学年第一学期），半角连字符、学年后不留空格
    return p[0] + '-' + p[1] + '学年' + (p[2] === '1' ? '第一学期' : '第二学期');
  },

  /**
   * 统一的学期/学年匹配（全站筛选入口，替代各页面自己写 === 比较）
   * filter 取值：'' 或 'all' = 全部；'2025-2026' = 该**学年**（含其下所有学期）；'2025-2026-1' = 单个学期
   */
  termMatch(recTerm, filter) {
    if (!filter || filter === 'all') return true;
    var t = String(recTerm || '');
    if (!t) return false;
    if (t === filter) return true;
    if (/^\d{4}-\d{4}$/.test(filter)) return t.indexOf(filter) === 0;   // 学年筛选
    return false;
  },

  /** 当前日期所属学期 */
  currentTerm() { return this.termOfDate(Utils.today()); },

  /**
   * 按入学届别计算学期序号：如 2025级 在 2026-2027-1 → 3（第三学期）
   * @param grade  '2025级' 或 2025
   * @param term   '2026-2027-1'
   * @returns 序号（1 起）；无法推算返回 0
   */
  termSeq(grade, term) {
    var gy = parseInt(String(grade || '').replace(/\D/g, ''), 10);
    var m = String(term || '').match(/^(\d{4})-(\d{4})-([12])$/);
    if (!gy || !m) return 0;
    var seq = (+m[1] - gy) * 2 + (+m[3]);
    return (seq >= 1 && seq <= 20) ? seq : 0;
  },

  /** 数字 → 中文（1-20，用于第X学期） */
  numToCn(n) {
    var cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
      '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
    return cn[n - 1] || String(n);
  },

  /* ---------------- 学制与届别（按武汉晴川学院官方口径） ----------------
   * 学校用法：首页用「2026级新生」记入学年；学工处通知用「2026届毕业生」记毕业年。
   * 学制：本科四年、专科三年、专升本（本科段）两年 —— 届 = 入学年 + 学制。
   * 专升本学生与「入学年 - 2」的本科年级同届毕业（2025 入学专升本 ↔ 2023 级本科，均 2027 届）。
   */
  PROGRAM_YEARS: { '本科': 4, '专科': 3, '专升本': 2 },

  /** 培养项目：'专升本' | '本科' | '专科' */
  programOf(entity) {
    if (!entity) return '本科';
    if (entity.enrollType === '专升本') return '专升本';
    var cls = entity.classId ? this.getClass(entity.classId) : null;
    if (cls && cls.enrollType === '专升本') return '专升本';
    var edu = entity.eduLevel || (cls && cls.eduLevel);
    return edu === '专科' ? '专科' : '本科';
  },
  programYears(entity) { return this.PROGRAM_YEARS[this.programOf(entity)] || 4; },
  programYearsText(entity) {
    var y = this.programYears(entity);
    return ['〇', '一', '二', '三', '四', '五'][y] ? ['〇', '一', '二', '三', '四', '五'][y] + '年制' : y + '年制';
  },

  /** 入学年份：年级字段（2025级）→ 班级名/年级 → 学号前 4 位 */
  enrollYearOf(entity) {
    if (!entity) return 0;
    var m = String(entity.grade || '').match(/(\d{4})/);
    if (m) return +m[1];
    var cls = entity.classId ? this.getClass(entity.classId) : null;
    if (cls) {
      m = String(cls.grade || '').match(/(\d{4})/);
      if (m) return +m[1];
      m = String(cls.name || '').match(/(\d{4})/);
      if (m) return +m[1];
    }
    m = String(entity.name || '').match(/(\d{4})/);
    if (m) return +m[1];
    if (entity.studentNo) { m = String(entity.studentNo).match(/^(\d{4})/); if (m) return +m[1]; }
    return 0;
  },

  /** 毕业年份（届）= 入学年 + 学制 */
  gradYearOf(entity) {
    var y = this.enrollYearOf(entity);
    return y ? y + this.programYears(entity) : 0;
  },

  /** 专升本学生同届毕业的本科年级（2025 入学 ↔ 2023 级本科） */
  mergedEnrollYearOf(entity) {
    if (this.programOf(entity) !== '专升本') return 0;
    var y = this.enrollYearOf(entity);
    return y ? y - (4 - this.PROGRAM_YEARS['专升本']) : 0;
  },

  /**
   * 届别文案：2025级 · 专升本（二年制）· 2027届（与 2023 级本科同届毕业）
   * 本科：2023级 · 本科（四年制）· 2027届 ｜ 专科：2025级 · 专科（三年制）· 2028届
   */
  cohortText(entity) {
    var y = this.enrollYearOf(entity);
    if (!y) return '';
    var prog = this.programOf(entity);
    var txt = y + '级 · ' + prog + '（' + this.programYearsText(entity) + '）· ' + this.gradYearOf(entity) + '届';
    if (prog === '专升本') txt += '（与 ' + this.mergedEnrollYearOf(entity) + ' 级本科同届毕业）';
    return txt;
  },

  /* ---------------- 综合素质测评（辅导员/学生工作线口径） ----------------
   * 高校通行做法：总分 100 = 智育 60（学业成绩）+ 德育 20（考勤表现）+ 文体与附加 20（竞赛/社会工作，加减分封顶）
   * 数据全部来自系统已有记录：成绩、考勤、竞赛获奖 + 手工录入的加减分条目（cms_evaluations）
   */
  EVAL_RULES: {
    moral: { base: 20, absent: 2, late: 0.5 },     // 德育：基础 20 分，缺勤每次 -2、迟到每次 -0.5（不低于 0）
    study: { weight: 0.6 },                        // 智育：学期平均分 × 0.6（满分 60）
    extra: { cap: 20 },                            // 文体与附加：竞赛加分 + 手工加减分，封顶 20（不低于 0）
    // 竞赛加分：按竞赛级别 × 获奖等级（特等/一等/二等/三等/优秀/参与）
    compPoints: {
      '国家级': [8, 8, 6, 5, 3, 2],
      '省级': [5, 5, 4, 3, 2, 1],
      '市级': [3, 3, 2.5, 2, 1.5, 1],
      '校级': [2, 2, 1.5, 1, 1, 0.5]
    },
    awardIndex: function (award) {
      var a = String(award || '');
      if (a.indexOf('特等') !== -1) return 0;
      if (a.indexOf('一等') !== -1) return 1;
      if (a.indexOf('二等') !== -1) return 2;
      if (a.indexOf('三等') !== -1) return 3;
      if (a.indexOf('优秀') !== -1) return 4;
      return 5;
    }
  },

  /**
   * 计算某班级某学期的综合素质测评（返回按总分降序的数组，同分同名次）
   * @returns [{studentId, name, avg, study, moral, absent, late, compScore, manual, extra, total, rank, note}]
   */
  evalOf(classId, term) {
    var R = this.EVAL_RULES;
    var students = this.list('students').filter(function (s) { return s.classId === classId; });
    var termMatch = function (t) { return Store.termMatch(t, term); };
    var scores = this.list('scores').filter(function (s) { return s.classId === classId && termMatch(s.term || ''); });
    var att = this.list('attendance').filter(function (a) { return a.classId === classId && termMatch(a.term || ''); });
    var comps = this.list('competitions');
    var extras = this.list('evaluations').filter(function (e) { return e.classId === classId && termMatch(e.term || ''); });
    var out = students.map(function (stu) {
      // 智育
      var mine = scores.filter(function (s) { return s.studentId === stu.id; });
      var avg = mine.length ? Utils.round1(mine.reduce(function (a, s) { return a + Number(s.score || 0); }, 0) / mine.length) : null;
      var study = avg === null ? 0 : Utils.round1(avg * R.study.weight);
      // 德育（按学期考勤）
      var recs = att.filter(function (a) { return a.studentId === stu.id; });
      var absent = recs.filter(function (a) { return a.status === '缺勤'; }).length;
      var late = recs.filter(function (a) { return a.status === '迟到'; }).length;
      var moral = Math.max(0, Utils.round1(R.moral.base - absent * R.moral.absent - late * R.moral.late));
      // 文体与附加：竞赛加分
      var compScore = 0, compDetail = [];
      comps.forEach(function (c) {
        if ((c.studentIds || []).indexOf(stu.id) === -1) return;
        var arr = R.compPoints[c.level] || R.compPoints['校级'];
        var p = arr[R.awardIndex(c.award)] || 0;
        if (!p) return;
        compScore += p;
        compDetail.push(c.name + '·' + c.level + c.award + ' +' + p);
      });
      // 手工加减分
      var manual = extras.filter(function (e) { return e.studentId === stu.id; });
      var manualSum = manual.reduce(function (a, e) { return a + (e.type === '扣分' ? -Number(e.score || 0) : Number(e.score || 0)); }, 0);
      var extraRaw = compScore + manualSum;
      var extra = Math.max(0, Utils.round1(Math.min(R.extra.cap, extraRaw)));
      var total = avg === null ? null : Utils.round1(Math.min(100, study + moral + extra));
      return {
        studentId: stu.id, name: stu.name, avg: avg, study: study, moral: moral,
        absent: absent, late: late, compScore: Utils.round1(compScore), compDetail: compDetail,
        manual: manual, extra: extra, extraRaw: Utils.round1(extraRaw), total: total,
        note: avg === null ? '暂无学期成绩（智育未计入）' : ''
      };
    });
    // 排名：有总分的按降序，同分同名次；无成绩的排在最后
    var withScore = out.filter(function (x) { return x.total !== null; }).sort(function (a, b) { return b.total - a.total; });
    var rank = 0, prev = null;
    withScore.forEach(function (x, i) {
      if (prev === null || x.total !== prev) rank = i + 1;
      x.rank = rank; prev = x.total;
    });
    var noScore = out.filter(function (x) { return x.total === null; });
    noScore.forEach(function (x) { x.rank = 0; });
    return withScore.concat(noScore);
  },

  /**
   * 综测/统计的"最佳学期"：优先当前学期；若该学期无成绩，回退到本学期学生有成绩的最近学期
   * —— 演示导入的成绩可能集中在往期（如专升本学生的成绩在上一学年），避免页面显示"暂无数据"
   */
  bestTermFor(classId, studentId) {
    var cur = this.currentTerm();
    var terms = {};
    this.list('scores').filter(function (s) {
      if (studentId) return s.studentId === studentId;      // 按学生本人判断（演示导入的成绩可能集中在往期）
      return s.classId === classId;
    }).forEach(function (s) {
      if (s.term) terms[s.term] = true;
    });
    var list = Object.keys(terms).sort().reverse();
    if (!list.length || terms[cur]) return cur;
    return list[0];
  },

  /* ---------------- 升学/就业支持（专业口径 / 绩点 / 排名） ---------------- */

  /** 百分制成绩 → 4.0 制绩点（学校常用分段；教务处若另有口径以教务为准） */
  gpaPoint(score) {
    var v = Number(score || 0);
    if (v >= 90) return 4.0;
    if (v >= 85) return 3.7;
    if (v >= 82) return 3.3;
    if (v >= 78) return 3.0;
    if (v >= 75) return 2.7;
    if (v >= 72) return 2.3;
    if (v >= 68) return 2.0;
    if (v >= 64) return 1.5;
    if (v >= 60) return 1.0;
    return 0;
  },

  /** 专业名称（用于升学/就业材料）：按班级名推断，必要时可在班级备注中更正 */
  MAJOR_MAP: [
    { key: '计科', name: '计算机科学与技术', en: 'Computer Science and Technology' },
    { key: '软件', name: '软件工程', en: 'Software Engineering' },
    { key: '大数据', name: '数据科学与大数据技术', en: 'Data Science and Big Data Technology' },
    { key: '人工智能', name: '人工智能', en: 'Artificial Intelligence' }
  ],
  majorOf(cls) {
    var n = (cls && cls.name) || '';
    for (var i = 0; i < this.MAJOR_MAP.length; i++) {
      if (n.indexOf(this.MAJOR_MAP[i].key) !== -1) {
        return { name: this.MAJOR_MAP[i].name, en: this.MAJOR_MAP[i].en };
      }
    }
    return { name: n.replace(/\d+.*$/, '') || '—', en: '' };
  },

  /**
   * 学业统计（学分加权平均分 / GPA / 算术平均 / 不及格门数），可按 学期/学年/全部 口径
   * @returns {count, weightedAvg, gpa, avg, fails, credits}
   */
  academicSummary(studentId, termFilter) {
    var list = this.list('scores').filter(function (s) {
      return s.studentId === studentId && Store.termMatch(s.term, termFilter);
    });
    // 同一科目同学期的重复记录（如期末 + 总评）取其中一条，优先"总评"口径
    var picked = {};
    list.forEach(function (s) {
      var key = (s.subject || '') + '|' + (s.term || '');
      var isFinal = String(s.examName || '').indexOf('总评') === 0;
      if (!picked[key] || (isFinal && String(picked[key].examName || '').indexOf('总评') !== 0)) picked[key] = s;
    });
    var rows = Object.keys(picked).map(function (k) { return picked[k]; });
    if (!rows.length) return { count: 0, weightedAvg: null, gpa: null, avg: null, fails: 0, credits: 0 };
    var cw = 0, cp = 0, so = 0, cr = 0, fails = 0;
    rows.forEach(function (r) {
      var credit = Number(r.credit) || this.creditOf(r.subject);
      var score = Number(r.score || 0);
      cw += credit; cp += credit * score; so += score; cr += credit;
      if (score < 60) fails++;
    }, this);
    var wAvg = cw ? Utils.round1(cp / cw) : null;
    var gpa = cw ? Math.round(rows.reduce(function (a, r) {
      return a + Store.gpaPoint(r.score) * (Number(r.credit) || Store.creditOf(r.subject));
    }, 0) / cw * 100) / 100 : null;
    return {
      count: rows.length, weightedAvg: wAvg, gpa: gpa,
      avg: Utils.round1(so / rows.length), fails: fails, credits: Utils.round1(cr)
    };
  },

  /** 班级内按学业表现排名（学分加权平均分降序，同分同名次）：返回 {rank, total} */
  classRankOf(studentId, classId, termFilter) {
    var peers = this.list('students').filter(function (s) { return s.classId === classId; });
    var rows = peers.map(function (s) {
      var sum = Store.academicSummary(s.id, termFilter);
      return { id: s.id, key: sum.weightedAvg === null ? -1 : sum.weightedAvg };
    }).sort(function (a, b) { return b.key - a.key; });
    var rank = 0, prev = null;
    for (var i = 0; i < rows.length; i++) {
      if (prev === null || rows[i].key !== prev) rank = i + 1;
      prev = rows[i].key;
      if (rows[i].id === studentId) return { rank: rows[i].key < 0 ? 0 : rank, total: rows.length };
    }
    return { rank: 0, total: rows.length };
  },

  /**
   * 课程英文名对照表（英文成绩单用）：覆盖本校计算机类常见课程
   * 未收录的课程保留中文原名，并在成绩单页脚注明"英文译名待教务处核定"
   */
  COURSE_EN: {
    '高等数学': 'Advanced Mathematics', '大学英语': 'College English',
    '数据结构': 'Data Structures', '数据结构与算法': 'Data Structures and Algorithms',
    'Java程序设计': 'Java Programming', 'Python程序设计': 'Python Programming',
    'C语言程序设计': 'C Programming', '操作系统': 'Operating Systems',
    '计算机网络': 'Computer Networks', '数据库原理': 'Database Principles',
    '非结构化数据库': 'NoSQL Databases', '软件工程': 'Software Engineering',
    '编译技术': 'Compiler Techniques', '人工智能': 'Artificial Intelligence',
    '大数据分析': 'Big Data Analytics', '嵌入式系统': 'Embedded Systems',
    '嵌入式系统应用开发': 'Embedded System Application Development',
    'Web前端框架实训': 'Web Front-end Framework Practice',
    '鸿蒙应用开发': 'HarmonyOS Application Development',
    '移动应用开发': 'Mobile Application Development', '微信应用开发': 'WeChat Mini Program Development',
    'UI界面设计': 'UI Design', '计算机系统综合实训': 'Computer Systems Comprehensive Practice',
    '软件测试': 'Software Testing', '软件测试综合技术B': 'Software Testing (Comprehensive) B',
    '网络空间安全': 'Cyberspace Security', '云计算': 'Cloud Computing',
    '网络工程设计': 'Network Engineering Design', '数据科学与大数据技术导论': 'Introduction to Data Science',
    '创新创业基础': 'Basics of Innovation and Entrepreneurship',
    '组织行为与领导力': 'Organizational Behavior and Leadership',
    '发展心理学': 'Developmental Psychology', '第二课堂': 'Extracurricular Activities',
    '大模型应用实践': 'Large Language Model Practice', '计算机导论': 'Introduction to Computing',
    '大学物理': 'College Physics', '线性代数': 'Linear Algebra', '概率论与数理统计': 'Probability and Statistics'
  },
  courseEnOf(subject) {
    var s = String(subject || '');
    return this.COURSE_EN[s] || '';
  },

  /* ---------------- 升学/就业资格参考（学生端与辅导员端共用同一套口径） ---------------- */
  /** 参考门槛（常见推免/评优要求；真实细则以学校当年文件为准） */
  QUALIFY_RULES: { gpaMin: 3.0, rankTopRatio: 0.3 },

  /**
   * 单个学生的升学/评优资格参考测算
   * @returns {rules:[{text, ok, detail}], passCount, total}
   */
  qualifyOf(studentId, classId) {
    var stu = this.list('students').filter(function (s) { return s.id === studentId; })[0];
    var cid = classId || (stu && stu.classId);
    var sum = this.academicSummary(studentId, '');
    var rank = cid ? this.classRankOf(studentId, cid, '') : { rank: 0, total: 0 };
    var awards = this.list('competitions').filter(function (c) { return (c.studentIds || []).indexOf(studentId) !== -1; });
    var works = this.list('evaluations').filter(function (e) { return e.studentId === studentId; });
    var R = this.QUALIFY_RULES;
    var rules = [
      { text: '在校成绩无不及格科目', ok: sum.count > 0 && sum.fails === 0, detail: sum.count === 0 ? '暂无成绩' : (sum.fails ? '有 ' + sum.fails + ' 门不及格' : '通过') },
      { text: '学业排名进入班级前 ' + Math.round(R.rankTopRatio * 100) + '%', ok: rank.rank > 0 && rank.rank / rank.total <= R.rankTopRatio, detail: rank.rank ? '第 ' + rank.rank + ' / ' + rank.total + ' 名（前 ' + Math.round(rank.rank / rank.total * 100) + '%）' : '暂无排名' },
      { text: '平均学分绩点（GPA）≥ ' + R.gpaMin.toFixed(1), ok: (sum.gpa || 0) >= R.gpaMin, detail: sum.gpa === null ? '暂无成绩' : 'GPA ' + sum.gpa },
      { text: '有校级及以上获奖或学生工作经历（参考项）', ok: awards.length > 0 || works.length > 0, detail: awards.length + ' 项获奖 / ' + works.length + ' 条学生工作记录' }
    ];
    return { rules: rules, passCount: rules.filter(function (r) { return r.ok; }).length, total: rules.length, sum: sum, rank: rank };
  },

  /** 全班资格参考名单（按"满足项数降序 + 学业排名升序"，一次算完排名避免重复汇总） */
  qualifyListOf(classId) {
    var students = this.list('students').filter(function (s) { return s.classId === classId; });
    var sums = students.map(function (s) {
      var sum = Store.academicSummary(s.id, '');
      return { id: s.id, name: s.name, sum: sum, key: sum.weightedAvg === null ? -1 : sum.weightedAvg };
    });
    var sorted = sums.slice().sort(function (a, b) { return b.key - a.key; });
    var rank = 0, prev = null;
    var rankMap = {};
    sorted.forEach(function (r, i) {
      if (prev === null || r.key !== prev) rank = i + 1;
      prev = r.key;
      rankMap[r.id] = r.key < 0 ? 0 : rank;
    });
    var R = Store.QUALIFY_RULES;
    return sums.map(function (r) {
      var awards = Store.list('competitions').filter(function (c) { return (c.studentIds || []).indexOf(r.id) !== -1; }).length;
      var works = Store.list('evaluations').filter(function (e) { return e.studentId === r.id; }).length;
      var rk = rankMap[r.id];
      var rules = [
        { ok: r.sum.count > 0 && r.sum.fails === 0 },
        { ok: rk > 0 && rk / students.length <= R.rankTopRatio },
        { ok: (r.sum.gpa || 0) >= R.gpaMin },
        { ok: awards > 0 || works > 0 }
      ];
      return {
        studentId: r.id, name: r.name, gpa: r.sum.gpa, weightedAvg: r.sum.weightedAvg,
        fails: r.sum.fails, rank: rk, total: students.length,
        passCount: rules.filter(function (x) { return x.ok; }).length, rulesTotal: rules.length,
        awards: awards, works: works
      };
    }).sort(function (a, b) {
      return b.passCount - a.passCount || (a.rank || 9999) - (b.rank || 9999);
    });
  },

  /** 简短届别：「2027届」（列表用） */
  gradYearText(entity) {
    var g = this.gradYearOf(entity);
    return g ? g + '届' : '—';
  },

  /**
   * 学期显示（含届别学期序号）：termTextWithSeq('cls-4', '2026-2027-1')
   * → '2026-2027学年第一学期（第三学期）'
   * 规则：仅当届别序号 > 2（即第二学年起）时附加，避免与"第一/第二学期"重复
   */
  /**
   * 学期显示（含届别学期序号与总学期数）：
   *   termTextWithSeq('cls-4', '2026-2027-1') → '2026—2027学年第一学期（第三学期·共四学期）'
   * 规则：序号 > 2 时附「第 N 学期」；总学期数 = 学制 × 2（本科 8、专科 6、专升本 4）
   */
  termTextWithSeq(classId, term) {
    var base = this.termText(term);
    var cls = this.getClass(classId);
    var seq = cls ? this.termSeq(cls.grade, term) : 0;
    if (!seq) return base;
    var total = this.programYears(cls) * 2;
    var inner = (seq > 2 ? '第' + this.numToCn(seq) + '学期·' : '') + '共' + this.numToCn(total) + '学期';
    return base + '（' + inner + '）';
  },

  /** 系统中出现过的全部学期（成绩/考勤/请假扫描汇总，升序） */
  allTerms() {
    var set = {};
    ['scores', 'attendance', 'leaves'].forEach(function (ent) {
      Store.list(ent).forEach(function (x) { if (x.term) set[x.term] = true; });
    });
    if (!Object.keys(set).length) set[this.currentTerm()] = true;
    return Object.keys(set).sort();
  },

  /** 科目学分表（学分绩点计算用；未收录科目按 3 学分计） */
  SUBJECT_CREDITS: {
    '高等数学': 4, '大学英语': 3, '数据结构': 3.5, '操作系统': 3,
    '计算机网络': 3, '数据库原理': 3, 'Java程序设计': 3, '软件工程': 2.5, 'Web开发': 2
  },
  creditOf(subject) { return this.SUBJECT_CREDITS[subject] || 3; },

  /**
   * 课程库：源自真实学业成绩表（武汉晴川学院 · 计算机科学与技术（专升本）），
   * 供成绩录入的科目建议下拉与图表科目排序使用
   */
  COURSES: [
    'Web前端框架实训', '编译技术', '创新创业基础', '鸿蒙应用开发', '计算机系统综合实训',
    '领袖智慧：大学生学习习近平', '软件测试', '数据结构与算法', '网络工程设计', '网络空间安全',
    '云计算', '组织行为与领导力', 'Python程序设计', 'UI界面设计', '大数据分析', '发展心理学',
    '非结构化数据库', '解密黄帝内经', '嵌入式系统', '人工智能', '软件测试综合技术B',
    '软件工程', '微信应用开发', '移动应用开发'
  ],

  /**
   * 演示成绩单（计科20252302班 · 林一舟 · 学号 2025990401001）
   * 结构：[courseName, 课程性质, 学分, 成绩]
   * 两个学期成绩以固定日期导入（termOfDate 归入对应学年学期）
   */
  TRANSCRIPT: [
    { term: '2025-2026-1', date: '2026-01-15', courses: [
      ['Web前端框架实训', '必修', 3, 86], ['编译技术', '必修', 3, 72],
      ['创新创业基础', '必修', 2, 90], ['鸿蒙应用开发', '选修', 2, 84],
      ['计算机系统综合实训', '必修', 3, 78], ['领袖智慧：大学生学习习近平', '选修', 1, 95],
      ['软件测试', '必修', 2, 55], ['数据结构与算法', '必修', 4, 81],
      ['网络工程设计', '选修', 2, 76], ['网络空间安全', '必修', 2, 88],
      ['云计算', '选修', 2, 74], ['组织行为与领导力', '选修', 1, 93]
    ]},
    { term: '2025-2026-2', date: '2026-06-24', courses: [
      ['Python程序设计', '选修', 2, 91], ['UI界面设计', '选修', 2, 87],
      ['大数据分析', '选修', 2, 85], ['发展心理学', '选修', 1, 96],
      ['非结构化数据库', '选修', 2, 82], ['解密黄帝内经', '选修', 1, 97],
      ['嵌入式系统', '必修', 3, 90], ['人工智能', '选修', 2, 94],
      ['软件测试综合技术B', '必修', 2, 88], ['软件工程', '必修', 3, 86],
      ['微信应用开发', '必修', 2, 89], ['移动应用开发', '必修', 6, 92]
    ]}
  ],


  /**
   * 总评成绩权重合成：平时(60) = 作业/测验平均 · 期末(40) = 期末考试成绩
   * 合成后存为 examName="总评"的成绩（参与绩点与学期统计）
   * 返回合成统计：{ synthesized, skipped: [{studentId, course, reason}], weights }
   */
  finalizeGrades(classId, term, examName, options) {
    var opts = options || {};
    var weights = opts.weights || { usual: 0.6, final: 0.4 }; // 平时/期末 默认 60/40
    // 学期末匹配：允许按学期集合子集匹配（如 "2025-2026-1" 同时落在以 "2025-2026" 为前缀的学期里）
    function termMatch(s) { if (!term) return true; if (!s.term) return false; return s.term === term || term.indexOf(s.term) === 0 || s.term.indexOf(term) === 0; }
    var scores = this.list('scores').filter(function (s) {
      if (s.classId !== classId) return false;
      return termMatch(s);
    });
    var students = this.list('students').filter(function (s) { return s.classId === classId; });
    var atts = this.list('quizAttempts');
    var subs = this.list('submissions');
    var quizzesAll = this.list('quizzes');
    var asgAll = this.list('assignments');
    var arr = this.list('scores');
    var skipped = [];
    var synthesized = 0;
    // 期末考试名约定：以 examName 入参匹配（教师录入的卷面成绩）；兼容"期末考试"匹配所有"期末"开头考名
    var finalExamRx = examName.indexOf('期末') === 0 ? new RegExp('^' + examName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : null;
    students.forEach(function (stu) {
      // 找出本学生在指定班级学期内的所有科目
      var bySub = {};
      scores.forEach(function (s) {
        if (s.studentId !== stu.id) return;
        (bySub[s.subject] = bySub[s.subject] || []).push(s);
      });
      Object.keys(bySub).forEach(function (subject) {
        var rows = bySub[subject];
        var finalRec = finalExamRx ? rows.find(function (r) { return finalExamRx.test(r.examName); }) : rows.find(function (r) { return r.examName === examName; });
        if (!finalRec) { skipped.push({ studentId: stu.id, course: subject, reason: '缺期末成绩' }); return; }
        // 平时成绩：同学期同科目的作业+随堂测验成绩（排除期末考试与期末补考与总评自身）
        var usualRows = rows.filter(function (r) {
          if (r.examName.indexOf('总评') === 0) return false;
          if (r.examName === finalRec.examName) return false;
          if (r.examName === '期末补考') return false;
          // 随堂测验成绩由课堂模块写入成绩表，同时也会在下方按 quizAttempts 汇总，
          // 这里必须排除，否则平时分被同一份测验重复加权
          if (r.examName.indexOf('随堂测验') === 0) return false;
          return true;
        });
        // 补录作业与测验（不限科目，先按学生×学期聚合）
        var stuQuizScores = atts.filter(function (x) {
          if (x.studentId !== stu.id || !x.submitTime) return false;
          var q = quizzesAll.find(function (qq) { return qq.id === x.quizId; });
          return q && q.subject === subject && termMatch({ term: Store.termOfDate(x.submitTime.slice(0, 10)) });
        });
        var quizScores = stuQuizScores.map(function (x) { return x.score; });
        var usualFromSubs = subs.filter(function (x) {
          if (x.studentId !== stu.id || x.status !== '已批改' || !x.gradedTime) return false;
          var asg = asgAll.find(function (a) { return a.id === x.assignmentId; });
          return asg && termMatch({ term: Store.termOfDate(asg.publishTime.slice(0, 10)) });
        }).map(function (x) { return x.score; });
        var usualScores = usualRows.map(function (r) { return r.score; }).concat(quizScores).concat(usualFromSubs);
        if (usualScores.length < 1) { skipped.push({ studentId: stu.id, course: subject, reason: '尚无平时成绩（需先录入作业批改或随堂测验）' }); return; }
        var usualAvg = usualScores.reduce(function (a, b) { return a + b; }, 0) / usualScores.length;
        var finalScore = finalRec.score;
        var total = Math.round(usualAvg * weights.usual + finalScore * weights.final);
        // 写回总评成绩（按 student+subject+term+examName 总评 upsert）
        var rec = arr.find(function (x) {
          return x.studentId === stu.id && x.subject === subject && x.examName === ('总评·' + finalRec.examName) && x.term === finalRec.term;
        });
        var credit = finalRec.credit || Store.creditOf(subject);
        var nature = finalRec.nature || '';
        var data = {
          studentId: stu.id, classId: classId, subject: subject,
          examName: '总评·' + finalRec.examName, score: total, credit: credit, nature: nature,
          date: Utils.today(), term: finalRec.term, isFinalized: true
        };
        if (rec) Store.update('scores', rec.id, data);
        else Store.add('scores', data);
        synthesized++;
      });
    });
    return { synthesized: synthesized, skipped: skipped, weights: weights };
  },

  /**
   * 学业预警引擎：按规则计算每位学生的预警项
   * 规则：连续 N 天缺勤率 < 70% / 近 N 次作业未提交数 ≥ 3 / 当前学期有不及格总评
   * 返回 { studentId, name, className, reasons[] }
   */
  alertsFor(classId, term) {
    var now = new Date();
    var students = this.list('students').filter(function (s) { return s.classId === classId; });
    var att = this.list('attendance').filter(function (a) {
      return a.classId === classId && Store.termMatch(a.term, term);
    });
    var subs = this.list('submissions');
    var asg = this.list('assignments').filter(function (a) {
      return a.classId === classId && (term ? (Store.termOfDate(a.publishTime.slice(0, 10)) === term) : true);
    });
    var scores = this.list('scores').filter(function (s) {
      return s.classId === classId && Store.termMatch(s.term, term) && (s.examName.indexOf('总评') === 0);
    });
    var out = [];
    students.forEach(function (stu) {
      var reasons = [];
      // 1. 近 7 个工作日出勤率 < 70%（且样本 ≥ 5）
      var recent = att.filter(function (a) {
        return a.studentId === stu.id && (new Date(a.date + 'T00:00:00')) >= new Date(now - 14 * 86400000);
      });
      if (recent.length >= 5) {
        var ok = recent.filter(function (a) { return a.status === '出勤'; }).length;
        var rate = ok / recent.length;
        if (rate < 0.7) reasons.push('近 2 周出勤率 ' + Math.round(rate * 100) + '%（< 70%）');
      }
      // 2. 近 N 次作业有 ≥ 3 次未提交
      var recentAsg = asg.slice().sort(function (a, b) { return b.publishTime.localeCompare(a.publishTime); }).slice(0, 5);
      var missing = recentAsg.filter(function (a) {
        return !subs.some(function (s) { return s.assignmentId === a.id && s.studentId === stu.id; });
      }).length;
      if (missing >= 3) reasons.push('近 5 次作业缺交 ' + missing + ' 次');
      // 3. 总评不及格数
      var fail = scores.filter(function (s) { return s.studentId === stu.id && s.score < 60; }).length;
      if (fail > 0) reasons.push('本学期 ' + fail + ' 门总评不及格');
      if (reasons.length) out.push({ studentId: stu.id, name: stu.name, className: Store.className(stu.classId), reasons: reasons });
    });
    return out;
  },

  /* ---------------- 健康日报 ---------------- */

  /** 指定日期（默认今天）的班级健康汇总：{ total, done, abnormal: [], pending: [] } */
  healthSummary(classId, date) {
    var d = date || Utils.today();
    var students = this.list('students').filter(function (s) { return s.classId === classId; })
      .sort(function (a, b) { return String(a.studentNo).localeCompare(String(b.studentNo)); });
    var reports = this.list('healthReports').filter(function (r) {
      return r.date === d && r.classId === classId;
    });
    var byStu = {};
    reports.forEach(function (r) { byStu[r.studentId] = r; });
    var abnormal = [], pending = [];
    var done = 0;
    students.forEach(function (stu) {
      var rep = byStu[stu.id];
      if (!rep) { pending.push(stu); return; }
      done++;
      if (rep.status !== '健康' || Number(rep.temp) > Store.HEALTH_TEMP_MAX) {
        abnormal.push({ stu: stu, report: rep });
      }
    });
    return { total: students.length, done: done, abnormal: abnormal, pending: pending };
  },

  /** 学生今日是否已填报 */
  hasHealthReportToday(stuId) {
    var d = Utils.today();
    return this.list('healthReports').some(function (r) { return r.studentId === stuId && r.date === d; });
  },

  /* ---------------- 教务系统数据对接（预留） ---------------- */

  /**
   * 教务系统对接入口（预留实现）
   *
   * 现状说明（详见 README「教务系统对接」章节）：
   * 本系统为纯前端应用，无法直接访问学校教务系统（需教务处授权接口 + 后端中转，
   * 且浏览器有跨域限制）。当前通过「数据管理 → 教务数据导入」支持导入教务系统
   * 导出的 CSV（学生名单／成绩单／课表），这是零授权成本的真实可行方案。
   *
   * 将来若接入后端，在此实现真实同步：拉取教务课表/成绩 → 按本系统结构落库。
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async syncFromEdu(payload) {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        message: '教务直连未配置：学校使用正方统一身份认证（CAS），直连需信息中心授权 + 服务端票据校验。' +
          '当前版本请使用「数据管理 → 教务数据导入」导入教务导出文件；校园门户入口见页脚。'
      };
    }
    // ---- 契约适配器：把后端/门户送来的标准结构写入本地库（幂等：按自然键覆盖） ----
    var applied = { classes: 0, students: 0, scores: 0, timetable: 0, skipped: 0 };
    var clsByName = {};
    this.list('classes').forEach(function (c) { clsByName[c.name] = c; });

    (payload.classes || []).forEach(function (c) {
      if (!c || !c.name) { applied.skipped++; return; }
      var hit = clsByName[c.name];
      if (hit) { Store.update('classes', hit.id, c); }
      else {
        var rec = Object.assign({ id: Utils.uid(), createdAt: new Date().toISOString() }, c);
        Store.add('classes', rec);
        clsByName[c.name] = rec;
      }
      applied.classes++;
    });

    var stuMap = {};
    this.list('students').forEach(function (s) { stuMap[String(s.studentNo)] = s; });
    (payload.students || []).forEach(function (s) {
      if (!s || !s.studentNo) { applied.skipped++; return; }
      var cls = null;
      if (s.classId) cls = Store.getClass(s.classId);
      else if (s.className) cls = clsByName[s.className];
      // 必须能定位到班级（否则学生挂不上班级）：班级没先建好、或记录里既没 classId 也没 className 都跳过
      if (!cls) { applied.skipped++; return; }
      var data = Object.assign({}, s);
      delete data.className;
      if (cls) data.classId = cls.id;
      var hit = stuMap[String(s.studentNo)];
      if (hit) { Store.update('students', hit.id, data); }
      else {
        var rec = Object.assign({ id: Utils.uid(), status: '在读', createdAt: new Date().toISOString() }, data);
        Store.add('students', rec);
        stuMap[String(s.studentNo)] = rec;
      }
      applied.students++;
    });

    (payload.scores || []).forEach(function (r) {
      if (!r || !r.studentNo || !r.subject || r.score === undefined || r.score === null) { applied.skipped++; return; }
      var stu = stuMap[String(r.studentNo)];
      if (!stu) { applied.skipped++; return; }
      var score = Number(r.score);
      if (isNaN(score) || score < 0 || score > 100) { applied.skipped++; return; }
      var term = Store.normalizeTermText(r.term) || Store.currentTerm();
      var examName = r.examName || '总评';
      var exists = Store.list('scores').filter(function (x) {
        return x.studentId === stu.id && x.subject === r.subject && x.examName === examName && (x.term || Store.currentTerm()) === term;
      })[0];
      if (exists) {
        Store.update('scores', exists.id, { score: score, credit: r.credit || exists.credit, nature: r.nature || exists.nature, date: r.date || exists.date });
      } else {
        Store.add('scores', {
          studentId: stu.id, classId: stu.classId, studentNo: stu.studentNo, stuName: stu.name,
          subject: r.subject, examName: examName, score: score, credit: r.credit || '',
          nature: r.nature || '', term: term, date: r.date || Utils.today()
        });
      }
      applied.scores++;
    });

    var arr = Store.list('timetable');
    (payload.timetable || []).forEach(function (r) {
      if (!r || !r.className || !r.day || !r.course) { applied.skipped++; return; }
      var cls = clsByName[r.className];
      if (!cls) { applied.skipped++; return; }
      var periods = String(r.period || '').split(/[-,，~]/).filter(function (x) { return x !== ''; })
        .map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n >= 1 && n <= 12; });
      if (!periods.length) { applied.skipped++; return; }
      var term = Store.normalizeTermText(r.term) || Store.currentTerm();
      periods.forEach(function (p) {
        var hit = arr.filter(function (x) {
          return x.classId === cls.id && Number(x.day) === Number(r.day) && Number(x.period) === p && x.term === term;
        })[0];
        if (hit) {
          Store.update('timetable', hit.id, { course: r.course, teacher: r.teacher || hit.teacher, room: r.room || hit.room, weeks: r.weeks || hit.weeks });
        } else {
          var rec = {
            id: Utils.uid(), classId: cls.id, term: term, day: Number(r.day), period: p,
            course: r.course, teacher: r.teacher || '', room: r.room || '', weeks: r.weeks || '',
            createdAt: new Date().toISOString()
          };
          Store.add('timetable', rec);
          arr.push(rec);
        }
        applied.timetable++;
      });
    });

    Store._log('数据管理', '教务数据对接（契约导入）', '班级 ' + applied.classes + '、学生 ' + applied.students +
      '、成绩 ' + applied.scores + '、课表 ' + applied.timetable + ' 节；跳过 ' + applied.skipped);
    return {
      ok: true, applied: applied,
      message: '教务数据已对接：班级 ' + applied.classes + ' 个、学生 ' + applied.students + ' 人、成绩 ' + applied.scores +
        ' 条、课表 ' + applied.timetable + ' 节' + (applied.skipped ? '（跳过 ' + applied.skipped + ' 条不符合约定的数据）' : '')
    };
  },

  /** 学期文本归一化（供对接适配器与外部调用复用）：'2025-2026学年第一学期' / '2025—2026-1' → '2025-2026-1' */
  normalizeTermText(txt) {
    var t = String(txt || '').trim();
    if (!t) return '';
    var m = t.match(/(\d{4})\s*[-—~至]\s*(\d{4})\s*学?年?\s*第?\s*([一二12])\s*(?:学期|期)?/) ||
            t.match(/(\d{4})\s*[-—~]\s*(\d{4})\s*[-—~]\s*([12])/);
    if (m) return m[1] + '-' + m[2] + '-' + (m[3] === '一' ? '1' : (m[3] === '二' ? '2' : m[3]));
    if (/^\d{4}-\d{4}-[12]$/.test(t)) return t;
    return '';
  },

  /* ---------------- 基础读写 ---------------- */

  /** 读取原始 key */
  read(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) {
      return def;
    }
  },

  /** 写入原始 key */
  write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },

  /** 清除登录会话（退出登录 / 恢复备份后强制重新登录） */
  clearSession() {
    try { localStorage.removeItem(Store.KEYS.session); } catch (e) { /* 忽略 */ }
  },

  /**
   * 界面偏好读写（主题、全站学期筛选等）。
   * 偏好不是业务实体，但同样只允许经由 store.js 访问 localStorage，
   * 避免各页面散落裸 key 造成命名冲突与清理遗漏。
   */
  PREF_KEYS: {
    theme: 'cms_theme', uiTerm: 'cms_ui_term', ntfyTopic: 'cms_ntfy_topic', lastBackupAt: 'cms_last_backup',
    aiConfig: 'cms_ai_config', aiMask: 'cms_ai_mask', aiCalls: 'cms_ai_calls',
    aiTasks: 'cms_ai_tasks', aiHelpSnapshots: 'cms_ai_help_snapshots', aiAuto: 'cms_ai_auto',
    docCheckedAt: 'cms_doc_checked_at', myTimetable: 'cms_my_timetable'
  },
  getPref(name, def) {
    try {
      var v = localStorage.getItem(Store.PREF_KEYS[name] || name);
      return v === null ? (def === undefined ? '' : def) : v;
    } catch (e) { return def === undefined ? '' : def; }
  },
  setPref(name, value) {
    try { localStorage.setItem(Store.PREF_KEYS[name] || name, String(value)); } catch (e) { /* 隐私模式忽略 */ }
  },

  /** 读取某个实体集合（数组） */
  list(entity) {
    return this.read(Store.KEYS[entity], []);
  },

  /** 整体保存某个实体集合 */
  save(entity, arr) {
    this.write(Store.KEYS[entity], arr);
  },

  /** 按 ID 查找 */
  find(entity, id) {
    return this.list(entity).find(function (x) { return x.id === id; }) || null;
  },

  /** 新增一条记录（自动补 id / createdAt），返回新记录 */
  add(entity, item) {
    var arr = this.list(entity);
    item.id = item.id || Utils.uid();
    item.createdAt = item.createdAt || new Date().toISOString();
    arr.push(item);
    this.save(entity, arr);
    this._log(entity, '新增', this._label(item));
    return item;
  },

  /** 按 ID 更新字段，返回是否成功 */
  update(entity, id, patch) {
    var arr = this.list(entity);
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return false;
    var old = arr[idx];
    Object.assign(arr[idx], patch, { updatedAt: new Date().toISOString() });
    this.save(entity, arr);
    // 仅改密码时记录为“修改密码”，其余记录修改的字段名
    var keys = Object.keys(patch);
    var action = (keys.length === 1 && keys[0] === 'password') ? '修改密码' : '修改';
    this._log(entity, action, this._label(old) + (action === '修改' ? '；字段：' + keys.join('、') : ''));
    return true;
  },

  /** 按 ID 删除（可传单个 id 或 id 数组） */
  remove(entity, ids) {
    var idList = Array.isArray(ids) ? ids : [ids];
    var idSet = {};
    idList.forEach(function (i) { idSet[i] = true; });
    var before = this.list(entity);
    var arr = before.filter(function (x) { return !idSet[x.id]; });
    this.save(entity, arr);
    var labels = before.filter(function (x) { return idSet[x.id]; })
      .map(function (x) { return Store._label(x); }).join('、');
    this._log(entity, '删除', labels);
  },

  /* ---------------- 操作日志（系统审计） ---------------- */

  /** 实体 → 日志模块中文名 */
  ENTITY_NAMES: {
    users: '用户管理', classes: '班级管理', students: '学生管理',
    scores: '成绩管理', attendance: '考勤管理', notices: '通知管理',
    leaves: '请假审批', signins: '课堂签到', assignments: '作业管理',
    submissions: '作业提交', quizzes: '随堂测验', quizAttempts: '测验作答',
    competitions: '竞赛管理', scholarships: '奖助管理',
    downloads: '资料下载', evaluations: '综合素质测评', healthReports: '健康日报', timetable: '班级课表'
  },

  /** 取记录的可读名称（用于日志详情） */
  _label(item) {
    if (!item) return '(未知记录)';
    return item.name || (item.studentNo ? item.studentNo + ' ' + item.name : '') ||
      item.title || item.username || item.examName || item.id;
  },

  /**
   * 写入一条操作日志（增删改接口自动调用；登录/登出/导入等在业务层调用）
   * 日志上限 1000 条，超出后滚动丢弃最旧的
   */
  _log(module, action, detail) {
    if (module === 'logs') return; // 日志自身的操作不记录，防止递归
    var user = null;
    try { user = Auth.currentUser(); } catch (e) { /* auth 未就绪时忽略 */ }
    var arr = this.read(Store.KEYS.logs, []);
    arr.push({
      id: Utils.uid(),
      time: Utils.nowStr(),
      userName: user ? (user.name || user.username) : '未登录',
      role: user ? user.role : '-',
      module: Store.ENTITY_NAMES[module] || module,
      action: action,
      detail: detail || ''
    });
    if (arr.length > 1000) arr = arr.slice(-1000);
    this.write(Store.KEYS.logs, arr);
  },

  /* ---------------- 通知已读回执 ---------------- */

  /** 记录某用户已读某通知（学生端查看时调用，重复读不重复记） */
  markNoticeRead(noticeId, username) {
    if (!noticeId || !username) return;
    var map = this.read(this.KEYS.noticeReads, {});
    var arr = map[noticeId] || [];
    if (arr.indexOf(username) !== -1) return;
    arr.push(username);
    map[noticeId] = arr;
    this.write(this.KEYS.noticeReads, map);
  },

  /** 某通知的已读用户名列表 */
  noticeReaders(noticeId) {
    var map = this.read(this.KEYS.noticeReads, {});
    return map[noticeId] || [];
  },

  /* ---------------- 业务便捷查询 ---------------- */

  getClass(id) { return this.find('classes', id); },
  getStudent(id) { return this.find('students', id); },
  getUser(id) { return this.find('users', id); },

  /** 班级名称（删除兜底显示） */
  className(id) {
    var c = this.getClass(id);
    return c ? c.name : '未知班级';
  },

  /* ---------------- 初始化 / 迁移 / 重置 ---------------- */

  /**
   * 示例数据版本号：种子内容更新（如导入演示成绩单）时递增，
   * 已有旧示例数据的浏览器首次打开会自动刷新为最新示例数据
   */
  SEED_VERSION: 18,

  /** 首次运行生成示例数据；旧结构按版本迁移，旧示例数据按种子版本自动刷新 */
  init() {
    var meta = this.read(Store.KEYS.meta, null);
    if (!meta || !meta.seeded) {
      this.seed();
      this.write(Store.KEYS.meta, {
        seeded: true,
        version: '2.1.0',
        schemaVersion: 3,
        seedVersion: this.SEED_VERSION,
        initTime: new Date().toISOString()
      });
      return;
    }
    // 旧示例数据（早于当前种子版本）：结构迁移后整体刷新为最新示例数据
    if ((meta.seedVersion || 0) < this.SEED_VERSION) {
      this.seed();
      this.write(Store.KEYS.meta, {
        seeded: true,
        version: '2.1.0',
        schemaVersion: 3,
        seedVersion: this.SEED_VERSION,
        initTime: new Date().toISOString()
      });
      this._log('系统', '数据刷新', '示例数据已升级至种子版本 v' + this.SEED_VERSION + '（真实班级与成绩单）');
      return;
    }
    var v = Number(meta.schemaVersion || 1);
    if (v < 2) { this.migrateV2(); v = 2; }
    if (v < 3) { this.migrateV3(); }
  },

  /**
   * 数据结构迁移 v2 → v3（更正分类学口径）：
   * 「办学类型 统招/专升本/助学班」拆分为两个正交字段：
   * - 招生类别 enrollType：统招→普通高考；专升本→专升本（仍属统招）；助学班→自考助学
   * - 学习形式 studyForm：普通高考/专升本→全日制；助学班→非全日制
   */
  migrateV3() {
    var map = { '统招': '普通高考', '专升本': '专升本', '助学班': '自考助学' };
    ['classes', 'students'].forEach(function (ent) {
      var arr = Store.list(ent);
      arr.forEach(function (x) {
        var old = x.planType || '统招';
        x.enrollType = map[old] || '普通高考';
        x.studyForm = Store.enrollForm(x.enrollType);
        delete x.planType;
      });
      Store.save(ent, arr);
    });
    var meta = this.read(Store.KEYS.meta, {});
    meta.schemaVersion = 3;
    meta.version = '2.1.0';
    this.write(Store.KEYS.meta, meta);
    this._log('系统', '数据升级', '学生分类更正为「培养层次 + 招生类别 + 学习形式」（专升本归入统招，助学班归入非全日制）');
  },

  /**
   * 数据结构迁移 v1 → v2：
   * - 班级补 年级/培养层次/办学类型（年级从班级名推断）
   * - 学生按所在班级补 培养层次/办学类型
   * - 教师 classId 升级为 teacherClassIds 数组，并补 编制类型/聘期
   * - 成绩/考勤补学期字段（旧数据统一归入当前学期）
   * （办学类型字段随后由 migrateV3 更正为 招生类别 + 学习形式）
   */
  migrateV2() {
    var classes = this.list('classes');
    var classById = {};
    classes.forEach(function (c) {
      var m = String(c.name || '').match(/(\d{2})班/);
      if (!c.grade && m) c.grade = '20' + m[1] + '级';
      if (!c.eduLevel) c.eduLevel = '本科';
      if (!c.planType) c.planType = '统招';
      classById[c.id] = c;
    });
    this.save('classes', classes);

    var students = this.list('students');
    students.forEach(function (s) {
      var cls = classById[s.classId];
      if (!s.eduLevel) s.eduLevel = cls ? cls.eduLevel : '本科';
      if (!s.planType) s.planType = cls ? cls.planType : '统招';
    });
    this.save('students', students);

    var users = this.list('users');
    users.forEach(function (u) {
      if (u.role === 'teacher') {
        if (!Array.isArray(u.teacherClassIds) || !u.teacherClassIds.length) {
          u.teacherClassIds = u.classId ? [u.classId] : [];
        }
        if (!u.teacherType) u.teacherType = '专任';
        if (u.validUntil === undefined) u.validUntil = '';
      }
    });
    this.save('users', users);

    var term = this.currentTerm();
    ['scores', 'attendance'].forEach(function (ent) {
      var arr = Store.list(ent);
      arr.forEach(function (x) { if (!x.term) x.term = term; });
      Store.save(ent, arr);
    });

    var meta = this.read(Store.KEYS.meta, {});
    meta.schemaVersion = 2;
    meta.version = '2.0.0';
    this.write(Store.KEYS.meta, meta);
    this._log('系统', '数据升级', '数据结构升级至 v2（学生类型 / 教师多班级 / 学期维度）');
  },

  /** 清空全部数据并重新生成示例数据（管理员“重置示例数据”按钮使用） */
  reset() {
    var self = this;
    Object.keys(Store.KEYS).forEach(function (k) {
      localStorage.removeItem(Store.KEYS[k]);
    });
    self.init();
  },

  /**
   * 生成示例数据（贴合真实学情）：
   * - 6 个班级 75 名学生：2023 级本科（普通高考·全日制）3 个班各 10 人、
   *   「计科20252302班」31 人（计算机科学与技术专升本·全日制·2025级，
   *   用户真实班级，含本人演示成绩单）、
   *   统招专升本班 8 人、自考助学班 6 人（非全日制）
   * - 成绩跨两个学年学期；计科20252302班课程来自演示成绩单（24 门课，含学分/性质）
   * - 最近 15 天（跳过周末）的考勤记录；请假审批示例 3 条
   * - 4+1 条通知；5 个默认账号（含外聘教师）
   * 使用固定种子的伪随机数，保证数据分布合理
   */
  seed() {
    // 可复现的伪随机数生成器（mulberry32）
    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    var rand = mulberry32(20240901);
    function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
    function pad3(n) { return String(n).padStart(3, '0'); }
    /** 相对今天偏移 n 天的日期（负数为未来） */
    function dateOffset(n) {
      var d = new Date();
      d.setDate(d.getDate() + n);
      return Utils.formatDate(d); // 本地日期，避免 toISOString 的时区偏移
    }

    var nowIso = new Date().toISOString();
    var curTerm = Store.termOfDate(Utils.today());

    /* 1. 班级（培养层次 + 招生类别 + 学习形式，覆盖全日制统招本科/专科、
     *    统招专升本、非全日制自考助学班；cls-4 为用户真实班级） */
    var classes = [
      { id: 'cls-1', name: '计科2301班', grade: '2023级', eduLevel: '本科', enrollType: '普通高考', studyForm: '全日制', headTeacher: '王建国', remark: '计算机科学与技术专业', createdAt: nowIso },
      { id: 'cls-2', name: '计科2302班', grade: '2023级', eduLevel: '本科', enrollType: '普通高考', studyForm: '全日制', headTeacher: '李秀芳', remark: '计算机科学与技术专业', createdAt: nowIso },
      { id: 'cls-3', name: '软工2301班', grade: '2023级', eduLevel: '本科', enrollType: '普通高考', studyForm: '全日制', headTeacher: '张伟', remark: '软件工程专业', createdAt: nowIso },
      { id: 'cls-4', name: '计科20252302班', grade: '2025级', eduLevel: '本科', enrollType: '专升本', studyForm: '全日制', headTeacher: '沈嘉禾', remark: '计算机科学与技术（专升本），31人 · 辅导员：沈嘉禾', createdAt: nowIso },
      { id: 'cls-5', name: '计科专升本2501班', grade: '2025级', eduLevel: '本科', enrollType: '专升本', studyForm: '全日制', headTeacher: '李秀芳', remark: '普通专升本（统招），专科起点本科两年制', createdAt: nowIso },
      { id: 'cls-6', name: '助学软件2501班', grade: '2025级', eduLevel: '专科', enrollType: '自考助学', studyForm: '非全日制', headTeacher: '张伟', remark: '高等教育自学考试助学班（非全日制）', createdAt: nowIso }
    ];

    /* 2. 学生 75 名 */
    var surnames = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
    var givens = ['子轩', '雨桐', '浩然', '欣怡', '俊杰', '思远', '梦琪', '天佑', '若曦', '宇航', '梓涵', '一鸣', '佳琪', '浩宇', '诗涵', '子墨', '雨泽', '静怡', '明轩', '晓彤'];
    var students = [];
    var noCounter = 0; // 2023 级学号统一编到 001~030
    /** 为一个班批量生成学生 */
    function makeStudents(cls, count, opt) {
      for (var i = 0; i < count; i++) {
        var no;
        if (opt.continueNo) {
          noCounter++;
          no = 'S2023' + pad3(noCounter);
        } else {
          no = opt.noPrefix + pad3(opt.noStart + i);
        }
        students.push({
          id: 'stu-' + cls.id.slice(-1) + '-' + i,
          studentNo: no,
          name: surnames[(students.length + 3) % surnames.length] + givens[randInt(0, givens.length - 1)],
          gender: rand() < 0.5 ? '男' : '女',
          birth: (opt.birthYear + randInt(-1, 1)) + '-0' + randInt(1, 9) + '-' + String(randInt(10, 28)),
          classId: cls.id,
          eduLevel: cls.eduLevel,
          enrollType: cls.enrollType,
          studyForm: cls.studyForm,
          phone: '13' + String(randInt(100000000, 999999999)),
          parentPhone: '15' + String(randInt(100000000, 999999999)),
          address: '幸福小区 ' + randInt(1, 18) + ' 号楼 ' + randInt(101, 604) + ' 室',
          status: '在读',
          createdAt: nowIso
        });
      }
    }
    makeStudents(classes[0], 10, { continueNo: true, birthYear: 2005 });
    makeStudents(classes[1], 10, { continueNo: true, birthYear: 2005 });
    makeStudents(classes[2], 10, { continueNo: true, birthYear: 2005 });
    /* cls-4：计科20252302班（计算机科学与技术专升本，31 人）
     * 全班为合成演示数据：姓名、学号、联系方式、住址均为虚构（不对应任何真实人员） */
    (function () {
      var cls = classes[3];
      /* 31 个虚构姓名（固定数组，保证可复现且与真实名单无关联） */
      var demoNames = [
          '林一舟',
          '许清和',
          '沈知微',
          '陆予安',
          '顾言溪',
          '江晚晴',
          '程亦帆',
          '苏念禾',
          '韩星野',
          '温以宁',
          '周听雨',
          '叶知秋',
          '秦书白',
          '唐晓棠',
          '罗子衿',
          '宋栖迟',
          '谢明楼',
          '傅晏宁',
          '钟离雪',
          '白景行',
          '孟星河',
          '段清越',
          '池砚秋',
          '季临川',
          '凌霜序',
          '简宁川',
          '钟灵均',
          '祝清晏',
          '卫长风',
          '安时序',
          '齐远舟'
      ];
      for (var i = 0; i < 31; i++) {
        students.push({
          id: 'stu-4-' + i,
          studentNo: '2025990401' + pad3(i + 1),
          name: demoNames[i],
          gender: rand() < 0.5 ? '男' : '女',
          birth: (2004 + randInt(-1, 1)) + '-0' + randInt(1, 9) + '-' + String(randInt(10, 28)),
          classId: cls.id,
          eduLevel: '本科',
          enrollType: '专升本',
          studyForm: '全日制',
          phone: '13' + String(randInt(100000000, 999999999)),
          parentPhone: '15' + String(randInt(100000000, 999999999)),
          address: '幸福小区 ' + randInt(1, 18) + ' 号楼 ' + randInt(101, 604) + ' 室',
          status: '在读',
          createdAt: nowIso
        });
      }
    })();
    makeStudents(classes[4], 8, { noPrefix: 'S2025', noStart: 201, birthYear: 2004 });  // 专升本班 8 人
    makeStudents(classes[5], 6, { noPrefix: 'S2025', noStart: 301, birthYear: 2006 });  // 助学班 6 人

    /* 3. 成绩（民办高校口径：只有期末考试与补考，无月考/摸底）：
     * - 计科20252302班（cls-4）：导入演示成绩单（林一舟两学期 24 门课，
     *   含学分与课程性质），同班同学按相同课程模拟
     * - 其余班级：4 门课程 × 两学期期末考试
     * - 上学期不及格的科目生成本学期初「期末补考」成绩（虚构学籍场景；
     *   林一舟的分数为演示导入，不模拟其补考结果） */
    var subjects = ['高等数学', '大学英语', '数据结构', 'Java程序设计'];
    var exams = [
      { name: '期末考试', date: '2026-01-15' }, // 2025-2026 学年第一学期
      { name: '期末考试', date: '2026-06-24' }  // 2025-2026 学年第二学期
    ];
    exams.forEach(function (e) { e.term = Store.termOfDate(e.date); });
    var makeupExam = { name: '期末补考', date: Utils.daysAgo(17) }; // 本学期初补考
    makeupExam.term = Store.termOfDate(makeupExam.date);

    var scores = [];
    function pushScore(stu, sub, exam, score, credit, nature) {
      scores.push({
        id: 'sc-' + stu.id + '-' + sub + '-' + exam.name,
        studentId: stu.id,
        classId: stu.classId,
        subject: sub,
        examName: exam.name,
        score: score,
        credit: credit || '',
        nature: nature || '',
        date: exam.date,
        term: exam.term,
        createdAt: nowIso
      });
    }

    // 3a. 除真实班级外的学生：两学期期末成绩
    students.forEach(function (stu) {
      if (stu.classId === 'cls-4') return;
      var ability = randInt(55, 92); // 每个学生一个基础水平，成绩围绕它浮动
      exams.forEach(function (exam) {
        subjects.forEach(function (sub) {
          pushScore(stu, sub, exam, Math.min(100, Math.max(35, ability + randInt(-12, 10))));
        });
      });
    });

    // 3b. 计科20252302班：演示成绩单导入 + 同班同学按相同课程模拟
    students.forEach(function (stu) {
      if (stu.classId !== 'cls-4') return;
      var isMe = stu.studentNo === '2025990401001';
      var ability = randInt(60, 92);
      // 两个学期的期末成绩：本人用演示成绩单，同学模拟
      Store.TRANSCRIPT.forEach(function (sess) {
        var exam = { name: '期末考试', date: sess.date, term: sess.term };
        sess.courses.forEach(function (c) {
          pushScore(stu, c[0], exam,
            isMe ? c[3] : Math.min(100, Math.max(40, ability + randInt(-12, 10))),
            c[2], c[1]);
        });
      });
    });

    // 3c. 期末补考：任一学期不及格的科目 → 本学期初补考（林一舟不模拟）
    students.forEach(function (stu) {
      if (stu.studentNo === '2025990401001') return;
      var failed = {};
      scores.forEach(function (s) {
        if (s.studentId === stu.id && s.score < 60) failed[s.subject] = true;
      });
      Object.keys(failed).forEach(function (sub) {
        pushScore(stu, sub, makeupExam, randInt(62, 88));
      });
    });

    /* 3d. 平时成绩（作业 / 课堂表现）：与期末成绩配对，供「总评成绩合成」
     *     按 平时 60% + 期末 40% 合成总评。没有平时成绩的科目无法合成总评，
     *     因此示例数据必须成对提供，否则「一键合成」在新装环境下空转。
     *     林一舟本人是演示导入成绩单，不虚构其平时分（合成时会如实标记跳过）。 */
    var usualDateOf = { '2025-2026-1': '2025-12-20', '2025-2026-2': '2026-06-05' };
    scores.slice().forEach(function (rec) {
      if (rec.examName !== '期末考试') return;
      var owner = students.find(function (s) { return s.id === rec.studentId; });
      if (!owner || owner.studentNo === '2025990401001') return;
      scores.push({
        id: 'sc-' + rec.studentId + '-' + rec.subject + '-平时作业-' + rec.term,
        studentId: rec.studentId,
        classId: rec.classId,
        subject: rec.subject,
        examName: '平时作业',
        // 平时分通常略高于卷面分（作业、课堂表现给分宽松）
        score: Math.min(100, Math.max(45, rec.score + randInt(-6, 12))),
        credit: '',
        nature: rec.nature || '',
        date: usualDateOf[rec.term] || rec.date,
        term: rec.term,
        createdAt: nowIso
      });
    });

    /* 4. 考勤：最近 15 天（跳过周末），含今天 */
    var attendance = [];
    for (var d = 15; d >= 0; d--) {
      var dateStr = Utils.daysAgo(d);
      var weekday = new Date(dateStr + 'T00:00:00').getDay();
      if (weekday === 0 || weekday === 6) continue; // 周末不记录
      students.forEach(function (stu) {
        var r = rand();
        var status = r < 0.9 ? '出勤' : (r < 0.93 ? '迟到' : (r < 0.96 ? '请假' : '缺勤'));
        attendance.push({
          id: 'att-' + dateStr + '-' + stu.id,
          date: dateStr,
          classId: stu.classId,
          studentId: stu.id,
          status: status,
          term: Store.termOfDate(dateStr),
          createdAt: nowIso
        });
      });
    }

    /* 5. 请假审批示例：1 条待审批、1 条已批准（联动考勤）、1 条已驳回 */
    var leaves = [
      {
        id: 'lv-1', studentId: students[35].id, classId: 'cls-4', term: curTerm,
        startDate: dateOffset(3), endDate: dateOffset(4),
        reason: '家中有事需返乡一趟，特申请请假两天，期间课程我会自行补上。',
        status: '待审批', submitTime: Utils.nowStr(), createdAt: nowIso
      },
      {
        id: 'lv-2', studentId: students[3].id, classId: 'cls-1', term: curTerm,
        startDate: Utils.daysAgo(9), endDate: Utils.daysAgo(8),
        reason: '突发肠胃炎需要就医休养，附医院诊断证明。',
        status: '已批准', reviewer: '王建国', reviewTime: Utils.daysAgo(9) + ' 08:30', reviewNote: '',
        submitTime: Utils.daysAgo(10) + ' 20:15', createdAt: nowIso
      },
      {
        id: 'lv-3', studentId: students[13].id, classId: 'cls-2', term: curTerm,
        startDate: Utils.daysAgo(6), endDate: Utils.daysAgo(6),
        reason: '有事',
        status: '已驳回', reviewer: '李秀芳', reviewTime: Utils.daysAgo(6) + ' 09:00', reviewNote: '事由不明确，请补充请假材料后再提交。',
        submitTime: Utils.daysAgo(6) + ' 08:10', createdAt: nowIso
      }
    ];
    // 已批准的请假写入考勤（按工作日：跳过周末与法定节假日），保证数据一致
    leaves.forEach(function (lv) {
      if (lv.status !== '已批准') return;
      var cur = new Date(lv.startDate + 'T00:00:00');
      var end = new Date(lv.endDate + 'T00:00:00');
      while (cur <= end) {
        var ds = Utils.formatDate(cur);
        var isWork = (typeof CnCalendar !== 'undefined') ? CnCalendar.isWorkday(ds) : (cur.getDay() !== 0 && cur.getDay() !== 6);
        if (isWork) {
          attendance.forEach(function (a) {
            if (a.studentId === lv.studentId && a.date === ds) a.status = '请假';
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    /* 6. 通知（双频道：
     *   辅导员通知 = 学工/学校事务（运动会、晚自习、放假、奖学金等，由辅导员传达）
     *   教师通知   = 教学事务（作业、答疑、考试复习等，由任课教师发布）） */
    var notices = [
      {
        id: 'ntc-1', title: '国庆节放假安排通知',
        content: '根据学校统一安排，10月1日至10月7日放假，共7天，10月8日正常上课。请同学们合理安排假期时间，认真完成作业，注意交通与人身安全；假期离校同学请向辅导员报备行程。',
        channel: '辅导员通知', classId: '', publisher: '系统管理员', publisherId: 'u-admin',
        publishTime: Utils.daysAgo(2) + ' 10:00', createdAt: nowIso
      },
      {
        id: 'ntc-2', title: '秋季运动会报名',
        content: '学校秋季运动会定于下月举行，想参加的同学请到体育委员处报名。项目包括：100米、800米、跳远、铅球、4×100米接力等。',
        channel: '辅导员通知', classId: 'cls-4', publisher: '沈嘉禾', publisherId: 'u-teacher4',
        publishTime: Utils.daysAgo(1) + ' 15:30', createdAt: nowIso
      },
      {
        id: 'ntc-3', title: '新生晚自习安排',
        content: '本班晚自习时间为周一至周四 19:00—21:00，地点在教学楼 A305。请全体同学按时参加，考勤纳入综合测评。',
        channel: '辅导员通知', classId: 'cls-4', publisher: '沈嘉禾', publisherId: 'u-teacher4',
        publishTime: Utils.daysAgo(1) + ' 17:20', createdAt: nowIso
      },
      {
        id: 'ntc-4', title: '大学英语四六级考试报名通知',
        content: '2026年下半年全国大学英语四、六级考试报名已开始，报名截止 10 月 12 日。请需要报名的同学登录全国大学英语四六级考试报名网（cet-bm.neea.edu.cn）完成报名与缴费，逾期不再补报。',
        channel: '辅导员通知', classId: 'cls-4', publisher: '沈嘉禾', publisherId: 'u-teacher4',
        publishTime: Utils.daysAgo(0) + ' 09:10', createdAt: nowIso
      },
      {
        id: 'ntc-5', title: '关于开展 2025-2026 学年国家奖学金评选工作的通知',
        content: '根据学校学生工作处通知，2025-2026 学年国家奖学金评选工作现已启动：评选对象为全日制大二以上（含大二）特别优秀学生，专升本同学自进入本科第二年（即本学期）起可申请；奖励标准为每人 10000 元（全校本科生 17 名、专科生 1 名）。\n具体安排：9 月 23 日—10 月 8 日学生向学院提交申请及获奖证明；10 月 14 日学校在晴川剧场举行竞评大会（入围同学进行 4 分钟 PPT 演讲）；10 月 16 日—10 月 22 日在学工处官网公示 5 个工作日。\n请符合条件的同学抓紧准备材料，按时提交，逾期不再受理。',
        channel: '辅导员通知', classId: 'cls-4', publisher: '沈嘉禾', publisherId: 'u-teacher4',
        publishTime: Utils.daysAgo(3) + ' 18:00', createdAt: nowIso
      },
      {
        id: 'ntc-6', title: '《软件工程》课程作业提交提醒',
        content: '第三章需求分析作业请于本周五 18:00 前提交至课程平台，迟交按 80% 计分。有疑问可在课间或答疑时间交流。',
        channel: '教师通知', classId: 'cls-4', publisher: '王建国', publisherId: 'u-teacher1',
        publishTime: Utils.daysAgo(0) + ' 11:40', createdAt: nowIso
      },
      {
        id: 'ntc-7', title: '《数据结构》答疑时间调整',
        content: '本周答疑时间调整为周四下午 15:00—17:00，地点实验楼 B204。请需要答疑的同学按时前往。',
        channel: '教师通知', classId: 'cls-1', publisher: '王建国', publisherId: 'u-teacher1',
        publishTime: Utils.daysAgo(2) + ' 14:30', createdAt: nowIso
      }
    ];

    /* 7. 用户（默认账号，密码为 "123456" 的 SHA-256 摘要，不存明文）
     * 教师：teacherClassIds 任教班级数组（可跨班）、teacherType 编制类型、外聘含聘期 */
    var users = [
      { id: 'u-admin', username: 'admin', password: Store.HASH_123456, name: '系统管理员', role: 'admin', teacherType: '', validUntil: '', teacherClassIds: [], classId: '', studentId: '', createdAt: nowIso },
      { id: 'u-teacher1', username: 'teacher', password: Store.HASH_123456, name: '王建国', role: 'teacher', post: '教师', teachSubjects: ['数据结构', 'Java程序设计'], teacherTitle: '副教授', teacherType: '专任', validUntil: '', teacherClassIds: ['cls-1', 'cls-4'], classId: 'cls-1', studentId: '', createdAt: nowIso },
      { id: 'u-teacher2', username: 'teacher2', password: Store.HASH_123456, name: '李秀芳', role: 'teacher', post: '教师', teachSubjects: ['高等数学', '大学英语'], teacherTitle: '讲师', teacherType: '专任', validUntil: '', teacherClassIds: ['cls-2', 'cls-5'], classId: 'cls-2', studentId: '', createdAt: nowIso },
      { id: 'u-teacher3', username: 'teacher3', password: Store.HASH_123456, name: '张伟', role: 'teacher', post: '教师', teachSubjects: ['Java程序设计'], teacherTitle: '工程师', teacherType: '外聘', validUntil: '2027-07-15', teacherClassIds: ['cls-3', 'cls-6'], classId: 'cls-3', studentId: '', createdAt: nowIso },
      /* 学生演示账号绑定演示学生林一舟（计科20252302班），数据为合成演示数据 */
      /* 辅导员账号：沈嘉禾（计科20252302班辅导员，负责本班学生日常与安全动向；虚构人员） */
      { id: 'u-teacher4', username: 'counselor', password: Store.HASH_123456, name: '沈嘉禾', role: 'teacher', post: '辅导员', alsoTeach: false, teachSubjects: [], teacherTitle: '讲师', teacherType: '专任', validUntil: '', teacherClassIds: ['cls-4'], classId: 'cls-4', studentId: '', createdAt: nowIso },
      { id: 'u-student', username: 'student', password: Store.HASH_123456, name: '林一舟', role: 'student', teacherType: '', validUntil: '', teacherClassIds: [], classId: 'cls-4', studentId: 'stu-4-0', createdAt: nowIso },
      /* 评审演示账号：辅导员 + 兼任授课，可见全部 6 个班级的两条业务线（评委演示专用） */
      { id: 'u-judge', username: 'judge', password: Store.HASH_123456, name: '评审专家', role: 'teacher', post: '辅导员', alsoTeach: true, teachSubjects: [], teacherTitle: '讲师', teacherType: '专任', validUntil: '', teacherClassIds: ['cls-1', 'cls-2', 'cls-3', 'cls-4', 'cls-5', 'cls-6'], classId: 'cls-4', studentId: '', createdAt: nowIso }
    ];

    /* 8. 通知已读回执示例：学生账号已读国庆通知 */
    var noticeReads = { 'ntc-1': ['student'] };

    /* 8. 课堂功能示例：作业（1 份进行中 + 2 份提交）与随堂测验（1 场待作答） */
    var assignments = [
      {
        id: 'asg-1', classId: 'cls-4',
        title: '课程作业一：学生成绩管理系统需求分析',
        requirement: '结合本课程所学内容，撰写成绩管理系统的需求分析报告：\n1. 列出至少 5 条功能需求；\n2. 说明管理员、教师、学生三类角色的权限边界；\n3. 用 200 字以内小结技术可行性。',
        deadline: dateOffset(3) + ' 23:59',
        publishTime: Utils.daysAgo(1) + ' 14:00', createdBy: 'u-teacher1', createdAt: nowIso
      }
    ];
    var submissions = [
      {
        id: 'sub-1', assignmentId: 'asg-1', studentId: 'stu-4-0',
        content: '功能需求：1. 学生信息增删改查与 CSV 批量导入；2. 成绩录入支持单条与按考试批量；3. 考勤按日记录并生成月报预警；4. 请假线上审批并联动考勤；5. 成绩多维度分析（分布/趋势/雷达）。\n角色权限：管理员全局管理，教师限任教班级，学生只读本人数据。\n可行性小结：纯前端 + 本地存储零部署成本，数据层统一出入口便于日后平滑切换后端，技术可行。',
        submitTime: Utils.daysAgo(1) + ' 20:35', score: '', feedback: '',
        status: '已提交', createdAt: nowIso
      },
      {
        id: 'sub-2', assignmentId: 'asg-1', studentId: 'stu-4-1',
        content: '需求分析示例：本系统围绕班级日常管理，覆盖班级、学生、成绩、考勤、请假、通知六大模块……（示例批改样例）',
        submitTime: Utils.daysAgo(1) + ' 19:02', score: 92,
        feedback: '结构清晰，功能覆盖完整，建议补充性能与数据安全等非功能需求。',
        gradedBy: '王建国', gradedTime: Utils.daysAgo(1) + ' 21:10',
        status: '已批改', createdAt: nowIso
      }
    ];
    var quizzes = [
      {
        id: 'qz-1', classId: 'cls-4', title: '软件工程随堂小测', subject: '软件工程',
        durationMin: 10, deadline: dateOffset(7) + ' 23:59',
        publishTime: Utils.daysAgo(1) + ' 14:00', createdBy: 'u-teacher1', createdAt: nowIso,
        questions: [
          { type: '单选', stem: '软件生命周期中，需求分析阶段产出的主要文档是？',
            options: ['需求规格说明书', '概要设计说明书', '测试报告', '用户手册'], answer: 'A', points: 25 },
          { type: '判断', stem: '敏捷开发提倡"可工作的软件高于详尽的文档"。',
            options: ['对', '错'], answer: '对', points: 25 },
          { type: '单选', stem: '黑盒测试主要关注的是？',
            options: ['程序内部结构', '输入与输出', '代码覆盖率', '算法效率'], answer: 'B', points: 25 },
          { type: '多选', stem: '下列属于软件质量特性的有？',
            options: ['正确性', '可维护性', '可移植性', '编译速度'], answer: 'ABC', points: 25 }
        ]
      }
    ];
    var signins = [];     // 课堂签到：示例不含进行中的签到
    var quizAttempts = []; // 测验作答：示例不含已完成记录，便于现场演示自动阅卷

    /* 8b. 学科竞赛（以赛促学）：示例获奖记录（民办高校特色场景） */
    var competitions = [
      {
        id: 'cmp-1', name: '蓝桥杯全国软件和信息技术专业人才大赛（省赛）', level: '省级', award: '二等奖',
        studentIds: ['stu-4-2', 'stu-4-7'], date: '2026-04-18', teacher: '王建国',
        remark: 'C/C++ 程序设计组', createdAt: nowIso
      },
      {
        id: 'cmp-2', name: '中国大学生计算机设计大赛校内选拔赛', level: '校级', award: '一等奖',
        studentIds: ['stu-4-5', 'stu-4-9', 'stu-1-2'], date: '2026-05-20', teacher: '李秀芳',
        remark: '软件开发组', createdAt: nowIso
      },
      {
        id: 'cmp-3', name: '全国大学生计算机应用能力与数字素养大赛', level: '国家级', award: '三等奖',
        studentIds: ['stu-1-4'], date: '2026-06-15', teacher: '王建国', remark: '', createdAt: nowIso
      }
    ];

    /* 8c. 健康日报：近 3 天每人一条（多数健康；今天固定保留 2 例异常用于演示预警） */
    var healthReports = [];
    for (var hd = 2; hd >= 0; hd--) {
      var hdDate = Utils.daysAgo(hd);
      students.forEach(function (stu, idx) {
        var r = rand();
        var status = r < 0.94 ? '健康' : (r < 0.965 ? '咳嗽' : (r < 0.985 ? '其他不适' : '发热'));
        var temp = status === '发热' ? 37.6 + rand() * 0.8 : (status === '健康' ? 36.2 + rand() * 0.9 : 36.5 + rand() * 1.0);
        // 演示用：今天为两位同学固定生成异常（发热 / 低烧），保证教师端预警名单非空
        if (hd === 0 && idx === 31) { status = '发热'; temp = 37.9; }
        if (hd === 0 && idx === 35) { status = '咳嗽'; temp = 37.1; }
        // 演示用：假期出行场景——今天两位同学在外地打卡（辅导员关注校外动向）
        var travelLoc = '';
        if (hd === 0 && idx === 12) travelLoc = '湖北省 · 宜昌市 · 夷陵区 · 三峡大瀑布景区（假期出行）';
        if (hd === 0 && idx === 58) travelLoc = '湖南省 · 长沙市 · 岳麓区 · 橘子洲景区（探亲出行）';
        healthReports.push({
          id: 'hr-' + hdDate + '-' + stu.id,
          date: hdDate, classId: stu.classId, studentId: stu.id,
          temp: Math.round(temp * 10) / 10,
          status: status,
          remark: status === '健康' ? '' : (status === '发热' ? '已在医务室登记，等待复查' : ''),
          // 打卡位置（演示数据：校内宿舍 / 少量校外家中 / 假期出行示例）
          location: travelLoc || (rand() < 0.9
            ? '校内 · 学生宿舍' + randInt(1, 8) + '栋（30.5' + randInt(80, 99) + ', 114.3' + randInt(10, 29) + '）'
            : '校外 · 湖北省武汉市洪山区家中（30.4' + randInt(10, 99) + ', 114.3' + randInt(10, 99) + '）'),
          submitTime: hdDate + ' 08:' + String(randInt(10, 55)),
          createdAt: nowIso
        });
      });
    }

    /* 8d. 班级课表（2026-2027 学年第一学期）
     * 计科20252302班：导入演示教务课表（来源：教务系统导出「计科20252302课表」）
     * 其余班级：通用示例课表。节次为 1~12（上午1-4 / 下午5-8 / 晚上9-12） */
    var timetable = [];
    function addSlot(classId, day, periods, course, teacher, room, weeks) {
      periods.forEach(function (p) {
        timetable.push({
          id: 'tt-' + classId + '-' + day + '-' + p,
          classId: classId, term: '2026-2027-1', day: day, period: p,
          course: course, teacher: teacher, room: room, weeks: weeks || '',
          createdAt: nowIso
        });
      });
    }
    // 计科20252302班 —— 演示课表（2026-09-07 ~ 2027-01-24，共 20 周）
    var realWeeks = '1-3,5-9周';
    addSlot('cls-4', 1, [1, 2, 3, 4], '第二课堂', '周明远', '实2-410', realWeeks);
    addSlot('cls-4', 1, [7, 8], '嵌入式系统应用开发', '顾承泽', '实2-302', realWeeks);
    addSlot('cls-4', 3, [1, 2, 3, 4], '嵌入式系统应用开发', '顾承泽', '实2-303', realWeeks);
    addSlot('cls-4', 5, [1, 2, 3, 4], '大模型应用实践', '林书言', '实2-407', realWeeks);
    // 其余班级：通用示例课表（每班周一至周五，每天 2~4 节）
    var genericCourses = ['高等数学', '大学英语', '数据结构', 'Java程序设计', '计算机网络', '数据库原理'];
    ['cls-1', 'cls-2', 'cls-3', 'cls-5', 'cls-6'].forEach(function (cid, ci) {
      for (var d = 1; d <= 5; d++) {
        var count = 2 + (d + ci) % 3;
        var periods = [];
        for (var p = 0; p < count; p++) periods.push(p + 1);
        var course = genericCourses[(d + ci) % genericCourses.length];
        addSlot(cid, d, periods, course, ['王建国', '李秀芳', '张伟'][(d + ci) % 3], '一教A' + (301 + (ci + d) % 6), '1-18周');
      }
    });

    /* 8e. 奖助记录（依据学校真实奖助体系；林一舟不虚构获奖记录） */
    var scholarships = [
      { id: 'sch-1', studentId: 'stu-4-1', classId: 'cls-4', name: '国家励志奖学金', level: '国家级', amount: 6000, academicYear: '2025-2026', status: '已发放', remark: '家庭经济困难且综合测评班级前 30%', createdAt: nowIso },
      { id: 'sch-2', studentId: 'stu-4-1', classId: 'cls-4', name: '国家助学金（特别困难）', level: '国家级', amount: 4500, academicYear: '2025-2026', status: '已发放', remark: '家庭经济困难认定：特别困难', createdAt: nowIso },
      { id: 'sch-3', studentId: 'stu-4-4', classId: 'cls-4', name: '国家助学金（一般困难）', level: '国家级', amount: 2000, academicYear: '2025-2026', status: '已发放', remark: '家庭经济困难认定：一般困难', createdAt: nowIso },
      { id: 'sch-4', studentId: 'stu-4-6', classId: 'cls-4', name: '国家助学金（困难）', level: '国家级', amount: 3300, academicYear: '2025-2026', status: '已发放', remark: '家庭经济困难认定：困难', createdAt: nowIso },
      { id: 'sch-5', studentId: 'stu-4-9', classId: 'cls-4', name: '晴川奖学金（乙等）', level: '校级', amount: 2000, academicYear: '2025-2026', status: '已公示', remark: '2025 年度校级奖学金评审', createdAt: nowIso },
      { id: 'sch-6', studentId: 'stu-4-12', classId: 'cls-4', name: '晴川助学金（甲等）', level: '校级', amount: 1500, academicYear: '2025-2026', status: '评审中', remark: '已建立家庭经济困难学生档案', createdAt: nowIso }
    ];

    /* 统一入库 */
    this.save('classes', classes);
    this.save('students', students);
    this.save('scores', scores);
    this.save('attendance', attendance);
    this.save('leaves', leaves);
    this.save('notices', notices);
    this.save('users', users);
    this.save('assignments', assignments);
    this.save('submissions', submissions);
    this.save('quizzes', quizzes);
    this.save('signins', signins);
    this.save('quizAttempts', quizAttempts);
    this.save('competitions', competitions);
    this.save('scholarships', scholarships);
    this.save('healthReports', healthReports);
    this.save('timetable', timetable);
    this.write(Store.KEYS.noticeReads, noticeReads);
  }
};
