from datetime import datetime, timezone
from feedgen.feed import FeedGenerator
import json
import os
import requests
import re

DB_FILE = "./.data/tech_books.json"


def load_db() -> dict:
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_db(db: dict):
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def scrape_gihyo_books():
    api_url_list = [
        "https://gihyo.jp/api_gh/book/series/WEB%2BDB%20PRESS%20plus?limit=22",
        "https://gihyo.jp/api_gh/book/series/%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%8B%E3%82%A2%E9%81%B8%E6%9B%B8?limit=13",
        "https://gihyo.jp/api_gh/book/series/%E6%83%85%E5%A0%B1%E5%87%A6%E7%90%86%E6%8A%80%E8%A1%93%E8%80%85%E8%A9%A6%E9%A8%93?limit=13",
    ]

    books = []

    try:
        for api_url in api_url_list:
            response = requests.get(api_url)
            response.raise_for_status()
            data = response.json()

            base_url = "https://gihyo.jp"
            # API response uses "list" (a dict keyed by ISBN), not "items"
            for isbn, value in data["list"].items():
                # HTML tags are included in title and subtitle
                title = re.sub(r"<[^>]*>", "", value["title"]).strip()
                subtitle = re.sub(r"<[^>]*>", "", value["subtitle"]).strip()

                books.append({
                    "id": isbn,
                    "title": title + subtitle,
                    "link": base_url + value["url"],
                    "summary": "技術評論社",
                })

    except requests.exceptions.RequestException as e:
        print(f"HTTPリクエストエラー: {e}")
        return []
    except Exception as e:
        print(f"予期しないエラー: {e}")
        return []

    return books


if __name__ == "__main__":
    books = scrape_gihyo_books()

    # set current time
    now_utc = datetime.now(timezone.utc).isoformat()

    db = load_db()

    for book in books:
        isbn = book.get("id", "")

        if isbn in db:
            updated = db[isbn]
        else:
            db[isbn] = now_utc
            updated = now_utc

        book["updated"] = updated

    save_db(db)

    # generate atom feed
    fg = FeedGenerator()
    fg.id("https://github.com/notifications")
    fg.title("Tracking tech books")
    fg.link(href="https://github.com/notifications", rel="alternate")
    fg.language("ja")

    for book in books:
        entry_tag = fg.add_entry()

        entry_tag.id(book.get("link"))
        entry_tag.title(book.get("title"))
        entry_tag.updated(book.get("updated"))
        entry_tag.link(href=book.get("link"))
        entry_tag.summary(book.get("summary"))

    atom_feed = fg.atom_str(pretty=True)
    with open("./rss/tech_books.atom", "wb") as atom_file:
        atom_file.write(atom_feed)
