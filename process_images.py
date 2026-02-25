"""
process_images.py — Thailand Fruit Guide Image Processor
Selects, converts, resizes, thumbnails, and generates manifest.json.

Usage:
    python process_images.py
"""

import os
import json
import hashlib
import logging
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

RAW_DIR = Path("images/raw")
PROCESSED_DIR = Path("images/processed")
THUMBS_DIR = Path("images/thumbs")
MANIFEST_PATH = Path("images/manifest.json")

THUMB_SIZE = (400, 300)
THUMB_QUALITY = 75
WEBP_QUALITY = 82
WEBP_METHOD = 6
MAX_BYTES = 1_000_000  # 1 MB
QUALITY_STEPS = [82, 75, 65, 55]
MIN_DIM = 200
MAX_CANDIDATES = 4

FRUIT_SLUGS = [
    "mango", "mangosteen", "rambutan", "durian", "longan", "lychee",
    "papaya", "pineapple", "dragon-fruit", "jackfruit", "pomelo",
    "rose-apple", "tamarind", "starfruit", "santol", "guava", "salak",
    "langsat", "banana", "coconut", "sapodilla", "custard-apple",
    "pomegranate", "watermelon", "green-mango",
]


def file_hash(path: Path) -> str:
    """MD5 of first 8KB for near-duplicate detection."""
    h = hashlib.md5()
    with open(path, "rb") as f:
        h.update(f.read(8192))
    return h.hexdigest()


def is_valid(path: Path) -> tuple[bool, str]:
    """Returns (valid, reason). Checks corrupt + min size."""
    try:
        img = Image.open(path)
        img.verify()
    except (UnidentifiedImageError, Exception):
        return False, "corrupt"

    try:
        img = Image.open(path)
        w, h = img.size
    except Exception:
        return False, "unreadable"

    if w < MIN_DIM or h < MIN_DIM:
        return False, f"too small ({w}x{h})"

    return True, "ok"


def score_image(path: Path) -> float:
    """
    Heuristic score for image quality selection.
    Higher = better. Prefers larger images with good aspect ratios.
    """
    try:
        img = Image.open(path)
        w, h = img.size
        pixels = w * h
        # Penalty for extreme aspect ratios (banners, logos)
        ratio = max(w, h) / min(w, h)
        aspect_penalty = max(0.0, (ratio - 2.0) * 0.3)
        return pixels / 1_000_000 - aspect_penalty
    except Exception:
        return 0.0


def select_best(raw_dir: Path, n: int = MAX_CANDIDATES) -> list[Path]:
    """Return up to n best unique images from raw_dir."""
    if not raw_dir.exists():
        return []

    candidates = list(raw_dir.iterdir())
    valid = []
    seen_hashes = set()

    for p in candidates:
        if not p.is_file():
            continue
        ok, reason = is_valid(p)
        if not ok:
            log.debug(f"  Skip {p.name}: {reason}")
            continue
        h = file_hash(p)
        if h in seen_hashes:
            log.debug(f"  Skip {p.name}: near-duplicate")
            continue
        seen_hashes.add(h)
        valid.append(p)

    if not valid:
        return []

    # Sort by score descending, take top n
    valid.sort(key=score_image, reverse=True)
    return valid[:n]


def save_webp(img: Image.Image, out_path: Path) -> None:
    """Save image as WebP, reducing quality until under MAX_BYTES."""
    img_rgb = img.convert("RGB")
    for quality in QUALITY_STEPS:
        img_rgb.save(out_path, "WEBP", quality=quality, method=WEBP_METHOD)
        if out_path.stat().st_size <= MAX_BYTES:
            return
    # If still too large at lowest quality, warn but keep
    log.warning(f"  {out_path.name} still >{MAX_BYTES/1e6:.1f}MB at q={QUALITY_STEPS[-1]}")


def make_thumbnail(img: Image.Image, out_path: Path) -> None:
    """Center-crop to THUMB_SIZE and save as WebP."""
    thumb = ImageOps.fit(img.convert("RGB"), THUMB_SIZE, Image.LANCZOS)
    thumb.save(out_path, "WEBP", quality=THUMB_QUALITY, method=WEBP_METHOD)


def process_fruit(slug: str) -> dict:
    """Process all images for one fruit. Returns manifest entry."""
    raw_dir = RAW_DIR / slug
    proc_dir = PROCESSED_DIR / slug
    thumb_dir = THUMBS_DIR / slug
    proc_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    best = select_best(raw_dir)
    if not best:
        log.warning(f"  {slug}: no valid source images found")
        return {"slug": slug, "processed": [], "thumbs": []}

    processed_paths = []
    thumb_paths = []

    for i, src in enumerate(best):
        try:
            img = Image.open(src)
            img.load()

            # Processed
            proc_name = f"{slug}_{i+1:02d}.webp"
            proc_path = proc_dir / proc_name
            save_webp(img, proc_path)
            processed_paths.append(f"images/processed/{slug}/{proc_name}")
            log.info(f"  ✓ {proc_name} ({proc_path.stat().st_size // 1024}KB)")

            # Thumbnail
            thumb_name = f"{slug}_{i+1:02d}_thumb.webp"
            thumb_path = thumb_dir / thumb_name
            make_thumbnail(img, thumb_path)
            thumb_paths.append(f"images/thumbs/{slug}/{thumb_name}")
            log.info(f"  ✓ {thumb_name} thumb")

            img.close()
        except Exception as e:
            log.error(f"  Error processing {src.name}: {e}")

    return {
        "slug": slug,
        "processed": processed_paths,
        "thumbs": thumb_paths,
    }


def main():
    manifest = {}
    total_processed = 0

    for slug in FRUIT_SLUGS:
        log.info(f"━━━ {slug} ━━━")
        entry = process_fruit(slug)
        manifest[slug] = entry
        total_processed += len(entry["processed"])

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    log.info(f"\n✓ Processed {total_processed} images across {len(FRUIT_SLUGS)} fruits")
    log.info(f"✓ Manifest written to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
