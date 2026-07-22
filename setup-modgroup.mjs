// One-shot helper: find the "Risas Nuevas" group id and set it in config.json.
// Run it AFTER sending  /start@RisaLiberadaBot  inside the group.
//   node ~/Documents/flove/apps/liberada/risa/banco-risa/setup-modgroup.mjs
// It reads the bot token locally (never prints it), asks Telegram which chats the
// bot has seen, and — if it finds exactly one group — writes modGroupId into
// config.json and commits+pushes. Safe to re-run.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = __dirname;
const cfgPath = path.join(REPO, 'config.json');

const tokenFile = await readFile(path.join(homedir(), 'Claude/token-telegram-risa.md'), 'utf8');
const token = (tokenFile.match(/[0-9]{6,}:[A-Za-z0-9_-]{30,}/) || [])[0];
if (!token) { console.error('✗ No bot token found in ~/Claude/token-telegram-risa.md'); process.exit(1); }

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();
if (!data.ok) { console.error('✗ Telegram error:', data.description); process.exit(1); }

// unique group / supergroup chats the bot has seen
const groups = new Map();
for (const u of data.result) {
  const c = u.message && u.message.chat;
  if (c && /group/.test(c.type || '')) groups.set(c.id, c.title || '(no title)');
}

if (groups.size === 0) {
  console.log('\n😕 The bot has not seen any group message yet.\n');
  console.log('   → In the "Risas Nuevas" group, send:  /start@RisaLiberadaBot');
  console.log('   → Then run this again.\n');
  console.log('   Still nothing? Group privacy is hiding it. Open @BotFather →');
  console.log('   /setprivacy → RisaLiberadaBot → Disable, then remove & re-add the');
  console.log('   bot to the group, resend the command, and run this once more.\n');
  process.exit(0);
}

if (groups.size > 1) {
  console.log('\n⚠ The bot has seen more than one group — I won\'t guess. Found:\n');
  for (const [id, title] of groups) console.log(`   ${id}   ${title}`);
  console.log('\n   Tell Claude which id is "Risas Nuevas" and it will set it.\n');
  process.exit(0);
}

const [[id, title]] = [...groups];
const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
if (cfg.modGroupId === id) {
  console.log(`\n✓ Already set: modGroupId = ${id}  (${title}) — nothing to do.\n`);
  process.exit(0);
}
cfg.modGroupId = id;
await writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(`\n✓ Found group "${title}"  →  modGroupId = ${id}`);
console.log('✓ Wrote config.json');

try {
  execFileSync('git', ['-C', REPO, 'add', 'config.json'], { stdio: 'ignore' });
  execFileSync('git', ['-C', REPO, 'commit', '-q', '-m', 'chore: set modGroupId for Risas Nuevas'], { stdio: 'ignore' });
  execFileSync('git', ['-C', REPO, 'push', '-q', 'origin', 'HEAD'], { stdio: 'ignore' });
  console.log('✓ Committed & pushed to floveorg/banco-risa');
  console.log('\n🎉 Done. The bot workflow will pass on its next run (~10 min).\n');
} catch (e) {
  console.log('\n⚠ Saved config.json but could not commit/push automatically.');
  console.log('   Tell Claude and it will push for you.\n');
}
