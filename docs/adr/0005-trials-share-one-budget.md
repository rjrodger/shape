# 0005—Trials share one budget per validation

- **Status:** Accepted
- **Date:** 2026-11-12
- **Applies to:** `Nof`, `When` and `Contains` in `ts/src/shape.ts`, `go/` and
  `rs/`, and the `trials` option

## Context

`Nof`, `When` and `Contains` decide by trial: each tries a shape on a copy of
the value and keeps only the verdict. A `Nof` tries its branches, a `When`
its condition, a `Contains` the items of an array. A trial can hold trials of
its own, so their number multiplies with nesting. A `Nof(1, a, b)` whose
branches refer back to it through `Refer` tries both branches at every level,
and a value nested thirty levels deep then takes a billion trials. Shape
validates input from outside the program, synchronously and with no deadline,
so such a value would stop the caller.

Before `When` and `Contains`, only `Nof` tried anything, and nothing counted
its trials.

## Decision

**A validation may run a fixed number of trials, 100,000 by default. Every
trial takes one, and a validation within another counts against the same
budget. Past it, the validation fails with one error, and that error is the
only one.**

- The `trials` option sets the budget: `trials` in TypeScript, `Trials` in Go
  and `trials` in Rust. Anything but a whole number of one or more is the
  default.
- A trial is one branch `Nof` tries, one `When` condition, or one item
  `Contains` counts. A composition's branch, a `Discriminated` branch and the
  shape `When` picks are validations within the first, and share its budget;
  they are not trials themselves.
- The first trial the budget refuses records the error, at the value of the
  `Nof`, `When` or `Contains` that asked:
  `Value "[1,2]" for property "v" needs more trials than the budget of 1.`
  Every later trial refuses too.
- When the validation ends, that error replaces every other. A refused trial
  reads as a branch that does not match, which can turn a verdict either way:
  inside `Nof(0, …)` it makes a failing value pass. No verdict reached after
  the budget ran out can be trusted, so none is reported.

Caching verdicts would make some recursive shapes cheap again.
It needs a key for a value that stays right while validation fills defaults
in, and is left for when a shape needs it.

## Consequences

- A validation that ran fewer than 100,000 trials is unchanged. One that ran
  more fails, where it used to finish however long it took.
- Each call has a budget of its own: a context passed to several calls does
  not carry spent trials from one to the next.
- The three languages count the same trials in the same order, so a budget
  runs out at the same place in each, with the same error.
- A budget is per call, not per shape: a shape with a large budget, used as a
  branch of one with a small budget, runs within the small one.
