#!/usr/bin/env python3
"""
Replays page views that api/track.js parked in R2 back into Supabase.

While the Supabase project is over its egress quota every insert is rejected
with a 402, so the tracker writes each view to R2 instead (one small object
per view, under analytics/pending/). Once the database accepts writes again,
this moves them across and clears the parked copies.

Safe to re-run: an object is only deleted after its row has been accepted.

Requires:
    pip install boto3

Credentials come from .env.local or the environment, same as the other R2
scripts:

    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

Usage:
    python3 scripts/import-analytics.py --dry-run
    python3 scripts/import-analytics.py
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX = "analytics/pending/"
BATCH = 200


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


def supabase_config():
    src = open(os.path.join(ROOT, "supabase-config.js")).read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", src)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src)
    if not url or not key:
        sys.exit("Could not parse supabase-config.js")
    return url.group(1), key.group(1)


def r2_client():
    load_dotenv_local()
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
        endpoint_url="https://%s.r2.cloudflarestorage.com" % os.environ["R2_ACCOUNT_ID"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    return s3, os.environ.get("R2_BUCKET", "portfolio-media")


def insert(url, key, rows):
    """-> None on success, or an error string."""
    req = urllib.request.Request(
        url + "/rest/v1/page_views",
        data=json.dumps(rows).encode(),
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status >= 300:
                return "HTTP %s" % r.status
        return None
    except urllib.error.HTTPError as e:
        return "HTTP %s %s" % (e.code, e.read()[:200].decode(errors="replace"))
    except Exception as e:
        return str(e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    s3, bucket = r2_client()
    url, key = supabase_config()

    parked = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=PREFIX):
        for o in page.get("Contents", []):
            parked.append(o["Key"])

    if not parked:
        print("nothing parked — analytics are going straight to Supabase")
        return

    print("%d parked view(s)%s" % (len(parked), "  [dry run]" if args.dry_run else ""))

    rows, keys = [], []
    for k in parked:
        try:
            rows.append(json.loads(s3.get_object(Bucket=bucket, Key=k)["Body"].read()))
            keys.append(k)
        except Exception as e:
            print("  skip %s (%s)" % (k, e))

    if args.dry_run:
        by_page = {}
        for r in rows:
            by_page[r.get("page", "?")] = by_page.get(r.get("page", "?"), 0) + 1
        for p, n in sorted(by_page.items(), key=lambda x: -x[1]):
            print("  %5d  %s" % (n, p))
        print("nothing written")
        return

    done = 0
    for i in range(0, len(rows), BATCH):
        chunk, chunk_keys = rows[i:i + BATCH], keys[i:i + BATCH]
        err = insert(url, key, chunk)
        if err:
            print("insert failed: %s" % err)
            print("stopped after %d row(s); parked copies left in place" % done)
            sys.exit(1)
        # Only now is it safe to drop the parked copies.
        s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in chunk_keys]})
        done += len(chunk)
        print("  imported %d/%d" % (done, len(rows)))

    print("done — %d view(s) moved into page_views" % done)


if __name__ == "__main__":
    main()
