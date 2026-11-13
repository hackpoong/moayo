#!/usr/bin/env bash
# 로컬 Postgres 에 임시 DB 를 만들어 마이그레이션과 RLS 테스트를 돌린다.
# 사용: PGHOST/PGUSER 등 표준 환경변수로 접속 대상을 정한다(기본: 로컬 소켓).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="moayo_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "create database \"$DB\""
trap '"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\" with (force)" >/dev/null' EXIT
"${PSQL[@]}" -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate: $f"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
set +e
OUT=$("${PSQL[@]}" -d "$DB" -f supabase/tests/99_rls_test.sql 2>&1)
STATUS=$?
set -e
echo "$OUT" | grep -E "ok -|FAIL|ERROR|PASSED" || true
if [ "$STATUS" -ne 0 ] || ! echo "$OUT" | grep -q "ALL DB TESTS PASSED"; then
  echo "DB TESTS FAILED" >&2
  exit 1
fi
