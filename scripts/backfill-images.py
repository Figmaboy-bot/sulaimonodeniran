#!/usr/bin/env python3
"""
One-off (re-runnable) backfill for oversized project images.

Gallery images were uploaded straight from the file picker, so the bucket holds
multi-megabyte originals — 7000px JPEGs displayed at ~1000px. This downloads
each one, downscales it to the same limits the admin uploader now applies
(2000x4000, WebP q82), uploads the result alongside the original, and rewrites
the `projects` rows to point at it. Intrinsic width/height are written into the
gallery JSON too, so the page can reserve layout space before the bytes land.

Originals are left in the bucket; nothing is destructive. A mapping of
old -> new URLs is written to backfill-images.map.json for auditing or rollback.

Usage:
    python3 scripts/backfill-images.py --dry-run
    python3 scripts/backfill-images.py
"""

import argparse
import concurrent.futures
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MAX_W, MAX_H = 2000, 4000
QUALITY = 82
BUCKET = "projects"
PUBLIC_MARKER = "/storage/v1/object/public/"
SKIP_EXT = (".mp4", ".mov", ".webm", ".svg", ".gif")

MAP_PATH = os.path.join(ROOT, "backfill-images.map.json")


def load_config():
    """Read the Supabase URL and anon key out of supabase-config.js."""
    src = open(os.path.join(ROOT, "supabase-config.js")).read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", src)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src)
    if not url or not key:
        sys.exit("Could not parse supabase-config.js")
    return url.group(1), key.group(1)


SUPABASE_URL, ANON_KEY = load_config()


def api(path, method="GET", body=None, headers=None):
    req = urllib.request.Request(SUPABASE_URL + path, method=method)
    req.add_header("apikey", ANON_KEY)
    req.add_header("Authorization", "Bearer " + ANON_KEY)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if body is not None:
        req.data = body
    with urllib.request.urlopen(req) as res:
        return res.read()


def fetch_projects():
    return json.loads(api("/rest/v1/projects?select=*&order=sort_order.asc"))


def image_urls(project):
    """Every storage image URL a project references, in document order."""
    out = []
    if project.get("cover_url"):
        out.append(project["cover_url"])
    for section in project.get("gallery") or []:
        if section.get("type") == "full":
            items = [section]
        else:
            items = section.get("images") or []
        for item in items:
            if item.get("mediaType") == "video":
                continue
            if item.get("src"):
                out.append(item["src"])
    return out


def is_convertible(url):
    return PUBLIC_MARKER in url and not url.lower().endswith(SKIP_EXT)


def object_path(url):
    """images/foo.jpg from a public storage URL."""
    tail = url.split(PUBLIC_MARKER, 1)[1]
    return tail.split("/", 1)[1]  # strip the bucket segment


def download(url):
    with urllib.request.urlopen(url) as res:
        return res.read()


def shrink(raw):
    """-> (webp_bytes|None, width, height). None when re-encoding isn't a win."""
    im = Image.open(io.BytesIO(raw))
    im.load()
    w, h = im.size
    scale = min(1.0, MAX_W / w, MAX_H / h)
    out_w, out_h = max(1, round(w * scale)), max(1, round(h * scale))
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.mode or im.mode == "P" else "RGB")
    if (out_w, out_h) != (w, h):
        im = im.resize((out_w, out_h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=QUALITY, method=6)
    data = buf.getvalue()
    if len(data) >= len(raw):
        return None, w, h
    return data, out_w, out_h


def upload(path, data):
    api(
        "/storage/v1/object/%s/%s" % (BUCKET, path),
        method="POST",
        body=data,
        headers={
            "Content-Type": "image/webp",
            "cache-control": "max-age=31536000, immutable",
            "x-upsert": "true",
        },
    )
    return SUPABASE_URL + PUBLIC_MARKER + BUCKET + "/" + path


def rewrite(project, mapping):
    """Point a project row at the new files and stamp in intrinsic sizes."""
    changed = False
    cover = project.get("cover_url")
    if cover in mapping:
        project["cover_url"] = mapping[cover]["url"]
        changed = True

    for section in project.get("gallery") or []:
        items = [section] if section.get("type") == "full" else (section.get("images") or [])
        for item in items:
            entry = mapping.get(item.get("src"))
            if not entry:
                continue
            item["src"] = entry["url"]
            item["w"] = entry["w"]
            item["h"] = entry["h"]
            changed = True
    return changed


def save(project):
    body = json.dumps({
        "cover_url": project.get("cover_url"),
        "gallery": project.get("gallery"),
    }).encode()
    api(
        "/rest/v1/projects?id=eq." + urllib.parse.quote(project["id"]),
        method="PATCH",
        body=body,
        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    args = ap.parse_args()

    projects = fetch_projects()
    targets = []
    for p in projects:
        for url in image_urls(p):
            if is_convertible(url) and url not in targets:
                targets.append(url)

    print("%d projects, %d unique images\n" % (len(projects), len(targets)))

    def process(url):
        """-> (url, entry|None, src_bytes, out_bytes, note). Runs on a worker."""
        name = url.rsplit("/", 1)[-1]
        try:
            raw = download(url)
        except Exception as e:
            return url, None, 0, 0, "%-28s download failed: %s" % (name, e)

        try:
            data, w, h = shrink(raw)
        except Exception as e:  # unsupported codec, corrupt file
            return url, None, 0, 0, "%-28s skipped (%s)" % (name, e)

        if data is None:
            return url, None, len(raw), len(raw), "%-28s already optimal (%d KB)" % (name, len(raw) // 1024)

        new_path = re.sub(r"\.[^.]+$", ".webp", object_path(url))
        if args.dry_run:
            new_url = SUPABASE_URL + PUBLIC_MARKER + BUCKET + "/" + new_path
        else:
            try:
                new_url = upload(new_path, data)
            except Exception as e:
                return url, None, len(raw), len(raw), "%-28s upload failed: %s" % (name, e)

        note = "%-28s %5d KB -> %4d KB  (%dx%d)" % (name, len(raw) // 1024, len(data) // 1024, w, h)
        return url, {"url": new_url, "w": w, "h": h}, len(raw), len(data), note

    mapping = {}
    before = after = 0
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for url, entry, src_bytes, out_bytes, note in pool.map(process, targets):
            done += 1
            before += src_bytes
            after += out_bytes
            if entry:
                mapping[url] = entry
            print("  [%2d/%d] %s" % (done, len(targets), note), flush=True)

    print("\ntotal: %.1f MB -> %.1f MB  (%d converted, %d unchanged)"
          % (before / 1048576, after / 1048576, len(mapping), len(targets) - len(mapping)))

    if args.dry_run:
        print("dry run — no uploads, no rows touched")
        return

    with open(MAP_PATH, "w") as f:
        json.dump(mapping, f, indent=2)
    print("wrote %s" % os.path.relpath(MAP_PATH, ROOT))

    for p in projects:
        if rewrite(p, mapping):
            save(p)
            print("updated row: %s" % p["id"])


if __name__ == "__main__":
    main()
