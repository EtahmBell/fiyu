from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .public_catalog import (
    ensure_public_schema,
    export_public_csv,
    list_public_restaurants,
    list_review_candidates,
    recalculate_from_stored_evidence,
    seed_public_queue,
    set_publication_status,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fiyu public catalog and research commands")
    parser.add_argument("--db", default="data/fiyu.db", help="SQLite database path")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init", help="Create the public_restaurants table")

    seed = subparsers.add_parser("seed", help="Seed the research queue from candidates")
    seed.add_argument("--limit", type=int, default=50)
    seed.add_argument("--min-score", type=float, default=60.0)
    seed.add_argument("--simple-rule-only", action="store_true")

    research = subparsers.add_parser("research", help="Research queued candidates with OpenAI")
    research.add_argument("--limit", type=int, default=10)
    research.add_argument("--model", default=None)
    research.add_argument("--retry-failed", action="store_true")

    localize = subparsers.add_parser(
        "localize-content", help="Localize stored restaurant names and descriptions"
    )
    localize.add_argument("--limit", type=int, default=20)
    localize.add_argument("--place-id")
    localize.add_argument("--force", action="store_true")
    localize.add_argument("--dry-run", action="store_true")
    localize.add_argument("--model", default=None)

    descriptions = subparsers.add_parser(
        "research-descriptions",
        help="Generate grounded English card descriptions from stored research",
    )
    descriptions.add_argument("--place-id")
    descriptions.add_argument("--limit", type=int, default=10)
    descriptions.add_argument("--plan-only", action="store_true")
    descriptions.add_argument("--dry-run", action="store_true")
    descriptions.add_argument(
        "--refresh-existing",
        "--force",
        dest="refresh_existing",
        action="store_true",
        help="Intentionally refresh rows that already have description_en",
    )
    descriptions.add_argument("--output-report", required=True)
    descriptions.add_argument(
        "--max-search-actions",
        type=int,
        choices=(0, 1, 2),
        default=1,
        help="Bounded web-search fallback actions per restaurant (default: 1)",
    )
    descriptions.add_argument("--model", default=None)

    location_review = subparsers.add_parser(
        "export-location-review", help="Export published restaurants for location review"
    )
    location_review.add_argument("--output", required=True)
    location_review.add_argument("--limit", type=int, default=20)
    location_review.add_argument("--status")

    verified = subparsers.add_parser(
        "import-verified-locations", help="Validate and import reviewed restaurant locations"
    )
    verified.add_argument("--input", required=True)
    verified.add_argument("--dry-run", action="store_true")

    subparsers.add_parser("location-status", help="Report restaurant and anchor verification status")

    discover_addresses = subparsers.add_parser(
        "discover-addresses", help="Research independent public address evidence"
    )
    discover_addresses.add_argument("--limit", type=int, default=10)
    discover_addresses.add_argument("--place-id")
    mode = discover_addresses.add_mutually_exclusive_group()
    mode.add_argument("--plan-only", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    discover_addresses.add_argument("--force", action="store_true")
    discover_addresses.add_argument("--output-report")
    discover_addresses.add_argument(
        "--resolution-report",
        help="Read detailed OSM resolution reasons from a reviewed JSON report",
    )
    discover_addresses.add_argument(
        "--web-action-budget", "--max-search-actions", dest="max_search_actions",
        type=int, default=4,
        help=(
            "Requested Responses API max_tool_calls per restaurant. If the provider returns more "
            "web actions, the backend rejects acceptance and stops the batch."
        ),
    )
    discover_addresses.add_argument("--max-retained-sources", type=int, default=4)
    discover_addresses.add_argument("--max-evidence-summary-chars", type=int, default=160)
    discover_addresses.add_argument("--max-conflicting-candidates", type=int, default=3)
    discover_addresses.add_argument("--max-output-tokens", type=int, default=4000)
    discover_addresses.add_argument(
        "--compact-research", action=argparse.BooleanOptionalAction, default=True
    )
    discover_addresses.add_argument(
        "--retry-truncated", action="store_true",
        help="Retry one truncated response with a deterministic larger output budget",
    )
    discover_addresses.add_argument("--model", default=None)

    recalculate_addresses = subparsers.add_parser(
        "recalculate-address-decisions",
        help="Re-evaluate saved address evidence without network calls",
    )
    recalculate_selection = recalculate_addresses.add_mutually_exclusive_group(required=True)
    recalculate_selection.add_argument("--place-id")
    recalculate_selection.add_argument("--all", action="store_true", dest="all_records")
    recalculate_addresses.add_argument("--dry-run", action="store_true")
    recalculate_addresses.add_argument(
        "--mvp-policy", action="store_true",
        help="Use the current optimistic MVP policy (currently the default)",
    )

    geocoding_inputs = subparsers.add_parser(
        "export-geocoding-inputs",
        help="Export verified and provisional core addresses for independent geocoding",
    )
    geocoding_inputs.add_argument("--output", required=True)
    geocoding_inputs.add_argument("--limit", type=int, default=100)
    geocoding_inputs.add_argument("--place-id")

    geocode_file = subparsers.add_parser(
        "geocode-address-file", help="Geocode an exported address file with a local provider"
    )
    geocode_file.add_argument("--input", required=True)
    geocode_file.add_argument("--output", required=True)
    geocode_file.add_argument(
        "--provider", choices=("local-osm-addresses", "digital-agency-abr"), required=True
    )
    geocode_file.add_argument("--osm-index")
    geocode_file.add_argument("--abr-data-dir")
    geocode_file.add_argument("--abr-command", default="abrg")
    geocode_file.add_argument("--provider-version", default="2.3.0")
    geocode_file.add_argument("--place-id")
    geocode_file.add_argument("--limit", type=int)
    geocode_file.add_argument("--dry-run", action="store_true")
    geocode_file.add_argument(
        "--include-candidates", action="store_true",
        help="Include component-level OSM candidate diagnostics",
    )
    geocode_file.add_argument(
        "--diagnostic-limit", type=int, default=10,
        help="Maximum OSM candidates per address in diagnostics (default: 10)",
    )
    geocode_file.add_argument(
        "--allow-area-fallback", action="store_true",
        help="Allow exact matching OSM block, chome, or neighborhood polygons",
    )
    geocode_file.add_argument(
        "--minimum-area-precision",
        choices=("block", "chome", "neighborhood"),
        default="neighborhood",
        help="Coarsest area fallback allowed (default: neighborhood)",
    )

    replace_location_parser = subparsers.add_parser(
        "replace-location", help="Replace or remove a map location with append-only history"
    )
    replace_location_parser.add_argument("--place-id", required=True)
    replace_location_parser.add_argument("--latitude", type=float)
    replace_location_parser.add_argument("--longitude", type=float)
    replace_location_parser.add_argument("--source-reference", required=True)
    replace_location_parser.add_argument("--reason", required=True)
    replace_location_parser.add_argument("--reviewed-by", required=True)
    replace_location_parser.add_argument("--reviewed-at", required=True)
    replace_location_parser.add_argument("--remove", action="store_true")
    replace_location_parser.add_argument("--allow-manual-override", action="store_true")
    replace_location_parser.add_argument("--dry-run", action="store_true")

    address_review = subparsers.add_parser(
        "export-address-review", help="Export unresolved address evidence for review"
    )
    address_review.add_argument("--output", required=True)
    address_review.add_argument("--limit", type=int, default=100)

    address_import = subparsers.add_parser(
        "import-address-review", help="Validate and import reviewed address decisions"
    )
    address_import.add_argument("--input", required=True)
    address_import.add_argument("--dry-run", action="store_true")

    geocode_addresses = subparsers.add_parser(
        "geocode-verified-addresses",
        help="Validate offline independent geocoder results for verified addresses",
    )
    geocode_addresses.add_argument("--results", required=True)
    geocode_addresses.add_argument("--limit", type=int, default=10)
    geocode_addresses.add_argument("--place-id")
    geocode_addresses.add_argument("--dry-run", action="store_true")

    subparsers.add_parser(
        "address-resolution-status", help="Report address research, usage, and geocoding status"
    )

    osm_index = subparsers.add_parser("build-osm-index", help="Build a local OSM location index")
    osm_index.add_argument("--pbf", required=True)
    osm_index.add_argument("--output", required=True)
    osm_index.add_argument(
        "--max-suspicious-rate", type=float, default=0.001,
        help="Hard-fail above this likely-mojibake object rate (default: 0.001)",
    )
    osm_index.add_argument(
        "--diagnostic-detail-limit", type=int, default=50,
        help="Maximum suspicious values included in the encoding report (default: 50)",
    )

    resolve_osm = subparsers.add_parser(
        "resolve-osm-locations", help="Resolve public restaurants against a local OSM index"
    )
    resolve_osm.add_argument("--osm-index", required=True)
    resolve_osm.add_argument("--limit", type=int, default=50)
    resolve_osm.add_argument("--place-id")
    resolve_osm.add_argument("--published-only", action=argparse.BooleanOptionalAction, default=True)
    resolve_osm.add_argument("--force", action="store_true")
    resolve_osm.add_argument("--dry-run", action="store_true")
    resolve_osm.add_argument("--output-report")
    resolve_osm.add_argument("--threshold", type=float, default=80.0)
    resolve_osm.add_argument("--runner-up-margin", type=float, default=20.0)
    resolve_osm.add_argument("--anchor-radius-km", type=float, default=3.0)

    osm_review = subparsers.add_parser(
        "import-location-review", help="Import reviewed OSM candidate decisions"
    )
    osm_review.add_argument("--input", required=True)
    osm_review.add_argument("--dry-run", action="store_true")

    anchor_resolve = subparsers.add_parser(
        "resolve-osm-anchors", help="Propose area-anchor matches from the local OSM index"
    )
    anchor_resolve.add_argument("--osm-index", required=True)
    anchor_resolve.add_argument(
        "--anchors", default=str(Path(__file__).with_name("location_anchors.json"))
    )
    anchor_resolve.add_argument("--output", required=True)

    audit_discovery = subparsers.add_parser(
        "audit-discovery-areas", help="Audit original area CSV provenance"
    )
    audit_discovery.add_argument("--source-dir", default="data")
    audit_discovery.add_argument("--public-csv", default="data/processed/public_restaurants.csv")
    audit_discovery.add_argument("--manifest")
    audit_discovery.add_argument("--report")

    enrich_discovery = subparsers.add_parser(
        "enrich-discovery-areas", help="Generate a discovery-area enriched public CSV"
    )
    enrich_discovery.add_argument("--source-dir", default="data")
    enrich_discovery.add_argument("--input", default="data/processed/public_restaurants.csv")
    enrich_discovery.add_argument(
        "--output", default="data/processed/public_restaurants_enriched.csv"
    )
    enrich_discovery.add_argument("--manifest")
    enrich_discovery.add_argument("--report")

    import_discovery = subparsers.add_parser(
        "import-discovery-areas", help="Import only discovery provenance fields"
    )
    import_discovery.add_argument("--input", required=True)
    import_discovery.add_argument("--dry-run", action="store_true")
    import_discovery.add_argument("--report")

    subparsers.add_parser("recalculate", help="Recalculate scores from stored evidence")

    show = subparsers.add_parser("list", help="Print catalog rows as JSON")
    show.add_argument("--limit", type=int, default=20)
    show.add_argument("--published-only", action="store_true")

    export = subparsers.add_parser("export", help="Export a spreadsheet-friendly CSV")
    export.add_argument("--output", default="data/processed/public_restaurants.csv")
    export.add_argument("--published-only", action="store_true")

    for command in ("publish", "unpublish"):
        publication = subparsers.add_parser(command, help=f"Manually {command} a restaurant")
        publication.add_argument("--place-id", required=True)

    review = subparsers.add_parser("review", help="Show rows awaiting a manual publication decision")
    review.add_argument("--limit", type=int, default=20)
    return parser


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = _parser().parse_args()
    db_path = Path(args.db)

    if args.command == "init":
        ensure_public_schema(db_path)
        print(json.dumps({"status": "ok", "table": "public_restaurants"}, indent=2))
    elif args.command == "seed":
        count = seed_public_queue(
            db_path,
            limit=args.limit,
            min_internal_score=args.min_score,
            simple_rule_only=args.simple_rule_only,
        )
        print(json.dumps({"seeded": count}, indent=2))
    elif args.command == "research":
        from .research_worker import run_research_batch

        result = run_research_batch(
            db_path,
            limit=args.limit,
            model=args.model,
            retry_failed=args.retry_failed,
        )
        print(json.dumps(result, indent=2))
    elif args.command == "recalculate":
        print(json.dumps({"recalculated": recalculate_from_stored_evidence(db_path)}, indent=2))
    elif args.command == "localize-content":
        from .localization_worker import run_localization_batch

        result = run_localization_batch(
            db_path,
            limit=args.limit,
            place_id=args.place_id,
            force=args.force,
            dry_run=args.dry_run,
            model=args.model,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "research-descriptions":
        from .description_research import run_description_research

        result = run_description_research(
            db_path,
            place_id=args.place_id,
            limit=args.limit,
            plan_only=args.plan_only,
            dry_run=args.dry_run,
            refresh_existing=args.refresh_existing,
            output_report=args.output_report,
            max_search_actions=args.max_search_actions,
            model=args.model,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "export-location-review":
        if args.status:
            from .osm_review import export_osm_location_review

            count = export_osm_location_review(
                db_path, args.output, status=args.status, limit=args.limit
            )
        else:
            from .location_verification import export_location_review

            count = export_location_review(db_path, args.output, limit=args.limit)
        print(json.dumps({"exported": count, "path": args.output}, indent=2))
    elif args.command == "import-verified-locations":
        from .location_verification import import_verified_locations

        result = import_verified_locations(db_path, args.input, dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["validation_failures"]:
            raise SystemExit(2)
    elif args.command == "location-status":
        from .location_verification import location_status

        print(json.dumps(location_status(db_path), indent=2))
    elif args.command == "discover-addresses":
        from .address_research import run_address_discovery

        if not args.plan_only:
            if not args.dry_run:
                ensure_public_schema(db_path)
            preflight = run_address_discovery(
                db_path,
                limit=args.limit,
                place_id=args.place_id,
                plan_only=True,
                force=args.force,
                resolution_report=args.resolution_report,
                max_search_actions=args.max_search_actions,
                max_retained_sources=args.max_retained_sources,
                max_evidence_summary_chars=args.max_evidence_summary_chars,
                max_conflicting_candidates=args.max_conflicting_candidates,
                max_output_tokens=args.max_output_tokens,
                compact_research=args.compact_research,
                retry_truncated=args.retry_truncated,
                model=args.model,
            )
            print(
                json.dumps(
                    {
                        "preflight": {
                            key: preflight[key]
                            for key in (
                                "eligible_restaurant_count",
                                "requested_limit",
                                "maximum_responses_requests",
                                "maximum_web_search_actions",
                                "max_search_actions_per_restaurant",
                                "skipped_records",
                            )
                        }
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        result = run_address_discovery(
            db_path,
            limit=args.limit,
            place_id=args.place_id,
            plan_only=args.plan_only,
            dry_run=args.dry_run,
            force=args.force,
            output_report=args.output_report,
            resolution_report=args.resolution_report,
            max_search_actions=args.max_search_actions,
            max_retained_sources=args.max_retained_sources,
            max_evidence_summary_chars=args.max_evidence_summary_chars,
            max_conflicting_candidates=args.max_conflicting_candidates,
            max_output_tokens=args.max_output_tokens,
            compact_research=args.compact_research,
            retry_truncated=args.retry_truncated,
            model=args.model,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "recalculate-address-decisions":
        from .address_research import recalculate_address_decisions

        result = recalculate_address_decisions(
            db_path,
            place_id=args.place_id,
            all_records=args.all_records,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "export-geocoding-inputs":
        from .address_geocoding import export_geocoding_inputs

        count = export_geocoding_inputs(
            db_path, args.output, limit=args.limit, place_id=args.place_id
        )
        print(json.dumps({"exported": count, "path": args.output}, indent=2))
    elif args.command == "geocode-address-file":
        from .address_geocoder import DigitalAgencyAbrGeocoder, LocalOSMAddressGeocoder
        from .address_geocoding import geocode_address_file

        if args.provider == "local-osm-addresses":
            if not args.osm_index:
                raise SystemExit("--osm-index is required for --provider local-osm-addresses")
            geocoder = LocalOSMAddressGeocoder(
                args.osm_index,
                include_candidates=args.include_candidates,
                diagnostic_limit=args.diagnostic_limit,
                allow_area_fallback=args.allow_area_fallback,
                minimum_area_precision=args.minimum_area_precision,
            )
        else:
            if not args.abr_data_dir:
                raise SystemExit("--abr-data-dir is required for --provider digital-agency-abr")
            geocoder = DigitalAgencyAbrGeocoder(
                executable=args.abr_command,
                data_dir=args.abr_data_dir,
                provider_version=args.provider_version,
            )
        result = geocode_address_file(
            args.input, args.output, geocoder=geocoder, place_id=args.place_id,
            limit=args.limit, dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "replace-location":
        from .location_corrections import replace_location

        result = replace_location(
            db_path, place_id=args.place_id, latitude=args.latitude,
            longitude=args.longitude, source_reference=args.source_reference,
            reason=args.reason, reviewed_by=args.reviewed_by,
            reviewed_at=args.reviewed_at, remove=args.remove,
            allow_manual_override=args.allow_manual_override, dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result["valid"]:
            raise SystemExit(2)
    elif args.command == "export-address-review":
        from .address_review import export_address_review

        count = export_address_review(db_path, args.output, limit=args.limit)
        print(json.dumps({"exported": count, "path": args.output}, indent=2))
    elif args.command == "import-address-review":
        from .address_review import import_address_review

        result = import_address_review(db_path, args.input, dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["validation_failures"]:
            raise SystemExit(2)
    elif args.command == "geocode-verified-addresses":
        from .address_geocoder import JsonFileAddressGeocoder
        from .address_geocoding import geocode_verified_addresses

        result = geocode_verified_addresses(
            db_path,
            geocoder=JsonFileAddressGeocoder(args.results),
            limit=args.limit,
            place_id=args.place_id,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "address-resolution-status":
        from .address_research import address_resolution_status

        print(json.dumps(address_resolution_status(db_path), ensure_ascii=False, indent=2))
    elif args.command == "build-osm-index":
        from .osm_index import OSMEncodingValidationError, build_osm_index

        try:
            result = build_osm_index(
                args.pbf,
                args.output,
                max_suspicious_rate=args.max_suspicious_rate,
                diagnostic_detail_limit=args.diagnostic_detail_limit,
            )
        except OSMEncodingValidationError as exc:
            print(json.dumps(exc.report, ensure_ascii=False, indent=2))
            raise SystemExit(2) from exc
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "resolve-osm-locations":
        from .osm_resolver import resolve_osm_locations

        result = resolve_osm_locations(
            db_path, args.osm_index, limit=args.limit, place_id=args.place_id,
            published_only=args.published_only, force=args.force, dry_run=args.dry_run,
            output_report=args.output_report, threshold=args.threshold,
            runner_up_margin=args.runner_up_margin, anchor_radius_km=args.anchor_radius_km,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "import-location-review":
        from .osm_review import import_osm_location_review

        result = import_osm_location_review(db_path, args.input, dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["validation_failures"]:
            raise SystemExit(2)
    elif args.command == "resolve-osm-anchors":
        from .osm_anchors import resolve_osm_anchors

        result = resolve_osm_anchors(args.osm_index, args.anchors, args.output)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "audit-discovery-areas":
        from .discovery_areas import MANIFEST_PATH, audit_discovery_areas

        result = audit_discovery_areas(
            args.source_dir,
            args.public_csv,
            manifest_path=args.manifest or MANIFEST_PATH,
            report_path=args.report,
        )
        display = result
        if args.report:
            display = {
                "source_files": len(result["source_files"]),
                "source_rows": result["source_rows"],
                "unique_source_place_ids": result["unique_source_place_ids"],
                "multi_area_place_ids": len(result["multi_area_place_ids"]),
                "public_rows": result["public_rows"],
                "public_not_in_sources": len(result["public_not_in_sources"]),
                "source_place_ids_not_in_public": len(
                    result["source_place_ids_not_in_public"]
                ),
                "report": args.report,
            }
        print(json.dumps(display, ensure_ascii=False, indent=2))
    elif args.command == "enrich-discovery-areas":
        from .discovery_areas import MANIFEST_PATH, generate_enriched_public_csv

        result = generate_enriched_public_csv(
            args.source_dir,
            args.input,
            args.output,
            manifest_path=args.manifest or MANIFEST_PATH,
            report_path=args.report,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == "import-discovery-areas":
        from .discovery_areas import import_discovery_areas

        result = import_discovery_areas(
            db_path, args.input, dry_run=args.dry_run, report_path=args.report
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["validation_failures"]:
            raise SystemExit(2)
    elif args.command == "list":
        print(
            json.dumps(
                list_public_restaurants(
                    db_path,
                    published_only=args.published_only,
                    limit=args.limit,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
    elif args.command == "export":
        count = export_public_csv(
            db_path,
            args.output,
            published_only=args.published_only,
        )
        print(json.dumps({"exported": count, "path": args.output}, indent=2))
    elif args.command in ("publish", "unpublish"):
        try:
            set_publication_status(
                db_path, args.place_id, published=args.command == "publish"
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        print(json.dumps({"place_id": args.place_id, "is_published": args.command == "publish"}))
    elif args.command == "review":
        print(json.dumps(list_review_candidates(db_path, limit=args.limit), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
