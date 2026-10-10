#!/usr/bin/env python3
"""
Loads page views into the analytics store (Cloudflare D1, behind the
cloudflare-worker/analytics Worker).

Two sources:

  default          views api/track.js parked in R2 (analytics/pending/) because
                   the Worker couldn't take them at the time. Each parked object
                   is deleted only after the Worker has accepted its row.

  --from-supabase  the old Supabase page_views table, for a one-off backfill of
                   history. Read-only: Supabase is never changed.

Every row carries a stable id (the tracker's UUID, "sb-<id>" for Supabase rows,
"r2-<object>" for older parked views that predate ids) and the Worker ignores
ids it already has, so re-running either mode never double-counts.

Requires:
    pip install boto3        (R2 mode only)

Credentials come from .env.local or the environment:

    ANALYTICS_INGEST_URL, ANALYTICS_INGEST_SECRET     always
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   R2 mode

Usage:
    python3 scripts/import-analytics.py --dry-run
    python3 scripts/import-analytics.py
    python3 scripts/import-analytics.py --from-supabase --dry-run
    python3 scripts/import-analytics.py --from-supabase
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX = "analytics/pending/"
BATCH = 400          # the Worker's per-request limit
SUPABASE_PAGE = 1000  # PostgREST's default max rows per response


def load_dotenv_local():
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def ingest_config():
    url = os.environ.get("ANALYTICS_INGEST_URL", "").strip()
    secret = os.environ.get("ANALYTICS_INGEST_SECRET", "").strip()
    if not url or not secret:
        sys.exit("missing env: ANALYTICS_INGEST_URL and ANALYTICS_INGEST_SECRET")
    return url, secret


def supabase_config():
    src = open(os.path.join(ROOT, "supabase-config.js")).read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", src)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src)
    if not url or not key:
        sys.exit("Could not parse supabase-config.js")
    return url.group(1), key.group(1)


def r2_client():
    try:
        import boto3
    except ImportError:
        sys.exit("pip install boto3")
    missing = [n for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
               if not os.environ.get(n)]
    if missing:
        sys.exit("missing env: " + ", ".join(missing))
    s3 = boto3.client(
        "s3",
        endpoint_url="https://%s.r2.cloudflarestorage.com" % os.environ["R2_ACCOUNT_ID"].strip(),
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"].strip(),
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"].strip(),
        region_name="auto",
    )
    return s3, os.environ.get("R2_BUCKET", "portfolio-media").strip()


def send(url, secret, rows):
    """-> (inserted, None) on success, or (0, error string)."""
    req = urllib.request.Request(
        url,
        data=json.dumps(rows).encode(),
        # Cloudflare answers urllib's default "Python-urllib" agent with a 403
        # (error 1010, a blocked client signature), so name ourselves.
        headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json",
                 "User-Agent": "portfolio-analytics-import/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}").get("inserted", 0), None
    except urllib.error.HTTPError as e:
        return 0, "HTTP %s %s" % (e.code, e.read()[:200].decode(errors="replace"))
    except Exception as e:
        return 0, str(e)


def summarise(rows):
    by_page = {}
    for r in rows:
        by_page[r.get("page", "?")] = by_page.get(r.get("page", "?"), 0) + 1
    for p, n in sorted(by_page.items(), key=lambda x: -x[1]):
        print("  %6d  %s" % (n, p))


def from_r2(args, url, secret):
    s3, bucket = r2_client()

    parked = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
        for o in page.get("Contents", []):
            parked.append(o["Key"])

    if not parked:
        print("nothing parked — views are reaching the analytics worker")
        return

    print("%d parked view(s)%s" % (len(parked), "  [dry run]" if args.dry_run else ""))

    # One GET per object; done serially that's minutes for a few thousand.
    # boto3 clients are thread-safe, so fetch in parallel, keeping list order.
    def fetch(k):
        try:
            return k, json.loads(s3.get_object(Bucket=bucket, Key=k)["Body"].read()), None
        except Exception as e:
            return k, None, e

    rows, keys = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for n, (k, row, err) in enumerate(pool.map(fetch, parked), 1):
            if err:
                print("  skip %s (%s)" % (k, err))
                continue
            # Views parked before the tracker assigned ids get one from their
            # object name, which is unique and stays put until the row is accepted.
            row.setdefault("id", "r2-" + k[len(PREFIX):])
            rows.append(row)
            keys.append(k)
            if n % 1000 == 0:
                print("  read %d/%d" % (n, len(parked)), flush=True)

    if args.dry_run:
        summarise(rows)
        print("nothing written")
        return

    done = 0
    for i in range(0, len(rows), BATCH):
        chunk, chunk_keys = rows[i:i + BATCH], keys[i:i + BATCH]
        inserted, err = send(url, secret, chunk)
        if err:
            print("ingest failed: %s" % err)
            print("stopped after %d row(s); parked copies left in place" % done)
            sys.exit(1)
        # Only now is it safe to drop the parked copies.
        s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in chunk_keys]})
        done += len(chunk)
        print("  %d/%d  (%d new)" % (done, len(rows), inserted))

    print("done — %d parked view(s) moved into D1" % done)


def from_supabase(args, url, secret):
    sb_url, sb_key = supabase_config()

    # Ordered by id and paged by id, not offset, so rows added mid-export can't
    # shift a page boundary and get skipped.
    rows, last_id = [], 0
    while True:
        q = ("%s/rest/v1/page_views?select=id,page,referrer,country,created_at"
             "&id=gt.%d&order=id.asc&limit=%d") % (sb_url, last_id, SUPABASE_PAGE)
        req = urllib.request.Request(q, headers={"apikey": sb_key, "Authorization": "Bearer " + sb_key})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                page = json.loads(r.read())
        except urllib.error.HTTPError as e:
            sys.exit("supabase read failed: HTTP %s %s" % (e.code, e.read()[:200].decode(errors="replace")))
        except urllib.error.URLError as e:
            sys.exit("supabase unreachable (%s) — paused or deleted projects stop resolving" % e.reason)
        if not page:
            break
        for r in page:
            rows.append({
                "id": "sb-%s" % r["id"],
                "page": r.get("page"),
                "referrer": r.get("referrer"),
                "country": r.get("country"),
                "created_at": r.get("created_at"),
            })
        last_id = page[-1]["id"]
        print("  read %d" % len(rows))
        if len(page) < SUPABASE_PAGE:
            break

    print("%d view(s) in Supabase%s" % (len(rows), "  [dry run]" if args.dry_run else ""))
    if args.dry_run:
        summarise(rows)
        print("nothing written")
        return

    done = new = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        inserted, err = send(url, secret, chunk)
        if err:
            print("ingest failed: %s" % err)
            print("stopped after %d row(s); safe to re-run" % done)
            sys.exit(1)
        done += len(chunk)
        new += inserted
        print("  %d/%d" % (done, len(rows)))

    print("done — %d new row(s) in D1, %d already there" % (new, done - new))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--from-supabase", action="store_true",
                    help="backfill from the old Supabase page_views table")
    args = ap.parse_args()

    load_dotenv_local()
    url, secret = ingest_config() if not args.dry_run else ("", "")

    if args.from_supabase:
        from_supabase(args, url, secret)
    else:
        from_r2(args, url, secret)


if __name__ == "__main__":
    main()
