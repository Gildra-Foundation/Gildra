# Voidspire planner decorative materials

Original decorative game-style assets generated with the built-in image_gen.imagegen tool, each in a separate call with transparent_background:true. These are original interface decorations, not official Blizzard art. No official NPC portraits, ability icons, navigational raid maps or encounter data were generated. The rolled-map glyph and arena miniature are decorative object illustrations, not navigational or encounter maps.

Native alpha is genuine and preserved. Sharp only trims transparent exterior, proportionally resizes, adds transparent padding and encodes WebP. No retouching, recolouring, background removal or alpha repair was performed. Native PNGs and full prompts remain outside the web bundle. The selected panel is panel-heavy.png, without a central crest; earlier candidates are retained outside public and unused.

The deliberately thick bevels and broad crystal/metal ornaments follow the owner’s requested substantial Warcraft material style. Text, numbers, button semantics and labels remain live HTML; raster object illustrations are decorative. Plaque/panel use the measured nine-slice geometry; card, medallion and object glyphs preserve aspect ratio and use contain.

Full measured geometry, text windows, alpha checks and SHA-256 values are in manifest.json. External reproducible packer: /home/debian/gildra-voidspire-materials-20261026/pack.cjs. External proofs: /home/debian/gildra-voidspire-materials-20261026/proof/.

Superseded native panel variants are retained and are **not delivered**: `/home/debian/gildra-voidspire-materials-20261026/native/panel.png` (SHA-256 `38bbc2c18ae83a719aedcd814546c1c2aa9e130e2fdea1f0e74e0a525aceca1f`; earlier central-crest candidate; unused); `/home/debian/gildra-voidspire-materials-20261026/native/panel-rails.png` (SHA-256 `6da717b5d9f5a48253ed92f1bb204550eafd19f62e4ad5f2d8022165f5ec8293`; rails too thin at intended CSS size; superseded by panel-heavy).

## plaque

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/plaque.png` (2172×724), SHA-256 `a8654fb9a94d496caeb8f5211f6bc9cef5e7c8e847554dc478171b662cde6637`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/plaque.txt`, SHA-256 `b0e8fd6d8bbb73cad9c057436836da5dcb6cdf53e0ce67a0fe3667fbd7e0ec1e`.
- Delivery: `/assets/wow/raids/voidspire-planner/plaque.webp`, 768×207, 33992 bytes, SHA-256 `ad6215bd131e2d8326bab2dd3fa8a5352ed14be753d174a27c6d1804b7ee49c0`.
- Recipe: skill button: trim alpha>8, resize752w proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"nine-slice","fill":true,"slicesOrder":"top,right,bottom,left","measuredProposal":[53,165,38,165],"textWindowPercent":{"left":20,"top":28,"right":80,"bottom":72},"recommendedHeight":64}`; slices T/R/B/L `53,165,38,165`.

## card

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/card.png` (1983×793), SHA-256 `ea6ac5c9879a5464c22840edd603044297c836805a16aa09b07fcba32c0f5824`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/card.txt`, SHA-256 `4747d88eef544e2dcb8d6fb11146e95676f3a602119ff8c993b5be8298730a69`.
- Delivery: `/assets/wow/raids/voidspire-planner/card.webp`, 768×307, 52752 bytes, SHA-256 `2f164f8c6a588160b7831acd00829cfd97eb63863deee6f35b72b13f3867c900`.
- Recipe: whole native canvas proportional resize768w, no trim,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","aspectRatio":[1983,793],"numberCentrePercent":{"x":18.5,"y":49.5},"textWindowPercent":{"left":35,"top":28,"right":91,"bottom":71},"stretch":false}`.

## medallion

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/medallion.png` (1254×1254), SHA-256 `99d7120648519c8722eba3514692eb0eb5acbfc0353c9d0141478534f90a5ca0`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/medallion.txt`, SHA-256 `ad9fcd231e6714af6808c24bf12c6f8d614ea421679474efa31309581ba39689`.
- Delivery: `/assets/wow/raids/voidspire-planner/medallion.webp`, 192×192, 12802 bytes, SHA-256 `a2d408a5ebf2b15ad7df508e637f151c8fb690badc551149fca06c41c72ab00c`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","numberCentrePercent":{"x":50,"y":50},"textWindowPercent":{"left":30,"top":30,"right":70,"bottom":70},"padding":8,"stretch":false}`.

## panel

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/panel-heavy.png` (1536×1024), SHA-256 `eaff923da332c7b682ac77c35152ab58508c88cb36c66a30f7f611c8af89da66`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/panel-heavy.txt`, SHA-256 `6189f92c11faacb025a3cce63b49ead2979db60658eb7e174915488de6fbfd66`.
- Delivery: `/assets/wow/raids/voidspire-planner/panel.webp`, 960×640, 95088 bytes, SHA-256 `c5bbafc6c0b180e0d96337618995a525e75fc26fe3713e92e19c7c038316f499`.
- Recipe: skill frame: no trim,960×640 proportional,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"nine-slice","fill":false,"slicesOrder":"top,right,bottom,left","nativeSlices":[264,280,280,280],"sliceScale":0.625,"sourceWindowPercent":{"left":13.671875,"top":20.01953125,"right":86.39322916666666,"bottom":78.22265625},"nativeSafeWindowAlphaAtMost8":{"left":210,"top":205,"width":1117,"height":596},"recommendedCssScale":0.34285714285714286,"recommendedCssScaleMobile":0.22857142857142856,"recommendedCssBorders":[60,60,60,60],"recommendedCssBordersMobile":[40,40,40,40],"nativeRailProfiles":{"topSolidAlpha8":[80,201],"bottomSolidAlpha8":[802,932],"leftMiddleWithCrystalAlpha8":[42,184],"rightMiddleWithCrystalAlpha8":[1352,1494],"leftStraightAlpha128":[66,183],"rightStraightAlpha128":[1353,1470]},"notes":"Transparent open centre with original faint alpha1–8 residual preserved; no fill. Measured chunky corner cuts; proof verifies the straight rail stretch."}`; slices T/R/B/L `165,175,175,175`.

## map

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/map.png` (1254×1254), SHA-256 `2580afc76810f8c6f4a4bab439c9f1ae9fa842208dce65d961cf5fe485f97d95`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/map.txt`, SHA-256 `f1e4bbf991b422e1cd9f4c1d32c741e508b1256bf36c920cecc2bc2c6444c55e`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/map.webp`, 192×192, 14078 bytes, SHA-256 `6bd9b505985f38f827ff2e96c4d070d8c4c30faa1ca72a3815ee0664ddb62f8d`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.

## arena

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/arena.png` (1254×1254), SHA-256 `897e55d84ccfe9e70161ddcc1925f021e863a9d46cac262a81cf84bf946e8909`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/arena.txt`, SHA-256 `30d12cee92dc74454e905e6994d8b745b84a9aeda7bf0e497d0979b4b83f427a`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/arena.webp`, 192×192, 12576 bytes, SHA-256 `58cbe3d9bd4dd28931e9a343f4c752087cec5d95561ea5d9f00e9f05a404a159`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.

## grid

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/grid.png` (1254×1254), SHA-256 `34546bff918c65fdea55d6fa51a82fa7b6b5d4b9c41a6ea53e95ebcfe545e67a`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/grid.txt`, SHA-256 `12a273e58fc20dab8d9f26438c71ee54226e086038d845b92b691be8005952f1`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/grid.webp`, 192×192, 14968 bytes, SHA-256 `bf98baf462f8a915d225ba9b5e97ab284d75eeff3b2f556bdc5c62fed1c14415`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.

## art

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/art.png` (1254×1254), SHA-256 `8bb91e354a9ea40826217ece9d816fb7b34c05b8dde3b275b0c8cb1667533ae2`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/art.txt`, SHA-256 `e26f27ed551007f93b94537f010ecc6170cc85b7dd9ff18c1d32207e97d75229`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/art.webp`, 192×192, 9998 bytes, SHA-256 `42a4e154d209395864fea79086db3707b89e2388c74863fdfdb8f14038b9d655`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.

## command

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/command.png` (1254×1254), SHA-256 `e30247822efde558f7bc24164528a5921f59897e1e8c35a19670c7f52ce0e254`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/command.txt`, SHA-256 `83df740f83426c59ea6ae533ffd7b6d653f7ca590eeb64793194ba1f77dc8778`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/command.webp`, 192×192, 11492 bytes, SHA-256 `56dbbe28e337aa2b067a8e3166073d3c34e4e1d86900c74bcfd33549f7a8ad7b`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.

## sketch

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/sketch.png` (1254×1254), SHA-256 `11c3985f6c50a3f3937543b6ea0803e9674d6ce2d0fcf29f606f7c01df1d60e9`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/sketch.txt`, SHA-256 `0d17d0ba1b14f9e3bb7f35117e14330a367c1bea59a5c320b2b479ba2b994d73`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/sketch.webp`, 192×192, 14272 bytes, SHA-256 `7d2caac958788083876996e81081f1d8b60fef5ca6930dd6466563d2febac38f`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.

## zoom

- Generator: built-in image_gen.imagegen; generate; transparent_background:true.
- Native: `/home/debian/gildra-voidspire-materials-20261026/native/icons/zoom.png` (1254×1254), SHA-256 `2c9a7cbe1e1599b2b926569e958c238f3b57d74e5da1fda95cdc0b29401f34d0`.
- Full exact prompt: `/home/debian/gildra-voidspire-materials-20261026/prompts/icons/zoom.txt`, SHA-256 `1e554b06a9266227f385e0b6164301dc813f0364235c6452254fe7a46fb81ceb`.
- Delivery: `/assets/wow/raids/voidspire-planner/icons/zoom.webp`, 192×192, 11528 bytes, SHA-256 `2800ed726835dd9037315f0610239353e9986712ff5ad6e71c0ff56d948aec9f`.
- Recipe: trim alpha>8, fit176×176 proportional,8px transparent padding,WebPq88 alpha100 effort6.
- Geometry: `{"mode":"whole-contain","padding":8,"stretch":false}`.
