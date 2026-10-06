// OneDrive may expose the long-lived auth-flow file as a reparse point,
// which Playwright deliberately skips during discovery. This regular entry
// file imports the scenario so local and CI discovery stay identical.
import "./auth-flow.spec.ts";
