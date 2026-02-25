"""
fetch_images.py — Thailand Fruit Guide Image Crawler
Downloads 12 candidate images per fruit (6 Bing + 6 Baidu) using icrawler.

Usage:
    pip install icrawler Pillow
    python fetch_images.py
"""

import os
import time
import random
import logging
import requests
from icrawler.builtin import BingImageCrawler, BaiduImageCrawler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ─── User-Agent rotation ───────────────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

# ─── Fruits list ──────────────────────────────────────────────────────────────
FRUITS = [
    {
        "slug": "mango",
        "queries": [
            "mango Thailand fresh market",
            "mango Thai มะม่วง close up",
            "mango cross section cut flesh ripe",
        ],
    },
    {
        "slug": "mangosteen",
        "queries": [
            "mangosteen Thailand fresh market",
            "mangosteen Thai มังคุด close up",
            "mangosteen cross section cut white flesh",
        ],
    },
    {
        "slug": "rambutan",
        "queries": [
            "rambutan Thailand fresh market",
            "rambutan Thai เงาะ close up",
            "rambutan open flesh white inside",
        ],
    },
    {
        "slug": "durian",
        "queries": [
            "durian Thailand fresh market",
            "durian Thai ทุเรียน close up",
            "durian open flesh yellow inside",
        ],
    },
    {
        "slug": "longan",
        "queries": [
            "longan Thailand fresh market",
            "longan Thai ลำไย close up",
            "longan peeled white flesh cluster",
        ],
    },
    {
        "slug": "lychee",
        "queries": [
            "lychee Thailand fresh market",
            "lychee Thai ลิ้นจี่ close up",
            "lychee peeled white flesh red skin",
        ],
    },
    {
        "slug": "papaya",
        "queries": [
            "papaya Thailand fresh market",
            "papaya Thai มะละกอ close up",
            "papaya cross section orange flesh seeds",
        ],
    },
    {
        "slug": "pineapple",
        "queries": [
            "pineapple Thailand fresh market",
            "pineapple Thai สับปะรด close up",
            "pineapple cross section cut yellow flesh",
        ],
    },
    {
        "slug": "dragon-fruit",
        "queries": [
            "dragon fruit Thailand fresh market",
            "dragon fruit Thai แก้วมังกร close up",
            "dragon fruit cross section pink white flesh",
        ],
    },
    {
        "slug": "jackfruit",
        "queries": [
            "jackfruit Thailand fresh market",
            "jackfruit Thai ขนุน close up",
            "jackfruit open yellow pods flesh",
        ],
    },
    {
        "slug": "pomelo",
        "queries": [
            "pomelo Thailand fresh market",
            "pomelo Thai ส้มโอ close up",
            "pomelo cross section pink white flesh",
        ],
    },
    {
        "slug": "rose-apple",
        "queries": [
            "rose apple chomphu Thailand fresh market",
            "rose apple Thai ชมพู่ close up",
            "rose apple pink red fruit close up",
        ],
    },
    {
        "slug": "tamarind",
        "queries": [
            "tamarind Thailand fresh market",
            "tamarind Thai มะขาม close up",
            "tamarind pod open brown flesh",
        ],
    },
    {
        "slug": "starfruit",
        "queries": [
            "starfruit carambola Thailand fresh market",
            "starfruit Thai มะเฟือง close up",
            "starfruit cross section star shape yellow",
        ],
    },
    {
        "slug": "santol",
        "queries": [
            "santol Thailand fresh market",
            "santol Thai กระท้อน close up",
            "santol cut open white flesh",
        ],
    },
    {
        "slug": "guava",
        "queries": [
            "guava Thailand fresh market",
            "guava Thai ฝรั่ง close up",
            "guava cross section pink white flesh seeds",
        ],
    },
    {
        "slug": "salak",
        "queries": [
            "salak snake fruit Thailand fresh market",
            "salak Thai สละ close up",
            "salak snake fruit peeled brown flesh",
        ],
    },
    {
        "slug": "langsat",
        "queries": [
            "langsat Thailand fresh market",
            "langsat Thai ลางสาด close up",
            "langsat peeled white translucent flesh cluster",
        ],
    },
    {
        "slug": "banana",
        "queries": [
            "banana kluay Thailand fresh market",
            "banana Thai กล้วย close up varieties",
            "banana bunch yellow ripe Thailand",
        ],
    },
    {
        "slug": "coconut",
        "queries": [
            "coconut Thailand fresh market drink",
            "coconut Thai มะพร้าว close up",
            "young coconut cut open white flesh Thailand",
        ],
    },
    {
        "slug": "sapodilla",
        "queries": [
            "sapodilla lamut Thailand fresh market",
            "sapodilla Thai ละมุด close up",
            "sapodilla cross section brown flesh seeds",
        ],
    },
    {
        "slug": "custard-apple",
        "queries": [
            "custard apple noina Thailand fresh market",
            "custard apple Thai น้อยหน่า close up",
            "custard apple open white flesh seeds",
        ],
    },
    {
        "slug": "pomegranate",
        "queries": [
            "pomegranate Thailand fresh market",
            "pomegranate Thai ทับทิม close up",
            "pomegranate cross section red seeds arils",
        ],
    },
    {
        "slug": "watermelon",
        "queries": [
            "watermelon Thailand fresh market",
            "watermelon Thai แตงโม close up",
            "watermelon cross section red flesh black seeds",
        ],
    },
    {
        "slug": "green-mango",
        "queries": [
            "green mango unripe Thailand fresh market",
            "green mango Thai มะม่วงดิบ close up",
            "green mango sliced with nam pla wan dip",
        ],
    },
]


def make_session(ua: str) -> requests.Session:
    """Create a requests session with browser-like headers."""
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
    )
    return s


def crawl_bing(slug: str, query: str, save_dir: str, ua: str) -> int:
    """Run a single Bing crawl batch. Returns number downloaded."""
    try:
        crawler = BingImageCrawler(
            feeder_threads=1,
            parser_threads=1,
            downloader_threads=2,
            storage={"root_dir": save_dir},
        )
        crawler.session = make_session(ua)
        crawler.crawl(
            keyword=query,
            max_num=6,
            min_size=(200, 200),
            overwrite=False,
        )
        return len(os.listdir(save_dir))
    except Exception as e:
        log.warning(f"Bing crawl failed for '{query}': {e}")
        return 0


def crawl_baidu(slug: str, query: str, save_dir: str, ua: str) -> int:
    """Run a single Baidu crawl batch. Returns number downloaded."""
    try:
        crawler = BaiduImageCrawler(
            feeder_threads=1,
            parser_threads=1,
            downloader_threads=2,
            storage={"root_dir": save_dir},
        )
        crawler.session = make_session(ua)
        crawler.crawl(
            keyword=query,
            max_num=6,
            min_size=(200, 200),
            overwrite=False,
        )
        return len(os.listdir(save_dir))
    except Exception as e:
        log.warning(f"Baidu crawl failed for '{query}': {e}")
        return 0


def fetch_fruit(fruit: dict) -> None:
    slug = fruit["slug"]
    queries = fruit["queries"]
    raw_dir = os.path.join("images", "raw", slug)
    os.makedirs(raw_dir, exist_ok=True)

    log.info(f"━━━ Starting: {slug} ━━━")

    ua = random.choice(USER_AGENTS)

    # ── Bing: use primary and secondary queries ──────────────────────────────
    for q in queries[:2]:
        log.info(f"  Bing: {q}")
        crawl_bing(slug, q, raw_dir, ua)
        delay = random.uniform(2.5, 6.0)
        log.info(f"  Sleeping {delay:.1f}s...")
        time.sleep(delay)

    # ── Inter-engine gap: 8–12s ──────────────────────────────────────────────
    gap = random.uniform(8.0, 12.0)
    log.info(f"  Engine gap: {gap:.1f}s...")
    time.sleep(gap)

    # ── Baidu: use secondary and tertiary queries ────────────────────────────
    ua = random.choice(USER_AGENTS)  # rotate UA for Baidu
    for q in queries[1:]:
        log.info(f"  Baidu: {q}")
        crawl_baidu(slug, q, raw_dir, ua)
        delay = random.uniform(2.5, 6.0)
        log.info(f"  Sleeping {delay:.1f}s...")
        time.sleep(delay)

    count = len(os.listdir(raw_dir))
    log.info(f"  ✓ {slug}: {count} images downloaded to {raw_dir}")


def main():
    log.info(f"Fetching images for {len(FRUITS)} fruits...")
    for i, fruit in enumerate(FRUITS, 1):
        log.info(f"\n[{i}/{len(FRUITS)}] {fruit['slug']}")
        fetch_fruit(fruit)
        # Polite inter-fruit gap
        if i < len(FRUITS):
            pause = random.uniform(5.0, 10.0)
            log.info(f"  Inter-fruit pause: {pause:.1f}s")
            time.sleep(pause)
    log.info("\n✓ All fruits fetched.")


if __name__ == "__main__":
    main()
