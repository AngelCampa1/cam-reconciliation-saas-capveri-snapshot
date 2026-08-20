# PWA Icons

## Current Status
- **icon.svg**: Vector icon ready for use
- **icon-192.png** & **icon-512.png**: Placeholder references (need generation)

## To Generate PNG Icons

Use the SVG icon (icon.svg) to generate PNG versions:

```bash
# Option 1: Using ImageMagick
convert -background none -resize 192x192 icon.svg icon-192.png
convert -background none -resize 512x512 icon.svg icon-512.png

# Option 2: Using Inkscape
inkscape icon.svg --export-type=png --export-filename=icon-192.png -w 192 -h 192
inkscape icon.svg --export-type=png --export-filename=icon-512.png -w 512 -h 512

# Option 3: Online Tool
# Visit https://realfavicongenerator.net/ and upload icon.svg
```

## Icon Design
- Primary color: #2563eb (blue-600)
- Background: White (#ffffff)
- Features letter "C" for CapVeri with building overlay
- Designed for maskable PWA usage
