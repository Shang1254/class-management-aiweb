/* =====================================================
 * 认证与权限：登录 / 退出 / 会话保持 / 角色判断 / 数据范围
 * 角色：admin 管理员（全部权限）
 *       teacher 教师（管理自己班级的学生、成绩、考勤，可发通知）
 *       student 学生（只读查看自己的信息、成绩、考勤和通知）
 *
 * 安全设计（论文「系统安全设计」章节素材）：
 * 1. 密码使用 SHA-256 摘要存储（Web Crypto API），不保存明文；
 *    旧数据中的明文密码在登录成功后自动升级为摘要存储。
 * 2. 登录失败连续 5 次锁定账号 5 分钟，防暴力破解。
 * 3. 登录成功 / 失败 / 退出均写入操作日志（审计追踪）。
 * ===================================================== */

const Auth = {
  ROLES: { admin: '管理员', teacher: '教师', student: '学生' },

  /** 会话有效期：12 小时（机房共用电脑等场景自动登出，防止会话残留） */
  SESSION_TTL_MS: 12 * 60 * 60 * 1000,

  /** 连续失败多少次后锁定 */
  MAX_FAILS: 5,
  /** 锁定时长（毫秒） */
  LOCK_MS: 5 * 60 * 1000,

  /**
   * 登录：校验用户名密码，成功则写入会话（实现登录状态保存）
   * @returns {Promise<object>} 用户对象
   * @throws {Error} 中文错误信息（用户不存在 / 密码错误 / 已锁定）
   */
  async login(username, password) {
    username = String(username || '').trim();
    password = String(password || '');
    if (!username || !password) throw new Error('请输入用户名和密码');

    // 锁定检查：连续失败达到上限后，在锁定时间窗内拒绝登录
    var fails = Store.read(Store.KEYS.loginFails, { count: 0, lockedUntil: 0 });
    var now = Date.now();
    if (fails.lockedUntil > now) {
      var mins = Math.ceil((fails.lockedUntil - now) / 60000);
      throw new Error('失败次数过多，账号已临时锁定，请约 ' + mins + ' 分钟后再试');
    }

    var users = Store.list('users');
    var user = users.find(function (u) { return u.username === username; });
    if (!user) {
      this._recordFail(fails, now);
      Store._log('系统', '登录失败', '用户不存在：' + username);
      throw new Error('用户不存在，请检查用户名');
    }

    if (!(await this._checkPassword(user, password))) {
      this._recordFail(fails, now);
      Store._log('系统', '登录失败', '密码错误：' + username);
      throw new Error('密码错误，请重新输入');
    }

    // 外聘教师聘期校验：聘期已过则拒绝登录（账号保留，续期后可恢复）
    if (user.role === 'teacher' && user.validUntil && user.validUntil < Utils.today()) {
      Store._log('系统', '登录失败', '外聘教师聘期已到：' + username + '（聘期至 ' + user.validUntil + '）');
      throw new Error('该外聘教师账号聘期已到（' + user.validUntil + '），请联系管理员续期');
    }

    // 登录成功
    return this._startSession(user, '账号密码');
  },

  /**
   * 建立会话（所有登录方式的唯一出口：密码登录 / 统一身份认证 / 将来的企业微信等）
   * @param {object} user 本地用户记录
   * @param {string} via  登录方式（写入审计日志，便于追溯「谁通过什么方式进来的」）
   */
  _startSession(user, via) {
    Store.write(Store.KEYS.loginFails, { count: 0, lockedUntil: 0 });
    Store.write(Store.KEYS.session, {
      userId: user.id, loginTime: new Date().toISOString(), via: via || '账号密码'
    });
    Store._log('系统', '登录成功', (user.name || user.username) + '（' + Auth.roleName(user.role) + '）· ' + (via || '账号密码'));
    return user;
  },

  /* =====================================================
   * 统一身份认证（CAS）预留接入点
   * -----------------------------------------------------
   * 学校使用正方统一身份认证（ca.qcuwh.edu.cn）。正式对接的时序是：
   *   ① 浏览器跳转 CAS 登录页，带 service=<后端回调地址>；
   *   ② CAS 回调后端并带回 ticket；
   *   ③ **后端**用 serviceValidate 验签，取到学号/工号与姓名；
   *   ④ 后端映射成本系统的用户（见 mapExternalIdentity），调用下面的 loginAsExternal() 完成单点登录。
   * 注意：ticket 校验必须在服务端完成——浏览器端无法验证票据真伪，这也是本系统
   * 不直接访问学校系统的原因之一（合规与安全边界见《集成方案》文档）。
   * ===================================================== */
  SSO: { enabled: false, protocol: 'CAS 3.0', entry: 'https://ca.qcuwh.edu.cn' },

  /** 把外部身份（学号/工号 + 姓名）映射为本系统的用户记录；找不到返回 null */
  mapExternalIdentity(profile) {
    var p = profile || {};
    var users = Store.list('users');
    // 1) 优先用学号/工号匹配（管理员可把学校账号写进 users[].extId）
    if (p.extId) {
      var byExt = users.filter(function (u) { return String(u.extId || '') === String(p.extId); })[0];
      if (byExt) return byExt;
    }
    // 2) 学号对应学生档案 → 绑定该学生档案的用户
    if (p.studentNo) {
      var stu = Store.list('students').filter(function (s) { return String(s.studentNo) === String(p.studentNo); })[0];
      if (stu) {
        var byStu = users.filter(function (u) { return u.studentId === stu.id; })[0];
        if (byStu) return byStu;
      }
    }
    // 3) 最后按用户名（学号/工号即用户名时）兜底
    if (p.username) {
      var byName = users.filter(function (u) { return u.username === p.username; })[0];
      if (byName) return byName;
    }
    return null;
  },

  /**
   * 单点登录（由「已完成服务端验签」的宿主页面调用）
   * @param {object} profile {trusted:true, extId?, studentNo?, username?, name?}
   * @returns {object} 用户记录
   * @throws {Error} 未标记可信 / 找不到对应账号
   */
  loginAsExternal(profile) {
    var p = profile || {};
    if (!p.trusted) {
      throw new Error('统一身份认证登录必须由服务端验签后调用（profile.trusted 未置位）');
    }
    var user = this.mapExternalIdentity(p);
    if (!user) {
      Store._log('系统', '登录失败', '统一身份认证通过但系统内无对应账号：' + (p.extId || p.studentNo || p.username || '未知'));
      throw new Error('统一身份认证已通过，但系统中没有对应的账号（学号 ' + (p.studentNo || p.extId || '') +
        '）：请先在「用户管理 / 学生管理」建立账号，或联系管理员绑定。');
    }
    if (user.role === 'teacher' && user.validUntil && user.validUntil < Utils.today()) {
      throw new Error('该外聘教师账号聘期已到（' + user.validUntil + '），请联系管理员续期');
    }
    return this._startSession(user, '统一身份认证（CAS）');
  },

  /**
   * 校验密码：兼容两种存储格式
   * - SHA-256 摘要（新格式）：对输入做摘要后比对
   * - 明文（旧数据兼容）：直接比对，成功后自动升级为摘要存储
   */
  async _checkPassword(user, password) {
    var stored = String(user.password || '');
    if (Utils.isSha256Hex(stored)) {
      return (await Utils.sha256(password)) === stored.toLowerCase();
    }
    if (stored === password) {
      Store.update('users', user.id, { password: await Utils.sha256(password) });
      return true;
    }
    return false;
  },

  /** 记录一次登录失败；连续达到上限则锁定一段时间 */
  _recordFail(fails, now) {
    var count = (fails.lockedUntil > now ? 0 : fails.count) + 1;
    if (count >= Auth.MAX_FAILS) {
      Store.write(Store.KEYS.loginFails, { count: 0, lockedUntil: now + Auth.LOCK_MS });
    } else {
      Store.write(Store.KEYS.loginFails, { count: count, lockedUntil: 0 });
    }
  },

  /** 修改当前用户密码（需验证原密码），成功返回 true */
  async changePassword(user, oldPwd, newPwd) {
    if (!(await this._checkPassword(user, oldPwd))) throw new Error('原密码不正确');
    if (!newPwd || String(newPwd).length < 6) throw new Error('新密码至少 6 位');
    if (newPwd === oldPwd) throw new Error('新密码不能与原密码相同');
    Store.update('users', user.id, { password: await Utils.sha256(newPwd) });
    return true;
  },

  /** 退出登录：清除会话并写入审计日志 */
  logout() {
    var user = Auth.currentUser();
    if (user) Store._log('系统', '退出登录', (user.name || user.username));
    Store.clearSession();
  },

  /** 当前登录用户（会话失效或用户被删时自动清理会话，返回 null） */
  currentUser() {
    var sess = Store.read(Store.KEYS.session, null);
    if (!sess || !sess.userId) return null;
    // 会话超时：超过有效期自动失效（需重新登录）
    if (sess.loginTime && (Date.now() - new Date(sess.loginTime).getTime()) > Auth.SESSION_TTL_MS) {
      Store.clearSession();
      return null;
    }
    var user = Store.getUser(sess.userId);
    if (!user) {
      // 直接清除会话（不能调 logout()，否则会递归）
      Store.clearSession();
      return null;
    }
    return user;
  },

  /** 角色中文名 */
  roleName(role) { return Auth.ROLES[role] || role; },

  isAdmin(user) { return !!user && user.role === 'admin'; },
  isTeacher(user) { return !!user && user.role === 'teacher'; },
  isStudent(user) { return !!user && user.role === 'student'; },

  /** 辅导员：教师岗位为「辅导员」（健康日报、校外动向等学生管理专属功能） */
  /** 是否可见学生敏感信息（家长电话等）：管理员与辅导员可见，任课教师不可见 */
  canSeeSensitive(user) {
    if (!user) return false;
    return user.role === 'admin' || Auth.isCounselor(user);
  },

  isCounselor(user) {
    return Auth.isTeacher(user) && (user.post === '辅导员' ||
      (Array.isArray(user.duties) && user.duties.indexOf('辅导员') !== -1));
  },

  /** 是否可编辑数据（学生只读） */
  canEdit(user) { return Auth.isAdmin(user) || Auth.isTeacher(user); },

  /** 教师的任教班级 ID 列表（兼容旧数据的单 classId 字段） */
  teacherClassIds(user) {
    if (!user) return [];
    if (Array.isArray(user.teacherClassIds) && user.teacherClassIds.length) return user.teacherClassIds;
    return user.classId ? [user.classId] : [];
  },

  /**
   * 当前用户可见的班级列表
   * 管理员：全部班级；教师：任教的所有班级（支持跨班）；学生：所在班级
   */
  visibleClasses(user) {
    var all = Store.list('classes');
    if (Auth.isAdmin(user)) return all;
    if (Auth.isTeacher(user)) {
      var ids = this.teacherClassIds(user);
      return all.filter(function (c) { return ids.indexOf(c.id) !== -1; });
    }
    if (user && user.classId) return all.filter(function (c) { return c.id === user.classId; });
    return [];
  },

  /**
   * 当前用户可见数据的班级 ID 集合（用于按班级过滤成绩/考勤等）
   * 管理员：全部班级 ID；教师：任教班级数组；学生：所在班级 ID
   */
  scopeClassIds(user) {
    if (!user) return [];
    if (Auth.isAdmin(user)) return Store.list('classes').map(function (c) { return c.id; });
    if (Auth.isTeacher(user)) {
      var ids = this.teacherClassIds(user);
      var exist = {};
      Store.list('classes').forEach(function (c) { exist[c.id] = true; });
      return ids.filter(function (id) { return exist[id]; });
    }
    return user.classId ? [user.classId] : [];
  },

  /** 当前用户可见的学生列表 */
  visibleStudents(user) {
    var ids = this.scopeClassIds(user);
    return Store.list('students').filter(function (s) { return ids.indexOf(s.classId) !== -1; });
  }
};
