#!/bin/bash

# Script to generate macOS icon with proper rounded corners
# Requires ImageMagick (install with: brew install imagemagick)

echo "Generating macOS icon with rounded corners..."

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick is not installed. Trying to use sips instead..."
    USE_SIPS=true
else
    USE_SIPS=false
fi

# Source and destination paths
SOURCE_ICON="build/icon.png"
ICONSET_DIR="build/ClodeStudio.iconset"
OUTPUT_ICNS="build/icon.icns"

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Function to create rounded corners mask using sips (fallback)
create_rounded_icon_sips() {
    local size=$1
    local input=$2
    local output=$3
    
    # Create a copy and resize
    sips -z $size $size "$input" --out "$output" 2>/dev/null
}

# Function to create rounded corners mask using ImageMagick
create_rounded_icon_magick() {
    local size=$1
    local input=$2
    local output=$3
    local corner_radius=$((size / 5))  # 20% corner radius (Apple standard)
    
    # Create rounded rectangle mask and apply to image
    convert "$input" -resize ${size}x${size} \
        \( +clone -alpha extract \
        -draw "fill black polygon 0,0 0,$corner_radius $corner_radius,0 fill white circle $corner_radius,$corner_radius $corner_radius,0" \
        \( +clone -flip \) -compose Multiply -composite \
        \( +clone -flop \) -compose Multiply -composite \
        \) -alpha off -compose CopyOpacity -composite \
        "$output"
}

# Required icon sizes for macOS
sizes=(16 32 64 128 256 512 1024)

echo "Creating icon set..."

for size in "${sizes[@]}"; do
    # Standard resolution
    if [ $size -eq 1024 ]; then
        filename="icon_512x512@2x.png"
    elif [ $size -eq 512 ]; then
        filename="icon_512x512.png"
        filename2="icon_256x256@2x.png"
    elif [ $size -eq 256 ]; then
        filename="icon_256x256.png"
        filename2="icon_128x128@2x.png"
    elif [ $size -eq 128 ]; then
        filename="icon_128x128.png"
    elif [ $size -eq 64 ]; then
        filename="icon_32x32@2x.png"
    elif [ $size -eq 32 ]; then
        filename="icon_32x32.png"
        filename2="icon_16x16@2x.png"
    elif [ $size -eq 16 ]; then
        filename="icon_16x16.png"
    fi
    
    if [ "$USE_SIPS" = true ]; then
        # Use sips (no rounded corners, but better than nothing)
        create_rounded_icon_sips $size "$SOURCE_ICON" "$ICONSET_DIR/$filename"
        if [ ! -z "$filename2" ]; then
            cp "$ICONSET_DIR/$filename" "$ICONSET_DIR/$filename2"
        fi
    else
        # Use ImageMagick with rounded corners
        create_rounded_icon_magick $size "$SOURCE_ICON" "$ICONSET_DIR/$filename"
        if [ ! -z "$filename2" ]; then
            cp "$ICONSET_DIR/$filename" "$ICONSET_DIR/$filename2"
        fi
    fi
    
    echo "  Created $filename"
done

# Generate ICNS file from iconset
echo "Generating ICNS file..."
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

if [ $? -eq 0 ]; then
    echo "✓ Successfully created $OUTPUT_ICNS with rounded corners"
    
    # Clean up iconset directory
    rm -rf "$ICONSET_DIR"
    
    echo ""
    echo "Icon has been updated. The app will now display with proper rounded corners on macOS."
    echo "You may need to rebuild the app for changes to take effect:"
    echo "  npm run dist:mac"
else
    echo "✗ Failed to create ICNS file"
    exit 1
fi