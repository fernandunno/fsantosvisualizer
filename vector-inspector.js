const VECTOR_MATH_STORAGE_KEY = 'timbreVectorMathSnapshot';

const formulaList = document.getElementById('formulaList');
const totalPointsEl = document.getElementById('totalPoints');
const filePointCountEl = document.getElementById('filePointCount');
const audioFileNameEl = document.getElementById('audioFileName');
const analysisDurationEl = document.getElementById('analysisDuration');
const aggregateCenterEl = document.getElementById('aggregateCenter');
const analysisModeEl = document.getElementById('analysisMode');
const lastUpdateEl = document.getElementById('lastUpdate');
const vectorTableBody = document.getElementById('vectorTableBody');
const timbreImageViewport = document.getElementById('timbreImageViewport');
const timbreImageMeta = document.getElementById('timbreImageMeta');

let scene;
let camera;
let renderer;
let controls;
let pointGroup;
let axesHelper;
let gridHelper;
let animationHandle = null;
let latestSnapshot = null;
let analysisBroadcastChannel = null;
let axisLabelSprites = [];
let pointMeshById = new Map();
let selectedVectorId = null;
let selectionHaloMesh = null;
const selectionRaycaster = new THREE.Raycaster();
const selectionMouse = new THREE.Vector2();

function createWireframeGridBox() {
    const gridGroup = new THREE.Group();
    gridGroup.name = 'grid';

    const size = 5;
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

    const edges = [
        [{ x: 0, y: 0, z: 0 }, { x: size, y: 0, z: 0 }],
        [{ x: size, y: 0, z: 0 }, { x: size, y: 0, z: size }],
        [{ x: size, y: 0, z: size }, { x: 0, y: 0, z: size }],
        [{ x: 0, y: 0, z: size }, { x: 0, y: 0, z: 0 }],
        [{ x: 0, y: size, z: 0 }, { x: size, y: size, z: 0 }],
        [{ x: size, y: size, z: 0 }, { x: size, y: size, z: size }],
        [{ x: size, y: size, z: size }, { x: 0, y: size, z: size }],
        [{ x: 0, y: size, z: size }, { x: 0, y: size, z: 0 }],
        [{ x: 0, y: 0, z: 0 }, { x: 0, y: size, z: 0 }],
        [{ x: size, y: 0, z: 0 }, { x: size, y: size, z: 0 }],
        [{ x: size, y: 0, z: size }, { x: size, y: size, z: size }],
        [{ x: 0, y: 0, z: size }, { x: 0, y: size, z: size }]
    ];

    edges.forEach(([start, end]) => addLine(start, end));
    return gridGroup;
}

function fmt(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : '0.000';
}

function setText(el, text) {
    if (el) {
        el.textContent = text;
    }
}

function readSnapshot() {
    try {
        const raw = localStorage.getItem(VECTOR_MATH_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function renderFormulas(snapshot) {
    const xFormula = snapshot?.normalization?.xFormula || '(spectralCentroid / 10000) * 5';
    const yFormula = snapshot?.normalization?.yFormula || '(spectralRolloff / 10000) * 5';
    const zFormula = snapshot?.normalization?.zFormula || '(zeroCrossingRate * 10) * 3';

    if (formulaList) {
        formulaList.innerHTML = `
            <div>X = ${xFormula}</div>
            <div>Y = ${yFormula}</div>
            <div>Z = ${zFormula}</div>
        `;
    }
}

function renderStats(snapshot) {
    setText(totalPointsEl, String(snapshot?.totalPoints || 0));
    setText(filePointCountEl, String(snapshot?.filePointCount || 0));
    setText(audioFileNameEl, snapshot?.fileName || '-');
    setText(analysisDurationEl, `${fmt(snapshot?.duration || 0, 2)}s`);
    setText(analysisModeEl, snapshot?.analysisMode || 'raw-file');

    const aggregate = snapshot?.aggregateCenter;
    if (aggregate) {
        setText(aggregateCenterEl, `(${fmt(aggregate.x)}, ${fmt(aggregate.y)}, ${fmt(aggregate.z)})`);
    } else {
        setText(aggregateCenterEl, '(0.000, 0.000, 0.000)');
    }

    if (snapshot?.timestamp) {
        setText(lastUpdateEl, new Date(snapshot.timestamp).toLocaleTimeString());
    } else {
        setText(lastUpdateEl, '-');
    }
}

function renderTable(snapshot) {
    const vectors = Array.isArray(snapshot?.vectors) ? snapshot.vectors : [];
    if (vectors.length === 0) {
        vectorTableBody.innerHTML = '<tr><td colspan="6" class="empty">No vectors available yet.</td></tr>';
        return;
    }

    vectorTableBody.innerHTML = vectors.map((vector) => `
        <tr data-vector-id="${vector.id}" class="${selectedVectorId === vector.id ? 'selected-vector-row' : ''}">
            <td>${vector.id}</td>
            <td>${vector.type}</td>
            <td>${fmt(vector.x)}</td>
            <td>${fmt(vector.y)}</td>
            <td>${fmt(vector.z)}</td>
            <td>${fmt(vector.magnitude)}</td>
        </tr>
    `).join('');
}

function initTimbreImageViewport() {
    if (!timbreImageViewport || typeof THREE === 'undefined') return;

    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x090d16);

        const width = Math.max(320, timbreImageViewport.clientWidth || 320);
        const height = Math.max(260, timbreImageViewport.clientHeight || 260);
        camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.set(6, 6, 6);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, height);
        timbreImageViewport.appendChild(renderer.domElement);

        if (typeof THREE.OrbitControls === 'function') {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.minDistance = 2;
            controls.maxDistance = 40;
        } else {
            controls = {
                update() {},
                target: new THREE.Vector3(0, 0, 0)
            };
            setText(timbreImageMeta, '3D rendered without orbit controls.');
        }

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const dirA = new THREE.DirectionalLight(0x9ecbff, 0.8);
        dirA.position.set(7, 8, 6);
        scene.add(dirA);
        const dirB = new THREE.DirectionalLight(0x5f8bff, 0.4);
        dirB.position.set(-6, -4, -8);
        scene.add(dirB);

        axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);
        gridHelper = createWireframeGridBox();
        scene.add(gridHelper);
        createAxisLabels();

        pointGroup = new THREE.Group();
        scene.add(pointGroup);

        animateViewport();
        renderer.domElement.addEventListener('click', onViewportClick);
        window.addEventListener('resize', resizeTimbreImageViewport);
    } catch (error) {
        setText(timbreImageMeta, '3D renderer could not initialize in this tab. Refresh Analysis tab.');
        console.error('Failed to initialize Analysis 3D viewport:', error);
    }
}

function createTextSprite(label, color = '#cfe6ff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 42px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.8, 0.7, 1);
    return sprite;
}

function createAxisLabels() {
    if (!scene) return;
    axisLabelSprites.forEach((sprite) => scene.remove(sprite));
    axisLabelSprites = [];

    const xLabel = createTextSprite('X Brightness (Centroid)', '#ff9090');
    const yLabel = createTextSprite('Y High Frequency (Rolloff)', '#90ffb1');
    const zLabel = createTextSprite('Z Noisiness (ZCR)', '#9ab7ff');
    if (!xLabel || !yLabel || !zLabel) return;

    xLabel.position.set(5.8, 0.15, 0);
    yLabel.position.set(0.2, 5.8, 0);
    zLabel.position.set(0, 0.25, 5.8);

    axisLabelSprites.push(xLabel, yLabel, zLabel);
    axisLabelSprites.forEach((sprite) => scene.add(sprite));
}

function resizeTimbreImageViewport() {
    if (!renderer || !camera || !timbreImageViewport) return;
    const width = Math.max(320, timbreImageViewport.clientWidth || 320);
    const height = Math.max(260, timbreImageViewport.clientHeight || 260);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function clearPointGroup() {
    if (!pointGroup) return;
    pointMeshById.clear();
    if (selectionHaloMesh && scene) {
        scene.remove(selectionHaloMesh);
        if (selectionHaloMesh.geometry) selectionHaloMesh.geometry.dispose();
        if (selectionHaloMesh.material) selectionHaloMesh.material.dispose();
        selectionHaloMesh = null;
    }
    while (pointGroup.children.length > 0) {
        const mesh = pointGroup.children.pop();
        pointGroup.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    }
}

function colorForPoint(vector, minX, maxX) {
    const span = Math.max(0.001, maxX - minX);
    const norm = Math.max(0, Math.min(1, ((vector.x || 0) - minX) / span));
    const color = new THREE.Color();
    if (norm < 0.5) {
        color.lerpColors(new THREE.Color(0x00d1ff), new THREE.Color(0x2bff88), norm * 2);
    } else {
        color.lerpColors(new THREE.Color(0x2bff88), new THREE.Color(0xfff04a), (norm - 0.5) * 2);
    }
    return color;
}

function renderTimbreImage(snapshot) {
    if (!snapshot) {
        setText(timbreImageMeta, 'Waiting for analyzed audio file vectors...');
        return;
    }

    const fileVectors = Array.isArray(snapshot.fileSpaceVectors) ? snapshot.fileSpaceVectors : [];
    const displayVectors = fileVectors.length > 0
        ? fileVectors
        : (Array.isArray(snapshot.vectors) ? snapshot.vectors : []);

    if (!pointGroup) {
        if (displayVectors.length > 0) {
            setText(timbreImageMeta, `${displayVectors.length} vectors available, renderer not initialized.`);
        } else {
            setText(timbreImageMeta, 'Waiting for analyzed audio file vectors...');
        }
        return;
    }

    clearPointGroup();

    if (displayVectors.length === 0) {
        if (timbreImageMeta) {
            timbreImageMeta.textContent = 'Waiting for analyzed audio file vectors...';
        }
        return;
    }

    const xs = displayVectors.map((v) => Number.isFinite(v?.x) ? v.x : 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    const geometry = new THREE.SphereGeometry(0.09, 10, 10);
    displayVectors.forEach((vector) => {
        const color = colorForPoint(vector, minX, maxX);
        const material = new THREE.MeshPhongMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.45
        });
        const point = new THREE.Mesh(geometry.clone(), material);
        point.position.set(vector.x || 0, vector.y || 0, vector.z || 0);
        point.userData.vectorId = vector.id;
        point.userData.baseColor = color.clone();
        pointGroup.add(point);
        pointMeshById.set(vector.id, point);
    });
    applySelectedPointHighlight();

    if (timbreImageMeta) {
        const pointLabel = fileVectors.length > 0 ? 'file vectors' : 'active vectors';
        timbreImageMeta.textContent = `${displayVectors.length} ${pointLabel} rendered`;
    }
}

function applySelectedPointHighlight() {
    const selectedMesh = selectedVectorId ? pointMeshById.get(selectedVectorId) : null;

    pointMeshById.forEach((mesh, id) => {
        if (!mesh?.material) return;
        const baseColor = mesh.userData?.baseColor || new THREE.Color(0x65c8ff);
        if (id === selectedVectorId) {
            mesh.scale.set(3.2, 3.2, 3.2);
            mesh.material.color.set(0xffffff);
            mesh.material.emissive.set(0xffee88);
            mesh.material.emissiveIntensity = 2.0;
            mesh.material.opacity = 1;
            mesh.material.transparent = true;
        } else {
            mesh.scale.set(1, 1, 1);
            mesh.material.color.copy(baseColor);
            mesh.material.emissive.copy(baseColor);
            mesh.material.emissiveIntensity = 0.25;
            mesh.material.opacity = 0.18;
            mesh.material.transparent = true;
        }
    });

    if (!scene) return;
    if (!selectedMesh) {
        if (selectionHaloMesh) {
            scene.remove(selectionHaloMesh);
            if (selectionHaloMesh.geometry) selectionHaloMesh.geometry.dispose();
            if (selectionHaloMesh.material) selectionHaloMesh.material.dispose();
            selectionHaloMesh = null;
        }
        return;
    }

    if (!selectionHaloMesh) {
        const haloGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        const haloMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff4a3,
            transparent: true,
            opacity: 0.95,
            wireframe: true,
            depthWrite: false
        });
        selectionHaloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
        scene.add(selectionHaloMesh);
    }
    selectionHaloMesh.position.copy(selectedMesh.position);
}

function selectVectorById(vectorId) {
    selectedVectorId = vectorId || null;
    applySelectedPointHighlight();
    const rows = vectorTableBody?.querySelectorAll('tr[data-vector-id]');
    if (rows) {
        rows.forEach((row) => {
            const isSelected = row.dataset.vectorId === selectedVectorId;
            row.classList.toggle('selected-vector-row', isSelected);
            if (isSelected) {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
}

function onViewportClick(event) {
    if (!renderer || !camera || !pointGroup || pointGroup.children.length === 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    selectionMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    selectionMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    selectionRaycaster.setFromCamera(selectionMouse, camera);
    const hits = selectionRaycaster.intersectObjects(pointGroup.children, false);
    if (!hits || hits.length === 0) return;

    const picked = hits[0]?.object;
    const vectorId = picked?.userData?.vectorId;
    if (vectorId) {
        selectVectorById(vectorId);
    }
}

function animateViewport() {
    if (!renderer || !scene || !camera || !controls) return;
    if (selectionHaloMesh) {
        const pulse = 1 + (Math.sin(Date.now() * 0.01) * 0.18);
        selectionHaloMesh.scale.set(pulse, pulse, pulse);
        if (selectionHaloMesh.material) {
            selectionHaloMesh.material.opacity = 0.75 + (Math.sin(Date.now() * 0.014) * 0.2);
        }
    }
    controls.update();
    renderer.render(scene, camera);
    animationHandle = requestAnimationFrame(animateViewport);
}

function render() {
    try {
        const storageSnapshot = readSnapshot();
        const latestTs = Number.isFinite(latestSnapshot?.timestamp) ? latestSnapshot.timestamp : 0;
        const storageTs = Number.isFinite(storageSnapshot?.timestamp) ? storageSnapshot.timestamp : 0;
        const snapshot = storageTs >= latestTs ? storageSnapshot : latestSnapshot;
        if (snapshot) {
            latestSnapshot = snapshot;
        }
        renderFormulas(snapshot);
        renderStats(snapshot);
        renderTable(snapshot);
        renderTimbreImage(snapshot);
        applySelectedPointHighlight();
    } catch (error) {
        setText(timbreImageMeta, 'Analysis UI update failed. Refresh Analysis tab.');
        console.error('Analysis render failed:', error);
    }
}

initTimbreImageViewport();
if (vectorTableBody) {
    vectorTableBody.addEventListener('click', (event) => {
        const row = event.target?.closest('tr[data-vector-id]');
        if (!row) return;
        const id = row.dataset.vectorId;
        if (!id) return;
        selectVectorById(id);
    });
}
if (typeof BroadcastChannel !== 'undefined') {
    analysisBroadcastChannel = new BroadcastChannel('timbre-analysis');
    analysisBroadcastChannel.onmessage = (event) => {
        if (event?.data && typeof event.data === 'object') {
            latestSnapshot = event.data;
            render();
        }
    };
}
window.addEventListener('storage', (event) => {
    if (event.key === VECTOR_MATH_STORAGE_KEY && event.newValue) {
        try {
            latestSnapshot = JSON.parse(event.newValue);
            render();
        } catch (error) {
            // Ignore parse errors from transient writes.
        }
    }
});
render();
setInterval(render, 300);
