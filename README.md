# 3D Timbre Space Visualization Platform

A web-based platform for visualizing and exploring timbral characteristics of audio files in 3D space. This tool extracts timbre features from audio and maps them to a three-dimensional space for interactive exploration.

## Features

- **Audio Analysis**: Extracts multiple timbral features including:
  - Spectral Centroid (brightness)
  - Spectral Rolloff (high frequency content)
  - Zero Crossing Rate (noisiness)
  - Spectral Flux (spectral change)
  - MFCC (Mel-frequency cepstral coefficients)

- **3D Visualization**: Interactive 3D visualization using Three.js
  - Rotate, zoom, and pan the visualization
  - Color-coded points based on timbral characteristics
  - Multiple points per audio file (overall + time segments)

- **Interactive Features**:
  - Click points to view detailed feature information
  - Adjustable point size
  - Toggle grid and axes
  - Clear visualization

## Getting Started

### Prerequisites

- A modern web browser with Web Audio API support
- Python 3 (usually pre-installed on macOS/Linux, or download from python.org)

**Note:** No npm or Node.js required! This is a pure client-side web application.

### Running the Application

#### Option 1: Using the provided Python script (Recommended)
```bash
cd timbre-visualization
python3 start_server.py
```

This will automatically open your browser to `http://localhost:8080`

#### Option 2: Using Python's built-in server
```bash
cd timbre-visualization
python3 -m http.server 8080
```

Then open your browser and navigate to `http://localhost:8080`

#### Option 3: Using any other HTTP server
You can use any HTTP server you have available. The application just needs to be served over HTTP (not opened as a file:// URL) due to browser security restrictions.

## Quick Start Guide

### Step 1: Start the Server

Open a terminal and navigate to the project directory:

```bash
cd /Users/fsantos/timbre-visualization
```

Then start the server using one of these methods:

**Method 1 (Recommended - Auto-opens browser):**
```bash
python3 start_server.py
```

**Method 2 (Manual - Open browser yourself):**
```bash
python3 -m http.server 8080
```
Then open your browser and go to: `http://localhost:8080`

### Step 2: Use the Application

1. **Upload Audio**: 
   - Click "📁 Upload Audio File" button
   - Select an audio file (WAV, MP3, OGG, M4A, etc.)

2. **Analyze**: 
   - Click "Analyze Audio" button
   - Wait for analysis to complete (status will update)

3. **Play and Visualize**:
   - Click "Play" to start audio playback
   - Watch the 3D visualization update in real-time!
   - A pulsing sphere shows the current position in timbre space
   - A colored trail shows the path through timbre space over time
   - Use "Pause" and "Stop" to control playback

4. **Explore the Visualization**: 
   - **Left-click + drag**: Rotate the 3D space
   - **Right-click + drag**: Pan the view
   - **Scroll wheel**: Zoom in/out
   - **Click on points**: View detailed feature information
   - **Click timeline**: Jump to any position in the audio

5. **Customize**: 
   - Toggle "Show Timbre Trail" to show/hide the path
   - Toggle "Real-time Analysis" for live updates
   - Adjust point size slider
   - Toggle grid and axes visibility

6. **Clear**: Click "Clear All" to reset everything

## Usage Tips

- **Best Results**: Use audio files with clear timbral variation (music, speech, etc.)
- **Performance**: Very long audio files (>10 minutes) may take longer to analyze
- **Browser**: Chrome or Firefox work best for audio processing
- **File Formats**: WAV and MP3 are most reliable across browsers

## Technical Details

### Timbre Features

- **Spectral Centroid**: Measures the "brightness" of sound - higher values indicate brighter sounds
- **Spectral Rolloff**: Indicates the frequency below which a certain percentage of spectral energy is contained
- **Zero Crossing Rate**: Measures how often the signal crosses zero - higher values indicate more noise-like sounds
- **Spectral Flux**: Measures the rate of change in the spectrum over time
- **MFCC**: Mel-frequency cepstral coefficients capture timbral characteristics in a compact form

### 3D Mapping

The features are mapped to 3D space as follows:
- **X-axis**: Spectral Centroid (brightness)
- **Y-axis**: Spectral Rolloff (high frequency content)
- **Z-axis**: Zero Crossing Rate (noisiness)

### Browser Compatibility

This application uses:
- Web Audio API for audio processing
- Three.js for 3D rendering
- Modern JavaScript (ES6+)

Works best in:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## File Structure

```
.
├── index.html          # Main HTML file
├── styles.css          # Styling
├── app.js              # Main application controller
├── audioAnalyzer.js    # Audio analysis module
├── visualizer.js       # 3D visualization module
├── start_server.py     # Python server script (no npm needed!)
├── package.json        # Optional npm configuration (not required)
└── README.md          # This file
```

## Limitations

- Audio analysis is performed client-side, so very large files may take time to process
- The FFT implementation is simplified - for production use, consider using a dedicated FFT library
- Some browsers may have limitations on audio file formats


## License

Apache 2.0

## Acknowledgments

- Three.js for 3D rendering
- Web Audio API for audio processing
