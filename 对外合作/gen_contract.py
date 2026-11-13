# -*- coding: utf-8 -*-
"""
《计算机软件许可合同（单校授权版）》生成脚本
用途：面向其他院校/机构对外许可本软件时使用（一次性授权 + 可选年度维护）。
说明：通用模板，不构成法律意见；签署前建议核对预算、发票与招标要求，必要时请专业人士审阅。
运行：python 对外合作/gen_contract.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, '软著申请材料'))

from sz_common import SYS_NAME, SYS_SHORT, VERSION, NAME_VER, _font, _add_field
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

AL = {'l': WD_ALIGN_PARAGRAPH.LEFT, 'c': WD_ALIGN_PARAGRAPH.CENTER, 'j': WD_ALIGN_PARAGRAPH.JUSTIFY}
OUT = os.path.join(HERE, '软件许可合同（单校授权版）.docx')


def qn_ea():
    from docx.oxml.ns import qn
    return qn('w:eastAsia')


def new_doc():
    doc = Document()
    st = doc.styles['Normal']
    st.font.name = '宋体'
    st.font.size = Pt(12)
    st.element.rPr.rFonts.set(qn_ea(), '宋体')
    st.paragraph_format.space_after = Pt(4)
    st.paragraph_format.line_spacing = Pt(22)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(2.6), Cm(2.4)
    sec.left_margin, sec.right_margin = Cm(2.8), Cm(2.6)
    fp = sec.footer.paragraphs[0]
    fp.alignment = AL['c']
    _font(fp.add_run('第 '), '宋体', 9)
    _add_field(fp, 'PAGE')
    _font(fp.add_run(' 页  共 '), '宋体', 9)
    _add_field(fp, 'NUMPAGES')
    _font(fp.add_run(' 页'), '宋体', 9)
    return doc


def title(doc, text, size=18):
    p = doc.add_paragraph(); p.alignment = AL['c']; p.paragraph_format.space_after = Pt(4)
    _font(p.add_run(text), '黑体', size, True)


def sub(doc, text):
    p = doc.add_paragraph(); p.alignment = AL['c']; p.paragraph_format.space_after = Pt(14)
    _font(p.add_run(text), '楷体', 11)


def head(doc, text):
    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(4)
    _font(p.add_run(text), '黑体', 13, True)


def para(doc, text, indent=False):
    p = doc.add_paragraph(); p.alignment = AL['j']; p.paragraph_format.space_after = Pt(4)
    if indent:
        p.paragraph_format.first_line_indent = Pt(24)
    _font(p.add_run(text), '宋体', 12)


def item(doc, text):
    p = doc.add_paragraph(); p.paragraph_format.left_indent = Pt(24); p.paragraph_format.space_after = Pt(3)
    _font(p.add_run(text), '宋体', 12)


def sign(doc, text):
    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(6)
    _font(p.add_run(text), '宋体', 12)


def main():
    doc = new_doc()
    title(doc, '计算机软件许可合同')
    sub(doc, '（' + NAME_VER + ' · 单校授权版）')

    para(doc, '甲方（许可人）：______________________________', indent=False)
    para(doc, '乙方（被许可人）：______________________________', indent=False)
    para(doc, '甲乙双方经友好协商，就甲方向乙方许可使用计算机软件事宜达成如下协议：')

    head(doc, '第一条  许可软件')
    item(doc, '1.1 软件名称：' + SYS_NAME + '（简称：' + SYS_SHORT + '），版本号：' + VERSION + '；')
    item(doc, '1.2 功能范围：见本合同附件一《软件功能清单与版本说明》；')
    item(doc, '1.3 交付形式：软件部署包（HTML/CSS/JavaScript 静态文件，浏览器端运行，'
               '无需数据库与专用服务器）及《用户操作手册》电子版；')
    item(doc, '1.4 软件著作权登记情况：著作权人为甲方；登记号（如有）：________________。')

    head(doc, '第二条  许可类型与范围')
    item(doc, '2.1 许可类型：非独占、不可转让、不可转授的使用许可；')
    item(doc, '2.2 使用范围：限于乙方自身的教学、学生管理与行政办公使用，覆盖乙方'
               '　□ 全部院系　□ 约 ______ 个班级／______ 名师生；')
    item(doc, '2.3 许可期限：□ 永久　□ ______ 年（自交付验收合格之日起算）；')
    item(doc, '2.4 部署方式：由甲方协助部署至乙方指定的校内服务器或设备，'
               '或由乙方按手册自行部署（部署环境由乙方提供）。')

    head(doc, '第三条  许可费与支付方式')
    item(doc, '3.1 一次性许可费：人民币 ____________ 元（大写：____________________）；')
    item(doc, '3.2 年度维护费（可选）：人民币 ____________ 元／年，'
               '含版本升级、缺陷修复与技术支持（首年 □ 含　□ 不含　□ 赠送）；')
    item(doc, '3.3 支付方式：合同签订后 ______ 个工作日内支付 ______%，'
               '交付验收合格后 ______ 个工作日内支付剩余 ______%；')
    item(doc, '3.4 发票：甲方开具"信息技术服务费／软件许可费"发票（税率以代开或开票时适用为准）；')
    item(doc, '3.5 付款方式：□ 银行转账　□ 其他：____________________________。')

    head(doc, '第四条  交付与验收')
    item(doc, '4.1 交付内容：部署包、《用户操作手册》、基础数据导入模板与一次线上／线下培训'
               '（时长 ______ 小时）；')
    item(doc, '4.2 交付时间：乙方付款后 ______ 个工作日内；')
    item(doc, '4.3 验收标准：软件在乙方环境下可正常启动并实现附件一所列功能；')
    item(doc, '4.4 验收期限：乙方应于交付后 ______ 个工作日内完成验收并签署验收单；'
               '逾期未提出书面异议的，视为验收通过。')

    head(doc, '第五条  技术支持与维护')
    item(doc, '5.1 维护内容：软件缺陷（Bug）修复、兼容性适配（浏览器版本更新）；')
    item(doc, '5.2 响应时限：工作日 ____ 小时内响应，____ 个工作日内提供解决方案；')
    item(doc, '5.3 不含范围：新增功能、二次开发、与乙方其他系统对接、'
               '因乙方自行修改代码或环境变更导致的问题；上述事项由双方另行签订技术服务合同。')

    head(doc, '第六条  知识产权')
    item(doc, '6.1 本合同项下软件的著作权（含全部财产权）归甲方所有，本合同不构成著作权转让；')
    item(doc, '6.2 乙方仅在本合同约定的范围与期限内使用，不得删除或修改软件中的署名与版权信息；')
    item(doc, '6.3 乙方不得对软件进行反向工程、反编译，不得用于开发同类产品或对外提供类似服务；')
    item(doc, '6.4 乙方在使用中提出的定制需求，如形成新的功能或衍生版本，'
               '其著作权归甲方所有（双方另有书面约定的除外），乙方可在本校继续使用。')

    head(doc, '第七条  数据与合规')
    item(doc, '7.1 软件在乙方环境内运行，乙方数据保存在乙方设备中，甲方不留存、不接触乙方的学生数据；')
    item(doc, '7.2 乙方应遵守《中华人民共和国个人信息保护法》等法律法规，'
               '对软件中的学生信息承担管理责任；')
    item(doc, '7.3 甲方提供技术服务确需接触数据时，应与乙方另行签署数据处理与保密安排。')

    head(doc, '第八条  保密')
    item(doc, '8.1 双方对在履行本合同过程中知悉的对方商业秘密、技术资料与本合同内容负保密义务；')
    item(doc, '8.2 保密义务在合同终止后继续有效 ____ 年。')

    head(doc, '第九条  违约责任')
    item(doc, '9.1 乙方逾期付款的，每逾期一日按应付未付金额的 0.05% 支付违约金；')
    item(doc, '9.2 乙方超出许可范围使用的，应立即停止并赔偿甲方损失，'
               '甲方有权解除合同且不退还已收费用；')
    item(doc, '9.3 甲方逾期交付的，每逾期一日按已收金额的 0.05% 支付违约金；'
               '逾期超过 ______ 日的，乙方有权解除合同并要求退款。')

    head(doc, '第十条  不可抗力')
    item(doc, '因不可抗力导致合同无法履行的，双方互不承担违约责任，但应及时通知对方并协商处理后续事宜。')

    head(doc, '第十一条  争议解决与其他')
    item(doc, '11.1 本合同适用中华人民共和国法律；')
    item(doc, '11.2 争议由双方友好协商解决，协商不成的，提交　□ 甲方所在地　□ 乙方所在地　'
               '有管辖权的人民法院诉讼解决；')
    item(doc, '11.3 本合同自双方签字（盖章）之日起生效；一式两份，双方各执一份，具有同等效力；')
    item(doc, '11.4 附件与本合同具有同等效力；未尽事宜由双方签订补充协议。')

    doc.add_paragraph()
    sign(doc, '甲方（签字／盖章）：____________________        日期：______ 年 ____ 月 ____ 日')
    sign(doc, '乙方（盖章）：__________________________')
    sign(doc, '法定代表人或授权代表（签字）：____________        日期：______ 年 ____ 月 ____ 日')

    head(doc, '附件一  软件功能清单与版本说明（示例，签约前按实际调整）')
    item(doc, '1. 班级与学生档案管理（含学籍字段、批量导入导出）；')
    item(doc, '2. 成绩管理（批量录入、排名统计、总评合成、成绩单打印）与成绩分析；')
    item(doc, '3. 考勤管理与限时签到码签到、考勤月报与预警；')
    item(doc, '4. 请假审批（按工作日自动写入考勤）；')
    item(doc, '5. 作业管理、随堂测验（客观题自动阅卷）；')
    item(doc, '6. 奖助学金管理、健康日报与定位打卡（含校外动向）、学科竞赛登记；')
    item(doc, '7. 班级课表（含 .ics 日历导出）、通知管理（双频道、已读回执、手机推送）；')
    item(doc, '8. 学业预警、班级对比报告、用户与权限管理、操作日志、数据备份与恢复。')

    doc.save(OUT)
    print('许可合同已生成 ->', OUT, '(%.1f KB)' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
