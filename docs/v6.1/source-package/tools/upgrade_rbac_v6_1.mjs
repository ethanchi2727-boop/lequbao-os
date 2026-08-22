import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const matrixPath = path.join(root, '05_数据API事件权限与安全', 'RBAC矩阵.csv');
const lines = fs.readFileSync(matrixPath, 'utf8').trim().split(/\r?\n/);
const rows = lines.map((line) => line.split(','));
const header = rows[0];
const permissions = [
  'merchant.intake.create','merchant.intake.read','merchant.intake.write','merchant.intake.confirm',
  'revenue_right.read_own','revenue_right.read_all','revenue_right.create','revenue_right.transfer_request',
  'revenue_right.transfer_approve','revenue_right.suspend','distribution.read_own','distribution.read_all',
  'distribution.cost.read','distribution.lock','distribution.pay','distribution.reverse',
  'cost_catalog.manage','revenue_policy.manage'
];
for (const permission of permissions) if (!header.includes(permission)) header.push(permission);

const defaultValue = (role, permission) => {
  if (role === 'PLATFORM_ADMIN') return permission.includes('approve') || permission.includes('suspend') || permission.includes('manage') ? 'DUAL' : 'ALL';
  if (role === 'PLATFORM_FINANCE') {
    if (['revenue_right.read_all','distribution.read_all','distribution.cost.read'].includes(permission)) return 'ALL';
    if (['revenue_right.transfer_approve','revenue_right.suspend','distribution.lock','distribution.pay','distribution.reverse','cost_catalog.manage','revenue_policy.manage'].includes(permission)) return 'DUAL';
    return 'NONE';
  }
  if (role === 'PLATFORM_OPS') {
    if (['merchant.intake.read','revenue_right.read_all','distribution.read_all'].includes(permission)) return 'JIT_READ';
    return 'NONE';
  }
  if (role === 'CHANNEL_PARTNER') {
    if (['merchant.intake.create','merchant.intake.read','merchant.intake.write','revenue_right.read_own','revenue_right.transfer_request','distribution.read_own','distribution.cost.read'].includes(permission)) return 'ASSIGNED';
    return 'NONE';
  }
  if (role === 'MERCHANT_OWNER') {
    if (permission.startsWith('merchant.intake.')) return 'TENANT';
    return 'NONE';
  }
  if (role === 'STORE_MANAGER') {
    if (['merchant.intake.read','merchant.intake.write'].includes(permission)) return 'STORE';
    return 'NONE';
  }
  return 'NONE';
};

for (const row of rows.slice(1)) {
  while (row.length < header.length - permissions.length) row.push('NONE');
  for (const permission of permissions) row.push(defaultValue(row[0], permission));
}

const baseChannel = rows.find((row) => row[0] === 'CHANNEL_PARTNER');
for (const [code, name] of [
  ['BUSINESS_DEVELOPER','商务人员'],
  ['INVESTMENT_OPERATOR','招商公司运营'],
  ['REGIONAL_PROVIDER','区县服务商']
]) {
  if (rows.some((row) => row[0] === code)) continue;
  const row = [...baseChannel];
  row[0] = code;
  row[1] = name;
  permissions.forEach((permission, index) => {
    const col = header.length - permissions.length + index;
    row[col] = defaultValue('CHANNEL_PARTNER', permission);
  });
  if (code === 'INVESTMENT_OPERATOR') {
    row[header.indexOf('revenue_right.read_all')] = 'REGION';
    row[header.indexOf('distribution.read_all')] = 'REGION';
  }
  rows.push(row);
}

fs.writeFileSync(matrixPath, rows.map((row) => row.join(',')).join('\n') + '\n');
console.log(JSON.stringify({roles: rows.length - 1, permissions: header.length - 3}));

