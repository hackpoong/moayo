import { formatWon, toKstDate, type Transaction } from '@moayo/core';
import { CircleAlert, CircleCheck, Copy, ImagePlus, LoaderCircle, MessageSquareText, Plus, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { Segmented } from '../components/bits.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Button } from '../components/ui.tsx';
import { useData, useDataContext } from '../data/dataContext.ts';
import { shortDate } from '../lib/format.ts';
import { useCurrentHousehold } from '../lib/householdContext.ts';
import { setPref, usePrefs, type AiQuality } from '../lib/prefs.ts';
import { db, describeError } from '../lib/supabase.ts';
import { useOpenEditor } from './editorContext.ts';

type Mode = 'image' | 'text';

interface ResultItem {
  action: 'created' | 'merged' | 'duplicate' | 'review' | 'skipped';
  transaction_id: string;
  merchant: string | null;
  amount: number;
  kind: Transaction['kind'];
  status: Transaction['status'];
  occurred_at: string;
  reason: string;
}

interface IngestResult {
  read: number;
  created: number;
  merged: number;
  duplicate: number;
  review: number;
  items: ResultItem[];
  repeated?: boolean;
}

interface Job {
  id: string;
  label: string;
  state: 'waiting' | 'uploading' | 'reading' | 'done' | 'failed';
  result?: IngestResult;
  error?: string;
  run: () => Promise<IngestResult>;
}

/**
 * 사진을 AI 가 읽기 좋은 크기의 JPEG 조각들로 만든다.
 *  * 보통 사진·캡처: 한 장. 긴 변 1800px, 짧은 변 1100px 이하로 줄인다.
 *  * 아주 긴 캡처(스크롤 캡처, 세로가 가로의 2.6배 넘음): 줄이면 글씨가 뭉개지므로, 위아래로 겹치게 잘라 여러 장으로.
 *    겹친 부분의 같은 줄은 서버에서 이미 있는 내역으로 알아보고 한 번만 넣는다.
 */
/**
 * 이미지 지문(차이 해시, 256비트). 위쪽 상태 표시줄(시계)은 빼고 계산해서,
 * 같은 화면을 다시 캡처한 사진은 같은(또는 거의 같은) 지문이 나온다.
 */
function fingerprint(canvas: HTMLCanvasElement): string {
  const W = 17;
  const H = 16;
  const skip = Math.round(canvas.height * 0.05);
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const ctx = small.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, skip, canvas.width, canvas.height - skip, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const gray = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return px[i]! * 0.299 + px[i + 1]! * 0.587 + px[i + 2]! * 0.114;
  };
  let hex = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 16; x += 4) {
      let nibble = 0;
      for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (gray(x + b, y) > gray(x + b + 1, y) ? 1 : 0);
      hex += nibble.toString(16);
    }
  }
  return hex;
}

interface Piece {
  blob: Blob;
  phash: string;
}

async function prepare(file: File): Promise<Piece[]> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const toJpeg = (sx: number, sy: number, sw: number, sh: number, scale: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return new Promise<Piece>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve({ blob: b, phash: fingerprint(canvas) }) : reject(new Error('이미지를 변환하지 못했습니다.'))), 'image/jpeg', 0.88),
    );
  };
  try {
    if (height / width <= 2.6) {
      const scale = Math.min(1, 1800 / Math.max(width, height), 1100 / Math.min(width, height));
      return [await toJpeg(0, 0, width, height, scale)];
    }
    const scale = Math.min(1, 1100 / width);
    const tile = Math.round(width * 2);
    const step = Math.round(tile * 0.75);
    const pieces: Piece[] = [];
    for (let y = 0; y < height; y += step) {
      const h = Math.min(tile, height - y);
      pieces.push(await toJpeg(0, y, width, h, scale));
      if (y + h >= height) break;
    }
    return pieces;
  } finally {
    bitmap.close();
  }
}

/** 사진·캡처·문자를 넣으면 AI 가 정리해서 바로 내역에 넣는다. */
export function ImportSheet({ initialMode = 'image', onClose }: { initialMode?: Mode; onClose: () => void }) {
  const household = useCurrentHousehold();
  const { engine } = useDataContext();
  const { aiQuality } = usePrefs();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const running = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const call = async (body: Record<string, unknown>): Promise<IngestResult> => {
    const { data, error } = await db().functions.invoke('ingest', { body: { household_id: household.householdId, ...body } });
    if (error) {
      // 함수가 돌려준 한국어 오류 문장을 꺼낸다.
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().catch(() => null) : null;
      throw new Error(detail?.error ?? describeError(error));
    }
    engine.syncNow();
    return data as IngestResult;
  };

  const update = (id: string, patch: Partial<Job>) => setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  /** 차례대로 처리한다. 겹치게 찍은 캡처도 앞의 결과와 맞춰 보며 중복 없이 들어간다. */
  const runQueue = async (queue: Job[]) => {
    if (running.current) return;
    running.current = true;
    for (const job of queue) {
      try {
        update(job.id, { state: job.label.startsWith('문구') ? 'reading' : 'uploading', error: undefined });
        const result = await job.run();
        update(job.id, { state: 'done', result });
      } catch (e) {
        update(job.id, { state: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    }
    running.current = false;
  };

  const addFiles = (files: FileList | null) => {
    const quality: AiQuality = aiQuality;
    if (!files?.length) return;
    const month = new Date().toISOString().slice(0, 7);
    const list = [...files];
    // 조각 수를 미리 알 수 없으므로, 사진마다 하나의 작업이 조각들을 차례로 올리고 읽는다.
    const created: Job[] = list.map((file, i) => {
      const id = crypto.randomUUID();
      const name = file.name || `사진 ${i + 1}`;
      return {
        id,
        label: name,
        state: 'waiting',
        run: async () => {
          const pieces = await prepare(file);
          const total: IngestResult = { read: 0, created: 0, merged: 0, duplicate: 0, review: 0, items: [] };
          for (const [n, { blob, phash }] of pieces.entries()) {
            if (pieces.length > 1) update(id, { label: `${name} (${n + 1}/${pieces.length})` });
            update(id, { state: 'uploading' });
            const path = `${household.householdId}/${month}/${id}-${n}.jpg`;
            const { error } = await db().storage.from('inputs').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
            if (error) throw new Error(`올리지 못했습니다: ${error.message}`);
            update(id, { state: 'reading' });
            const r = await call({ source: 'screenshot', image_path: path, image_phash: phash, quality: quality });
            total.read += r.read;
            total.created += r.created;
            total.merged += r.merged;
            total.duplicate += r.duplicate;
            total.review += r.review;
            total.items.push(...r.items);
            total.repeated = r.repeated;
          }
          if (pieces.length > 1) update(id, { label: `${name} (${pieces.length}조각)` });
          return total;
        },
      };
    });
    setJobs((prev) => [...prev, ...created]);
    void runQueue(created);
    if (fileInput.current) fileInput.current.value = '';
  };

  const addText = () => {
    const value = text.trim();
    if (!value) return;
    const id = crypto.randomUUID();
    const job: Job = { id, label: `문구: ${value.slice(0, 24)}${value.length > 24 ? '…' : ''}`, state: 'waiting', run: () => call({ source: 'text', text: value }) };
    setJobs((list) => [...list, job]);
    setText('');
    void runQueue([job]);
  };

  const pasteFromClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      // 권한이 없으면 사용자가 직접 붙여 넣는다.
    }
  };

  const retry = (job: Job) => void runQueue([job]);
  const busy = jobs.some((j) => j.state === 'uploading' || j.state === 'reading' || j.state === 'waiting');

  return (
    <Sheet title="자동으로 넣기" onClose={onClose} tall footer={<Button block variant="secondary" onClick={onClose}>{busy ? '닫아도 계속 처리됩니다' : '닫기'}</Button>}>
      <div className="space-y-4 pt-1">
        <div className="flex">
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel="넣는 방법"
            options={[
              { value: 'image', label: '사진·캡처' },
              { value: 'text', label: '문자·알림' },
            ]}
          />
        </div>

        {mode === 'image' ? (
          <div className="space-y-3">
            <QualityPicker value={aiQuality} onChange={(q) => setPref('aiQuality', q)} />
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center active:bg-surface-2"
            >
              <ImagePlus className="size-8 text-brand" aria-hidden />
              <span className="font-semibold">사진 고르기 (여러 장 가능)</span>
              <span className="text-sm text-muted">영수증, 토스·네이버페이 내역 캡처, 여민전 이용내역, 카드 명세서</span>
            </button>
            <p className="text-xs leading-relaxed text-muted">
              겹치게 찍은 캡처도 괜찮습니다. 이미 있는 내역은 다시 넣지 않고, 빠진 정보만 채웁니다. 광고·추천 영역은 빼고 읽습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={'결제 문자나 알림 문구를 붙여 넣으세요.\n예) [Web발신] 현대카드 승인 12,500원 일시불 11/13 12:30 스타벅스'}
              className="w-full rounded-xl border border-line bg-surface p-3 text-[15px]"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void pasteFromClipboard()} className="h-11 shrink-0 whitespace-nowrap px-4 text-sm">
                <Copy className="size-4" aria-hidden />
                붙여넣기
              </Button>
              <Button block onClick={addText} disabled={!text.trim()} className="h-11">
                <MessageSquareText className="size-5" aria-hidden />
                읽어서 넣기
              </Button>
            </div>
            <p className="text-xs text-muted">카드·은행 문자는 AI 없이 바로 읽고, 처음 보는 형식만 AI 로 읽습니다. 긴 카드·계좌 번호는 가려서 보냅니다.</p>
          </div>
        )}

        {jobs.length ? (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onRetry={() => retry(job)} />
            ))}
          </ul>
        ) : null}
      </div>
    </Sheet>
  );
}

const QUALITY: { value: AiQuality; title: string; hint: string }[] = [
  { value: 'fast', title: '빠르게', hint: '1장 약 7원' },
  { value: 'accurate', title: '정확하게', hint: '1장 약 27원' },
];

/** 사진을 읽을 AI 고르기. 고른 값은 이 기기에 기억한다. */
function QualityPicker({ value, onChange }: { value: AiQuality; onChange: (q: AiQuality) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-label="읽는 AI" className="grid grid-cols-2 gap-2">
        {QUALITY.map((q) => (
          <button
            key={q.value}
            type="button"
            role="radio"
            aria-checked={q.value === value}
            onClick={() => onChange(q.value)}
            className={`press rounded-xl border px-3 py-2.5 text-left transition-colors ${q.value === value ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}
          >
            <span className={`block text-[15px] font-semibold ${q.value === value ? 'text-brand' : ''}`}>{q.title}</span>
            <span className="block text-xs text-muted">{q.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {value === 'fast'
          ? '보통은 이걸로 충분합니다. 틀린 게 보이면 같은 사진을 ‘정확하게’로 다시 넣으세요.'
          : '더 정확하지만 4배쯤 비쌉니다. 긴 스크롤 캡처는 여러 조각으로 나눠 읽어서 조각 수만큼 듭니다.'}
      </p>
    </div>
  );
}

const ACTION_LABEL: Record<ResultItem['action'], { text: string; tone: string }> = {
  created: { text: '새로', tone: 'bg-brand-soft text-brand' },
  merged: { text: '보충', tone: 'bg-income/10 text-income' },
  duplicate: { text: '이미 있음', tone: 'bg-surface-2 text-muted' },
  review: { text: '확인 필요', tone: 'bg-expense/10 text-expense' },
  skipped: { text: '건너뜀', tone: 'bg-surface-2 text-muted' },
};

function JobCard({ job, onRetry }: { job: Job; onRetry: () => void }) {
  const data = useData();
  const openEditor = useOpenEditor();
  const r = job.result;
  return (
    <li className="rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        {job.state === 'done' ? (
          <CircleCheck className="size-5 shrink-0 text-income" aria-hidden />
        ) : job.state === 'failed' ? (
          <CircleAlert className="size-5 shrink-0 text-expense" aria-hidden />
        ) : (
          <LoaderCircle className="size-5 shrink-0 animate-spin text-muted" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.label}</span>
        <span className="shrink-0 text-xs text-muted">
          {job.state === 'waiting' ? '기다리는 중' : job.state === 'uploading' ? '올리는 중' : job.state === 'reading' ? 'AI 가 읽는 중' : null}
        </span>
        {job.state === 'failed' ? (
          <button type="button" onClick={onRetry} className="flex items-center gap-1 text-sm font-semibold text-brand">
            <RefreshCw className="size-4" aria-hidden />
            다시
          </button>
        ) : null}
      </div>
      {job.error ? <p className="mt-2 text-sm text-expense">{job.error}</p> : null}
      {r ? (
        <>
          <p className="mt-2 text-sm text-muted">
            {r.repeated ? '이미 넣은 사진입니다 · ' : ''}
            {r.read}줄 읽음 · 새로 {r.created} · 보충 {r.merged} · 이미 있음 {r.duplicate}
            {r.review ? <b className="text-expense"> · 확인 필요 {r.review}</b> : null}
          </p>
          {r.items.length ? (
            <ul className="mt-2 divide-y divide-line rounded-xl bg-surface px-3">
              {r.items.map((item, i) => {
                const local = data.transactions.find((t) => t.id === item.transaction_id);
                const label = ACTION_LABEL[item.action];
                return (
                  <li key={`${item.transaction_id}-${i}`}>
                    <button
                      type="button"
                      disabled={!local}
                      onClick={() => local && openEditor({ tx: local })}
                      className="flex w-full items-center gap-2 py-2 text-left disabled:opacity-60"
                      title={item.reason}
                    >
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${label.tone}`}>{label.text}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.merchant ?? '이름 없음'}
                        {item.status === 'canceled' ? <span className="ml-1 text-muted">(취소)</span> : null}
                        {item.kind === 'transfer' ? <span className="ml-1 text-muted">(이체)</span> : null}
                      </span>
                      <span className="tabular shrink-0 text-xs text-muted">{shortDate(toKstDate(item.occurred_at))}</span>
                      <span className="tabular w-20 shrink-0 text-right text-sm font-semibold">{formatWon(item.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">거래 내역을 찾지 못했습니다.</p>
          )}
        </>
      ) : null}
    </li>
  );
}

export function ImportButtons({ onPick }: { onPick: (mode: Mode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onPick('image')} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand">
        <ImagePlus className="size-5" aria-hidden />
        사진·캡처로
      </button>
      <button type="button" onClick={() => onPick('text')} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-soft text-sm font-semibold text-brand">
        <Plus className="size-5" aria-hidden />
        문자 붙여넣기
      </button>
    </div>
  );
}
