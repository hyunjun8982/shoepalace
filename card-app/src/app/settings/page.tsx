'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

export default function SettingsPage() {
  const { apiFetch } = useAuth();
  const [settings, setSettings] = useState({
    client_id: '',
    client_secret: '',
    public_key: '',
    use_demo: 'true',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          setSettings(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ message: data.message, type: 'success' });
    } catch (err: any) {
      setResult({ message: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-6 text-center text-sm text-gray-400">로딩 중...</div>
    );
  }

  return (
    <div className="px-4 pt-3">
      <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
        <h2 className="text-sm font-bold text-gray-700 mb-3">CODEF API 설정</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Client ID</label>
            <input
              type="text"
              value={settings.client_id}
              onChange={e => setSettings(s => ({ ...s, client_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono"
              placeholder="CODEF Client ID"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Client Secret</label>
            <input
              type="password"
              value={settings.client_secret}
              onChange={e => setSettings(s => ({ ...s, client_secret: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono"
              placeholder="CODEF Client Secret"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Public Key (RSA)</label>
            <textarea
              value={settings.public_key}
              onChange={e => setSettings(s => ({ ...s, public_key: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono resize-none"
              rows={4}
              placeholder="MIIBIjANBgkq..."
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">모드</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSettings(s => ({ ...s, use_demo: 'true' }))}
                className={`flex-1 py-2 text-sm rounded-lg border transition
                  ${settings.use_demo === 'true'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                    : 'border-gray-200 text-gray-500'}`}
              >
                데모
              </button>
              <button
                onClick={() => setSettings(s => ({ ...s, use_demo: 'false' }))}
                className={`flex-1 py-2 text-sm rounded-lg border transition
                  ${settings.use_demo === 'false'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold'
                    : 'border-gray-200 text-gray-500'}`}
              >
                운영
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              모드 변경 시 기존 연결 계정(connectedId)이 초기화됩니다
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
              hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition"
          >
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-xl p-3 mb-3 text-sm ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}
