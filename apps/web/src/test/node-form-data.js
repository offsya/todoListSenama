// Requests in tests go through Node's fetch, which cannot send jsdom's FormData and File: the
// upload arrives empty. Use Node's own classes instead, as a browser uses its own. Plain JS:
// the app's TypeScript config has no Node types.
import { File } from 'node:buffer';

/* global Response */

const urlEncoded = new Response('', {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});
globalThis.FormData = (await urlEncoded.formData()).constructor;
globalThis.File = File;
