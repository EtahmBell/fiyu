from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from .database import connect
from .public_catalog import ensure_public_schema


class RestaurantLocalization(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_en: str = Field(min_length=1, max_length=300)
    why_fiyu: str = Field(min_length=1, max_length=600)


LOCALIZATION_PROMPT = """You localize stored Fiyu restaurant content into English.

Produce natural English, not literal word-for-word translation. Preserve factual meaning. Do not add facts
absent from the original text. Preserve restaurant names and proper nouns. A readable
Hepburn-style romanization may be used for name_en. Do not translate tags or signature dishes; they
are deliberately not provided and must not be added. Do not add ratings, prices, awards, history,
or dishes that are not present. Keep why_fiyu concise (approximately 1-3 sentences) and suitable
for a restaurant discovery card or detail page. Avoid generic marketing language.

Return only name_en and why_fiyu in the requested structured format.
"""


def _content_prompt(row: dict[str, object]) -> str:
    return (
        "Localize only this stored restaurant content:\n"
        f"name_ja: {row.get('name_ja') or ''}\n"
        f"name_en: {row.get('name_en') or ''}\n"
        f"why_fiyu: {row.get('why_fiyu') or ''}"
    )


def is_clearly_english(text: str | None) -> bool:
    """Conservative heuristic used only to choose default localization candidates."""

    if not text or not text.strip():
        return False
    latin_words = re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)?", text)
    japanese_chars = re.findall(r"[\u3040-\u30ff\u3400-\u9fff]", text)
    return len(latin_words) >= 4 and len(japanese_chars) <= sum(map(len, latin_words)) / 4


def localize_content(
    stored: dict[str, object], *, client: OpenAI, model: str
) -> RestaurantLocalization:
    response = client.responses.parse(
        model=model,
        input=[
            {"role": "system", "content": LOCALIZATION_PROMPT},
            {"role": "user", "content": _content_prompt(stored)},
        ],
        text_format=RestaurantLocalization,
    )
    if response.output_parsed is None:
        raise RuntimeError("OpenAI returned no parsed localization result")
    return RestaurantLocalization.model_validate(response.output_parsed)


def _localization_rows(
    db_path: str | Path, *, limit: int, place_id: str | None, force: bool
) -> list[dict[str, object]]:
    ensure_public_schema(db_path)
    conditions = ["research_status = 'complete'"]
    parameters: list[object] = []
    if place_id:
        conditions.append("place_id = ?")
        parameters.append(place_id)
    with connect(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT place_id, name_ja, name_en, why_fiyu
            FROM public_restaurants
            WHERE {' AND '.join(conditions)}
            ORDER BY updated_at, place_id
            """,
            parameters,
        ).fetchall()
    selected = [
        dict(row)
        for row in rows
        if force or not str(row["name_en"] or "").strip() or not is_clearly_english(row["why_fiyu"])
    ]
    return selected[:limit]


def run_localization_batch(
    db_path: str | Path,
    *,
    limit: int = 20,
    place_id: str | None = None,
    force: bool = False,
    dry_run: bool = False,
    model: str | None = None,
    client: OpenAI | None = None,
) -> dict[str, object]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    if client is None:
        load_dotenv()
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")
        client = OpenAI()
    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-5.6-luna")

    rows = _localization_rows(
        db_path, limit=limit, place_id=place_id, force=force
    )
    proposals: list[dict[str, str]] = []
    failures: list[dict[str, str]] = []
    for row in rows:
        current_place_id = str(row["place_id"])
        try:
            result = localize_content(row, client=client, model=selected_model)
            proposal = {
                "place_id": current_place_id,
                "name_en": result.name_en,
                "why_fiyu": result.why_fiyu,
            }
            proposals.append(proposal)
            if not dry_run:
                with connect(db_path) as connection:
                    connection.execute(
                        """
                        UPDATE public_restaurants
                        SET name_en = ?, why_fiyu = ?, updated_at = ?
                        WHERE place_id = ? AND research_status = 'complete'
                        """,
                        (
                            result.name_en,
                            result.why_fiyu,
                            datetime.now(UTC).isoformat(),
                            current_place_id,
                        ),
                    )
                    connection.commit()
        except Exception as exc:  # noqa: BLE001 - one bad row must not stop a batch.
            failures.append(
                {"place_id": current_place_id, "error": f"{type(exc).__name__}: {exc}"}
            )

    return {
        "selected": len(rows),
        "updated": 0 if dry_run else len(proposals),
        "failed": len(failures),
        "dry_run": dry_run,
        "proposals": proposals,
        "failures": failures,
    }
