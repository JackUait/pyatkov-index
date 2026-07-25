// The lazy chunk's entry point, and the reason it is a file at all.
//
// arrival.ts loads this on idle rather than importing 'motion' directly.
// Dynamically importing a package entry defeats tree-shaking — the bundler has
// to keep every export, because it cannot know which ones the importer will
// reach for — and that costs about twice the bytes. Re-exporting the two names
// this site actually uses gives the bundler a boundary it can shake against,
// while still keeping every one of those bytes off the first paint.
export { animate, spring } from 'motion';
