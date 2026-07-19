// Zero-dependency Cloudinary signed upload. Audio uses Cloudinary's `video`
// resource type. Credentials come from CLOUDINARY_URL (never committed):
//   cloudinary://<api_key>:<api_secret>@<cloud_name>
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function parseCloudinaryUrl(url) {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url || '');
  if (!m) throw new Error('bad CLOUDINARY_URL (expected cloudinary://key:secret@cloud)');
  return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
}

// Cloudinary signature: SHA-1 of the signed params, sorted, joined by '&' as
// key=value, with the api_secret appended. `file`, `api_key`, `resource_type`
// and `signature` itself are never signed.
export function signParams(params, apiSecret) {
  const toSign = Object.keys(params).sort()
    .map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

export async function uploadAudio(cloudinaryUrl, filePath, { publicId, folder, timestamp } = {}) {
  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(cloudinaryUrl);
  const ts = timestamp || Math.floor(Date.now() / 1000);

  const signed = { timestamp: ts };
  if (publicId) signed.public_id = publicId;
  if (folder) signed.folder = folder;
  const signature = signParams(signed, apiSecret);

  const buf = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), filePath.split('/').pop());
  form.append('api_key', apiKey);
  form.append('timestamp', String(ts));
  if (publicId) form.append('public_id', publicId);
  if (folder) form.append('folder', folder);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST', body: form
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error('cloudinary upload failed: ' + JSON.stringify(json.error || json));
  }
  return json.secure_url;
}
