-- =====================================================================
-- 晴川学院班级管理系统 · 后端演进建表脚本（PostgreSQL / Supabase）
-- 与当前前端 localStorage 结构（schemaVersion 3）一一对应，
-- 用于将来把 store.js 的数据层切换到中心化后端。
-- 执行方式：Supabase → SQL Editor → 粘贴执行；或 psql -f supabase_schema.sql
-- =====================================================================

-- ---------- 基础实体 ----------

create table if not exists classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,              -- 班级名称（唯一）
  grade         text,                              -- 年级（2023级 / 2025级）
  edu_level     text not null default '本科',      -- 培养层次：本科/专科
  enroll_type   text not null default '普通高考',  -- 招生类别：普通高考/专升本/自考助学
  study_form    text not null default '全日制',    -- 学习形式：全日制/非全日制
  head_teacher  text,                              -- 班主任
  remark        text,
  created_at    timestamptz not null default now()
);

create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  student_no    text not null unique,              -- 学号（唯一，教务口径 13 位）
  name          text not null,
  gender        text,
  birth         date,
  class_id      uuid references classes(id) on delete set null,
  edu_level     text not null default '本科',
  enroll_type   text not null default '普通高考',
  study_form    text not null default '全日制',
  phone         text,
  parent_phone  text,
  address       text,
  status        text not null default '在读',      -- 在读/休学/转出/毕业
  created_at    timestamptz not null default now()
);
create index if not exists idx_students_class on students(class_id);

-- 账号（正式接入时密码迁移到 Supabase Auth，本表仅存业务档案与角色）
create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  auth_uid          uuid unique,                   -- 对应 auth.users.id（Supabase Auth）
  username          text not null unique,
  name              text not null,
  role              text not null check (role in ('admin','teacher','student')),
  teacher_class_ids uuid[] default '{}',           -- 教师任教班级（多班）
  teacher_type      text default '专任',           -- 专任/外聘
  valid_until       date,                          -- 外聘聘期（到期拦截登录）
  class_id          uuid references classes(id) on delete set null,
  student_id        uuid references students(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ---------- 教学数据 ----------

create table if not exists scores (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  class_id    uuid references classes(id) on delete set null,
  subject     text not null,
  exam_name   text not null,                       -- 期末考试 / 期末补考 / 总评·期末考试 / 随堂测验·xxx
  score       numeric(5,1) not null,
  credit      numeric(4,1),                        -- 学分
  nature      text,                                -- 必修/选修
  date        date,
  term        text not null,                       -- 学年学期：2026-2027-1
  created_at  timestamptz not null default now()
);
create index if not exists idx_scores_stu on scores(student_id, term);
create index if not exists idx_scores_class on scores(class_id, term);

create table if not exists attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  class_id    uuid references classes(id) on delete set null,
  date        date not null,
  status      text not null check (status in ('出勤','迟到','请假','缺勤')),
  term        text not null,
  created_at  timestamptz not null default now(),
  unique (student_id, date)                        -- 同一学生同一天一条
);
create index if not exists idx_att_class on attendance(class_id, date);

-- 课堂签到（教师发起限时签到码）
create table if not exists signins (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                       -- 6 位签到码
  class_id    uuid not null references classes(id) on delete cascade,
  date        date not null,
  term        text not null,
  expires_at  timestamptz not null,
  signed      uuid[] default '{}',                 -- 已签学生 id 数组
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 请假申请（审批流）
create table if not exists leaves (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students(id) on delete cascade,
  class_id     uuid references classes(id) on delete set null,
  term         text not null,
  start_date   date not null,
  end_date     date not null,
  reason       text not null,
  status       text not null default '待审批' check (status in ('待审批','已批准','已驳回')),
  reviewer     text,
  review_time  timestamptz,
  review_note  text,
  submit_time  timestamptz default now(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_leaves_class on leaves(class_id, status);

-- 作业 / 提交
create table if not exists assignments (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  title         text not null,
  requirement   text not null,
  deadline      timestamptz not null,
  publish_time  timestamptz default now(),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references assignments(id) on delete cascade,
  student_id     uuid not null references students(id) on delete cascade,
  content        text not null,
  submit_time    timestamptz default now(),
  score          numeric(5,1),
  feedback       text,
  graded_by      text,
  graded_time    timestamptz,
  status         text not null default '已提交' check (status in ('已提交','已批改')),
  created_at     timestamptz not null default now(),
  unique (assignment_id, student_id)
);

-- 随堂测验 / 作答
create table if not exists quizzes (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references classes(id) on delete cascade,
  title         text not null,
  subject       text not null,
  duration_min  int not null default 10,
  deadline      timestamptz not null,
  questions     jsonb not null default '[]',       -- [{type,stem,options,answer,points}]
  publish_time  timestamptz default now(),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references quizzes(id) on delete cascade,
  student_id   uuid not null references students(id) on delete cascade,
  answers      text[] default '{}',
  score        numeric(5,1) not null,
  total        numeric(5,1) not null,
  submit_time  timestamptz default now(),
  term         text,
  unique (quiz_id, student_id)                     -- 只允许一次作答
);

-- ---------- 班级事务 ----------

create table if not exists notices (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  content       text not null,
  class_id      uuid references classes(id) on delete set null,  -- null = 全部班级
  publisher     text,
  publisher_id  uuid references users(id) on delete set null,
  publish_time  timestamptz default now(),
  created_at    timestamptz not null default now()
);

-- 通知已读回执（也可改造成 notice_reads(notice_id,user_id) 关系表，仅需改 store.js 一个方法）
create table if not exists notice_reads (
  notice_id  uuid not null references notices(id) on delete cascade,
  username   text not null,
  read_at    timestamptz default now(),
  primary key (notice_id, username)
);

-- 健康日报
create table if not exists health_reports (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students(id) on delete cascade,
  class_id     uuid references classes(id) on delete set null,
  date         date not null,
  temp         numeric(3,1) not null,
  status       text not null default '健康',       -- 健康/发热/咳嗽/其他不适
  remark       text,
  submit_time  timestamptz default now(),
  unique (student_id, date)                        -- 每天一条
);

-- 班级课表（1-12 节次制）
create table if not exists timetable (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references classes(id) on delete cascade,
  term        text not null,
  day         smallint not null check (day between 1 and 7),   -- 1=周一
  period      smallint not null check (period between 1 and 12),
  course      text not null,
  teacher     text,
  room        text,
  weeks       text,                                -- 上课周次，如 1-3,5-9周
  created_at  timestamptz not null default now(),
  unique (class_id, term, day, period)
);

-- 学科竞赛
create table if not exists competitions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  level        text not null,                      -- 校级/市级/省级/国家级
  award        text not null,                      -- 特等奖/一等/二等/三等/优秀/参与
  student_ids  uuid[] not null default '{}',
  date         date,
  teacher      text,
  remark       text,
  created_at   timestamptz not null default now()
);

-- 奖助管理（对照学校真实奖助体系：国家奖学金/国家励志奖学金/国家助学金/晴川奖助学金）
create table if not exists scholarships (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  class_id      uuid references classes(id) on delete set null,
  name          text not null,                     -- 奖项名称，如 国家励志奖学金 / 晴川奖学金（乙等）
  level         text not null default '校级',      -- 国家级/校级
  amount        numeric not null default 0,        -- 金额（元）
  academic_year text,                              -- 学年，如 2025-2026
  status        text not null default '评审中',    -- 评审中/已公示/已发放
  remark        text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_scholarships_student on scholarships(student_id);

-- 操作审计日志
create table if not exists op_logs (
  id         bigserial primary key,
  time       timestamptz not null default now(),
  user_name  text,
  role       text,
  module     text,
  action     text,
  detail     text
);
create index if not exists idx_logs_time on op_logs(time desc);

-- =====================================================================
-- 行级安全（RLS）建议（在 Supabase 控制台按需启用）：
-- 1) 学生：students/scores/attendance/health_reports 仅 visible 本人行；
-- 2) 教师：限定 teacher_class_ids 范围内数据；
-- 3) 管理员：全量。
-- 具体策略写在服务端（Postgres RLS 或 Edge Function），前端 Store 层
-- 只负责调用，权限校验不依赖客户端 —— 这是从纯前端迁移到后端时
-- 最重要的安全升级（当前版本权限仅在前端过滤）。
-- =====================================================================
