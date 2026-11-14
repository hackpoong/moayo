import type { MemberRole } from '@moayo/core';
import { ArrowLeftRight, Check, ChevronRight, Copy, CreditCard, Download, Hash, LayoutGrid, LogOut, Share2, Sparkles, UserMinus, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { SyncBadge } from '../components/SyncBadge.tsx';
import { deleteLocalDb } from '../data/localDb.ts';
import { AiUsagePreview } from './settings/AiUsage.tsx';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, Field } from '../components/ui.tsx';
import { useAuth, useSession } from '../lib/authContext.ts';
import { clearHouseholdCache, useCurrentHousehold, useHouseholds } from '../lib/householdContext.ts';
import { db, describeError } from '../lib/supabase.ts';

interface MemberRow {
  id: string;
  user_id: string;
  display_name: string;
  role: MemberRole;
}

interface InviteRow {
  id: string;
  code: string;
  expires_at: string;
}

const SETTINGS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/more/payment-methods', label: '결제수단', icon: CreditCard },
  { to: '/more/categories', label: '카테고리', icon: LayoutGrid },
  { to: '/more/tags', label: '태그', icon: Hash },
  { to: '/more/transfer-rules', label: '우리끼리 이체 대상', icon: ArrowLeftRight },
  { to: '/more/export', label: '내보내기·백업', icon: Download },
  { to: '/more/ai-usage', label: 'AI 사용량·비용', icon: Sparkles },
];

const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;

export function More() {
  const session = useSession();
  const { signOut } = useAuth();
  const household = useCurrentHousehold();
  const { refresh, memberships, select } = useHouseholds();
  const isOwner = household.role === 'owner';

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // 바꿀 때마다 숫자를 올려서 목록을 다시 받는다.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let active = true;
    const membersQuery = db()
      .from('members')
      .select('id, user_id, display_name, role')
      .eq('household_id', household.householdId)
      .is('deleted_at', null)
      .order('created_at');
    const invitesQuery = isOwner
      ? db()
          .from('invites')
          .select('id, code, expires_at')
          .eq('household_id', household.householdId)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
      : Promise.resolve(null);
    void Promise.all([membersQuery, invitesQuery]).then(([m, i]) => {
      if (!active) return;
      if (m.error) setError(describeError(m.error));
      else setMembers(m.data as MemberRow[]);
      if (i && !i.error) setInvites(i.data as InviteRow[]);
    });
    return () => {
      active = false;
    };
  }, [household.householdId, isOwner, version]);

  const run = async (action: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await action();
    if (actionError) setError(describeError(actionError));
    reload();
    setBusy(false);
    return !actionError;
  };

  const createInvite = () => run(() => db().rpc('create_invite', { p_household_id: household.householdId }));
  const revokeInvite = (id: string) => run(() => db().rpc('revoke_invite', { p_invite_id: id }));
  const removeMember = (member: MemberRow) => {
    if (!window.confirm(`${member.display_name}님을 가족에서 내보낼까요?\n이 사람이 입력한 내역은 그대로 남습니다.`)) return;
    void run(() => db().rpc('remove_member', { p_member_id: member.id }));
  };

  const saveMyName = async (name: string) => {
    if (await run(() => db().from('members').update({ display_name: name }).eq('id', household.memberId))) {
      await refresh();
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(code);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('복사하지 못했습니다. 링크를 길게 눌러 직접 복사해 주세요.');
    }
  };

  const share = (code: string) =>
    navigator
      .share({ title: '모아요 가계부 초대', text: `‘${household.householdName}’ 가계부에 초대합니다.`, url: inviteLink(code) })
      .catch(() => undefined);

  const leave = async () => {
    if (!window.confirm('로그아웃할까요? 이 기기에 저장된 가계부 사본도 지웁니다(서버에는 그대로 남습니다).')) return;
    clearHouseholdCache(session.user.id);
    await deleteLocalDb(session.user.id).catch(() => undefined);
    await signOut();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">더보기</h1>
        <SyncBadge always />
      </div>
      <ErrorNote>{error}</ErrorNote>

      <nav className="divide-y divide-line rounded-2xl bg-surface px-4" aria-label="설정">
        {SETTINGS.map((item) => (
          <Link key={item.to} to={item.to} className="flex h-14 items-center gap-3">
            <item.icon className="size-5 text-muted" aria-hidden />
            <span className="flex-1 font-medium">{item.label}</span>
            {item.to === '/more/ai-usage' ? <AiUsagePreview /> : null}
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Link>
        ))}
      </nav>

      {memberships.length > 1 ? (
        <Card>
          <h2 className="font-semibold">가계부 바꾸기</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {memberships.map((m) => (
              <button
                key={m.householdId}
                type="button"
                onClick={() => select(m.householdId)}
                className={`h-10 rounded-full px-4 text-sm font-medium ${m.householdId === household.householdId ? 'bg-brand text-brand-fg' : 'bg-surface-2'}`}
              >
                {m.householdName}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-semibold">{household.householdName} 구성원</h2>
        <ul className="mt-2 divide-y divide-line">
          {members.map((member) => (
            <li key={member.id} className="flex h-14 items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">
                {member.display_name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {member.display_name}
                {member.user_id === session.user.id ? <span className="ml-1.5 text-sm text-muted">(나)</span> : null}
              </span>
              {member.role === 'owner' ? <span className="text-xs text-muted">만든 사람</span> : null}
              {isOwner && member.user_id !== session.user.id ? (
                <button
                  type="button"
                  aria-label={`${member.display_name} 내보내기`}
                  disabled={busy}
                  onClick={() => removeMember(member)}
                  className="rounded-full p-2 text-muted hover:bg-surface-2"
                >
                  <UserMinus className="size-5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">가족 초대</h2>
        {isOwner ? (
          <>
            <p className="mt-1 text-sm text-muted">링크 하나로 한 사람만 합류할 수 있고, 72시간 뒤에는 쓸 수 없습니다.</p>
            <ul className="mt-3 space-y-3">
              {invites.map((invite) => (
                <li key={invite.id} className="rounded-xl bg-surface-2 p-3">
                  <p className="tabular break-all text-sm">{inviteLink(invite.code)}</p>
                  <p className="mt-1 text-xs text-muted">{formatExpiry(invite.expires_at)}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => void copy(invite.code)} className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-medium">
                      {copied === invite.code ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied === invite.code ? '복사됨' : '복사'}
                    </button>
                    {'share' in navigator ? (
                      <button type="button" onClick={() => void share(invite.code)} className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-medium">
                        <Share2 className="size-4" aria-hidden />
                        보내기
                      </button>
                    ) : null}
                    <button type="button" disabled={busy} onClick={() => void revokeInvite(invite.id)} className="ml-auto h-9 px-2 text-sm text-muted">
                      취소
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Button block busy={busy} onClick={() => void createInvite()} className="mt-3">
              초대 링크 만들기
            </Button>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">초대 링크는 가계부를 만든 사람이 만들 수 있습니다.</p>
        )}
      </Card>

      <NameForm key={household.memberId} current={household.displayName} busy={busy} onSave={saveMyName} />

      <Card>
        <p className="truncate text-sm text-muted">{session.user.email}</p>
        <Button variant="ghost" onClick={() => void leave()} className="-ml-3 mt-1">
          <LogOut className="size-5" aria-hidden />
          로그아웃
        </Button>
      </Card>
    </div>
  );
}

function formatExpiry(expiresAt: string): string {
  const hours = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간 뒤 만료` : `${hours}시간 뒤 만료`;
}

/** 내 표시 이름 바꾸기. 저장하면 current 가 바뀌어 버튼이 다시 잠긴다. */
function NameForm({ current, busy, onSave }: { current: string; busy: boolean; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(current);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(name.trim());
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <Field label="내 이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        <Button type="submit" variant="secondary" busy={busy} disabled={!name.trim() || name.trim() === current}>
          이름 저장
        </Button>
      </form>
    </Card>
  );
}
