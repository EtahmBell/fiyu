from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from .discovery_areas import TOKYO_WARD_NAMES

_DASHES = str.maketrans({
    "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-",
    "−": "-", "－": "-",
})
_KANJI_DIGITS = {
    "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
}
_JAPANESE_CHARACTER = r"\u3040-\u30ff\u3400-\u9fff"
_NUMBER_MARKER = re.compile(
    rf"([〇零一二三四五六七八九十百千]+)"
    rf"(?=丁目|番地?(?![{_JAPANESE_CHARACTER}])|号(?![{_JAPANESE_CHARACTER}]))"
)
_NUMBER_PART = re.compile(r"\d+")


@dataclass(frozen=True)
class NormalizedJapaneseAddress:
    original: str
    normalized: str
    prefecture: str | None
    ward: str | None
    ward_ja: str | None
    neighborhood: str | None
    number_key: str | None
    number_parts: tuple[str, ...]


def _kanji_number(value: str) -> int:
    if all(character in _KANJI_DIGITS for character in value):
        return int("".join(str(_KANJI_DIGITS[character]) for character in value))
    total = 0
    current = 0
    for character in value:
        if character in _KANJI_DIGITS:
            current = _KANJI_DIGITS[character]
        elif character == "十":
            total += (current or 1) * 10
            current = 0
        elif character == "百":
            total += (current or 1) * 100
            current = 0
        elif character == "千":
            total += (current or 1) * 1000
            current = 0
    return total + current


def normalize_japanese_address_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKC", value).translate(_DASHES)
    text = re.sub(r"〒?\s*\d{3}-?\d{4}", "", text)
    text = re.sub(r"[\s,、]+", "", text)
    text = _NUMBER_MARKER.sub(lambda match: str(_kanji_number(match.group(1))), text)
    text = re.sub(r"(?<=\d)の(?=\d)", "-", text)
    text = re.sub(r"丁目", "-", text)
    text = re.sub(rf"番地?(?![{_JAPANESE_CHARACTER}])", "-", text)
    text = re.sub(rf"号(?![{_JAPANESE_CHARACTER}])", "", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def _ward_from_text(value: str) -> tuple[str | None, str | None]:
    for ward, aliases in TOKYO_WARD_NAMES.items():
        japanese = next((alias for alias in aliases if alias.endswith("区")), None)
        if japanese and japanese in value:
            return ward, japanese
    return None, None


def parse_japanese_address(value: str | None) -> NormalizedJapaneseAddress:
    original = value or ""
    normalized = normalize_japanese_address_text(original)
    prefecture = "東京都" if "東京都" in normalized else None
    without_prefecture = normalized.replace("東京都", "", 1)
    ward, ward_ja = _ward_from_text(without_prefecture)
    tail = without_prefecture
    if ward_ja:
        tail = tail.split(ward_ja, 1)[1]
    number_match = re.search(r"\d", tail)
    neighborhood = tail[: number_match.start()] if number_match else tail
    neighborhood = neighborhood.strip("-") or None
    numeric_tail = tail[number_match.start() :] if number_match else ""
    number_parts = tuple(_NUMBER_PART.findall(numeric_tail))
    number_key = "-".join(str(int(part)) for part in number_parts) or None
    if prefecture is None and ward is not None:
        prefecture = "東京都"
    canonical = "".join(
        value for value in (ward_ja, neighborhood, number_key) if value
    )
    return NormalizedJapaneseAddress(
        original=original,
        normalized=canonical,
        prefecture=prefecture,
        ward=ward,
        ward_ja=ward_ja,
        neighborhood=neighborhood,
        number_key=number_key,
        number_parts=number_parts,
    )


def compose_osm_address(tags: dict[str, str]) -> NormalizedJapaneseAddress:
    if tags.get("addr:full"):
        return parse_japanese_address(tags["addr:full"])
    prefecture = tags.get("addr:prefecture") or tags.get("addr:province") or ""
    ward = ""
    for key in ("addr:city", "addr:district", "addr:suburb"):
        candidate = tags.get(key) or ""
        if _ward_from_text(normalize_japanese_address_text(candidate))[0]:
            ward = candidate
            break
    neighborhood = ""
    for key in (
        "addr:neighbourhood", "addr:quarter", "addr:suburb", "addr:district",
    ):
        candidate = tags.get(key) or ""
        normalized_candidate = normalize_japanese_address_text(candidate)
        if candidate and not _ward_from_text(normalized_candidate)[0]:
            neighborhood = candidate
            break
    block = tags.get("addr:block_number") or ""
    house = tags.get("addr:housenumber") or ""
    numeric = ""
    if block:
        numeric += f"{block}番"
    if house:
        numeric += f"{house}{'号' if block else '番'}"
    return parse_japanese_address(f"{prefecture}{ward}{neighborhood}{numeric}")


def normalize_osm_number(value: str | None) -> str | None:
    if not value:
        return None
    normalized = normalize_japanese_address_text(value)
    parts = _NUMBER_PART.findall(normalized)
    return "-".join(str(int(part)) for part in parts) or None
