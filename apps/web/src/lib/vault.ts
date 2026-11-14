// 가족 금고(카드 CVC) 열기.
//  * 한 번 비밀번호로 열면 꺼낼 수 없는 키를 이 기기 IndexedDB 에 기억해서, 다음부터는 👁 만 누르면 바로 보인다.
//  * '볼 때마다 지문 확인'을 켜면 쓸 때마다 지문·얼굴 확인을 거친다.
//  * 다른 기기는 처음 한 번 비밀번호가 필요하다(서버에는 암호문만 있다).

import { createVault, openVault, type VaultMeta } from './vaultCrypto.ts';
import { db as supabaseClient } from './supabase.ts';

const UNLOCK_MS = 2 * 60_000;
const metaKey = (hid: string) => `moayo-vault-meta:${hid}`;

let unlocked: { hid: string; key: CryptoKey; until: number } | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lockVault();
  });
}

export function lockVault(): void {
  unlocked = null;
  window.dispatchEvent(new Event('moayo-vault-lock'));
}

export function unlockedKey(hid: string): CryptoKey | null {
  if (!unlocked || unlocked.hid !== hid || Date.now() > unlocked.until) return null;
  return unlocked.key;
}

function keep(hid: string, key: CryptoKey) {
  unlocked = { hid, key, until: Date.now() + UNLOCK_MS };
}

/** 금고 정보(비밀 아님). 오프라인이면 마지막으로 받은 것. 아직 없으면 null. */
export async function loadVaultMeta(hid: string): Promise<VaultMeta | null> {
  try {
    const { data, error } = await supabaseClient().from('household_vault').select('salt, iterations, verifier').eq('household_id', hid).maybeSingle();
    if (error) throw error;
    if (data) localStorage.setItem(metaKey(hid), JSON.stringify(data));
    return (data as VaultMeta | null) ?? null;
  } catch {
    const cached = localStorage.getItem(metaKey(hid));
    return cached ? (JSON.parse(cached) as VaultMeta) : null;
  }
}

export async function setUpVault(hid: string, password: string): Promise<CryptoKey> {
  const { meta, key } = await createVault(password);
  const { error } = await supabaseClient().from('household_vault').insert({ household_id: hid, ...meta });
  if (error) throw new Error(error.code === '23505' ? '이미 금고가 있습니다. 다시 열어 주세요.' : `금고를 만들지 못했습니다: ${error.message}`);
  localStorage.setItem(metaKey(hid), JSON.stringify(meta));
  keep(hid, key);
  return key;
}

export async function unlockWithPassword(hid: string, meta: VaultMeta, password: string): Promise<CryptoKey | null> {
  const key = await openVault(password, meta);
  if (key) keep(hid, key);
  return key;
}

// ── 이 기기에서 지문으로 열기 ──────────────────────────────────────────────
interface DeviceKey {
  hid: string;
  key: CryptoKey;
  /** 있으면 쓸 때마다 지문·얼굴 확인. */
  credentialId?: ArrayBuffer;
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('moayo-vault', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys', { keyPath: 'hid' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction('keys', mode).objectStore('keys'));
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}

/** 이 기기에 지문·얼굴 확인 장치가 있는지. */
export async function biometricSupported(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function hasDeviceKey(hid: string): Promise<boolean> {
  try {
    return !!(await idbDo<DeviceKey | undefined>('readonly', (s) => s.get(hid)));
  } catch {
    return false;
  }
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** 열린 키를 이 기기에 기억한다. withBiometric 이면 지문·얼굴 확인을 등록해서 쓸 때마다 묻는다. */
export async function rememberOnDevice(hid: string, key: CryptoKey, withBiometric = false): Promise<void> {
  let credentialId: ArrayBuffer | undefined;
  if (withBiometric) {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: '모아요' },
        user: { id: random(16), name: 'moayo-vault', displayName: '모아요 카드 금고' },
        challenge: random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('지문 등록이 취소되었습니다.');
    credentialId = cred.rawId;
  }
  await idbDo('readwrite', (s) => s.put({ hid, key, credentialId } satisfies DeviceKey));
}

export async function forgetOnDevice(hid: string): Promise<void> {
  await idbDo('readwrite', (s) => s.delete(hid));
}

/** 이 기기에 기억한 키(지문 확인을 켰으면 확인을 거친 뒤). 없으면 null. */
export async function unlockOnDevice(hid: string): Promise<CryptoKey | null> {
  const stored = await idbDo<DeviceKey | undefined>('readonly', (s) => s.get(hid)).catch(() => undefined);
  if (!stored) return null;
  if (stored.credentialId) {
    const ok = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: stored.credentialId }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    if (!ok) return null;
  }
  keep(hid, stored.key);
  return stored.key;
}

/** 지금 쓸 수 있는 키: 메모리 → 이 기기 기억. 없으면 null(비밀번호 필요). */
export async function availableKey(hid: string): Promise<CryptoKey | null> {
  return unlockedKey(hid) ?? (await unlockOnDevice(hid).catch(() => null));
}
