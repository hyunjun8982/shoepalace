'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ORGANIZATION_MAP, BANK_ORGANIZATION_MAP } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  super_admin: '전체 관리자',
  group_admin: '그룹 관리자',
  user: '일반 사용자',
};

interface GroupMember {
  id: number;
  username: string;
  display_name: string;
}

interface Group {
  id: number;
  name: string;
  member_count: number;
  members: GroupMember[];
}

interface UserItem {
  id: number;
  username: string;
  display_name: string;
  phone: string;
  role: string;
  group_id: number | null;
  group_name: string | null;
  created_at: string;
}

export default function ProfilePage() {
  const { apiFetch, user, logout } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  // 프로필
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileRole, setProfileRole] = useState('');
  const [profileGroupName, setProfileGroupName] = useState('');

  // 그룹 관리
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupMsg, setGroupMsg] = useState('');

  // 회원 관리
  const [users, setUsers] = useState<UserItem[]>([]);
  const [tab, setTab] = useState<'profile' | 'groups' | 'users' | 'homepages'>('profile');

  // 홈페이지 관리
  const [homepages, setHomepages] = useState<any[]>([]);
  const [hpOrg, setHpOrg] = useState('');
  const [hpBizType, setHpBizType] = useState<'CD' | 'BK'>('CD');
  const [hpClientType, setHpClientType] = useState<'P' | 'B'>('P');
  const [hpUrl, setHpUrl] = useState('');
  const [hpMsg, setHpMsg] = useState('');

  useEffect(() => {
    apiFetch('/api/auth/profile')
      .then(r => r.json())
      .then(data => {
        setDisplayName(data.display_name || '');
        setPhone(data.phone || '');
        setProfileRole(data.role || '');
        setProfileGroupName(data.group_name || '');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isSuperAdmin && (tab === 'groups' || tab === 'users')) {
      loadGroups();
    }
    if (isSuperAdmin && tab === 'users') {
      loadUsers();
    }
    if (isSuperAdmin && tab === 'homepages') {
      loadHomepages();
    }
  }, [tab]);

  const loadGroups = () => {
    apiFetch('/api/groups')
      .then(r => r.json())
      .then(data => setGroups(data.groups || []))
      .catch(() => {});
  };

  const loadUsers = () => {
    apiFetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data.users || []))
      .catch(() => {});
  };

  const handleProfileSave = async () => {
    setProfileMsg('');
    setProfileErr('');

    if (newPassword && newPassword !== newPasswordConfirm) {
      setProfileErr('새 비밀번호가 일치하지 않습니다');
      return;
    }

    setProfileLoading(true);
    try {
      const body: any = { display_name: displayName, phone };
      if (newPassword) {
        body.current_password = currentPassword;
        body.new_password = newPassword;
      }
      const res = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfileMsg('저장되었습니다');
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
    } catch (err: any) {
      setProfileErr(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups(prev => [...prev, data.group]);
      setNewGroupName('');
      setGroupMsg('그룹이 추가되었습니다');
      setTimeout(() => setGroupMsg(''), 2000);
    } catch (err: any) {
      setGroupMsg(err.message);
    }
  };

  const handleDeleteGroup = async (id: number, name: string) => {
    if (!confirm(`"${name}" 그룹을 삭제하시겠습니까?\n소속 회원은 그룹 미지정 상태가 됩니다.`)) return;
    try {
      await apiFetch('/api/groups', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
      setGroups(prev => prev.filter(g => g.id !== id));
      loadUsers();
    } catch {}
  };

  const handleRemoveFromGroup = async (userId: number) => {
    try {
      await apiFetch('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId, group_id: null }),
      });
      loadGroups();
      loadUsers();
    } catch {}
  };

  const handleUserUpdate = async (userId: number, field: string, value: any) => {
    try {
      await apiFetch('/api/users', {
        method: 'PUT',
        body: JSON.stringify({ user_id: userId, [field]: value }),
      });
      loadUsers();
    } catch {}
  };

  // 홈페이지 데이터를 key→{id, url} 맵으로 관리
  const loadHomepages = () => {
    apiFetch('/api/homepages')
      .then(r => r.json())
      .then(data => setHomepages(data.homepages || []))
      .catch(() => {});
  };

  // 기관/개인법인 선택 변경 시 저장된 URL 조회
  const hpKey = `${hpBizType}_${hpOrg}_${hpClientType}`;
  const savedHp = homepages.find((hp: any) => hp.business_type === hpBizType && hp.organization === hpOrg && hp.client_type === hpClientType);

  useEffect(() => {
    if (savedHp) {
      setHpUrl(savedHp.url);
    } else {
      setHpUrl('');
    }
  }, [hpKey, homepages.length]);

  const handleSaveHomepage = async () => {
    if (!hpOrg || !hpUrl.trim()) return;
    setHpMsg('');
    try {
      const res = await apiFetch('/api/homepages', {
        method: 'POST',
        body: JSON.stringify({
          organization: hpOrg,
          business_type: hpBizType,
          client_type: hpClientType,
          url: hpUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHpMsg('저장되었습니다');
      loadHomepages();
      setTimeout(() => setHpMsg(''), 2000);
    } catch (err: any) {
      setHpMsg(err.message);
    }
  };

  const handleDeleteHomepage = async () => {
    if (!savedHp) return;
    try {
      await apiFetch('/api/homepages', {
        method: 'DELETE',
        body: JSON.stringify({ id: savedHp.id }),
      });
      setHpUrl('');
      setHpMsg('삭제되었습니다');
      loadHomepages();
      setTimeout(() => setHpMsg(''), 2000);
    } catch {}
  };

  const handleToggleHomepageActive = async (hp: any) => {
    try {
      await apiFetch('/api/homepages', {
        method: 'PATCH',
        body: JSON.stringify({ id: hp.id, is_active: !hp.is_active }),
      });
      loadHomepages();
    } catch {}
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition text-sm";

  return (
    <div className="px-4 pt-3 pb-20">
      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('profile')}
          className={`flex-1 py-2 text-xs rounded-lg font-medium transition ${tab === 'profile' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
        >
          내 정보
        </button>
        {isSuperAdmin && (
          <>
            <button
              onClick={() => setTab('groups')}
              className={`flex-1 py-2 text-xs rounded-lg font-medium transition ${tab === 'groups' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
            >
              그룹 관리
            </button>
            <button
              onClick={() => setTab('users')}
              className={`flex-1 py-2 text-xs rounded-lg font-medium transition ${tab === 'users' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
            >
              회원
            </button>
            <button
              onClick={() => setTab('homepages')}
              className={`flex-1 py-2 text-xs rounded-lg font-medium transition ${tab === 'homepages' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
            >
              링크
            </button>
          </>
        )}
      </div>

      {/* 내 정보 */}
      {tab === 'profile' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">아이디</span>
              <span className="text-gray-800 font-medium">{user?.username}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">역할</span>
              <span className="text-gray-800">{ROLE_LABELS[profileRole] || profileRole}</span>
            </div>
            {profileGroupName && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">소속 그룹</span>
                <span className="text-gray-800">{profileGroupName}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-gray-700">기본 정보</p>
            <input
              type="text"
              placeholder="이름"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className={inputClass}
            />
            <input
              type="tel"
              placeholder="휴대폰번호"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-gray-700">비밀번호 변경</p>
            <input
              type="password"
              placeholder="현재 비밀번호"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="새 비밀번호"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="새 비밀번호 확인"
              value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              className={inputClass}
            />
          </div>

          {profileErr && <p className="text-red-500 text-xs text-center">{profileErr}</p>}
          {profileMsg && <p className="text-green-500 text-xs text-center">{profileMsg}</p>}

          <button
            onClick={handleProfileSave}
            disabled={profileLoading}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
              hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition"
          >
            {profileLoading ? '저장 중...' : '저장'}
          </button>

          <button
            onClick={logout}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-500 text-sm font-medium
              hover:bg-gray-50 active:bg-gray-100 transition"
          >
            로그아웃
          </button>
        </div>
      )}

      {/* 그룹 관리 */}
      {tab === 'groups' && isSuperAdmin && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="새 그룹 이름"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              className={`flex-1 ${inputClass}`}
            />
            <button
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
              className="px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
                hover:bg-primary-700 disabled:opacity-50 transition shrink-0"
            >
              추가
            </button>
          </div>
          {groupMsg && <p className="text-xs text-center text-green-500">{groupMsg}</p>}

          {groups.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">등록된 그룹이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {groups.map(g => (
                <div key={g.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{g.name}</p>
                      <p className="text-xs text-gray-400">{g.member_count}명</p>
                    </div>
                    <button
                      onClick={() => handleDeleteGroup(g.id, g.name)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                    >
                      삭제
                    </button>
                  </div>
                  {g.members && g.members.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-2 space-y-1">
                      {g.members.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between py-1">
                          <span className="text-xs text-gray-600">
                            {m.display_name || m.username}
                            <span className="text-gray-400 ml-1">@{m.username}</span>
                          </span>
                          <button
                            onClick={() => handleRemoveFromGroup(m.id)}
                            className="text-[11px] text-gray-400 hover:text-red-500 px-1.5 py-0.5"
                          >
                            제외
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 회원 관리 */}
      {tab === 'users' && isSuperAdmin && (
        <div className="space-y-2">
          {users.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">등록된 회원이 없습니다</div>
          ) : (
            users.map(u => (
              <div key={u.id} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{u.display_name || u.username}</span>
                    <span className="text-xs text-gray-400 ml-2">@{u.username}</span>
                  </div>
                  {u.phone && <span className="text-xs text-gray-400">{u.phone}</span>}
                </div>
                <div className="flex gap-2">
                  <select
                    value={u.role}
                    onChange={e => handleUserUpdate(u.id, 'role', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-gray-50"
                  >
                    <option value="user">일반 사용자</option>
                    <option value="group_admin">그룹 관리자</option>
                    <option value="super_admin">전체 관리자</option>
                  </select>
                  <select
                    value={u.group_id || ''}
                    onChange={e => handleUserUpdate(u.id, 'group_id', e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-gray-50"
                  >
                    <option value="">그룹 미지정</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 홈페이지 링크 관리 */}
      {tab === 'homepages' && isSuperAdmin && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex gap-2">
              <select
                value={hpBizType}
                onChange={e => { setHpBizType(e.target.value as 'CD' | 'BK'); setHpOrg(''); }}
                className="px-2 py-2 rounded-lg border border-gray-200 text-xs"
              >
                <option value="CD">카드사</option>
                <option value="BK">은행</option>
              </select>
              <select
                value={hpOrg}
                onChange={e => setHpOrg(e.target.value)}
                className="flex-1 px-2 py-2 rounded-lg border border-gray-200 text-xs"
              >
                <option value="">기관 선택</option>
                {Object.entries(hpBizType === 'CD' ? ORGANIZATION_MAP : BANK_ORGANIZATION_MAP).map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
              <select
                value={hpClientType}
                onChange={e => setHpClientType(e.target.value as 'P' | 'B')}
                className="px-2 py-2 rounded-lg border border-gray-200 text-xs"
              >
                <option value="P">개인</option>
                <option value="B">법인</option>
              </select>
            </div>

            {hpOrg ? (
              <>
                {savedHp && (
                  <div className="flex items-center justify-between">
                    <a
                      href={savedHp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-500 hover:text-primary-700 hover:underline"
                    >
                      현재 링크 확인하기
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    <button
                      onClick={() => handleToggleHomepageActive(savedHp)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                        savedHp.is_active
                          ? 'border-green-300 bg-green-50 text-green-600'
                          : 'border-gray-300 bg-gray-50 text-gray-400'
                      }`}
                    >
                      {savedHp.is_active ? '활성' : '비활성'}
                    </button>
                  </div>
                )}
                <input
                  type="url"
                  placeholder="https://..."
                  value={hpUrl}
                  onChange={e => setHpUrl(e.target.value)}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveHomepage}
                    disabled={!hpUrl.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold
                      hover:bg-primary-700 disabled:opacity-50 transition"
                  >
                    {savedHp ? '수정' : '저장'}
                  </button>
                  {savedHp && (
                    <button
                      onClick={handleDeleteHomepage}
                      className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium
                        hover:bg-red-50 transition"
                    >
                      삭제
                    </button>
                  )}
                </div>
                {hpMsg && <p className="text-xs text-center text-green-500">{hpMsg}</p>}
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">기관을 선택하면 저장된 링크가 표시됩니다</p>
            )}
          </div>

          {/* 등록된 기관 활성/비활성 목록 */}
          {homepages.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <p className="text-xs font-semibold text-gray-700 px-4 pt-3 pb-2">등록된 기관 목록</p>
              <div className="divide-y divide-gray-100">
                {homepages.map((hp: any) => {
                  const orgMap = hp.business_type === 'CD' ? ORGANIZATION_MAP : BANK_ORGANIZATION_MAP;
                  const orgName = orgMap[hp.organization] || hp.organization;
                  return (
                    <div key={hp.id} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${hp.business_type === 'CD' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-500'}`}>
                          {hp.business_type === 'CD' ? '카드' : '은행'}
                        </span>
                        <span className="text-xs text-gray-800 truncate">{orgName}</span>
                        <span className="text-[10px] text-gray-400">{hp.client_type === 'P' ? '개인' : '법인'}</span>
                      </div>
                      <button
                        onClick={() => handleToggleHomepageActive(hp)}
                        className={`text-[11px] px-2 py-0.5 rounded-md border transition shrink-0 ${
                          hp.is_active
                            ? 'border-green-300 bg-green-50 text-green-600'
                            : 'border-gray-300 bg-gray-50 text-gray-400'
                        }`}
                      >
                        {hp.is_active ? '활성' : '비활성'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
