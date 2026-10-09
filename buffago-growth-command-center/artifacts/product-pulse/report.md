# Product Pulse implementation note

The earlier Product Pulse report has been superseded by the full dashboard redesign report at [`../redesign/report.md`](../redesign/report.md). Production already contains the older `buffago_product_pulse_operations()` helper; the new unapplied migration upgrades that helper call in place, filters mobile device metrics, adds calendar MAU and monthly history, and preserves the old snapshot contract.
