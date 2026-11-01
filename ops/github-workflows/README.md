`ci.yml` and `collect.yml` now live in `.github/workflows/`.

`backup.yml` (nightly pg_dump to Cloudflare R2) stays here until the R2 bucket and its secrets
(`R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) exist — Phase 2 "Backup restore drill".
Then: `mv ops/github-workflows/backup.yml .github/workflows/`
