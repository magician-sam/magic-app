# Third-party software notices

The original application and third-party components have separate rights. Nothing here assigns upstream copyrights to the application owner or grants rights to unrelated photos, music, branding or data.

Browser distribution notices are in public/third-party-notices.txt. Local font licences are in public/fonts. The map build retains Leaflet's licence and visible map attribution.

The verbatim files in licences/ restore notices omitted from the installed package folders for five server packages. upstream-notices.json records release-tag commit IDs, exact upstream paths and hashes; the files must travel with source/server distributions using those packages. Their upstream licence conditions remain applicable.

web-push3.6.7 is MPL-2.0; preserve its package licence and covered source when distribution obligations apply. Source: https://github.com/web-push-libs/web-push . It does not make independently written application files MPL by itself. Check final distribution against the licence.

The earlier notice gaps for is-node-process1.2.0 and promise-limit2.7.0 were resolved on 20 October 2026 by removing those registry implementations. Root npm overrides now install two independently written private application helpers from vendor/. Their own names are @magic-app/runtime-context and @magic-app/task-queue; they are not copies or relicensed upstream code. Pinned SDKs and a build-time check guard this substitution. See vendor/README.md and test/dependency-adapters.test.mjs. Old release archives remain private historical evidence, not current dependencies. A package licence declaration alone is not a complete legal clearance.

Native Electron/Chromium/Android distributions require their own component notices and final release review. Hosted map, mail and storage service terms are separate from software licences.
