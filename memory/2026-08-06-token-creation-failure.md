# Token Creation Failure

- Symptom: the self-service Token form returned "创建失败" for valid model selections.
- Root cause: `monthlySpendPeriod` was required by the API key schema but defaulted to an empty string, which Mongoose treats as missing for a required string.
- Fix: generate the current Asia/Shanghai billing month through a shared `currentPeriod` helper and use it as the schema default.
- Evidence: production logs reported `ApiKey validation failed: monthlySpendPeriod: Path monthlySpendPeriod is required`; type checking, production build, and a Shanghai month-boundary assertion pass.
- Regression coverage: the month-boundary assertion verifies `2026-08-31T16:30:00.000Z` resolves to `2026-09`, and the production build validates the schema integration.
