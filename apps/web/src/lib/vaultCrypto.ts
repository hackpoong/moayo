// 가족 금고: 비밀번호로 만든 키(PBKDF2-SHA256 → AES-GCM 256)로 카드 정보를 기기 안에서 암호화한다.
// 서버에는 소금·반복 횟수·확인용 암호문과, 자산별 암호문만 올라간다.

export interface Sealed {
  v: 1;
  iv: string;
  ct: string;
}

export interface VaultMeta {
  salt: string;
  iterations: number;
  verifier: Sealed;
}

/** 카드 비밀 정보(금고 안). */
export interface CardSecret {
  number?: string | null;
  expiry?: string | null;
  cvc?: string | null;
}

export const VAULT_ITERATIONS = 600_000;
const VERIFY_TEXT = 'moayo-vault-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** 비밀번호와 소금으로 키를 만든다. 꺼낼 수 없는 키라 기기 DB 에 그대로 보관할 수 있다. */
export async function deriveVaultKey(password: string, salt: string, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}

/** 키가 틀리거나 암호문이 바뀌었으면 예외. */
export async function unseal<T>(key: CryptoKey, sealed: Pick<Sealed, 'iv' | 'ct'>): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.ct));
  return JSON.parse(dec.decode(plain)) as T;
}

/** 새 금고: 무작위 소금으로 키를 만들고 확인용 암호문을 함께 돌려준다. */
export async function createVault(password: string, iterations = VAULT_ITERATIONS): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveVaultKey(password, salt, iterations);
  return { meta: { salt, iterations, verifier: await seal(key, VERIFY_TEXT) }, key };
}

/** 비밀번호가 맞으면 키, 틀리면 null. */
export async function openVault(password: string, meta: VaultMeta): Promise<CryptoKey | null> {
  const key = await deriveVaultKey(password, meta.salt, meta.iterations);
  try {
    return (await unseal<string>(key, meta.verifier)) === VERIFY_TEXT ? key : null;
  } catch {
    return null;
  }
}

/** 금고 비밀번호 규칙: 6자 이상. */
export function vaultPasswordProblem(password: string): string | null {
  if (password.length < 6) return '6자 이상으로 정해 주세요';
  if (/^(\d)\1+$/.test(password) || /^(012345|123456|234567|654321)/.test(password)) return '너무 쉬운 비밀번호예요';
  return null;
}
