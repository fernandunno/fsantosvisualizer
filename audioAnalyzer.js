/**
 * Audio Analyzer Module
 * Extracts timbral features from audio files using Web Audio API
 */

class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
        this.audioBuffer = null;
        this.sourceNode = null;
        this.scriptProcessor = null;
    }

    /**
     * Initialize the audio context and analyser
     */
    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
        } catch (error) {
            console.error('Error initializing audio context:', error);
            throw error;
        }
    }

    /**
     * Load and analyze an audio file
     * @param {File} file - Audio file to analyze
     * @returns {Promise<Object>} Timbre features object
     */
    async analyzeFile(file) {
        if (!this.audioContext) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    const features = this.extractTimbreFeatures(audioBuffer);
                    resolve(features);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Extract timbre features from audio buffer
     * @param {AudioBuffer} audioBuffer - Decoded audio buffer
     * @returns {Object} Timbre features
     */
    extractTimbreFeatures(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0); // Use first channel

        // Calculate features for the entire audio
        const spectralCentroid = this.calculateSpectralCentroid(channelData, sampleRate);
        const spectralRolloff = this.calculateSpectralRolloff(channelData, sampleRate);
        const zeroCrossingRate = this.calculateZeroCrossingRate(channelData);
        const spectralFlux = this.calculateSpectralFlux(channelData, sampleRate);
        const mfcc = this.calculateMFCC(channelData, sampleRate);
        const pitchHarmonic = this.calculatePitchHarmonicSummary(channelData, sampleRate);

        // Also calculate features for time segments (for visualization)
        const segmentCount = this.getRecommendedSegmentCount(audioBuffer.duration);
        const segmentFeatures = this.calculateSegmentFeatures(channelData, sampleRate, segmentCount);

        return {
            overall: {
                spectralCentroid,
                spectralRolloff,
                zeroCrossingRate,
                spectralFlux,
                mfcc: mfcc.slice(0, 3), // Use first 3 MFCC coefficients
                duration: audioBuffer.duration,
                fundamentalHz: pitchHarmonic.fundamentalHz,
                pitchConfidence: pitchHarmonic.pitchConfidence,
                harmonicAmplitudes: pitchHarmonic.harmonicAmplitudes
            },
            segments: segmentFeatures,
            fileName: audioBuffer.duration > 0 ? 'audio' : 'unknown'
        };
    }

    /**
     * Choose segment count from actual audio length.
     * Keeps a fixed temporal density so longer files yield more points.
     */
    getRecommendedSegmentCount(durationSeconds = 0) {
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return 32;
        }
        return Math.max(1, Math.round(durationSeconds * 4));
    }

    /**
     * Calculate spectral centroid (brightness)
     */
    calculateSpectralCentroid(channelData, sampleRate) {
        const fftSize = 2048;
        const hopSize = fftSize / 2;
        const centroids = [];

        for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
            const segment = channelData.slice(i, i + fftSize);
            const fft = this.fft(segment);
            const magnitude = fft.magnitude;
            
            let weightedSum = 0;
            let magnitudeSum = 0;

            for (let j = 0; j < magnitude.length; j++) {
                const frequency = (j * sampleRate) / fftSize;
                weightedSum += frequency * magnitude[j];
                magnitudeSum += magnitude[j];
            }

            const centroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
            centroids.push(centroid);
        }

        return centroids.length > 0 ? centroids.reduce((a, b) => a + b, 0) / centroids.length : 0;
    }

    /**
     * Calculate spectral rolloff (high frequency content)
     */
    calculateSpectralRolloff(channelData, sampleRate, rolloffPoint = 0.85) {
        const fftSize = 2048;
        const hopSize = fftSize / 2;
        const rolloffs = [];

        for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
            const segment = channelData.slice(i, i + fftSize);
            const fft = this.fft(segment);
            const magnitude = fft.magnitude;
            
            const totalEnergy = magnitude.reduce((a, b) => a + b * b, 0);
            let cumulativeEnergy = 0;
            let rolloff = 0;

            for (let j = 0; j < magnitude.length; j++) {
                cumulativeEnergy += magnitude[j] * magnitude[j];
                if (cumulativeEnergy >= rolloffPoint * totalEnergy) {
                    rolloff = (j * sampleRate) / fftSize;
                    break;
                }
            }

            rolloffs.push(rolloff);
        }

        return rolloffs.length > 0 ? rolloffs.reduce((a, b) => a + b, 0) / rolloffs.length : 0;
    }

    /**
     * Calculate zero crossing rate (noisiness)
     */
    calculateZeroCrossingRate(channelData) {
        let crossings = 0;
        for (let i = 1; i < channelData.length; i++) {
            if ((channelData[i] >= 0) !== (channelData[i - 1] >= 0)) {
                crossings++;
            }
        }
        return crossings / channelData.length;
    }

    /**
     * Calculate RMS amplitude normalized to 0..1
     */
    calculateAmplitude(channelData) {
        if (!channelData || channelData.length === 0) {
            return 0;
        }

        let sumSquares = 0;
        for (let i = 0; i < channelData.length; i++) {
            const sample = channelData[i];
            sumSquares += sample * sample;
        }

        return Math.max(0, Math.min(1, Math.sqrt(sumSquares / channelData.length)));
    }

    /**
     * Calculate spectral flux (change in spectrum)
     */
    calculateSpectralFlux(channelData, sampleRate) {
        const fftSize = 2048;
        const hopSize = fftSize / 2;
        const fluxes = [];
        let previousMagnitude = null;

        for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
            const segment = channelData.slice(i, i + fftSize);
            const fft = this.fft(segment);
            const magnitude = fft.magnitude;

            if (previousMagnitude) {
                let flux = 0;
                for (let j = 0; j < magnitude.length; j++) {
                    const diff = magnitude[j] - previousMagnitude[j];
                    if (diff > 0) {
                        flux += diff;
                    }
                }
                fluxes.push(flux);
            }

            previousMagnitude = magnitude;
        }

        return fluxes.length > 0 ? fluxes.reduce((a, b) => a + b, 0) / fluxes.length : 0;
    }

    /**
     * Calculate MFCC (Mel-frequency cepstral coefficients)
     */
    calculateMFCC(channelData, sampleRate) {
        const fftSize = 2048;
        const segment = channelData.slice(0, Math.min(fftSize, channelData.length));
        const fft = this.fft(segment);
        const magnitude = fft.magnitude;

        // Simplified MFCC calculation
        const numCoeffs = 13;
        const mfcc = [];

        // Apply mel filter bank (simplified)
        const melFilters = this.createMelFilterBank(fftSize, sampleRate, numCoeffs);
        
        for (let i = 0; i < numCoeffs; i++) {
            let melEnergy = 0;
            for (let j = 0; j < magnitude.length; j++) {
                melEnergy += magnitude[j] * melFilters[i][j];
            }
            mfcc.push(Math.log10(melEnergy + 1e-10));
        }

        return mfcc;
    }

    /**
     * Create mel filter bank
     */
    createMelFilterBank(fftSize, sampleRate, numFilters) {
        const filters = [];
        const nyquist = sampleRate / 2;
        const melMax = 2595 * Math.log10(1 + nyquist / 700);

        for (let i = 0; i < numFilters; i++) {
            const filter = new Array(fftSize / 2).fill(0);
            const melStart = (melMax / (numFilters + 1)) * i;
            const melCenter = (melMax / (numFilters + 1)) * (i + 1);
            const melEnd = (melMax / (numFilters + 1)) * (i + 2);

            const freqStart = 700 * (Math.pow(10, melStart / 2595) - 1);
            const freqCenter = 700 * (Math.pow(10, melCenter / 2595) - 1);
            const freqEnd = 700 * (Math.pow(10, melEnd / 2595) - 1);

            const binStart = Math.floor((freqStart / nyquist) * (fftSize / 2));
            const binCenter = Math.floor((freqCenter / nyquist) * (fftSize / 2));
            const binEnd = Math.floor((freqEnd / nyquist) * (fftSize / 2));

            for (let j = binStart; j < binCenter; j++) {
                if (j >= 0 && j < fftSize / 2) {
                    filter[j] = (j - binStart) / (binCenter - binStart);
                }
            }

            for (let j = binCenter; j < binEnd; j++) {
                if (j >= 0 && j < fftSize / 2) {
                    filter[j] = (binEnd - j) / (binEnd - binCenter);
                }
            }

            filters.push(filter);
        }

        return filters;
    }

    /**
     * Harmonic product spectrum + parabolic refinement for fundamental frequency (Hz).
     * Uses log-domain products so magnitudes ~1e-4 do not underflow, and gates on the
     * distribution of HPS scores (not raw bin median — that compared mag^5 to mag^1 and always failed).
     */
    estimateFundamentalHPS(magnitude, sampleRate, fftSize) {
        const binCount = magnitude.length;
        const freqPerBin = sampleRate / fftSize;
        const minF = 65;
        const maxF = 2500;
        let kMin = Math.max(2, Math.floor(minF / freqPerBin));
        let kMax = Math.min(binCount - 3, Math.floor(maxF / freqPerBin));
        if (kMax <= kMin) {
            return { f0Hz: null, confidence: 0 };
        }

        const eps = 1e-18;
        const hpsLog = new Float32Array(kMax + 1);
        let peakLog = -Infinity;
        let sumLog = 0;
        let countK = 0;

        for (let k = kMin; k <= kMax; k++) {
            let logp = Math.log(magnitude[k] + eps);
            let valid = true;
            for (let r = 2; r <= 5; r++) {
                const rk = k * r;
                if (rk < binCount) {
                    logp += Math.log(magnitude[rk] + eps);
                } else {
                    valid = false;
                    break;
                }
            }
            if (!valid) {
                hpsLog[k] = -1e9;
                continue;
            }
            hpsLog[k] = logp;
            sumLog += logp;
            countK++;
            if (logp > peakLog) {
                peakLog = logp;
            }
        }

        if (countK < 4 || !Number.isFinite(peakLog)) {
            return this.estimateFundamentalSpectralPeak(magnitude, sampleRate, fftSize, kMin, kMax);
        }

        const medianLogHps = this.estimateHpsLogMedian(hpsLog, kMin, kMax);
        const meanLog = countK > 0 ? sumLog / countK : medianLogHps;
        // Peak must stand out above typical HPS clutter (~e^1.25 ≈ 3.5× product vs median candidate).
        const clarity = peakLog - medianLogHps;
        if (clarity < 1.25) {
            return this.estimateFundamentalSpectralPeak(magnitude, sampleRate, fftSize, kMin, kMax);
        }

        let peakK = kMin;
        for (let k = kMin; k <= kMax; k++) {
            if (hpsLog[k] > hpsLog[peakK]) {
                peakK = k;
            }
        }

        let delta = 0;
        if (peakK > kMin && peakK < kMax) {
            const a = hpsLog[peakK - 1];
            const b = hpsLog[peakK];
            const c = hpsLog[peakK + 1];
            if (a > -1e8 && b > -1e8 && c > -1e8) {
                const denom = a - 2 * b + c;
                if (Math.abs(denom) > 1e-12) {
                    delta = 0.5 * (a - c) / denom;
                    delta = Math.max(-0.5, Math.min(0.5, delta));
                }
            }
        }

        const f0Hz = (peakK + delta) * freqPerBin;
        const spread = Math.max(0.1, peakLog - meanLog);
        const confidence = Math.min(1, clarity / 6 + spread / 25);

        return {
            f0Hz: Number.isFinite(f0Hz) ? f0Hz : null,
            confidence
        };
    }

    /**
     * Fallback: dominant spectral peak in band, if it is a local maximum (handles weak upper harmonics in HPS).
     */
    estimateFundamentalSpectralPeak(magnitude, sampleRate, fftSize, kMin, kMax) {
        const freqPerBin = sampleRate / fftSize;
        let peakK = -1;
        let peakMag = 0;
        for (let k = kMin + 1; k <= kMax - 1; k++) {
            const m = magnitude[k];
            if (m > magnitude[k - 1] && m >= magnitude[k + 1] && m > peakMag) {
                peakMag = m;
                peakK = k;
            }
        }
        if (peakK < 0) {
            return { f0Hz: null, confidence: 0 };
        }

        const bandMedian = this.estimateMagnitudeMedian(magnitude, kMin, kMax);
        if (bandMedian <= 0 || peakMag < bandMedian * 1.85) {
            return { f0Hz: null, confidence: 0 };
        }

        let delta = 0;
        if (peakK > kMin && peakK < kMax) {
            const a = magnitude[peakK - 1];
            const b = magnitude[peakK];
            const c = magnitude[peakK + 1];
            const denom = a - 2 * b + c;
            if (Math.abs(denom) > 1e-20) {
                delta = 0.5 * (a - c) / denom;
                delta = Math.max(-0.5, Math.min(0.5, delta));
            }
        }

        const f0Hz = (peakK + delta) * freqPerBin;
        const confidence = Math.min(0.85, 0.25 + (peakMag / (bandMedian * 4)) * 0.2);

        return {
            f0Hz: Number.isFinite(f0Hz) ? f0Hz : null,
            confidence
        };
    }

    estimateMagnitudeMedian(magnitude, kMin, kMax) {
        const slice = [];
        for (let k = kMin; k <= kMax; k++) {
            slice.push(magnitude[k]);
        }
        slice.sort((a, b) => a - b);
        const mid = Math.floor(slice.length / 2);
        return slice.length ? (slice.length % 2 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2) : 0;
    }

    /** Median of log-HPS values, ignoring invalid-bin sentinels. */
    estimateHpsLogMedian(hpsLog, kMin, kMax) {
        const slice = [];
        for (let k = kMin; k <= kMax; k++) {
            const v = hpsLog[k];
            if (v > -1e8) {
                slice.push(v);
            }
        }
        if (slice.length === 0) {
            return -Infinity;
        }
        slice.sort((a, b) => a - b);
        const mid = Math.floor(slice.length / 2);
        return slice.length % 2 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
    }

    /**
     * Sample harmonic magnitudes at k * f0. Uses local PEAK in a bin window so coarse FFT
     * bins still catch partials that sit between theoretical k·f0 grid points.
     */
    modelHarmonicAmplitudes(magnitude, sampleRate, fftSize, f0Hz, numHarmonics = 12) {
        const binCount = magnitude.length;
        const freqPerBin = sampleRate / fftSize;
        const harmonics = [];
        let total = 0;

        // ~±35 Hz search (half-width in bins), clamped — enough to straddle one bin at 44.1k/1024.
        const halfBins = Math.max(2, Math.min(14, Math.round(35 / freqPerBin)));

        for (let h = 1; h <= numHarmonics; h++) {
            const fc = f0Hz * h;
            const binCenter = fc / freqPerBin;
            if (binCenter >= binCount - 1) {
                harmonics.push({
                    harmonic: h,
                    frequencyHz: fc,
                    magnitude: 0,
                    normalized: 0,
                    relativePeak: 0
                });
                continue;
            }

            const iCenter = Math.round(binCenter);
            let peak = 0;
            for (let d = -halfBins; d <= halfBins; d++) {
                const idx = iCenter + d;
                if (idx >= 0 && idx < binCount) {
                    const v = magnitude[idx];
                    if (v > peak) {
                        peak = v;
                    }
                }
            }

            harmonics.push({ harmonic: h, frequencyHz: fc, magnitude: peak });
            total += peak;
        }

        let maxPartial = 0;
        for (let i = 0; i < harmonics.length; i++) {
            if (harmonics[i].magnitude > maxPartial) {
                maxPartial = harmonics[i].magnitude;
            }
        }
        const invMax = maxPartial > 0 ? 1 / maxPartial : 0;
        const invSum = total > 0 ? 1 / total : 0;

        for (let i = 0; i < harmonics.length; i++) {
            const m = harmonics[i].magnitude;
            harmonics[i].normalized = m * invSum;
            harmonics[i].relativePeak = m * invMax;
        }

        return { harmonics, totalHarmonicEnergy: total };
    }

    /**
     * Zero-pad or trim to fftSize and run FFT once for pitch + harmonics.
     */
    analyzePitchHarmonicsFromSamples(channelData, sampleRate, fftSize = 2048) {
        if (!channelData || channelData.length < 256) {
            return {
                fundamentalHz: null,
                pitchConfidence: 0,
                harmonicAmplitudes: []
            };
        }

        const frame = new Float32Array(fftSize);
        const n = Math.min(channelData.length, fftSize);
        frame.set(channelData.subarray(0, n));

        const fft = this.fft(frame);
        const magnitude = fft.magnitude;
        const pitch = this.estimateFundamentalHPS(magnitude, sampleRate, fftSize);

        if (pitch.f0Hz == null || pitch.f0Hz <= 0) {
            return {
                fundamentalHz: null,
                pitchConfidence: 0,
                harmonicAmplitudes: []
            };
        }

        const model = this.modelHarmonicAmplitudes(magnitude, sampleRate, fftSize, pitch.f0Hz, 12);

        return {
            fundamentalHz: pitch.f0Hz,
            pitchConfidence: pitch.confidence,
            harmonicAmplitudes: model.harmonics.map((h) => ({
                harmonic: h.harmonic,
                frequencyHz: h.frequencyHz,
                magnitude: h.magnitude,
                normalized: h.normalized,
                relativePeak: h.relativePeak
            }))
        };
    }

    /**
     * Aggregate pitch / harmonic shape across the file (same hop grid as spectral centroid).
     */
    calculatePitchHarmonicSummary(channelData, sampleRate) {
        const fftSize = 2048;
        const hopSize = fftSize / 2;
        const f0List = [];
        const confList = [];
        const harmonicAcc = new Float32Array(12);

        for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
            const segment = channelData.slice(i, i + fftSize);
            const frame = this.analyzePitchHarmonicsFromSamples(segment, sampleRate, fftSize);
            if (frame.fundamentalHz != null && frame.fundamentalHz > 0) {
                f0List.push(frame.fundamentalHz);
                confList.push(frame.pitchConfidence);
                for (let h = 0; h < Math.min(12, frame.harmonicAmplitudes.length); h++) {
                    harmonicAcc[h] += frame.harmonicAmplitudes[h].normalized || 0;
                }
            }
        }

        if (f0List.length === 0) {
            return {
                fundamentalHz: null,
                pitchConfidence: 0,
                harmonicAmplitudes: []
            };
        }

        const sumF0 = f0List.reduce((a, b) => a + b, 0);
        const meanConf = confList.reduce((a, b) => a + b, 0) / confList.length;
        const inv = 1 / f0List.length;
        const avgHarm = [];
        for (let h = 0; h < 12; h++) {
            const norm = harmonicAcc[h] * inv;
            avgHarm.push({
                harmonic: h + 1,
                frequencyHz: null,
                magnitude: null,
                normalized: norm
            });
        }

        return {
            fundamentalHz: sumF0 * inv,
            pitchConfidence: meanConf,
            harmonicAmplitudes: avgHarm
        };
    }

    /**
     * Web Audio AnalyserNode frequency data is not linear magnitude:
     * - getFloatFrequencyData: dB (typically ≤ 0)
     * - getByteFrequencyData/255: compressed; map with min/max dB like the spec
     * Our own FFT path uses analyzePitchHarmonicsFromSamples() instead.
     */
    linearizeAnalyserMagnitudeFrame(magnitudes) {
        const n = magnitudes.length;
        const out = new Float32Array(n);
        if (n === 0) {
            return out;
        }

        let max = -Infinity;
        for (let i = 0; i < n; i++) {
            if (magnitudes[i] > max) {
                max = magnitudes[i];
            }
        }

        const minDb = -100;
        const maxDb = -30;

        if (max <= 0) {
            for (let i = 0; i < n; i++) {
                const db = Math.max(minDb, magnitudes[i]);
                out[i] = Math.pow(10, db / 20);
            }
            return out;
        }

        if (max <= 1.001) {
            for (let i = 0; i < n; i++) {
                const t = Math.max(0, Math.min(1, magnitudes[i]));
                const db = minDb + t * (maxDb - minDb);
                out[i] = Math.pow(10, db / 20);
            }
            return out;
        }

        for (let i = 0; i < n; i++) {
            out[i] = Math.max(0, magnitudes[i]);
        }
        return out;
    }

    /**
     * Pitch/harmonics from AnalyserNode-style magnitudes (dB float or byte-normalized 0..1),
     * or pass { alreadyLinear: true } if magnitudes are already linear (e.g. after linearizeAnalyserMagnitudeFrame).
     */
    analyzePitchHarmonicsFromMagnitudes(linearMagnitudes, sampleRate, fftSize, options = {}) {
        if (!linearMagnitudes || linearMagnitudes.length < 8) {
            return {
                fundamentalHz: null,
                pitchConfidence: 0,
                harmonicAmplitudes: []
            };
        }

        const raw = linearMagnitudes instanceof Float32Array
            ? linearMagnitudes
            : Float32Array.from(linearMagnitudes);
        const alreadyLinear = !!options.alreadyLinear;
        const magnitude = alreadyLinear ? raw : this.linearizeAnalyserMagnitudeFrame(raw);

        const pitch = this.estimateFundamentalHPS(magnitude, sampleRate, fftSize);
        if (pitch.f0Hz == null || pitch.f0Hz <= 0) {
            return {
                fundamentalHz: null,
                pitchConfidence: 0,
                harmonicAmplitudes: []
            };
        }

        const model = this.modelHarmonicAmplitudes(magnitude, sampleRate, fftSize, pitch.f0Hz, 12);

        return {
            fundamentalHz: pitch.f0Hz,
            pitchConfidence: pitch.confidence,
            harmonicAmplitudes: model.harmonics.map((h) => ({
                harmonic: h.harmonic,
                frequencyHz: h.frequencyHz,
                magnitude: h.magnitude,
                normalized: h.normalized,
                relativePeak: h.relativePeak
            }))
        };
    }

    /**
     * Calculate features for time segments
     */
    calculateSegmentFeatures(channelData, sampleRate, numSegments = 10) {
        const segmentLength = Math.floor(channelData.length / numSegments);
        const features = [];

        for (let i = 0; i < numSegments; i++) {
            const start = i * segmentLength;
            const end = Math.min(start + segmentLength, channelData.length);
            const segment = channelData.slice(start, end);

            const centroid = this.calculateSpectralCentroid(segment, sampleRate);
            const rolloff = this.calculateSpectralRolloff(segment, sampleRate);
            const zcr = this.calculateZeroCrossingRate(segment);
            const amplitude = this.calculateAmplitude(segment);

            const pitchFrame = this.analyzePitchHarmonicsFromSamples(segment, sampleRate);

            features.push({
                spectralCentroid: centroid,
                spectralRolloff: rolloff,
                zeroCrossingRate: zcr,
                amplitude,
                fundamentalHz: pitchFrame.fundamentalHz,
                pitchConfidence: pitchFrame.pitchConfidence,
                harmonicAmplitudes: pitchFrame.harmonicAmplitudes,
                time: (start / sampleRate)
            });
        }

        return features;
    }

    /**
     * Fast Fourier Transform (simplified implementation)
     */
    fft(signal) {
        const N = signal.length;
        const real = new Float32Array(N);
        const imag = new Float32Array(N);
        const magnitude = new Float32Array(N / 2);

        // Copy signal to real part
        for (let i = 0; i < N; i++) {
            real[i] = signal[i];
            imag[i] = 0;
        }

        // Apply window function (Hanning)
        for (let i = 0; i < N; i++) {
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
            real[i] *= window;
        }

        // Simple FFT (for production, use a proper FFT library)
        this.fftRecursive(real, imag, N);

        // Calculate magnitude
        for (let i = 0; i < N / 2; i++) {
            magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        }

        return { real, imag, magnitude };
    }

    /**
     * Recursive FFT implementation
     */
    fftRecursive(real, imag, N) {
        if (N <= 1) return;

        // Divide
        const evenReal = new Float32Array(N / 2);
        const evenImag = new Float32Array(N / 2);
        const oddReal = new Float32Array(N / 2);
        const oddImag = new Float32Array(N / 2);

        for (let i = 0; i < N / 2; i++) {
            evenReal[i] = real[i * 2];
            evenImag[i] = imag[i * 2];
            oddReal[i] = real[i * 2 + 1];
            oddImag[i] = imag[i * 2 + 1];
        }

        // Conquer
        this.fftRecursive(evenReal, evenImag, N / 2);
        this.fftRecursive(oddReal, oddImag, N / 2);

        // Combine
        for (let k = 0; k < N / 2; k++) {
            const tReal = Math.cos(-2 * Math.PI * k / N) * oddReal[k] - Math.sin(-2 * Math.PI * k / N) * oddImag[k];
            const tImag = Math.sin(-2 * Math.PI * k / N) * oddReal[k] + Math.cos(-2 * Math.PI * k / N) * oddImag[k];

            real[k] = evenReal[k] + tReal;
            imag[k] = evenImag[k] + tImag;
            real[k + N / 2] = evenReal[k] - tReal;
            imag[k + N / 2] = evenImag[k] - tImag;
        }
    }

    /**
     * Setup real-time audio analysis from a playing audio source
     * @param {AudioBufferSourceNode} sourceNode - The audio source node
     * @param {AudioBuffer} audioBuffer - The audio buffer
     * @param {Function} onUpdate - Callback function called with timbre features
     * @returns {ScriptProcessorNode} The script processor node
     */
    setupRealTimeAnalysis(sourceNode, audioBuffer, onUpdate) {
        this.audioBuffer = audioBuffer;
        this.sourceNode = sourceNode;

        // Create script processor for real-time analysis
        const bufferSize = 2048;
        this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        let audioData = new Float32Array(bufferSize);
        let segmentBuffer = [];
        const segmentSize = 2048 * 4; // Analyze every ~0.1 seconds at 44.1kHz

        this.scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Copy to our buffer
            audioData.set(inputData);

            // Accumulate samples
            segmentBuffer.push(...Array.from(inputData));

            // When we have enough samples, analyze
            if (segmentBuffer.length >= segmentSize) {
                const segment = new Float32Array(segmentBuffer.slice(0, segmentSize));
                segmentBuffer = segmentBuffer.slice(segmentSize);

                // Calculate features for this segment
                const sampleRate = this.audioContext.sampleRate;
                const pitchFrame = this.analyzePitchHarmonicsFromSamples(segment, sampleRate);
                const features = {
                    spectralCentroid: this.calculateSpectralCentroid(segment, sampleRate),
                    spectralRolloff: this.calculateSpectralRolloff(segment, sampleRate),
                    zeroCrossingRate: this.calculateZeroCrossingRate(segment),
                    spectralFlux: this.calculateSpectralFlux(segment, sampleRate),
                    fundamentalHz: pitchFrame.fundamentalHz,
                    pitchConfidence: pitchFrame.pitchConfidence,
                    harmonicAmplitudes: pitchFrame.harmonicAmplitudes
                };

                // Get current playback time
                const currentTime = this.sourceNode.context.currentTime - (this.sourceNode.startTime || 0);
                features.time = Math.max(0, currentTime);

                // Call update callback
                if (onUpdate) {
                    onUpdate(features);
                }
            }

            // Pass through audio
            e.outputBuffer.getChannelData(0).set(inputData);
        };

        // Connect the source to analyser and script processor
        sourceNode.connect(this.analyser);
        sourceNode.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);

        return this.scriptProcessor;
    }

    /**
     * Analyze a specific time segment from the audio buffer
     * @param {number} startTime - Start time in seconds
     * @param {number} duration - Duration in seconds
     * @returns {Object} Timbre features for the segment
     */
    analyzeTimeSegment(startTime, duration = 0.1) {
        if (!this.audioBuffer) {
            return null;
        }

        const sampleRate = this.audioBuffer.sampleRate;
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.min(
            Math.floor((startTime + duration) * sampleRate),
            this.audioBuffer.length
        );

        if (startSample >= this.audioBuffer.length) {
            return null;
        }

        const channelData = this.audioBuffer.getChannelData(0);
        const segment = channelData.slice(startSample, endSample);

        if (segment.length < 512) {
            return null; // Too short to analyze
        }

        const pitchFrame = this.analyzePitchHarmonicsFromSamples(segment, sampleRate);

        return {
            spectralCentroid: this.calculateSpectralCentroid(segment, sampleRate),
            spectralRolloff: this.calculateSpectralRolloff(segment, sampleRate),
            zeroCrossingRate: this.calculateZeroCrossingRate(segment),
            spectralFlux: this.calculateSpectralFlux(segment, sampleRate),
            amplitude: this.calculateAmplitude(segment),
            fundamentalHz: pitchFrame.fundamentalHz,
            pitchConfidence: pitchFrame.pitchConfidence,
            harmonicAmplitudes: pitchFrame.harmonicAmplitudes,
            time: startTime
        };
    }

    /**
     * Clean up real-time analysis
     */
    cleanup() {
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
    }
}
