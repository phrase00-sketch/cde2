"""Generate original geometric test glyphs; fontTools is needed only to regenerate.

The fonts and this generator are covered by the repository's MIT license.
They map A and U+4E2D to an outlined square, with distinct regular/bold strokes.
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

for weight, stroke in [(400, 80), (900, 200)]:
    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(['.notdef', 'square'])
    builder.setupCharacterMap({65: 'square', 0x4e2d: 'square'})
    empty = TTGlyphPen(None)
    pen = TTGlyphPen(None)
    for points in [[(50, 0), (50, 700), (650, 700), (650, 0)],
                   [(50 + stroke, stroke), (650 - stroke, stroke),
                    (650 - stroke, 700 - stroke), (50 + stroke, 700 - stroke)]]:
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    builder.setupGlyf({'.notdef': empty.glyph(), 'square': pen.glyph()})
    builder.setupHorizontalMetrics({'.notdef': (700, 0), 'square': (700, 50)})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({'familyName': 'CDE2 Test Squares', 'styleName': str(weight),
                           'uniqueFontIdentifier': 'CDE2Squares' + str(weight),
                           'fullName': 'CDE2 Test Squares ' + str(weight),
                           'psName': 'CDE2Squares' + str(weight)})
    builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800,
                    usWinDescent=200, usWeightClass=weight)
    builder.setupPost()
    builder.font['head'].created = builder.font['head'].modified = 3800000000
    builder.font.flavor = 'woff'
    builder.save(Path(__file__).with_name(f'png-font-{weight}.woff'))
