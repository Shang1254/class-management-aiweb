# -*- coding: utf-8 -*-
"""
教务 JSON → 班级管理系统导入 CSV（个人离线工具，不属于系统功能）
================================================================
用途
----
你在**自己的环境**里用教务接口客户端（例如 zfn_api）拉到的成绩/课表 JSON，
用本脚本转成「班级管理系统 → 数据管理 → 教务数据导入」能直接吃的 CSV。

本脚本**不联网、不登录任何系统、不读取账号密码**——它只读你给的 JSON 文件、
只写本地 CSV。拉取数据那一步由你自己在本地完成（见 说明.md）。

用法
----
    python 教务JSON转导入CSV.py 成绩.json                     # 自动判断类型，输出 成绩导入.csv
    python 教务JSON转导入CSV.py 成绩.json -o 我的成绩.csv
    python 教务JSON转导入CSV.py 课表.json --kind 课表
    python 教务JSON转导入CSV.py 成绩.json --student-no 2025990401001 --name 林一舟
        # 教务的成绩接口常常不返回学号（只返回当前登录学生的课程），需用参数补上

常用参数
--------
    --kind 成绩|课表|auto   数据类型（auto 按字段自动判断）
    --path a.b.c            指定 JSON 里的数据路径（默认自动找最大的“字典列表”）
    --map 科目=kcmc        覆盖字段识别（可重复；左边用：学号/姓名/科目/考试名称/分数/
                            学分/课程性质/学期/班级/星期/节次/课程/教师/地点）
    --student-no/--name     JSON 里没有学号/姓名时的兜底值
    --class 计科20252302班  课表 JSON 里没有班级时的兜底值
    --term 2025-2026-1      记录里没有学期信息时的兜底学期
    --exam-name 期末考试     记录里没有考试名称时的默认值（默认「期末考试」）
    --xqm3 skip|1|2         「3=小学期」怎么处理（默认 skip：跳过并提示）
    --split-exams           成绩里同时有平时成绩/期末成绩时，额外拆成两行
    --list                  JSON 里列表较多时，先列出所有列表供你挑选

输出列（与系统导入口径一致，勿改列名）
--------------------------------------
    成绩：学号,姓名,科目,考试名称,分数,学分,课程性质,学期
    课表：班级,星期,节次,课程,教师,地点,学期
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from collections import OrderedDict

# ------------------------------------------------------------------
# 字段识别：规范化 + 候选关键词（按优先级排序，先精确后包含）
# ------------------------------------------------------------------
_PUNCT = re.compile(r'[\s_\-—–·、,，.。:：;；()（）\[\]【】"\'’“”/\\]+')


def norm(k: str) -> str:
    """键名规范化：去空白/标点、全角转半角、小写。'课程 名称'→'课程名称'、'KCMC'→'kcmc'"""
    s = str(k or '').strip()
    s = ''.join(chr(ord(c) - 0xFEE0) if 0xFF01 <= ord(c) <= 0xFF5E else c for c in s)
    return _PUNCT.sub('', s).lower()


SCORE_SPEC = OrderedDict([
    ('学号',   ['学号', '学生学号', 'xh', 'studentno', 'studentnumber', 'stuno']),
    ('姓名',   ['姓名', '学生姓名', 'xm', 'name', 'studentname']),
    ('科目',   ['科目', '课程名称', '课程名', '课程', 'kcmc', 'coursename', 'course', 'kcdm']),
    ('考试名称', ['考试名称', '考试', '考核方式', '考试性质', 'ksmc', 'examname', 'ksxz']),
    ('分数',   ['总评成绩', '最终成绩', '总评', '成绩', '分数', '得分', 'cj', 'zpcj', 'score', 'zzcj']),
    ('学分',   ['学分', 'xf', 'credit', 'credits', 'creditvalue']),
    ('课程性质', ['课程性质', '课程属性', '修读性质', '性质', '修读', 'kcxzmc', 'kcxz', 'coursenature', 'nature']),
    ('学期',   ['学期', '学年学期', '学期名称', 'term', 'xq', 'xqmc', 'semester']),
    ('平时成绩', ['平时成绩', '平时', 'pscj', 'usualscore']),
    ('期末成绩', ['期末成绩', '期末', 'qmcj', 'finalscore']),
    ('学年',   ['学年', 'xnm', 'xn', 'schoolyear', 'academicyear']),
    ('学期序', ['学期序', '学期编号', 'xqm', 'termno', 'semesterno', 'xqbh']),
    ('绩点',   ['绩点', 'jd', 'gpa', 'gradepoint']),
])

TT_SPEC = OrderedDict([
    ('班级',   ['班级', '班级名称', '教学班', '教学班名称', '行政班', 'bjmc', 'jxbmc', 'class', 'classname']),
    ('星期',   ['星期', '周几', '星期几', 'xqj', 'weekday', 'day', 'zhouji']),
    ('节次',   ['节次', '上课节次', '节数', '时间', 'jcs', 'jcor', 'jc', 'period', 'sections']),
    ('课程',   ['课程', '课程名称', '科目', 'kcmc', 'coursename', 'course']),
    ('教师',   ['教师', '老师', '任课教师', '教师姓名', 'jsxm', 'jsmc', 'teacher']),
    ('地点',   ['地点', '教室', '上课地点', '教学地点', 'cdmc', 'jxdd', 'room', 'classroom']),
    ('学期',   ['学期', '学年学期', 'term', 'xq', 'xqmc', 'semester']),
    ('学年',   ['学年', 'xnm', 'xn', 'schoolyear']),
    ('学期序', ['学期序', '学期编号', 'xqm', 'termno', 'xqbh']),
])

# 中文字段名（键名是「学号」这类，不是「xh」）→ 精确匹配更可靠
FIELD_BY_KIND = {'成绩': SCORE_SPEC, '课表': TT_SPEC}

LETTER_SCORE = {'优': 95, '优秀': 95, '良': 85, '良好': 85, '中': 75, '中等': 75,
                '及格': 65, '合格': 65, 'pass': 65, '不及格': 55, '不合格': 55, 'fail': 55,
                '免修': 85, '缓考': None, '旷考': 0, '作弊': 0, '违纪': 0}

DAY_MAP = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7}
CN_NUM = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
          '十': 10, '十一': 11, '十二': 12, '十三': 13}


# ------------------------------------------------------------------
# JSON 读取与“找到数据列表”
# ------------------------------------------------------------------
def load_json(path: str):
    with io.open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def walk_lists(obj, path=''):
    """递归找出所有「元素是字典的列表」，返回 [(路径, 列表)]"""
    found = []
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            found.append((path or '<根>', obj))
        else:
            for i, v in enumerate(obj):
                found.extend(walk_lists(v, '%s[%d]' % (path, i)))
    elif isinstance(obj, dict):
        for k, v in obj.items():
            found.extend(walk_lists(v, ('%s.%s' % (path, k)).lstrip('.')))
    return found


def pick_lists(data, path_arg=None, all_lists=False):
    """返回 (要处理的 [(路径, 列表)], 其余未处理的列表)"""
    if path_arg:
        cur = data
        for part in path_arg.replace('[', '.').replace(']', '').split('.'):
            if not part:
                continue
            cur = cur[int(part)] if isinstance(cur, list) else cur[part]
        if isinstance(cur, list):
            others = [p for p in walk_lists(data) if p[0] != path_arg]
            return [(path_arg, cur)], others
        raise SystemExit('--path 指向的不是列表：%s' % path_arg)
    lists = walk_lists(data)
    if not lists:
        raise SystemExit('这个 JSON 里没有找到「对象列表」，确认导出的数据结构（可用 --path 指定）')
    lists.sort(key=lambda p: (p[0], -len(p[1])))
    if all_lists:
        return lists, []
    best = max(lists, key=lambda p: len(p[1]))
    others = [p for p in lists if p[0] != best[0]]
    return [best], others


def term_from_path(path):
    """从路径里推学期：'data.2025-2026-1' → '2025-2026-1'；'2025-2026学年第二学期' → '2025-2026-2'"""
    return norm_term_from(path, '', '', 'skip')


# ------------------------------------------------------------------
# 字段映射
# ------------------------------------------------------------------
def build_mapping(keys, spec, overrides):
    """返回 {目标字段: [候选键, ...]}（按优先级排序，可多个：容忍同批数据里字段命名不一致）"""
    nkeys = OrderedDict((norm(k), k) for k in keys)
    mapping = {}
    for field, cands in spec.items():
        want = overrides.get(field)
        if want:
            hit = nkeys.get(norm(want))
            if hit is None:
                raise SystemExit('--map %s=%s：JSON 里没有这个键' % (field, want))
            mapping[field] = [hit]
            continue
        picks = []
        for c in cands:                      # 先按候选优先级收集精确匹配
            for nk, orig in nkeys.items():
                if nk == norm(c) and orig not in picks:
                    picks.append(orig)
        for c in cands:                      # 再做包含匹配（拉丁缩写少于 3 字符不参与，避免 xq 误配 xqm）
            if len(norm(c)) < 3:
                continue
            for nk, orig in nkeys.items():
                if norm(c) in nk and orig not in picks:
                    picks.append(orig)
        if picks:
            mapping[field] = picks
    return mapping


def all_keys(rows, limit=300):
    """合并前若干条记录的所有键（同一批导出里字段名可能不完全一致）"""
    keys = OrderedDict()
    for rec in rows[:limit]:
        for k in rec.keys():
            keys[k] = True
    return list(keys.keys())


def get(rec, mapping, field, default=''):
    """取值：按该字段的候选键依次尝试（第一个有值的胜出）"""
    for k in mapping.get(field, []):
        if k in rec:
            v = rec.get(k)
            if v is None or isinstance(v, (dict, list)):
                continue
            s = str(v).strip()
            if s:
                return s
    return default


# ------------------------------------------------------------------
# 归一化
# ------------------------------------------------------------------
def norm_term_from(term_txt, year_txt, seq_txt, xqm3='skip'):
    """学期归一化 → '2025-2026-1'（与系统导入口径一致）；无法识别返回 ''"""
    t = str(term_txt or '').strip()
    if t:
        m = (re.search(r'(\d{4})\s*[-—~/至]\s*(\d{4})\s*学?年?\s*第?\s*([一二12])\s*(?:学期|期)?', t)
             or re.search(r'(\d{4})\s*[-—~/]\s*(\d{4})\s*[-—~/]\s*([一二123])', t))
        if m:
            seq = m.group(3)
            return '%s-%s-%s' % (m.group(1), m.group(2),
                                 '1' if seq == '一' else ('2' if seq == '二' else ('3' if seq == '三' else seq)))
        if re.fullmatch(r'\d{4}-\d{4}-[12]', t):
            return t
    # 学年 + 学期序号
    y = str(year_txt or '').strip()
    seq = str(seq_txt or '').strip()
    if y:
        m = re.search(r'(\d{4})\s*[-—~/]\s*(\d{4})', y)
        if m:
            y1, y2 = m.group(1), m.group(2)
        else:
            m = re.search(r'(\d{4})', y)
            if not m:
                return ''
            y1 = m.group(1)
            y2 = str(int(y1) + 1)
    else:
        return ''
    s = 0
    if seq:
        s2 = seq.replace('学期', '').replace('第', '').strip()
        if s2 in CN_NUM:
            s = CN_NUM[s2]
        elif s2.isdigit():
            s = int(s2)
        elif '秋' in s2:
            s = 1
        elif '春' in s2:
            s = 2
    if s in (1, 2):
        return '%s-%s-%d' % (y1, y2, s)
    if s == 3:                       # 小学期：系统只有两学期
        if xqm3 in ('1', '2'):
            return '%s-%s-%s' % (y1, y2, xqm3)
        return ''                    # skip
    return ''                        # 只有学年、没有学期序号 → 交给调用方决定


def norm_day(txt):
    t = str(txt or '').strip()
    if not t:
        return ''
    m = re.search(r'[周星期]\s*([一二三四五六日天1-7])', t)
    ch = m.group(1) if m else t
    if ch in DAY_MAP:
        return '周' + ch
    if ch.isdigit() and 1 <= int(ch) <= 7:
        return '周' + '一二三四五六日'[int(ch) - 1]
    return ''


def norm_periods(txt):
    """节次 → '1-2节' / '第3节'（系统导入器会展开成逐节）"""
    t = str(txt or '').strip()
    if not t:
        return ''
    t = t.replace('节', '').replace('第', '').strip()
    if re.fullmatch(r'0*(\d{1,2})0*(\d{1,2})', t) and len(re.sub(r'\D', '', t)) == 4:
        d = re.sub(r'\D', '', t)             # '0102' → 1-2
        a, b = int(d[:2]), int(d[2:])
        return ('%d-%d节' % (a, b)) if b > a else ('第%d节' % a)
    m = re.findall(r'\d{1,2}', t)
    if len(m) >= 2:
        a, b = int(m[0]), int(m[1])
        return '%d-%d节' % (min(a, b), max(a, b)) if a != b else '第%d节' % a
    if len(m) == 1:
        return '第%d节' % int(m[0])
    # 中文写法：'一二' / '三四'
    cn = [CN_NUM[c] for c in re.findall(r'[一二三四五六七八九十]+', t) if c in CN_NUM]
    if len(cn) >= 2:
        return '%d-%d节' % (min(cn[0], cn[1]), max(cn[0], cn[1]))
    if len(cn) == 1:
        return '第%d节' % cn[0]
    return ''


def norm_score(txt):
    """分数：数字原样；等级（优/良/中/及格/不及格）换算为参考分；无法识别返回 None"""
    t = str(txt or '').strip()
    if not t:
        return None, ''
    m = re.search(r'\d{1,3}(?:\.\d+)?', t)
    if m:
        v = float(m.group(0))
        if 0 <= v <= 100:
            return v, ''
        return None, '分数超出 0~100：%s' % t
    key = t.replace(' ', '')
    if key in LETTER_SCORE:
        v = LETTER_SCORE[key]
        if v is None:
            return None, '等级「%s」无法换算（缓考）' % t
        return v, '等级「%s」按参考分 %s 计入' % (t, v)
    return None, '无法识别的成绩：%s' % t


def to_num(txt):
    t = str(txt or '').strip()
    m = re.search(r'\d+(?:\.\d+)?', t)
    return float(m.group(0)) if m else None


# ------------------------------------------------------------------
# 转换
# ------------------------------------------------------------------
def guess_kind(keys, mapping_score, mapping_tt):
    """按能识别到的字段数判断类型"""
    s = sum(1 for f in ('科目', '分数', '学分') if f in mapping_score)
    t = sum(1 for f in ('节次', '星期', '地点') if f in mapping_tt)
    return '课表' if t > s else '成绩'


def convert_score(rows, args, fallback_term=''):
    mapping = build_mapping(all_keys(rows), SCORE_SPEC, args.maps)
    out, skipped, terms, notes = [], [], set(), []
    fallback_term = fallback_term or args.term
    for idx, rec in enumerate(rows, 1):
        subject = get(rec, mapping, '科目')
        if not subject:
            skipped.append((idx, '没有课程名，跳过'))
            continue
        score, note = norm_score(get(rec, mapping, '分数'))
        if note:
            notes.append('第 %d 行 %s：%s' % (idx, subject, note))
        if score is None:
            skipped.append((idx, '%s：无有效成绩' % subject))
            continue
        term = norm_term_from(get(rec, mapping, '学期'), get(rec, mapping, '学年'),
                              get(rec, mapping, '学期序'), args.xqm3)
        if not term:
            term = fallback_term
        if not term:
            seq = get(rec, mapping, '学期序')
            if str(seq).strip() in ('3', '三', '小学期'):
                skipped.append((idx, '%s：教务标注为小学期（xqm=3），如需归入某学期请加 --xqm3 1 或 --xqm3 2' % subject))
            else:
                skipped.append((idx, '%s：无法确定学期（用 --term 指定兜底学期）' % subject))
            continue
        terms.add(term)
        student_no = get(rec, mapping, '学号') or args.student_no
        name = get(rec, mapping, '姓名') or args.name
        credit = to_num(get(rec, mapping, '学分'))
        nature = get(rec, mapping, '课程性质')
        exam = get(rec, mapping, '考试名称') or args.exam_name
        if not student_no:
            skipped.append((idx, '%s：没有学号（用 --student-no 指定）' % subject))
            continue

        def row(score_v, exam_v):
            return [student_no, name, subject, exam_v, fmt_score(score_v),
                    '' if credit is None else trim_num(credit), nature, term]

        if args.split_exams:
            us, fs = get(rec, mapping, '平时成绩'), get(rec, mapping, '期末成绩')
            if us:
                v, n = norm_score(us)
                if v is not None:
                    out.append(row(v, '平时成绩'))
            if fs:
                v, n = norm_score(fs)
                if v is not None:
                    out.append(row(v, '期末成绩'))
        out.append(row(score, exam))
    return out, skipped, sorted(terms), notes, mapping


def convert_tt(rows, args, fallback_term=''):
    mapping = build_mapping(all_keys(rows), TT_SPEC, args.maps)
    out, skipped, terms, notes = [], [], set(), []
    fallback_term = fallback_term or args.term
    for idx, rec in enumerate(rows, 1):
        course = get(rec, mapping, '课程')
        day = norm_day(get(rec, mapping, '星期'))
        periods = norm_periods(get(rec, mapping, '节次'))
        if not course or not day or not periods:
            skipped.append((idx, '缺少 课程/星期/节次（课程=%s 星期=%s 节次=%s）' % (course or '—', day or '—', periods or '—')))
            continue
        term = norm_term_from(get(rec, mapping, '学期'), get(rec, mapping, '学年'),
                              get(rec, mapping, '学期序'), args.xqm3) or fallback_term
        if not term:
            skipped.append((idx, '%s：无法确定学期（用 --term 指定兜底学期）' % course))
            continue
        terms.add(term)
        klass = get(rec, mapping, '班级') or args.klass
        if not klass:
            skipped.append((idx, '%s：没有班级（用 --class 指定）' % course))
            continue
        out.append([klass, day, periods, course,
                    get(rec, mapping, '教师'), get(rec, mapping, '地点'), term])
    return out, skipped, sorted(terms), notes, mapping


def fmt_score(v):
    return str(int(v)) if float(v).is_integer() else ('%.1f' % v)


def trim_num(v):
    return str(int(v)) if float(v).is_integer() else ('%.1f' % v)


# ------------------------------------------------------------------
# 主流程
# ------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description='教务 JSON → 班级管理系统导入 CSV（个人离线工具）')
    ap.add_argument('input', help='教务接口导出的 JSON 文件')
    ap.add_argument('-o', '--out', help='输出 CSV（默认 成绩导入.csv / 课表导入.csv）')
    ap.add_argument('--kind', choices=['成绩', '课表', 'auto'], default='auto')
    ap.add_argument('--path', help='JSON 里数据列表的路径，如 data.list')
    ap.add_argument('--all-lists', action='store_true',
                    help='把 JSON 里所有「对象列表」合并转换（如按学年学期分组的导出）')
    ap.add_argument('--list', action='store_true', help='列出 JSON 里所有列表后退出')
    ap.add_argument('--map', action='append', default=[], metavar='字段=键',
                    help='覆盖字段识别，可重复，如 --map 科目=kcmc')
    ap.add_argument('--student-no', default='', help='JSON 没有学号时的兜底学号')
    ap.add_argument('--name', default='', help='JSON 没有姓名时的兜底姓名')
    ap.add_argument('--class', dest='klass', default='', help='课表 JSON 没有班级时的兜底班级')
    ap.add_argument('--term', default='', help='记录没有学期信息时的兜底学期，如 2025-2026-1')
    ap.add_argument('--exam-name', default='期末考试', help='成绩记录没有考试名称时的默认值')
    ap.add_argument('--xqm3', choices=['skip', '1', '2'], default='skip',
                    help='教务「3=小学期」的处理方式（默认跳过）')
    ap.add_argument('--split-exams', action='store_true',
                    help='成绩里同时有平时/期末成绩时，额外拆成两行')
    args = ap.parse_args(argv)

    if not os.path.exists(args.input):
        raise SystemExit('找不到文件：%s' % args.input)
    data = load_json(args.input)

    if args.list:
        lists = sorted(walk_lists(data), key=lambda p: -len(p[1]))
        print('JSON 里的「对象列表」：')
        for p, l in lists:
            keys = list(l[0].keys())[:8]
            print('  %-40s %4d 条   字段：%s' % (p, len(l), '、'.join(keys)))
        return 0

    path, rows = None, None
    targets, others = pick_lists(data, args.path, args.all_lists)
    if others:
        print('提示：JSON 里还有 %d 个其它列表未处理（用 --list 查看，--all-lists 可一起转）：' % len(others))
        for p, l in others[:5]:
            print('  · %s（%d 条）' % (p, len(l)))

    overrides = {}
    for item in args.map:
        if '=' not in item:
            raise SystemExit('--map 需要写成 字段=键 的形式：%s' % item)
        k, v = item.split('=', 1)
        overrides[k.strip()] = v.strip()
    args.maps = overrides          # convert_* 统一读 args.maps

    # 逐列表转换（多个列表时按路径顺序合并）
    all_out, all_skipped, all_terms, all_notes = [], [], set(), []
    kind_used, mapping_first = None, None
    for p, rows in targets:
        if not rows:
            continue
        keys = all_keys(rows)          # 合并整批记录的键，容忍字段命名不一致
        kind = args.kind
        if kind == 'auto':
            kind = guess_kind(keys, build_mapping(keys, SCORE_SPEC, overrides),
                              build_mapping(keys, TT_SPEC, overrides))
        fallback = term_from_path(p)
        if kind == '成绩':
            out, skipped, terms, notes, mapping = convert_score(rows, args, fallback)
        else:
            out, skipped, terms, notes, mapping = convert_tt(rows, args, fallback)
        if kind_used and kind != kind_used:
            print('⚠ 多个列表识别出不同类型（%s / %s），已只保留 %s 的行' % (kind_used, kind, kind_used))
            continue
        kind_used = kind
        mapping_first = mapping_first or (p, mapping)
        print('数据来源：%s（%d 条）%s' % (p, len(rows), ('  学期取自路径：%s' % fallback) if fallback else ''))
        all_out.extend(out)
        all_skipped.extend(skipped)
        all_terms.update(terms)
        all_notes.extend(notes)

    if not kind_used:
        raise SystemExit('数据列表是空的：%s' % (targets[0][0] if targets else '—'))
    kind = kind_used
    if kind == '成绩':
        header = ['学号', '姓名', '科目', '考试名称', '分数', '学分', '课程性质', '学期']
        default_out = '成绩导入.csv'
    else:
        header = ['班级', '星期', '节次', '课程', '教师', '地点', '学期']
        default_out = '课表导入.csv'

    print('识别类型：%s' % kind)
    print('字段对应：' + ('、'.join('%s←%s' % (f, '/'.join(k) if isinstance(k, list) else k)
                                 for f, k in mapping_first[1].items()) or '（无）'))

    out, skipped, terms, notes = all_out, all_skipped, sorted(all_terms), all_notes
    if notes:
        print('提示：')
        for n in notes[:10]:
            print('  · ' + n)
        if len(notes) > 10:
            print('  · …另有 %d 条同类提示' % (len(notes) - 10))

    out_path = args.out or default_out
    with io.open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(out)

    print('—' * 46)
    print('已写出：%s' % os.path.abspath(out_path))
    print('可导入：%d 行' % len(out))
    if terms:
        print('涉及学期：' + '、'.join(terms))
    if skipped:
        print('跳过：%d 行' % len(skipped))
        for idx, why in skipped[:15]:
            print('  · 第 %d 行 %s' % (idx, why))
        if len(skipped) > 15:
            print('  · …另有 %d 行' % (len(skipped) - 15))
    if not out:
        print('⚠ 没有可导入的行，请对照上面的字段对应关系加 --map 参数')
        return 2
    print('下一步：打开系统 → 数据管理 → 教务数据导入 → 粘贴或选择该 CSV → 预览 → 导入')
    return 0


if __name__ == '__main__':
    sys.exit(main())
