#!/bin/sh
# Line coverage of the crate, held to 100%.
#
# `cargo llvm-cov --fail-under-lines` scores each function by its best single
# test binary, so a line reached only by the corpus binary and another only
# by the unit-test binary both count as missed. The lcov export merges the
# binaries; that merged view is the bar the TypeScript and Go ports meet, so
# it is the one checked here. Needs cargo-llvm-cov and the llvm-tools
# component.
set -e
cd "$(dirname "$0")"
cargo llvm-cov --all-features --lcov --output-path target/lcov.info
cargo llvm-cov report --summary-only
awk -F'[:,]' '
  /^SF:/ { f = $2 }
  /^DA:/ { n++; if ($3 == 0) { m++; print "uncovered " f ":" $2 } }
  END { printf "lines %d, uncovered %d\n", n, m; exit m > 0 }
' target/lcov.info
