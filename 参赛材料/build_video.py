# -*- coding: utf-8 -*-
"""演示视频后期：TTS 旁白 + 分段拼接 + 字幕烧录 + 1080p MP4
输入：参赛材料/.rec/s1..s8.webm（已录制的分段）
输出：参赛材料/演示视频.mp4 + 参赛材料/演示视频.srt + voice/*.wav
"""
import os, re, subprocess, sys, io

BASE = r'C:\Users\商子轩\Desktop\班级管理系统'
REC = os.path.join(BASE, '参赛材料', '.rec')
OUT = os.path.join(BASE, '参赛材料', '演示视频.mp4')
SRT = os.path.join(BASE, '参赛材料', '演示视频.srt')
VOICE = os.path.join(REC, 'voice')
os.makedirs(VOICE, exist_ok=True)

from imageio_ffmpeg import get_ffmpeg_exe
FF = get_ffmpeg_exe()

# 每段旁白（与分镜脚本一致，按段落时长裁剪措辞）
TEXTS = {
    1: '高校班级管理有个断层：教务管成绩，学工管事务，但辅导员每天要回答的问题仍然靠手工表格。我做的班级管理系统，就是补上班级这一层。双击打开就能用，AI 是核心能力，数据不出校。',
    2: '系统有三类角色、两条业务线。管理员管全局；任课教师走教学线——成绩、作业、测验；辅导员走学工线——请假、奖助、健康日报。兼任授课的辅导员可以同时打开两条线，这就是评审账号 judge。页面内还有第二道权限校验，直接改地址也进不去。',
    3: '辅导员打开就是一张工作台：出勤率、健康日报填报率、校外动向、待审批请假、学业预警，自动汇总。点待办直接跳到处理页。健康日报带定位打卡，辅导员一键筛出校外学生；请假审批按工作日自动联动考勤，跨假期只算工作日。',
    4: 'AI 不是聊天框，是三个有工具的智能体。值班日报：模型先规划查哪些数据——待审批请假、体温异常、出勤趋势、奖助节点——系统只读执行，再汇总成日报，每条都带处理入口。帮扶跟踪能对比两次运行，看谁改善了。这里用的是本机模型，断网就自动切到离线模板，永远有结果。',
    5: '教学线这边，批量录入支持回车跳格，总评按平时六成、期末四成自动合成，绩点按真实学分加权。成绩分析用图表呈现趋势和分布，断网自动降级。学业预警一套规则三个视角：学生收到预警卡，辅导员看帮扶台账，任课教师看课堂关注名单。',
    6: '移动端自适应，深色主题一键切换。断网时图表降级、天气隐藏、AI 走离线模板——演示和机房环境都不会翻车。',
    7: '还集成了一笔缴费微应用：团费班费从发布、催缴、收款到核销、账本、公示全闭环，接入了支付宝沙箱真实签名链路，还有只读的智能审计。主应用只通过一个契约桥传身份和名册，完全解耦。',
    8: '复现很简单：克隆仓库，起一个静态服务，用 judge 和 123456 登录。代码、文档、演示数据都在公开仓库，全部是合成数据。谢谢观看。',
}


def tts_all():
    """用 PowerShell SAPI（Microsoft Huihui zh-CN）逐段合成 WAV"""
    lines = ["Add-Type -AssemblyName System.Speech",
             "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
             "$s.SelectVoice('Microsoft Huihui Desktop')",
             "$s.Rate = 0"]
    for i, txt in TEXTS.items():
        p = os.path.join(VOICE, 'v%d.wav' % i).replace('\\', '\\\\')
        lines.append("$s.SetOutputToWaveFile('%s')" % p)
        lines.append("$s.Speak('%s')" % txt.replace("'", "''"))
    lines.append("$s.Dispose()")
    ps1 = os.path.join(REC, 'tts.ps1')
    with io.open(ps1, 'w', encoding='utf-8-sig') as f:
        f.write('\n'.join(lines))
    subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
                   check=True, capture_output=True)
    print('TTS 完成')


def dur_of(path):
    """WebM(MediaRecorder) 无时长元数据：解码一遍取最后 time= 值"""
    out = subprocess.run([FF, '-hide_banner', '-i', path, '-f', 'null', '-'],
                         capture_output=True).stderr.decode('utf-8', 'replace')
    m = re.findall(r'time=(\d+):(\d+):(\d+\.\d+)', out)
    if m:
        h, mi, s = m[-1]
        return int(h) * 3600 + int(mi) * 60 + float(s)
    m2 = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', out)
    if m2:
        h, mi, s = int(m2.group(1)), int(m2.group(2)), float(m2.group(3))
        return h * 3600 + mi * 60 + s
    raise RuntimeError('无法测量时长: ' + path)


def build():
    segs = [os.path.join(REC, 's%d.webm' % i) for i in range(1, 9)]
    assert all(os.path.exists(p) for p in segs), '缺少分段文件'
    durs = [dur_of(p) for p in segs]
    total = sum(durs)
    print('分段时长:', ['%.1f' % d for d in durs], '合计 %.1fs' % total)

    # 每段音频：voice 补齐到该段时长（不足补静音，超长截断），统一 44.1k 单声道
    audio_parts = []
    for idx, (seg, d) in enumerate(zip(segs, durs), 1):
        v = os.path.join(VOICE, 'v%d.wav' % idx)
        a = os.path.join(REC, 'a%d.wav' % idx)
        subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-i', v,
                        '-af', 'apad=pad_dur=999,atrim=0:%.3f,aresample=44100' % d,
                        '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', a], check=True)
        audio_parts.append(a)
    lst = os.path.join(REC, 'audio.txt')
    with io.open(lst, 'w', encoding='utf-8') as f:
        for a in audio_parts:
            f.write("file '%s'\n" % a.replace('\\', '/'))
    narr = os.path.join(REC, 'narration.wav')
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
                    '-i', lst, '-c', 'copy', narr], check=True)
    print('旁白轨完成')

    # 视频拼接
    vlst = os.path.join(REC, 'video.txt')
    with io.open(vlst, 'w', encoding='utf-8') as f:
        for seg in segs:
            f.write("file '%s'\n" % seg.replace('\\', '/'))
    silent = os.path.join(REC, 'silent.webm')
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
                    '-i', vlst, '-c', 'copy', silent], check=True)
    silent_d = sum(durs)
    print('拼接视频 %.1fs（按分段求和）' % silent_d)

    # SRT：按段切分旁白为 2–3 条字幕，按字数比例分配时间
    def split_subs(txt, max_len=45):
        parts, cur = [], ''
        for ch in txt:
            cur += ch
            if ch in '。；！？' and len(cur) >= 18:
                parts.append(cur); cur = ''
            elif len(cur) >= max_len:
                parts.append(cur); cur = ''
        if cur.strip():
            parts.append(cur)
        return parts
    t = 0.0
    srt_lines = []
    n = 0
    for idx, d in enumerate(durs, 1):
        parts = split_subs(TEXTS[idx])
        chars = sum(len(p) for p in parts)
        start = t
        for p in parts:
            seg_d = d * len(p) / chars
            n += 1
            def ts(x):
                h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
                return ('%02d:%02d:%06.3f' % (h, m, s)).replace('.', ',')
            srt_lines.append('%d\n%s --> %s\n%s\n' % (n, ts(start), ts(min(start + seg_d, t + d)), p))
            start += seg_d
        t += d
    with io.open(SRT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(srt_lines))
    print('SRT 完成（%d 条）' % n)

    # 合成 MP4：1080p H.264 + AAC + 烧录字幕
    subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error',
                    '-i', silent, '-i', narr,
                    '-vf', "scale=1920:1080,subtitles=演示视频.srt:force_style='FontName=Microsoft YaHei,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,BorderStyle=1,MarginV=36'",
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25',
                    '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT],
                   check=True, cwd=os.path.join(BASE, '参赛材料'))
    print('MP4 完成:', OUT, '%.1f MB' % (os.path.getsize(OUT) / 1048576))
    return durs, silent_d


if __name__ == '__main__':
    if '--skip-tts' not in sys.argv:
        tts_all()
    durs, sd = build()
    # 校验
    out = subprocess.run([FF, '-hide_banner', '-i', OUT], capture_output=True).stderr.decode('utf-8', 'replace')
    m = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', out)
    print('成片时长: %s:%s:%s' % m.groups())
    print('含音频流:', 'Audio:' in out, '| 分辨率:', '1920x1080' in out)
