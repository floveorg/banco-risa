#!/usr/bin/env node
// Exporta los registros DNS actuales de un dominio desde IONOS (solo lectura).
// Genera el backup JSON que luego aplica migrate-cloudflare-apply.mjs.
//
// Uso:
//   IONOS_API_KEY='<prefijoPublico>.<clavePrivada>' node migrate-export-ionos.mjs [dominio]
//
// Escribe en este directorio:
//   ionos-backup-<dominio>.json      (registros normalizados)
//   ionos-backup-<dominio>-raw.json  (respuesta completa de IONOS)
import { writeFile } from 'node:fs/promises';

const API = 'https://api.hosting.ionos.com/dns/v1';
const KEY = process.env.IONOS_API_KEY || '';
const DOMAIN = (process.argv[2] || 'liberada.net').toLowerCase();

if (!KEY) {
  console.error('Falta IONOS_API_KEY.');
  console.error('Créala en IONOS: panel → busca "API" (o developer.hosting.ionos.com → API keys).');
  console.error('Formato: prefijoPublico.clavePrivada');
  process.exit(1);
}

async function get(path) {
  const res = await fetch(API + path, {
    headers: { 'X-API-Key': KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`IONOS ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const listOf = (data) =>
  Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : [];

const propOf = (o, k) =>
  o && o.properties && o.properties[k] != null ? o.properties[k] : o ? o[k] : null;

const zoneNameOf = (z) => z.name || z.zoneName || propOf(z, 'zoneName') || '';
const zones = listOf(await get('/zones'));
const zone = zones.find((z) => String(zoneNameOf(z)).toLowerCase() === DOMAIN);
if (!zone) {
  console.error('No encontré la zona', DOMAIN, 'en la cuenta IONOS.');
  console.error('Zonas visibles:', zones.map(zoneNameOf).filter(Boolean).join(', ') || '(ninguna)');
  process.exit(1);
}
const zoneId = zone.id;
const detail = await get('/zones/' + zoneId);

const rawRecords = Array.isArray(detail.records) ? detail.records : listOf(detail);
const records = [];
for (const r of rawRecords) {
  if (propOf(r, 'enabled') === false || propOf(r, 'disabled') === true) continue;
  const type = String(propOf(r, 'type') || '').toUpperCase();
  if (type === 'NS' || type === 'SOA') continue; // los gestiona el proveedor DNS
  const content = String(propOf(r, 'content') || '');
  if (!content) continue;
  records.push({
    type,
    name: String(propOf(r, 'name') || '').replace(/\.$/, ''),
    content: content.replace(/\.$/, ''),
    ttl: propOf(r, 'ttl') ?? 3600,
    prio: propOf(r, 'prio') ?? null,
  });
}

const backup = { zoneId, zoneName: DOMAIN, exportedAt: new Date().toISOString(), records };
await writeFile(`ionos-backup-${DOMAIN}.json`, JSON.stringify(backup, null, 2));
await writeFile(`ionos-backup-${DOMAIN}-raw.json`, JSON.stringify(detail, null, 2));

console.log(`✓ Backup de ${DOMAIN} (${records.length} registros) → ionos-backup-${DOMAIN}.json`);
const byType = {};
for (const r of records) (byType[r.type] = byType[r.type] || []).push(r);
for (const [t, list] of Object.entries(byType)) {
  console.log(`\n── ${t} (${list.length}) ──`);
  for (const r of list) {
    const name = r.name || '@';
    const prio = r.prio != null ? ` [prio ${r.prio}]` : '';
    console.log(`   ${name.padEnd(30)} ${r.content}${prio}  ttl=${r.ttl}`);
  }
}
const mailish = records.filter(
  (r) => r.type === 'MX' || (r.type === 'TXT' && /spf|dkim|dmarc/i.test(r.content))
);
console.log(
  `\n⚠ Revisa sobre todo estos ${mailish.length} registros de correo (MX/SPF/DKIM/DMARC): deben llegar íntegros a Cloudflare.`
);
