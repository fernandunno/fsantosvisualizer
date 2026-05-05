/**
 * Main Application Controller
 * Coordinates audio analysis and visualization
 */

let audioAnalyzer;
let visualizer;
let currentFile = null;
let audioElement = null;
let audioSource = null;
let isPlaying = false;
let animationFrameId = null;
let fftAnalyser = null;
let fftDataArray = null;
let fftCanvas = null;
let fftCtx = null;
let waveformCanvas = null;
let waveformCtx = null;
let centroidAmpCanvas = null;
let centroidAmpCtx = null;
let centroidAmpHistory = [];
let latestSpectralCentroid = 0;
let centroidPanelResizeObserver = null;
let pitchHarmonicCanvas = null;
let pitchHarmonicCtx = null;
let pitchHarmonicPanelResizeObserver = null;
let harmonicTensionCanvas = null;
let harmonicTensionCtx = null;
let harmonicTensionPanelResizeObserver = null;
let harmonicTensionHistory = [];
let latestHarmonicFrame = null;
let isCurrentMediaVideo = false;
let currentMediaUrl = null;
const VECTOR_MATH_STORAGE_KEY = 'timbreVectorMathSnapshot';
let lastVectorPublishAt = 0;
const VECTOR_PUBLISH_INTERVAL_MS = 250;
let allUiHidden = false;
let analyzedFileName = '';
let analyzedFileSegments = [];
let analyzedFileDuration = 0;
let analysisBroadcastChannel = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        // Initialize audio analyzer (lazy-init on first use to avoid autoplay policy issues)
        audioAnalyzer = new AudioAnalyzer();

        // Initialize visualizer
        visualizer = new TimbreVisualizer('canvas-container');

        // Setup event listeners
        setupEventListeners();
        setupFloatingControls();
        setupFFTCanvas();
        setupHideAllUiControls();
        if (typeof BroadcastChannel !== 'undefined') {
            analysisBroadcastChannel = new BroadcastChannel('timbre-analysis');
        }
        publishVectorMathSnapshot(true);

        updateStatus('Ready to analyze audio');
    } catch (error) {
        console.error('Error initializing app:', error);
        updateStatus('Error initializing application');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // File input
    const fileInput = document.getElementById('audioFile');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            currentFile = e.target.files[0];
            isCurrentMediaVideo = isVideoFile(currentFile);
            document.getElementById('analyzeBtn').disabled = false;
            updateVideoToggleAvailability(isCurrentMediaVideo);
            updateStatus(`File selected: ${currentFile.name}`);
        }
    });

    // Analyze button
    document.getElementById('analyzeBtn').addEventListener('click', async () => {
        if (currentFile) {
            await analyzeAudio(currentFile);
        }
    });

    // Clear button
    document.getElementById('clearBtn').addEventListener('click', () => {
        clearVisualization();
    });

    // Settings
    document.getElementById('showGrid').addEventListener('change', (e) => {
        visualizer.toggleGrid(e.target.checked);
    });

    document.getElementById('showAxes').addEventListener('change', (e) => {
        visualizer.toggleAxes(e.target.checked);
    });

    document.getElementById('autoOrbitMode').addEventListener('change', (e) => {
        visualizer.toggleAutoOrbit(e.target.checked);
    });

    document.getElementById('orbitPointMarkerMode').addEventListener('change', (e) => {
        visualizer.toggleOrbitAroundMarker(e.target.checked);
    });

    document.getElementById('orbitSensitivity').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('orbitSensitivityValue').textContent = value.toFixed(2);
        visualizer.setOrbitSensitivity(value);
    });

    document.getElementById('pointSize').addEventListener('input', (e) => {
        const size = parseFloat(e.target.value);
        document.getElementById('pointSizeValue').textContent = size.toFixed(1);
        visualizer.setPointSize(size);
    });

    document.getElementById('motionSensitivity').addEventListener('input', (e) => {
        const sensitivity = parseFloat(e.target.value);
        document.getElementById('motionSensitivityValue').textContent = sensitivity.toFixed(1);
        visualizer.setSensitivity(sensitivity);
    });

    const amplitudeThresholdEnabledInput = document.getElementById('amplitudeThresholdEnabled');
    const amplitudeThresholdInput = document.getElementById('amplitudeThreshold');
    const amplitudeThresholdValue = document.getElementById('amplitudeThresholdValue');
    const amplitudeThresholdRelativePeakInput = document.getElementById('amplitudeThresholdRelativePeak');
    if (amplitudeThresholdEnabledInput && amplitudeThresholdInput && amplitudeThresholdValue) {
        const applyAmplitudeThresholdSettings = () => {
            const enabled = amplitudeThresholdEnabledInput.checked;
            const threshold = parseFloat(amplitudeThresholdInput.value || '0');
            amplitudeThresholdInput.disabled = !enabled;
            if (amplitudeThresholdRelativePeakInput) {
                amplitudeThresholdRelativePeakInput.disabled = !enabled;
            }
            amplitudeThresholdValue.textContent = threshold.toFixed(3);
            visualizer.setAmplitudeThresholdEnabled(enabled);
            visualizer.setAmplitudeThreshold(threshold);
            visualizer.setAmplitudeThresholdRelativeToPeak(
                !!(enabled && amplitudeThresholdRelativePeakInput?.checked)
            );
        };

        amplitudeThresholdEnabledInput.addEventListener('change', applyAmplitudeThresholdSettings);
        amplitudeThresholdInput.addEventListener('input', applyAmplitudeThresholdSettings);
        if (amplitudeThresholdRelativePeakInput) {
            amplitudeThresholdRelativePeakInput.addEventListener('change', applyAmplitudeThresholdSettings);
        }
        applyAmplitudeThresholdSettings();
    }

    // Point selection events
    document.addEventListener('pointSelected', (e) => {
        showPointInfo(e.detail);
    });

    document.addEventListener('pointDeselected', () => {
        hidePointInfo();
    });

    // Close point info
    document.getElementById('closeInfo').addEventListener('click', () => {
        hidePointInfo();
        visualizer.deselectPoint();
    });

    // Playback controls
    document.getElementById('playBtn').addEventListener('click', () => {
        playAudio();
    });

    document.getElementById('pauseBtn').addEventListener('click', () => {
        pauseAudio();
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
        stopAudio();
    });

    const miniPlayBtn = document.getElementById('miniPlayBtn');
    const miniPauseBtn = document.getElementById('miniPauseBtn');
    const miniStopBtn = document.getElementById('miniStopBtn');
    if (miniPlayBtn) miniPlayBtn.addEventListener('click', () => playAudio());
    if (miniPauseBtn) miniPauseBtn.addEventListener('click', () => pauseAudio());
    if (miniStopBtn) miniStopBtn.addEventListener('click', () => stopAudio());

    // Timeline scrubbing
    const timeline = document.querySelector('.timeline');
    timeline.addEventListener('click', (e) => {
        if (audioElement && audioElement.duration) {
            const rect = timeline.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audioElement.currentTime = percent * audioElement.duration;
        }
    });

    // Settings
    document.getElementById('showTrail').addEventListener('change', (e) => {
        visualizer.toggleTrail(e.target.checked);
    });

    document.getElementById('realTimeMode').addEventListener('change', (e) => {
        // Real-time mode toggle
    });

    document.getElementById('fadePoints').addEventListener('change', (e) => {
        visualizer.setRealTimePointFade(e.target.checked);
    });

    document.getElementById('fadeDuration').addEventListener('input', (e) => {
        const duration = parseFloat(e.target.value);
        document.getElementById('fadeDurationValue').textContent = `${duration.toFixed(1)}s`;
        visualizer.setRealTimePointFadeDuration(duration);
    });

    document.getElementById('rippleMode').addEventListener('change', (e) => {
        visualizer.setRippleMode(e.target.checked);
    });

    document.getElementById('rippleDensity').addEventListener('input', (e) => {
        const density = parseInt(e.target.value, 10);
        document.getElementById('rippleDensityValue').textContent = `${density}`;
        visualizer.setRippleDensity(density);
    });

    document.getElementById('rippleWidth').addEventListener('input', (e) => {
        const width = parseFloat(e.target.value);
        document.getElementById('rippleWidthValue').textContent = width.toFixed(2);
        visualizer.setRippleWidth(width);
    });

    document.getElementById('rippleGlow').addEventListener('input', (e) => {
        const glow = parseFloat(e.target.value);
        document.getElementById('rippleGlowValue').textContent = glow.toFixed(1);
        visualizer.setRippleGlow(glow);
    });

    document.getElementById('rippleOpacity').addEventListener('input', (e) => {
        const opacity = parseFloat(e.target.value);
        document.getElementById('rippleOpacityValue').textContent = opacity.toFixed(2);
        visualizer.setRippleOpacity(opacity);
    });

    document.getElementById('rippleDuration').addEventListener('input', (e) => {
        const duration = parseFloat(e.target.value);
        document.getElementById('rippleDurationValue').textContent = `${duration.toFixed(2)}s`;
        visualizer.setRippleDuration(duration);
    });

    const vectorMathBtn = document.getElementById('openVectorMathBtn');
    if (vectorMathBtn) {
        vectorMathBtn.addEventListener('click', () => {
            const cacheBuster = Date.now();
            window.open(`vectors.html?v=${cacheBuster}`, '_blank', 'noopener');
        });
    }

    const centroidToggleBtn = document.getElementById('toggleCentroidGraphBtn');
    const centroidCloseBtn = document.getElementById('closeCentroidGraphBtn');
    const centroidPanel = document.getElementById('centroidGraphPanel');

    if (centroidToggleBtn && centroidPanel) {
        centroidToggleBtn.addEventListener('click', () => {
            const shouldShow = centroidPanel.classList.contains('hidden');
            setCentroidPanelVisibility(shouldShow);
        });
    }

    if (centroidCloseBtn) {
        centroidCloseBtn.addEventListener('click', () => {
            setCentroidPanelVisibility(false);
        });
    }

    const videoToggleBtn = document.getElementById('toggleVideoOverlayBtn');
    const closeVideoOverlayBtn = document.getElementById('closeVideoOverlayBtn');
    if (videoToggleBtn) {
        videoToggleBtn.addEventListener('click', () => {
            const panel = document.getElementById('videoOverlayPanel');
            const shouldShow = panel ? panel.classList.contains('hidden') : false;
            setVideoOverlayVisibility(shouldShow);
        });
    }
    if (closeVideoOverlayBtn) {
        closeVideoOverlayBtn.addEventListener('click', () => {
            setVideoOverlayVisibility(false);
        });
    }

    const pitchToggleBtn = document.getElementById('togglePitchHarmonicBtn');
    const pitchCloseBtn = document.getElementById('closePitchHarmonicBtn');
    const pitchPanel = document.getElementById('pitchHarmonicPanel');
    if (pitchToggleBtn && pitchPanel) {
        pitchToggleBtn.addEventListener('click', () => {
            const shouldShow = pitchPanel.classList.contains('hidden');
            setPitchHarmonicPanelVisibility(shouldShow);
        });
    }
    if (pitchCloseBtn) {
        pitchCloseBtn.addEventListener('click', () => setPitchHarmonicPanelVisibility(false));
    }
    const tensionToggleBtn = document.getElementById('toggleHarmonicTensionBtn');
    const tensionCloseBtn = document.getElementById('closeHarmonicTensionBtn');
    const tensionPanel = document.getElementById('harmonicTensionPanel');
    if (tensionToggleBtn && tensionPanel) {
        tensionToggleBtn.addEventListener('click', () => {
            const shouldShow = tensionPanel.classList.contains('hidden');
            setHarmonicTensionPanelVisibility(shouldShow);
        });
    }
    if (tensionCloseBtn) {
        tensionCloseBtn.addEventListener('click', () => setHarmonicTensionPanelVisibility(false));
    }

    setupCentroidPanelInteractions();
    setupPitchHarmonicPanelInteractions();
    setupHarmonicTensionPanelInteractions();
    setupVideoOverlayInteractions();
}

function setupHideAllUiControls() {
    const toggleAllUiBtn = document.getElementById('toggleAllUiBtn');
    if (toggleAllUiBtn) {
        toggleAllUiBtn.addEventListener('click', () => {
            setAllUiHidden(!allUiHidden);
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.key === 'h' || event.key === 'H') {
            setAllUiHidden(!allUiHidden);
        } else if ((event.key === 'Escape' || event.key === 'Esc') && allUiHidden) {
            setAllUiHidden(false);
        }
    });
}

function setAllUiHidden(hidden) {
    allUiHidden = !!hidden;
    document.body.classList.toggle('all-ui-hidden', allUiHidden);

    const toggleAllUiBtn = document.getElementById('toggleAllUiBtn');
    if (toggleAllUiBtn) {
        toggleAllUiBtn.textContent = allUiHidden ? 'Show UI' : 'Hide All UI';
    }
}

function isVideoFile(file) {
    if (!file) return false;
    return file.type.startsWith('video/') || /\.mp4$/i.test(file.name || '');
}

function updateVideoToggleAvailability(enabled) {
    const videoToggleBtn = document.getElementById('toggleVideoOverlayBtn');
    if (!videoToggleBtn) return;
    videoToggleBtn.classList.toggle('hidden', !enabled);
    if (!enabled) {
        setVideoOverlayVisibility(false);
    }
}

/**
 * Setup floating controls panel behavior (toggle + drag)
 */
function setupFloatingControls() {
    const controlsPanel = document.getElementById('controlsPanel');
    const dragHandle = document.getElementById('controlsDragHandle');
    const toggleButton = document.getElementById('toggleControlsBtn');

    if (!controlsPanel || !dragHandle || !toggleButton) return;

    toggleButton.addEventListener('click', () => {
        controlsPanel.classList.toggle('is-hidden');
        const isHidden = controlsPanel.classList.contains('is-hidden');
        toggleButton.textContent = isHidden ? 'Show Controls' : 'Hide Controls';
        updateMiniPlaybackTabVisibility(isHidden);
    });

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    dragHandle.addEventListener('mousedown', (event) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;

        const rect = controlsPanel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (event) => {
        if (!isDragging) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        const panelWidth = controlsPanel.offsetWidth;
        const panelHeight = controlsPanel.offsetHeight;
        const maxLeft = window.innerWidth - panelWidth;
        const maxTop = window.innerHeight - panelHeight;

        const nextLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(0, Math.min(maxTop, startTop + dy));

        controlsPanel.style.left = `${nextLeft}px`;
        controlsPanel.style.top = `${nextTop}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
    });

    // Hidden by default while main controls are visible.
    updateMiniPlaybackTabVisibility(false);
}

function updateMiniPlaybackTabVisibility(controlsHidden) {
    const miniTab = document.getElementById('miniPlaybackTab');
    if (!miniTab) return;
    miniTab.classList.toggle('hidden', !controlsHidden);
}

function setPlaybackControlState(enabled) {
    const controlIds = ['playBtn', 'pauseBtn', 'stopBtn', 'miniPlayBtn', 'miniPauseBtn', 'miniStopBtn'];
    controlIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = !enabled;
        }
    });
}

/**
 * Analyze audio file
 */
async function analyzeAudio(file) {
    let hasRawAnalysis = false;
    try {
        updateStatus('Analyzing media...');
        document.getElementById('analyzeBtn').disabled = true;
        isCurrentMediaVideo = isVideoFile(file);
        updateVideoToggleAvailability(isCurrentMediaVideo);

        // Clear previous visualization before analyzing new file
        visualizer.clearPoints();
        stopAudio(); // Also stop any playing audio

        let features = null;
        try {
            features = await audioAnalyzer.analyzeFile(file);
            analyzedFileName = file.name || 'audio';
            analyzedFileSegments = Array.isArray(features?.segments) ? features.segments : [];
            analyzedFileDuration = Number.isFinite(features?.overall?.duration) ? features.overall.duration : 0;
            hasRawAnalysis = analyzedFileSegments.length > 0;
            seedCentroidAmplitudeFromSegments(features?.segments || []);
            seedHarmonicTensionFromSegments(features?.segments || []);
        } catch (analysisError) {
            // Some mp4 codecs/containers may not decode for full-file analysis in all browsers.
            if (!isCurrentMediaVideo) {
                throw analysisError;
            }
            console.warn('Full-file analysis not available for this video; continuing with real-time analysis.', analysisError);
            analyzedFileName = file.name || 'audio';
            analyzedFileSegments = [];
            analyzedFileDuration = 0;
            seedCentroidAmplitudeFromSegments([]);
            seedHarmonicTensionFromSegments([]);
        }

        // Store decoded buffer if available (used for time-segment feature extraction).
        audioAnalyzer.audioBuffer = null;
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioAnalyzer.audioContext.decodeAudioData(arrayBuffer.slice(0));
            audioAnalyzer.audioBuffer = audioBuffer;
            analyzedFileDuration = Number.isFinite(audioBuffer?.duration) ? audioBuffer.duration : analyzedFileDuration;
            // If full-file analysis failed but decode succeeded, derive file segments now.
            if (analyzedFileSegments.length === 0) {
                const channelData = audioBuffer.getChannelData(0);
                const segmentCount = typeof audioAnalyzer.getRecommendedSegmentCount === 'function'
                    ? audioAnalyzer.getRecommendedSegmentCount(audioBuffer.duration)
                    : 10;
                analyzedFileSegments = audioAnalyzer.calculateSegmentFeatures(channelData, audioBuffer.sampleRate, segmentCount);
                seedCentroidAmplitudeFromSegments(analyzedFileSegments);
                seedHarmonicTensionFromSegments(analyzedFileSegments);
            }
            hasRawAnalysis = analyzedFileSegments.length > 0;
        } catch (decodeError) {
            console.warn('Could not decode media buffer for time-segment analysis.', decodeError);
        }

        // Publish raw-file analysis snapshot immediately so Analysis tab has stable data,
        // independent of downstream playback/media-element setup.
        updatePointCount();
        publishVectorMathSnapshot(true);

        if (currentMediaUrl) {
            URL.revokeObjectURL(currentMediaUrl);
            currentMediaUrl = null;
        }
        currentMediaUrl = URL.createObjectURL(file);
        audioElement = createPlaybackMediaElement(currentMediaUrl, isCurrentMediaVideo);
        setupFFTForAudioElement();

        updateStatus(`Analysis complete: ${file.name}${audioAnalyzer.audioBuffer ? '' : ' (real-time mode)'}`);
        document.getElementById('analyzeBtn').disabled = false;
        
        // Enable playback controls
        setPlaybackControlState(true);

    } catch (error) {
        console.error('Error analyzing audio:', error);
        updateStatus(`Error: ${error.message}`);
        document.getElementById('analyzeBtn').disabled = false;
        setPlaybackControlState(false);
        // Keep latest raw analysis snapshot if it was already extracted.
        // Only clear when analysis itself did not produce data.
        if (!hasRawAnalysis) {
            analyzedFileName = '';
            analyzedFileSegments = [];
            analyzedFileDuration = 0;
            updatePointCount();
            publishVectorMathSnapshot(true);
        }
    }
}

/**
 * Play audio with real-time visualization
 */
function playAudio() {
    if (!audioElement) return;

    if (audioAnalyzer.audioContext && audioAnalyzer.audioContext.state === 'suspended') {
        audioAnalyzer.audioContext.resume();
    }

    audioElement.play().catch((error) => {
        console.error('Playback error:', error);
        updateStatus(`Playback error: ${error.message}`);
    });
    isPlaying = true;
    updateStatus('Playing...');

    // Setup real-time analysis
    setupRealTimeVisualization();

    // Start update loop
    startVisualizationLoop();
}

/**
 * Setup real-time visualization
 */
function setupRealTimeVisualization() {
    // Clear previous real-time data
    visualizer.clearTrail();
    visualizer.clearCurrentPosition();
    window.realTimeAnalysis = null;

    const fadeEnabled = document.getElementById('fadePoints')?.checked ?? true;
    const fadeDuration = parseFloat(document.getElementById('fadeDuration')?.value || '1.4');
    const rippleMode = document.getElementById('rippleMode')?.checked ?? false;
    const rippleDensity = parseInt(document.getElementById('rippleDensity')?.value || '3', 10);
    const rippleWidth = parseFloat(document.getElementById('rippleWidth')?.value || '0.12');
    const rippleGlow = parseFloat(document.getElementById('rippleGlow')?.value || '1.3');
    const rippleOpacity = parseFloat(document.getElementById('rippleOpacity')?.value || '1.0');
    const rippleDuration = parseFloat(document.getElementById('rippleDuration')?.value || '0.9');
    visualizer.setRealTimePointFade(fadeEnabled);
    visualizer.setRealTimePointFadeDuration(fadeDuration);
    visualizer.setRippleMode(rippleMode);
    visualizer.setRippleDensity(rippleDensity);
    visualizer.setRippleWidth(rippleWidth);
    visualizer.setRippleGlow(rippleGlow);
    visualizer.setRippleOpacity(rippleOpacity);
    visualizer.setRippleDuration(rippleDuration);

    // Analyze in real-time as audio plays
    const realTimeMode = document.getElementById('realTimeMode').checked;
    
    if (realTimeMode) {
        // Use time-based analysis
        startTimeBasedAnalysis();
    }
}

/**
 * Start time-based analysis loop
 */
function startTimeBasedAnalysis() {
    let lastAnalysisTime = 0;
    const analysisInterval = 0.05; // Analyze every 50ms

    function analyzeCurrentTime() {
        if (!isPlaying || !audioElement) return;

        const currentTime = audioElement.currentTime;
        
        // Only analyze if enough time has passed
        if (currentTime - lastAnalysisTime >= analysisInterval) {
            let features = null;
            if (audioAnalyzer.audioBuffer) {
                features = audioAnalyzer.analyzeTimeSegment(currentTime, analysisInterval);
            } else {
                features = estimateFeaturesFromAnalyser(currentTime);
            }
            
            if (features) {
                latestSpectralCentroid = features.spectralCentroid || 0;
                pushHarmonicTensionPoint(features, currentTime);
                visualizer.updateRealTimePoint(features, {
                    fileName: currentFile?.name || 'audio',
                    type: 'realtime',
                    time: currentTime
                });
            }
            
            lastAnalysisTime = currentTime;
        }
    }

    // Store function for cleanup
    window.realTimeAnalysis = analyzeCurrentTime;
}

/**
 * Estimate timbre features from the live analyser node.
 * Used as fallback when full media decode is unavailable.
 */
function estimateFeaturesFromAnalyser(currentTime) {
    if (!fftAnalyser) return null;

    const binCount = fftAnalyser.frequencyBinCount;
    const timeData = new Uint8Array(fftAnalyser.fftSize);
    fftAnalyser.getByteTimeDomainData(timeData);

    const sampleRate = audioAnalyzer?.audioContext?.sampleRate || 44100;
    const fftSize = fftAnalyser.fftSize;

    const rawFreq = new Float32Array(binCount);
    if (typeof fftAnalyser.getFloatFrequencyData === 'function') {
        fftAnalyser.getFloatFrequencyData(rawFreq);
    } else {
        const freqData = new Uint8Array(binCount);
        fftAnalyser.getByteFrequencyData(freqData);
        for (let i = 0; i < binCount; i++) {
            rawFreq[i] = freqData[i] / 255;
        }
    }

    const magnitudes = audioAnalyzer && typeof audioAnalyzer.linearizeAnalyserMagnitudeFrame === 'function'
        ? audioAnalyzer.linearizeAnalyserMagnitudeFrame(rawFreq)
        : rawFreq;

    let pitchHarmonic = {
        fundamentalHz: null,
        pitchConfidence: 0,
        harmonicAmplitudes: []
    };
    if (audioAnalyzer && typeof audioAnalyzer.analyzePitchHarmonicsFromMagnitudes === 'function') {
        pitchHarmonic = audioAnalyzer.analyzePitchHarmonicsFromMagnitudes(magnitudes, sampleRate, fftSize, {
            alreadyLinear: true
        });
    }

    const nyquist = sampleRate / 2;

    let weighted = 0;
    let total = 0;
    let energyTotal = 0;
    for (let i = 0; i < magnitudes.length; i++) {
        const mag = magnitudes[i];
        const freq = (i / magnitudes.length) * nyquist;
        weighted += freq * mag;
        total += mag;
        energyTotal += mag * mag;
    }
    const spectralCentroid = total > 0 ? weighted / total : 0;

    // Spectral rolloff (85% cumulative energy).
    const rolloffTarget = energyTotal * 0.85;
    let cumulative = 0;
    let rolloffBin = 0;
    for (let i = 0; i < magnitudes.length; i++) {
        cumulative += magnitudes[i] * magnitudes[i];
        if (cumulative >= rolloffTarget) {
            rolloffBin = i;
            break;
        }
    }
    const spectralRolloff = (rolloffBin / magnitudes.length) * nyquist;

    let crossings = 0;
    let sumSquares = 0;
    let prev = (timeData[0] - 128) / 128;
    sumSquares += prev * prev;
    for (let i = 1; i < timeData.length; i++) {
        const value = (timeData[i] - 128) / 128;
        if ((value >= 0) !== (prev >= 0)) crossings++;
        sumSquares += value * value;
        prev = value;
    }
    const zeroCrossingRate = crossings / Math.max(1, timeData.length - 1);
    const amplitude = Math.max(0, Math.min(1, Math.sqrt(sumSquares / timeData.length)));

    return {
        spectralCentroid,
        spectralRolloff,
        zeroCrossingRate,
        amplitude,
        spectralFlux: 0,
        time: currentTime,
        fundamentalHz: pitchHarmonic.fundamentalHz,
        pitchConfidence: pitchHarmonic.pitchConfidence,
        harmonicAmplitudes: pitchHarmonic.harmonicAmplitudes
    };
}

/**
 * Start visualization update loop
 */
function startVisualizationLoop() {
    function updateLoop() {
        if (isPlaying && audioElement) {
            if (window.realTimeAnalysis) {
                window.realTimeAnalysis();
            }
            renderFFT();
            renderPitchHarmonicDisplay();
            renderHarmonicTensionDisplay();
            renderWaveform();
            renderCentroidAmplitude();
            animationFrameId = requestAnimationFrame(updateLoop);
        }
    }
    updateLoop();
}

function setCentroidPanelVisibility(show) {
    const centroidPanel = document.getElementById('centroidGraphPanel');
    const centroidToggleBtn = document.getElementById('toggleCentroidGraphBtn');
    if (!centroidPanel || !centroidToggleBtn) return;

    centroidPanel.classList.toggle('hidden', !show);
    centroidToggleBtn.textContent = show ? 'Hide Centroid Graph' : 'Show Centroid Graph';

    // Recalculate canvas resolution after visibility changes.
    resizeFFTCanvas();
    drawCentroidAmplitudeGraph();
}

function setPitchHarmonicPanelVisibility(show) {
    const panel = document.getElementById('pitchHarmonicPanel');
    const toggleBtn = document.getElementById('togglePitchHarmonicBtn');
    if (!panel || !toggleBtn) return;

    panel.classList.toggle('hidden', !show);
    toggleBtn.textContent = show ? 'Hide Pitch / Harmonics' : 'Show Pitch / Harmonics';

    resizePitchHarmonicCanvas();
}

function setHarmonicTensionPanelVisibility(show) {
    const panel = document.getElementById('harmonicTensionPanel');
    const toggleBtn = document.getElementById('toggleHarmonicTensionBtn');
    if (!panel || !toggleBtn) return;
    panel.classList.toggle('hidden', !show);
    toggleBtn.textContent = show ? 'Hide Harmonic Tension' : 'Show Harmonic Tension';
    resizeHarmonicTensionCanvas();
}

function setVideoOverlayVisibility(show) {
    const panel = document.getElementById('videoOverlayPanel');
    const toggleBtn = document.getElementById('toggleVideoOverlayBtn');
    if (!panel || !toggleBtn) return;
    panel.classList.toggle('hidden', !show);
    toggleBtn.textContent = show ? 'Hide Video' : 'Show Video';
}

function createPlaybackMediaElement(mediaUrl, isVideo) {
    if (!mediaUrl) return null;

    const overlayContent = document.getElementById('videoOverlayContent');
    if (overlayContent) {
        overlayContent.innerHTML = '';
    }

    let mediaEl;
    if (isVideo) {
        const videoEl = document.createElement('video');
        videoEl.src = mediaUrl;
        videoEl.playsInline = true;
        videoEl.preload = 'auto';
        videoEl.controls = false;
        videoEl.crossOrigin = 'anonymous';
        mediaEl = videoEl;
        if (overlayContent) {
            overlayContent.appendChild(videoEl);
        }
        setVideoOverlayVisibility(true);
    } else {
        mediaEl = new Audio(mediaUrl);
        setVideoOverlayVisibility(false);
    }

    mediaEl.addEventListener('loadedmetadata', () => {
        updateTotalTime(mediaEl.duration);
    });
    mediaEl.addEventListener('timeupdate', () => {
        updateTimeline(mediaEl.currentTime, mediaEl.duration);
    });
    mediaEl.addEventListener('ended', () => {
        stopAudio();
    });
    mediaEl.load();
    return mediaEl;
}

function setupVideoOverlayInteractions() {
    const panel = document.getElementById('videoOverlayPanel');
    const dragHandle = document.getElementById('videoOverlayDragHandle');
    const resizeHandle = document.getElementById('videoOverlayResizeHandle');
    if (!panel || !dragHandle) return;

    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;
    const minWidth = 320;
    const minHeight = 220;

    dragHandle.addEventListener('mousedown', (event) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (event) => {
        if (isResizing) {
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const maxWidth = Math.max(minWidth, window.innerWidth - panel.offsetLeft);
            const maxHeight = Math.max(minHeight, window.innerHeight - panel.offsetTop);
            const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
            const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
            panel.style.width = `${nextWidth}px`;
            panel.style.height = `${nextHeight}px`;
            return;
        }

        if (!isDragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const panelWidth = panel.offsetWidth;
        const panelHeight = panel.offsetHeight;
        const maxLeft = Math.max(0, window.innerWidth - panelWidth);
        const maxTop = Math.max(0, window.innerHeight - panelHeight);
        const nextLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(0, Math.min(maxTop, startTop + dy));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
        panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging && !isResizing) return;
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
    });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (event) => {
            event.stopPropagation();
            isResizing = true;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;
            document.body.style.userSelect = 'none';
        });
    }
}

/**
 * Make centroid graph panel draggable and keep redraw crisp on resize.
 */
function setupCentroidPanelInteractions() {
    const centroidPanel = document.getElementById('centroidGraphPanel');
    const dragHandle = document.getElementById('centroidGraphDragHandle');
    const resizeHandle = document.getElementById('centroidGraphResizeHandle');
    if (!centroidPanel || !dragHandle) return;

    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;
    const minWidth = 420;
    const minHeight = 260;

    dragHandle.addEventListener('mousedown', (event) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;

        const rect = centroidPanel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (event) => {
        if (isResizing) {
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const maxWidth = Math.max(minWidth, window.innerWidth - centroidPanel.offsetLeft);
            const maxHeight = Math.max(minHeight, window.innerHeight - centroidPanel.offsetTop);
            const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
            const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
            centroidPanel.style.width = `${nextWidth}px`;
            centroidPanel.style.height = `${nextHeight}px`;
            return;
        }

        if (!isDragging) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        const panelWidth = centroidPanel.offsetWidth;
        const panelHeight = centroidPanel.offsetHeight;
        const maxLeft = Math.max(0, window.innerWidth - panelWidth);
        const maxTop = Math.max(0, window.innerHeight - panelHeight);

        const nextLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(0, Math.min(maxTop, startTop + dy));

        centroidPanel.style.left = `${nextLeft}px`;
        centroidPanel.style.top = `${nextTop}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging && !isResizing) return;
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
    });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (event) => {
            event.stopPropagation();
            isResizing = true;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = centroidPanel.offsetWidth;
            startHeight = centroidPanel.offsetHeight;
            document.body.style.userSelect = 'none';
        });
    }

    if (typeof ResizeObserver !== 'undefined') {
        if (centroidPanelResizeObserver) {
            centroidPanelResizeObserver.disconnect();
        }
        centroidPanelResizeObserver = new ResizeObserver(() => {
            resizeFFTCanvas();
            drawCentroidAmplitudeGraph();
        });
        centroidPanelResizeObserver.observe(centroidPanel);
    }
}

function setupPitchHarmonicPanelInteractions() {
    const panel = document.getElementById('pitchHarmonicPanel');
    const dragHandle = document.getElementById('pitchHarmonicDragHandle');
    const resizeHandle = document.getElementById('pitchHarmonicResizeHandle');
    if (!panel || !dragHandle) return;

    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;
    const minWidth = 320;
    const minHeight = 240;

    dragHandle.addEventListener('mousedown', (event) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.bottom = 'auto';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (event) => {
        if (isResizing) {
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const maxWidth = Math.max(minWidth, window.innerWidth - panel.offsetLeft);
            const maxHeight = Math.max(minHeight, window.innerHeight - panel.offsetTop);
            const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
            const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
            panel.style.width = `${nextWidth}px`;
            panel.style.height = `${nextHeight}px`;
            return;
        }

        if (!isDragging) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const panelWidth = panel.offsetWidth;
        const panelHeight = panel.offsetHeight;
        const maxLeft = Math.max(0, window.innerWidth - panelWidth);
        const maxTop = Math.max(0, window.innerHeight - panelHeight);
        const nextLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(0, Math.min(maxTop, startTop + dy));

        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging && !isResizing) return;
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
    });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (event) => {
            event.stopPropagation();
            isResizing = true;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;
            panel.style.bottom = 'auto';
            document.body.style.userSelect = 'none';
        });
    }

    if (typeof ResizeObserver !== 'undefined') {
        if (pitchHarmonicPanelResizeObserver) {
            pitchHarmonicPanelResizeObserver.disconnect();
        }
        pitchHarmonicPanelResizeObserver = new ResizeObserver(() => {
            resizePitchHarmonicCanvas();
        });
        pitchHarmonicPanelResizeObserver.observe(panel);
    }
}

function setupHarmonicTensionPanelInteractions() {
    const panel = document.getElementById('harmonicTensionPanel');
    const dragHandle = document.getElementById('harmonicTensionDragHandle');
    const resizeHandle = document.getElementById('harmonicTensionResizeHandle');
    if (!panel || !dragHandle) return;

    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;
    const minWidth = 340;
    const minHeight = 240;

    dragHandle.addEventListener('mousedown', (event) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (event) => {
        if (isResizing) {
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const maxWidth = Math.max(minWidth, window.innerWidth - panel.offsetLeft);
            const maxHeight = Math.max(minHeight, window.innerHeight - panel.offsetTop);
            const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
            const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
            panel.style.width = `${nextWidth}px`;
            panel.style.height = `${nextHeight}px`;
            return;
        }
        if (!isDragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const panelWidth = panel.offsetWidth;
        const panelHeight = panel.offsetHeight;
        const maxLeft = Math.max(0, window.innerWidth - panelWidth);
        const maxTop = Math.max(0, window.innerHeight - panelHeight);
        const nextLeft = Math.max(0, Math.min(maxLeft, startLeft + dx));
        const nextTop = Math.max(0, Math.min(maxTop, startTop + dy));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging && !isResizing) return;
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
    });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (event) => {
            event.stopPropagation();
            isResizing = true;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
            document.body.style.userSelect = 'none';
        });
    }

    if (typeof ResizeObserver !== 'undefined') {
        if (harmonicTensionPanelResizeObserver) {
            harmonicTensionPanelResizeObserver.disconnect();
        }
        harmonicTensionPanelResizeObserver = new ResizeObserver(() => {
            resizeHarmonicTensionCanvas();
        });
        harmonicTensionPanelResizeObserver.observe(panel);
    }
}

/**
 * Pre-populate centroid/amplitude graph from analyzed segments.
 */
function seedCentroidAmplitudeFromSegments(segments) {
    if (!Array.isArray(segments)) return;

    centroidAmpHistory = segments
        .map((segment) => ({
            centroidHz: Math.max(0, Math.min(15000, segment?.spectralCentroid || 0)),
            amplitude: Math.max(0, Math.min(1, segment?.amplitude || 0))
        }))
        .filter((point) => Number.isFinite(point.centroidHz) && Number.isFinite(point.amplitude));

    if (centroidAmpHistory.length > 0) {
        latestSpectralCentroid = centroidAmpHistory[centroidAmpHistory.length - 1].centroidHz;
    } else {
        latestSpectralCentroid = 0;
    }

    drawCentroidAmplitudeGraph();
}

function buildNormalizedHarmonicVector(harmonics, maxHarmonics = 10) {
    const vec = new Array(maxHarmonics).fill(0);
    if (!Array.isArray(harmonics) || harmonics.length === 0) return vec;
    for (const h of harmonics) {
        const idx = (Number.isFinite(h?.harmonic) ? h.harmonic : 0) - 1;
        if (idx < 0 || idx >= maxHarmonics) continue;
        vec[idx] = Math.max(0, Number.isFinite(h?.normalized) ? h.normalized : 0);
    }
    return vec;
}

function computeSpectralIrregularity(harmonics) {
    const vec = buildNormalizedHarmonicVector(harmonics, 12);
    let diffSum = 0;
    let ampSum = 0;
    for (let i = 0; i < vec.length - 1; i++) {
        diffSum += Math.abs(vec[i] - vec[i + 1]);
    }
    for (let i = 0; i < vec.length; i++) {
        ampSum += vec[i];
    }
    return Math.max(0, Math.min(1, diffSum / Math.max(1e-6, ampSum)));
}

function computeHarmonicChangeDetection(currentVector, previousVector) {
    if (!Array.isArray(currentVector) || !Array.isArray(previousVector)) return 0;
    const n = Math.min(currentVector.length, previousVector.length);
    if (n <= 0) return 0;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += Math.abs(currentVector[i] - previousVector[i]);
        den += previousVector[i];
    }
    return Math.max(0, Math.min(1, num / Math.max(1e-6, den + 0.15)));
}

function computePhraseLevelLAT(timeSec, spectralIrregularity) {
    const phraseWindowSec = 6.0;
    const recent = harmonicTensionHistory.filter(
        (point) => (timeSec - point.time) >= 0 && (timeSec - point.time) <= phraseWindowSec
    );
    if (recent.length < 2) {
        return {
            phraseLatSec: 0.35,
            phraseLatNorm: 0.45
        };
    }

    let troughIdx = 0;
    for (let i = 1; i < recent.length; i++) {
        if ((recent[i].spectralIrregularity ?? 1) < (recent[troughIdx].spectralIrregularity ?? 1)) {
            troughIdx = i;
        }
    }
    const phraseStartTime = recent[troughIdx].time;
    const attackSec = Math.max(0.03, Math.min(2.5, timeSec - phraseStartTime));
    const latLog = Math.log10(attackSec);
    const latNormBase = Math.max(0, Math.min(1, (latLog + 1.45) / 1.85));
    const irregularityGain = 0.45 + (0.55 * Math.max(0, Math.min(1, spectralIrregularity)));
    return {
        phraseLatSec: attackSec,
        phraseLatNorm: Math.max(0, Math.min(1, latNormBase * irregularityGain))
    };
}

function computeHarmonicTensionFromFeatures(features, timeSec = 0, usePhraseHistory = true) {
    const harmonics = Array.isArray(features?.harmonicAmplitudes) ? features.harmonicAmplitudes : [];
    const pitchConfidence = Number.isFinite(features?.pitchConfidence) ? features.pitchConfidence : 0;
    const spectralFlux = Number.isFinite(features?.spectralFlux) ? features.spectralFlux : 0;
    const rms = Math.max(0, Math.min(1, Number.isFinite(features?.amplitude) ? features.amplitude : 0));
    if (harmonics.length === 0) {
        return { tension: 0.5, release: 0.5, confidence: 0 };
    }

    const harmonicVector = buildNormalizedHarmonicVector(harmonics, 10);
    const spectralIrregularity = computeSpectralIrregularity(harmonics);
    const previousVector = harmonicTensionHistory.length > 0 ? harmonicTensionHistory[harmonicTensionHistory.length - 1].harmonicVector : null;
    const harmonicChange = computeHarmonicChangeDetection(harmonicVector, previousVector);
    const loudnessDb = 20 * Math.log10(rms + 1e-4);
    const loudnessNorm = Math.max(0, Math.min(1, (loudnessDb + 50) / 50));
    const latState = computePhraseLevelLAT(timeSec, spectralIrregularity);
    const fluxNorm = Math.max(0, Math.min(1, spectralFlux / 0.25));
    const pitchInstability = 1 - Math.max(0, Math.min(1, pitchConfidence));

    // Buffed descriptor mix with phrase-level LAT modulation.
    const raw = Math.max(0, Math.min(1,
        (0.15 * rms) +
        (0.20 * loudnessNorm) +
        (0.23 * spectralIrregularity) +
        (0.17 * latState.phraseLatNorm) +
        (0.22 * harmonicChange) +
        (0.03 * fluxNorm) +
        (0.02 * pitchInstability)
    ));
    let tension = raw;
    if (usePhraseHistory) {
        const phraseWindowSec = 6.0;
        const recentRaw = harmonicTensionHistory
            .filter((point) => (timeSec - point.time) >= 0 && (timeSec - point.time) <= phraseWindowSec)
            .map((point) => point.raw);
        recentRaw.push(raw);
        const sorted = recentRaw.slice().sort((a, b) => a - b);
        const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
        const median = sorted.length > 0 ? q(0.5) : raw;
        const iqr = Math.max(0.06, q(0.75) - q(0.25));
        const phraseLift = 0.5 + 0.5 * Math.tanh((raw - median) / (iqr * 1.4));
        tension = Math.max(0, Math.min(1, (0.52 * raw) + (0.48 * phraseLift)));
        if (latestHarmonicFrame && Number.isFinite(latestHarmonicFrame.tension)) {
            tension = (0.7 * latestHarmonicFrame.tension) + (0.3 * tension);
        }
    }
    return {
        tension,
        release: 1 - tension,
        confidence: Math.max(0, Math.min(1, pitchConfidence)),
        raw,
        rms,
        loudnessNorm,
        loudnessDb,
        spectralIrregularity,
        harmonicChange,
        phraseLatSec: latState.phraseLatSec,
        phraseLatNorm: latState.phraseLatNorm,
        harmonicVector
    };
}

function pushHarmonicTensionPoint(features, timeSec) {
    const tensionModel = computeHarmonicTensionFromFeatures(features, timeSec);
    if (harmonicTensionHistory.length > 0) {
        const last = harmonicTensionHistory[harmonicTensionHistory.length - 1];
        if (Math.abs((Number.isFinite(timeSec) ? timeSec : 0) - last.time) < 0.02) {
            return;
        }
    }
    const point = {
        time: Number.isFinite(timeSec) ? timeSec : 0,
        tension: tensionModel.tension,
        release: tensionModel.release,
        confidence: tensionModel.confidence,
        raw: tensionModel.raw,
        rms: tensionModel.rms,
        loudnessNorm: tensionModel.loudnessNorm,
        loudnessDb: tensionModel.loudnessDb,
        spectralIrregularity: tensionModel.spectralIrregularity,
        harmonicChange: tensionModel.harmonicChange,
        phraseLatSec: tensionModel.phraseLatSec,
        phraseLatNorm: tensionModel.phraseLatNorm,
        harmonicVector: Array.isArray(tensionModel.harmonicVector) ? tensionModel.harmonicVector.slice() : []
    };
    latestHarmonicFrame = point;
    harmonicTensionHistory.push(point);
    if (harmonicTensionHistory.length > 480) {
        harmonicTensionHistory.shift();
    }
}

function seedHarmonicTensionFromSegments(segments) {
    if (!Array.isArray(segments)) {
        harmonicTensionHistory = [];
        latestHarmonicFrame = null;
        return;
    }
    harmonicTensionHistory = [];
    const sorted = segments.slice().sort((a, b) => (a?.time || 0) - (b?.time || 0));
    for (const segment of sorted) {
        pushHarmonicTensionPoint(segment, Number.isFinite(segment?.time) ? segment.time : 0);
    }
}

/**
 * Pause audio
 */
function pauseAudio() {
    if (audioElement) {
        audioElement.pause();
        isPlaying = false;
        updateStatus('Paused');
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
}

/**
 * Stop audio
 */
function stopAudio() {
    if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
        isPlaying = false;
        updateStatus('Stopped');
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Clear real-time visualization
        visualizer.clearCurrentPosition();
        updateTimeline(0, audioElement.duration || 0);
        clearFFT();
        clearWaveform();
        clearCentroidAmplitude();
        clearHarmonicTensionDisplay();
        renderPitchHarmonicDisplay();
        renderHarmonicTensionDisplay();
        publishVectorMathSnapshot(true);
    }
}

/**
 * Update timeline display
 */
function updateTimeline(currentTime, duration) {
    if (!duration) return;
    
    const percent = (currentTime / duration) * 100;
    document.getElementById('timelineProgress').style.width = percent + '%';
    document.getElementById('timelineHandle').style.left = percent + '%';
    document.getElementById('currentTime').textContent = formatTime(currentTime);
}

/**
 * Update total time display
 */
function updateTotalTime(duration) {
    document.getElementById('totalTime').textContent = formatTime(duration);
}

/**
 * Format time as MM:SS
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Clear visualization
 */
function clearVisualization() {
    stopAudio();
    
    if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
        audioElement = null;
    }
    if (currentMediaUrl) {
        URL.revokeObjectURL(currentMediaUrl);
        currentMediaUrl = null;
    }
    const overlayContent = document.getElementById('videoOverlayContent');
    if (overlayContent) {
        overlayContent.innerHTML = '';
    }
    isCurrentMediaVideo = false;
    updateVideoToggleAvailability(false);
    setVideoOverlayVisibility(false);
    
    visualizer.clearPoints();
    analyzedFileName = '';
    analyzedFileSegments = [];
    analyzedFileDuration = 0;
    currentFile = null;
    document.getElementById('audioFile').value = '';
    document.getElementById('analyzeBtn').disabled = true;
    setPlaybackControlState(false);
    updatePointCount();
    updateStatus('Visualization cleared');
    hidePointInfo();
    updateTimeline(0, 0);
    updateTotalTime(0);
    clearFFT();
    clearWaveform();
    clearCentroidAmplitude();
    clearHarmonicTensionDisplay();
    harmonicTensionHistory = [];
    latestHarmonicFrame = null;
    renderPitchHarmonicDisplay();
    renderHarmonicTensionDisplay();
    publishVectorMathSnapshot(true);
}

/**
 * Setup FFT canvas context
 */
function setupFFTCanvas() {
    fftCanvas = document.getElementById('fftCanvas');
    waveformCanvas = document.getElementById('waveformCanvas');
    centroidAmpCanvas = document.getElementById('centroidAmpCanvas');
    pitchHarmonicCanvas = document.getElementById('pitchHarmonicCanvas');
    harmonicTensionCanvas = document.getElementById('harmonicTensionCanvas');
    if (!fftCanvas || !waveformCanvas || !centroidAmpCanvas) return;
    fftCtx = fftCanvas.getContext('2d');
    waveformCtx = waveformCanvas.getContext('2d');
    centroidAmpCtx = centroidAmpCanvas.getContext('2d');
    pitchHarmonicCtx = pitchHarmonicCanvas ? pitchHarmonicCanvas.getContext('2d') : null;
    harmonicTensionCtx = harmonicTensionCanvas ? harmonicTensionCanvas.getContext('2d') : null;
    resizeFFTCanvas();
    window.addEventListener('resize', resizeFFTCanvas);
}

/**
 * Resize FFT canvas for crisp rendering
 */
function resizeFFTCanvas() {
    if (!fftCanvas || !fftCtx || !waveformCanvas || !waveformCtx || !centroidAmpCanvas || !centroidAmpCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const fftWidth = fftCanvas.clientWidth || 400;
    const fftHeight = fftCanvas.clientHeight || 110;
    fftCanvas.width = Math.floor(fftWidth * dpr);
    fftCanvas.height = Math.floor(fftHeight * dpr);
    fftCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const waveformWidth = waveformCanvas.clientWidth || 400;
    const waveformHeight = waveformCanvas.clientHeight || 140;
    waveformCanvas.width = Math.floor(waveformWidth * dpr);
    waveformCanvas.height = Math.floor(waveformHeight * dpr);
    waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const centroidWidth = centroidAmpCanvas.clientWidth || 400;
    const centroidHeight = centroidAmpCanvas.clientHeight || 165;
    centroidAmpCanvas.width = Math.floor(centroidWidth * dpr);
    centroidAmpCanvas.height = Math.floor(centroidHeight * dpr);
    centroidAmpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    resizePitchHarmonicCanvas();
    resizeHarmonicTensionCanvas();

    clearFFT();
    clearWaveform();
    clearCentroidAmplitude();
}

function resizePitchHarmonicCanvas() {
    if (!pitchHarmonicCanvas || !pitchHarmonicCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = pitchHarmonicCanvas.clientWidth || 400;
    const h = pitchHarmonicCanvas.clientHeight || 200;
    pitchHarmonicCanvas.width = Math.floor(w * dpr);
    pitchHarmonicCanvas.height = Math.floor(h * dpr);
    pitchHarmonicCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearPitchHarmonicDisplay();
    renderPitchHarmonicDisplay();
}

function resizeHarmonicTensionCanvas() {
    if (!harmonicTensionCanvas || !harmonicTensionCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = harmonicTensionCanvas.clientWidth || 460;
    const h = harmonicTensionCanvas.clientHeight || 220;
    harmonicTensionCanvas.width = Math.floor(w * dpr);
    harmonicTensionCanvas.height = Math.floor(h * dpr);
    harmonicTensionCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderHarmonicTensionDisplay();
}

/**
 * Connect audio element to Web Audio analyser for FFT display
 */
function setupFFTForAudioElement() {
    if (!audioAnalyzer.audioContext || !audioElement) return;

    if (audioSource) {
        try {
            audioSource.disconnect();
        } catch (error) {
            // Ignore disconnect errors from stale source nodes
        }
        audioSource = null;
    }

    fftAnalyser = audioAnalyzer.audioContext.createAnalyser();
    // 2048 → ~21 Hz/bin @ 44.1k — partials align better with harmonic peak windows than 1024.
    fftAnalyser.fftSize = 2048;
    // Moderate smoothing: enough motion in harmonic bars without harsh flicker.
    fftAnalyser.smoothingTimeConstant = 0.35;
    fftDataArray = new Uint8Array(fftAnalyser.frequencyBinCount);

    audioSource = audioAnalyzer.audioContext.createMediaElementSource(audioElement);
    audioSource.connect(fftAnalyser);
    fftAnalyser.connect(audioAnalyzer.audioContext.destination);
}

/**
 * Render FFT bars
 */
function renderFFT() {
    if (!fftAnalyser || !fftDataArray || !fftCtx || !fftCanvas) return;

    fftAnalyser.getByteFrequencyData(fftDataArray);

    const width = fftCanvas.clientWidth;
    const height = fftCanvas.clientHeight;
    fftCtx.clearRect(0, 0, width, height);

    fftCtx.fillStyle = 'rgba(8, 12, 22, 0.88)';
    fftCtx.fillRect(0, 0, width, height);

    const pointCount = 96;
    const step = Math.max(1, Math.floor(fftDataArray.length / pointCount));
    const baselineY = height - 4;

    // Draw a peak-style FFT trace instead of vertical bars.
    fftCtx.beginPath();
    fftCtx.moveTo(0, baselineY);

    for (let i = 0; i < pointCount; i++) {
        const value = fftDataArray[i * step] || 0;
        const magnitude = (value / 255) * (height - 8);
        const x = (i / (pointCount - 1)) * width;
        const y = baselineY - magnitude;
        fftCtx.lineTo(x, y);
    }

    fftCtx.strokeStyle = 'rgba(120, 206, 255, 0.95)';
    fftCtx.lineWidth = 2;
    fftCtx.shadowColor = 'rgba(101, 200, 255, 0.55)';
    fftCtx.shadowBlur = 10;
    fftCtx.stroke();

    // Soft fill under peaks for depth.
    fftCtx.lineTo(width, baselineY);
    fftCtx.lineTo(0, baselineY);
    fftCtx.closePath();
    const gradient = fftCtx.createLinearGradient(0, 0, 0, baselineY);
    gradient.addColorStop(0, 'rgba(101, 200, 255, 0.26)');
    gradient.addColorStop(1, 'rgba(101, 200, 255, 0.02)');
    fftCtx.fillStyle = gradient;
    fftCtx.fill();

    fftCtx.shadowBlur = 0;
}

/**
 * Clear FFT display
 */
function clearFFT() {
    if (!fftCtx || !fftCanvas) return;
    const width = fftCanvas.clientWidth;
    const height = fftCanvas.clientHeight;
    fftCtx.clearRect(0, 0, width, height);
    fftCtx.fillStyle = 'rgba(8, 12, 22, 0.88)';
    fftCtx.fillRect(0, 0, width, height);
}

function clearPitchHarmonicDisplay() {
    if (!pitchHarmonicCtx || !pitchHarmonicCanvas) return;
    const width = pitchHarmonicCanvas.clientWidth;
    const height = pitchHarmonicCanvas.clientHeight;
    pitchHarmonicCtx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    pitchHarmonicCtx.fillRect(0, 0, width, height);
}

function clearHarmonicTensionDisplay() {
    if (!harmonicTensionCtx || !harmonicTensionCanvas) return;
    const width = harmonicTensionCanvas.clientWidth;
    const height = harmonicTensionCanvas.clientHeight;
    harmonicTensionCtx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    harmonicTensionCtx.fillRect(0, 0, width, height);
}

/**
 * Live pitch (HPS), spectrum, and harmonic bars in the dedicated panel.
 */
function renderPitchHarmonicDisplay() {
    const panel = document.getElementById('pitchHarmonicPanel');
    if (!pitchHarmonicCtx || !pitchHarmonicCanvas || !panel || panel.classList.contains('hidden')) {
        return;
    }

    const width = pitchHarmonicCanvas.clientWidth;
    const height = pitchHarmonicCanvas.clientHeight;
    if (width < 8 || height < 8) return;

    pitchHarmonicCtx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    pitchHarmonicCtx.fillRect(0, 0, width, height);

    if (!fftAnalyser || !isPlaying || !audioAnalyzer) {
        pitchHarmonicCtx.fillStyle = 'rgba(150, 198, 255, 0.65)';
        pitchHarmonicCtx.font = '12px JetBrains Mono, Space Grotesk, Segoe UI, sans-serif';
        pitchHarmonicCtx.textAlign = 'center';
        pitchHarmonicCtx.textBaseline = 'middle';
        pitchHarmonicCtx.fillText('Play audio for live pitch & harmonics (HPS)', width / 2, height / 2);
        pitchHarmonicCtx.textAlign = 'left';
        return;
    }

    const binCount = fftAnalyser.frequencyBinCount;
    const rawFreq = new Float32Array(binCount);
    if (typeof fftAnalyser.getFloatFrequencyData === 'function') {
        fftAnalyser.getFloatFrequencyData(rawFreq);
    } else {
        const byteFreq = new Uint8Array(binCount);
        fftAnalyser.getByteFrequencyData(byteFreq);
        for (let i = 0; i < binCount; i++) {
            rawFreq[i] = byteFreq[i] / 255;
        }
    }

    const linearMag = typeof audioAnalyzer.linearizeAnalyserMagnitudeFrame === 'function'
        ? audioAnalyzer.linearizeAnalyserMagnitudeFrame(rawFreq)
        : rawFreq;
    const sampleRate = audioAnalyzer.audioContext?.sampleRate || 44100;
    const nyquist = sampleRate / 2;
    const fftSize = fftAnalyser.fftSize;

    let ph = { fundamentalHz: null, pitchConfidence: 0, harmonicAmplitudes: [] };
    if (typeof audioAnalyzer.analyzePitchHarmonicsFromMagnitudes === 'function') {
        ph = audioAnalyzer.analyzePitchHarmonicsFromMagnitudes(linearMag, sampleRate, fftSize, {
            alreadyLinear: true
        });
    }

    const specTop = 4;
    const statsH = Math.min(76, Math.max(54, height * 0.17));
    const specH = Math.max(
        40,
        Math.min(height * 0.33, Math.max(50, height - statsH - 88))
    );
    const baselineY = specTop + specH - 6;
    const barTitleY = baselineY + 8;
    const yAxisW = 40;
    const plotMarginR = 8;
    const axisTop = barTitleY + 14;
    let axisBottom = Math.max(axisTop + 48, height - statsH - 4);
    let barH = axisBottom - axisTop;
    if (barH < 40) {
        axisBottom = axisTop + 40;
        barH = 40;
    }
    const plotLeft = yAxisW + 6;
    const plotW = Math.max(20, width - plotLeft - plotMarginR);

    let magMax = 0;
    for (let i = 0; i < linearMag.length; i++) {
        if (linearMag[i] > magMax) magMax = linearMag[i];
    }
    const invMax = magMax > 0 ? 1 / magMax : 1;

    const pointCount = Math.min(128, linearMag.length);
    const step = Math.max(1, Math.floor(linearMag.length / pointCount));

    pitchHarmonicCtx.beginPath();
    pitchHarmonicCtx.moveTo(0, baselineY);
    for (let i = 0; i < pointCount; i++) {
        const bin = Math.min(linearMag.length - 1, i * step);
        const mag = (linearMag[bin] || 0) * invMax;
        const x = (i / (pointCount - 1)) * width;
        const y = baselineY - mag * (specH - 12);
        pitchHarmonicCtx.lineTo(x, y);
    }
    pitchHarmonicCtx.strokeStyle = 'rgba(120, 206, 255, 0.9)';
    pitchHarmonicCtx.lineWidth = 1.75;
    pitchHarmonicCtx.stroke();

    pitchHarmonicCtx.beginPath();
    pitchHarmonicCtx.moveTo(0, baselineY);
    for (let i = 0; i < pointCount; i++) {
        const bin = Math.min(linearMag.length - 1, i * step);
        const mag = (linearMag[bin] || 0) * invMax;
        const x = (i / (pointCount - 1)) * width;
        const y = baselineY - mag * (specH - 12);
        pitchHarmonicCtx.lineTo(x, y);
    }
    pitchHarmonicCtx.lineTo(width, baselineY);
    pitchHarmonicCtx.lineTo(0, baselineY);
    pitchHarmonicCtx.closePath();
    const grad = pitchHarmonicCtx.createLinearGradient(0, specTop, 0, baselineY);
    grad.addColorStop(0, 'rgba(101, 200, 255, 0.2)');
    grad.addColorStop(1, 'rgba(101, 200, 255, 0.02)');
    pitchHarmonicCtx.fillStyle = grad;
    pitchHarmonicCtx.fill();

    const toX = (hz) => (hz / nyquist) * width;

    if (ph.fundamentalHz != null && ph.fundamentalHz > 0 && ph.fundamentalHz < nyquist) {
        pitchHarmonicCtx.setLineDash([5, 4]);
        for (let n = 1; n <= 8; n++) {
            const f = ph.fundamentalHz * n;
            if (f >= nyquist) break;
            const x = toX(f);
            pitchHarmonicCtx.globalAlpha = n === 1 ? 1 : Math.max(0.15, 0.55 - n * 0.05);
            pitchHarmonicCtx.strokeStyle = n === 1 ? 'rgba(255, 200, 130, 0.98)' : 'rgba(200, 165, 255, 0.75)';
            pitchHarmonicCtx.lineWidth = n === 1 ? 2 : 1.2;
            pitchHarmonicCtx.beginPath();
            pitchHarmonicCtx.moveTo(x, specTop);
            pitchHarmonicCtx.lineTo(x, baselineY + 2);
            pitchHarmonicCtx.stroke();
        }
        pitchHarmonicCtx.setLineDash([]);
        pitchHarmonicCtx.globalAlpha = 1;

        pitchHarmonicCtx.font = '600 11px JetBrains Mono, Space Grotesk, sans-serif';
        pitchHarmonicCtx.textBaseline = 'top';
        pitchHarmonicCtx.fillStyle = 'rgba(255, 215, 160, 0.98)';
        pitchHarmonicCtx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        pitchHarmonicCtx.shadowBlur = 3;
        pitchHarmonicCtx.fillText(
            `f₀ ${ph.fundamentalHz.toFixed(1)} Hz   conf ${ph.pitchConfidence.toFixed(2)}`,
            8,
            specTop + 2
        );
        pitchHarmonicCtx.shadowBlur = 0;
    } else {
        pitchHarmonicCtx.font = '11px JetBrains Mono, Space Grotesk, sans-serif';
        pitchHarmonicCtx.fillStyle = 'rgba(180, 190, 220, 0.75)';
        pitchHarmonicCtx.fillText('No stable pitch (noise / polyphony)', 8, specTop + 4);
    }

    const harmonics = Array.isArray(ph.harmonicAmplitudes) ? ph.harmonicAmplitudes : [];
    const nHarm = harmonics.length > 0 ? Math.min(12, harmonics.length) : 0;
    const barGap = 2;
    const barW = nHarm > 0 ? (plotW - barGap * (nHarm + 1)) / nHarm : 0;

    pitchHarmonicCtx.font = '600 9px JetBrains Mono, Space Grotesk, sans-serif';
    pitchHarmonicCtx.fillStyle = 'rgba(160, 200, 235, 0.9)';
    pitchHarmonicCtx.textAlign = 'left';
    pitchHarmonicCtx.textBaseline = 'top';
    pitchHarmonicCtx.fillText('Harmonic partial levels (linear magnitude, √ height)', plotLeft, barTitleY);

    // Y-axis title (rotated)
    pitchHarmonicCtx.save();
    pitchHarmonicCtx.translate(11, axisTop + barH * 0.5);
    pitchHarmonicCtx.rotate(-Math.PI / 2);
    pitchHarmonicCtx.font = '9px JetBrains Mono, Space Grotesk, sans-serif';
    pitchHarmonicCtx.fillStyle = 'rgba(180, 210, 240, 0.82)';
    pitchHarmonicCtx.textAlign = 'center';
    pitchHarmonicCtx.textBaseline = 'middle';
    pitchHarmonicCtx.fillText('√(rel. peak)', 0, 0);
    pitchHarmonicCtx.restore();

    // Plot frame + horizontal grid (analytical)
    const plotRight = plotLeft + plotW;
    pitchHarmonicCtx.strokeStyle = 'rgba(100, 150, 195, 0.45)';
    pitchHarmonicCtx.lineWidth = 1;
    pitchHarmonicCtx.strokeRect(plotLeft + 0.5, axisTop + 0.5, plotW - 1, barH - 1);

    pitchHarmonicCtx.font = '8px JetBrains Mono, monospace';
    pitchHarmonicCtx.fillStyle = 'rgba(170, 200, 230, 0.75)';
    pitchHarmonicCtx.textAlign = 'right';
    pitchHarmonicCtx.textBaseline = 'middle';
    const yTicks = [1, 0.75, 0.5, 0.25, 0];
    for (let i = 0; i < yTicks.length; i++) {
        const t = yTicks[i];
        const y = axisBottom - t * barH;
        pitchHarmonicCtx.strokeStyle = 'rgba(90, 130, 175, 0.22)';
        pitchHarmonicCtx.lineWidth = 1;
        pitchHarmonicCtx.beginPath();
        pitchHarmonicCtx.moveTo(plotLeft, y);
        pitchHarmonicCtx.lineTo(plotRight, y);
        pitchHarmonicCtx.stroke();
        pitchHarmonicCtx.fillText(t.toFixed(2), plotLeft - 5, y);
    }
    pitchHarmonicCtx.textAlign = 'left';

    if (nHarm === 0) {
        pitchHarmonicCtx.fillStyle = 'rgba(180, 195, 220, 0.55)';
        pitchHarmonicCtx.font = '10px JetBrains Mono, Space Grotesk, sans-serif';
        pitchHarmonicCtx.textBaseline = 'middle';
        pitchHarmonicCtx.fillText(
            'No f₀ — harmonic model requires a detected fundamental',
            plotLeft,
            axisTop + barH * 0.45
        );
        pitchHarmonicCtx.textBaseline = 'top';
        pitchHarmonicCtx.font = '9px JetBrains Mono, monospace';
        pitchHarmonicCtx.fillText('Numerical partial data unavailable without f₀.', 8, axisBottom + 18);
        return;
    }

    let bestIdx = 0;
    let bestRel = -1;
    let bestMag = 0;
    for (let h = 0; h < nHarm; h++) {
        const entry = harmonics[h];
        const rel = entry && Number.isFinite(entry.relativePeak) ? entry.relativePeak : 0;
        const mag = entry && Number.isFinite(entry.magnitude) ? entry.magnitude : 0;
        if (rel > bestRel + 1e-9 || (Math.abs(rel - bestRel) < 1e-9 && mag > bestMag)) {
            bestRel = rel;
            bestMag = mag;
            bestIdx = h;
        }
    }

    for (let h = 0; h < nHarm; h++) {
        const entry = harmonics[h];
        const rel = entry && Number.isFinite(entry.relativePeak) ? entry.relativePeak : 0;
        const vis = Math.sqrt(Math.max(0, Math.min(1, rel)));
        const bh = vis * barH;
        const bx = plotLeft + barGap + h * (barW + barGap);
        const by = axisBottom - bh;
        const bw = Math.max(1, barW);

        pitchHarmonicCtx.fillStyle = h === bestIdx ? 'rgba(95, 175, 235, 0.42)' : 'rgba(70, 125, 185, 0.32)';
        pitchHarmonicCtx.strokeStyle = h === bestIdx ? 'rgba(190, 235, 255, 0.95)' : 'rgba(140, 195, 240, 0.88)';
        pitchHarmonicCtx.lineWidth = h === bestIdx ? 1.35 : 1;
        if (bh > 0.02) {
            pitchHarmonicCtx.fillRect(bx, by, bw, bh);
            pitchHarmonicCtx.strokeRect(bx + 0.5, by + 0.5, bw - 1, Math.max(bh - 1, 0.5));
        } else {
            pitchHarmonicCtx.beginPath();
            pitchHarmonicCtx.moveTo(bx + 0.5, axisBottom);
            pitchHarmonicCtx.lineTo(bx + bw - 0.5, axisBottom);
            pitchHarmonicCtx.stroke();
        }

        pitchHarmonicCtx.fillStyle = 'rgba(210, 230, 255, 0.65)';
        pitchHarmonicCtx.font = '8px JetBrains Mono, monospace';
        pitchHarmonicCtx.textAlign = 'center';
        pitchHarmonicCtx.textBaseline = 'top';
        pitchHarmonicCtx.fillText(`${h + 1}`, bx + bw / 2, axisBottom + 3);
    }
    pitchHarmonicCtx.textAlign = 'left';
    pitchHarmonicCtx.textBaseline = 'top';

    // Numeric readout (dominant partial + coefficients)
    const statsY = axisBottom + 18;
    const bestEntry = harmonics[bestIdx];
    const bestF = bestEntry && Number.isFinite(bestEntry.frequencyHz) ? bestEntry.frequencyHz : null;
    const magStr = bestMag > 0 ? bestMag.toExponential(3) : '0';
    const relStr = Number.isFinite(bestRel) ? bestRel.toFixed(4) : '—';

    pitchHarmonicCtx.fillStyle = 'rgba(200, 225, 255, 0.92)';
    pitchHarmonicCtx.font = '600 10px JetBrains Mono, monospace';
    pitchHarmonicCtx.fillText(
        `Dominant partial  H${bestIdx + 1}    |X| = ${magStr}    rel_peak = ${relStr}${bestF != null ? `    ${bestF.toFixed(1)} Hz` : ''}`,
        8,
        statsY
    );

    const coefParts = [];
    for (let h = 0; h < nHarm; h++) {
        const e = harmonics[h];
        const rel = e && Number.isFinite(e.relativePeak) ? e.relativePeak : 0;
        coefParts.push(`H${h + 1}:${rel.toFixed(3)}`);
    }
    pitchHarmonicCtx.font = '9px JetBrains Mono, monospace';
    pitchHarmonicCtx.fillStyle = 'rgba(165, 195, 225, 0.78)';
    const line2 = coefParts.join('  ·  ');
    const maxW = width - 16;
    if (pitchHarmonicCtx.measureText(line2).width <= maxW) {
        pitchHarmonicCtx.fillText(line2, 8, statsY + 14);
    } else {
        const half = Math.ceil(nHarm / 2);
        pitchHarmonicCtx.fillText(coefParts.slice(0, half).join('  ·  '), 8, statsY + 14);
        pitchHarmonicCtx.fillText(coefParts.slice(half).join('  ·  '), 8, statsY + 26);
    }

}

function renderHarmonicTensionDisplay() {
    const panel = document.getElementById('harmonicTensionPanel');
    if (!harmonicTensionCtx || !harmonicTensionCanvas || !panel || panel.classList.contains('hidden')) return;

    const width = harmonicTensionCanvas.clientWidth;
    const height = harmonicTensionCanvas.clientHeight;
    if (width < 10 || height < 10) return;

    harmonicTensionCtx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    harmonicTensionCtx.fillRect(0, 0, width, height);

    const currentTime = Number.isFinite(audioElement?.currentTime) ? audioElement.currentTime : 0;
    const trailWindowSec = 10;
    const trail = harmonicTensionHistory.filter((point) => (currentTime - point.time) >= 0 && (currentTime - point.time) <= trailWindowSec);
    const current = trail.length > 0 ? trail[trail.length - 1] : latestHarmonicFrame;

    if (!current || trail.length === 0) {
        harmonicTensionCtx.fillStyle = 'rgba(150, 198, 255, 0.7)';
        harmonicTensionCtx.font = '12px JetBrains Mono, Space Grotesk, sans-serif';
        harmonicTensionCtx.textAlign = 'center';
        harmonicTensionCtx.textBaseline = 'middle';
        harmonicTensionCtx.fillText('Play audio to view harmonic tension/release', width / 2, height / 2);
        harmonicTensionCtx.textAlign = 'left';
        return;
    }

    const topBox = { x: 8, y: 20, w: width - 16, h: Math.max(90, height * 0.58) };
    const binaryBox = { x: 8, y: topBox.y + topBox.h + 18, w: width - 16, h: Math.max(24, height - (topBox.y + topBox.h + 30)) };
    const tx = (t) => topBox.x + ((t - (currentTime - trailWindowSec)) / Math.max(1e-6, trailWindowSec)) * topBox.w;
    const ty = (v) => topBox.y + (1 - Math.max(0, Math.min(1, v))) * topBox.h;

    harmonicTensionCtx.strokeStyle = 'rgba(120, 180, 220, 0.34)';
    harmonicTensionCtx.lineWidth = 1;
    harmonicTensionCtx.strokeRect(topBox.x + 0.5, topBox.y + 0.5, topBox.w - 1, topBox.h - 1);

    for (let i = 0; i <= 4; i++) {
        const y = topBox.y + (i / 4) * topBox.h;
        harmonicTensionCtx.beginPath();
        harmonicTensionCtx.moveTo(topBox.x, y);
        harmonicTensionCtx.lineTo(topBox.x + topBox.w, y);
        harmonicTensionCtx.strokeStyle = 'rgba(110, 165, 205, 0.2)';
        harmonicTensionCtx.stroke();
    }

    harmonicTensionCtx.beginPath();
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const x = tx(p.time);
        const y = ty(p.tension);
        if (i === 0) harmonicTensionCtx.moveTo(x, y);
        else harmonicTensionCtx.lineTo(x, y);
    }
    harmonicTensionCtx.strokeStyle = 'rgba(255, 126, 126, 0.94)';
    harmonicTensionCtx.lineWidth = 1.8;
    harmonicTensionCtx.stroke();

    harmonicTensionCtx.beginPath();
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const x = tx(p.time);
        const y = ty(p.release);
        if (i === 0) harmonicTensionCtx.moveTo(x, y);
        else harmonicTensionCtx.lineTo(x, y);
    }
    harmonicTensionCtx.strokeStyle = 'rgba(102, 235, 170, 0.9)';
    harmonicTensionCtx.lineWidth = 1.4;
    harmonicTensionCtx.stroke();

    const cursorX = tx(currentTime);
    harmonicTensionCtx.setLineDash([4, 4]);
    harmonicTensionCtx.strokeStyle = 'rgba(255, 225, 165, 0.92)';
    harmonicTensionCtx.beginPath();
    harmonicTensionCtx.moveTo(cursorX, topBox.y);
    harmonicTensionCtx.lineTo(cursorX, topBox.y + topBox.h);
    harmonicTensionCtx.stroke();
    harmonicTensionCtx.setLineDash([]);

    harmonicTensionCtx.fillStyle = 'rgba(255, 126, 126, 0.95)';
    harmonicTensionCtx.font = '600 10px JetBrains Mono, monospace';
    harmonicTensionCtx.fillText(`Tension ${current.tension.toFixed(2)}`, topBox.x, 10);
    harmonicTensionCtx.fillStyle = 'rgba(102, 235, 170, 0.95)';
    harmonicTensionCtx.fillText(`Release ${current.release.toFixed(2)}`, topBox.x + 146, 10);
    harmonicTensionCtx.fillStyle = 'rgba(190, 216, 245, 0.85)';
    harmonicTensionCtx.font = '8px JetBrains Mono, monospace';
    harmonicTensionCtx.fillText(
        `RMS ${((current.rms ?? 0) * 100).toFixed(1)}%  Loud ${Number.isFinite(current.loudnessDb) ? current.loudnessDb.toFixed(1) : '-inf'} dB  Irreg ${(current.spectralIrregularity ?? 0).toFixed(2)}  HCD ${(current.harmonicChange ?? 0).toFixed(2)}  LAT ${((current.phraseLatSec ?? 0)).toFixed(2)}s`,
        topBox.x,
        topBox.y + topBox.h - 4
    );

    // Binary movement strip: 1 = tension-dominant, 0 = release-dominant.
    harmonicTensionCtx.strokeStyle = 'rgba(120, 180, 220, 0.34)';
    harmonicTensionCtx.strokeRect(binaryBox.x + 0.5, binaryBox.y + 0.5, binaryBox.w - 1, binaryBox.h - 1);
    harmonicTensionCtx.fillStyle = 'rgba(182, 208, 236, 0.82)';
    harmonicTensionCtx.font = '8px JetBrains Mono, monospace';
    harmonicTensionCtx.fillText('Binary movement (T=1 / R=0)', binaryBox.x, binaryBox.y - 6);

    const segmentW = binaryBox.w / Math.max(1, trail.length);
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const isTension = p.tension >= p.release;
        harmonicTensionCtx.fillStyle = isTension ? 'rgba(255, 126, 126, 0.88)' : 'rgba(102, 235, 170, 0.88)';
        const x = binaryBox.x + i * segmentW;
        harmonicTensionCtx.fillRect(x, binaryBox.y + 1, Math.max(1, segmentW), binaryBox.h - 2);
    }
}

/**
 * Render waveform viewer (time-domain oscilloscope trace)
 */
function renderWaveform() {
    if (!fftAnalyser || !fftDataArray || !waveformCtx || !waveformCanvas) return;

    fftAnalyser.getByteTimeDomainData(fftDataArray);
    let waveformPeak = 0;
    for (let i = 0; i < fftDataArray.length; i++) {
        const centered = Math.abs((fftDataArray[i] - 128) / 128);
        if (centered > waveformPeak) {
            waveformPeak = centered;
        }
    }
    visualizer.setWaveformPeakAmplitude(waveformPeak);

    const width = waveformCanvas.clientWidth;
    const height = waveformCanvas.clientHeight;
    waveformCtx.clearRect(0, 0, width, height);
    waveformCtx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    waveformCtx.fillRect(0, 0, width, height);

    const midY = height * 0.5;

    // Baseline reference
    waveformCtx.strokeStyle = 'rgba(101, 200, 255, 0.18)';
    waveformCtx.lineWidth = 1;
    waveformCtx.beginPath();
    waveformCtx.moveTo(0, midY);
    waveformCtx.lineTo(width, midY);
    waveformCtx.stroke();

    // Signal trace
    waveformCtx.beginPath();
    const sliceWidth = width / Math.max(1, fftDataArray.length - 1);
    for (let i = 0; i < fftDataArray.length; i++) {
        const value = fftDataArray[i] / 255; // 0..1
        const y = value * height;
        const x = i * sliceWidth;
        if (i === 0) {
            waveformCtx.moveTo(x, y);
        } else {
            waveformCtx.lineTo(x, y);
        }
    }
    waveformCtx.strokeStyle = 'rgba(120, 206, 255, 0.96)';
    waveformCtx.lineWidth = 2;
    waveformCtx.shadowColor = 'rgba(101, 200, 255, 0.45)';
    waveformCtx.shadowBlur = 8;
    waveformCtx.stroke();
    waveformCtx.shadowBlur = 0;
}

/**
 * Clear waveform display
 */
function clearWaveform() {
    if (!waveformCtx || !waveformCanvas) return;
    const width = waveformCanvas.clientWidth;
    const height = waveformCanvas.clientHeight;
    waveformCtx.clearRect(0, 0, width, height);
    waveformCtx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    waveformCtx.fillRect(0, 0, width, height);
}

/**
 * Render spectral centroid (x) vs amplitude (y)
 */
function renderCentroidAmplitude() {
    if (!fftAnalyser || !centroidAmpCtx || !centroidAmpCanvas) return;

    const timeData = new Uint8Array(fftAnalyser.fftSize);
    fftAnalyser.getByteTimeDomainData(timeData);

    let sumSquares = 0;
    for (let i = 0; i < timeData.length; i++) {
        const centered = (timeData[i] - 128) / 128;
        sumSquares += centered * centered;
    }
    const amplitude = Math.max(0, Math.min(1, Math.sqrt(sumSquares / timeData.length)));

    // Prefer analyzer-derived centroid; fallback to estimating from current FFT bins.
    let centroidHz = latestSpectralCentroid || 0;
    if (!(centroidHz > 0)) {
        const freqData = new Uint8Array(fftAnalyser.frequencyBinCount);
        fftAnalyser.getByteFrequencyData(freqData);
        const nyquist = (audioAnalyzer?.audioContext?.sampleRate || 44100) / 2;
        let weighted = 0;
        let total = 0;
        for (let i = 0; i < freqData.length; i++) {
            const magnitude = freqData[i];
            const freq = (i / freqData.length) * nyquist;
            weighted += freq * magnitude;
            total += magnitude;
        }
        centroidHz = total > 0 ? (weighted / total) : 0;
    }
    centroidHz = Math.max(0, Math.min(15000, centroidHz));

    centroidAmpHistory.push({ centroidHz, amplitude });
    if (centroidAmpHistory.length > 220) {
        centroidAmpHistory.shift();
    }

    drawCentroidAmplitudeGraph();
}

/**
 * Draw spectral centroid vs amplitude graph with fixed axes.
 * X: 0-15 kHz, Y: 0.0-1.0
 */
function drawCentroidAmplitudeGraph() {
    if (!centroidAmpCtx || !centroidAmpCanvas) return;

    const width = centroidAmpCanvas.clientWidth;
    const height = centroidAmpCanvas.clientHeight;
    const padding = { top: 10, right: 12, bottom: 26, left: 46 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);
    const xMin = 0;
    const xMax = 15000;
    const yMin = 0;
    const yMax = 1;

    centroidAmpCtx.clearRect(0, 0, width, height);
    centroidAmpCtx.fillStyle = 'rgba(8, 12, 22, 0.08)';
    centroidAmpCtx.fillRect(0, 0, width, height);

    centroidAmpCtx.strokeStyle = 'rgba(101, 200, 255, 0.12)';
    centroidAmpCtx.lineWidth = 1;
    centroidAmpCtx.font = '10px Space Grotesk, Segoe UI, sans-serif';
    centroidAmpCtx.fillStyle = 'rgba(190, 224, 255, 0.78)';

    // Y-axis grid and labels: 0.0 to 1.0 in 0.1 increments
    for (let i = 0; i <= 10; i++) {
        const value = i / 10;
        const y = padding.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
        centroidAmpCtx.beginPath();
        centroidAmpCtx.moveTo(padding.left, y);
        centroidAmpCtx.lineTo(width - padding.right, y);
        centroidAmpCtx.stroke();
        centroidAmpCtx.fillText(value.toFixed(1), 12, y + 3);
    }

    // X-axis grid and labels at 0, 3, 6, 9, 12, 15 kHz
    for (let i = 0; i <= 5; i++) {
        const valueHz = i * 3000;
        const x = padding.left + ((valueHz - xMin) / (xMax - xMin)) * plotWidth;
        centroidAmpCtx.beginPath();
        centroidAmpCtx.moveTo(x, padding.top);
        centroidAmpCtx.lineTo(x, height - padding.bottom);
        centroidAmpCtx.stroke();
        centroidAmpCtx.fillText((valueHz / 1000).toFixed(1), x - 8, height - 8);
    }

    // Main axes
    centroidAmpCtx.strokeStyle = 'rgba(129, 210, 255, 0.48)';
    centroidAmpCtx.beginPath();
    centroidAmpCtx.moveTo(padding.left, padding.top);
    centroidAmpCtx.lineTo(padding.left, height - padding.bottom);
    centroidAmpCtx.lineTo(width - padding.right, height - padding.bottom);
    centroidAmpCtx.stroke();

    if (centroidAmpHistory.length > 0) {
        const adaptiveRange = getAdaptiveCentroidRangeFromHistory();

        // Draw a very thin trail behind points.
        if (centroidAmpHistory.length > 1) {
            centroidAmpCtx.lineWidth = 0.55;
            for (let i = 1; i < centroidAmpHistory.length; i++) {
                const prev = centroidAmpHistory[i - 1];
                const curr = centroidAmpHistory[i];
                const x1 = padding.left + ((prev.centroidHz - xMin) / (xMax - xMin)) * plotWidth;
                const y1 = padding.top + (1 - (prev.amplitude - yMin) / (yMax - yMin)) * plotHeight;
                const x2 = padding.left + ((curr.centroidHz - xMin) / (xMax - xMin)) * plotWidth;
                const y2 = padding.top + (1 - (curr.amplitude - yMin) / (yMax - yMin)) * plotHeight;
                centroidAmpCtx.strokeStyle = getCentroidColorCSS(curr.centroidHz, adaptiveRange, 0.48);
                centroidAmpCtx.beginPath();
                centroidAmpCtx.moveTo(x1, y1);
                centroidAmpCtx.lineTo(x2, y2);
                centroidAmpCtx.stroke();
            }
        }

        // Draw points with the same color logic used in 3D timbre space.
        for (let i = 0; i < centroidAmpHistory.length; i++) {
            const point = centroidAmpHistory[i];
            const x = padding.left + ((point.centroidHz - xMin) / (xMax - xMin)) * plotWidth;
            const y = padding.top + (1 - (point.amplitude - yMin) / (yMax - yMin)) * plotHeight;
            const isLatest = i === centroidAmpHistory.length - 1;
            const radius = isLatest ? 4.0 : 2.2;
            const alpha = isLatest ? 1.0 : 0.82;

            centroidAmpCtx.fillStyle = getCentroidColorCSS(point.centroidHz, adaptiveRange, alpha);
            centroidAmpCtx.beginPath();
            centroidAmpCtx.arc(x, y, radius, 0, Math.PI * 2);
            centroidAmpCtx.fill();
        }
    }
}

/**
 * Build an adaptive centroid range using the same percentile strategy
 * as the 3D timbre trail color mapping.
 */
function getAdaptiveCentroidRangeFromHistory() {
    const recent = centroidAmpHistory
        .slice(-240)
        .map((point) => point.centroidHz)
        .filter((freq) => Number.isFinite(freq) && freq > 0);

    if (recent.length < 8) {
        return { minFreq: 120, maxFreq: 6000 };
    }

    const sorted = [...recent].sort((a, b) => a - b);
    const lowIdx = Math.floor(sorted.length * 0.1);
    const highIdx = Math.floor(sorted.length * 0.9);
    const low = sorted[lowIdx];
    const high = sorted[highIdx];
    const minFreq = Math.max(50, low * 0.9);
    const maxFreq = Math.min(20000, Math.max(minFreq + 200, high * 1.1));

    return { minFreq, maxFreq };
}

/**
 * Convert 3D timbre color mapping output into CSS rgba string.
 */
function getCentroidColorCSS(centroidHz, rangeOverride, alpha = 1) {
    if (visualizer && typeof visualizer.getFrequencyColor === 'function') {
        const color = visualizer.getFrequencyColor(centroidHz, rangeOverride);
        const r = Math.round((color.r || 0) * 255);
        const g = Math.round((color.g || 0) * 255);
        const b = Math.round((color.b || 0) * 255);
        return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
    }

    return `rgba(120, 206, 255, ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Clear centroid/amplitude display
 */
function clearCentroidAmplitude() {
    centroidAmpHistory = [];
    latestSpectralCentroid = 0;
    drawCentroidAmplitudeGraph();
}

function publishVectorMathSnapshot(force = false) {
    const now = Date.now();
    if (!force && (now - lastVectorPublishAt) < VECTOR_PUBLISH_INTERVAL_MS) return;
    lastVectorPublishAt = now;

    const fileSpaceVectors = analyzedFileSegments.map((segment, index) => {
        const normalized = normalizeSegmentToVector(segment);
        return {
            id: `F-${index + 1}`,
            type: 'file',
            x: normalized.x,
            y: normalized.y,
            z: normalized.z,
            magnitude: Math.sqrt((normalized.x * normalized.x) + (normalized.y * normalized.y) + (normalized.z * normalized.z)),
            time: Number.isFinite(segment?.time) ? segment.time : 0
        };
    });
    const aggregateCenter = computeAggregateCenter(fileSpaceVectors);
    const snapshot = {
        timestamp: Date.now(),
        fileName: analyzedFileName || (currentFile?.name || ''),
        duration: analyzedFileDuration || 0,
        totalPoints: fileSpaceVectors.length,
        filePointCount: fileSpaceVectors.length,
        aggregateCenter,
        vectors: fileSpaceVectors,
        fileSpaceVectors,
        normalization: {
            xFormula: '(spectralCentroid / 10000) * 5',
            yFormula: '(spectralRolloff / 10000) * 5',
            zFormula: '(zeroCrossingRate * 10) * 3'
        },
        analysisMode: 'raw-file'
    };

    try {
        localStorage.setItem(VECTOR_MATH_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
        console.warn('Could not persist vector snapshot:', error);
    }

    if (analysisBroadcastChannel) {
        try {
            analysisBroadcastChannel.postMessage(snapshot);
        } catch (error) {
            console.warn('Could not broadcast analysis snapshot:', error);
        }
    }
}

function normalizeSegmentToVector(segment) {
    const centroid = Number.isFinite(segment?.spectralCentroid) ? segment.spectralCentroid : 0;
    const rolloff = Number.isFinite(segment?.spectralRolloff) ? segment.spectralRolloff : 0;
    const zcr = Number.isFinite(segment?.zeroCrossingRate) ? segment.zeroCrossingRate : 0;

    return {
        x: (centroid / 10000) * 5,
        y: (rolloff / 10000) * 5,
        z: (zcr * 10) * 3
    };
}

function computeAggregateCenter(vectors) {
    if (!Array.isArray(vectors) || vectors.length === 0) return null;
    const totals = vectors.reduce((acc, vector) => {
        const x = Number.isFinite(vector?.x) ? vector.x : 0;
        const y = Number.isFinite(vector?.y) ? vector.y : 0;
        const z = Number.isFinite(vector?.z) ? vector.z : 0;
        acc.x += x;
        acc.y += y;
        acc.z += z;
        return acc;
    }, { x: 0, y: 0, z: 0 });

    return {
        x: totals.x / vectors.length,
        y: totals.y / vectors.length,
        z: totals.z / vectors.length
    };
}

/**
 * Update status text
 */
function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}

/**
 * Update point count
 */
function updatePointCount() {
    const count = analyzedFileSegments?.length || 0;
    document.getElementById('pointCount').textContent = count;
}

/**
 * Show point information panel
 */
function showPointInfo(detail) {
    const infoPanel = document.getElementById('pointInfo');
    const detailsDiv = document.getElementById('pointDetails');

    const features = detail.features;
    const metadata = detail.metadata;

    let html = '';
    
    if (metadata.fileName) {
        html += `<div><strong>File:</strong> ${metadata.fileName}</div>`;
    }
    
    if (metadata.type) {
        html += `<div><strong>Type:</strong> ${metadata.type}</div>`;
    }
    
    if (metadata.time !== undefined) {
        html += `<div><strong>Time:</strong> ${metadata.time.toFixed(2)}s</div>`;
    }

    html += `<div><strong>Spectral Centroid:</strong> ${features.spectralCentroid.toFixed(2)} Hz</div>`;
    html += `<div><strong>Spectral Rolloff:</strong> ${features.spectralRolloff.toFixed(2)} Hz</div>`;
    html += `<div><strong>Zero Crossing Rate:</strong> ${features.zeroCrossingRate.toFixed(4)}</div>`;

    if (features.fundamentalHz != null && Number.isFinite(features.fundamentalHz)) {
        html += `<div><strong>Fundamental (HPS):</strong> ${features.fundamentalHz.toFixed(1)} Hz</div>`;
    }
    if (features.pitchConfidence != null && Number.isFinite(features.pitchConfidence)) {
        html += `<div><strong>Pitch confidence:</strong> ${features.pitchConfidence.toFixed(3)}</div>`;
    }
    if (Array.isArray(features.harmonicAmplitudes) && features.harmonicAmplitudes.length > 0) {
        const top = features.harmonicAmplitudes.slice(0, 8);
        const parts = top.map((h) => `H${h.harmonic}: ${((h.normalized || 0) * 100).toFixed(1)}%`);
        html += `<div><strong>Harmonic mix (1–8):</strong> ${parts.join(', ')}</div>`;
    }
    
    if (features.spectralFlux !== undefined) {
        html += `<div><strong>Spectral Flux:</strong> ${features.spectralFlux.toFixed(4)}</div>`;
    }
    const timeForPoint = Number.isFinite(metadata?.time) ? metadata.time : 0;
    const tensionModel = computeHarmonicTensionFromFeatures(features, timeForPoint, false);
    html += `<div><strong>Harmonic Tension:</strong> ${tensionModel.tension.toFixed(3)}</div>`;
    html += `<div><strong>Harmonic Release:</strong> ${tensionModel.release.toFixed(3)}</div>`;

    html += `<div><strong>Position:</strong> (${detail.normalized.x.toFixed(2)}, ${detail.normalized.y.toFixed(2)}, ${detail.normalized.z.toFixed(2)})</div>`;

    detailsDiv.innerHTML = html;
    infoPanel.classList.remove('hidden');
}

/**
 * Hide point information panel
 */
function hidePointInfo() {
    document.getElementById('pointInfo').classList.add('hidden');
}
