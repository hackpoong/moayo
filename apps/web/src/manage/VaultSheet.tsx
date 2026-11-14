import { LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet } from '../components/Sheet.tsx';
import { Button, ErrorNote, Field } from '../components/ui.tsx';
import {
  biometricSupported,
  availableKey,
  loadVaultMeta,
  rememberOnDevice,
  setUpVault,
  unlockWithPassword,
} from '../lib/vault.ts';
import { vaultPasswordProblem, type VaultMeta } from '../lib/vaultCrypto.ts';

/** 카드 금고 열기. 처음이면 비밀번호를 정한다. 열리면 onKey 로 키를 넘긴다. */
export function VaultSheet({ householdId, reason, onKey, onClose }: { householdId: string; reason: string; onKey: (key: CryptoKey) => void; onClose: () => void }) {
  const [meta, setMeta] = useState<VaultMeta | null | undefined>(undefined);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [bioOk, setBioOk] = useState(false);
  // 볼 때마다 지문 확인(기본 끔: 👁 만 누르면 바로 보이게).
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void availableKey(householdId).then((ready) => {
      if (ready) return onKey(ready);
      void loadVaultMeta(householdId).then(setMeta);
      void biometricSupported().then(setBioOk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const finish = async (key: CryptoKey) => {
    onKey(key);
    // 이 기기는 기억해서 다음부터 바로 보이게 한다(지문 확인을 골랐으면 등록이 끝난 뒤 그렇게).
    const bio = remember && bioOk;
    void rememberOnDevice(householdId, key, bio).catch(() => rememberOnDevice(householdId, key, false).catch(() => undefined));
  };

  const create = async () => {
    const problem = vaultPasswordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError('두 비밀번호가 달라요');
    setBusy(true);
    setError(null);
    try {
      await finish(await setUpVault(householdId, pw));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    if (!meta) return;
    setBusy(true);
    setError(null);
    const key = await unlockWithPassword(householdId, meta, pw);
    setBusy(false);
    if (!key) return setError('비밀번호가 맞지 않아요');
    await finish(key);
  };

  return (
    <Sheet title={meta === null ? '카드 금고 만들기' : '카드 금고 열기'} onClose={onClose}>
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            {reason} CVC 는 이 휴대폰에서 암호화한 뒤에만 저장되고, 서버도 비밀번호 없이는 읽을 수 없어요.
          </span>
        </p>
        {meta === undefined ? <p className="text-sm text-muted">확인하는 중…</p> : null}
        {meta === null ? (
          <>
            <Field label="금고 비밀번호 (두 사람이 같이 써요)" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <Field label="한 번 더" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <p className="rounded-xl bg-expense/10 px-4 py-3 text-[13px] leading-relaxed text-expense">
              비밀번호를 잊으면 저장한 CVC 는 되찾을 수 없어요(CVC 만 다시 넣으면 되고, 가계부 내용은 그대로예요).
            </p>
          </>
        ) : meta ? (
          <>
            <Field
              label="금고 비밀번호"
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void open()}
              autoFocus
            />
          </>
        ) : null}
        {meta !== undefined ? <p className="text-[13px] text-muted">이 휴대폰은 기억해 두어서, 다음부터는 👁 만 누르면 바로 보여요.</p> : null}
        {meta !== undefined && bioOk ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-brand" />
            볼 때마다 지문·얼굴 확인
          </label>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {meta !== undefined ? (
          <Button block busy={busy} disabled={!pw} onClick={() => void (meta === null ? create() : open())}>
            {meta === null ? '금고 만들기' : '열기'}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
