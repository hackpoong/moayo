// 서버 함수(Deno)가 같은 로직을 쓰도록 packages/core/src 를 supabase/functions/_shared/core 로 복사한다.
// 배포 전에 실행한다(npm run sync-core). 복사본은 git 에 넣지 않는다.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/core/src');
const dest = join(root, 'supabase/functions/_shared/core');
rmSync(dest, { recursive: true, force: true });

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'testkit.ts') {
      const out = join(dest, relative(src, p));
      mkdirSync(dirname(out), { recursive: true });
      cpSync(p, out);
    }
  }
}
walk(src);
console.log('core → supabase/functions/_shared/core');
