# Serrano integration

`run.ps1 -SerranoReview` emits a Cayenne request, result, and Serrano response in the same run directory. Serrano dispositions are exactly `APPROVE`, `REJECT`, `INSUFFICIENT_EVIDENCE`, or `BLOCKED`. A pass requires acceptance-criteria coverage, required artifacts, safety approval, and validated redaction. OAuth, remote notification delivery, missing QA credentials, and unavailable devices are blockers rather than product defects.
