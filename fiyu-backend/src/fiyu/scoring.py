from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from math import log1p
from statistics import mean

from .config import ScoringConfig
from .normalize import completeness
from .utils import clamp


def _percentile_midrank(sorted_values: list[float], value: float) -> float:
    if len(sorted_values) <= 1:
        return 0.5
    left = bisect_left(sorted_values, value)
    right = bisect_right(sorted_values, value)
    midpoint_rank = (left + right - 1) / 2
    return midpoint_rank / (len(sorted_values) - 1)


def _quality_score(adjusted_rating: float) -> float:
    # 3.8 maps to 0 and 4.8 maps to 100. Values outside the range are clipped.
    return clamp((adjusted_rating - 3.8) / 1.0 * 100.0)


def _digital_footprint_score(footprint_type: str) -> float:
    return {
        "none": 100.0,
        "social_only": 70.0,
        "aggregator": 55.0,
        "independent_website": 10.0,
    }.get(footprint_type, 25.0)


def _confidence_band(review_count: int, completeness_score: float) -> str:
    if review_count < 10 or completeness_score < 40:
        return "very_low"
    if review_count < 25 or completeness_score < 55:
        return "low"
    if review_count < 60:
        return "moderate"
    if review_count < 150:
        return "good"
    return "strong"


def _candidate_tier(score: float) -> str:
    if score >= 80:
        return "top_candidate"
    if score >= 70:
        return "strong_candidate"
    if score >= 60:
        return "candidate"
    if score >= 50:
        return "borderline"
    return "unlikely"


def score_records(records: list[dict[str, object]], config: ScoringConfig) -> None:
    config.validate()
    if not records:
        return

    global_ratings = [float(record["rating"]) for record in records if record.get("rating") is not None]
    global_mean = mean(global_ratings) if global_ratings else 4.0

    area_ratings: dict[str, list[float]] = defaultdict(list)
    peer_reviews: dict[tuple[str, str], list[float]] = defaultdict(list)
    area_reviews: dict[str, list[float]] = defaultdict(list)
    global_reviews: list[float] = []

    for record in records:
        area = str(record.get("search_area") or "unknown")
        category = str(record.get("broad_category") or "restaurant")
        rating = float(record.get("rating") or global_mean)
        reviews = int(record.get("review_count") or 0)
        logged_reviews = log1p(reviews)
        area_ratings[area].append(rating)
        peer_reviews[(area, category)].append(logged_reviews)
        area_reviews[area].append(logged_reviews)
        global_reviews.append(logged_reviews)

    sorted_peer_reviews = {key: sorted(values) for key, values in peer_reviews.items()}
    sorted_area_reviews = {key: sorted(values) for key, values in area_reviews.items()}
    sorted_global_reviews = sorted(global_reviews)
    area_means = {key: mean(values) for key, values in area_ratings.items()}

    for record in records:
        area = str(record.get("search_area") or "unknown")
        category = str(record.get("broad_category") or "restaurant")
        rating = float(record.get("rating") or global_mean)
        review_count = int(record.get("review_count") or 0)
        prior_mean = area_means.get(area, global_mean)
        prior_weight = config.prior_review_weight

        adjusted_rating = (
            (review_count / (review_count + prior_weight)) * rating
            + (prior_weight / (review_count + prior_weight)) * prior_mean
        )
        quality = _quality_score(adjusted_rating)

        peer_values = sorted_peer_reviews.get((area, category), [])
        if len(peer_values) < config.minimum_peer_group_size:
            peer_values = sorted_area_reviews.get(area, [])
        if len(peer_values) < config.minimum_peer_group_size:
            peer_values = sorted_global_reviews
        percentile = _percentile_midrank(peer_values, log1p(review_count))
        underexposure = clamp((1.0 - percentile) * 100.0)

        completeness_score = completeness(record) / 10.0 * 100.0
        review_confidence = clamp(log1p(review_count) / log1p(config.soft_review_cap) * 100.0)
        confidence = 0.8 * review_confidence + 0.2 * completeness_score

        digital = _digital_footprint_score(str(record.get("digital_footprint_type") or "none"))
        independent = 0.0 if record.get("chain_flag") else 100.0

        raw_score = (
            config.quality_weight * quality
            + config.underexposure_weight * underexposure
            + config.digital_footprint_weight * digital
            + config.confidence_weight * confidence
            + config.independent_weight * independent
        )

        penalty = 0.0
        if review_count < 5:
            penalty += 18.0
        elif review_count < 10:
            penalty += 10.0
        if record.get("chain_flag"):
            penalty += 20.0
        if rating < config.minimum_rating:
            penalty += min(20.0, (config.minimum_rating - rating) * 25.0)

        score = clamp(raw_score - penalty)
        if review_count < 5:
            score = min(score, 65.0)
        elif review_count < 10:
            score = min(score, 72.0)
        no_website = not bool(record.get("website"))
        matches_simple_rule = (
            no_website
            and rating >= config.target_rating
            and review_count <= config.soft_review_cap
            and not bool(record.get("chain_flag"))
        )
        candidate_eligible = (
            rating >= config.minimum_rating
            and review_count >= config.minimum_review_count
            and review_count <= config.maximum_review_count
            and not bool(record.get("chain_flag"))
            and score >= config.minimum_candidate_score
        )

        reasons: list[str] = []
        if quality >= 70:
            reasons.append("strong_adjusted_rating")
        if underexposure >= 70:
            reasons.append("low_reviews_relative_to_peers")
        if no_website:
            reasons.append("no_website")
        elif digital >= 55:
            reasons.append("limited_digital_footprint")
        if confidence < 45:
            reasons.append("limited_evidence")
        if record.get("chain_flag"):
            reasons.append("chain_likelihood")

        record.update(
            {
                "adjusted_rating": round(adjusted_rating, 4),
                "quality_score": round(quality, 2),
                "underexposure_score": round(underexposure, 2),
                "digital_footprint_score": round(digital, 2),
                "confidence_score": round(confidence, 2),
                "independent_score": round(independent, 2),
                "score_penalty": round(penalty, 2),
                "internal_fiyu_score": round(score, 2),
                "candidate_tier": _candidate_tier(score),
                "confidence_band": _confidence_band(review_count, completeness_score),
                "matches_simple_rule": matches_simple_rule,
                "candidate_eligible": candidate_eligible,
                "score_reasons": reasons,
                "peer_group_size": len(peer_values),
                "peer_review_percentile": round(percentile * 100.0, 2),
            }
        )
