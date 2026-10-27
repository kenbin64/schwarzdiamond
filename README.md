# schwarzdiamond.com

The public site for the Schwarz Diamond Hardener: what it is for, the problems it solves through geometry rather than AI, measured results, and its limits.

The hardener itself is in private development and is not in this repository. This repository holds only the public page.

- `site/` is the page, served as plain files. The surface in the hero is drawn live in the browser from the Schwarz Diamond equation, `sin x sin y sin z + sin x cos y cos z + cos x sin y cos z + cos x cos y sin z = 0`.
- `wrangler.jsonc` publishes `site/` to Cloudflare.

Concept and direction: Kenneth W. Bingham. Built with the help of Claude AI under a standing directive to be skeptical, to insist on proof, and to allow no claim that is not demonstrated in tested code. The ideas are the author's; the AI implemented and verified them, it did not originate them.
