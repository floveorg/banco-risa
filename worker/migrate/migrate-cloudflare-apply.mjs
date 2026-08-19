#!/usr/bin/env node
// Crea la zona <dominio> en Cloudflare (si no existe), aplica los registros del
// backup IONOS en modo GREY (DNS-only) y añade el wildcard * proxied (ORANGE)
// para que el Worker de subdominios los sirva automáticamente.
//
// Uso:
//   # 1) plan (no cambia nada):
//   CLOUDFLARE_API_TOKEN='<token>' node migrate-cloudflare-apply.mjs
//   # 2) aplicar:
//   CLOUDFLARE_API_TOKEN='<token>' node migrate-cloudflare-apply.mjs --apply
//
// Idempotente: no duplica registros que ya existan (type+name+content+proxied).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const DOMAIN = (process.env.CF_DOMAIN || 'liberada.net').toLowerCase();
const APPLY = process.argv.includes('--apply');
const PLAN_LOCAL = process.argv.includes('--plan-local'); // plan sin llamar a Cloudflare
const here = dirname(fileURLToPath(import.meta.url));

if (!TOKEN && !PLAN_LOCAL) {
  console.error('Falta CLOUDFLARE_API_TOKEN.');
  console.error(
    'Créalo en Cloudflare: Mi perfil → API Tokens → Create Token → template "Edit zone DNS": ' +
      'Zone → Zone:Edit, Zone → DNS:Edit, Account → Account Settings:Read, ' +
      'con ámbito "All zones" (o la cuenta; la zona aún no existe y debe poder crearse).'
  );
  process.exit(1);
}

// Subdominios de perfil de usuario → los sirve el Worker vía el wildcard (NO crear registro).
let userSubs = [];
try {
  const users = JSON.parse(await readFile(join(here, '..', '..', 'usernames.json'), 'utf8'));
  userSubs = Object.keys(users).map((s) => s.toLowerCase());
} catch {
  /* sin usernames.json en el repo → no excluimos ninguno */
}

// Subdominios de infraestructura/correo que SIEMPRE van DNS-only (grey) para no pasar por el Worker.
const GREY = new Set([
  'risa', 'ama', 'www', 'mail', 'webmail', 'autodiscover', 'autoconfig',
  'smtp', 'pop', 'imap', 'api', 'ns1', 'ns2', 'dns',
]);
const GH_PAGES = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];

async function cf(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.success) {
    throw new Error(`CF ${path} → HTTP ${res.status}: ${JSON.stringify(data.errors || data).slice(0, 400)}`);
  }
  return data;
}

// ── 1. Zona ───────────────────────────────────────────────────────────────
let zone = null;
if (PLAN_LOCAL) {
  console.log('Modo --plan-local: sin llamadas a Cloudflare (solo plan).');
} else {
  zone = (await cf(`/zones?name=${encodeURIComponent(DOMAIN)}`)).result?.[0];
  if (!zone) {
    console.log('La zona', DOMAIN, 'no existe en Cloudflare → la creo…');
    const account = (await cf('/accounts')).result?.[0];
    if (!account) throw new Error('No hay cuenta Cloudflare para este token.');
    zone = (await cf('/zones', { method: 'POST', body: { name: DOMAIN, type: 'full', account: { id: account.id } } })).result;
    console.log('✓ Zona creada (estado:', zone.status, '). Todavía NO está activa: falta el cambio de NS en IONOS.');
  } else {
    console.log('Zona:', DOMAIN, '| estado:', zone.status, '| id:', zone.id);
  }
}
const zoneId = zone ? zone.id : null;

// ── 2. Plan de registros ──────────────────────────────────────────────────
const backupPath =
  process.argv.find((a) => a.endsWith('.json')) || join(here, `ionos-backup-${DOMAIN}.json`);
let backup = { records: [] };
if (existsSync(backupPath)) {
  backup = JSON.parse(await readFile(backupPath, 'utf8'));
  console.log('Backup IONOS cargado:', backupPath, `(${backup.records.length} registros)`);
} else {
  console.warn('No encuentro el backup IONOS (' + backupPath + '). Añadiré solo base + wildcard.');
}

const normName = (n) => {
  n = String(n || '').replace(/\.$/, '').toLowerCase();
  if (!n || n === '@' || n === DOMAIN) return '@';
  if (n.endsWith('.' + DOMAIN)) return n;
  return n + '.' + DOMAIN;
};

const plan = [];
const addPlan = (rec) => plan.push(rec);

// 3a. Registros importados de IONOS → grey (DNS-only), salvo perfiles de usuario.
for (const r of backup.records) {
  const name = normName(r.name);
  const sub = name === '@' ? null : name.replace('.' + DOMAIN, '');
  if (sub && userSubs.includes(sub)) {
    console.log('· omitido (lo sirve el Worker vía wildcard):', sub);
    continue;
  }
  if (sub && GREY.has(sub)) {
    console.log('· infraestructura → grey:', sub);
  }
  const base = { name, content: r.content, proxied: false, ttl: 1 };
  if (r.type === 'MX') addPlan({ ...base, type: 'MX', priority: r.prio ?? 10 });
  else if (r.type === 'TXT') addPlan({ ...base, type: 'TXT' });
  else if (r.type === 'A') addPlan({ ...base, type: 'A' });
  else if (r.type === 'AAAA') addPlan({ ...base, type: 'AAAA' });
  else if (r.type === 'CNAME') addPlan({ ...base, type: 'CNAME' });
  else if (r.type === 'CAA') {
    const m = /^(\d+)\s+(\S+)\s+(.+)$/.exec(String(r.content || '').trim());
    if (m) {
      addPlan({
        ...base,
        type: 'CAA',
        data: { flags: +m[1], tag: m[2], value: m[3].trim() },
        content: m[3].trim(),
      });
    } else {
      console.warn('⚠ CAA no parseado, créalo a mano en Cloudflare:', r.name, '→', r.content);
    }
  } else {
    console.warn('⚠ Tipo no soportado por el script, añádelo a mano en Cloudflare:', r.type, r.name, r.content);
  }
}

// 3b. Base garantizada: apex → GitHub Pages (por si el backup no lo trae).
if (!plan.some((r) => r.type === 'A' && r.name === '@')) {
  for (const ip of GH_PAGES) addPlan({ type: 'A', name: '@', content: ip, proxied: false, ttl: 1 });
}

// 3c. Wildcard para el Worker → ORANGE (proxied).
addPlan({ type: 'CNAME', name: '*', content: 'floveorg.github.io', proxied: true, ttl: 1 });

// ── 4. Mostrar plan ───────────────────────────────────────────────────────
console.log('\n── Plan de registros en Cloudflare ──');
for (const r of plan) {
  const color = r.proxied ? 'ORANGE · Worker' : 'GREY · DNS-only';
  const prio = r.priority != null ? ` prio=${r.priority}` : '';
  console.log(`   ${r.type.padEnd(6)} ${r.name.padEnd(26)} ${r.content}${prio}  ${color}`);
}
console.log('\nTotal:', plan.length, 'registros.');

if (!APPLY) {
  console.log('\nModo plan (no he tocado nada). Ejecuta con --apply para crear la zona y los registros.');
  process.exit(0);
}

// ── 5. Aplicar (idempotente) ──────────────────────────────────────────────
const existing = (await cf(`/zones/${zoneId}/dns_records?per_page=1000`)).result || [];
const have = (r) =>
  existing.some(
    (e) => e.type === r.type && e.name === r.name && e.content === r.content && e.proxied === r.proxied
  );
let created = 0;
for (const r of plan) {
  if (have(r)) {
    console.log('· ya existe:', r.type, r.name, r.content);
    continue;
  }
  const body = { type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied };
  if (r.priority != null) body.priority = r.priority;
  if (r.data) body.data = r.data;
  await cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body });
  created++;
}
console.log(`\n✓ ${created} registros creados en Cloudflare.`);

// ── 6. Ajustes SSL del plan gratuito (se aplican cuando la zona se active) ──
try {
  await cf(`/zones/${zoneId}/settings/ssl`, { method: 'PATCH', body: { value: 'full' } });
  await cf(`/zones/${zoneId}/settings/always_use_https`, { method: 'PATCH', body: { value: 'on' } });
  console.log('✓ SSL: modo Full + Always Use HTTPS configurado.');
} catch (e) {
  console.warn('SSL settings (opcional):', e.message);
}

// ── 7. NS a poner en IONOS ────────────────────────────────────────────────
const zoneFresh = (await cf(`/zones/${zoneId}`)).result;
const ns = (zoneFresh.name_servers || []).filter(Boolean);
console.log('\n→ En IONOS (Domains → liberada.net → DNS → Nameservers) cambia a ESTOS dos NS:');
ns.forEach((n) => console.log('     ', n));
if (!ns.length) console.log('   (Cloudflare aún no los asigna; míralos en el panel → DNS → Nameservers)');
