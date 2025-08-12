# Build Assets

This directory contains build assets for Clode Studio releases.

## Required Files

### Icons
- `icon.icns` - macOS icon (1024x1024)
- `icon.ico` - Windows icon (256x256)
- `icon.png` - Linux icon (512x512)
- `icons/` - Linux icon set directory
  - `16x16.png`
  - `32x32.png`
  - `48x48.png`
  - `64x64.png`
  - `128x128.png`
  - `256x256.png`
  - `512x512.png`
  - `1024x1024.png`

### macOS DMG
- `background.png` - DMG background image (540x380)

## Generating Icons

From a high-resolution source image (1024x1024 PNG):

### macOS (.icns)
```bash
# Using iconutil (built-in on macOS)
mkdir icon.iconset
sips -z 16 16     source.png --out icon.iconset/icon_16x16.png
sips -z 32 32     source.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     source.png --out icon.iconset/icon_32x32.png
sips -z 64 64     source.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   source.png --out icon.iconset/icon_128x128.png
sips -z 256 256   source.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   source.png --out icon.iconset/icon_256x256.png
sips -z 512 512   source.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   source.png --out icon.iconset/icon_512x512.png
cp source.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

### Windows (.ico)
```bash
# Using ImageMagick
convert source.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### Linux (multiple PNGs)
```bash
# Create icon set
mkdir -p icons
for size in 16 32 48 64 128 256 512 1024; do
  convert source.png -resize ${size}x${size} icons/${size}x${size}.png
done
```

## Placeholder Icons

Until proper icons are created, electron-builder will use default icons.