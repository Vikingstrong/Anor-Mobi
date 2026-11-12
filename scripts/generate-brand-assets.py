"""Render our code-native vector mark and UI glyphs. No external fonts/assets."""
from math import cos, sin, pi
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BLUE = '#0756A5'
YELLOW = '#FFD43B'
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" fill="#0756A5"/>
<circle cx="490" cy="554" r="200" fill="white"/>
<circle cx="490" cy="554" r="104" fill="#0756A5"/>
<rect x="594" y="470" width="96" height="284" rx="48" fill="white"/>
<path d="M464 306 Q470 218 588 218 Q588 300 464 306" fill="#FFD43B"/>
</svg>'''
(ROOT/'assets/brand/mark.svg').write_text(SVG)
S = 2
size = 1024
fg = Image.new('RGBA', (size*S, size*S))
d = ImageDraw.Draw(fg)
def circle(box, fill): d.ellipse(tuple(int(v*S) for v in box), fill=fill)
circle((290,354,690,754), 'white')
circle((386,450,594,658), (0,0,0,0))
d.rounded_rectangle(tuple(v*S for v in (594,470,690,754)), radius=48*S, fill='white')
# Quadratic SVG leaf approximated by a high-resolution polygon sampled from its curves.
def quadratic(a,b,c,n=30):
 return [tuple(((1-t)**2*a[k]+2*(1-t)*t*b[k]+t*t*c[k])*S for k in (0,1)) for t in [i/n for i in range(n+1)]]
leaf = quadratic((464,306),(470,218),(588,218))+quadratic((588,218),(588,300),(464,306))
d.polygon(leaf, fill=YELLOW)
fg = fg.resize((size,size), Image.Resampling.LANCZOS)
fg.save(ROOT/'assets/brand/adaptive-foreground.png')
icon = Image.new('RGBA', (size,size), BLUE); icon.alpha_composite(fg)
icon.convert('RGB').save(ROOT/'assets/brand/app-icon.png')
icon.resize((96,96), Image.Resampling.LANCZOS).save(ROOT/'assets/brand/mark-96.png')
mono=Image.new('RGBA', (size,size), 'white');mono.putalpha(fg.getchannel('A'));mono.save(ROOT/'assets/brand/adaptive-monochrome.png')

def glyph(name, draw):
 im=Image.new('RGBA',(96,96)); draw(ImageDraw.Draw(im),4); im.save(ROOT/f'assets/icons/{name}.png')
def refresh(d,s):
 d.arc(tuple(v*s for v in (4,4,20,20)),45,315,fill='white',width=2*s)
 d.polygon([(14*s,9*s),(20*s,3*s),(21*s,10*s)],fill='white')
def clock(d,s):
 d.ellipse(tuple(v*s for v in (3,3,21,21)),outline='white',width=2*s)
 d.line([(12*s,7*s),(12*s,12*s),(16*s,14*s)], fill='white', width=2*s)
def more(d,s):
 for x in (5,12,19): d.ellipse(((x-1.4)*s,10.6*s,(x+1.4)*s,13.4*s),fill='white')
def settings(d,s):
 points=[]
 for tooth in range(8):
  for offset,radius in ((-0.36,8),(-0.2,10),(0.2,10),(0.36,8)):
   angle=(tooth+offset)*pi/4
   points.append(((12+cos(angle)*radius)*s,(12+sin(angle)*radius)*s))
 d.polygon(points, fill='white')
 d.ellipse(tuple(v*s for v in (8,8,16,16)), fill=(0,0,0,0))
glyph('refresh',refresh);glyph('clock',clock);glyph('more',more);glyph('settings',settings)
print('Generated original SVG mark, launcher PNGs and small UI glyphs.')
