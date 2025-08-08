#!/bin/bash

# Clode Studio Remote Exposure Script
# Makes your local Clode Studio accessible from the internet

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
UI_PORT=3000
REMOTE_PORT=${CLODE_SERVER_PORT:-3789}

print_banner() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║   Clode Studio Remote Access Helper    ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

show_menu() {
    echo -e "\n${YELLOW}Choose your tunnel service:${NC}"
    echo "1) Clode Relay (Recommended - built-in, automatic)"
    echo "2) Ngrok (Requires free account)"
    echo "3) Cloudflare (No account needed for quick tunnel)"
    echo "4) Tailscale (Most secure, requires app on phone)"
    echo "5) Local network only (current setup)"
    echo "6) Help me choose"
    echo ""
    read -p "Select option [1-6]: " choice
    
    case $choice in
        1) use_relay ;;
        2) use_ngrok ;;
        3) use_cloudflare ;;
        4) use_tailscale ;;
        5) use_local ;;
        6) show_help ;;
        *) echo -e "${RED}Invalid option${NC}"; show_menu ;;
    esac
}

use_relay() {
    echo -e "\n${GREEN}Using Clode Relay Service (Recommended)${NC}"
    echo ""
    echo "The built-in relay server provides:"
    echo "  • Automatic subdomain (e.g., abc123.relay.clode.studio)"
    echo "  • Secure token-based authentication"
    echo "  • QR code for mobile connection"
    echo "  • No additional software needed"
    echo ""
    echo -e "${YELLOW}Starting Clode Studio in hybrid mode...${NC}"
    echo ""
    
    # Start with hybrid mode
    export CLODE_MODE=hybrid
    export RELAY_TYPE=CLODE
    
    # Check if custom relay is set
    if [ -n "$RELAY_URL" ]; then
        echo -e "Using custom relay: ${GREEN}$RELAY_URL${NC}"
    else
        echo -e "Using default relay: ${GREEN}relay.clode.studio${NC}"
    fi
    
    echo ""
    echo -e "${BOLD}Starting Clode Studio (optimized for remote)...${NC}"
    
    # Start the application with optimized mode for remote access
    cd "$(dirname "$0")/.."
    npm run electron:remote
}

use_ngrok() {
    echo -e "\n${YELLOW}Setting up Ngrok tunnel...${NC}"
    
    if ! check_command ngrok; then
        echo -e "${RED}Ngrok not installed${NC}"
        echo ""
        echo "Install with:"
        echo "  Mac: ${GREEN}brew install ngrok/ngrok/ngrok${NC}"
        echo "  Linux: Visit ${GREEN}https://ngrok.com/download${NC}"
        echo ""
        echo "Then:"
        echo "1. Sign up at https://ngrok.com"
        echo "2. Run: ${GREEN}ngrok authtoken YOUR_TOKEN${NC}"
        echo "3. Run this script again"
        exit 1
    fi
    
    echo -e "${GREEN}Starting Ngrok tunnel...${NC}"
    echo ""
    echo -e "${BOLD}Starting tunnel on port $UI_PORT (UI)${NC}"
    echo -e "${YELLOW}Look for the HTTPS URL below and use it on your phone!${NC}"
    echo ""
    
    # Start Clode Studio with custom tunnel type
    export RELAY_TYPE=CUSTOM
    export CLODE_MODE=hybrid
    
    # Start app in background
    cd "$(dirname "$0")/.."
    npm run electron:remote &
    APP_PID=$!
    
    sleep 5
    ngrok http $UI_PORT
    
    # Clean up on exit
    kill $APP_PID 2>/dev/null
}

use_cloudflare() {
    echo -e "\n${YELLOW}Setting up Cloudflare tunnel...${NC}"
    
    if ! check_command cloudflared; then
        echo -e "${RED}Cloudflared not installed${NC}"
        echo ""
        echo "Install with:"
        echo "  Mac: ${GREEN}brew install cloudflare/cloudflare/cloudflared${NC}"
        echo "  Linux: ${GREEN}sudo apt install cloudflared${NC}"
        echo ""
        echo "Or download from: https://github.com/cloudflare/cloudflared/releases"
        exit 1
    fi
    
    echo -e "${GREEN}Starting Cloudflare tunnel...${NC}"
    echo ""
    echo -e "${BOLD}Creating quick tunnel (no account needed)${NC}"
    echo -e "${YELLOW}The tunnel URL will be shown in Clode Studio${NC}"
    echo ""
    
    # Start with Cloudflare tunnel type
    export RELAY_TYPE=CLOUDFLARE
    export CLODE_MODE=hybrid
    
    cd "$(dirname "$0")/.."
    npm run electron:remote
}

use_tailscale() {
    echo -e "\n${YELLOW}Tailscale Setup${NC}"
    
    if ! check_command tailscale; then
        echo -e "${RED}Tailscale not installed${NC}"
        echo ""
        echo "Install with:"
        echo "  Mac: ${GREEN}brew install tailscale${NC}"
        echo "  Linux: ${GREEN}curl -fsSL https://tailscale.com/install.sh | sh${NC}"
        echo ""
        echo "Then:"
        echo "1. Run: ${GREEN}tailscale up${NC}"
        echo "2. Install Tailscale app on your phone"
        echo "3. Login with same account"
        exit 1
    fi
    
    # Get Tailscale IP
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
    
    if [ -z "$TAILSCALE_IP" ]; then
        echo -e "${RED}Tailscale not connected${NC}"
        echo "Run: ${GREEN}tailscale up${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Tailscale connected${NC}"
    echo ""
    echo -e "${BOLD}Your Tailscale IP: ${GREEN}$TAILSCALE_IP${NC}"
    echo ""
    echo "On your phone (with Tailscale app):"
    echo -e "  ${YELLOW}http://$TAILSCALE_IP:$PORT${NC}"
    echo ""
    echo "This IP works from anywhere as long as both devices have Tailscale running!"
}

use_local() {
    echo -e "\n${YELLOW}Local Network Access Only${NC}"
    
    # Get local IP
    if [[ "$OSTYPE" == "darwin"* ]]; then
        LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "unknown")
    else
        LOCAL_IP=$(hostname -I | awk '{print $1}' || echo "unknown")
    fi
    
    echo ""
    echo "Your local IP: ${GREEN}$LOCAL_IP${NC}"
    echo ""
    echo "Starting Clode Studio with local network access only..."
    echo ""
    
    # Start with no relay
    export RELAY_TYPE=NONE
    export CLODE_MODE=hybrid
    
    cd "$(dirname "$0")/.."
    npm run electron:remote
    
    echo ""
    echo "On devices on the same WiFi network:"
    echo -e "  ${YELLOW}http://$LOCAL_IP:$UI_PORT${NC}"
    echo ""
    echo -e "${RED}Note: This won't work on mobile data or different networks${NC}"
    echo "To access from anywhere, choose options 1-3"
}

show_help() {
    echo -e "\n${BOLD}Which should you choose?${NC}"
    echo ""
    echo -e "${GREEN}Ngrok${NC} - Best for:"
    echo "  • Quick testing"
    echo "  • Sharing with others temporarily"
    echo "  • Public demos"
    echo "  Pros: Easy, HTTPS included"
    echo "  Cons: URL changes, requires account"
    echo ""
    echo -e "${GREEN}Cloudflare${NC} - Best for:"
    echo "  • Quick access without signup"
    echo "  • Temporary connections"
    echo "  • Testing from mobile"
    echo "  Pros: No account needed, fast"
    echo "  Cons: URL changes each time"
    echo ""
    echo -e "${GREEN}Tailscale${NC} - Best for:"
    echo "  • Personal use"
    echo "  • Regular remote access"
    echo "  • Maximum security"
    echo "  Pros: Secure, stable IP, fast"
    echo "  Cons: Needs app on both devices"
    echo ""
    read -p "Press Enter to continue..."
    show_menu
}

check_clode_running() {
    # Don't check if running since this script will start it
    echo -e "${GREEN}Ready to start Clode Studio with remote access${NC}"
}

# Main execution
main() {
    print_banner
    check_clode_running
    show_menu
}

# Handle interruption
trap 'echo -e "\n${YELLOW}Tunnel closed${NC}"' INT TERM

main "$@"