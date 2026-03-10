import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import forge from 'node-forge';

interface FoundCert {
  cert_name: string;
  cert_type: string;
  issuer_cn: string;
  not_after: string | null;
  der_base64: string;
  key_base64: string;
  local_path: string;
}

// node-forge는 UTF8String 값을 binary string(Latin-1)으로 반환하므로 UTF-8로 재디코딩
function forgeValueToUtf8(val: string): string {
  if (!val) return '';
  try {
    const bytes = Buffer.from(val, 'binary');
    return bytes.toString('utf-8');
  } catch {
    return val;
  }
}

function parseDer(derBase64: string): { certName: string; certType: string; issuerCn: string; notAfter: string | null } {
  try {
    const derBytes = forge.util.decode64(derBase64);
    const asn1 = forge.asn1.fromDer(derBytes);
    const cert = forge.pki.certificateFromAsn1(asn1);

    const cn = forgeValueToUtf8(cert.subject.getField('CN')?.value || '');
    const ou = forgeValueToUtf8(cert.subject.getField('OU')?.value || '');
    const certName = cn || ou || '알 수 없는 인증서';

    let certType = '공동인증서';
    const combined = (ou + cn).toLowerCase();
    if (combined.includes('개인')) certType = '금융(개인)';
    else if (combined.includes('법인')) certType = '금융(법인)';

    const issuerCn = forgeValueToUtf8(cert.issuer.getField('CN')?.value || '') || forgeValueToUtf8(cert.issuer.getField('O')?.value || '');
    const notAfter = cert.validity.notAfter?.toISOString().split('T')[0] ?? null;

    return { certName, certType, issuerCn, notAfter };
  } catch {
    return { certName: '알 수 없는 인증서', certType: '공동인증서', issuerCn: '', notAfter: null };
  }
}

// 디렉토리에서 .der/.key 파일 쌍을 재귀적으로 탐색
function findCertPairs(dir: string, depth = 0): FoundCert[] {
  if (depth > 6) return [];
  const results: FoundCert[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  // 현재 디렉토리에서 .der 파일 탐색
  const derFiles = entries.filter(f => f.toLowerCase().endsWith('.der'));
  for (const derFile of derFiles) {
    const derPath = join(dir, derFile);
    const baseName = derFile.replace(/\.der$/i, '');

    // 동일 디렉토리에서 .key 파일 탐색 (SignPri.key, 같은 이름 등)
    const keyFile = entries.find(f =>
      f.toLowerCase().endsWith('.key') &&
      (f.toLowerCase().includes('signpri') || f.replace(/\.key$/i, '').toLowerCase() === baseName.toLowerCase())
    ) || entries.find(f => f.toLowerCase().endsWith('.key'));

    if (!keyFile) continue;

    const keyPath = join(dir, keyFile);
    try {
      const derBase64 = readFileSync(derPath).toString('base64');
      const keyBase64 = readFileSync(keyPath).toString('base64');
      const { certName, certType, issuerCn, notAfter } = parseDer(derBase64);

      results.push({
        cert_name: certName,
        cert_type: certType,
        issuer_cn: issuerCn,
        not_after: notAfter,
        der_base64: derBase64,
        key_base64: keyBase64,
        local_path: dir,
      });
    } catch {
      // 파일 읽기 실패 시 건너뜀
    }
  }

  // 하위 디렉토리 재귀 탐색
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      if (statSync(fullPath).isDirectory()) {
        results.push(...findCertPairs(fullPath, depth + 1));
      }
    } catch {
      // 접근 권한 없는 폴더 건너뜀
    }
  }

  return results;
}

function scanNpkiPaths(hostUsersPath: string): FoundCert[] {
  const results: FoundCert[] = [];
  const seen = new Set<string>();

  const addUnique = (cert: FoundCert) => {
    const key = `${cert.cert_name}_${cert.not_after}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(cert);
    }
  };

  // 사용자 디렉토리 목록
  let userDirs: string[] = [];
  try {
    userDirs = readdirSync(hostUsersPath).filter(u => {
      const p = join(hostUsersPath, u);
      try { return statSync(p).isDirectory(); } catch { return false; }
    });
  } catch {
    return [];
  }

  for (const userDir of userDirs) {
    // 시스템 디렉토리 건너뜀
    if (['Public', 'Default', 'Default User', 'All Users'].includes(userDir)) continue;

    // 탐색할 NPKI 경로들
    const npkiPaths = [
      join(hostUsersPath, userDir, 'AppData', 'LocalLow', 'NPKI'),
      join(hostUsersPath, userDir, 'AppData', 'Roaming', 'NPKI'),
      join(hostUsersPath, userDir, 'AppData', 'Local', 'NPKI'),
    ];

    for (const npkiPath of npkiPaths) {
      if (!existsSync(npkiPath)) continue;
      const found = findCertPairs(npkiPath);
      found.forEach(addUnique);
    }
  }

  // 시스템 전역 NPKI (C:\NPKI → /host/users/../NPKI 는 접근 불가, 별도 처리 필요)
  return results;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const hostUsersPath = process.env.NPKI_HOST_PATH || '/host/users';

  if (!existsSync(hostUsersPath)) {
    return Response.json({ certs: [], available: false, message: '로컬 인증서 경로에 접근할 수 없습니다' });
  }

  try {
    const certs = scanNpkiPaths(hostUsersPath);
    return Response.json({ certs, available: true });
  } catch (error: any) {
    return Response.json({ certs: [], available: false, message: error.message });
  }
}
