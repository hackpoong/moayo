import { cardDigits, type ScannedCard } from '@moayo/core';
import { Camera, Eye, EyeOff, Images, LoaderCircle, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/toastContext.ts';
import { Button } from '../components/ui.tsx';
import { encodeImage } from '../lib/photos.ts';
import { db as supabaseClient, describeError } from '../lib/supabase.ts';
import { availableKey } from '../lib/vault.ts';
import { unseal, type CardSecret } from '../lib/vaultCrypto.ts';
import { VaultSheet } from './VaultSheet.tsx';

/**
 * CVC 칸. 저장된 CVC 는 가려 두고 👁 를 누르면 보인다(이 휴대폰이 금고를 기억하면 바로, 처음이면 비밀번호 한 번).
 * value 가 null 이면 '저장된 값 그대로', 문자열이면 새로 넣는 중(저장할 때 암호화).
 */
export function CvcField({
  householdId,
  sealed,
  value,
  onChange,
}: {
  householdId: string;
  sealed: { iv: string; ct: string } | null | undefined;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // 다른 앱으로 넘어가면 다시 가린다.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && setVisible(false);
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  const reveal = async (key: CryptoKey) => {
    setAsking(false);
    if (!sealed) return;
    try {
      const v = await unseal<CardSecret>(key, sealed);
      setPlain(v.cvc ?? '');
      setVisible(true);
    } catch {
      toast({ message: 'CVC 를 풀지 못했어요(금고 비밀번호가 바뀌었을 수 있어요)', tone: 'error' });
    }
  };

  const toggle = async () => {
    if (visible) return setVisible(false);
    if (value !== null || plain !== null || !sealed) return setVisible(true);
    const key = await availableKey(householdId);
    if (key) void reveal(key);
    else setAsking(true);
  };

  const shown = value ?? plain;
  const hasSaved = !!sealed && value === null;
  return (
    <div className="flex w-full items-center gap-1">
      <input
        value={value ?? (visible && plain !== null ? plain : hasSaved ? '•••' : '')}
        onFocus={() => {
          // 저장된 CVC 를 고치려면 새로 입력한다.
          if (value === null && hasSaved) onChange(visible && plain ? plain : '');
        }}
        onChange={(e) => onChange(cardDigits(e.target.value).slice(0, 4))}
        type={visible || (value === null && hasSaved) ? 'text' : 'password'}
        inputMode="numeric"
        autoComplete="off"
        placeholder="뒷면 3자리"
        aria-label="CVC"
        className="tabular min-w-0 flex-1 bg-transparent text-base tracking-widest outline-none placeholder:text-muted/40 placeholder:tracking-normal"
      />
      {shown || hasSaved ? (
        <button type="button" aria-label={visible ? 'CVC 가리기' : 'CVC 보기'} onClick={() => void toggle()} className="press flex size-10 shrink-0 items-center justify-center rounded-full text-muted">
          {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      ) : null}
      {asking ? <VaultSheet householdId={householdId} reason="CVC 를 보려면 금고를 열어 주세요." onKey={(k) => void reveal(k)} onClose={() => setAsking(false)} /> : null}
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
