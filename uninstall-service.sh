#!/bin/bash

# Minecraft Server Service Uninstallation Script
# This script removes the systemd service and related files for the Minecraft server

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

# Stop and disable service
stop_service() {
    print_status "Stopping and disabling Minecraft server service..."
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME"
        print_success "Service stopped"
    else
        print_status "Service is not running"
    fi
    
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        systemctl disable "$SERVICE_NAME"
        print_success "Service disabled"
    else
        print_status "Service is not enabled"
    fi
}

# Remove systemd service file
remove_service_file() {
    print_status "Removing systemd service file..."
    
    if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
        rm "/etc/systemd/system/$SERVICE_NAME.service"
        systemctl daemon-reload
        print_success "Service file removed"
    else
        print_status "Service file not found"
    fi
}

# Remove management script
remove_management_script() {
    print_status "Removing management script..."
    
    if [[ -f "/usr/local/bin/minecraft-server" ]]; then
        rm "/usr/local/bin/minecraft-server"
        print_success "Management script removed"
    else
        print_status "Management script not found"
    fi
}

# Ask about removing minecraft user and data
remove_user_and_data() {
    echo ""
    print_warning "Do you want to remove the minecraft user and all server data?"
    print_warning "This will permanently delete:"
    echo "  - User: $MINECRAFT_USER"
    echo "  - Group: $MINECRAFT_GROUP"
    echo "  - Directory: $MINECRAFT_DIR"
    echo "  - Logs: /var/log/minecraft"
    echo ""
    read -p "Are you sure? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing minecraft user and data..."
        
        # Remove log directory
        if [[ -d "/var/log/minecraft" ]]; then
            rm -rf "/var/log/minecraft"
            print_success "Log directory removed"
        fi
        
        # Remove minecraft directory
        if [[ -d "$MINECRAFT_DIR" ]]; then
            rm -rf "$MINECRAFT_DIR"
            print_success "Minecraft directory removed"
        fi
        
        # Remove user and group
        if id "$MINECRAFT_USER" &>/dev/null; then
            userdel "$MINECRAFT_USER"
            print_success "Minecraft user removed"
        fi
        
        if getent group "$MINECRAFT_GROUP" &>/dev/null; then
            groupdel "$MINECRAFT_GROUP"
            print_success "Minecraft group removed"
        fi
        
        print_warning "All minecraft data has been permanently deleted!"
    else
        print_status "Keeping minecraft user and data"
        print_status "You can manually remove them later if needed:"
        echo "  sudo userdel $MINECRAFT_USER"
        echo "  sudo groupdel $MINECRAFT_GROUP"
        echo "  sudo rm -rf $MINECRAFT_DIR"
        echo "  sudo rm -rf /var/log/minecraft"
    fi
}

# Remove firewall rules (optional)
remove_firewall_rules() {
    if command -v ufw &> /dev/null; then
        print_status "Removing UFW firewall rules..."
        ufw delete allow 25565/tcp 2>/dev/null || true
        ufw delete allow 8765/tcp 2>/dev/null || true
        print_success "Firewall rules removed"
    elif command -v firewall-cmd &> /dev/null; then
        print_status "Removing firewalld rules..."
        firewall-cmd --permanent --remove-port=25565/tcp 2>/dev/null || true
        firewall-cmd --permanent --remove-port=8765/tcp 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        print_success "Firewall rules removed"
    else
        print_status "No firewall detected, skipping firewall cleanup"
    fi
}

# Main uninstallation function
main() {
    print_status "Starting Minecraft Server Service Uninstallation..."
    echo ""
    
    check_root
    stop_service
    remove_service_file
    remove_management_script
    remove_firewall_rules
    remove_user_and_data
    
    echo ""
    print_success "Uninstallation completed successfully!"
    echo ""
    print_status "The Minecraft server service has been completely removed."
    print_status "If you kept the minecraft user and data, you can still access them manually."
}

# Run main function
main "$@"