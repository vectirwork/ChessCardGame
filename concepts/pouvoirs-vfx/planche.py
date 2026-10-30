# Planche de contrôle des effets des 8 pouvoirs : python3 planche.py <dossier des captures> <sortie.png>
import sys, os
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
F = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
font = ImageFont.truetype(F, 20) if os.path.exists(F) else ImageFont.load_default()
small = ImageFont.truetype(F, 15) if os.path.exists(F) else ImageFont.load_default()
ROWS = [
    ('Sablier fou', ['hourglass-070', 'hourglass-135', 'hourglass-arrivee', 'hourglass-actif']),
    ('Trêve', ['truce-060', 'truce-120', 'truce-arrivee', 'truce-actif']),
    ('Lune de sang', ['blood_moon-075', 'blood_moon-130', 'blood_moon-arrivee', 'blood_moon-actif']),
    ('Ère glaciaire', ['ice_age-070', 'ice_age-125', 'ice_age-arrivee', 'ice_age-actif']),
    ('Déflagration', ['blast-080', 'blast-115', 'blast-arrivee', 'blast-actif']),
    ('Mur de glace', ['ice_wall-060', 'ice_wall-120', 'ice_wall-pose']),
    ('Faille', ['rift-060', 'rift-120', 'rift-pose']),
    ('Grande Marée', ['tide-075', 'tide-130', 'tide-pose']),
    ('Foudre (Duel)', ['lightning-095']),
]
COLS = ['lancement', 'impact', 'arrivée du Présage / posé', 'Climat actif']
T, LBL, HEAD = 300, 210, 34
W = LBL + 4 * (T + 8)
H = HEAD + len(ROWS) * (T + 8)
sheet = Image.new('RGB', (W, H), (11, 10, 26))
d = ImageDraw.Draw(sheet)
for i, c in enumerate(COLS):
    d.text((LBL + i * (T + 8) + 8, 8), c, fill=(200, 200, 230), font=small)
for r, (name, shots) in enumerate(ROWS):
    y = HEAD + r * (T + 8)
    d.text((14, y + T // 2 - 12), name, fill=(240, 230, 200), font=font)
    for c, s in enumerate(shots):
        p = os.path.join(src, s + '.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        w, h = im.size
        im = im.crop((w * 0.06, h * 0.04, w * 0.94, h * 0.92)).resize((T, T))
        col = c if not (len(shots) == 3 and c == 2) else 2
        sheet.paste(im, (LBL + col * (T + 8), y))
sheet.save(out)
print(out, sheet.size)
