import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

/** 금액 키패드. 휴대폰 기본 키보드보다 빠르고, 화면이 밀리지 않는다. */
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'del') return onChange(value.slice(0, -1));
    const next = (value + key).replace(/^0+/, '');
    if (next.length > 12) return; // 1조 미만
    onChange(next);
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === 'del' ? '지우기' : key}
          className="tabular flex h-14 items-center justify-center rounded-xl bg-surface-2 text-2xl font-semibold active:bg-line"
        >
          {key === 'del' ? <Delete className="size-6" aria-hidden /> : key}
        </button>
      ))}
    </div>
  );
}

/** 자주 쓰는 금액 더하기 버튼. */
export function QuickAdd({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const add = (n: number) => onChange(String((Number(value) || 0) + n));
  return (
    <div className="flex gap-2">
      {[1000, 5000, 10000, 50000].map((n) => (
        <button key={n} type="button" onClick={() => add(n)} className="h-9 flex-1 rounded-lg border border-line text-sm font-medium text-muted active:bg-surface-2">
          +{n >= 10000 ? `${n / 10000}만` : `${n / 1000}천`}
        </button>
      ))}
    </div>
  );
}
