Peakflow-releases Repo Role

This repo is for customer-ready releases.

Rules:
- Only tested code belongs here.
- Do not use this repo for day-to-day development.
- Do not push experiments here.
- Build and test in the private dev repo first.
- Move code here only when you are ready to ship it.

Use this repo for:
- stable releases
- beta releases you are comfortable giving to customers
- release notes
- packaging and release assets

Do not use this repo for:
- scratch work
- half-finished features
- private experiments you may throw away

Quick checks before push:
- `git status`
- `git remote -v`
- ask: would I give this build to a customer today?
