#!/usr/bin/env python3
"""
Shrinks oversized images already sitting in the R2 bucket the Worker serves
from. Runs entirely against R2 — it never touches Supabase, so it works while
the project is over its egress quota.

Images uploaded through the admin panel go in at whatever size they came out of
Figma or a screenshot tool; the home carousel alone was shipping ~40 MB of JPEG
to paint a row of small cards. This re-encodes anything oversized to WebP at a
sane resolution and writes it back under the SAME key, so nothing in the
database or the HTML has to change: cloudflare-worker/worker.js serves the
content type off the object's R2 metadata, which this script updates too.

Every original is copied to `_originals/<key>` before it is replaced, so a bad
run is reversible with --restore.

Requires:
    pip install boto3 pillow

Credentials come from .env.local (or the environment), same as
scripts/migrate-to-r2.py:

    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

Usage:
    python3 scripts/optimize-r2.py --dry-run
    python3 scripts/optimize-r2.py
    python3 scripts/optimize-r2.py --restore      # put the originals back
"""

import argparse
import concurrent.futures
import io
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BACKUP_PREFIX = "_originals/"
IMAGE_EXTS    = (".jpg", ".jpeg", ".png", ".webp")
MIN_BYTES     = 400 * 1024   # below this there's nothing worth reclaiming
MAX_W         = 2000         # nothing on the site is displayed wider
MAX_PX        = 12_000_000   # but don't crush a tall full-page screenshot
QUALITY       = 82
# Only replace when the saving is real; re-encoding for 5% isn't worth the
# generation loss.
KEEP_RATIO    = 0.7


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


def client():
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


def list_objects(s3, bucket, prefix=""):
    out = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for o in page.get("Contents", []):
            out.append((o["Key"], o["Size"]))
    return out


def reencode(data):
    """-> webp bytes, or None when re-encoding isn't a worthwhile win."""
    from PIL import Image

    im = Image.open(io.BytesIO(data))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")

    w, h = im.size
    scale = min(1.0, MAX_W / w, math.sqrt(MAX_PX / (w * h)))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=QUALITY, method=6)
    out = buf.getvalue()
    return out if len(out) < len(data) * KEEP_RATIO else None


def optimize_one(s3, bucket, key, size, dry_run):
    try:
        data = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    except Exception as e:
        return (key, size, size, "read failed: %s" % e)

    try:
        out = reencode(data)
    except Exception as e:
        return (key, size, size, "encode failed: %s" % e)

    if out is None:
        return (key, size, size, "skipped (already lean)")

    if not dry_run:
        # Back up first: if this fails we must not lose the original.
        s3.copy_object(Bucket=bucket, Key=BACKUP_PREFIX + key,
                       CopySource={"Bucket": bucket, "Key": key})
        s3.put_object(Bucket=bucket, Key=key, Body=out, ContentType="image/webp",
                      CacheControl="public, max-age=31536000, immutable")

    return (key, size, len(out), "ok")


def restore(s3, bucket, dry_run):
    backups = list_objects(s3, bucket, BACKUP_PREFIX)
    if not backups:
        sys.exit("nothing to restore — no %s objects" % BACKUP_PREFIX)

    for key, _size in backups:
        original = key[len(BACKUP_PREFIX):]
        print("  restore %s" % original)
        if dry_run:
            continue
        s3.copy_object(Bucket=bucket, Key=original,
                       CopySource={"Bucket": bucket, "Key": key})
        s3.delete_object(Bucket=bucket, Key=key)
    print("restored %d object(s)%s" % (len(backups), " (dry run)" if dry_run else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--restore", action="store_true",
                    help="copy %s back over the live keys" % BACKUP_PREFIX)
    ap.add_argument("--min-bytes", type=int, default=MIN_BYTES)
    args = ap.parse_args()

    s3, bucket = client()

    if args.restore:
        restore(s3, bucket, args.dry_run)
        return

    targets = [
        (k, s) for k, s in list_objects(s3, bucket)
        if not k.startswith(BACKUP_PREFIX)
        and k.lower().endswith(IMAGE_EXTS)
        and s >= args.min_bytes
    ]
    targets.sort(key=lambda t: -t[1])

    if not targets:
        print("nothing over %d bytes" % args.min_bytes)
        return

    print("%d image(s) over %.0f KB%s\n" %
          (len(targets), args.min_bytes / 1024, "  [dry run]" if args.dry_run else ""))

    before = after = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(optimize_one, s3, bucket, k, s, args.dry_run)
                   for k, s in targets]
        for f in concurrent.futures.as_completed(futures):
            key, was, now, status = f.result()
            before += was
            after  += now
            if status == "ok":
                print("  %7.2f MB -> %6.2f MB  %s" % (was / 1e6, now / 1e6, key))
            else:
                print("  %7.2f MB    --        %s  (%s)" % (was / 1e6, key, status))

    print("\ntotal %.1f MB -> %.1f MB  (%.0f%% smaller)%s" %
          (before / 1e6, after / 1e6,
           100 * (1 - after / before) if before else 0,
           "  [dry run — nothing written]" if args.dry_run else ""))


if __name__ == "__main__":
    main()
