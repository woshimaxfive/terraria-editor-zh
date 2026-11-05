# noble-hashes

@noble/hashes 2.4.0, MIT, copyright 2022 Paul Miller.
See noble-hashes-LICENSE.txt for the full license.

Upstream: https://github.com/paulmillr/noble-hashes
Pinned registry source: https://registry.npmjs.org/@noble/hashes/-/hashes-2.4.0.tgz
Registry integrity: sha512-X5XaVWZIBCT7HHZGm5I7ZQXDwLG+bGXuSrMQAW+7Zvl87h1kmc1ZB1VSRJcpUfoUrGQp4Fkoxm5kZ+Ms+aW+eA==

noble-sha256.js is a tree-shaken SHA-256 ESM bundle built with the existing esbuild
dependency from the integrity-verified published package. Only its published
SHA-256 implementation is used; the algorithm is not modified. The browser
adapter sends at most 64 KiB per update. World/history formats and expected
SHA-256 values are unchanged. No external runtime requests are required.
