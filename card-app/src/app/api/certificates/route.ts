import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { query, queryAll, ensureCertificatesTable } from '@/lib/db';
import forge from 'node-forge';

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

function parseDerCert(derBase64: string): {
  certName: string; certType: string; subjectDn: string; issuerCn: string; notAfter: string | null;
} {
  try {
    const derBytes = forge.util.decode64(derBase64);
    const asn1 = forge.asn1.fromDer(derBytes);
    const cert = forge.pki.certificateFromAsn1(asn1);

    const cn = forgeValueToUtf8(cert.subject.getField('CN')?.value || '');
    const ou = forgeValueToUtf8(cert.subject.getField('OU')?.value || '');
    const certName = cn || ou || '알 수 없는 인증서';

    // 구분 (금융(개인)/금융(법인)/공동인증서)
    let certType = '공동인증서';
    const ouLower = (ou + cn).toLowerCase();
    if (ouLower.includes('개인')) certType = '금융(개인)';
    else if (ouLower.includes('법인')) certType = '금융(법인)';

    const subjectAttrs = cert.subject.attributes.map((a: any) => `${a.shortName}=${forgeValueToUtf8(a.value)}`).join(', ');

    const issuerCN = forgeValueToUtf8(cert.issuer.getField('CN')?.value || '')
      || forgeValueToUtf8(cert.issuer.getField('O')?.value || '');

    const notAfterDate = cert.validity.notAfter;
    const notAfter = notAfterDate ? notAfterDate.toISOString().split('T')[0] : null;

    return { certName, certType, subjectDn: subjectAttrs, issuerCn: issuerCN, notAfter };
  } catch {
    return { certName: '알 수 없는 인증서', certType: '공동인증서', subjectDn: '', issuerCn: '', notAfter: null };
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  await ensureCertificatesTable();

  const certs = await queryAll(
    'SELECT id, cert_name, cert_type, subject_dn, issuer_cn, not_after, created_at FROM user_certificates WHERE card_app_user_id = $1 ORDER BY created_at DESC',
    [user.userId]
  );

  return Response.json({ certificates: certs });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  await ensureCertificatesTable();

  try {
    const { derFile, keyFile } = await req.json();

    if (!derFile || !keyFile) {
      return Response.json({ error: 'DER 파일과 KEY 파일이 필요합니다' }, { status: 400 });
    }

    const { certName, certType, subjectDn, issuerCn, notAfter } = parseDerCert(derFile);

    await query(
      `INSERT INTO user_certificates (card_app_user_id, cert_name, cert_type, subject_dn, issuer_cn, not_after, der_file, key_file)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.userId, certName, certType, subjectDn, issuerCn, notAfter, derFile, keyFile]
    );

    return Response.json({ message: '인증서 등록 완료', cert_name: certName, not_after: notAfter });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
