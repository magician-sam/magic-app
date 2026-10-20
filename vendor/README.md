# Original application dependency adapters

These two small private modules are independently written application code, not
copies or relicensed forks of the upstream helpers. They replace the two npm
releases whose complete copyright/licence notices could not be verified.

Root npm overrides substitute `is-node-process` with `runtime-context`, and
`promise-limit` with `task-queue`. The original registry tarballs are no longer
installed. Keep this directory with the source for clean installs and host moves.

The consumer packages are pinned to @vercel/blob 2.8.0 and @libsql/client 0.18.0.
Before upgrading either, recheck the helper interfaces and integration tests.
The database adapter needs the callable limiter only, not promise-limit's map API.
Both CommonJS and ESM consumers are tested, as are browser bundling, Blob upload
requests and synthetic remote database operations. Other SDK licences still apply.

These modules follow the original application's ownership arrangements; they do
not put the application under MIT/ISC or grant a new public open-source licence.
