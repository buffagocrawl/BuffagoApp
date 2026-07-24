# Current-tree secret scan

`npm run security:scan` passed: 1,082 tracked files, zero high-confidence current-tree findings under the repository scanner.

Ignored sensitive files exist at expected local paths, including Crawl and Jalapeno environment files. Only names/status were inspected in this cycle. Ignore rules match them. No signing/service-account file is tracked.

Medium heuristic hits were code identifiers, typed parameters, fixtures, or Android accessibility metadata such as `password: false`; no value was promoted without validation.
