import type { RedactionRule } from '@app/shared';

export function uid(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 内置示例规则：覆盖常见敏感信息，用户可自由增删改 */
export const DEFAULT_RULES: RedactionRule[] = [
  {
    id: 'builtin-phone',
    name: '手机号',
    pattern: '(?<![\\d])1[3-9]\\d{9}(?![\\d])',
    flags: 'g',
    replacement: '[电话已脱敏]',
    priority: 100,
    enabled: true,
  },
  {
    id: 'builtin-idcard',
    name: '身份证号',
    pattern: '\\b\\d{17}[\\dXx]\\b',
    flags: 'g',
    replacement: '[证件已脱敏]',
    priority: 100,
    enabled: true,
  },
  {
    id: 'builtin-email',
    name: '邮箱',
    pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
    flags: 'g',
    replacement: '[邮箱已脱敏]',
    priority: 90,
    enabled: true,
  },
  {
    id: 'builtin-name',
    name: '姓名（带称谓）',
    pattern: '[\\u4e00-\\u9fa5]{2,4}(?=(先生|女士|老师|经理|主任|博士))',
    flags: 'g',
    replacement: '[姓名已脱敏]',
    priority: 80,
    enabled: true,
  },
  {
    id: 'builtin-ipv4',
    name: 'IPv4 地址',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
    replacement: '[IP已脱敏]',
    priority: 70,
    enabled: true,
  },
];

export const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.500
主持人：今天我们邀请到张伟老师，他的电话是 13812345678

00:00:05.000 --> 00:00:09.000
张伟：大家好，也可以发邮件到 zhangwei@example.com 联系我

00:00:10.250 --> 00:00:14.000
主持人：请李芳女士核对一下身份证号 110101199003077777

00:00:15.000 --> 00:00:18.750
李芳：好的，备用手机号 13700001111，服务器 IP 是 192.168.1.100

NOTE 这是一条注释块，导出时会被原样保留

00:00:20.000 --> 00:00:24.000 align:start line:0%
张伟：我的办公室在 3 号楼，座机 010-88889999
`;

export function newRule(): RedactionRule {
  return {
    id: uid(),
    name: '新规则',
    pattern: '',
    flags: 'g',
    replacement: '[已脱敏]',
    priority: 50,
    enabled: true,
  };
}
