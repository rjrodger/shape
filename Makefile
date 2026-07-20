.PHONY: all build test clean build-ts build-go test-ts test-go clean-ts clean-go publish publish-npm publish-go publish-dry publish-npm-dry publish-go-dry tags-npm tags-go reset

# Never run recipes concurrently: publish-npm and publish-go both mutate the
# worktree and index (bump, commit, tag, push), so `make -j publish` must serialize.
.NOTPARALLEL:

all: build test

build: build-ts build-go

test: test-ts test-go

clean: clean-ts clean-go

# TypeScript (package lives in ts/)
build-ts:
	cd ts && npm run build

test-ts:
	cd ts && npm test

clean-ts:
	rm -rf ts/dist ts/dist-test

# Go
build-go:
	cd go && go build ./...

test-go:
	cd go && go test -v ./...

clean-go:
	cd go && go clean

tags-npm:
	git tag -l 'ts/v*' --sort=-version:refname

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

# Publish both npm and Go with patch version bumps. Runs full build+test for
# both languages first so a failure in either aborts before any release has
# side effects (prevents releasing npm without go parity).
publish: build test publish-npm publish-go

# Publish npm package. Defaults to a patch bump on ts/package.json; override with V=x.y.z.
# Order: bump -> sync VERSION in ts/src/shape.ts -> commit -> tag locally -> npm publish
# -> push commit+tag -> gh release. npm publish runs before the git push so a failed
# publish leaves nothing public and a retry can succeed (the local commit/tag are still
# there for re-use).
publish-npm: build-ts test-ts
	@if [ -n "$(V)" ]; then \
		cd ts && npm version $(V) --no-git-tag-version --allow-same-version >/dev/null; \
	else \
		cd ts && npm version patch --no-git-tag-version >/dev/null; \
	fi
	cd ts && npm run version
	@V=$$(node -p "require('./ts/package.json').version"); \
		echo "Publishing ts/v$$V"; \
		git add ts/package.json ts/src/shape.ts && \
		git commit -m "ts: v$$V" && \
		git tag ts/v$$V && \
		(cd ts && npm publish --registry https://registry.npmjs.org --access=public) && \
		git push origin main ts/v$$V && \
		if command -v gh >/dev/null 2>&1; then gh release create ts/v$$V --title "ts/v$$V" --notes "npm package release v$$V"; fi

# Publish Go module. Defaults to a patch bump on the Version const in go/shape.go; override with V=x.y.z.
publish-go: test-go
	@V=$${V:-$$(awk -F\" '/^const Version = "/{split($$2,a,"."); printf "%d.%d.%d", a[1], a[2], a[3]+1}' go/shape.go)}; \
		test -n "$$V" || (echo "Cannot derive next version; use: make publish-go V=x.y.z" && exit 1); \
		echo "Publishing go/v$$V"; \
		sed -i '' 's/^const Version = ".*"/const Version = "'$$V'"/' go/shape.go && \
		git add go/shape.go && \
		git commit -m "go: v$$V" && \
		git tag go/v$$V && \
		git push origin main go/v$$V && \
		if command -v gh >/dev/null 2>&1; then gh release create go/v$$V --title "go/v$$V" --notes "Go module release v$$V"; fi

# Dry-run: build + test + `npm pack --dry-run`, and print the git/tag/gh commands
# that publish would run. Does not commit, tag, push, or publish. Accepts V=x.y.z
# to preview a specific version (defaults to a patch bump).
# Note: the build-ts / test-ts / test-go prerequisites may regenerate tracked
# ts/dist artifacts if sources have changed since the last build — that is the
# same rebuild publish itself would do.
publish-dry: publish-npm-dry publish-go-dry

publish-npm-dry: build-ts test-ts
	@V=$${V:-$$(node -p "const v=require('./ts/package.json').version.split('.'); v[2]=+v[2]+1; v.join('.')")}; \
		echo "[dry-run] Would bump ts/package.json to v$$V"; \
		echo "[dry-run] Would git commit -m 'ts: v$$V'"; \
		echo "[dry-run] Would git tag ts/v$$V"; \
		echo "[dry-run] Would npm publish (see tarball below)"; \
		echo "[dry-run] Would git push origin main ts/v$$V"; \
		echo "[dry-run] Tarball contents (npm pack --dry-run):"; \
		(cd ts && npm pack --dry-run); \
		echo "[dry-run] Would gh release create ts/v$$V"

publish-go-dry: test-go
	@V=$${V:-$$(awk -F\" '/^const Version = "/{split($$2,a,"."); printf "%d.%d.%d", a[1], a[2], a[3]+1}' go/shape.go)}; \
		test -n "$$V" || (echo "Cannot derive next version from go/shape.go Version const" && exit 1); \
		echo "[dry-run] Would rewrite go/shape.go Version const to $$V"; \
		echo "[dry-run] Would git commit -m 'go: v$$V'"; \
		echo "[dry-run] Would git tag go/v$$V"; \
		echo "[dry-run] Would git push origin main go/v$$V"; \
		echo "[dry-run] Would gh release create go/v$$V"

reset:
	cd ts && npm run reset
	cd go && go clean -cache
	cd go && go build ./...
	cd go && go test -v ./...
