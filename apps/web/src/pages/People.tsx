import type { Member } from '@moayo/core';
import { Check, Copy, Link2, Pencil, Share2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { MemberBadge } from '../components/MemberBadge.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Button, Card, ErrorNote, Field } from '../components/ui.tsx';
import { useData, useDataContext } from '../data/dataContext.ts';
import { useSession } from '../lib/authContext.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { MEMBER_COLORS, memberColor } from '../lib/members.ts';
import { db, describeError } from '../lib/supabase.ts';

const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;

/**
 * 두 사람 카드: 이름·이모지·색·이체로 볼 이름을 고치고,
 * 아직 가입하지 않은 사람에게는 그 자리로 들어오는 초대 링크를 만든다.
 */
export function People() {
  const data = useData();
  const session = useSession();
  const household = useCurrentHousehold();
  const { engine } = useDataContext();
  const people = data.members.filter((m) => !m.deleted_at);
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{ memberId: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeInvite = async (m: Member) => {
    setBusy(true);
    setError(null);
    const { data: rows, error: e } = await db().rpc('create_member_invite', { p_household_id: household.householdId, p_member_id: m.id });
    setBusy(false);
    if (e) return setError(describeError(e));
    const code = (rows as { code: string }[] | null)?.[0]?.code;
    if (code) setInvite({ memberId: m.id, code });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('복사하지 못했습니다. 링크를 길게 눌러 직접 복사해 주세요.');
    }
  };

  return (
    <Card>
      <h2 className="font-semibold">함께 쓰는 사람</h2>
      <ErrorNote>{error}</ErrorNote>
      <ul className="mt-1 divide-y divide-line">
        {people.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full text-xl" style={{ backgroundColor: `${memberColor(m, data.members)}22` }} aria-hidden>
                {m.emoji || m.display_name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  <MemberBadge member={m} size="md" />
                  {m.user_id === session.user.id ? <span className="ml-1.5 text-sm font-normal text-muted">(나)</span> : null}
                </span>
                <span className="block truncate text-xs font-normal text-muted">
                  {m.user_id ? '연결됨' : '아직 가입 전'}
                  {(m.aliases ?? []).length ? ` · 이체로 볼 이름 ${(m.aliases ?? []).length}개` : ''}
                </span>
              </span>
              <button type="button" aria-label={`${m.display_name} 고치기`} onClick={() => setEditing(m)} className="press rounded-full p-2 text-muted">
                <Pencil className="size-5" aria-hidden />
              </button>
            </div>
            {!m.user_id ? (
              invite?.memberId === m.id ? (
                <div className="mt-2 rounded-xl bg-surface-2 p-3">
                  <p className="tabular break-all text-sm">{inviteLink(invite.code)}</p>
                  <p className="mt-1 text-xs font-normal text-muted">{m.display_name}님이 이 링크로 들어오면 지금 자리(자산·내역)에 그대로 연결됩니다. 72시간 동안 한 번 쓸 수 있습니다.</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => void copy(invite.code)} className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-semibold">
                      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied ? '복사됨' : '복사'}
                    </button>
                    {'share' in navigator ? (
                      <button
                        type="button"
                        onClick={() => void navigator.share({ title: '모아요 가계부', url: inviteLink(invite.code) }).catch(() => undefined)}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-sm font-semibold"
                      >
                        <Share2 className="size-4" aria-hidden />
                        보내기
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <Button variant="secondary" busy={busy} onClick={() => void makeInvite(m)} className="mt-2 h-10 text-sm">
                  <Link2 className="size-4" aria-hidden />
                  {m.display_name}님 초대 링크 만들기
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {people.length < 2 ? (
        <Button variant="secondary" block onClick={() => setAdding(true)} className="mt-2">
          <UserPlus className="size-5" aria-hidden />
          함께 쓰는 사람 추가
        </Button>
      ) : null}

      {editing ? (
        <PersonSheet
          key={editing.id}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => engine.syncNow()}
        />
      ) : null}
      {adding ? <PersonSheet member={null} onClose={() => setAdding(false)} onSaved={() => engine.syncNow()} /> : null}
    </Card>
  );
}

/** 한 사람 고치기(또는 계정 없는 사람 새로 만들기). */
function PersonSheet({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
  const data = useData();
  const household = useCurrentHousehold();
  const [name, setName] = useState(member?.display_name ?? '');
  const [emoji, setEmoji] = useState(member?.emoji ?? '');
  const [color, setColor] = useState(member ? memberColor(member, data.members) : MEMBER_COLORS[1]!);
  const [aliases, setAliases] = useState((member?.aliases ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (close: () => void) => {
    setBusy(true);
    setError(null);
    const names = aliases
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
    let id = member?.id;
    if (!id) {
      const { data: newId, error: e } = await db().rpc('create_placeholder_member', {
        p_household_id: household.householdId,
        p_display_name: name.trim(),
        p_emoji: emoji.trim() || null,
        p_color: color,
      });
      if (e) {
        setBusy(false);
        return setError(describeError(e));
      }
      id = newId as string;
    }
    const { error: e } = await db()
      .from('members')
      .update({ display_name: name.trim(), emoji: emoji.trim() || null, color, aliases: names })
      .eq('id', id);
    setBusy(false);
    if (e) return setError(describeError(e));
    onSaved();
    close();
  };

  return (
    <Sheet
      title={member ? `${member.display_name} 고치기` : '함께 쓰는 사람 추가'}
      onClose={onClose}
      footer={(close) => (
        <Button block busy={busy} disabled={!name.trim()} onClick={() => void save(close)}>
          저장
        </Button>
      )}
    >
      <div className="space-y-4 pt-1">
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-3">
          <label className="w-20 shrink-0">
            <span className="mb-1.5 block text-sm font-normal text-muted">이모지</span>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 8))}
              aria-label="이모지"
              placeholder="💛"
              className="h-12 w-full rounded-xl border border-line bg-surface text-center text-2xl outline-none focus:border-brand"
            />
          </label>
          <div className="flex-1">
            <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-normal text-muted">색</p>
          <div className="flex flex-wrap gap-2">
            {[...MEMBER_COLORS, '#eab308', '#2563eb'].map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`색 ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
                className={`press size-9 rounded-full ${c === color ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-normal text-muted">이체로 볼 이름 (실명 등, 쉼표로 구분)</span>
          <textarea
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            rows={2}
            placeholder="예: 은행 앱에 찍히는 실명"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-brand"
          />
          <span className="mt-1 block text-xs font-normal text-muted">이 이름으로 보내거나 받은 돈은 지출·수입이 아니라 이체로 기록합니다.</span>
        </label>
      </div>
    </Sheet>
  );
}
