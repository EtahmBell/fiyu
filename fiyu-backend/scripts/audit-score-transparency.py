"""Read-only catalog audit; emits only selected public explanation inputs/results."""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

from fiyu.score_transparency import explain_score


def audit(database: Path) -> dict:
    with sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        query = "SELECT place_id, fiyu_score, is_published FROM public_restaurants ORDER BY place_id"

        def fingerprint():
            return hashlib.sha256(json.dumps([tuple(row) for row in connection.execute(query)]).encode()).hexdigest()

        before = fingerprint()
        rows = connection.execute("""
            SELECT p.name_en, p.fiyu_score, p.score_version, p.quality_signal,
                   p.hiddenness_signal, p.independence_signal, p.local_signal,
                   p.local_discovery_score, p.confidence_band, p.evidence_json,
                   p.card_description, p.description_en, r.review_count,
                   (SELECT rr.structured_research_json FROM restaurant_research_runs rr
                    WHERE rr.public_restaurant_id=p.place_id AND rr.is_current=1
                    AND rr.status='complete' ORDER BY rr.id DESC LIMIT 1) AS structured_research_json
            FROM public_restaurants p LEFT JOIN restaurants r USING(place_id)
            WHERE p.is_published=1 ORDER BY p.fiyu_score DESC
        """).fetchall()
        categories = {}
        for raw in rows:
            row = dict(raw)
            evidence = json.loads(row["evidence_json"] or "{}")
            result = explain_score(row).model_dump()
            probes = {
                "low_international_exposure": evidence.get("international_visibility") == "low" and evidence.get("english_tourist_source_count") == 0,
                "many_reviews": (row["review_count"] or 0) >= 250,
                "english_coverage": (evidence.get("english_tourist_source_count") or 0) >= 2,
                "higher_visibility": evidence.get("international_visibility") == "high",
                "multiple_locations": (evidence.get("known_location_count") or 0) > 1,
                "sparse_sources": (evidence.get("total_evidence_sources") or 0) < 3,
                "near_threshold": 75 <= row["fiyu_score"] < 76,
                "nine_plus": row["fiyu_score"] >= 90,
            }
            for category, matches in probes.items():
                if matches and category not in categories:
                    categories[category] = {
                        "name": row["name_en"], "score": row["fiyu_score"],
                        "version": row["score_version"], "review_count": row["review_count"],
                        "evidence": {key: evidence.get(key) for key in (
                            "matched_restaurant", "identity_confidence", "japanese_source_count",
                            "english_tourist_source_count", "international_visibility", "tourist_coverage",
                            "chain_classification", "known_location_count", "total_evidence_sources",
                        )}, "explanation": result,
                    }
        after = fingerprint()
        assert before == after
        return {"published_records_checked": len(rows), "score_publication_hash_before": before,
                "score_publication_hash_after": after, "examples": categories,
                "missing_categories": [key for key in probes if key not in categories] if rows else []}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/fiyu.db"))
    print(json.dumps(audit(parser.parse_args().db), indent=2, ensure_ascii=True))
