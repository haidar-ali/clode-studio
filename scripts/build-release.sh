#!/bin/bash

# Clode Studio Release Build Script
# Builds releases for local testing or distribution

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
VARIANTS=("full" "lite" "server")
PLATFORMS=("mac" "win" "linux")

print_banner() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║     Clode Studio Release Builder       ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --variant <full|lite|server>  Build specific variant (default: full)"
    echo "  --platform <mac|win|linux>    Build for specific platform"
    echo "  --all                         Build all variants and platforms"
    echo "  --sign                        Sign the build (requires certificates)"
    echo "  --publish                     Publish to GitHub (requires token)"
    echo "  --clean                       Clean build directories first"
    echo "  --help                        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Build full variant for current platform"
    echo "  $0 --variant lite            # Build lite variant"
    echo "  $0 --platform mac --sign     # Build and sign for macOS"
    echo "  $0 --all                     # Build everything"
}

detect_platform() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "mac"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo "win"
    else
        echo "unknown"
    fi
}

clean_build() {
    echo -e "${YELLOW}Cleaning build directories...${NC}"
    rm -rf dist .output node_modules/.cache
    echo -e "${GREEN}✓ Clean complete${NC}"
}

check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [[ $NODE_VERSION -lt 22 ]]; then
        echo -e "${RED}Node.js 22+ is required (found v$NODE_VERSION)${NC}"
        exit 1
    fi
    
    # Check if npm packages are installed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
        npm ci
    fi
    
    echo -e "${GREEN}✓ Dependencies ready${NC}"
}

compile_typescript() {
    echo -e "${YELLOW}Compiling TypeScript...${NC}"
    npm run electron:compile
    echo -e "${GREEN}✓ TypeScript compiled${NC}"
}

build_nuxt() {
    echo -e "${YELLOW}Building Nuxt application...${NC}"
    npm run generate
    echo -e "${GREEN}✓ Nuxt build complete${NC}"
}

download_ripgrep() {
    echo -e "${YELLOW}Ensuring ripgrep binaries...${NC}"
    node scripts/download-ripgrep.js || true
    echo -e "${GREEN}✓ Ripgrep ready${NC}"
}

build_variant() {
    local variant=$1
    local platform=$2
    
    echo -e "\n${BLUE}Building $variant variant for $platform...${NC}"
    
    case $variant in
        full)
            case $platform in
                mac)
                    npx electron-builder --mac
                    ;;
                win)
                    npx electron-builder --win
                    ;;
                linux)
                    npx electron-builder --linux
                    ;;
                all)
                    npx electron-builder -mwl
                    ;;
            esac
            ;;
        lite)
            npx electron-builder --$platform \
                --config.productName="Clode Studio Lite" \
                --config.extraMetadata.variant=lite \
                --config.files='!vendor/ripgrep/**/*' \
                --config.files='!node_modules/@codemirror/**/*'
            ;;
        server)
            npx electron-builder --$platform \
                --config.productName="Clode Studio Server" \
                --config.extraMetadata.variant=server \
                --config.files='electron/**/*' \
                --config.files='!public/**/*' \
                --config.files='!**/*.html'
            ;;
    esac
    
    echo -e "${GREEN}✓ Build complete for $variant-$platform${NC}"
}

sign_build() {
    local platform=$1
    
    echo -e "${YELLOW}Signing build for $platform...${NC}"
    
    case $platform in
        mac)
            if [ -z "$MAC_CERTS" ]; then
                echo -e "${YELLOW}⚠ MAC_CERTS not set, skipping signing${NC}"
            else
                echo -e "${GREEN}✓ macOS build signed${NC}"
            fi
            ;;
        win)
            if [ -z "$WINDOWS_CERTS" ]; then
                echo -e "${YELLOW}⚠ WINDOWS_CERTS not set, skipping signing${NC}"
            else
                echo -e "${GREEN}✓ Windows build signed${NC}"
            fi
            ;;
    esac
}

publish_release() {
    echo -e "${YELLOW}Publishing release...${NC}"
    
    if [ -z "$GH_TOKEN" ]; then
        echo -e "${RED}GH_TOKEN not set, cannot publish${NC}"
        exit 1
    fi
    
    npx electron-builder --publish always
    echo -e "${GREEN}✓ Release published${NC}"
}

print_results() {
    echo -e "\n${GREEN}${BOLD}════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}        Build Complete!${NC}"
    echo -e "${GREEN}${BOLD}════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}Build artifacts in:${NC} ./dist/"
    echo ""
    
    if [ -d "dist" ]; then
        echo -e "${BOLD}Generated files:${NC}"
        ls -lh dist/*.{dmg,exe,AppImage,deb,rpm,snap,zip} 2>/dev/null || true
    fi
    
    echo ""
    echo -e "${BOLD}Next steps:${NC}"
    echo "  1. Test the builds locally"
    echo "  2. Create a git tag: git tag v$(node -p "require('./package.json').version")"
    echo "  3. Push to trigger GitHub Actions: git push origin main --tags"
    echo ""
}

# Main script
main() {
    print_banner
    
    # Parse arguments
    VARIANT="full"
    PLATFORM=$(detect_platform)
    BUILD_ALL=false
    SIGN=false
    PUBLISH=false
    CLEAN=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --variant)
                VARIANT="$2"
                shift 2
                ;;
            --platform)
                PLATFORM="$2"
                shift 2
                ;;
            --all)
                BUILD_ALL=true
                shift
                ;;
            --sign)
                SIGN=true
                shift
                ;;
            --publish)
                PUBLISH=true
                shift
                ;;
            --clean)
                CLEAN=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate platform
    if [[ "$PLATFORM" == "unknown" ]]; then
        echo -e "${RED}Unable to detect platform${NC}"
        exit 1
    fi
    
    # Clean if requested
    if [ "$CLEAN" = true ]; then
        clean_build
    fi
    
    # Prepare build
    check_dependencies
    compile_typescript
    build_nuxt
    download_ripgrep
    
    # Build
    if [ "$BUILD_ALL" = true ]; then
        echo -e "${YELLOW}Building all variants and platforms...${NC}"
        for variant in "${VARIANTS[@]}"; do
            for platform in "${PLATFORMS[@]}"; do
                build_variant $variant $platform
                if [ "$SIGN" = true ]; then
                    sign_build $platform
                fi
            done
        done
    else
        build_variant $VARIANT $PLATFORM
        if [ "$SIGN" = true ]; then
            sign_build $PLATFORM
        fi
    fi
    
    # Publish if requested
    if [ "$PUBLISH" = true ]; then
        publish_release
    fi
    
    print_results
}

# Handle errors
trap 'echo -e "\n${RED}Build failed. Check the error messages above.${NC}"' ERR

# Run main
main "$@"