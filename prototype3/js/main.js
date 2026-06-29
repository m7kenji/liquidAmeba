import { CONFIG } from './config.js';
import { pointer, ForceField, Amoeba } from './physics.js';
import { drawAmoeba, drawForceField, drawPointer } from './renderer.js';
import { ensureAudioPlay, updateWaterFlowSound, triggerAmebaBubble, updateAudioDroneDucking } from './audio.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// 物理モジュールが画面幅を動的に解決できるように window オブジェクトにバインド
window.VIEW_WIDTH = 360;
window.VIEW_HEIGHT = CONFIG.BASE_HEIGHT;

const blobs = [];
const forceFields = [];

// --- アメーバ群の初期生成 ---
function initBlobs() {
	for (let i = 0; i < CONFIG.NUM_BLOBS; i++) {
		const r = CONFIG.AMOEBA.MIN_RADIUS + Math.pow(Math.random(), 1.5) * CONFIG.AMOEBA.MAX_RADIUS_ADD;
		// 画面内にはみ出さない初期座標を計算
		const x = r + Math.random() * (window.VIEW_WIDTH - r * 2);
		const y = r + Math.random() * (window.VIEW_HEIGHT - r * 2);

		const blob = new Amoeba(x, y, r, i, blobs);
		
		// アメーバの結合・ちぎれイベントに音響トリガーを連携
		blob.onStateChange = (otherBlob, isJoined, xCoord) => {
			triggerAmebaBubble(xCoord / window.VIEW_WIDTH);
		};

		blobs.push(blob);
	}
}

// 画面外に出てしまったアメーバをビュー内に収めます
function clampBlobsToView() {
	blobs.forEach(blob => {
		const margin = blob.r * 0.4;
		blob.x = Math.max(margin, Math.min(window.VIEW_WIDTH - margin, blob.x));
		blob.y = Math.max(margin, Math.min(window.VIEW_HEIGHT - margin, blob.y));
	});
}

function resizeCanvas() {
	const aspect = window.innerWidth / window.innerHeight;
	window.VIEW_WIDTH = window.VIEW_HEIGHT * aspect;

	canvas.width = window.VIEW_WIDTH;
	canvas.height = window.VIEW_HEIGHT;
}

// 画面解像度と Canvas 仮想解像度のマッピング
function getPointerPos(e) {
	return {
		x: e.clientX * (window.VIEW_WIDTH / window.innerWidth),
		y: e.clientY * (window.VIEW_HEIGHT / window.innerHeight)
	};
}

// --- 毎フレームの更新ロジック ---
function update() {
	pointer.update();

	// 力場のライフ更新と削除
	for (let i = forceFields.length - 1; i >= 0; i--) {
		forceFields[i].update();
		if (!forceFields[i].alive) {
			forceFields.splice(i, 1);
		}
	}

	// 指の移動速度を水流音ASMRに同期し、ドローンの自動ダッキングを実行
	updateAudioDroneDucking(pointer.active);
	if (pointer.active) {
		const speed = Math.hypot(pointer.vx, pointer.vy);
		updateWaterFlowSound(speed);
	} else {
		updateWaterFlowSound(0);
	}

	// アメーバの物理更新
	blobs.forEach(blob => {
		blob.update(forceFields);
	});
}

// --- 毎フレームの描画ロジック ---
function draw() {
	// Canvas のクリア（アメーバの外側を完全透明にします）
	ctx.clearRect(0, 0, window.VIEW_WIDTH, window.VIEW_HEIGHT);

	// フィルムグレイン（砂嵐）の乱数シードを毎フレーム変化させてアニメーションさせます
	const noiseElement = document.getElementById('grain-noise');
	if (noiseElement) {
		noiseElement.setAttribute('seed', Math.floor(Math.random() * 10000));
	}

	// 1. 力場の描画 (白)
	ctx.fillStyle = '#ffffff';
	forceFields.forEach(field => {
		drawForceField(ctx, field);
	});

	// 2. アメーバの描画 (白)
	blobs.forEach(blob => {
		drawAmoeba(ctx, blob);
	});

	// 3. タッチの描画
	drawPointer(ctx, pointer);
}

// --- ループ管理 (30fps 固定) ---
const FRAME_INTERVAL = 1000 / CONFIG.TARGET_FPS;
let lastFrameTime = 0;

function loop(timestamp) {
	requestAnimationFrame(loop);

	if (timestamp - lastFrameTime < FRAME_INTERVAL) return;
	lastFrameTime = timestamp;

	update();
	draw();
}

// --- イベント登録 ---
window.addEventListener('resize', () => {
	resizeCanvas();
	clampBlobsToView();
});

canvas.addEventListener('pointerdown', (e) => {
	canvas.setPointerCapture(e.pointerId);

	pointer.active = true;
	const pos = getPointerPos(e);
	pointer.x = pos.x;
	pointer.y = pos.y;
	pointer.lastX = pos.x;
	pointer.lastY = pos.y;
	pointer.vx = 0;
	pointer.vy = 0;

	pointer.visualRadius = 0;

	// オーディオ制限解除とフェードイン起動
	ensureAudioPlay();
	// タッチした瞬間の水泡音
	triggerAmebaBubble(pos.x / window.VIEW_WIDTH);

	const hint = document.getElementById('hint');
	if (hint) hint.style.opacity = '0';
});

canvas.addEventListener('pointermove', (e) => {
	if (!pointer.active) return;
	
	// タッチ移動中のサスペンド復帰
	ensureAudioPlay();

	const pos = getPointerPos(e);
	pointer.x = pos.x;
	pointer.y = pos.y;
});

canvas.addEventListener('pointerup', (e) => {
	if (!pointer.active) return;

	pointer.active = false;
	canvas.releasePointerCapture(e.pointerId);

	// 指を離した瞬間の移動速度をアメーバへマイルドに伝える
	blobs.forEach(blob => {
		const dx = pointer.x - blob.x;
		const dy = pointer.y - blob.y;
		const dist = Math.hypot(dx, dy);

		if (dist < pointer.radius * 2.5) {
			const influence = 1 - dist / (pointer.radius * 2.5);
			blob.vx += pointer.vx * influence * 0.15;
			blob.vy += pointer.vy * influence * 0.15;
		}
	});

	// 力場の発生
	forceFields.push(new ForceField(pointer.x, pointer.y, pointer.vx, pointer.vy));
	if (forceFields.length > 5) {
		forceFields.shift();
	}

	// 指を離した瞬間の水泡音
	triggerAmebaBubble(pointer.x / window.VIEW_WIDTH);
});

canvas.addEventListener('pointercancel', () => {
	pointer.active = false;
	forceFields.push(new ForceField(pointer.x, pointer.y, pointer.vx, pointer.vy));
	if (forceFields.length > 5) {
		forceFields.shift();
	}
});

// ==================================================
// SETTINGS MENU & LOCAL STORAGE
// ==================================================

const STORAGE_KEY = 'amy_relaxation_settings';

// SVGフィルタのノイズ比率（ブレンド）を動的適用するヘルパー
function applyGrainStrength(val) {
	const blendElement = document.getElementById('grain-blend');
	if (!blendElement) return;
	// k1: 0 (乗算は不要)
	// k2: noisyOutline (ノイズ画像) の強さ = val
	// k3: outline (元アメーバのマスク) の強さ = 1.0 - val
	// スライダーを0.0に絞り込むと完全にノイズが消えて元の滑らかな輪郭に戻り、
	// 最大値に近づくほどざらざらとしたノイズへとリニアに置き換わります
	blendElement.setAttribute('k2', val);
	blendElement.setAttribute('k3', 1.0 - val);
}

function saveSettings() {
	const settings = {
		ambientVol: CONFIG.AUDIO.DRONE.VOLUME,
		flowVol: CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME,
		bubblesVol: CONFIG.AUDIO.BUBBLE.MAX_VOLUME,
		fluidSpeed: CONFIG.AMOEBA.MAX_SPEED,
		fluidFusion: CONFIG.AMOEBA.FUSION_RANGE_MULTIPLIER,
		lineWidth: parseFloat(document.getElementById('base-blur').getAttribute('stdDeviation')),
		attraction: CONFIG.POINTER.PULL_FORCE,
		wiggle: CONFIG.AMOEBA.WIGGLE_SCALE,
		grain: CONFIG.VISUAL.GRAIN_STRENGTH,
		blur: CONFIG.VISUAL.BLUR
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;

		const settings = JSON.parse(raw);

		if (settings.ambientVol !== undefined) CONFIG.AUDIO.DRONE.VOLUME = settings.ambientVol;
		if (settings.flowVol !== undefined) CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME = settings.flowVol;
		if (settings.bubblesVol !== undefined) CONFIG.AUDIO.BUBBLE.MAX_VOLUME = settings.bubblesVol;

		if (settings.fluidSpeed !== undefined) {
			CONFIG.AMOEBA.MAX_SPEED = settings.fluidSpeed;
			CONFIG.AMOEBA.PULSE_SPEED_MAX = 0.008 + settings.fluidSpeed * 0.006;
			CONFIG.AMOEBA.PULSE_SPEED_MIN = 0.003 + settings.fluidSpeed * 0.003;
		}

		if (settings.fluidFusion !== undefined) CONFIG.AMOEBA.FUSION_RANGE_MULTIPLIER = settings.fluidFusion;
		if (settings.attraction !== undefined) CONFIG.POINTER.PULL_FORCE = settings.attraction;
		if (settings.wiggle !== undefined) CONFIG.AMOEBA.WIGGLE_SCALE = settings.wiggle;
		if (settings.grain !== undefined) CONFIG.VISUAL.GRAIN_STRENGTH = settings.grain;
		if (settings.blur !== undefined) CONFIG.VISUAL.BLUR = settings.blur;

		if (settings.lineWidth !== undefined) {
			document.getElementById('base-blur').setAttribute('stdDeviation', settings.lineWidth);
		}

		if (settings.blur !== undefined) {
			document.getElementById('outline-blur').setAttribute('stdDeviation', settings.blur);
		}

		// ノイズフィルタブレンドの即時反映
		applyGrainStrength(CONFIG.VISUAL.GRAIN_STRENGTH);

		syncSlidersToConfig(settings);
	} catch (e) {
		console.error('Failed to load settings from storage', e);
	}
}

function syncSlidersToConfig(settings = {}) {
	const ambient = settings.ambientVol !== undefined ? settings.ambientVol : CONFIG.AUDIO.DRONE.VOLUME;
	const flow = settings.flowVol !== undefined ? settings.flowVol : CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME;
	const bubbles = settings.bubblesVol !== undefined ? settings.bubblesVol : CONFIG.AUDIO.BUBBLE.MAX_VOLUME;
	const speed = settings.fluidSpeed !== undefined ? settings.fluidSpeed : CONFIG.AMOEBA.MAX_SPEED;
	const fusion = settings.fluidFusion !== undefined ? settings.fluidFusion : CONFIG.AMOEBA.FUSION_RANGE_MULTIPLIER;
	const attraction = settings.attraction !== undefined ? settings.attraction : CONFIG.POINTER.PULL_FORCE;
	const wiggle = settings.wiggle !== undefined ? settings.wiggle : CONFIG.AMOEBA.WIGGLE_SCALE;
	const grain = settings.grain !== undefined ? settings.grain : CONFIG.VISUAL.GRAIN_STRENGTH;
	const blur = settings.blur !== undefined ? settings.blur : CONFIG.VISUAL.BLUR;

	const baseBlurElement = document.getElementById('base-blur');
	const outlineBlurElement = document.getElementById('outline-blur');
	
	const stdDev = settings.lineWidth !== undefined ? settings.lineWidth : parseFloat(baseBlurElement.getAttribute('stdDeviation'));
	const blurDev = settings.blur !== undefined ? settings.blur : parseFloat(outlineBlurElement.getAttribute('stdDeviation'));

	document.getElementById('param-ambient-vol').value = ambient;
	document.getElementById('param-flow-vol').value = flow;
	document.getElementById('param-bubbles-vol').value = bubbles;
	document.getElementById('param-fluid-speed').value = speed;
	document.getElementById('param-fluid-fusion').value = fusion;
	document.getElementById('param-line-width').value = stdDev;
	document.getElementById('param-blur').value = blurDev;
	document.getElementById('param-attraction').value = attraction;
	document.getElementById('param-wiggle').value = wiggle;
	document.getElementById('param-grain').value = grain;

	applyGrainStrength(grain);
}

function setupSettingsUI() {
	const trigger = document.getElementById('menu-trigger');
	const panel = document.getElementById('settings-panel');

	// メニュー開閉
	trigger.addEventListener('click', (e) => {
		e.stopPropagation();
		panel.classList.toggle('open');
	});

	// 設定パネル内部タッチがキャンバスに伝播して物理シミュレーションを邪魔するのを防ぎます
	panel.addEventListener('pointerdown', (e) => {
		e.stopPropagation();
	});
	panel.addEventListener('pointermove', (e) => {
		e.stopPropagation();
	});
	panel.addEventListener('pointerup', (e) => {
		e.stopPropagation();
	});

	// パネル外タッチで閉じる
	document.addEventListener('pointerdown', (e) => {
		if (!panel.contains(e.target) && e.target !== trigger) {
			panel.classList.remove('open');
		}
	});

	// 各スライダー変更時のイベント
	document.getElementById('param-ambient-vol').addEventListener('input', (e) => {
		CONFIG.AUDIO.DRONE.VOLUME = parseFloat(e.target.value);
		// 音響ゲインへ即時に滑らかに反映させます
		updateAudioDroneDucking(pointer.active, true);
		saveSettings();
	});

	document.getElementById('param-flow-vol').addEventListener('input', (e) => {
		CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME = parseFloat(e.target.value);
		saveSettings();
	});

	document.getElementById('param-bubbles-vol').addEventListener('input', (e) => {
		CONFIG.AUDIO.BUBBLE.MAX_VOLUME = parseFloat(e.target.value);
		saveSettings();
	});

	document.getElementById('param-fluid-speed').addEventListener('input', (e) => {
		const val = parseFloat(e.target.value);
		CONFIG.AMOEBA.MAX_SPEED = val;
		CONFIG.AMOEBA.PULSE_SPEED_MAX = 0.008 + val * 0.006;
		CONFIG.AMOEBA.PULSE_SPEED_MIN = 0.003 + val * 0.003;
		saveSettings();
	});

	document.getElementById('param-fluid-fusion').addEventListener('input', (e) => {
		CONFIG.AMOEBA.FUSION_RANGE_MULTIPLIER = parseFloat(e.target.value);
		saveSettings();
	});

	document.getElementById('param-line-width').addEventListener('input', (e) => {
		const val = parseFloat(e.target.value);
		document.getElementById('base-blur').setAttribute('stdDeviation', val);
		saveSettings();
	});

	document.getElementById('param-blur').addEventListener('input', (e) => {
		const val = parseFloat(e.target.value);
		CONFIG.VISUAL.BLUR = val;
		document.getElementById('outline-blur').setAttribute('stdDeviation', val);
		saveSettings();
	});

	document.getElementById('param-attraction').addEventListener('input', (e) => {
		CONFIG.POINTER.PULL_FORCE = parseFloat(e.target.value);
		saveSettings();
	});

	document.getElementById('param-wiggle').addEventListener('input', (e) => {
		CONFIG.AMOEBA.WIGGLE_SCALE = parseFloat(e.target.value);
		saveSettings();
	});

	document.getElementById('param-grain').addEventListener('input', (e) => {
		const val = parseFloat(e.target.value);
		CONFIG.VISUAL.GRAIN_STRENGTH = val;
		applyGrainStrength(val);
		saveSettings();
	});

	// デフォルトへのリセットイベント
	document.getElementById('btn-reset').addEventListener('click', (e) => {
		e.stopPropagation();

		const defaults = {
			ambientVol: 0.10,
			flowVol: 0.030,
			bubblesVol: 0.055,
			fluidSpeed: 0.16,
			fluidFusion: 1.5,
			lineWidth: 8.0,
			blur: 2.0,
			attraction: 0.22,
			wiggle: 1.0,
			grain: 0.40
		};

		// CONFIG パラメータの復元
		CONFIG.AUDIO.DRONE.VOLUME = defaults.ambientVol;
		CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME = defaults.flowVol;
		CONFIG.AUDIO.BUBBLE.MAX_VOLUME = defaults.bubblesVol;

		CONFIG.AMOEBA.MAX_SPEED = defaults.fluidSpeed;
		CONFIG.AMOEBA.PULSE_SPEED_MAX = 0.008 + defaults.fluidSpeed * 0.006;
		CONFIG.AMOEBA.PULSE_SPEED_MIN = 0.003 + defaults.fluidSpeed * 0.003;
		CONFIG.AMOEBA.FUSION_RANGE_MULTIPLIER = defaults.fluidFusion;
		CONFIG.POINTER.PULL_FORCE = defaults.attraction;
		CONFIG.AMOEBA.WIGGLE_SCALE = defaults.wiggle;
		CONFIG.VISUAL.GRAIN_STRENGTH = defaults.grain;
		CONFIG.VISUAL.BLUR = defaults.blur;

		// SVG フィルタの太さとノイズリセット
		document.getElementById('base-blur').setAttribute('stdDeviation', defaults.lineWidth);
		document.getElementById('outline-blur').setAttribute('stdDeviation', defaults.blur);
		applyGrainStrength(defaults.grain);

		// スライダーと設定値の同期
		syncSlidersToConfig(defaults);

		// 音量ゲインへ即時反映
		updateAudioDroneDucking(pointer.active, true);

		// ローカルストレージに保存
		saveSettings();
	});
}

// --- 初期化 ---
resizeCanvas();
initBlobs();
syncSlidersToConfig(); // デフォルト設定の同期
loadSettings();        // ローカルストレージ設定のロード
setupSettingsUI();     // UIイベント設定
requestAnimationFrame(loop);

// 数秒後に画面ヒントをフェードアウト
setTimeout(() => {
	const hint = document.getElementById('hint');
	if (hint) hint.style.opacity = '0';
}, 5000);
