# Serrano integration

Use `serrano run-runtime-validation --request <json>` to invoke Cayenne and `serrano ingest-runtime-result --result <json>`
to normalize evidence into an explicit decision. Decisions include approval, required changes, insufficient evidence,
and infrastructure failure. Feature-to-journey selection is version-controlled in `Agents/Cayenne/cayenne/serrano.py`.

