All workflows live in `.github/workflows/`: `ci.yml`, `collect.yml`, `backup.yml`.
`backup.yml` skips with a warning until the Cloudflare R2 secrets exist
(`R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
