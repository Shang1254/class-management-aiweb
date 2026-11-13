/* =====================================================
 * 资料下载中心（学生端 / 教师端通用）
 * 三类资料：
 *  ① 学校官方原表（随系统分发，直接下载）——来自学工处官网「下载中心」公开表格
 *  ② 系统整理版（依据学校公开通知与管理办法整理，可直接打印填写）
 *  ③ 官网在线下载 / 政策通知（学校附件受官网验证码保护，提供官网入口）
 * 数据来源：学生工作处官网 xgc.qcuwh.edu.cn（2026-10 查阅，页面内标注发布日期）
 * 依据文件：晴川学字〔2020〕7 号（国奖评审办法）、武汉晴川学字〔2020〕4 号 / 鄂教助〔2020〕1 号（困难认定）
 * 管理员/辅导员可添加「外链资料」（存 cms_downloads），供学校下发新文件时不改代码即可上架
 * ===================================================== */

Pages.downloads = function (container, user) {
  var CATS = ['奖助学金', '学籍考务', '证明·日常', '学生事务', '学工工作用表', '教学工作用表'];
  var CAT_ICON = { '奖助学金': '助', '学籍考务': '籍', '证明·日常': '证', '学生事务': '务',
    '学工工作用表': '辅', '教学工作用表': '教' };
  var canManage = Auth.isAdmin(user) || Auth.isCounselor(user);
  var isStudentView = Auth.isStudent(user);   // 学生看到的是「资料下载」，教师/辅导员看到的是「资料管理」
  /* ---------- 角色分层（学生 / 辅导员 / 教师三条线各自一份清单）----------
   * 辅导员：学工线（学生工作文档 + 下发给学生的奖助表格）
   * 任课教师：教学线（教学文档 + 需要教师签意见的重修/缓考表）
   * 辅导员「兼任授课」时两条线都看（与菜单里的兼任授课开关一致）
   * 管理员：全部 */
  var isCounselorRole = Auth.isCounselor(user);
  var teachLine = !isStudentView && (Auth.isAdmin(user) || (Auth.isTeacher(user) && !isCounselorRole) ||
    (isCounselorRole && !!user.alsoTeach));
  var counselLine = !isStudentView && (Auth.isAdmin(user) || isCounselorRole);
  function audOK(aud) {
    if (Auth.isAdmin(user)) return true;   // 管理员：全部（含面向学生的资料）
    var a = aud || ['student', 'counselor', 'teacher'];   // 未标注的老数据按「全体可见」处理（含历史自定义条目）
    if (isStudentView) return a.indexOf('student') !== -1;
    return (counselLine && a.indexOf('counselor') !== -1) || (teachLine && a.indexOf('teacher') !== -1);
  }
  var LINE_LABEL = isStudentView ? '学生'
    : (counselLine && teachLine && (isCounselorRole && user.alsoTeach) ? '学工线 + 教学线（兼任授课）'
      : (teachLine && !counselLine ? '教学线' : (counselLine && !teachLine ? '学工线' : '全部')));
  var state = { cat: '', q: '' };
  var F = 'files/';                       // 静态资料根目录
  var SRC_OFFICIAL = 'files/学校原表/';    // 学校官方原表
  var SRC_COMPILED = 'files/系统整理版/';  // 系统整理版

  /* ---------- ① 学校官方原表（学工处下载中心，已收录） ---------- */
  var OFFICIAL = [
    { name: '学生证补办申请表', aud: ['student'], cat: '学籍考务', file: SRC_OFFICIAL + '学生证补办申请表.doc', date: '2025-03-24',
      who: '全体学生', desc: '学生证遗失、损坏后申请补办的官方表格',
      steps: ['填写本表，粘贴近期一寸免冠照片', '辅导员核实签字', '学院审核盖章', '交学工处办理（综合楼一 108）'],
      where: '学工处（综一 108）', from: '学工处官网 · 下载中心' },
    { name: '休（复）学审批表', aud: ['student', 'counselor'], cat: '学籍考务', file: SRC_OFFICIAL + '休（复）学审批表.doc', date: '2025-03-24',
      who: '全体学生', desc: '办理休学、复学手续的官方审批表',
      steps: ['本人填写申请并附相关证明材料', '辅导员签署意见', '学院审核', '教务处审批并办理学籍异动'],
      where: '教务处学籍科', from: '学工处官网 · 下载中心' },
    { name: '学生离校程序单', aud: ['student'], cat: '学籍考务', file: SRC_OFFICIAL + '学生离校程序单.doc', date: '2025-03-24',
      who: '毕业生 / 退学学生', desc: '毕业、退学离校时办理图书、宿舍、财务等清退手续',
      steps: ['领取程序单', '按单逐一办理图书归还、宿舍清退、费用结清等', '各环节签字盖章', '交回学院/学工处存档'],
      where: '学院办公室', from: '学工处官网 · 下载中心' },
    { name: '学生诚信考试承诺书', aud: ['student', 'teacher'], cat: '证明·日常', file: SRC_OFFICIAL + '学生诚信考试承诺书.doc', date: '2025-03-24',
      who: '全体学生', desc: '期末考试前签署的诚信考试承诺书（官方版）',
      steps: ['考前由学院/班级统一发放', '本人阅读并签名', '交学院存档'],
      where: '学院统一组织', from: '学工处官网 · 下载中心' },
    { name: '拒绝乘坐非法营运车辆安全责任告知书', aud: ['student', 'counselor'], cat: '证明·日常', file: SRC_OFFICIAL + '拒绝乘坐非法营运车辆安全责任告知书.docx', date: '2024-10-01',
      who: '全体学生', desc: '假期出行安全提示，学生与家长签字后交学院存档',
      steps: ['放假前领取或自行下载打印', '本人与家长阅读签字', '交辅导员/学院存档'],
      where: '辅导员统一组织', from: '学工处官网 · 下载中心' },
    { name: '学生素质综合测评表2025', aud: ['student', 'counselor'], cat: '学生事务', file: SRC_OFFICIAL + '学生素质综合测评表2025.docx', date: '2025-09-01',
      who: '全体学生', desc: '综合素质测评使用（奖助学金、评优评先的重要依据）',
      steps: ['按学年填写德育、智育、体育等各项', '班级测评小组审核', '学院汇总公示'],
      where: '辅导员统一组织', from: '学工处官网 · 下载中心' },
    { name: '宿舍调整申请表', aud: ['student', 'counselor'], cat: '学生事务', file: SRC_OFFICIAL + '宿舍调整申请表.docx', date: '2022-09-01',
      who: '全体学生', desc: '申请调换宿舍的官方表格',
      steps: ['填写申请并说明理由', '现宿舍楼管与目标宿舍楼管签署意见', '辅导员审核', '学工处公寓管理部门审批'],
      where: '学工处公寓管理', from: '学工处官网 · 下载中心' },
    { name: '学生解除处分申请审批表', aud: ['student', 'counselor'], cat: '学生事务', file: SRC_OFFICIAL + '学生解除处分申请审批表.docx', date: '2024-10-01',
      who: '受处分学生', desc: '处分期满后申请解除处分的官方审批表',
      steps: ['本人提交申请及处分期内表现材料', '辅导员与班级评议', '学院审核', '学工处审批'],
      where: '学工处', from: '学工处官网 · 下载中心' }
  ];

  /* ---------- ② 系统整理版（依据学校公开通知/办法整理，可打印填写） ---------- */
  var COMPILED = [
    { name: '国家奖学金申请审批表', aud: ['student', 'counselor'], cat: '奖助学金', file: SRC_COMPILED + '国家奖学金申请审批表.docx', date: '2026-10-04',
      who: '大二及以上学生（专升本第 2 年起）', desc: '10000 元/人·学年；含成绩排名、获奖情况、申请理由与三级审批栏',
      steps: ['填写本表', '附教务盖章成绩单、学院盖章综合素质测评汇总表、获奖证书复印件', '另附个人事迹报告（纸质+电子版）', '交学院初评'],
      where: '学工处大学生资助中心（综一 108，027-87934608）', from: '依据晴川学字〔2020〕7 号及当学年评选通知整理' },
    { name: '国家励志奖学金申请审批表', aud: ['student', 'counselor'], cat: '奖助学金', file: SRC_COMPILED + '国家励志奖学金申请审批表.docx', date: '2026-10-04',
      who: '品学兼优的家庭经济困难学生', desc: '6000 元/人·学年；须先完成家庭经济困难认定',
      steps: ['先完成困难认定', '填写本表并附成绩单、获奖证书', '辅导员/学院签署意见', '学校审批公示'],
      where: '学工处大学生资助中心', from: '依据学校公开奖助标准整理' },
    { name: '国家助学金申请审批表', aud: ['student', 'counselor'], cat: '奖助学金', file: SRC_COMPILED + '国家助学金申请审批表.docx', date: '2026-10-04',
      who: '家庭经济困难学生', desc: '按认定档次（特别困难/困难/一般困难）分档发放',
      steps: ['先完成困难认定', '填写本表并填写申请档次', '班级民主评议', '学院意见 → 学校审批'],
      where: '学工处大学生资助中心', from: '依据学校公开奖助标准整理' },
    { name: '家庭经济困难学生认定申请表', aud: ['student', 'counselor'], cat: '奖助学金', file: SRC_COMPILED + '家庭经济困难学生认定申请表.docx', date: '2026-10-04',
      who: '需申请资助的学生', desc: '认定结果为本学年各项资助的基础（湖北省统一表见官网通知附件）',
      steps: ['秋季学期开学初填写本表', '附《量化表》及家庭情况证明', '班级认定评议小组民主评议', '学院认定 → 学校核准 → 公示建档'],
      where: '辅导员 / 学院（学校通知：学生工作处大学生资助中心）', from: '依据 2026 年秋季学期认定通知（鄂教助〔2020〕1 号、武汉晴川学字〔2020〕4 号）整理' },
    { name: '晴川奖助学金申请审批表', aud: ['student', 'counselor'], cat: '奖助学金', file: SRC_COMPILED + '晴川奖助学金申请审批表.docx', date: '2026-10-04',
      who: '全体学生（助学金须先认定）', desc: '校级：奖学金甲/乙/丙等 3000/2000/1000 元；助学金甲/乙等 1500/1000 元',
      steps: ['填写本表并勾选申请项目', '辅导员签署意见', '学院审核', '学校审批公示'],
      where: '学工处大学生资助中心', from: '依据学校公开奖助标准整理' },
    { name: '奖助学金申请指南', aud: ['student', 'counselor'], cat: '奖助学金', file: SRC_COMPILED + '奖助学金申请指南.docx', date: '2026-10-04',
      who: '全体学生', desc: '奖助项目一览、五步申请流程、秋季学期时间安排、材料清单与咨询方式',
      steps: ['阅读了解各奖助项目条件与金额', '对照时间安排提前准备材料', '按要求提交申请'],
      where: '学工处大学生资助中心', from: '按学生工作处公开信息整理' },
    { name: '课程重修申请表', aud: ['student', 'teacher'], cat: '学籍考务', file: SRC_COMPILED + '课程重修申请表.docx', date: '2026-10-04',
      who: '有不及格课程的学生', desc: '参考模板；重修报名与安排以教务处当学期通知为准',
      steps: ['在「我的成绩」确认不及格课程', '填写本表', '任课教师/开课学院签署意见', '教务处审核并办理重修'],
      where: '教务处 / 开课学院', from: '参考模板（教务处未公开直链表格）' },
    { name: '缓考申请表', aud: ['student', 'teacher'], cat: '学籍考务', file: SRC_COMPILED + '缓考申请表.docx', date: '2026-10-04',
      who: '考试前因病/因事无法参加考试的学生', desc: '参考模板；因病一般须附医院证明',
      steps: ['考试前提出申请并附证明', '辅导员签署意见', '学院审核', '教务处审批'],
      where: '教务处考务科', from: '参考模板（教务处未公开直链表格）' },
    { name: '在读证明（模板）', aud: ['student'], cat: '证明·日常', file: SRC_COMPILED + '在读证明（模板）.docx', date: '2026-10-04',
      who: '全体学生', desc: '用于助学贷款、实习、报名等用途；正式证明须盖章有效',
      steps: ['下载并填写个人信息（也可在「我的信息」中核对）', '提交学院/教务处审核', '加盖公章后生效'],
      where: '学院办公室 / 教务处', from: '系统整理模板' },
    { name: '在读证明（中英文模板）', aud: ['student'], cat: '证明·日常', file: SRC_COMPILED + '在读证明（中英文模板）.docx', date: '2026-10-04',
      who: '全体学生（留学/考研/就业）', desc: '中英文对照在读证明，留学申请、考研复试、就业入职常用',
      steps: ['下载并填写个人信息（姓名/学号/专业以「我的信息」为准）', '提交学院或教务处审核', '加盖公章后生效', '留学用途建议同时申请教务处英文版'],
      place: '学院办公室 / 教务处', from: '系统整理模板（中英文对照）' },
    { name: '学业成绩排名证明', aud: ['student'], cat: '证明·日常', file: SRC_COMPILED + '学业成绩排名证明.docx', date: '2026-10-04',
      who: '全体学生（考研/推免/奖学金）', desc: '含加权平均分、GPA 与班级排名，考研复试与推免常用；系统「升学·就业」页可自动生成填好数据的参考稿',
      steps: ['在「升学·就业」页核对成绩与排名', '下载本表并抄录数据（或直接打印系统生成页）', '提交学院/教务处审核盖章'],
      place: '学院办公室 / 教务处', from: '系统整理模板' },
    { name: '课程学分说明（留学申请用）', aud: ['student'], cat: '证明·日常', file: SRC_COMPILED + '课程学分说明（留学申请用）.docx', date: '2026-10-04',
      who: '留学申请学生', desc: '向境外院校说明学分与成绩体系（Course & Credit Statement）',
      steps: ['随英文成绩单一并提交', '填写学分/学时口径说明', '学院盖章；如需课程描述请向开课学院索取'],
      place: '学院办公室 / 教务处', from: '系统整理模板' },
    { name: '学生请假条（纸质模板）', aud: ['student', 'counselor'], cat: '证明·日常', file: SRC_COMPILED + '学生请假条（纸质模板）.docx', date: '2026-10-04',
      who: '全体学生', desc: '线下请假留档用；线上请假请用「我的考勤 → 申请请假」',
      steps: ['填写请假事由与去向（校外请假须家长知情）', '辅导员审批签字', '返校后销假'],
      where: '辅导员', from: '系统整理模板（与线上请假流程配套）' }
  ];

  /* ---------- ②b 工作用表（按岗位分层：学工线 4 份 / 教学线 4 份） ---------- */
  var WORK = [
    { name: '主题班会记录表', cat: '学工工作用表', aud: ['counselor'], file: SRC_COMPILED + '主题班会记录表.docx', date: '2026-10-04',
      who: '辅导员', desc: '班会过程、传达通知、需跟进事项留痕；班会考勤可与「考勤管理」对照',
      steps: ['会前在「通知管理」发布或转发班会通知', '会后填写本表并存档', '需跟进事项纳入学业预警/重点关注跟进'],
      where: '辅导员自留 / 学院学工办备查', from: '系统整理模板（辅导员工作用表）' },
    { name: '学生谈心谈话记录表', cat: '学工工作用表', aud: ['counselor'], file: SRC_COMPILED + '学生谈心谈话记录表.docx', date: '2026-10-04',
      who: '辅导员', desc: '学业/心理/经济/违纪/就业等谈话留痕；属学生隐私材料，注意保管',
      steps: ['谈话前用「学业预警」「学业帮扶」看数据（出勤率/缺交作业/不及格课程）', '谈话后填写本表', '涉心理危机等情形按应急预案立即上报'],
      where: '辅导员自留（涉隐私材料按学校学生档案规定保管）', from: '系统整理模板（辅导员工作用表）' },
    { name: '家校联系记录表', cat: '学工工作用表', aud: ['counselor'], file: SRC_COMPILED + '家校联系记录表.docx', date: '2026-10-04',
      who: '辅导员', desc: '学业预警、请假离校、安全关注等家校沟通留痕',
      steps: ['家长电话在「学生管理」中查看（仅辅导员/管理员可见）', '沟通后填写本表', '涉及安全事项同步上报学院'],
      where: '辅导员自留 / 学院备查', from: '系统整理模板（辅导员工作用表）' },
    { name: '班级安全隐患排查记录表', cat: '学工工作用表', aud: ['counselor'], file: SRC_COMPILED + '班级安全隐患排查记录表.docx', date: '2026-10-04',
      who: '辅导员', desc: '假期前后、开学初的安全排查留痕（宿舍用电/消防/校外住宿/假期出行等）',
      steps: ['节假日前开展排查', '填写本表；重大隐患立即上报', '结合「健康日报 → 校外动向」核对假期外出与校外居住'],
      where: '辅导员自留 / 学院学工办', from: '系统整理模板（辅导员工作用表）' },
    { name: '课程考核与成绩登记表（模板）', cat: '教学工作用表', aud: ['teacher'], file: SRC_COMPILED + '课程考核与成绩登记表（模板）.docx', date: '2026-10-04',
      who: '任课教师', desc: '课程总评构成与成绩登记（纸质留档）；系统内可批量录入并自动合成总评',
      steps: ['在「成绩管理」批量录入平时/期末成绩并合成总评', '打印系统生成的成绩单留档', '按教务处要求完成教务系统录入'],
      where: '任课教师 / 教研室', from: '系统整理模板（任课教师用表）' },
    { name: '试卷分析表（模板）', cat: '教学工作用表', aud: ['teacher'], file: SRC_COMPILED + '试卷分析表（模板）.docx', date: '2026-10-04',
      who: '任课教师', desc: '成绩分布、难易程度、薄弱知识点与改进措施；数据可直接取「成绩分析」页',
      steps: ['考试结束后在「成绩分析」查看分数段/平均分/及格率', '填写本表并交教研室', '随课程材料归入教学档案'],
      where: '任课教师 / 教研室', from: '系统整理模板（任课教师用表）' },
    { name: '教师调（停）课申请表（模板）', cat: '教学工作用表', aud: ['teacher'], file: SRC_COMPILED + '教师调（停）课申请表（模板）.docx', date: '2026-10-04',
      who: '任课教师', desc: '调课/停课/代课/补课申请与审批留痕',
      steps: ['提前填写本表并报教研室、教务处审批', '批准后用「通知管理 → 教师通知」告知学生', '课表变更后按教务导入口径更新「班级课表」'],
      where: '任课教师 / 教研室 / 教务处', from: '系统整理模板（任课教师用表）' },
    { name: '监考安排确认表', cat: '教学工作用表', aud: ['teacher'], file: SRC_COMPILED + '监考安排确认表.docx', date: '2026-10-04',
      who: '任课教师 / 监考教师', desc: '考试监考信息确认、考务要求逐项勾选与异常情况记录',
      steps: ['按教务处/学院监考通知填写确认', '考务要求逐项勾选并签字', '异常情况当场记录并报巡考'],
      where: '监考教师 / 教务处考务办', from: '系统整理模板（任课教师用表）' }
  ];

  /* ---------- ③ 官网在线下载（学校附件受官网验证码保护，仅提供入口） ---------- */
  var LINKS = [
    { name: '湖北省家庭经济困难学生认定申请表（附件2）', aud: ['student', 'counselor'], cat: '奖助学金', url: 'https://xgc.qcuwh.edu.cn/info/1082/6845.htm', date: '2026-09-07',
      who: '非建档立卡户学生', desc: '湖北省统一表；在《关于做好我校 2026 年秋季学期家庭经济困难学生认定工作的通知》附件中下载',
      from: '学工处官网 · 资助事务' },
    { name: '湖北省家庭经济困难学生确认表（附件1）', aud: ['student', 'counselor'], cat: '奖助学金', url: 'https://xgc.qcuwh.edu.cn/info/1082/6845.htm', date: '2026-09-07',
      who: '信息比对确认的一至七类学生', desc: '湖北省统一表，由学院向学生本人或监护人逐一发放并指导填写',
      from: '学工处官网 · 资助事务' },
    { name: '武汉晴川学院困难学生认定量化评分表（附件3）', aud: ['student', 'counselor'], cat: '奖助学金', url: 'https://xgc.qcuwh.edu.cn/info/1082/6845.htm', date: '2026-09-07',
      who: '申请认定的学生', desc: '认定评议小组量化评分使用，每位申请学生的《量化表》粘贴在申请表之后',
      from: '学工处官网 · 资助事务' },
    { name: '国家奖学金候选人基本信息表 / 汇总表 / 管理办法（附件1-3）', aud: ['student', 'counselor'], cat: '奖助学金', url: 'https://xgc.qcuwh.edu.cn/info/1062/7396.htm', date: '2026-10-01',
      who: '国家奖学金申请人', desc: '在 2025-2026 学年国家奖学金评选工作通知附件中下载（含学校管理办法全文）',
      from: '学工处官网 · 通知公告' },
    { name: '生源地信用助学贷款办理通知', aud: ['student', 'counselor'], cat: '奖助学金', url: 'https://xgc.qcuwh.edu.cn/info/1055/7302.htm', date: '2026-06-17',
      who: '家庭经济困难学生', desc: '国家开发银行生源地信用助学贷款申贷条件、办理流程与材料要求',
      from: '学工处官网 · 助学贷款' },
    { name: '勤工助学用工申请表', aud: ['student', 'counselor'], cat: '学生事务', url: 'https://xgc.qcuwh.edu.cn/info/1065/7208.htm', date: '2025-09-28',
      who: '申请勤工助学的学生', desc: '学校官网提供下载（附件下载需通过官网验证码）',
      from: '学工处官网 · 下载中心' },
    { name: '求索报告厅设备使用申请单', aud: ['student', 'counselor'], cat: '学生事务', url: 'https://xgc.qcuwh.edu.cn/info/1065/7207.htm', date: '2026-05-11',
      who: '学生组织 / 班级活动', desc: '在求索报告厅举办活动时申请设备使用',
      from: '学工处官网 · 下载中心' },
    { name: '勤工助学岗位征集通知（2026—2027 学年）', aud: ['student', 'counselor'], cat: '学生事务', url: 'https://xgc.qcuwh.edu.cn/info/1054/7367.htm', date: '2026-09-07',
      who: '全体学生', desc: '了解本学年勤工助学岗位设置与申请要求',
      from: '学工处官网 · 勤工助学' }
  ];

  /* ---------- 秋季学期奖助日历（依据 2026 年秋季学期真实通知整理） ----------
   * 每年 9—10 月为集中申报期；跨年后如日期过期，页面自动显示「已结束」 */
  var CALENDAR = [
    { event: '家庭经济困难认定 · 个人申请与班级评议', start: '2026-09-07', end: '2026-09-20' },
    { event: '家庭经济困难认定 · 学院认定', start: '2026-09-21', end: '2026-09-24' },
    { event: '家庭经济困难认定 · 学校认定', start: '2026-09-28', end: '2026-09-30' },
    { event: '家庭经济困难认定 · 结果公示与建档', start: '2026-10-01', end: '2026-10-07' },
    { event: '国家奖学金 · 学生申请（10 月 8 日截止）', start: '2026-09-23', end: '2026-10-08' },
    { event: '国家奖学金 · 学院初评公示并报送材料', start: '2026-10-09', end: '2026-10-11' },
    { event: '国家奖学金 · 学校审核', start: '2026-10-11', end: '2026-10-13' },
    { event: '国家奖学金 · 竞评大会（晴川剧场 · 4 分钟 PPT 演讲）', start: '2026-10-14', end: '2026-10-14' },
    { event: '国家奖学金 · 学校公示（5 个工作日）', start: '2026-10-16', end: '2026-10-22' }
  ];

  var CUSTOM = function () { return Store.list('downloads'); };

  /* ---------------- 页面文案（按角色分开） ---------------- */
  var PAGE_TITLE = isStudentView ? '资料下载'
    : (teachLine && counselLine && !Auth.isAdmin(user) ? '资料管理 · 学工线 + 教学线'
      : (Auth.isAdmin(user) ? '资料管理 · 全部' : (teachLine ? '资料管理 · 教学线' : '资料管理 · 学工线')));
  var PAGE_DESC = isStudentView
    ? '常用表格一站式下载：<b>学校官方</b>表格为学工处官网公开发布的原件（可直接下载）；<b>系统整理</b>版依据学校公开通知与管理办法整理，供打印填报参考，正式表格以学校发布为准；学校部分附件受官网验证码保护，页面提供<b>官网入口</b>。'
    : (teachLine && !counselLine
      ? '本页为<b>任课教师（教学线）</b>资料：课程考核与成绩登记、试卷分析、调停课、监考安排等工作用表，以及需要教师签署意见的重修/缓考申请表；正式表格以教务处发布为准。'
      : (counselLine && !teachLine
        ? '本页为<b>辅导员（学工线）</b>资料：学生工作用表（班会 / 谈心谈话 / 家校联系 / 安全排查）与下发给学生的奖助、认定类表格；学生端「资料下载」看到的是其中面向学生的部分。'
        : '本页为<b>学工线 + 教学线</b>（兼任授课）资料：学生工作用表、奖助认定表格与教学用表（成绩登记 / 试卷分析 / 调停课 / 监考）；各角色在各自端看到的清单不同。'));

  /* ---------------- 学校官方清单的时效与更新 ----------------
   * 纯前端无法"实时抓取"学校站点（不给跨域头，本系统也不抓取），
   * 因此做成「可更新的清单」：粘贴官网列表 → 解析 → 差异预览 → 一键合并（写入 cms_downloads），
   * 并记录核对时间；超期在页面顶部自动提醒。 */
  function docCheckedAt() { return Store.getPref('docCheckedAt', ''); }
  function daysSinceDocCheck() {
    var t = docCheckedAt();
    if (!t) return null;
    var ts = Date.parse(String(t).replace(' ', 'T'));
    if (isNaN(ts)) return null;
    return Math.floor((Date.now() - ts) / 86400000);
  }
  function freshnessHTML() {
    var d = daysSinceDocCheck();
    var last = docCheckedAt() || '尚未核对';
    var tip, level;
    if (!canManage || isStudentView) {
      // 学生/非管理角色：只说明"以官网为准 + 清单最近核对时间"，不引导他们去做上架操作
      tip = '学校官方表格以学工处官网最新发布为准；系统清单' + (d === null ? '尚未核对过' : '最近核对于 ' + last + (d === 0 ? '（今天）' : '（' + d + ' 天前）')) + '。';
      level = d === null ? 'info' : (d > 90 ? 'warn' : 'ok');
    } else if (d === null) { tip = '学校官方资料清单还没核对过：建议到学工处官网「下载中心 / 通知公告」核对一次，再点「更新学校文件清单」粘贴进来。'; level = 'info'; }
    else if (d > 90) { tip = '学校官方资料已 ' + d + ' 天未核对（上次 ' + last + '）：学期变更后奖助与学籍类表格常会更新，建议立即核对。'; level = 'warn'; }
    else if (d > 30) { tip = '学校官方资料上次核对于 ' + last + '（' + d + ' 天前）：建议每月核对一次，避免用到过期表格。'; level = 'warn'; }
    else { tip = '学校官方资料最近核对：' + last + (d === 0 ? '（今天）' : '（' + d + ' 天前）') + '，与官网一致。'; level = 'ok'; }
    var icon = level === 'ok' ? '✓' : (level === 'warn' ? '!' : 'i');
    var color = level === 'ok' ? 'var(--success)' : (level === 'warn' ? 'var(--warning)' : 'var(--muted)');
    return '<span class="info-ico" style="color:' + color + '">' + icon + '</span><span>' + Utils.escapeHtml(tip) + '</span>' +
      '<span style="margin-left:auto;white-space:nowrap">' +
        '<a class="btn btn-sm btn-ghost" href="https://xgc.qcuwh.edu.cn/xgdt/xzzx.htm" target="_blank" rel="noopener">去官网核对</a>' +
        (canManage && !isStudentView ? ' <button id="btn-dl-update2" class="btn btn-sm btn-ghost" type="button">粘贴更新</button>' : '') +
      '</span>';
  }

  /** 从粘贴的官网列表文本里解析出「名称 + 链接」（只收学校域名的链接，避免把无关链接带进来） */
  function parseSchoolLinks(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    var out = [], lastTitle = '';
    lines.forEach(function (ln) {
      var m = ln.match(/https?:\/\/[^\s"'）)】,，]+/);
      if (m) {
        var url = m[0];
        var host = url.replace(/^https?:\/\//, '').split('/')[0];
        if (!/(^|\.)qcuwh\.(edu\.)?cn$/i.test(host)) return;
        var title = ln.replace(m[0], '').replace(/[|｜,，、\t]+$/, '').trim();
        if (!title) title = lastTitle;
        if (title && title.length >= 4) out.push({ name: title.slice(0, 60), url: url });
        lastTitle = '';
      } else if (ln.length >= 4 && ln.length <= 60 && !/^(首页|下载中心|通知公告|更多|上一页|下一页|返回)$/.test(ln)) {
        lastTitle = ln;
      }
    });
    return out;
  }

  /** 打开「更新学校文件清单」弹窗：粘贴 → 解析 → 差异预览 → 合并 */
  function openUpdate() {
    UI.modal({
      title: '更新学校文件清单',
      wide: true,
      submitText: '解析并预览',
      body:
        '<p style="color:var(--muted);font-size:12.5px;line-height:1.8">' +
          '打开 <b>学工处官网 → 下载中心 / 通知公告</b>（页面上方「去官网核对」可直达），全选复制页面文字，粘贴到下面；' +
          '系统会自动识别其中的<b>文件名与链接</b>（只收录 qcuwh 学校域名），并与现有清单比对。<br>' +
          '说明：本系统为纯前端应用，不会自动抓取学校站点；这一步由你（或学校下发通知后）粘贴更新，属于人工确认的上架流程。</p>' +
        UI.formRow('归类', '<select id="up-cat" class="input">' + CATS.slice(0, 4).map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>') +
        UI.formRow('粘贴官网列表文本', '<textarea id="up-text" class="input" rows="10" placeholder="示例：\n关于开展 2026 年秋季学期家庭经济困难学生认定工作的通知\nhttps://xgc.qcuwh.edu.cn/info/1082/6845.htm"></textarea>', true) +
        '<div id="up-preview" style="margin-top:10px"></div>',
      onSubmit: function (root, close) {
        var text = document.getElementById('up-text').value.trim();
        var cat = document.getElementById('up-cat').value;
        if (!text) return Toast.warning('请先粘贴官网列表文本');
        var parsed = parseSchoolLinks(text);
        if (!parsed.length) return Toast.warning('没有识别到学校域名的链接：请确认复制的是学校官网页面（含 http 链接）');
        var known = {};
        allItems().forEach(function (it) { if (it.url) known[it.url] = it.name; });
        var fresh = parsed.filter(function (x) { return !known[x.url]; });
        var dup = parsed.length - fresh.length;
        document.getElementById('up-preview').innerHTML =
          '<div class="dm-summary">' + UI.badge('识别到 ' + parsed.length + ' 条', 'info') + ' ' +
            UI.badge('新增 ' + fresh.length + ' 条', fresh.length ? 'success' : 'muted') + ' ' +
            UI.badge('已存在 ' + dup + ' 条', 'muted') + '</div>' +
          (fresh.length
            ? '<div class="table-wrap" style="max-height:220px;overflow:auto"><table class="table"><thead><tr><th>名称</th><th>链接</th></tr></thead><tbody>' +
              fresh.map(function (x) { return '<tr><td>' + Utils.escapeHtml(x.name) + '</td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis"><a href="' + Utils.escapeHtml(x.url) + '" target="_blank" rel="noopener">' + Utils.escapeHtml(x.url) + '</a></td></tr>'; }).join('') +
              '</tbody></table></div>' +
              '<div class="toolbar-actions" style="margin-top:10px"><button id="up-merge" class="btn btn-primary" type="button">合并这 ' + fresh.length + ' 条到清单</button></div>'
            : '<p style="color:var(--muted);font-size:12.5px">没有新文件——官网清单与系统内一致。</p>');
        var mergeBtn = document.getElementById('up-merge');
        if (mergeBtn) mergeBtn.addEventListener('click', function () {
          fresh.forEach(function (x) {
            Store.add('downloads', { name: x.name, cat: cat, url: x.url, desc: '学校官网发布（同步自官网清单）', aud: ['student', 'counselor', 'teacher'], addedBy: (user.name || '管理员'), addedAt: Utils.nowStr() });
          });
          Store.setPref('docCheckedAt', Utils.nowStr());
          Store._log('资料管理', '更新学校文件清单', '新增 ' + fresh.length + ' 条（归类：' + cat + '）');
          Toast.success('已合并 ' + fresh.length + ' 条并记录核对时间');
          close();
          Pages.downloads(container, user);   // 重渲染：清单、时效条、统计口径一起刷新
        });
      }
    });
  }

  container.innerHTML =
    '<div class="card">' +
      '<div class="toolbar">' +
        '<div class="toolbar-title">' + PAGE_TITLE + '</div>' +
        '<div class="toolbar-actions">' +
          '<input id="dl-q" class="input" style="width:200px" placeholder="搜索名称…">' +
          (canManage && !isStudentView ? '<button id="btn-dl-update" class="btn btn-ghost" type="button">更新学校文件清单</button>' : '') +
          (canManage && !isStudentView ? '<button id="btn-dl-add" class="btn btn-primary" type="button">＋ 添加资料链接</button>' : '') +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:12px;margin:-6px 0 12px">' + PAGE_DESC + '</p>' +
      '<div id="dl-fresh" class="info-bar" style="margin:0 0 12px"></div>' +
      '<div id="dl-cats" class="att-summary"></div>' +
    '</div>' +
    '<div class="card" id="dl-cal-card">' +
      '<div class="toolbar"><div class="toolbar-title">本学年奖助日历 · 秋季学期</div>' +
        '<span class="chip">依据 2026 年秋季学期通知整理 · 每年 9—10 月为集中申报期</span></div>' +
      '<div id="dl-cal"></div>' +
    '</div>' +
    '<div id="dl-groups"></div>';

  /* ---------------- 奖助日历 ---------------- */
  function renderCalendar() {
    var today = Utils.today();
    var rows = CALENDAR.map(function (c) {
      var st, badge;
      if (today > c.end) { st = 'end'; badge = UI.badge('已结束', 'muted'); }
      else if (today < c.start) {
        var d = daysBetween(today, c.start);
        st = 'wait'; badge = UI.badge(d + ' 天后开始', 'info');
      } else {
        var left = daysBetween(today, c.end);
        st = 'go'; badge = UI.badge(left > 0 ? '进行中 · 还剩 ' + left + ' 天' : '今天是最后一天', 'danger');
      }
      return '<div class="dl-cal-row dl-cal-' + st + '">' +
        '<span class="dl-cal-date">' + c.start.slice(5).replace('-', '/') + ' — ' + c.end.slice(5).replace('-', '/') + '</span>' +
        '<span class="dl-cal-event">' + Utils.escapeHtml(c.event) + '</span>' + badge + '</div>';
    }).join('');
    $('#dl-cal', container).innerHTML = rows;
  }

  function daysBetween(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]), db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / 86400000);
  }

  /* ---------------- 目录与筛选 ---------------- */
  /** 全部资料（已按当前角色/岗位过滤；「共 N 份」等统计都基于本函数，口径一致） */
  function allItems() {
    var list = [];
    OFFICIAL.forEach(function (x, i) { list.push(Object.assign({ src: 'official', id: 'off-' + i }, x)); });
    COMPILED.forEach(function (x, i) { list.push(Object.assign({ src: 'compiled', id: 'cmp-' + i }, x)); });
    WORK.forEach(function (x, i) { list.push(Object.assign({ src: 'work', id: 'wrk-' + i }, x)); });
    LINKS.forEach(function (x, i) { list.push(Object.assign({ src: 'link', id: 'lnk-' + i }, x)); });
    CUSTOM().forEach(function (x) { list.push({ id: x.id, src: 'custom', name: x.name, cat: x.cat, url: x.url, desc: x.desc || '', date: (x.addedAt || '').slice(0, 10), who: '自定义', aud: x.aud || ['student', 'counselor', 'teacher'], from: '由 ' + (x.addedBy || '管理员') + ' 添加' }); });
    return list.filter(function (it) { return audOK(it.aud); });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return allItems().filter(function (it) {
      if (state.cat && it.cat !== state.cat) return false;
      if (q && (it.name + it.desc + it.who + it.cat).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  var SRC_BADGE = {
    official: ['学校官方', 'success'],
    compiled: ['系统整理', 'info'],
    link: ['官网下载', 'warning'],
    custom: ['自定义', 'muted'],
    work: ['工作用表', 'info']
  };
  var SRC_TAG = { official: '（学工处官网原件）', compiled: '（依据公开通知整理）', link: '（学校官网下载）',
    work: '（岗位工作用表）', custom: '' };

  /** 当前角色实际会看到的分类（空分类不显示，避免「学工线」页面出现「教学工作用表 0」这种噪声） */
  function visibleCats() {
    var all = allItems();
    return CATS.filter(function (c) { return all.some(function (x) { return x.cat === c; }); });
  }
  function renderCats() {
    var all = allItems();
    var html = '<span class="chip">' + (isStudentView ? '共 <b>' + all.length + '</b> 份资料' : '<b>' + all.length + '</b> 份资料 · 学生端同步可见') + '</span>';
    html += '<span class="chip' + (state.cat === '' ? ' chip-info' : '') + ' dl-cat-chip" data-cat="">全部</span>';
    visibleCats().forEach(function (c) {
      var n = all.filter(function (x) { return x.cat === c; }).length;
      html += '<span class="chip dl-cat-chip' + (state.cat === c ? ' chip-info' : '') + '" data-cat="' + c + '">' +
        c + ' <b>' + n + '</b></span>';
    });
    return html;
  }

  function render() {
    var fresh = document.getElementById('dl-fresh');
    if (fresh) { fresh.innerHTML = freshnessHTML(); fresh.style.display = 'flex'; bindUpdateButtons(); }
    $('#dl-cats', container).innerHTML = renderCats();
    $$('#dl-cats .dl-cat-chip', container).forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () { state.cat = el.dataset.cat; render(); });
    });

    var cats = state.cat ? [state.cat] : visibleCats();
    var list = filtered();
    var html = '';
    cats.forEach(function (cat) {
      var items = list.filter(function (x) { return x.cat === cat; });
      if (!items.length) return;
      html += '<div class="card">' +
        '<div class="chart-title">' + cat + '</div>' +
        '<div class="dl-grid">' + items.map(itemHTML).join('') + '</div>' +
        '</div>';
    });
    if (!html) html = '<div class="card">' + UI.empty(state.q ? '没有匹配「' + state.q + '」的资料' : '暂无资料') + '</div>';
    $('#dl-groups', container).innerHTML = html;

    $$('#dl-groups [data-info]', container).forEach(function (b) {
      b.addEventListener('click', function () { openInfo(b.dataset.info); });
    });
    $$('#dl-groups [data-del]', container).forEach(function (b) {
      b.addEventListener('click', function () { delCustom(b.dataset.del); });
    });
  }

  function itemHTML(it) {
    var badge = SRC_BADGE[it.src];
    var action = it.src === 'link' || it.src === 'custom'
      ? '<a class="btn btn-sm btn-primary" href="' + Utils.escapeHtml(it.url) + '" target="_blank" rel="noopener">前往官网</a>'
      : '<a class="btn btn-sm btn-primary" href="' + encodeURI(it.file) + '" download>' + (it.src === 'official' ? '下载原表' : '下载 Word') + '</a>';
    return '<div class="dl-item">' +
      '<div class="dl-icon">' + (CAT_ICON[it.cat] || '件') + '</div>' +
      '<div class="dl-body">' +
        '<div class="dl-name">' + Utils.escapeHtml(it.name) + '</div>' +
        '<div class="dl-meta">' + UI.badge(badge[0], badge[1]) +
          '<span class="dl-who">' + Utils.escapeHtml(it.who || '') + '</span>' +
          (it.date ? '<span class="dl-date">更新 ' + Utils.escapeHtml(it.date) + '</span>' : '') + '</div>' +
        '<div class="dl-desc">' + Utils.escapeHtml(it.desc || '') + '</div>' +
        '<div class="dl-actions">' + action +
          '<button class="btn btn-sm btn-ghost" data-info="' + it.id + '" type="button">办理说明</button>' +
          (it.src === 'custom' && canManage ? '<button class="btn btn-sm btn-danger-ghost" data-del="' + it.id + '" type="button">删除</button>' : '') +
        '</div>' +
      '</div></div>';
  }

  /* ---------------- 办理说明弹窗 ---------------- */
  function openInfo(id) {
    var it = allItems().find(function (x) { return x.id === id; });
    if (!it) return;
    var badge = SRC_BADGE[it.src];
    var steps = it.steps && it.steps.length
      ? '<ol class="dl-steps">' + it.steps.map(function (s) { return '<li>' + Utils.escapeHtml(s) + '</li>'; }).join('') + '</ol>'
      : '<p style="color:var(--muted)">在官网页面中查看办理要求。</p>';
    var mask = UI.modal({
      title: it.name,
      submitText: '关 闭',
      body:
        '<div style="margin-bottom:10px">' + UI.badge(badge[0], badge[1]) +
          ' <span style="color:var(--muted);font-size:12px">' + Utils.escapeHtml(it.from || '') + (it.date ? ' · ' + Utils.escapeHtml(it.date) : '') + '</span></div>' +
        UI.formRow('用途说明', '<div style="color:var(--text)">' + Utils.escapeHtml(it.desc || '') + '</div>') +
        UI.formRow('适用对象', '<div>' + Utils.escapeHtml(it.who || '') + '</div>') +
        UI.formRow('办理步骤', steps) +
        (it.where ? UI.formRow('办理地点 / 咨询', '<div>' + Utils.escapeHtml(it.where) + '</div>') : '') +
        (it.src === 'link' || it.src === 'custom'
          ? UI.formRow('官方入口', '<a href="' + Utils.escapeHtml(it.url) + '" target="_blank" rel="noopener">' + Utils.escapeHtml(it.url) + '</a>')
          : '') +
        '<p style="color:var(--muted);font-size:12px;margin-top:10px">' + Utils.escapeHtml(SRC_TAG[it.src] || '') +
        '奖助政策与评审时间以学生工作处官网最新通知为准。</p>',
      onSubmit(root, close) { close(); }
    });
    // 只读说明弹窗：隐藏「取消」，保留右上角关闭
    var cancelBtn = mask.querySelector('[data-act="cancel"]');
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  /* ---------------- 自定义外链条目（管理员/辅导员） ---------------- */
  function openAdd() {
    var mask = UI.modal({
      title: '添加资料链接',
      body:
        UI.formRow('资料名称', '<input id="f-dl-name" class="input" placeholder="如：2027 年春季国家助学金申请通知">', true) +
        UI.formRow('分类', '<select id="f-dl-cat" class="input">' + CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>') +
        UI.formRow('链接地址', '<input id="f-dl-url" class="input" placeholder="https://…（学校官网文件或通知页地址）">', true) +
        UI.formRow('说明（选填）', '<input id="f-dl-desc" class="input" placeholder="适用对象 / 用途说明">') +
        UI.formRow('适用对象', '<select id="f-dl-aud" class="input">' +
          '<option value="all">全体（学生 + 辅导员 + 教师）</option>' +
          '<option value="student">仅学生</option>' +
          '<option value="counselor">仅辅导员（学工线）</option>' +
          '<option value="teacher">仅教师（教学线）</option></select>'),
      onSubmit(root, close) {
        var name = $('#f-dl-name', root).value.trim();
        var url = $('#f-dl-url', root).value.trim();
        if (!name) return Toast.warning('请填写资料名称');
        if (!/^https?:\/\//i.test(url)) return Toast.warning('链接需以 http(s):// 开头');
        var audSel = document.getElementById('f-dl-aud');
        var audMap = { all: ['student', 'counselor', 'teacher'], student: ['student'], counselor: ['counselor'], teacher: ['teacher'] };
        Store.add('downloads', {
          name: name, cat: $('#f-dl-cat', root).value, url: url,
          desc: $('#f-dl-desc', root).value.trim(),
          aud: audMap[audSel ? audSel.value : 'all'] || ['student', 'counselor', 'teacher'],
          addedBy: user.name || user.username,
          addedAt: Utils.nowStr()
        });
        Toast.success('资料链接已添加');
        close(); render();
      }
    });
  }

  function delCustom(id) {
    var it = Store.find('downloads', id);
    if (!it) return;
    UI.confirm({
      title: '删除资料链接',
      message: '确定删除「' + it.name + '」吗？',
      onOk() { Store.remove('downloads', id); Toast.success('已删除'); render(); }
    });
  }

  var qEl = $('#dl-q', container);
  qEl.addEventListener('input', Utils.debounce(function () { state.q = qEl.value; render(); }, 200));
  function bindUpdateButtons() {
    ['btn-dl-update', 'btn-dl-update2'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b && !b._bound) { b._bound = true; b.addEventListener('click', openUpdate); }
    });
  }
  if (canManage) $('#btn-dl-add', container).addEventListener('click', openAdd);
  bindUpdateButtons();

  renderCalendar();
  render();
};
