# Cayenne architecture

Serrano requests a suite. Cayenne validates prerequisites and safety, runs the Windows Android runtime, collects evidence, redacts it, validates contracts, and hands a review packet back. Serrano never infers runtime behavior from file existence or arbitrary logs.

`cayenne/contracts` contains the versioned handoff schemas. `cayenne/flows` contains Maestro flows. `cayenne/selectors` is the registry. `scripts/cayenne/run.ps1` is the operator entry point. The original `Agents/Cayenne` Python foundation remains available for compatibility and is not replaced.
