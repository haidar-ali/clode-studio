#!/bin/bash

# Clode Studio Quick Install Script
# Works on macOS and Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/haidar-ali/clode-studio.git"
INSTALL_DIR="$HOME/.clode-studio"
NODE_MIN_VERSION="20"

# Print banner
print_banner() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║       Clode Studio Quick Install       ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    else
        echo -e "${RED}Unsupported OS: $OSTYPE${NC}"
        exit 1
    fi
    echo -e "Detected OS: ${GREEN}$OS${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Compare versions
version_compare() {
    if [[ $1 == $2 ]]; then
        return 0
    fi
    local IFS=.
    local i ver1=($1) ver2=($2)
    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++)); do
        if [[ -z ${ver2[i]} ]]; then
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]})); then
            return 0
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]})); then
            return 1
        fi
    done
    return 0
}

# Check Node.js
check_node() {
    echo -e "\n${YELLOW}Checking Node.js...${NC}"
    
    if ! command_exists node; then
        echo -e "${RED}Node.js is not installed${NC}"
        
        if [[ "$OS" == "macos" ]]; then
            echo -e "${YELLOW}Would you like to install Node.js via Homebrew? (y/n)${NC}"
            read -r response
            if [[ "$response" == "y" ]]; then
                if ! command_exists brew; then
                    echo "Installing Homebrew first..."
                    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                fi
                brew install node
            else
                echo "Please install Node.js 20+ from https://nodejs.org"
                exit 1
            fi
        else
            echo "Please install Node.js 20+ from https://nodejs.org or via your package manager:"
            echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
            echo "  RHEL/CentOS: curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
            exit 1
        fi
    fi
    
    # Check Node version
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if ! version_compare "$NODE_VERSION" "$NODE_MIN_VERSION"; then
        echo -e "${RED}Node.js version $NODE_VERSION is too old. Need version $NODE_MIN_VERSION+${NC}"
        exit 1
    fi
    
    # Note about Node 23+ (informational only)
    if [[ "$NODE_VERSION" -ge "23" ]]; then
        echo -e "${BLUE}ℹ Node.js 23+ detected - using explicit setup process${NC}"
    fi
    
    echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"
}

# Check Git
check_git() {
    echo -e "\n${YELLOW}Checking Git...${NC}"
    
    if ! command_exists git; then
        echo -e "${RED}Git is not installed${NC}"
        
        if [[ "$OS" == "macos" ]]; then
            echo "Installing Git via Xcode Command Line Tools..."
            xcode-select --install
        else
            echo "Please install Git:"
            echo "  Ubuntu/Debian: sudo apt-get install git"
            echo "  RHEL/CentOS: sudo yum install git"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓ Git $(git --version | cut -d ' ' -f 3) found${NC}"
}

# Check optional dependencies
check_optional() {
    echo -e "\n${YELLOW}Checking optional dependencies...${NC}"
    
    # Check ripgrep
    if command_exists rg; then
        echo -e "${GREEN}✓ Ripgrep found (faster search)${NC}"
    else
        echo -e "${YELLOW}○ Ripgrep not found (search will be slower)${NC}"
        if [[ "$OS" == "macos" ]]; then
            echo -e "  Install with: brew install ripgrep"
        else
            echo -e "  Install with: sudo apt install ripgrep"
        fi
    fi
    
    # Check Claude CLI
    if command_exists claude; then
        echo -e "${GREEN}✓ Claude CLI found${NC}"
    else
        echo -e "${YELLOW}○ Claude CLI not found${NC}"
        echo -e "  Install with: npm install -g @anthropic-ai/claude-code"
    fi
}

# Clone or update repository
setup_repository() {
    echo -e "\n${YELLOW}Setting up Clode Studio...${NC}"
    
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}Existing installation found at $INSTALL_DIR${NC}"
        echo -n "Update existing installation? (y/n) "
        read -r response
        
        if [[ "$response" == "y" ]]; then
            cd "$INSTALL_DIR"
            echo "Updating..."
            git pull origin main
        fi
    else
        echo "Cloning repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
}

# Install dependencies
install_dependencies() {
    echo -e "\n${YELLOW}Installing dependencies...${NC}"
    cd "$INSTALL_DIR"
    
    # Clean install
    if [ -d "node_modules" ]; then
        echo "Cleaning old dependencies..."
        rm -rf node_modules package-lock.json
    fi
    
    # Pre-create directories with proper permissions (fixes Node 23+ issues)
    echo "Setting up directory structure..."
    mkdir -p "$INSTALL_DIR/vendor/ripgrep"
    mkdir -p "$INSTALL_DIR/.nuxt"
    mkdir -p "$INSTALL_DIR/node_modules"
    
    # Ensure proper permissions
    chmod -R 755 "$INSTALL_DIR"
    
    # Install packages WITHOUT running postinstall scripts
    echo "Installing packages (this may take a few minutes)..."
    npm install --ignore-scripts
    
    # Now run the setup tasks manually with error handling
    echo -e "\n${YELLOW}Running setup tasks...${NC}"
    
    # 1. Prepare Nuxt
    echo "Preparing Nuxt framework..."
    if ! npx nuxt prepare 2>/dev/null; then
        echo -e "${YELLOW}⚠ Nuxt prepare had issues, but continuing...${NC}"
    fi
    
    # 2. Rebuild Electron native modules
    echo "Rebuilding Electron native modules..."
    if ! npx electron-rebuild 2>/dev/null; then
        echo -e "${YELLOW}⚠ Some native modules couldn't rebuild, app may still work${NC}"
    fi
    
    # 3. Download ripgrep (only if not available system-wide)
    if command_exists rg; then
        echo -e "${GREEN}✓ System ripgrep found, skipping download${NC}"
    else
        echo "Downloading ripgrep for better search performance..."
        if ! node scripts/download-ripgrep.js 2>/dev/null; then
            echo -e "${YELLOW}⚠ Couldn't download ripgrep, will use fallback search${NC}"
        else
            echo -e "${GREEN}✓ Ripgrep downloaded successfully${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ Dependencies installed${NC}"
}

# Compile TypeScript
compile_typescript() {
    echo -e "\n${YELLOW}Compiling TypeScript...${NC}"
    cd "$INSTALL_DIR"
    
    npm run electron:compile
    
    echo -e "${GREEN}✓ TypeScript compiled${NC}"
}

# Create launch scripts
create_scripts() {
    echo -e "\n${YELLOW}Creating launch scripts...${NC}"
    
    # Create bin directory
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
    
    # Create main launcher
    cat > "$BIN_DIR/clode-studio" << 'EOF'
#!/bin/bash
# Clode Studio Launcher

INSTALL_DIR="$HOME/.clode-studio"
cd "$INSTALL_DIR"

# Parse arguments
MODE="desktop"
DEV=false
WORKSPACE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --hybrid)
            MODE="hybrid"
            shift
            ;;
        --headless)
            MODE="headless"
            shift
            ;;
        --workspace=*)
            WORKSPACE="${1#*=}"
            shift
            ;;
        --dev)
            DEV=true
            shift
            ;;
        --help)
            echo "Clode Studio Launcher"
            echo ""
            echo "Usage: clode-studio [options]"
            echo ""
            echo "Options:"
            echo "  --hybrid         Start in hybrid mode (desktop + remote server)"
            echo "  --headless       Start in headless mode (server only, no GUI)"
            echo "  --workspace=PATH Set workspace path (required for headless mode)"
            echo "  --dev            Start in development mode"
            echo "  --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  clode-studio                                    # Start desktop mode"
            echo "  clode-studio --hybrid                           # Start with remote access enabled"
            echo "  clode-studio --headless --workspace=/path/to/project  # Headless mode"
            echo "  clode-studio --dev                              # Start in development mode"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Start Clode Studio
export CLODE_MODE="$MODE"

# Set workspace path if provided
if [ -n "$WORKSPACE" ]; then
    export CLODE_WORKSPACE_PATH="$WORKSPACE"
fi

# Check headless mode requirements
if [ "$MODE" = "headless" ] && [ -z "$WORKSPACE" ]; then
    echo "Error: Headless mode requires --workspace=/path/to/project"
    echo "Example: clode-studio --headless --workspace=/home/user/my-project"
    exit 1
fi

if [ "$DEV" = true ]; then
    echo "Starting Clode Studio in development mode (${MODE})..."
    npm run electron:dev
else
    echo "Starting Clode Studio (${MODE} mode)..."
    # Use appropriate script based on mode
    if [ "$MODE" = "hybrid" ]; then
        npm run electron:remote
    elif [ "$MODE" = "headless" ]; then
        npm run electron:headless
    else
        npm run electron:dev
    fi
fi
EOF
    
    chmod +x "$BIN_DIR/clode-studio"
    
    # Create desktop entry for Linux
    if [[ "$OS" == "linux" ]]; then
        DESKTOP_FILE="$HOME/.local/share/applications/clode-studio.desktop"
        mkdir -p "$(dirname "$DESKTOP_FILE")"
        
        cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=Clode Studio
Comment=AI-powered IDE for developers
Exec=$BIN_DIR/clode-studio
Icon=$INSTALL_DIR/public/icon.png
Terminal=false
Type=Application
Categories=Development;IDE;
EOF
        
        echo -e "${GREEN}✓ Desktop entry created${NC}"
    fi
    
    # Create macOS app alias
    if [[ "$OS" == "macos" ]]; then
        # Add to PATH if not already there
        if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
            echo "" >> "$HOME/.zshrc"
            echo "# Clode Studio" >> "$HOME/.zshrc"
            echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$HOME/.zshrc"
            echo -e "${YELLOW}Added to PATH. Run 'source ~/.zshrc' or restart terminal${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ Launch scripts created${NC}"
}

# Configure environment
configure_env() {
    echo -e "\n${YELLOW}Configuring environment...${NC}"
    
    # Create default config
    CONFIG_FILE="$INSTALL_DIR/.env"
    if [ ! -f "$CONFIG_FILE" ]; then
        cat > "$CONFIG_FILE" << EOF
# Clode Studio Configuration
# Default mode: desktop, hybrid, or headless
CLODE_MODE=desktop

# Relay/Tunnel type: CLODE, CLOUDFLARE, CUSTOM, NONE
RELAY_TYPE=CLODE

# Custom relay server (when RELAY_TYPE=CLODE)
# RELAY_URL=wss://your-relay.example.com

# Remote server settings (for hybrid/headless mode)
CLODE_SERVER_PORT=3789
CLODE_SERVER_HOST=0.0.0.0
CLODE_MAX_CONNECTIONS=10
CLODE_AUTH_REQUIRED=false

# Workspace path (REQUIRED for headless mode)
# CLODE_WORKSPACE_PATH=$HOME/projects
EOF
        echo -e "${GREEN}✓ Configuration file created${NC}"
    fi
}

# Print success message
print_success() {
    echo -e "\n${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}     Clode Studio installed successfully!${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}To start Clode Studio:${NC}"
    echo ""
    echo -e "  ${YELLOW}clode-studio${NC}                                         # Desktop mode"
    echo -e "  ${YELLOW}clode-studio --hybrid${NC}                                # Desktop + Remote server"
    echo -e "  ${YELLOW}clode-studio --headless --workspace=/path/to/project${NC} # Headless server only"
    echo ""
    
    if [[ "$OS" == "macos" ]]; then
        echo -e "${YELLOW}Note: You may need to run 'source ~/.zshrc' or restart your terminal${NC}"
    fi
    
    echo ""
    echo -e "${BOLD}Remote Access (hybrid mode):${NC}"
    echo -e "  When running in hybrid mode, Clode Studio will show:"
    echo -e "  • QR code for mobile connection"
    echo -e "  • Relay URL for remote access"
    echo -e "  • Local network URL for same WiFi"
    echo ""
    echo -e "  Custom tunnels (ngrok, etc) use port ${BLUE}3000${NC}"
    echo -e "  Relay server listens on port ${BLUE}3789${NC}"
    echo ""
    echo -e "${BOLD}Configuration:${NC}"
    echo -e "  Edit ${BLUE}$INSTALL_DIR/.env${NC} to change settings"
    echo ""
}

# Main installation flow
main() {
    print_banner
    detect_os
    check_node
    check_git
    check_optional
    setup_repository
    install_dependencies
    compile_typescript
    create_scripts
    configure_env
    print_success
}

# Handle errors
trap 'echo -e "\n${RED}Installation failed. Check the error messages above.${NC}"' ERR

# Run main installation
main "$@"