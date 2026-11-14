import { cardDigits, formatCardNumber, luhnValid, normalizeExpiry, type ScannedCard } from '@moayo/core';
import { Camera, Copy, Eye, Images, LoaderCircle, Pencil, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { encodeImage } from '../lib/photos.ts';
import { db as supabaseClient, describeError } from '../lib/supabase.ts';
import { unseal, type CardSecret } from '../lib/vaultCrypto.ts';
import { VaultSheet } from './VaultSheet.tsx';

const SHOW_MS = 30_000;

/**
 * 자산 화면의 카드 정보 칸. 저장된 값은 가려 두고, 금고를 열어야 30초 동안 보인다.
 * draft 가 있으면(새로 넣거나 사진으로 읽음) 고칠 수 있는 입력칸으로 보인다. 저장할 때 암호화한다.
 */
export function CardSecretSection({
  householdId,
  sealed,
  last4,
  draft,
  onDraft,
}: {
  householdId: string;
  sealed: { iv: string; ct: string } | null | undefined;
  last4: string;
  draft: CardSecret | null;
  onDraft: (d: CardSecret | null) => void;
}) {
  const toast = useToast();
  const [shown, setShown] = useState<CardSecret | null>(null);
  const [left, setLeft] = useState(0);
  const [cvcShown, setCvcShown] = useState(false);
  const [asking, setAsking] = useState<'view' | 'edit' | null>(null);

  // 30초 뒤, 또는 금고가 잠기면(다른 앱으로 넘김) 다시 가린다.
  useEffect(() => {
    if (!shown) return;
    const until = Date.now() + SHOW_MS;
    const tick = window.setInterval(() => {
      const s = Math.ceil((until - Date.now()) / 1000);
      if (s <= 0) setShown(null);
      else setLeft(s);
    }, 250);
    const hide = () => setShown(null);
    window.addEventListener('moayo-vault-lock', hide);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('moayo-vault-lock', hide);
      setCvcShown(false);
    };
  }, [shown]);

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      toast({ message: `${label} 복사했어요 (30초 뒤 지워요)` });
      window.setTimeout(() => void navigator.clipboard?.writeText('').catch(() => undefined), SHOW_MS);
    });
  };

  const onKey = async (key: CryptoKey) => {
    const mode = asking;
    setAsking(null);
    if (!sealed) return;
    try {
      const value = await unseal<CardSecret>(key, sealed);
      if (mode === 'edit') onDraft(value);
      else setShown(value);
    } catch {
      toast({ message: '카드 정보를 풀지 못했어요(금고 비밀번호가 바뀌었을 수 있어요)', tone: 'error' });
    }
  };

  const numberOk = !draft?.number || luhnValid(draft.number);
  const input = 'h-11 w-full rounded-lg border border-line bg-surface px-3 text-base tabular-nums outline-none focus:border-brand';

  return (
    <div className="mt-3 rounded-xl border border-line p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">카드 정보 <span className="font-normal text-muted">· 암호화 보관</span></p>
        {sealed && !draft && !shown ? (
          <div className="flex gap-1">
            <button type="button" onClick={() => setAsking('view')} className="press flex h-8 items-center gap-1 rounded-full bg-surface-2 px-3 text-[13px] font-semibold">
              <Eye className="size-4" aria-hidden /> 보기
            </button>
            <button type="button" aria-label="카드 정보 고치기" onClick={() => setAsking('edit')} className="press flex size-8 items-center justify-center rounded-full bg-surface-2">
              <Pencil className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {draft ? (
        <div className="space-y-2">
          <input
            className={`${input} ${numberOk ? '' : 'border-expense'}`}
            value={draft.number ? formatCardNumber(draft.number) : ''}
            onChange={(e) => onDraft({ ...draft, number: cardDigits(e.target.value).slice(0, 19) })}
            inputMode="numeric"
            autoComplete="off"
            placeholder="카드번호"
            aria-label="카드번호"
          />
          {!numberOk ? <p className="text-xs text-expense">번호가 맞지 않아요. 다시 찍거나 고쳐 주세요.</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <input
              className={input}
              value={draft.expiry ?? ''}
              onChange={(e) => onDraft({ ...draft, expiry: e.target.value.replace(/[^0-9/]/g, '').slice(0, 5) })}
              onBlur={() => onDraft({ ...draft, expiry: normalizeExpiry(draft.expiry) ?? draft.expiry })}
              inputMode="numeric"
              autoComplete="off"
              placeholder="MM/YY"
              aria-label="유효기간"
            />
            <input
              className={input}
              type="password"
              value={draft.cvc ?? ''}
              onChange={(e) => onDraft({ ...draft, cvc: cardDigits(e.target.value).slice(0, 4) })}
              inputMode="numeric"
              autoComplete="off"
              placeholder="CVC"
              aria-label="CVC"
            />
          </div>
          <p className="text-xs leading-relaxed text-muted">저장할 때 금고 비밀번호로 암호화해요. CVC 는 유출되면 위험하니 꼭 필요할 때만 넣어 두세요.</p>
        </div>
      ) : shown ? (
        <dl className="space-y-1.5 text-[15px]">
          {[
            ['번호', shown.number ? formatCardNumber(shown.number) : '-', shown.number],
            ['유효기간', shown.expiry ?? '-', shown.expiry],
          ].map(([k, v, raw]) => (
            <div key={k} className="flex items-center gap-2">
              <dt className="w-16 shrink-0 text-sm text-muted">{k}</dt>
              <dd className="tabular min-w-0 flex-1 font-semibold tracking-wide">{v}</dd>
              {raw ? (
                <button type="button" aria-label={`${k} 복사`} onClick={() => copy(raw, k!)} className="press flex size-8 items-center justify-center rounded-full text-muted">
                  <Copy className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <dt className="w-16 shrink-0 text-sm text-muted">CVC</dt>
            <dd className="tabular flex-1 font-semibold">{shown.cvc ? (cvcShown ? shown.cvc : '•••') : '-'}</dd>
            {shown.cvc && !cvcShown ? (
              <button type="button" onClick={() => setCvcShown(true)} className="text-sm font-semibold text-brand">
                CVC 보기
              </button>
            ) : null}
          </div>
          <p className="pt-1 text-xs text-muted">{left}초 뒤 다시 가려요</p>
        </dl>
      ) : sealed ? (
        <p className="tabular text-[15px] tracking-wide text-muted">•••• •••• •••• {last4 || '••••'} · ••/•• · CVC •••</p>
      ) : (
        <button type="button" onClick={() => onDraft({ number: '', expiry: '', cvc: '' })} className="text-sm font-semibold text-brand">
          + 카드번호·유효기간·CVC 넣기
        </button>
      )}
      {asking ? (
        <VaultSheet householdId={householdId} reason={asking === 'view' ? '카드 정보를 보려면 금고를 열어 주세요.' : '카드 정보를 고치려면 금고를 열어 주세요.'} onKey={(k) => void onKey(k)} onClose={() => setAsking(null)} />
      ) : null}
    </div>
  );
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 카드 사진 → AI 가 읽은 칸. 사진은 서버에 저장되지 않는다. */
async function readCard(householdId: string, files: File[]): Promise<ScannedCard> {
  const images = await Promise.all(
    files.slice(0, 2).map(async (f) => {
      const { blob } = await encodeImage(f, 1600, 0.85);
      return { mime: blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg', b64: await toBase64(blob) };
    }),
  );
  const { data, error } = await supabaseClient().functions.invoke('ingest', { body: { mode: 'card', household_id: householdId, images } });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context ? await context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? describeError(error));
  }
  return (data as { card: ScannedCard }).card;
}

/** '카드 찍어서 등록': 앞면을 찍고, 원하면 뒷면(CVC)도 찍는다. */
export function CardScan({ householdId, onRead }: { householdId: string; onRead: (card: ScannedCard) => void }) {
  const toast = useToast();
  const [front, setFront] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const backCam = useRef<HTMLInputElement>(null);

  const run = async (files: File[]) => {
    setFront(null);
    setBusy(true);
    try {
      onRead(await readCard(householdId, files));
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : '카드를 읽지 못했어요', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const take = (e: React.ChangeEvent<HTMLInputElement>, then: (f: File) => void) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) then(f);
  };

  return (
    <div className="mb-2 rounded-xl bg-brand-soft p-3">
      <div className="flex items-center gap-2">
        <ScanLine className="size-5 shrink-0 text-brand" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-brand">{busy ? '카드를 읽는 중…' : '카드를 찍으면 나머지를 채워요'}</p>
        {busy ? (
          <LoaderCircle className="size-5 animate-spin text-brand" aria-hidden />
        ) : (
          <>
            <button type="button" onClick={() => cam.current?.click()} aria-label="카드 찍기" className="press flex h-9 items-center gap-1 rounded-full bg-brand px-3 text-sm font-semibold text-brand-fg">
              <Camera className="size-4" aria-hidden /> 찍기
            </button>
            <button type="button" onClick={() => gal.current?.click()} aria-label="카드 사진 고르기" className="press flex size-9 items-center justify-center rounded-full bg-surface text-brand">
              <Images className="size-4" aria-hidden />
            </button>
          </>
        )}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => take(e, setFront)} data-testid="card-camera" />
      <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => take(e, setFront)} data-testid="card-gallery" />
      <input ref={backCam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => take(e, (b) => front && void run([front, b]))} data-testid="card-back" />
      {front ? (
        <Sheet title="뒷면도 찍을까요?" onClose={() => void run([front])}>
          {(close) => (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-muted">뒷면을 찍으면 CVC 도 읽어요. 앞면만으로도 카드사·이름·번호·유효기간을 채울 수 있어요.</p>
              <Button block onClick={() => backCam.current?.click()}>
                <Camera className="size-5" aria-hidden /> 뒷면 찍기
              </Button>
              <Button block variant="secondary" onClick={close}>
                앞면만 읽기
              </Button>
            </div>
          )}
        </Sheet>
      ) : null}
    </div>
  );
}
