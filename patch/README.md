# patch/

Changes that belong to a pull request but could not be pushed with it, kept
here so they are not lost. Apply, then delete the file — this directory is
transient, not part of the layout.

## 0001-ci-node-version-matrix.patch

Widens the `build-and-test` matrix in `.github/workflows/ci.yml` from
`[24.x]` to `[20.x, 22.x, 24.x]`.

It belongs to the pull request that lowered `engines.node` to `>=20`. The
session that opened that pull request is refused write access to
`.github/workflows/`, over both git and the API, so the one-line change could
not travel with the rest of the branch.

It matters more than its size suggests. A matrix pinned to a single version is
what let the declared floor drift away from the tested one in the first place:
`engines` claimed 24 for no reason anyone could point at, and CI would not have
noticed had it claimed 20 all along. Until this lands, the floor rests on a
local Node 20.19.4 run rather than on CI.

Apply it either way:

```sh
git am patch/0001-ci-node-version-matrix.patch   # keeps the commit message
git apply patch/0001-ci-node-version-matrix.patch # working-tree change only
```

Both were checked against this branch.
