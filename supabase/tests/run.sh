#!/usr/bin/env bash
# =============================================================================
# supabase/tests/run.sh — the ADUAtlas database regression suite.
#
# Builds a FRESH database from migrations/0001 through the highest-numbered
# migration in the repository, loads the Supabase shims and the harness, runs
# every invariant file, and prints a pass/fail/skip summary. Exits non-zero if
# anything failed.
#
# By default it creates its OWN throwaway Postgres cluster in a temp directory
# and removes it afterwards. That is deliberate: the suite must prove the
# migration chain from nothing, on a machine whose Postgres may not be running,
# without touching a developer's existing cluster or data. Nothing outside this
# repository is read.
#
#   ./supabase/tests/run.sh                 # ephemeral cluster (default)
#   ./supabase/tests/run.sh --keep          # leave the cluster up for poking
#   ./supabase/tests/run.sh --existing      # use PGHOST/PGPORT/PGUSER instead
#   TARGET_DATABASE_URL=... ./supabase/tests/run.sh --target
#                                           # the same invariants against a database
#                                           # this script did NOT build (staging);
#                                           # see "--target" below
#
# Requires a Postgres 14+ client and server on the machine (Homebrew
# postgresql@16 is what this was developed against). It does NOT require a
# running server, the Supabase CLI, Docker, or pgTAP.
#
# By default this suite NEVER touches a Supabase project. It has no network
# access to one and takes no project ref or key. Proving the migration chain on
# a fresh local database (lane B of decision 2j) is a different claim from
# proving what is deployed (lane D).
#
# --target is the one exception, and it only runs when asked for by name: it
# proves the same invariants against an already-deployed NON-production database
# (staging), which is lane D for that environment. It refuses the production
# project before contacting anything. See the --target sections below.
# =============================================================================
set -uo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="$(cd "$SUITE_DIR/.." && pwd)"
MIGRATIONS_DIR="$SUPABASE_DIR/migrations"

KEEP=0
MODE="ephemeral"
for arg in "$@"; do
  case "$arg" in
    --keep)     KEEP=1 ;;
    --existing) MODE="existing" ;;
    --target)   MODE="target" ;;
    -h|--help)  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# ── locate the Postgres binaries ─────────────────────────────────────────────
for candidate in \
  "${PG_BIN:-}" \
  /opt/homebrew/opt/postgresql@16/bin \
  /usr/local/opt/postgresql@16/bin \
  /opt/homebrew/opt/postgresql@15/bin \
  /usr/lib/postgresql/16/bin
do
  if [ -n "$candidate" ] && [ -x "$candidate/psql" ]; then PG_BIN="$candidate"; break; fi
done
if [ -z "${PG_BIN:-}" ]; then
  command -v psql >/dev/null 2>&1 || { echo "psql not found. Install Postgres (brew install postgresql@16) or set PG_BIN." >&2; exit 2; }
  PG_BIN="$(dirname "$(command -v psql)")"
fi

PSQL="$PG_BIN/psql"
DBNAME="aduatlas_regression"
CLUSTER=""
CLUSTER_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/aduatlas-logsXXXXXX")"

cleanup() {
  local code=$?
  rm -rf "$CLUSTER_LOG_DIR"
  if [ "$MODE" != "existing" ] && [ -n "$CLUSTER" ]; then
    if [ "$KEEP" = "1" ]; then
      echo
      echo "cluster kept at $CLUSTER"
      echo "  connect:  $PSQL -h $CLUSTER/sock -d $DBNAME"
      echo "  stop:     $PG_BIN/pg_ctl -D $CLUSTER/data stop && rm -rf $CLUSTER"
    else
      "$PG_BIN/pg_ctl" -D "$CLUSTER/data" -m immediate stop >/dev/null 2>&1
      rm -rf "$CLUSTER"
    fi
  fi
  exit $code
}
trap cleanup EXIT INT TERM

# =============================================================================
# --target preflight. Runs BEFORE anything is built or contacted.
#
# Two independent locks keep this suite off production:
#   1. The production project ref is refused wherever it appears in the target.
#   2. A Supabase target must be listed, by ref, in supabase/tests/targets.allow,
#      and that file is itself refused if it ever names production.
# Rolled back or not, a target run takes locks and fires triggers on the rows it
# touches, and nothing about running it against production has been approved.
#
# The connection string comes from TARGET_DATABASE_URL in the environment and
# never from the command line, where any process listing can read the password.
# =============================================================================
PROD_REF="gexxagmmcwzrvgrhyvvx"
ALLOW_FILE="$SUITE_DIR/targets.allow"
TARGET_REF=""
TARGET_NAME=""

redact_url() { printf '%s' "$1" | sed -E 's#(://[^:/@]*):[^@]*@#\1:***@#'; }

target_preflight() {
  if [ -z "${TARGET_DATABASE_URL:-}" ]; then
    echo "--target needs TARGET_DATABASE_URL in the environment. Never pass it as an argument: the command line is visible to every process on the machine." >&2
    exit 2
  fi
  case "$TARGET_DATABASE_URL" in
    *"$PROD_REF"*)
      echo "REFUSED: the target names the PRODUCTION project ($PROD_REF)." >&2
      echo "This suite writes inside transactions it rolls back, and it has not been approved against production. Nothing was contacted." >&2
      exit 2 ;;
  esac
  if [ -f "$ALLOW_FILE" ] && grep -q "$PROD_REF" "$ALLOW_FILE"; then
    echo "REFUSED: supabase/tests/targets.allow names the production project. That file may only list non-production projects." >&2
    exit 2
  fi
  if printf '%s' "$TARGET_DATABASE_URL" | grep -qE 'supabase\.(co|com)'; then
    TARGET_REF="$(printf '%s' "$TARGET_DATABASE_URL" | grep -oE '(postgres\.|db\.)[a-z]{20}' | head -1 | sed -E 's/^(postgres|db)\.//')"
    if [ -z "$TARGET_REF" ]; then
      echo "REFUSED: cannot read a Supabase project ref from the target. Refusing rather than guessing which project this is." >&2
      exit 2
    fi
    TARGET_NAME="$(awk -v r="$TARGET_REF" '$1 == r { print $2; exit }' "$ALLOW_FILE" 2>/dev/null)"
    if [ -z "$TARGET_NAME" ]; then
      echo "REFUSED: project $TARGET_REF is not listed in supabase/tests/targets.allow." >&2
      exit 2
    fi
  else
    TARGET_REF="-"
    TARGET_NAME="non-supabase-host"
  fi
}

if [ "$MODE" = "target" ]; then target_preflight; fi

# ── bring up a database ──────────────────────────────────────────────────────
# --target builds a throwaway cluster too: the chain is measured from nothing
# locally, and only the invariants go to the target.
if [ "$MODE" = "ephemeral" ] || [ "$MODE" = "target" ]; then
  CLUSTER="$(mktemp -d "${TMPDIR:-/tmp}/aduatlas-pgXXXXXX")"
  mkdir -p "$CLUSTER/sock"
  echo "==> initialising a throwaway cluster in $CLUSTER"
  "$PG_BIN/initdb" -D "$CLUSTER/data" -U postgres --auth=trust --no-sync >"$CLUSTER/initdb.log" 2>&1 \
    || { echo "initdb failed:"; tail -20 "$CLUSTER/initdb.log"; exit 1; }
  # Unix socket only: no TCP port to collide with anything already running.
  "$PG_BIN/pg_ctl" -D "$CLUSTER/data" -l "$CLUSTER/server.log" \
    -o "-k $CLUSTER/sock -h '' -c fsync=off -c full_page_writes=off" \
    -w start >/dev/null 2>&1 \
    || { echo "could not start Postgres:"; tail -20 "$CLUSTER/server.log"; exit 1; }
  export PGHOST="$CLUSTER/sock" PGUSER="postgres" PGDATABASE="postgres"
  unset PGPORT PGPASSWORD 2>/dev/null || true
  "$PG_BIN/dropdb"   --if-exists "$DBNAME" >/dev/null 2>&1
  "$PG_BIN/createdb" "$DBNAME" || exit 1
else
  echo "==> using the existing server at ${PGHOST:-local socket}:${PGPORT:-5432}"
  "$PG_BIN/dropdb"   --if-exists "$DBNAME" || exit 1
  "$PG_BIN/createdb" "$DBNAME" || exit 1
fi

run_sql() {   # run_sql <label> <file>
  local label="$1" file="$2"
  if ! "$PSQL" -v ON_ERROR_STOP=1 -q --no-psqlrc -d "$DBNAME" -f "$file" \
        >"$CLUSTER_LOG_DIR/$(basename "$file").log" 2>&1; then
    echo "  !! $label FAILED"
    echo "     ------------------------------------------------------------"
    sed 's/^/     /' "$CLUSTER_LOG_DIR/$(basename "$file").log" | tail -30
    echo "     ------------------------------------------------------------"
    return 1
  fi
  # Surface the harness's own warnings/notices for the invariant files.
  grep -E '^(WARNING|psql:.*ERROR)' "$CLUSTER_LOG_DIR/$(basename "$file").log" \
    | sed 's/^/     /' || true
  return 0
}

# =============================================================================
# --target: the same invariants, against a database this script did NOT build.
#
# Staging is where the migrations meet the real platform: Supabase's own auth
# schema, its real roles and grants, its default privileges and its Postgres
# version. helpers/00_shim.sql imitates those; only a real project proves them.
# Running the suite there raises three problems, and this mode answers each:
#
#   1. THE TARGET MUST NOT CHANGE. Every invariant file runs in its own session
#      and its own transaction, with a fresh copy of the harness and fixtures,
#      and the transaction is ROLLED BACK. Results leave as query output before
#      the rollback. Row counts are snapshotted before and after, and any
#      difference, or a leftover schema t, is a FAILURE. Run it while nothing
#      else is writing to the target, or that check will blame the suite.
#
#   2. SOME CLAIMS ARE NOT ABOUT THE TARGET'S DATA. "The migrations seed no
#      admin" is measured on the SAME chain built from nothing in the local
#      throwaway cluster, and target-chain-matches-repository proves the target
#      ran exactly that chain. A legitimate staging admin cannot fail it.
#
#   3. IT MUST NEVER BE AIMED AT PRODUCTION. See the preflight above.
#
# Use Supabase's SESSION pooler (port 5432). Each file needs one session holding
# one transaction from BEGIN to ROLLBACK; the transaction pooler cannot give it.
# Set TARGET_EVIDENCE_DIR to keep the per-file results and logs.
# =============================================================================
run_target() {
  local T="$TARGET_DATABASE_URL"
  local WORK="$CLUSTER_LOG_DIR/target"
  local RES="$WORK/results.tsv"
  mkdir -p "$WORK"
  : > "$RES"

  # Never let the throwaway cluster's PG* variables fill a gap in the target URL.
  # Options first, the URL last: psql's parser is not guaranteed to accept
  # options after the database argument.
  tpsql() { env -u PGHOST -u PGPORT -u PGUSER -u PGDATABASE "$PSQL" -X "$@" "$T"; }
  tq()    { tpsql -At -v ON_ERROR_STOP=1 -c "$1"; }
  rec()   { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5" >> "$RES"; }   # suite name status detail rule

  # Exact row counts, one line per table, using only read queries: nothing is
  # created in the target to take them.
  local SNAP_SQL="select c.table_schema || '.' || c.table_name || '=' ||
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', c.table_schema, c.table_name), false, true, '')))[1]::text
    from information_schema.tables c
   where c.table_type = 'BASE TABLE'
     and (c.table_schema = 'public' or (c.table_schema = 'auth' and c.table_name = 'users'))
   order by 1"

  echo "==> TARGET: $TARGET_NAME ($TARGET_REF)"
  echo "    $(redact_url "$T")"
  local who
  if ! who="$(tq "select current_database() || ' as ' || current_user || ', Postgres ' || current_setting('server_version')" 2>&1)"; then
    echo "cannot connect to the target:" >&2
    printf '%s\n' "$who" | sed 's/^/    /' >&2
    return 2
  fi
  echo "    connected: $who"

  if [ "$(tq "select count(*) from pg_namespace where nspname = 't'")" != "0" ]; then
    echo "REFUSED: the target already has a schema named t. The harness drops and recreates t, so a pre-existing one is either someone else's objects or a previous run's leftovers. Resolve that first." >&2
    return 2
  fi

  # The suites' fixtures, including some fixed addresses, use @example.test. A
  # target that already holds rows at that domain would collide with them and
  # report failures that are not business-rule failures. Such rows can only come
  # from a harness run that was committed instead of rolled back, or from a seed
  # that borrowed the fixture domain; either way, refuse rather than mislead.
  local stale_users stale_leads
  stale_users="$(tq "select (select count(*) from auth.users where email like '%@example.test') + (select count(*) from public.users where email like '%@example.test')" 2>&1)"
  stale_leads="$(tq "select count(*) from public.leads where email like '%@example.test'" 2>/dev/null || echo 0)"
  if [ "$stale_users" != "0" ] || [ "${stale_leads:-0}" != "0" ]; then
    echo "REFUSED: the target already holds rows at the fixture domain @example.test (accounts: $stale_users, leads: ${stale_leads:-0}). They would collide with the suites' fixtures and produce failures that are not business-rule failures. Remove or re-address them first." >&2
    return 2
  fi

  # ── the target ran exactly the repository's chain ───────────────────────────
  local repo_v target_v
  local RULE_CHAIN='the chain measured from nothing must be the chain the target actually ran, or no fresh-chain claim describes the target'
  repo_v="$(for m in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do basename "$m" | cut -c1-4; done | sort | paste -s -d ' ' -)"
  target_v="$(tq "select string_agg(version, ' ' order by version) from supabase_migrations.schema_migrations" 2>/dev/null)"
  if [ -z "$target_v" ]; then
    rec '00 the target' 'target-chain-matches-repository' fail "the target has no supabase_migrations.schema_migrations history, so nothing proves which migration chain built it" "$RULE_CHAIN"
  elif [ "$target_v" = "$repo_v" ]; then
    rec '00 the target' 'target-chain-matches-repository' pass '' "$RULE_CHAIN"
  else
    rec '00 the target' 'target-chain-matches-repository' fail "repository: [$repo_v]  target: [$target_v]" "$RULE_CHAIN"
  fi

  local snap_before
  if ! snap_before="$(tq "$SNAP_SQL" 2>&1)"; then
    echo "could not snapshot the target's row counts, so the no-trace check would be meaningless. Stopping:" >&2
    printf '%s\n' "$snap_before" | sed 's/^/    /' >&2
    return 2
  fi

  # ── every invariant file, one rolled-back transaction each ─────────────────
  # Fixture labels (emails, slugs) come from t.fixture_seq, which starts at 1 in
  # an empty database. A target is not empty, so start it at a number unique to
  # this run: a fixture can then never collide with a row the target already
  # holds, and a collision can never pass for a business-rule failure.
  local SEQ_OFFSET=$(( $(date +%s) * 1000 ))
  echo "==> running invariants against the target (each file rolled back; fixture labels from $SEQ_OFFSET)"
  local f base wrap broken=0
  for f in "$SUITE_DIR"/invariants/*.sql; do
    base="$(basename "$f")"
    printf '    %s\n' "$base"
    wrap="$WORK/wrap_$base"
    {
      printf '%s\n' '\set ON_ERROR_STOP 0'
      printf '%s\n' '\set ON_ERROR_ROLLBACK on'
      printf '%s\n' 'set statement_timeout = 0;'
      printf '%s\n' "set lock_timeout = '30s';"
      printf '%s\n' 'begin;'
      printf '%s\n' "\\i '$SUITE_DIR/helpers/01_harness.sql'"
      printf '%s\n' "\\i '$SUITE_DIR/helpers/02_fixtures.sql'"
      printf '%s\n' "insert into t.chain_facts (key, value) values ('mode', 'target')$FACT_VALUES;"
      printf '%s\n' "select setval('t.fixture_seq', $SEQ_OFFSET);"
      printf '%s\n' "\\i '$f'"
      printf '%s\n' "\\o '$WORK/$base.tsv'"
      printf '%s\n' "select suite, name, status, translate(coalesce(detail, ''), E'\\n\\r\\t', '   '), translate(rule, E'\\n\\r\\t', '   ') from t.results order by seq;"
      printf '%s\n' '\o'
      printf '%s\n' 'rollback;'
    } > "$wrap"
    tpsql -q -At -F "$(printf '\t')" -f "$wrap" > "$WORK/$base.log" 2>&1
    if [ -f "$WORK/$base.tsv" ]; then cat "$WORK/$base.tsv" >> "$RES"; fi
    if grep -qE '^psql:.*(ERROR|FATAL)' "$WORK/$base.log"; then
      broken=1
      grep -E '^psql:.*(ERROR|FATAL)' "$WORK/$base.log" | head -5 | sed 's/^/     !! /'
    fi
    if [ ! -s "$WORK/$base.tsv" ]; then
      broken=1
      echo "     !! no results came back from $base"
    fi
  done

  # ── the target is exactly as it was ────────────────────────────────────────
  local RULE_TRACE='a target run must leave the target exactly as it found it'
  local snap_after left_t
  snap_after="$(tq "$SNAP_SQL" 2>&1)"
  left_t="$(tq "select count(*) from pg_namespace where nspname = 't'" 2>&1)"
  if [ "$left_t" = "0" ] && [ "$snap_before" = "$snap_after" ]; then
    rec '00 the target' 'target-left-no-trace' pass '' "$RULE_TRACE"
  else
    local diffs
    diffs="$(diff <(printf '%s\n' "$snap_before") <(printf '%s\n' "$snap_after") | grep -E '^[<>]' | tr '\n' ' ' | cut -c1-600)"
    rec '00 the target' 'target-left-no-trace' fail "schema t left behind: $left_t; row counts that changed: ${diffs:-none}" "$RULE_TRACE"
  fi

  # ── summary ─────────────────────────────────────────────────────────────────
  local P F S
  P="$(awk -F '\t' '$3 == "pass"' "$RES" | wc -l | tr -d ' ')"
  F="$(awk -F '\t' '$3 == "fail"' "$RES" | wc -l | tr -d ' ')"
  S="$(awk -F '\t' '$3 == "skip"' "$RES" | wc -l | tr -d ' ')"
  echo
  printf '%-36s %6s %6s %6s\n' suite pass fail skip
  awk -F '\t' '{ k = $1; seen[k] = 1; if ($3 == "pass") p[k]++; else if ($3 == "fail") f[k]++; else if ($3 == "skip") s[k]++ }
               END { for (k in seen) printf "%-36s %6d %6d %6d\n", k, p[k], f[k], s[k] }' "$RES" | sort
  if [ "$F" != "0" ]; then
    echo "FAILURES — the business rule each one protects:"
    awk -F '\t' '$3 == "fail" { printf "  %s  [%s]\n      %s\n", $2, $5, $4 }' "$RES"
  fi
  if [ "$S" != "0" ]; then
    echo "SKIPPED — not proved, and not a pass:"
    awk -F '\t' '$3 == "skip" { printf "  %s  [%s]\n      %s\n", $2, $5, $4 }' "$RES"
  fi
  echo "-------------------------------------------------------------------"
  echo "target: $TARGET_NAME ($TARGET_REF), $who"
  echo "chain measured from nothing: $MIGRATION_COUNT migrations (through $LAST_MIGRATION); admins=${CHAIN_ADMINS:-unmeasured}, accounts=${CHAIN_ACCOUNTS:-unmeasured}"
  echo "$P passed, $F failed, $S skipped, $((P + F + S)) total"
  if [ "$broken" != "0" ]; then
    echo "one or more invariant FILES errored against the target — see above"
  fi
  echo "This is lane D of decision 2j for THIS target only. It proves nothing"
  echo "about any other environment, and nothing at all about production."
  echo "-------------------------------------------------------------------"
  if [ -n "${TARGET_EVIDENCE_DIR:-}" ]; then
    mkdir -p "$TARGET_EVIDENCE_DIR" && cp "$WORK"/*.tsv "$WORK"/*.log "$TARGET_EVIDENCE_DIR"/ 2>/dev/null
    echo "evidence copied to $TARGET_EVIDENCE_DIR"
  fi
  if [ "$F" != "0" ] || [ "$broken" != "0" ]; then return 1; fi
  return 0
}

# ── 1. the Supabase platform shims (before 0001: see 00_shim.sql) ────────────
echo "==> loading the Supabase shims"
run_sql "shim" "$SUITE_DIR/helpers/00_shim.sql" || exit 1

# ── 2. the migration chain, in number order, from 0001 ────────────────────────
#
# A migration that will not apply is the single most serious thing this suite
# can find, so it is reported as a FAILURE rather than as a crash: the run keeps
# going, every invariant that does not depend on the broken file is still
# proved, and the suites that do depend on it SKIP by object probe instead of
# passing vacuously. Exit code stays non-zero.
echo "==> applying migrations from $MIGRATIONS_DIR"
MIGRATION_COUNT=0
LAST_MIGRATION=""
CHAIN_BROKE_AT=""
shopt -s nullglob
for m in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
  # A data migration can only be proved against rows that existed before it ran.
  # helpers/pre_<NNNN>_seed.sql, if present, is applied immediately before
  # migration NNNN. It seeds fixtures; it never alters the migration chain.
  mnum="$(basename "$m" | cut -c1-4)"
  pre="$SUITE_DIR/helpers/pre_${mnum}_seed.sql"
  if [ -f "$pre" ]; then
    printf '    %s  (pre-migration fixture)\n' "$(basename "$pre")"
    run_sql "$(basename "$pre")" "$pre" || { echo "the pre-migration fixture for $mnum failed"; exit 1; }
  fi
  printf '    %s\n' "$(basename "$m")"
  if ! run_sql "$(basename "$m")" "$m"; then
    CHAIN_BROKE_AT="$(basename "$m")"
    CHAIN_ERROR="$(grep -m1 'ERROR:' "$CLUSTER_LOG_DIR/$(basename "$m").log" | sed "s/'/''/g" | cut -c1-400)"
    echo "    !! the migration chain does not apply to a fresh database; stopping at this file"
    break
  fi
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
  LAST_MIGRATION="$(basename "$m")"
done
shopt -u nullglob
if [ "$MIGRATION_COUNT" = "0" ]; then echo "no migrations applied in $MIGRATIONS_DIR" >&2; exit 1; fi

# ── 2b. facts that are only true at the chain boundary ───────────────────────
# Measured NOW, while the chain has just finished applying to an empty database
# and neither the harness nor a single fixture exists. Counting later, from a
# suite, would measure everything written since. The numbers reach the suites
# through t.chain_facts (helpers/01_harness.sql); fact 1 of
# invariants/170_admin_bootstrap.sql reads them. A value that is not a plain
# integer is left out on purpose, so the suite reports it as NOT MEASURED.
CHAIN_ADMINS=""
CHAIN_ACCOUNTS=""
if [ -z "$CHAIN_BROKE_AT" ]; then
  CHAIN_ADMINS="$("$PSQL" -At --no-psqlrc -d "$DBNAME" -c "select count(*) from public.users where role = 'admin'" 2>/dev/null)"
  CHAIN_ACCOUNTS="$("$PSQL" -At --no-psqlrc -d "$DBNAME" -c "select (select count(*) from auth.users) + (select count(*) from public.users)" 2>/dev/null)"
fi
FACT_VALUES=""
case "$CHAIN_ADMINS"   in ''|*[!0-9]*) ;; *) FACT_VALUES="$FACT_VALUES, ('admins_after_chain', '$CHAIN_ADMINS')" ;; esac
case "$CHAIN_ACCOUNTS" in ''|*[!0-9]*) ;; *) FACT_VALUES="$FACT_VALUES, ('accounts_after_chain', '$CHAIN_ACCOUNTS')" ;; esac
echo "==> measured at the chain boundary: admins=${CHAIN_ADMINS:-unmeasured}, accounts=${CHAIN_ACCOUNTS:-unmeasured}"

if [ "$MODE" = "target" ]; then
  if [ -n "$CHAIN_BROKE_AT" ]; then
    echo "the repository's migration chain does not apply to a fresh database ($CHAIN_BROKE_AT)."
    echo "A target cannot be compared against a chain that does not build. Nothing was run against the target."
    exit 1
  fi
  run_target
  exit $?
fi

# ── 3. harness + fixtures ────────────────────────────────────────────────────
echo "==> loading the harness"
run_sql "harness"  "$SUITE_DIR/helpers/01_harness.sql"  || exit 1
run_sql "fixtures" "$SUITE_DIR/helpers/02_fixtures.sql" || exit 1
"$PSQL" -q --no-psqlrc -v ON_ERROR_STOP=1 -d "$DBNAME" \
  -c "insert into t.chain_facts (key, value) values ('mode', 'fresh')$FACT_VALUES" >/dev/null \
  || { echo "could not record the chain-boundary facts"; exit 1; }

if [ -n "$CHAIN_BROKE_AT" ]; then
  "$PSQL" -q --no-psqlrc -d "$DBNAME" -c "
    select t.suite('00 the migration chain');
    select t.record(
      'migration-chain-applies',
      'decision 2j lane B: a fresh database must be buildable from the migrations',
      'fail',
      '$CHAIN_BROKE_AT does not apply to a fresh database: $CHAIN_ERROR');" >/dev/null
fi

# ── 4. the invariant suites ──────────────────────────────────────────────────
echo "==> running invariants"
BROKEN=0
shopt -s nullglob
for f in "$SUITE_DIR"/invariants/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  run_sql "$(basename "$f")" "$f" || BROKEN=1
done
shopt -u nullglob

# ── 5. the summary ───────────────────────────────────────────────────────────
echo
"$PSQL" -q --no-psqlrc -d "$DBNAME" -c "
  select suite,
         count(*) filter (where status = 'pass') as pass,
         count(*) filter (where status = 'fail') as fail,
         count(*) filter (where status = 'skip') as skip
    from t.results group by suite order by suite;"

FAILED="$("$PSQL" -At --no-psqlrc -d "$DBNAME" -c "select count(*) from t.results where status = 'fail'")"
SKIPPED="$("$PSQL" -At --no-psqlrc -d "$DBNAME" -c "select count(*) from t.results where status = 'skip'")"
PASSED="$("$PSQL"  -At --no-psqlrc -d "$DBNAME" -c "select count(*) from t.results where status = 'pass'")"
TOTAL=$((PASSED + FAILED + SKIPPED))

if [ "${FAILED:-0}" != "0" ]; then
  echo "FAILURES — the business rule each one protects:"
  "$PSQL" -q --no-psqlrc -d "$DBNAME" -c "
    select name, rule, detail from t.results where status = 'fail' order by seq;"
fi
if [ "${SKIPPED:-0}" != "0" ]; then
  echo "SKIPPED — not proved, and not a pass:"
  "$PSQL" -q --no-psqlrc -d "$DBNAME" -c "
    select name, rule, detail from t.results where status = 'skip' order by seq;"
fi

echo "-------------------------------------------------------------------"
echo "fresh database built from $MIGRATION_COUNT migrations (through $LAST_MIGRATION)"
echo "measured at the chain boundary: admins=${CHAIN_ADMINS:-unmeasured}, accounts=${CHAIN_ACCOUNTS:-unmeasured}"
echo "$PASSED passed, $FAILED failed, $SKIPPED skipped, $TOTAL total"
if [ "$BROKEN" != "0" ]; then
  echo "one or more invariant FILES errored before finishing — see above"
fi
echo "This is lane B of decision 2j (a fresh database from migrations) only."
echo "It says nothing about the deployed frontend, the deployed database, or"
echo "production configuration."
echo "-------------------------------------------------------------------"

if [ "${FAILED:-0}" != "0" ] || [ "$BROKEN" != "0" ]; then exit 1; fi
exit 0
