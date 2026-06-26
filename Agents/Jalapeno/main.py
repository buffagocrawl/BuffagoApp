from __future__ import annotations

import argparse
import sys

from config import (
    CONFIG_FILE,
    ConfigError,
    ENV_FILE,
    SIMULATION_STEPS,
    get_mode_plan,
    initialize_logging,
    load_configuration,
    load_env_file,
    log_mode_plan,
    log_startup_state,
    validate_phase1_environment,
    warn_missing_future_secrets,
)
from logging_utils import log_event
from validation import validate_phase2_environment


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jalapeno Instagram agent Phase 2 foundation runner")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--validate", action="store_true", help="Validate env and config without external calls")
    mode_group.add_argument("--dry-run", action="store_true", help="Log the planned work without publishing")
    mode_group.add_argument("--test", action="store_true", help="Run the fully simulated Phase 1 workflow")
    mode_group.add_argument("--production", action="store_true", help="Safe production placeholder")
    return parser


def run_validate() -> int:
    print(f"Loading env file: {ENV_FILE}")
    env_loaded = load_env_file()
    print(f"Env loaded: {env_loaded}")
    config = load_configuration()
    logger = initialize_logging(config)
    validate_phase1_environment()
    validate_phase2_environment(config, logger=logger)
    warn_missing_future_secrets(logger)
    print(f"Config loaded: {CONFIG_FILE}")
    print("Validation succeeded")
    print(f"Mode: {config.default_mode}")
    return 0


def run_dry_run() -> int:
    env_loaded = load_env_file()
    config = load_configuration()
    validate_phase1_environment()
    logger = initialize_logging(config)
    plan = get_mode_plan("dry-run")

    log_startup_state(logger, config, plan.name, env_loaded)
    log_mode_plan(logger, plan)
    warn_missing_future_secrets(logger)
    log_event(logger, "dry_run_schedule_loaded", timezone=config.timezone, buffago_post_time=config.buffago_post_time, meme_post_time=config.meme_post_time)
    log_event(
        logger,
        "dry_run_targets_loaded",
        facebook_page_id_present=bool(config.facebook_page_id),
        instagram_business_account_id_present=bool(config.instagram_business_account_id),
    )
    log_event(
        logger,
        "run_completed",
        agent_name=config.agent_name,
        stage="run",
        status="skipped",
        dry_run=True,
        posting_blocked=True,
        meta_endpoints_skipped=True,
    )
    return 0


def run_test_mode() -> int:
    env_loaded = load_env_file()
    config = load_configuration()
    validate_phase1_environment()
    logger = initialize_logging(config)
    plan = get_mode_plan("test")

    log_startup_state(logger, config, plan.name, env_loaded)
    log_mode_plan(logger, plan)
    warn_missing_future_secrets(logger)
    log_event(logger, "candidate_generation_started", stage="candidate_generation", status="simulated", dry_run=True)
    for step in SIMULATION_STEPS:
        logger.info("test simulation step | step=%s", step)
    log_event(
        logger,
        "candidate_generation_completed",
        stage="candidate_generation",
        status="simulated",
        dry_run=True,
    )
    log_event(
        logger,
        "run_completed",
        agent_name=config.agent_name,
        stage="run",
        status="completed",
        dry_run=True,
        posting_disabled=True,
        meta_api_disabled=True,
        image_generation_disabled=True,
    )
    return 0


def run_production_placeholder() -> int:
    load_env_file()
    warn_missing_future_secrets()
    print("Production mode is not implemented yet.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.validate:
            return run_validate()
        if args.dry_run:
            return run_dry_run()
        if args.test:
            return run_test_mode()
        if args.production:
            return run_production_placeholder()
        parser.error("one mode must be selected")
    except ConfigError as exc:
        print(f"Validation failed: {exc}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
