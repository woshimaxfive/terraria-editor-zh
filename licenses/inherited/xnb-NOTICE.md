# xnb

Registry version: 1.3.0-a (distributed package.json writes 1.3.0a).
Author: Lybell, based on LeonBlade/XnbCli; upstream credits are preserved in the bundled source.
License: LGPL-3.0-or-later; see xnb-LICENSE.txt and xnb-GPL-3.0.txt.
Module: xnb.module.js, unmodified. It remains a separately replaceable ES module.
Corresponding source and build scripts: xnb-source.zip. Build using upstream npm scripts and lockfile. The source archive dist matches the registry module after CRLF/LF normalization.
Source: https://github.com/lybell-art/xnb-js/tree/3249d8059364d830f91031280b3c8fc8ae4cc5bb
Registry: https://registry.npmjs.org/xnb/1.3.0-a

The TextureReader integration in ../render-texture-worker.js retains original premultiplied RGBA instead of the library PNG-export unpremultiplication. This integration source is provided under LGPL-3.0-or-later. Game textures are not included.
