# Quick Start Guide - 3D Timbre Space Visualization

## Getting Started in 3 Steps

### 1: Navigate to the Project
```bash
cd /Users/fsantos/timbre-visualization
```

### 2: Start the Server
```bash
python3 start_server.py
```

This will:
- Start a web server on port 8080
- Automatically open your browser
- Display status messages in the terminal

**To stop the server:** Press `Ctrl+C` in the terminal

### 3: Use the Application

1. **Upload** an audio file (WAV, MP3, OGG, etc.)
2. **Click "Analyze Audio"** to extract timbre features
3. **Click "Play"** to see real-time visualization!

---

## Controls

### Audio Playback
- **Play**: Start playback and real-time visualization
- **Pause**: Pause playback
- **Stop**: Stop and reset to beginning
- **Timeline**: Click anywhere to jump to that position

### 3D Visualization
- **Left Click + Drag**: Rotate view
- **Right Click + Drag**: Pan view  
- **Scroll Wheel**: Zoom in/out
- **Click Points**: View detailed information

### Settings
- **Show Timbre Trail**: Toggle the colored path through timbre space
- **Real-time Analysis**: Enable/disable live updates during playback
- **Point Size**: Adjust size of visualization points
- **Show Grid/Axes**: Toggle reference guides

---

## 📋 What You'll See

When you play audio, you'll see:

1. **Pulsing Sphere** - Current position in timbre space
2. **Colored Trail** - Path showing how timbre changes over time
3. **Static Points** - Overall and segment analysis points
4. **3D Axes**:
   - **X-axis** (Red): Spectral Centroid (Brightness)
   - **Y-axis** (Cyan): Spectral Rolloff (High Frequency)
   - **Z-axis** (Teal): Zero Crossing Rate (Noisiness)

---

## Troubleshooting

### Server won't start?
- **Port 8080 in use?** The script will tell you. Close other servers or change the port in `start_server.py`
- **Python not found?** Try `python` instead of `python3`

### Audio won't play?
- **Browser compatibility**: Use Chrome or Firefox for best results
- **File format**: Try WAV or MP3 format
- **File size**: Very large files may take time to load

### Visualization not updating?
- Make sure "Real-time Analysis" checkbox is checked
- Check browser console (F12) for errors
- Try refreshing the page

### Can't see the 3D visualization?
- Make sure JavaScript is enabled
- Check that Three.js loaded (check browser console)
- Try a different browser

---

## Tips

- **Best for**: Music, speech, or any audio with timbral variation
- **File size**: Works best with files under 50MB
- **Duration**: Short clips (under 5 minutes) analyze fastest
- **Multiple files**: Analyze multiple files to compare timbres!

---

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

---

## Need Help?

Check the full `README.md` for detailed technical information and feature descriptions.
