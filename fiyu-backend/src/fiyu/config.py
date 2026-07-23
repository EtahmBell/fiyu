from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path


@dataclass(frozen=True, slots=True)
class ScoringConfig:
    """Configuration for the provisional internal candidate score."""

    target_rating: float = 4.2
    minimum_rating: float = 3.9
    soft_review_cap: int = 100
    minimum_review_count: int = 5
    maximum_review_count: int = 500
    prior_review_weight: int = 30
    minimum_peer_group_size: int = 15
    minimum_candidate_score: float = 55.0

    quality_weight: float = 0.45
    underexposure_weight: float = 0.30
    digital_footprint_weight: float = 0.10
    confidence_weight: float = 0.10
    independent_weight: float = 0.05

    chain_title_threshold: int = 4
    chain_domain_threshold: int = 3

    def validate(self) -> None:
        total = (
            self.quality_weight
            + self.underexposure_weight
            + self.digital_footprint_weight
            + self.confidence_weight
            + self.independent_weight
        )
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Score weights must sum to 1.0, got {total:.6f}")
        if self.minimum_rating > self.target_rating:
            raise ValueError("minimum_rating cannot exceed target_rating")
        if self.soft_review_cap <= 0 or self.maximum_review_count <= 0:
            raise ValueError("Review caps must be positive")
        if self.minimum_review_count < 0:
            raise ValueError("minimum_review_count cannot be negative")

    @classmethod
    def from_json(cls, path: str | Path | None) -> "ScoringConfig":
        if path is None:
            config = cls()
        else:
            raw = json.loads(Path(path).read_text(encoding="utf-8"))
            config = cls(**raw)
        config.validate()
        return config

    def to_dict(self) -> dict[str, object]:
        return asdict(self)
