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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jalapeno Instagram agent Phase 1 runner")
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
    validate_phase1_environment()
    warn_missing_future_secrets()
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
    logger.info("dry-run schedule | timezone=%s | buffago_post_time=%s | meme_post_time=%s", config.timezone, config.buffago_post_time, config.meme_post_time)
    logger.info("dry-run target accounts | facebook_page_id=%s | instagram_business_account_id=%s", config.facebook_page_id, config.instagram_business_account_id)
    logger.info("dry-run safety status | publishing blocked=%s | meta endpoints skipped=%s", True, True)
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
    for step in SIMULATION_STEPS:
        logger.info("test simulation step | step=%s", step)
    logger.info("test safety status | posting disabled=%s | meta api disabled=%s | image generation disabled=%s", True, True, True)
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
