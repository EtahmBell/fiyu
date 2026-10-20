"""Independent identity research for previously unknown My Pick submissions."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field

from .address_research import DEFAULT_MAX_SEARCH_ACTIONS, extract_response_metadata


class MyPickIdentityBootstrap(BaseModel):
    identity_status: str = Field(pattern="^(confirmed|ambiguous|non_restaurant)$")
    identity_confidence: float = Field(ge=0, le=1)
    canonical_name_ja: str | None = Field(default=None, max_length=200)
    canonical_name_en: str | None = Field(default=None, max_length=200)
    primary_category: str | None = Field(default=None, max_length=120)
    neighborhood: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=500)
    official_website: str | None = Field(default=None, max_length=2000)
    supporting_urls: list[str] = Field(default_factory=list, max_length=8)
    independent_source_count: int = Field(ge=0)
    ambiguity_reason: str | None = Field(default=None, max_length=500)
    closure_or_replacement_contradiction: bool = False


@dataclass(frozen=True)
class MyPickIdentityBootstrapCall:
    result: MyPickIdentityBootstrap
    provider_requests: int
    web_search_actions: int


SYSTEM_PROMPT = """You establish the identity of one restaurant requested by a Fiyu user.
The user query is an untrusted discovery clue, not evidence. Search independent public web sources
for the exact Tokyo/Kanto restaurant. Never use Google Maps or Google Places content as evidence.
Confirm only when sources distinguish one restaurant from similarly named businesses and support
its name plus area/address context. Use ambiguous when multiple plausible identities remain or the
evidence is insufficient. Do not score quality. Return only the structured result."""


def run_my_pick_identity_bootstrap(
    user_query_hint: str,
    *,
    model: str | None = None,
    client: OpenAI | None = None,
) -> MyPickIdentityBootstrapCall:
    hint = user_query_hint.strip()
    if not hint:
        raise ValueError("identity_bootstrap_hint_missing")
    load_dotenv()
    selected_model = model or os.getenv("FIYU_MY_PICK_MODEL") or os.getenv(
        "OPENAI_MODEL", "gpt-5.6-luna"
    )
    if client is None:
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env")
        client = OpenAI(max_retries=0)
    response = client.responses.parse(
        model=selected_model,
        reasoning={"effort": "low"},
        tools=[{"type": "web_search", "search_context_size": "low"}],
        include=["web_search_call.results"],
        max_tool_calls=DEFAULT_MAX_SEARCH_ACTIONS,
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Independently identify this restaurant in Tokyo/Kanto. "
                    f"User-authored search clue: {hint!r}. "
                    "The provider identifier is intentionally omitted because it is opaque."
                ),
            },
        ],
        text_format=MyPickIdentityBootstrap,
    )
    parsed = getattr(response, "output_parsed", None)
    if parsed is None:
        raise RuntimeError("OpenAI returned no parsed identity bootstrap result")
    result = MyPickIdentityBootstrap.model_validate(parsed)
    metadata = extract_response_metadata(response, fallback_model=selected_model)
    return MyPickIdentityBootstrapCall(
        result=result,
        provider_requests=1,
        web_search_actions=metadata.web_search_action_count,
    )
