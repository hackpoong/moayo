/** 코드만 넣어도, 초대 링크를 통째로 붙여 넣어도 코드를 뽑아낸다. */
export function extractInviteCode(input: string): string | null {
  const fromLink = /\/join\/([A-Za-z0-9]+)/.exec(input)?.[1];
  const cleaned = (fromLink ?? input).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length === 10 ? cleaned : null;
}
