#!/usr/bin/env python3
"""
One-off (re-runnable) migration: copies every media file referenced by the
`projects`, `playground_items`, and `carousel_images` tables from Supabase
Storage into the R2 bucket the Worker now reads from.

R2 keys mirror the Supabase object path exactly (bucket/path, e.g.
"projects/images/foo.webp" or "carousel/Portfolio Cover.jpg"), so nothing in
the database has to change — cloudflare-worker/worker.js already looks up
that same key in R2 before falling back to Supabase.

Requires:
    pip install boto3

R2 credentials (create an API token at Cloudflare dashboard -> R2 -> Manage
R2 API Tokens -> Object Read & Write, scoped to this bucket):

    export R2_ACCOUNT_ID=...
    export R2_ACCESS_KEY_ID=...
    export R2_SECRET_ACCESS_KEY=...
    export R2_BUCKET=portfolio-media   # must match wrangler.toml bucket_name

Usage:
    python3 scripts/migrate-to-r2.py --dry-run
    python3 scripts/migrate-to-r2.py
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_MARKER = "/storage/v1/object/public/"


def load_dotenv_local():
    """Populate os.environ from .env.local (KEY=VALUE per line) if present.
    Doesn't overwrite anything already exported in the shell."""
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_dotenv_local()

CONTENT_TYPES = {
    "webp": "image/webp", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "png": "image/png", "gif": "image/gif", "svg": "image/svg+xml",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
}


def load_supabase_config():
    src = open(os.path.join(ROOT, "supabase-config.js")).read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", src)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src)
    if not url or not key:
        sys.exit("Could not parse supabase-config.js")
    return url.group(1), key.group(1)


def load_r2_config():
    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET", "portfolio-media")
    missing = [n for n, v in [
        ("R2_ACCOUNT_ID", account_id),
        ("R2_ACCESS_KEY_ID", access_key),
        ("R2_SECRET_ACCESS_KEY", secret_key),
    ] if not v]
    if missing:
        sys.exit("Missing env vars: " + ", ".join(missing))
    return account_id, access_key, secret_key, bucket


SUPABASE_URL, ANON_KEY = load_supabase_config()


def api(path):
    req = urllib.request.Request(SUPABASE_URL + path)
    req.add_header("apikey", ANON_KEY)
    req.add_header("Authorization", "Bearer " + ANON_KEY)
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def collect_urls():
    """Every Supabase Storage public URL referenced across the site's tables."""
    urls = set()

    for p in api("/rest/v1/projects?select=*"):
        if p.get("cover_url"):
            urls.add(p["cover_url"])
        for section in p.get("gallery") or []:
            items = [section] if section.get("type") == "full" else (section.get("images") or [])
            for item in items:
                if item.get("src"):
                    urls.add(item["src"])

    for item in api("/rest/v1/playground_items?select=cover_url,media_url"):
        if item.get("cover_url"):
            urls.add(item["cover_url"])
        if item.get("media_url"):
            urls.add(item["media_url"])

    for item in api("/rest/v1/carousel_images?select=url"):
        if item.get("url"):
            urls.add(item["url"])

    return sorted(u for u in urls if PUBLIC_MARKER in u)


def object_key(url):
    """'projects/images/foo.webp' — bucket + path, no leading slash."""
    return url.split(PUBLIC_MARKER, 1)[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="list what would move, upload nothing")
    args = ap.parse_args()

    urls = collect_urls()
    print("%d unique media files referenced\n" % len(urls))

    if args.dry_run:
        for u in urls:
            print("  " + object_key(u))
        print("\ndry run — nothing uploaded")
        return

    import boto3  # deferred so --dry-run works without the dependency installed

    account_id, access_key, secret_key, bucket = load_r2_config()
    s3 = boto3.client(
        "s3",
        endpoint_url="https://%s.r2.cloudflarestorage.com" % account_id,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    def process(url):
        key = object_key(url)
        ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
        content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
        try:
            with urllib.request.urlopen(url) as res:
                data = res.read()
        except Exception as e:
            return key, "download failed: %s" % e

        try:
            s3.put_object(
                Bucket=bucket, Key=key, Body=data, ContentType=content_type,
                CacheControl="max-age=31536000, immutable",
            )
        except Exception as e:
            return key, "upload failed: %s" % e

        return key, "%d KB" % (len(data) // 1024)

    done = 0
    failed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for key, note in pool.map(process, urls):
            done += 1
            if "failed" in note:
                failed += 1
            print("  [%3d/%d] %-55s %s" % (done, len(urls), key, note), flush=True)

    print("\ndone: %d moved, %d failed" % (done - failed, failed))
    if failed:
        print("re-run the script to retry failures (safe: overwrites with x-upsert-style put)")


if __name__ == "__main__":
    main()