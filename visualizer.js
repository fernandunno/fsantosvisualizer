/**
 * 3D Timbre Space Visualizer
 * Uses Three.js to visualize timbre features in 3D space
 */

class TimbreVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = [];
        this.pointMeshes = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedPoint = null;
        this.trailLine = null;
        this.trailPoints = [];
        this.trailFrequencies = []; // Store frequency data for each trail point
        this.trailTimes = [];
        this.currentPositionMesh = null;
        this.pointGuideVectors = null;
        this.pointGuideLabels = null;
        this.pointGuideWallRipples = [];
        this.gridVisible = true;
        this.pointGuideThickness = 0.010;
        this.pointGuideWallRippleDurationMs = 720;
        this.pointGuideWallRippleStartRadius = 0.03;
        this.pointGuideWallRippleRadiusScale = 0.52;
        this.pointGuideWallRippleWidth = 0.014;
        this.pointGuideWallRippleOffset = 0.006;
        this.baseMinOrbitDistance = 2;
        this.baseMaxOrbitDistance = 50;
        this.gridOrbitSurfaceMargin = 0.22;
        this.gridOrbitBounceCooldownMs = 220;
        this.lastGridOrbitBounceAt = 0;
        this.wasNearGridBoundary = false;
        this.autoOrbitBaseSpeedAbs = 0.7;
        this.showTrail = true;
        this.realTimePoints = [];
        this.realTimeVectorHistory = [];
        this.sensitivity = 1.0;
        this.autoOrbit = false;
        this.orbitAroundMarker = false;
        this.autoOrbitLerp = 0.08;
        this.pointSizeScale = 1.5;
        this.fadeRealTimePoints = true;
        this.realTimePointFadeDurationMs = 1400;
        this.rippleMode = false;
        this.activeRipples = [];
        this.rippleDurationMs = 900;
        this.rippleCount = 3;
        this.rippleWidth = 0.12;
        this.rippleGlowIntensity = 1.3;
        this.rippleOpacityMultiplier = 1.0;
        this.amplitudeThresholdEnabled = false;
        this.amplitudeThreshold = 0.15;
        this.amplitudeThresholdRelativeToPeak = false;
        this.waveformPeakAmplitude = 1;
        this.waveformPeakThresholdScale = 0.6;

        this.init();
    }

    /**
     * Initialize Three.js scene
     */
    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Camera
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(9, 7, 9);
        this.camera.lookAt(5, 2, 5);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 50;
        this.controls.autoRotate = false;
        this.controls.autoRotateSpeed = 0.7;
        this.controls.target.set(5, 2, 5);
        this.baseMinOrbitDistance = this.controls.minDistance;
        this.baseMaxOrbitDistance = this.controls.maxDistance;
        this.autoOrbitBaseSpeedAbs = Math.max(0.2, Math.abs(this.controls.autoRotateSpeed));

        // Lighting with neon colors
        const ambientLight = new THREE.AmbientLight(0x00ffff, 0.3);
        this.scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffff00, 0.6);
        directionalLight1.position.set(5, 5, 5);
        this.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0x0080ff, 0.5);
        directionalLight2.position.set(-5, -5, -5);
        this.scene.add(directionalLight2);

        // Add point lights for neon effect
        const pointLight1 = new THREE.PointLight(0x00ffff, 0.5, 20);
        pointLight1.position.set(0, 5, 0);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xffff00, 0.4, 20);
        pointLight2.position.set(5, 0, 5);
        this.scene.add(pointLight2);

        // Grid
        this.createGrid();
        
        // Axes
        this.createAxes();

        // Labels
        this.createLabels();

        // Mouse events
        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));

        // Window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Start animation loop
        this.animate();
    }

    /**
     * Create grid helper
     */
    createGrid() {
        const gridGroup = new THREE.Group();
        gridGroup.name = 'grid';

        const size = 10;
        const step = 0.25;
        const divisions = Math.floor(size / step);

        const lineColor = new THREE.Color(0xffffff);
        const lineOpacity = 0.26;

        const addLine = (start, end) => {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(start.x, start.y, start.z),
                new THREE.Vector3(end.x, end.y, end.z)
            ]);
            const material = new THREE.LineBasicMaterial({
                color: lineColor,
                transparent: true,
                opacity: lineOpacity
            });
            const line = new THREE.Line(geometry, material);
            gridGroup.add(line);
        };

        // Floor plane (y = 0)
        for (let i = 0; i <= divisions; i++) {
            const p = i * step;
            addLine({ x: p, y: 0, z: 0 }, { x: p, y: 0, z: size });
            addLine({ x: 0, y: 0, z: p }, { x: size, y: 0, z: p });
        }

        // Back wall plane (z = 0)
        for (let i = 0; i <= divisions; i++) {
            const p = i * step;
            addLine({ x: p, y: 0, z: 0 }, { x: p, y: size, z: 0 });
            addLine({ x: 0, y: p, z: 0 }, { x: size, y: p, z: 0 });
        }

        // Left wall plane (x = 0)
        for (let i = 0; i <= divisions; i++) {
            const p = i * step;
            addLine({ x: 0, y: 0, z: p }, { x: 0, y: size, z: p });
            addLine({ x: 0, y: p, z: 0 }, { x: 0, y: p, z: size });
        }

        // Cube boundary edges for a clearer box frame.
        const edges = [
            // Bottom edges
            [{ x: 0, y: 0, z: 0 }, { x: size, y: 0, z: 0 }],
            [{ x: size, y: 0, z: 0 }, { x: size, y: 0, z: size }],
            [{ x: size, y: 0, z: size }, { x: 0, y: 0, z: size }],
            [{ x: 0, y: 0, z: size }, { x: 0, y: 0, z: 0 }],
            // Top edges
            [{ x: 0, y: size, z: 0 }, { x: size, y: size, z: 0 }],
            [{ x: size, y: size, z: 0 }, { x: size, y: size, z: size }],
            [{ x: size, y: size, z: size }, { x: 0, y: size, z: size }],
            [{ x: 0, y: size, z: size }, { x: 0, y: size, z: 0 }],
            // Vertical edges
            [{ x: 0, y: 0, z: 0 }, { x: 0, y: size, z: 0 }],
            [{ x: size, y: 0, z: 0 }, { x: size, y: size, z: 0 }],
            [{ x: size, y: 0, z: size }, { x: size, y: size, z: size }],
            [{ x: 0, y: 0, z: size }, { x: 0, y: size, z: size }]
        ];

        edges.forEach(([start, end]) => addLine(start, end));
        this.scene.add(gridGroup);
    }

    /**
     * Create axes helper (use default scientific RGB axes)
     */
    createAxes() {
        const axesHelper = new THREE.AxesHelper(5);
        axesHelper.name = 'axes';
        // Default AxesHelper colors: X=red, Y=green, Z=blue
        this.scene.add(axesHelper);
    }

    /**
     * Create axis labels
     */
    createLabels() {
        // This would require a text rendering library like THREE.TextGeometry
        // For now, we'll use simple sprites or HTML overlays
        // Labels are handled in the UI legend instead
    }

    /**
     * Set motion sensitivity (higher = more dramatic movement)
     */
    setSensitivity(value) {
        this.sensitivity = Math.max(0.1, Math.min(5.0, value)); // Clamp between 0.1 and 5.0
        
        // Update existing points' positions if they exist
        // Note: This would require re-normalizing all points, which might be complex
        // For now, sensitivity changes will only affect new points and real-time updates
    }

    /**
     * Apply current point-size scale with optional interaction multiplier.
     */
    applyPointScale(mesh, interactionMultiplier = 1) {
        if (!mesh) return;
        const scale = this.pointSizeScale * interactionMultiplier;
        mesh.scale.set(scale, scale, scale);
    }

    /**
     * Get color based on frequency (spectral centroid)
     * Uses adaptive log scaling so narrow bands still show color variation.
     * Maps frequency to color spectrum: Red (low) -> Yellow -> Green -> Cyan -> Violet (high)
     * @param {number} frequency - Spectral centroid frequency in Hz
     * @param {Object|null} rangeOverride - Optional { minFreq, maxFreq } range
     * @returns {THREE.Color} Color representing the frequency
     */
    getFrequencyColor(frequency, rangeOverride = null) {
        const { minFreq, maxFreq } = rangeOverride || this.getAdaptiveFrequencyRange();
        const safeFreq = Math.max(minFreq, Math.min(maxFreq, frequency || 0));

        // Log scaling gives more visual separation in lower/mid bands.
        const logMin = Math.log10(minFreq + 1);
        const logMax = Math.log10(maxFreq + 1);
        const logValue = Math.log10(safeFreq + 1);
        let normalized = (logValue - logMin) / (logMax - logMin || 1);
        normalized = Math.max(0, Math.min(1, normalized));

        // Slight contrast boost so small changes are easier to see.
        normalized = Math.pow(normalized, 0.75);
        
        const color = new THREE.Color();
        
        // Map frequency to color spectrum:
        // 0.0-0.2: Red to Orange
        // 0.2-0.4: Orange to Yellow
        // 0.4-0.6: Yellow to Green
        // 0.6-0.8: Green to Cyan
        // 0.8-1.0: Cyan to Blue/Violet
        
        if (normalized < 0.2) {
            // Red to Orange
            color.lerpColors(
                new THREE.Color(0xff0000), // Red
                new THREE.Color(0xff8800), // Orange
                normalized / 0.2
            );
        } else if (normalized < 0.4) {
            // Orange to Yellow
            color.lerpColors(
                new THREE.Color(0xff8800), // Orange
                new THREE.Color(0xffff00), // Yellow
                (normalized - 0.2) / 0.2
            );
        } else if (normalized < 0.6) {
            // Yellow to Green
            color.lerpColors(
                new THREE.Color(0xffff00), // Yellow
                new THREE.Color(0x00ff00), // Green
                (normalized - 0.4) / 0.2
            );
        } else if (normalized < 0.8) {
            // Green to Cyan
            color.lerpColors(
                new THREE.Color(0x00ff00), // Green
                new THREE.Color(0x00ffff), // Cyan
                (normalized - 0.6) / 0.2
            );
        } else {
            // Cyan to Blue/Violet
            color.lerpColors(
                new THREE.Color(0x00ffff), // Cyan
                new THREE.Color(0x8000ff), // Violet
                (normalized - 0.8) / 0.2
            );
        }
        
        return color;
    }

    /**
     * Calculate an adaptive frequency range from recent trail data.
     * Uses percentile bounds to avoid outliers flattening the color spread.
     */
    getAdaptiveFrequencyRange() {
        const recent = this.trailFrequencies
            .slice(-240)
            .filter(freq => Number.isFinite(freq) && freq > 0);

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
     * Normalize feature values to fit in 3D space
     */
    normalizeFeatures(features) {
        // Normalize with configurable sensitivity and no hard positional clamp.
        const rawX = (features.spectralCentroid / 10000) * 5 * this.sensitivity;
        const rawY = (features.spectralRolloff / 10000) * 5 * this.sensitivity;
        const rawZ = (features.zeroCrossingRate * 10) * 5 * this.sensitivity;

        // Timbre model is positive-domain only; do not allow negative coordinates.
        const normalized = {
            x: Math.max(0, rawX),
            y: Math.max(0, rawY),
            z: Math.max(0, rawZ)
        };

        return normalized;
    }

    /**
     * Add a point to the visualization (as a box/square)
     */
    addPoint(features, metadata = {}) {
        if (!this.shouldRenderPointForAmplitude(features)) {
            return null;
        }

        const normalized = this.normalizeFeatures(features);
        
        // Create box geometry (square)
        const size = 0.2;
        const geometry = new THREE.BoxGeometry(size, size, size);
        
        // Scientific neon color scheme based on position
        const color = new THREE.Color();
        // Map X (brightness) to yellow-cyan gradient
        // Map Y (rolloff) to cyan-blue gradient  
        // Map Z (noisiness) to blue-magenta gradient
        const xNorm = THREE.MathUtils.clamp((normalized.x + 5) / 10, 0, 1); // 0 to 1
        const yNorm = (normalized.y + 5) / 10; // 0 to 1
        const zNorm = (normalized.z + 5) / 10; // 0 to 1
        
        // Blend colors: Yellow -> Cyan -> Blue based on position
        if (xNorm > 0.5) {
            // Yellow to Cyan
            color.lerpColors(
                new THREE.Color(0xffff00), // Yellow
                new THREE.Color(0x00ffff), // Cyan
                (xNorm - 0.5) * 2
            );
        } else {
            // Cyan to Blue
            color.lerpColors(
                new THREE.Color(0x00ffff), // Cyan
                new THREE.Color(0x0080ff), // Blue
                xNorm * 2
            );
        }
        
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.9
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(normalized.x, normalized.y, normalized.z);
        this.applyPointScale(mesh);
        mesh.userData = {
            features: features,
            metadata: metadata,
            normalized: normalized
        };

        this.scene.add(mesh);
        this.pointMeshes.push(mesh);
        this.points.push({
            features: features,
            metadata: metadata,
            mesh: mesh
        });

        return mesh;
    }

    /**
     * Add multiple points from segment features
     */
    addSegments(segments, fileName) {
        segments.forEach((segment, index) => {
            this.addPoint(segment, {
                fileName: fileName,
                segmentIndex: index,
                time: segment.time
            });
        });
    }

    /**
     * Clear all points (including real-time points and trail)
     */
    clearPoints() {
        // Remove static point meshes
        this.pointMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.pointMeshes = [];
        this.points = [];

        // Remove any real-time point meshes that were added during playback
        this.realTimePoints.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.realTimePoints = [];
        this.realTimeVectorHistory = [];
        this.clearRipples();

        // Reset selection, trail, and current position indicator
        this.selectedPoint = null;
        this.clearTrail();
        this.clearCurrentPosition();
        this.clearPointGuideVectors();
    }

    /**
     * Update point in real-time (for playback visualization)
     */
    updateRealTimePoint(features, metadata = {}) {
        const normalized = this.normalizeFeatures(features);
        const now = performance.now();
        const frequency = features.spectralCentroid || 0;
        const rippleColor = this.getFrequencyColor(frequency);
        const shouldRenderPoint = this.shouldRenderPointForAmplitude(features);

        // Keep full playback history for Vector Math, independent of visual fade.
        this.realTimeVectorHistory.push({
            x: normalized.x,
            y: normalized.y,
            z: normalized.z
        });

        if (!shouldRenderPoint) {
            this.clearCurrentPosition();
            return;
        }

        if (this.rippleMode) {
            this.spawnRipple(normalized, rippleColor);
        }
        
        // Store point for trail
        this.trailPoints.push(new THREE.Vector3(normalized.x, normalized.y, normalized.z));
        // Store frequency data for accurate color mapping
        this.trailFrequencies.push(features.spectralCentroid || 0);
        this.trailTimes.push(now);
        this.updateTrailFade();
        
        // Update trail line
        if (this.showTrail && this.trailPoints.length > 1) {
            this.updateTrail();
        }

        // Update current position indicator
        this.updateCurrentPosition(normalized, features, metadata);

        // Optionally add a small box for this moment
        if (this.realTimePoints.length < 1000) { // Limit to prevent performance issues
            const size = 0.12;
            const geometry = new THREE.BoxGeometry(size, size, size);
            
            // Get color based on frequency (spectral centroid)
            const color = this.getFrequencyColor(frequency);
            
            const material = new THREE.MeshPhongMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.6,
                transparent: true,
                opacity: 0.7
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(normalized.x, normalized.y, normalized.z);
            this.applyPointScale(mesh);
            mesh.userData = {
                features: features,
                metadata: metadata,
                normalized: normalized,
                isRealTime: true,
                bornAt: performance.now()
            };

            this.scene.add(mesh);
            this.realTimePoints.push(mesh);
        }
    }

    /**
     * Update trail visualization
     */
    updateTrail() {
        if (this.trailPoints.length < 2) return;

        // Remove old trail
        if (this.trailLine) {
            this.scene.remove(this.trailLine);
            this.trailLine.geometry.dispose();
            this.trailLine.material.dispose();
        }

        // Create new trail geometry
        const geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
        
        // Color trail based on actual frequency data for each point
        const colors = [];
        const adaptiveRange = this.getAdaptiveFrequencyRange();
        for (let i = 0; i < this.trailPoints.length; i++) {
            const frequency = this.trailFrequencies[i] || 0;
            const color = this.getFrequencyColor(frequency, adaptiveRange);
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        this.trailLine = new THREE.Line(geometry, material);
        this.trailLine.name = 'trail';
        this.scene.add(this.trailLine);
    }

    /**
     * Clear trail
     */
    clearTrail() {
        if (this.trailLine) {
            this.scene.remove(this.trailLine);
            this.trailLine.geometry.dispose();
            this.trailLine.material.dispose();
            this.trailLine = null;
        }
        this.trailPoints = [];
        this.trailFrequencies = [];
        this.trailTimes = [];
    }

    /**
     * Trim old trail vertices using the same fade duration as points.
     */
    updateTrailFade() {
        if (!this.fadeRealTimePoints || this.trailTimes.length === 0) return;

        const now = performance.now();
        const duration = Math.max(1, this.realTimePointFadeDurationMs);
        let trimCount = 0;

        while (trimCount < this.trailTimes.length && (now - this.trailTimes[trimCount]) > duration) {
            trimCount += 1;
        }

        if (trimCount === 0) return;

        this.trailTimes.splice(0, trimCount);
        this.trailPoints.splice(0, trimCount);
        this.trailFrequencies.splice(0, trimCount);

        if (this.trailPoints.length < 2) {
            if (this.trailLine) {
                this.scene.remove(this.trailLine);
                this.trailLine.geometry.dispose();
                this.trailLine.material.dispose();
                this.trailLine = null;
            }
            return;
        }

        if (this.showTrail) {
            this.updateTrail();
        }
    }

    /**
     * Update current position indicator (as a pulsing box)
     */
    updateCurrentPosition(normalized, features, metadata) {
        // Remove old indicator
        if (this.currentPositionMesh) {
            this.scene.remove(this.currentPositionMesh);
            this.currentPositionMesh.geometry.dispose();
            this.currentPositionMesh.material.dispose();
        }

        // Create new indicator (larger, pulsing box)
        const size = 0.3;
        const geometry = new THREE.BoxGeometry(size, size, size);
        
        // Get color based on frequency (spectral centroid)
        const frequency = features.spectralCentroid || 0;
        const color = this.getFrequencyColor(frequency);
        
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.95
        });

        this.currentPositionMesh = new THREE.Mesh(geometry, material);
        this.currentPositionMesh.position.set(normalized.x, normalized.y, normalized.z);
        this.applyPointScale(this.currentPositionMesh, 1.15);
        this.currentPositionMesh.userData = {
            features: features,
            metadata: metadata,
            normalized: normalized,
            isCurrentPosition: true
        };
        this.currentPositionMesh.name = 'currentPosition';

        this.scene.add(this.currentPositionMesh);
        this.updatePointGuideVectors();
    }

    /**
     * Clear current position indicator
     */
    clearCurrentPosition() {
        if (this.currentPositionMesh) {
            this.scene.remove(this.currentPositionMesh);
            this.currentPositionMesh.geometry.dispose();
            this.currentPositionMesh.material.dispose();
            this.currentPositionMesh = null;
        }
        this.updatePointGuideVectors();
    }

    /**
     * Remove and dispose helper guide vectors.
     */
    clearPointGuideVectors() {
        if (!this.pointGuideVectors) return;

        this.pointGuideVectors.children.forEach((line) => {
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });

        this.scene.remove(this.pointGuideVectors);
        this.pointGuideVectors = null;
    }

    /**
     * Remove and dispose active guide-wall ripple rings.
     */
    clearPointGuideWallRipples() {
        this.pointGuideWallRipples.forEach((ripple) => {
            this.scene.remove(ripple.mesh);
            ripple.mesh.geometry.dispose();
            ripple.mesh.material.dispose();
        });
        this.pointGuideWallRipples = [];
    }

    /**
     * Remove and dispose axis coordinate labels.
     */
    clearPointGuideLabels() {
        if (!this.pointGuideLabels) return;

        this.pointGuideLabels.children.forEach((sprite) => {
            if (sprite.material?.map) {
                sprite.material.map.dispose();
            }
            if (sprite.material) {
                sprite.material.dispose();
            }
        });

        this.scene.remove(this.pointGuideLabels);
        this.pointGuideLabels = null;
    }

    /**
     * Build a text sprite for axis coordinate labels.
     */
    createCoordinateSprite(text, colorHex) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = `#${new THREE.Color(colorHex).getHexString()}`;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.86, 0.3, 1);
        return sprite;
    }

    /**
     * Draw axis-aligned guide vectors for the active point.
     * Guides are only visible while the grid is shown.
     */
    updatePointGuideVectors() {
        this.clearPointGuideVectors();
        this.clearPointGuideLabels();
        this.clearPointGuideWallRipples();
        if (!this.gridVisible) return;

        const sourceMesh = this.currentPositionMesh || this.selectedPoint;
        if (!sourceMesh) return;

        const pos = sourceMesh.position;
        const guideGroup = new THREE.Group();
        guideGroup.name = 'pointGuideVectors';

        const createGuide = (start, end, colorHex) => {
            const segment = new THREE.Vector3().subVectors(end, start);
            const length = segment.length();
            if (length <= 0.0001) return;

            const geometry = new THREE.CylinderGeometry(
                this.pointGuideThickness,
                this.pointGuideThickness,
                length,
                10
            );
            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color(colorHex),
                emissive: new THREE.Color(colorHex),
                emissiveIntensity: 0.32,
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(start).addScaledVector(segment, 0.5);
            mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                segment.clone().normalize()
            );
            guideGroup.add(mesh);
        };

        const spawnGuideWallRipple = (impactPoint, colorHex, axis) => {
            const startRadius = this.pointGuideWallRippleStartRadius;
            const startWidth = this.pointGuideWallRippleWidth;
            const geometry = new THREE.RingGeometry(
                Math.max(0.001, startRadius - (startWidth * 0.5)),
                startRadius + (startWidth * 0.5),
                42
            );
            const material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(colorHex),
                transparent: true,
                opacity: 0.78,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(impactPoint);

            // Slightly lift ring off the grid plane to avoid z-fighting.
            if (axis === 'x') {
                mesh.rotation.y = Math.PI / 2;
                mesh.position.x += this.pointGuideWallRippleOffset;
            } else if (axis === 'y') {
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.y += this.pointGuideWallRippleOffset;
            } else {
                mesh.position.z += this.pointGuideWallRippleOffset;
            }

            this.scene.add(mesh);
            this.pointGuideWallRipples.push({
                mesh,
                axis,
                bornAt: performance.now(),
                colorHex,
                center: impactPoint.clone()
            });
        };

        // X component vector (parallel to X axis)
        createGuide(
            new THREE.Vector3(0, pos.y, pos.z),
            new THREE.Vector3(pos.x, pos.y, pos.z),
            0xff4a4a
        );
        spawnGuideWallRipple(new THREE.Vector3(0, pos.y, pos.z), 0xff4a4a, 'x');

        // Y component vector (parallel to Y axis)
        createGuide(
            new THREE.Vector3(pos.x, 0, pos.z),
            new THREE.Vector3(pos.x, pos.y, pos.z),
            0x56ff7a
        );
        spawnGuideWallRipple(new THREE.Vector3(pos.x, 0, pos.z), 0x56ff7a, 'y');

        // Z component vector (parallel to Z axis)
        createGuide(
            new THREE.Vector3(pos.x, pos.y, 0),
            new THREE.Vector3(pos.x, pos.y, pos.z),
            0x5ca5ff
        );
        spawnGuideWallRipple(new THREE.Vector3(pos.x, pos.y, 0), 0x5ca5ff, 'z');

        this.pointGuideVectors = guideGroup;
        this.scene.add(guideGroup);

        const labelGroup = new THREE.Group();
        labelGroup.name = 'pointGuideLabels';

        const xLabel = this.createCoordinateSprite(`X: ${pos.x.toFixed(2)}`, 0xff4a4a);
        if (xLabel) {
            xLabel.position.set(pos.x, 0.16, 0.16);
            labelGroup.add(xLabel);
        }

        const yLabel = this.createCoordinateSprite(`Y: ${pos.y.toFixed(2)}`, 0x56ff7a);
        if (yLabel) {
            yLabel.position.set(0.16, pos.y, 0.16);
            labelGroup.add(yLabel);
        }

        const zLabel = this.createCoordinateSprite(`Z: ${pos.z.toFixed(2)}`, 0x5ca5ff);
        if (zLabel) {
            zLabel.position.set(0.16, 0.16, pos.z);
            labelGroup.add(zLabel);
        }

        this.pointGuideLabels = labelGroup;
        this.scene.add(labelGroup);
    }

    /**
     * Toggle trail visibility
     */
    toggleTrail(show) {
        this.showTrail = show;
        if (this.trailLine) {
            this.trailLine.visible = show;
        }
    }

    /**
     * Animate current position (pulsing effect)
     */
    animateCurrentPosition() {
        if (this.currentPositionMesh) {
            const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.2;
            this.applyPointScale(this.currentPositionMesh, 1.15 * pulse);
        }
    }

    /**
     * Update point size
     */
    setPointSize(size) {
        this.pointSizeScale = THREE.MathUtils.clamp(size, 0.2, 6);

        this.pointMeshes.forEach(mesh => {
            const multiplier = mesh === this.selectedPoint ? 1.5 : 1;
            this.applyPointScale(mesh, multiplier);
        });

        this.realTimePoints.forEach(mesh => {
            this.applyPointScale(mesh);
        });

        if (this.currentPositionMesh) {
            this.applyPointScale(this.currentPositionMesh, 1.15);
        }
    }

    /**
     * Toggle fading for real-time playback points.
     */
    setRealTimePointFade(enabled) {
        this.fadeRealTimePoints = !!enabled;
        if (!this.fadeRealTimePoints) {
            this.realTimePoints.forEach((mesh) => {
                if (mesh?.material) {
                    mesh.material.opacity = 0.7;
                }
            });
        }
    }

    /**
     * Set lifespan for real-time points before they fully disappear.
     */
    setRealTimePointFadeDuration(seconds) {
        const clamped = THREE.MathUtils.clamp(seconds, 0.3, 6);
        this.realTimePointFadeDurationMs = clamped * 1000;
    }

    /**
     * Fade and prune old real-time points while playback is active.
     */
    updateRealTimePointFade() {
        if (this.realTimePoints.length === 0) return;

        if (!this.fadeRealTimePoints) {
            return;
        }

        const now = performance.now();
        const duration = Math.max(1, this.realTimePointFadeDurationMs);
        const aliveMeshes = [];

        this.realTimePoints.forEach((mesh) => {
            if (!mesh?.userData) {
                mesh.userData = {};
            }
            if (!Number.isFinite(mesh.userData.bornAt)) {
                mesh.userData.bornAt = now;
            }

            const age = now - mesh.userData.bornAt;
            const life = 1 - (age / duration);

            if (life <= 0) {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                return;
            }

            mesh.material.opacity = THREE.MathUtils.clamp(life * 0.75, 0, 0.75);
            aliveMeshes.push(mesh);
        });

        this.realTimePoints = aliveMeshes;
    }

    /**
     * Enable or disable ripple burst visuals.
     */
    setRippleMode(enabled) {
        this.rippleMode = !!enabled;
    }

    /**
     * Set number of rings spawned per ripple event.
     */
    setRippleDensity(count) {
        this.rippleCount = THREE.MathUtils.clamp(Math.round(count), 1, 8);
    }

    /**
     * Set ring width for ripple meshes.
     */
    setRippleWidth(width) {
        this.rippleWidth = THREE.MathUtils.clamp(width, 0.03, 0.35);
    }

    /**
     * Set additive glow intensity for ripples.
     */
    setRippleGlow(intensity) {
        this.rippleGlowIntensity = THREE.MathUtils.clamp(intensity, 0.2, 3.5);
    }

    /**
     * Set opacity multiplier for ripple visibility.
     */
    setRippleOpacity(opacity) {
        this.rippleOpacityMultiplier = THREE.MathUtils.clamp(opacity, 0.05, 2.2);
    }

    /**
     * Set ripple duration in seconds.
     */
    setRippleDuration(seconds) {
        const clamped = THREE.MathUtils.clamp(seconds, 0.15, 2.5);
        this.rippleDurationMs = clamped * 1000;
    }

    /**
     * Animate wall rings where guide vectors hit the grid planes.
     */
    updatePointGuideWallRipples() {
        if (this.pointGuideWallRipples.length === 0) return;

        const now = performance.now();
        const alive = [];

        this.pointGuideWallRipples.forEach((ripple) => {
            const age = now - ripple.bornAt;
            const t = age / this.pointGuideWallRippleDurationMs;

            if (t >= 1) {
                this.scene.remove(ripple.mesh);
                ripple.mesh.geometry.dispose();
                ripple.mesh.material.dispose();
                return;
            }

            const eased = 1 - Math.pow(1 - t, 2);
            const radius = this.pointGuideWallRippleStartRadius + (eased * this.pointGuideWallRippleRadiusScale);
            const width = this.pointGuideWallRippleWidth * (1 - (0.6 * eased));

            ripple.mesh.geometry.dispose();
            ripple.mesh.geometry = new THREE.RingGeometry(
                Math.max(0.001, radius - (width * 0.5)),
                radius + (width * 0.5),
                42
            );
            ripple.mesh.material.opacity = THREE.MathUtils.clamp(0.9 * Math.pow(1 - t, 1.25), 0, 0.9);
            alive.push(ripple);
        });

        this.pointGuideWallRipples = alive;
    }

    /**
     * Enable/disable amplitude-based point visibility filtering.
     */
    setAmplitudeThresholdEnabled(enabled) {
        this.amplitudeThresholdEnabled = !!enabled;
    }

    /**
     * Set minimum amplitude (0..1) required for point rendering.
     */
    setAmplitudeThreshold(value) {
        this.amplitudeThreshold = THREE.MathUtils.clamp(value, 0, 1);
    }

    /**
     * Set whether amplitude threshold is scaled by waveform peak.
     */
    setAmplitudeThresholdRelativeToPeak(enabled) {
        this.amplitudeThresholdRelativeToPeak = !!enabled;
    }

    /**
     * Update latest waveform peak amplitude (0..1) from oscilloscope data.
     */
    setWaveformPeakAmplitude(peakAmplitude) {
        if (!Number.isFinite(peakAmplitude)) return;
        this.waveformPeakAmplitude = THREE.MathUtils.clamp(peakAmplitude, 0, 1);
    }

    /**
     * Decide if a point should be visible at current amplitude settings.
     */
    shouldRenderPointForAmplitude(features) {
        if (!this.amplitudeThresholdEnabled) return true;
        const amplitude = Number.isFinite(features?.amplitude) ? features.amplitude : 0;
        let effectiveThreshold = this.amplitudeThreshold;
        if (this.amplitudeThresholdRelativeToPeak) {
            // In peak-relative mode, keep slider as absolute minimum amplitude floor.
            const peakRelativeThreshold = Math.max(
                0,
                Math.min(1, this.waveformPeakAmplitude * this.waveformPeakThresholdScale)
            );
            effectiveThreshold = Math.max(this.amplitudeThreshold, peakRelativeThreshold);
        }
        return amplitude >= effectiveThreshold;
    }

    /**
     * Spawn concentric water-like ripples at a position.
     */
    spawnRipple(position, color) {
        const now = performance.now();
        const baseColor = color ? color.clone() : new THREE.Color(0x8fd0ff);
        const count = this.rippleCount;

        for (let i = 0; i < count; i++) {
            const delay = i * 55;
            const phase = i / Math.max(1, count - 1);
            const geometry = new THREE.SphereGeometry(1, 22, 16);
            const baseOpacity = THREE.MathUtils.clamp(
                ((0.34 + (this.rippleGlowIntensity * 0.22)) * (1 - (phase * 0.22))) * this.rippleOpacityMultiplier,
                0.03,
                1
            );
            const material = new THREE.MeshBasicMaterial({
                color: baseColor,
                transparent: true,
                opacity: 0,
                wireframe: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(position.x, position.y, position.z);
            mesh.scale.set(0.01, 0.01, 0.01);
            this.scene.add(mesh);

            this.activeRipples.push({
                mesh,
                bornAt: now + delay,
                durationMs: this.rippleDurationMs,
                baseOpacity,
                startRadius: 0.02 + (phase * this.rippleWidth * 0.35),
                endRadius: 0.58 + (this.rippleGlowIntensity * 0.34) + (phase * this.rippleWidth * 0.75),
                startY: position.y,
                centerX: position.x,
                centerZ: position.z,
                spinX: (Math.random() - 0.5) * 1.2,
                spinY: (Math.random() - 0.5) * 1.2
            });
        }

        // Cap live ripple meshes for long sessions.
        if (this.activeRipples.length > 520) {
            const overflow = this.activeRipples.splice(0, this.activeRipples.length - 520);
            overflow.forEach((ripple) => {
                this.scene.remove(ripple.mesh);
                ripple.mesh.geometry.dispose();
                ripple.mesh.material.dispose();
            });
        }
    }

    /**
     * Update existing ripples and remove expired ones.
     */
    updateRipples() {
        if (this.activeRipples.length === 0) return;

        const now = performance.now();
        const aliveRipples = [];

        this.activeRipples.forEach((ripple) => {
            if (now < ripple.bornAt) {
                aliveRipples.push(ripple);
                return;
            }

            const elapsed = now - ripple.bornAt;
            const t = elapsed / ripple.durationMs;
            if (t >= 1) {
                this.scene.remove(ripple.mesh);
                ripple.mesh.geometry.dispose();
                ripple.mesh.material.dispose();
                return;
            }

            const eased = 1 - Math.pow(1 - t, 2);
            const radius = THREE.MathUtils.lerp(ripple.startRadius, ripple.endRadius, eased);
            ripple.mesh.scale.set(radius, radius, radius);
            ripple.mesh.position.x = ripple.centerX;
            ripple.mesh.position.y = ripple.startY + (0.015 * eased);
            ripple.mesh.position.z = ripple.centerZ;
            ripple.mesh.rotation.x += ripple.spinX * 0.015;
            ripple.mesh.rotation.y += ripple.spinY * 0.015;
            ripple.mesh.material.opacity = THREE.MathUtils.clamp(ripple.baseOpacity * Math.pow(1 - t, 1.35), 0, 1);
            aliveRipples.push(ripple);
        });

        this.activeRipples = aliveRipples;
    }

    /**
     * Remove all active ripples.
     */
    clearRipples() {
        this.activeRipples.forEach((ripple) => {
            this.scene.remove(ripple.mesh);
            ripple.mesh.geometry.dispose();
            ripple.mesh.material.dispose();
        });
        this.activeRipples = [];
    }

    /**
     * Toggle grid visibility
     */
    toggleGrid(visible) {
        const grid = this.scene.getObjectByName('grid');
        if (grid) grid.visible = visible;
        this.gridVisible = !!visible;
        if (!this.gridVisible) {
            this.clearPointGuideWallRipples();
        }
        this.updatePointGuideVectors();
    }

    /**
     * Toggle axes visibility
     */
    toggleAxes(visible) {
        const axes = this.scene.getObjectByName('axes');
        if (axes) axes.visible = visible;
    }

    /**
     * Toggle automatic orbit around aggregate point center.
     */
    toggleAutoOrbit(enabled) {
        this.autoOrbit = !!enabled;
        if (this.controls) {
            this.controls.autoRotate = this.autoOrbit;
            if (this.autoOrbit) {
                const sign = this.controls.autoRotateSpeed < 0 ? -1 : 1;
                this.controls.autoRotateSpeed = this.autoOrbitBaseSpeedAbs * sign;
            }
        }
        this.wasNearGridBoundary = false;
    }

    /**
     * Set auto-orbit target follow sensitivity.
     * Higher values follow aggregate center more tightly.
     */
    setOrbitSensitivity(value) {
        this.autoOrbitLerp = THREE.MathUtils.clamp(value, 0.01, 0.5);
    }

    /**
     * Toggle orbit target preference to current point marker.
     */
    toggleOrbitAroundMarker(enabled) {
        this.orbitAroundMarker = !!enabled;
    }

    /**
     * Calculate aggregate center for all active points.
     */
    getAggregateCenter() {
        const vectors = [];

        this.pointMeshes.forEach(mesh => vectors.push(mesh.position));
        this.realTimePoints.forEach(mesh => vectors.push(mesh.position));
        if (this.currentPositionMesh) {
            vectors.push(this.currentPositionMesh.position);
        }

        if (vectors.length === 0) return null;

        const center = new THREE.Vector3(0, 0, 0);
        vectors.forEach(v => center.add(v));
        center.multiplyScalar(1 / vectors.length);
        return center;
    }

    /**
     * Keep orbit target focused on aggregate center instead of origin.
     */
    updateAutoOrbitTarget() {
        if (!this.autoOrbit || !this.controls) return;
        let target = null;

        if (this.orbitAroundMarker && this.currentPositionMesh) {
            target = this.currentPositionMesh.position;
        } else {
            target = this.getAggregateCenter();
        }

        if (!target) return;
        this.controls.target.lerp(target, this.autoOrbitLerp);
    }

    /**
     * Keep camera orbit constrained inside the visible grid volume.
     * When the camera touches the boundary, reverse orbit direction.
     */
    enforceOrbitOutsideGrid() {
        if (!this.controls || !this.camera) return;
        if (!this.autoOrbit || !this.gridVisible) {
            this.controls.minDistance = this.baseMinOrbitDistance;
            this.controls.maxDistance = this.baseMaxOrbitDistance;
            this.wasNearGridBoundary = false;
            return;
        }

        const grid = this.scene.getObjectByName('grid');
        if (!grid || !grid.visible) {
            this.controls.minDistance = this.baseMinOrbitDistance;
            this.controls.maxDistance = this.baseMaxOrbitDistance;
            this.wasNearGridBoundary = false;
            return;
        }

        const bounds = new THREE.Box3().setFromObject(grid);
        const origin = this.controls.target.clone();
        if (!bounds.containsPoint(origin)) {
            this.controls.minDistance = this.baseMinOrbitDistance;
            this.controls.maxDistance = this.baseMaxOrbitDistance;
            this.wasNearGridBoundary = false;
            return;
        }

        const dir = this.camera.position.clone().sub(origin);
        let distance = dir.length();
        if (distance < 0.0001) {
            dir.set(1, 0.2, 1).normalize();
            distance = 0.0001;
        } else {
            dir.normalize();
        }

        const intersectionDistance = this.getRayBoxExitDistance(origin, dir, bounds);
        if (!Number.isFinite(intersectionDistance)) return;

        const maxAllowedDistance = Math.max(
            this.baseMinOrbitDistance + 0.01,
            intersectionDistance - this.gridOrbitSurfaceMargin
        );
        this.controls.minDistance = this.baseMinOrbitDistance;
        this.controls.maxDistance = Math.min(this.baseMaxOrbitDistance, maxAllowedDistance);

        if (distance >= maxAllowedDistance) {
            this.camera.position.copy(origin).addScaledVector(dir, maxAllowedDistance - 0.01);
        }

        const boundaryThreshold = Math.max(0.005, maxAllowedDistance - 0.015);
        const now = performance.now();
        const nearBoundary = distance >= boundaryThreshold;
        const shouldBounce = (
            nearBoundary &&
            !this.wasNearGridBoundary &&
            (now - this.lastGridOrbitBounceAt) > this.gridOrbitBounceCooldownMs &&
            this.controls.autoRotate
        );

        if (shouldBounce) {
            // Keep camera continuous (no teleport): only randomize orbit travel.
            const baseSpeed = this.autoOrbitBaseSpeedAbs;
            const randomDirection = Math.random() < 0.5 ? -1 : 1;
            const randomSpeedScale = THREE.MathUtils.randFloat(0.92, 1.08);
            this.controls.autoRotateSpeed = baseSpeed * randomDirection * randomSpeedScale;
            this.lastGridOrbitBounceAt = now;
        }

        this.wasNearGridBoundary = nearBoundary;
    }

    /**
     * Ray-box exit distance for a ray starting inside/on bounds.
     */
    getRayBoxExitDistance(origin, direction, bounds) {
        const epsilon = 1e-8;
        let tMin = -Infinity;
        let tMax = Infinity;

        const axes = ['x', 'y', 'z'];
        for (let i = 0; i < axes.length; i++) {
            const axis = axes[i];
            const o = origin[axis];
            const d = direction[axis];
            const bMin = bounds.min[axis];
            const bMax = bounds.max[axis];

            if (Math.abs(d) < epsilon) {
                if (o < bMin || o > bMax) return null;
                continue;
            }

            const t1 = (bMin - o) / d;
            const t2 = (bMax - o) / d;
            const near = Math.min(t1, t2);
            const far = Math.max(t1, t2);

            tMin = Math.max(tMin, near);
            tMax = Math.min(tMax, far);

            if (tMin > tMax) return null;
        }

        return tMax >= 0 ? tMax : null;
    }

    /**
     * Export current point vectors and aggregate statistics.
     */
    getVectorSnapshot() {
        const vectors = [];

        this.pointMeshes.forEach((mesh, index) => {
            vectors.push({
                id: `S-${index + 1}`,
                type: 'static',
                x: mesh.position.x,
                y: mesh.position.y,
                z: mesh.position.z
            });
        });

        this.realTimeVectorHistory.forEach((point, index) => {
            vectors.push({
                id: `R-${index + 1}`,
                type: 'realtime',
                x: point.x,
                y: point.y,
                z: point.z
            });
        });

        if (this.currentPositionMesh) {
            vectors.push({
                id: 'M-1',
                type: 'marker',
                x: this.currentPositionMesh.position.x,
                y: this.currentPositionMesh.position.y,
                z: this.currentPositionMesh.position.z
            });
        }

        const aggregate = this.getAggregateCenter();
        return {
            timestamp: Date.now(),
            totalPoints: vectors.length,
            aggregateCenter: aggregate ? { x: aggregate.x, y: aggregate.y, z: aggregate.z } : null,
            vectors: vectors.map((v) => ({
                ...v,
                magnitude: Math.sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z))
            }))
        };
    }

    /**
     * Handle mouse click
     */
    onMouseClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.pointMeshes);

        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            this.selectPoint(selectedMesh);
        } else {
            this.deselectPoint();
        }
    }

    /**
     * Handle mouse move (for hover effects)
     */
    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.pointMeshes);

        // Reset all point scales
        this.pointMeshes.forEach(mesh => {
            if (mesh !== this.selectedPoint) {
                this.applyPointScale(mesh);
            }
        });

        // Highlight hovered point
        if (intersects.length > 0 && intersects[0].object !== this.selectedPoint) {
            this.applyPointScale(intersects[0].object, 1.3);
        }
    }

    /**
     * Select a point
     */
    selectPoint(mesh) {
        // Deselect previous
        if (this.selectedPoint) {
            this.selectedPoint.material.emissiveIntensity = 0.3;
            this.applyPointScale(this.selectedPoint);
        }

        // Select new
        this.selectedPoint = mesh;
        mesh.material.emissiveIntensity = 1.0;
        this.applyPointScale(mesh, 1.5);

        // Trigger custom event
        const event = new CustomEvent('pointSelected', {
            detail: {
                features: mesh.userData.features,
                metadata: mesh.userData.metadata,
                normalized: mesh.userData.normalized
            }
        });
        document.dispatchEvent(event);
        this.updatePointGuideVectors();
    }

    /**
     * Deselect current point
     */
    deselectPoint() {
        if (this.selectedPoint) {
            this.selectedPoint.material.emissiveIntensity = 0.3;
            this.applyPointScale(this.selectedPoint);
            this.selectedPoint = null;

            // Trigger custom event
            const event = new CustomEvent('pointDeselected');
            document.dispatchEvent(event);
        }
        this.updatePointGuideVectors();
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateAutoOrbitTarget();
        this.updateTrailFade();
        this.updateRealTimePointFade();
        this.updateRipples();
        this.updatePointGuideWallRipples();
        this.controls.update();
        this.enforceOrbitOutsideGrid();
        this.animateCurrentPosition();
        this.renderer.render(this.scene, this.camera);
    }
}
