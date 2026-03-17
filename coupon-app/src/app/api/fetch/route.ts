import { NextRequest } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';

// 셀레니움으로 계정 정보 조회
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return unauthorized();

  const { accountId } = await req.json();
  if (!accountId) return Response.json({ error: 'accountId가 필요합니다' }, { status: 400 });

  const account = await queryOne('SELECT * FROM adidas_accounts WHERE id = $1', [accountId]);
  if (!account) return Response.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  // 상태 업데이트: 조회중
  await query('UPDATE adidas_accounts SET web_fetch_status = $1, updated_at = NOW() WHERE id = $2', ['fetching', accountId]);

  try {
    const result = await runFetchScript(account.email, account.password);

    if (result.success) {
      // DB 업데이트
      const vouchers = (result.coupons || []).map((c: any) => ({
        code: c.code || '',
        description: c.original_name || c.name || '',
        expiry: c.expire_date || '-',
        value: '',
        sold: false,
        soldTo: '',
      }));

      // 기존 쿠폰과 병합 (기존 sold 상태 유지)
      let existingVouchers: any[] = [];
      try {
        existingVouchers = typeof account.owned_vouchers === 'string'
          ? JSON.parse(account.owned_vouchers)
          : (account.owned_vouchers || []);
      } catch {}

      const existingMap = new Map(existingVouchers.map((v: any) => [v.code, v]));
      const mergedVouchers = vouchers.map((v: any) => {
        const existing = existingMap.get(v.code);
        if (existing) {
          return { ...v, sold: existing.sold, soldTo: existing.soldTo, value: existing.value || v.value };
        }
        return v;
      });

      await query(
        `UPDATE adidas_accounts SET
          name = COALESCE($2, name),
          birthday = COALESCE($3, birthday),
          phone = COALESCE($4, phone),
          adikr_barcode = COALESCE($5, adikr_barcode),
          current_points = COALESCE($6, current_points),
          owned_vouchers = $7,
          web_fetch_status = 'success',
          updated_at = NOW()
        WHERE id = $1`,
        [accountId, result.name, result.birthday, result.phone, result.barcode, result.points, JSON.stringify(mergedVouchers)]
      );

      return Response.json({
        success: true,
        name: result.name,
        points: result.points,
        couponCount: mergedVouchers.length,
        totalTime: result.total_time,
      });
    } else {
      await query('UPDATE adidas_accounts SET web_fetch_status = $1, updated_at = NOW() WHERE id = $2', [`error: ${result.error}`, accountId]);
      return Response.json({ success: false, error: result.error });
    }
  } catch (error: any) {
    await query('UPDATE adidas_accounts SET web_fetch_status = $1, updated_at = NOW() WHERE id = $2', [`error: ${error.message}`, accountId]);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

function runFetchScript(email: string, password: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_account.py');
    const proc = spawn('python', [scriptPath, email, password], {
      timeout: 120000,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          // stdout 마지막 줄에서 JSON 파싱
          const lines = stdout.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);
          resolve(result);
        } catch {
          reject(new Error(`스크립트 출력 파싱 실패: ${stdout.slice(-200)}`));
        }
      } else {
        reject(new Error(stderr || `스크립트 종료 코드: ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`스크립트 실행 실패: ${err.message}`));
    });
  });
}
