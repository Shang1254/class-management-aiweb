# 项目交接提示词（给 Claude / Qoder 等代码助手）

把下面这一整段复制粘贴给 Claude Code / Qoder / Cursor 即可。不要逐字解释，让它读完 README 后直接动手。

```
你接手的是「武汉晴川学院班级管理系统」毕业设计作品，前任开发者（ZCode）
[2026-11 更新] 现已到 ?v=114，36 个源文件（js 根 12 个 + pages 24 个），页面注册 33 个；其余数字以 README.md 与本文件后续章节为准（本文件早段的历史数字可能过期，以 README 为准）。

接手前必做：
1. 通读 README.md（功能清单 / 数据字典 / 论文章节映射 / 设计语言 / 对标说明）
2. 通读项目结构（css/style.css + js/utils.js + js/store.js + js/auth.js +
   js/ui.js + js/app.js + js/palette.js + js/pages/*.js + js/pages/final.js + js/pages/classroom.js）
3. 启动本地服务：cd 到项目根目录后 python -m http.server 8899

项目铁律（违反任意一条都会出 bug，不要更改）：

[架构]
- store.js 是唯一数据出入口（list/save/find/add/update/remove + 审计日志
  埋点），任何页面文件不得直接读写 localStorage。
- 数据结构变更必须在 Store.init 里加 schemaVersion 迁移，当前 v3
  （现有 migrateV2 / migrateV3，新迁移要写成「v<4 时执行」的追加式）。
  示例数据内容变更则递增 Store.SEED_VERSION 让旧浏览器自动刷新。
- 所有 .js 顶层 const 不挂 window 时后续脚本读不到；如需跨脚本共享，
  必须 window.X = X = ... 双重赋值（参考 ui.js 的 const UI = window.UI = {...})
- 改任何 CSS/JS 后必须递增 index.html 的 ?v= 版本号（每次改动后递增；当前值以 index.html 实际 ?v= 为准，交接时为 ?v=114），
  否则浏览器缓存会导致改动不生效。
- 界面偏好（主题 cms_theme、全站学期 cms_ui_term）也必须走
  Store.getPref/setPref（键名登记在 Store.PREF_KEYS），不得裸调 localStorage。
- 全系统禁止装饰性 emoji 图标（既定设计决策）；用「日/月」字、印章等替换。
- 全站检索在 js/palette.js（window.Palette）：Ctrl/⌘+K、顶栏「检」、侧边栏入口；
  只经 Store/Auth 取数（按角色与 scopeClassIds 过滤），不得直接读 localStorage。
  新增可检索对象时改 Palette.collect，并保持 escaped 输出。
- 宽表横向提示由 UI.syncTableScroll + app.js 的 MutationObserver 自动完成：
  页面只管用 UI.tableWrap 生成 .table-wrap，禁止在页面里手写提示或滚动容器。
- 全局异常由 index.html 页首监听器 + App.reportError 兜底：运行期异常写
  「操作日志 · 系统/运行异常」并 Toast；新增异步流程不要自己吞错。

[已踩坑（严禁重犯）]
- 业务日期一律用 Utils.formatDate（本地时区），toISOString 在东八区会
  偏移一天（曾在请假联动考勤功能踩坑）。
- 浏览器后台标签页 requestAnimationFrame 会被冻结：弹窗/Toast 的显示类
  要用 setTimeout(fn, 20) 添加（与 modal/confirm 一致）。
- 学期字段 term 用 Store.termOfDate 按日期推算（8 月起为学年第一学期），
  录入时无需手填学期；跨学期判定用 termMatch 函数兼容子集。
- localStorage 别名 bug：从 Store.list 取引用修改后必须存同一份列表
  （曾踩过签到人数不增长）。
- 浏览器脚本加载异常会被静默吞掉——调试时务必挂 window.onerror
  并用 fetch + eval 注入定位。

[业务设计（按学校现实口径）]
- 学生档案三正交字段：培养层次(本科/专科) + 招生类别
  (普通高考/专升本/自考助学) + 学习形式(全日制/非全日制)。
  专升本属统招全日制；自考助学属非全日制。
- 教师 teacherClassIds 任教多班级数组（支持跨班），编制类型
  (专任/外聘) + validUntil 聘期；外聘过期登录拦截。
- 考试只有期末考试×2学期+开学初期末补考，**没有月考/摸底**（民办高校现实）。
- 成绩记录含 credit（学分）、nature（必修/选修）字段，绩点按真实学分加权。
- 课堂模块（cms_signins/assignments/submissions/quizzes/quizAttempts）
  + 学科竞赛（cms_competitions）+ 请假审批（cms_leaves）+ 通知 +
  操作日志 + 总评成绩合成 + 学业预警 + 班级对比报告 — 这些已经全部上线。

[视觉与交互铁律]
- 全系统「川大·藏青金 + 教务案头」原创版式（藏青 #1d5dd8 + 金 #c9a24b），
  衬线标题、壹贰叁计数器编号、证书角饰、方格纸底纹。
- 单字印章导航（App.MENUS.icon 是单字），主题按钮日/月字、empty-state
  衬线「空」字、Toast 用 ✓/✕/！/i 字形。
- 顶栏学期切换器是「全站按学期过滤」开关（唯一入口，值存 cms_ui_term，
  页面内下拉与它双向同步，一律通过 UI.termFilter.get/set/fallback/list），
  已接入：仪表盘 / 成绩管理 / 成绩分析 / 我的成绩 / 班级对比报告 / 学业预警。
- 弹窗统一走 UI.modal/UI.confirm：它们自带 Esc 关闭、焦点移入与归还、
  打开期间锁定页面滚动。页面若要自行关闭弹窗，用 mask._close()，
  不要自己 removeChild（会漏掉解绑与滚动恢复）。
- 总评合成（Store.finalizeGrades）需要「期末成绩 + 平时成绩」成对存在；
  随堂测验成绩在成绩表与 quizAttempts 里各有一份，代码里已显式排除，
  改这块逻辑时务必保持去重。
- student-view 渲染学生仪表盘；dashboard 渲染教师/管理员仪表盘。
- 两端仪表盘共享 todoStripHTML/campusCardHTML/competitionCardHTML/
  bindCampusRotator 四个函数。

[用户偏好]
- 用户是武汉晴川学院计算机学院本科毕业生，论文导师为 Web 方向。
- 用户偏好：不反问，按合理默认处理；问题对话中已纠正过的事项
  （如分类学口径、考试现实）不要再回到旧值。
- 视觉改动用户在意"原创性"，需有截图验证。
- 用户经常用本地 http://127.0.0.1:8899 测试，端口已被前任服务器占用过，
  如需启服务请先 kill 占用进程。
- 项目文件夹所在路径：C:\Users\林一舟\Desktop\班级管理系统。
  远程接管时建议整个文件夹传输到 Claude / Qoder 可访问的位置。

[代码风格]
- 中文 UI、中文注释、单字印章导航、衬线排版优先。
- 全部页面文件用 function(container, user) 注册到 Pages{}，
  Pages 定义用 const，跨脚本读取用 window.Pages 或 window.X。
- 全部弹窗统一用 UI.modal/UI.confirm，禁止各页面自己写 modal HTML。
- 任何错误必须 Toast 提示并写 Store._log；不要静默吞错。

接手后如果用户让你"完善"某功能，先确认是：
(a) 全新功能（按需求添加新页/新模块）
(b) 已存在功能细化（沿用架构铁律扩展）
(c) Bug 修复（先在浏览器复现再修，测试时记得显式挂 window.onerror）

不要做的：
- 不要给系统加后端（store.js 是唯一替换点，用户明确要求纯前端）。
- 不要重新发明 UI 组件（用 ui.js 已有的）。
- 不要把 emoji 图标加回来（已明令禁止）。
- 不要删除 v2/v3/v4/v5 的数据迁移逻辑（已有浏览器会丢数据）。

完。
```