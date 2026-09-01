// Stands in for Node's `util` in the browser bundle: shape.ts only reads
// `inspect.custom`, and guards against its absence.
module.exports = { inspect: undefined }
