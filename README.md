# DISTO

**Dashboard for Information, Statistics, Telemetry, and Objects**

A comprehensive Minecraft Fabric mod that provides a web-based dashboard for monitoring server performance, managing users, and executing admin commands. Features real-time metrics, secure authentication, and an intuitive web interface.

## 🚀 Features

### 📊 **Performance Monitoring**
- **Real-time TPS (Ticks Per Second)** monitoring with trend indicators
- **Tick time analysis** with performance charts
- **CPU and Memory usage** tracking
- **Entity counts** and breakdown by type
- **Player statistics** and online status
- **Mod information** and version tracking
- **World data** and dimension statistics

### 🔐 **Secure Authentication System**
- **Password-based authentication** with SHA-256 hashing
- **Session management** with secure tokens
- **Role-based access control** (Admin/User)
- **User management** with admin portal
- **Password change** functionality
- **Account creation** (admin-only)

### 🎮 **Admin Features**
- **Console access** with command execution
- **Player teleportation** to entity locations
- **User management** (create, delete, promote/demote)
- **Real-time console output** monitoring
- **Server command execution**

### 🌐 **Web Interface**
- **Responsive dashboard** with modern UI
- **Real-time updates** via HTTP polling
- **Interactive charts** and visualizations
- **Mobile-friendly** design
- **Dark theme** with customizable colors

## 📋 Requirements

- **Minecraft**: 1.21.8
- **Fabric Loader**: >=0.16.5
- **Fabric API**: >=0.130.0
- **Java**: 21+

## 🛠️ Installation

### 1. Download and Install

1. Go to the [Releases](https://github.com/FireDemon-Tea/DISTO/releases) page
2. Download the latest `disto.jar` from the latest release
3. Place it in your server's `mods` folder
4. Start your server to generate the configuration file

**Note**: The JAR file is automatically built and released on GitHub when new versions are tagged.

### 2. Configuration

The mod will create a `config/disto.json` file on first run:

```json
{
    "configVersion": 3,
    "httpPort": 8765,
    "allowOrigins": ["*"]
}
```

**Important**: Change the default admin password immediately after first login!

### 3. Access the Dashboard

1. Start your Minecraft server
2. Open your browser and navigate to: `http://localhost:8765`
3. Login with the default admin credentials:
   - **Username**: `admin`
   - **Password**: `admin`

**⚠️ Security Warning**: Change the default password immediately after first login!

## 🔧 Configuration Options

| Option | Description | Default | Required |
|--------|-------------|---------|----------|
| `configVersion` | Configuration file version (auto-managed) | `3` | No |
| `httpPort` | Port for the HTTP web dashboard | `8765` | No |
| `httpsPort` | Port for the HTTPS web dashboard | `8766` | No |
| `enableHttps` | Enable HTTPS server | `false` | No |
| `sslKeyPath` | Path to SSL private key file | `config/ssl/private.key` | No |
| `sslCertPath` | Path to SSL certificate file | `config/ssl/certificate.crt` | No |
| `allowOrigins` | CORS allowed origins | `["*"]` | No |

### Configuration Migration

The mod automatically migrates old configuration files to newer versions. When you start the server:

- **New installations**: Creates `config/disto.json` with the latest configuration format
- **Existing installations**: Automatically adds missing configuration options while preserving your existing settings
- **Version tracking**: The `configVersion` field tracks the configuration format version

**Migration from version 1 to 2**: Automatically adds HTTPS support options (`httpsPort`, `enableHttps`, `sslKeyPath`, `sslCertPath`) to existing configurations.

**Migration from version 2 to 3**: Removes `sharedSecret` (replaced by user-based authentication system).

### HTTPS Configuration

**Note**: HTTPS support is currently in development. The configuration options are available but the HTTPS server implementation is a placeholder.

To prepare for HTTPS support:

1. **Generate SSL Certificate** (for development/testing):
   ```bash
   mkdir -p config/ssl
   openssl req -x509 -newkey rsa:4096 -keyout config/ssl/private.key -out config/ssl/certificate.crt -days 365 -nodes
   ```

2. **Update Configuration**:
   ```json
   {
       "configVersion": 3,
       "httpPort": 8765,
       "httpsPort": 8766,
       "enableHttps": true,
       "sslKeyPath": "config/ssl/private.key",
       "sslCertPath": "config/ssl/certificate.crt",
       "allowOrigins": ["*"]
   }
   ```

3. **Current Status**:
   - HTTP: `http://localhost:8765` (fully functional)
   - HTTPS: Configuration ready, server implementation pending

**Note**: BlueMap integration will continue to use HTTP regardless of the dashboard protocol. The dashboard JavaScript automatically detects the current protocol (HTTP/HTTPS) and uses it for API calls.

## 👥 User Management

### Default Admin Account
- **Username**: `admin`
- **Password**: `admin`
- **Role**: Administrator

### Creating New Users
1. Login as an admin user
2. Navigate to the **Admin** tab
3. Click **Create User**
4. Fill in username, password, and admin status
5. Click **Create**

### User Roles

#### **Admin Users**
- View all dashboard metrics
- Access console and execute commands
- Teleport players to entity locations
- Manage users (create, delete, promote/demote)
- Change passwords

#### **Regular Users**
- View dashboard metrics
- Change their own password
- Cannot access admin features

## 📡 API Endpoints

### Public Endpoints
- `GET /api/test` - Server health check
- `POST /api/login` - User authentication

### Authenticated Endpoints
- `GET /api/session` - Session information
- `POST /api/logout` - Logout
- `POST /api/change-password` - Change password
- `GET /api/metrics` - Server metrics

### Admin-Only Endpoints
- `GET /api/console/history` - Console output history
- `POST /api/console` - Execute console commands
- `POST /api/teleport` - Teleport players
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `DELETE /api/admin/users/{username}` - Delete user
- `PUT /api/admin/users/{username}/admin` - Toggle admin status

## 🎨 Dashboard Features

### Performance Tab
- **TPS Monitoring**: Real-time server performance
- **Tick Time Analysis**: Detailed performance metrics
- **CPU Usage**: Process CPU utilization
- **Memory Usage**: RAM consumption tracking

### Players Tab
- **Online Players**: Current player list with locations
- **Player Statistics**: Connection times and data
- **Entity Locations**: Interactive map with teleport options (admin only)

### System Tab
- **Server Information**: Uptime, version, and status
- **World Data**: Dimension information and statistics
- **Mod Information**: Loaded mods and versions

### Console Tab (Admin Only)
- **Real-time Console Output**: Live server logs
- **Command Execution**: Execute server commands
- **Command History**: Previous commands and outputs

### Admin Tab (Admin Only)
- **User Management**: Create, delete, and manage users
- **Admin Controls**: Promote/demote users
- **System Administration**: User account management

## 🔒 Security Features

### Authentication
- **Secure password hashing** with SHA-256 and random salts
- **Session tokens** with expiration
- **Role-based access control**

### Protection Mechanisms
- **Original admin protection**: Cannot delete or demote the original admin
- **Self-protection**: Users cannot delete themselves or change their own admin status
- **Minimum admin requirement**: System always maintains at least one admin
- **CORS protection**: Configurable origin restrictions

### Data Storage
- **Encrypted user database** stored in `config/users.json`
- **Secure session management**
- **No sensitive data in logs**

## 🚨 Troubleshooting

### Common Issues

#### Dashboard Shows Blank/No Data
- **Check server is running**: Ensure Minecraft server is started
- **Verify port**: Confirm the dashboard port (default 8765) is accessible
- **Check authentication**: Ensure you're logged in with valid credentials

#### Cannot Access Dashboard
- **Port conflicts**: Change `httpPort` in config if port 8765 is in use
- **Firewall**: Ensure the configured port is open
- **CORS issues**: Check `allowOrigins` configuration

#### Login Issues
- **Default credentials**: Use `admin`/`admin` for first login
- **Password reset**: Delete `config/users.json` to reset to defaults
- **Session issues**: Clear browser cookies/localStorage

#### Performance Issues
- **High CPU usage**: Reduce polling frequency in dashboard
- **Memory leaks**: Restart server periodically
- **Network issues**: Check server network configuration

### Logs and Debugging

The mod logs important events to the server console:
- `[MetricsBridge] WebServer started on port XXXX`
- `[UserDatabase] Created default admin user`
- `[MetricsBridge] User authentication successful`

## 🔄 Updates and Maintenance

### Updating the Mod
1. Stop your server
2. Download the latest release from [GitHub Releases](https://github.com/FireDemon-Tea/DISTO/releases)
3. Replace the old JAR file with the new version
4. Start your server
5. Configuration and user data will be preserved

### Release Information
- **Automatic Builds**: Every push to main/master triggers a build
- **Releases**: Tagged versions (v1.0.0, v1.1.0, etc.) automatically create releases with downloadable JAR files
- **Versioning**: Follows semantic versioning (MAJOR.MINOR.PATCH)
- **Release Notes**: Automatically generated from commits and pull requests

### Backup Recommendations
- **User database**: Backup `config/users.json`
- **Configuration**: Backup `config/disto.json`
- **Server data**: Regular server backups

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

### Development Setup
1. Clone the repository
2. Run `./gradlew build` to build the mod
3. The built JAR will be in `build/libs/`

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Fabric Team** for the excellent modding framework
- **Javalin** for the lightweight web framework
- **Jackson** for JSON processing
- **Jetty** for the embedded web server

## 📞 Support

If you encounter any issues or have questions:
1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information

---

**Made with ❤️ for the Minecraft community**
