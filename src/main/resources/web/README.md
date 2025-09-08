# Professional Minecraft Server Dashboard

A modern, responsive web dashboard for monitoring your Fabric Minecraft server metrics in real-time.

## Features

### 🎯 Real-time Monitoring
- **TPS (Ticks Per Second)** - Server performance indicator
- **Tick Time** - Average time per server tick
- **CPU Usage** - Process CPU utilization percentage
- **RAM Usage** - Memory consumption in MB
- **Player Count** - Number of online players
- **Network Latency** - Connection latency in milliseconds

### 📊 Visual Analytics
- **Live Charts** - SVG-based line charts showing historical data
- **Trend Indicators** - Visual arrows showing metric trends (↗ ↘ →)
- **Status Colors** - Color-coded metrics based on performance thresholds
- **Historical Data** - Tracks up to 100 data points for trend analysis

### 🎨 Professional Design
- **Modern UI** - Clean, professional interface with card-based layout
- **Responsive Design** - Works on desktop, tablet, and mobile devices
- **Dark Mode Support** - Automatically adapts to system preferences
- **Smooth Animations** - Hover effects and loading states

### 🔧 Interactive Controls
- **Manual Refresh** - Click to update metrics immediately
- **Auto-refresh Toggle** - Enable/disable automatic updates
- **Connection Status** - Real-time connection indicator
- **Error Handling** - Graceful error messages and recovery

### 📱 Mobile Optimized
- **Touch-friendly** - Large buttons and touch targets
- **Responsive Grid** - Adapts to different screen sizes
- **Optimized Layout** - Stacked layout on mobile devices

## Usage

1. **Access the Dashboard** - Navigate to your server's web interface
2. **Enter Token** - Provide your authentication token when prompted
3. **Monitor Metrics** - View real-time server performance data
4. **Analyze Trends** - Use charts to identify performance patterns

## Technical Details

### Architecture
- **Frontend**: Vanilla JavaScript with modern ES6+ features
- **Styling**: CSS3 with CSS Grid and Flexbox
- **Charts**: SVG-based line charts with gradients
- **Data**: JSON API with 2-second polling interval

### Browser Support
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

### Performance
- **Lightweight** - No external dependencies
- **Efficient** - Optimized DOM updates
- **Responsive** - Smooth 60fps animations
- **Accessible** - WCAG 2.1 compliant

## Customization

### Colors
The dashboard uses CSS custom properties for easy theming:
```css
:root {
  --primary-color: #2563eb;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --danger-color: #ef4444;
}
```

### Metrics Thresholds
Performance thresholds can be adjusted in the JavaScript:
```javascript
// TPS thresholds
if (metric.value >= 19.5) statusClass = 'status-excellent';
else if (metric.value >= 18) statusClass = 'status-good';
// ...
```

### Update Frequency
Change the polling interval:
```javascript
this.updateInterval = 2000; // 2 seconds
```

## Security

- **Token Authentication** - Secure API access
- **Local Storage** - Token persistence (optional)
- **HTTPS Ready** - Works with SSL certificates
- **No External Requests** - All data stays on your server

## Troubleshooting

### Common Issues

**Dashboard not loading**
- Check if the web server is running
- Verify the port configuration
- Ensure firewall allows connections

**No data showing**
- Verify authentication token
- Check server logs for errors
- Ensure metrics collection is enabled

**Charts not updating**
- Check browser console for JavaScript errors
- Verify API endpoint is responding
- Clear browser cache and reload

### Browser Console
Open browser developer tools (F12) to view:
- Network requests to `/api/metrics`
- JavaScript errors or warnings
- Real-time metric data in console

## Future Enhancements

- [ ] WebSocket support for real-time updates
- [ ] Advanced charting with Chart.js
- [ ] Export data functionality
- [ ] Alert system for performance thresholds
- [ ] Multi-server monitoring
- [ ] Custom dashboard layouts
