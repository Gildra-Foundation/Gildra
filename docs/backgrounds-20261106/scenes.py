import json, sys
STYLE = ("STYLE: a hand-painted World of Warcraft environment painting in the tradition of the game's official loading screens and environment concept art. "
 "Stylized Warcraft proportions: chunky, oversized, slightly exaggerated architecture with thick rounded stonework, heavy timber, broad rooflines and bold spires; "
 "shapes simplified into large readable masses; hand-painted textures with visible, confident brushwork; clear separation of foreground, midground and background values; "
 "lore-accurate World of Warcraft materials, motifs and colour language. A deliberate painting by a professional game environment artist — not a photograph, not a 3D render, "
 "not a generic fantasy wallpaper. Crisp, intentional edges on the focal object; simpler, softer shapes toward the edges of the frame.")
COMP = ("CANVAS: wide 16:9 landscape.\n"
 "COMPOSITION: the focal point sits at about {fx}% from the left and {fy}% from the top. The left 40% of the canvas is calmer and darker — a few large shadowed shapes "
 "(wall, pillar, cliff or deep sky) with no bright spots and little detail, because a live HTML title and buttons sit there. The lower quarter is calm floor, mist or shadow "
 "that page content overlaps. One believable, coherent space with clear perspective; every structure is buildable and makes physical sense. Environment only: no people, no creatures.")
EXCLUDE = ("EXCLUDE: no text, letters, numbers, writing-like runes, logos, faction emblems, heraldic symbols, watermarks or signatures; no interface, frames or borders; "
 "no people, faces, figures, crowds, silhouettes of people, creatures or skeletons; no photorealism, no glossy 3D render look, no plastic sheen, no neon, no lens flare, "
 "no depth-of-field blur; no swarms of particles, sparkles, floating debris, repeated glowing rings, cluttered micro-detail, melted or nonsensical architecture; no oversaturated colour.")
S = json.load(open(sys.argv[1]))
out = {}
for k, s in S.items():
    p = (f"ASSET: one opaque painted environment background for the hero of the {s['page']} page on the Gildra World of Warcraft fan site.\n"
         f"SCENE: {s['scene']}\n" + COMP.format(fx=s.get('fx', 70), fy=s.get('fy', 38)) + "\n" + STYLE + "\n"
         f"LIGHT: the main light falls from the upper left; {s['light']} Palette anchors: {s['palette']}. Moderate contrast, deep readable shadows that are not crushed black, soft natural bloom only around the focal light.\n"
         f"DISPLAY: shown full-screen behind the page at 1440×900 and cropped to a 390 px wide phone; the site darkens the left side and the bottom, so the focal object on the right must read at a glance.\n"
         + EXCLUDE)
    out[k] = p
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
