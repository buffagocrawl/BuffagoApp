# Jalapeno

Jalapeno is the Buffago Instagram agent. Phase 1 is only project setup, validation, and safe local simulation.

## Phase 1 Scope

- Python project setup
- YAML configuration loading
- Environment validation
- Dry-run logging
- Test mode simulation
- Production placeholder that is blocked safely
- Basic logging and test coverage

Phase 1 never publishes to Instagram.

## Setup

Use Python 3.12.

```powershell
cd Agents/Jalapeno
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Required `.env` Fields

Create `.env` from `.env.example`.

Phase 1 structural values:

- `FACEBOOK_PAGE_ID`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`

Only if you override the YAML timezone from the environment:

- `TIMEZONE`

Future Phase 2+ secrets are optional for Phase 1 and only trigger warnings when missing:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_SECRET`
- `META_LONG_LIVED_ACCESS_TOKEN`

Other values in `.env.example` are placeholders for later phases and are not required by the Phase 1 modes.

## Commands

Validate configuration and environment:

```powershell
python main.py --validate
```

Run a local dry-run:

```powershell
python main.py --dry-run
```

Run the fully simulated Phase 1 workflow:

```powershell
python main.py --test
```

Run the safe production placeholder:

```powershell
python main.py --production
```

Run the test suite on Windows:

```powershell
python -m pytest
```

## Behavior

- `--validate` loads `.env` and `config.yaml`, checks the Phase 0/1 structural values, and warns when future Phase 2+ secrets are missing.
- `--dry-run` loads without secrets, never calls external APIs, logs the intended schedule and target account IDs, and warns when future Phase 2+ secrets are missing.
- `--test` loads without secrets, never calls external APIs, simulates the full Phase 1 workflow, and warns when future Phase 2+ secrets are missing.
- `--production` is blocked for now, exits safely, and prints `Production mode is not implemented yet.`

On Windows, use `python -m pytest` instead of plain `pytest` so the test runner uses the active interpreter.

## Logging

Logs are written to `logs/jalapeno.log` and printed to the console.
Secrets are never logged.
