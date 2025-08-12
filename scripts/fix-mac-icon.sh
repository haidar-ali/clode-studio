#!/bin/bash

echo "Fixing macOS icon for proper rounded corners..."

# Create a temporary directory for processing
TEMP_DIR="/tmp/clode-icon-fix"
mkdir -p "$TEMP_DIR"

# Source icon
SOURCE_ICON="build/icon.png"

# Copy the source icon to temp
cp "$SOURCE_ICON" "$TEMP_DIR/original.png"

# Create iconset directory
ICONSET_DIR="$TEMP_DIR/ClodeStudio.iconset"
mkdir -p "$ICONSET_DIR"

# Function to create icon with transparency
create_icon_size() {
    local size=$1
    local filename=$2
    
    echo "  Creating $filename ($size x $size)..."
    sips -z $size $size "$TEMP_DIR/original.png" --out "$ICONSET_DIR/$filename" 2>/dev/null
}

# Create all required sizes
create_icon_size 16 "icon_16x16.png"
create_icon_size 32 "icon_16x16@2x.png"
create_icon_size 32 "icon_32x32.png"
create_icon_size 64 "icon_32x32@2x.png"
create_icon_size 128 "icon_128x128.png"
create_icon_size 256 "icon_128x128@2x.png"
create_icon_size 256 "icon_256x256.png"
create_icon_size 512 "icon_256x256@2x.png"
create_icon_size 512 "icon_512x512.png"
create_icon_size 1024 "icon_512x512@2x.png"

# Generate ICNS file
echo "Generating ICNS file..."
iconutil -c icns "$ICONSET_DIR" -o "build/icon.icns" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✓ Successfully created icon.icns"
    
    # Clean up
    rm -rf "$TEMP_DIR"
    
    echo ""
    echo "Icon has been fixed. To apply changes:"
    echo "1. Clear the icon cache:"
    echo "   sudo rm -rf /Library/Caches/com.apple.iconservices.store"
    echo "   sudo find /private/var/folders/ -name com.apple.dock.iconcache -exec rm {} \;"
    echo "   sudo find /private/var/folders/ -name com.apple.iconservices -exec rm -rf {} \;"
    echo "   killall Dock"
    echo ""
    echo "2. Rebuild the app:"
    echo "   npm run dist:mac"
    echo ""
    echo "3. If the icon still appears square, try:"
    echo "   - Remove the app from the dock"
    echo "   - Move the app to a different folder"
    echo "   - Add it back to the dock"
else
    echo "✗ Failed to create ICNS file"
    exit 1
fi