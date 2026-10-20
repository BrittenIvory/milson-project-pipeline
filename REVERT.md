# Reverting to the pre-rebuild baseline

The `pre-rebuild-baseline` tag marks main at `f8ead32` — the state that includes
PRs #38 and #39 (secure sessions and admin user management), before any rebuild
work began on `Sandbox`. The `backup/pre-rebuild` branch points at the same
commit as a second safety net.

## Restore main to the baseline

1. In GitHub → Branches, confirm `pre-rebuild-baseline` still points at
   `f8ead324d72abca207865b75eb7395dd23fc1720`.
2. Locally or via a maintainer with write access:
   ```bash
   git fetch origin pre-rebuild-baseline
   git checkout main
   git reset --hard pre-rebuild-baseline
   git push --force-with-lease origin main
   ```
   (If branch protection is enabled, have an admin temporarily allow the force
   push, or revert via `git revert` on a pull request instead.)
3. If only specific changes should be undone, open a PR that `git revert`s those
   commits instead of force-pushing — `pre-rebuild-baseline` is still there as
   the reference point.

## Discard the sandbox

1. Render dashboard → `milson-project-pipeline-sandbox` service → **Delete**.
2. Render dashboard → `milson-pipeline-sandbox-db` database → **Delete**.
3. Nothing else to remove: the sandbox uses local instance storage, so there is
   no sandbox S3 bucket or shared secret to clean up. Production's database,
   S3 bucket and environment variables were never touched by the sandbox.

## Discard the Sandbox branch itself

```bash
git push origin --delete Sandbox
git branch -D Sandbox
```

This does not affect `main`, the `pre-rebuild-baseline` tag, or
`backup/pre-rebuild`.
