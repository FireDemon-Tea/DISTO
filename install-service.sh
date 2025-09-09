#!/bin/bash

# Minecraft Server Service Installation Script
# This script sets up a systemd service for running a Minecraft server with the MetricsBridge mod

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MINECRAFT_USER="minecraft"
MINECRAFT_GROUP="minecraft"
MINECRAFT_DIR="/opt/minecraft"
SERVICE_NAME="minecraft-server"
SERVICE_FILE="minecraft-server.service"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check if Java is installed
check_java() {
    if ! command -v java &> /dev/null; then
        print_error "Java is not installed. Please install OpenJDK 21 first:"
        echo "  Ubuntu/Debian: sudo apt install openjdk-21-jdk"
        echo "  CentOS/RHEL: sudo yum install java-21-openjdk-devel"
        echo "  Fedora: sudo dnf install java-21-openjdk-devel"
        exit 1
    fi
    
    # Check Java version
    JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [[ $JAVA_VERSION -lt 21 ]]; then
        print_warning "Java version $JAVA_VERSION detected. Java 21 or higher is recommended for Minecraft 1.21.8"
    fi
    
    print_success "Java is installed: $(java -version 2>&1 | head -n 1)"
}

# Create minecraft user and group
create_user() {
    if ! id "$MINECRAFT_USER" &>/dev/null; then
        print_status "Creating minecraft user and group..."
        groupadd -r "$MINECRAFT_GROUP"
        useradd -r -g "$MINECRAFT_GROUP" -d "$MINECRAFT_DIR" -s /bin/false "$MINECRAFT_USER"
        print_success "Created minecraft user and group"
    else
        print_status "Minecraft user already exists"
    fi
}

# Create minecraft directory structure
create_directories() {
    print_status "Creating minecraft directory structure..."
    
    # Create main directory
    mkdir -p "$MINECRAFT_DIR"
    
    # Create subdirectories
    mkdir -p "$MINECRAFT_DIR"/{world,logs,config,mods,plugins}
    mkdir -p /var/log/minecraft
    
    # Set ownership
    chown -R "$MINECRAFT_USER:$MINECRAFT_GROUP" "$MINECRAFT_DIR"
    chown -R "$MINECRAFT_USER:$MINECRAFT_GROUP" /var/log/minecraft
    
    # Set permissions
    chmod 755 "$MINECRAFT_DIR"
    chmod 755 /var/log/minecraft
    
    print_success "Created directory structure"
}

# Download and setup Minecraft server
setup_server() {
    print_status "Setting up Minecraft server..."
    
    # Check if server.jar already exists
    if [[ -f "$MINECRAFT_DIR/server.jar" ]]; then
        print_warning "server.jar already exists. Skipping download."
        print_warning "Make sure you have the MetricsBridge mod installed in the mods/ directory"
        return
    fi
    
    # Download server jar (you'll need to provide the actual download URL)
    print_warning "Please download the Minecraft server jar manually and place it at:"
    print_warning "  $MINECRAFT_DIR/server.jar"
    print_warning "You can download it from: https://www.minecraft.net/en-us/download/server"
    print_warning "Also, make sure to install the MetricsBridge mod in:"
    print_warning "  $MINECRAFT_DIR/mods/"
    
    # Create a placeholder eula.txt
    echo "eula=true" > "$MINECRAFT_DIR/eula.txt"
    chown "$MINECRAFT_USER:$MINECRAFT_GROUP" "$MINECRAFT_DIR/eula.txt"
    
    print_success "Server setup completed (manual download required)"
}

# Install systemd service
install_service() {
    print_status "Installing systemd service..."
    
    # Copy service file
    cp "$SERVICE_FILE" "/etc/systemd/system/$SERVICE_NAME.service"
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable "$SERVICE_NAME"
    
    print_success "Service installed and enabled"
}

# Configure firewall (optional)
configure_firewall() {
    if command -v ufw &> /dev/null; then
        print_status "Configuring UFW firewall..."
        ufw allow 25565/tcp comment "Minecraft Server"
        ufw allow 8765/tcp comment "MetricsBridge Web Interface"
        print_success "Firewall configured"
    elif command -v firewall-cmd &> /dev/null; then
        print_status "Configuring firewalld..."
        firewall-cmd --permanent --add-port=25565/tcp
        firewall-cmd --permanent --add-port=8765/tcp
        firewall-cmd --reload
        print_success "Firewall configured"
    else
        print_warning "No firewall detected. Make sure to open ports 25565 (Minecraft) and 8765 (MetricsBridge) manually"
    fi
}

# Create management script
create_management_script() {
    print_status "Creating management script..."
    
    cat > /usr/local/bin/minecraft-server << 'EOF'
#!/bin/bash

# Minecraft Server Management Script

SERVICE_NAME="minecraft-server"

case "$1" in
    start)
        echo "Starting Minecraft server..."
        sudo systemctl start $SERVICE_NAME
        ;;
    stop)
        echo "Stopping Minecraft server..."
        sudo systemctl stop $SERVICE_NAME
        ;;
    restart)
        echo "Restarting Minecraft server..."
        sudo systemctl restart $SERVICE_NAME
        ;;
    status)
        sudo systemctl status $SERVICE_NAME
        ;;
    logs)
        sudo journalctl -u $SERVICE_NAME -f
        ;;
    enable)
        echo "Enabling Minecraft server to start on boot..."
        sudo systemctl enable $SERVICE_NAME
        ;;
    disable)
        echo "Disabling Minecraft server from starting on boot..."
        sudo systemctl disable $SERVICE_NAME
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|enable|disable}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the Minecraft server"
        echo "  stop     - Stop the Minecraft server"
        echo "  restart  - Restart the Minecraft server"
        echo "  status   - Show server status"
        echo "  logs     - Show server logs (follow mode)"
        echo "  enable   - Enable server to start on boot"
        echo "  disable  - Disable server from starting on boot"
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/minecraft-server
    print_success "Management script created at /usr/local/bin/minecraft-server"
}

# Main installation function
main() {
    print_status "Starting Minecraft Server Service Installation..."
    echo ""
    
    check_root
    check_java
    create_user
    create_directories
    setup_server
    install_service
    configure_firewall
    create_management_script
    
    echo ""
    print_success "Installation completed successfully!"
    echo ""
    print_status "Next steps:"
    echo "1. Download the Minecraft server jar and place it at: $MINECRAFT_DIR/server.jar"
    echo "2. Install the MetricsBridge mod in: $MINECRAFT_DIR/mods/"
    echo "3. Configure your server in: $MINECRAFT_DIR/server.properties"
    echo "4. Configure MetricsBridge in: $MINECRAFT_DIR/config/metricsbridge.json"
    echo "5. Start the server with: minecraft-server start"
    echo ""
    print_status "Useful commands:"
    echo "  minecraft-server start    - Start the server"
    echo "  minecraft-server stop     - Stop the server"
    echo "  minecraft-server status   - Check server status"
    echo "  minecraft-server logs     - View server logs"
    echo ""
    print_status "Web interface will be available at: http://your-server:8765"
    print_status "Default MetricsBridge config:"
    echo "  - Port: 8765"
    echo "  - Shared Secret: change-me (CHANGE THIS!)"
    echo "  - Allow Origins: * (configure for security)"
}

# Run main function
main "$@"