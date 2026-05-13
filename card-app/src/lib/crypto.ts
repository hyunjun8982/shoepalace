import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// AES-256-GCM 키 생성: PASSWORD_ENCRYPTION_KEY 우선, 없으면 JWT_SECRET 파생
function getKey(): Buffer {
  const explicit = process.env.PASSWORD_ENCRYPTION_KEY;
  if (explicit) {
    if (explicit.length === 64 && /^[0-9a-fA-F]+$/.test(explicit)) {
      return Buffer.from(explicit, 'hex');
    }
    return createHash('sha256').update(explicit).digest();
  }
  const jwt = process.env.JWT_SECRET;
  if (!jwt) {
    throw new Error('PASSWORD_ENCRYPTION_KEY 또는 JWT_SECRET 환경변수가 설정되어야 합니다');
  }
  return createHash('sha256').update('codef-password:' + jwt).digest();
}

// 형식: ${iv_base64}.${authTag_base64}.${ciphertext_base64}
export function encryptPassword(plain: string): string {
  if (!plain) return '';
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptPassword(stored: string): string {
  if (!stored) return '';
  const parts = stored.split('.');
  if (parts.length !== 3) {
    throw new Error('저장된 비밀번호 형식이 올바르지 않습니다');
  }
  const [ivB64, tagB64, encB64] = parts;
  const key = getKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
