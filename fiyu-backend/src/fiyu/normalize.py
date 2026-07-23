from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Iterable

from .utils import domain_from_url, normalize_name


FOOD_KEYWORDS = {
    "restaurant",
    "ramen",
    "sushi",
    "izakaya",
    "yakitori",
    "tonkatsu",
    "cafe",
    "coffee",
    "bakery",
    "bar",
    "pub",
    "diner",
    "bistro",
    "brasserie",
    "grill",
    "steak",
    "noodle",
    "udon",
    "soba",
    "tempura",
    "curry",
    "pizza",
    "burger",
    "chinese",
    "korean",
    "thai",
    "indian",
    "french",
    "italian",
    "japanese",
    "seafood",
    "dessert",
    "ice cream",
    "食堂",
    "料理",
    "居酒屋",
    "寿司",
    "鮨",
    "焼肉",
    "焼き鳥",
    "ラーメン",
    "うどん",
    "そば",
    "蕎麦",
    "とんかつ",
    "カフェ",
    "喫茶",
    "レストラン",
    "パン",
    "中華",
    "定食",
    "天ぷら",
    "カレー",
}

COMMON_CHAIN_TERMS = {
    "mcdonald",
    "マクドナルド",
    "starbucks",
    "スターバックス",
    "kfc",
    "ケンタッキー",
    "mosburger",
    "モスバーガー",
    "yoshinoya",
    "吉野家",
    "sukiya",
    "すき家",
    "matsuya",
    "松屋",
    "saizeriya",
    "サイゼリヤ",
    "gusto",
    "ガスト",
    "jonathan",
    "ジョナサン",
    "doutor",
    "ドトール",
    "tully",
    "タリーズ",
    "sushiro",
    "スシロー",
    "kurasushi",
    "くら寿司",
    "torikizoku",
    "鳥貴族",
    "ichiran",
    "一蘭",
    "ippudo",
    "一風堂",
    "cocoichibanya",
    "ココ壱番屋",
}

SOCIAL_DOMAINS = {
    "instagram.com",
    "facebook.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
}

AGGREGATOR_DOMAINS = {
    "tabelog.com",
    "hotpepper.jp",
    "retty.me",
    "tripadvisor.com",
    "yelp.com",
    "gurunavi.com",
    "gnavi.co.jp",
    "ubereats.com",
    "wolt.com",
}


@dataclass(slots=True)
class CleaningStats:
    input_rows: int = 0
    invalid_rows: int = 0
    closed_rows: int = 0
    advertisement_rows: int = 0
    nonfood_rows: int = 0
    duplicate_rows: int = 0
    output_rows: int = 0


def broad_category(record: dict[str, object]) -> str:
    text = " ".join(
        [str(record.get("category") or "")]
        + [str(value) for value in (record.get("categories") or [])]
    ).casefold()
    mapping = (
        ("ramen", ("ramen", "ラーメン")),
        ("sushi", ("sushi", "寿司", "鮨")),
        ("izakaya", ("izakaya", "居酒屋")),
        ("yakitori", ("yakitori", "焼き鳥")),
        ("tonkatsu", ("tonkatsu", "とんかつ")),
        ("cafe", ("cafe", "coffee", "喫茶", "カフェ")),
        ("bakery", ("bakery", "パン")),
        ("bar", ("bar", "pub")),
        ("soba_udon", ("soba", "udon", "そば", "蕎麦", "うどん")),
        ("yakiniku", ("yakiniku", "焼肉")),
        ("curry", ("curry", "カレー")),
        ("chinese", ("chinese", "中華")),
        ("korean", ("korean", "韓国")),
        ("italian", ("italian", "pizza", "イタリア", "ピザ")),
        ("french", ("french", "フレンチ")),
        ("japanese", ("japanese", "和食", "定食", "食堂", "天ぷら")),
    )
    for label, keywords in mapping:
        if any(keyword in text for keyword in keywords):
            return label
    return "restaurant"


def is_food_place(record: dict[str, object]) -> bool:
    text = " ".join(
        [str(record.get("category") or "")]
        + [str(value) for value in (record.get("categories") or [])]
    ).casefold()
    if not text.strip():
        return True
    return any(keyword in text for keyword in FOOD_KEYWORDS)


def completeness(record: dict[str, object]) -> int:
    fields = (
        "title",
        "address",
        "latitude",
        "longitude",
        "category",
        "rating",
        "review_count",
        "maps_url",
        "image_url",
        "phone",
    )
    return sum(record.get(field) not in (None, "", []) for field in fields)


def dedupe_key(record: dict[str, object]) -> str | None:
    for field in ("place_id", "cid", "fid"):
        if record.get(field):
            return f"{field}:{record[field]}"
    name = normalize_name(record.get("title") if isinstance(record.get("title"), str) else None)
    address = normalize_name(record.get("address") if isinstance(record.get("address"), str) else None)
    lat = record.get("latitude")
    lng = record.get("longitude")
    if name and address:
        return f"fallback:{name}:{address}"
    if name and lat is not None and lng is not None:
        return f"fallback:{name}:{float(lat):.5f}:{float(lng):.5f}"
    return None


def merge_records(existing: dict[str, object], incoming: dict[str, object]) -> dict[str, object]:
    current_date = existing.get("scraped_at")
    incoming_date = incoming.get("scraped_at")
    incoming_is_newer = bool(incoming_date and (not current_date or incoming_date > current_date))

    primary, secondary = (incoming, existing) if incoming_is_newer else (existing, incoming)
    merged = dict(primary)
    for key, value in secondary.items():
        if merged.get(key) in (None, "", []):
            merged[key] = value

    merged["rating"] = primary.get("rating") or secondary.get("rating")
    merged["review_count"] = max(
        int(existing.get("review_count") or 0), int(incoming.get("review_count") or 0)
    )
    areas = set(existing.get("source_areas") or [existing.get("search_area")])
    areas.update(incoming.get("source_areas") or [incoming.get("search_area")])
    merged["source_areas"] = sorted(str(area) for area in areas if area)
    files = set(existing.get("source_files") or [existing.get("source_file")])
    files.update(incoming.get("source_files") or [incoming.get("source_file")])
    merged["source_files"] = sorted(str(item) for item in files if item)
    return merged


def clean_and_dedupe(
    records: Iterable[dict[str, object]], *, include_all_categories: bool = False
) -> tuple[list[dict[str, object]], CleaningStats]:
    stats = CleaningStats()
    deduped: dict[str, dict[str, object]] = {}

    for record in records:
        stats.input_rows += 1
        if not record.get("title") or record.get("rating") is None or record.get("review_count") is None:
            stats.invalid_rows += 1
            continue
        if record.get("permanently_closed") or record.get("temporarily_closed"):
            stats.closed_rows += 1
            continue
        if record.get("is_advertisement"):
            stats.advertisement_rows += 1
            continue
        if not include_all_categories and not is_food_place(record):
            stats.nonfood_rows += 1
            continue

        key = dedupe_key(record)
        if key is None:
            stats.invalid_rows += 1
            continue
        record["source_areas"] = [record.get("search_area")] if record.get("search_area") else []
        record["source_files"] = [record.get("source_file")] if record.get("source_file") else []
        record["broad_category"] = broad_category(record)
        if key in deduped:
            stats.duplicate_rows += 1
            deduped[key] = merge_records(deduped[key], record)
        else:
            deduped[key] = record

    output = list(deduped.values())
    stats.output_rows = len(output)
    return output, stats


def add_chain_features(
    records: list[dict[str, object]], title_threshold: int, domain_threshold: int
) -> None:
    title_counts = Counter(normalize_name(str(record.get("title") or "")) for record in records)
    domain_counts = Counter(
        domain
        for record in records
        if (domain := domain_from_url(record.get("website") if isinstance(record.get("website"), str) else None))
    )

    for record in records:
        normalized_title = normalize_name(str(record.get("title") or ""))
        domain = domain_from_url(record.get("website") if isinstance(record.get("website"), str) else None)
        explicit_chain = any(term in normalized_title for term in COMMON_CHAIN_TERMS)
        repeated_title = bool(normalized_title and title_counts[normalized_title] >= title_threshold)
        repeated_domain = bool(domain and domain_counts[domain] >= domain_threshold)
        record["website_domain"] = domain
        record["chain_flag"] = explicit_chain or repeated_title or repeated_domain
        record["chain_reason"] = (
            "known_chain"
            if explicit_chain
            else "repeated_title"
            if repeated_title
            else "repeated_domain"
            if repeated_domain
            else None
        )
        if not domain:
            digital_type = "none"
        elif domain in SOCIAL_DOMAINS or any(domain.endswith("." + item) for item in SOCIAL_DOMAINS):
            digital_type = "social_only"
        elif domain in AGGREGATOR_DOMAINS or any(
            domain.endswith("." + item) for item in AGGREGATOR_DOMAINS
        ):
            digital_type = "aggregator"
        else:
            digital_type = "independent_website"
        record["digital_footprint_type"] = digital_type
