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
	if (typeof updateInterpolations === 'function') {
		updateInterpolations();
	}

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

// --- LINE WIDTH と GRAIN の滑らかな補間システム ---
const interpolations = {
	lineWidth: {
		current: 22.0, // デフォルト初期値
		target: 22.0
	},
	grain: {
		current: 0.38,
		target: 0.38
	}
};

function applyActualLineWidth(val) {
	const el = document.getElementById('base-blur');
	if (el) el.setAttribute('stdDeviation', val);
}

function applyActualGrain(val) {
	const blendElement = document.getElementById('grain-blend');
	if (blendElement) {
		blendElement.setAttribute('k2', val);
		blendElement.setAttribute('k3', 1.0 - val);
	}
}

function updateInterpolations() {
	// LINE WIDTH のイージング遷移（1フレームあたり 6% ずつ接近）
	const lwDiff = interpolations.lineWidth.target - interpolations.lineWidth.current;
	if (Math.abs(lwDiff) > 0.05) {
		interpolations.lineWidth.current += lwDiff * 0.06;
		applyActualLineWidth(interpolations.lineWidth.current);
	} else if (interpolations.lineWidth.current !== interpolations.lineWidth.target) {
		interpolations.lineWidth.current = interpolations.lineWidth.target;
		applyActualLineWidth(interpolations.lineWidth.current);
	}

	// GRAIN のイージング遷移（1フレームあたり 6% ずつ接近）
	const gDiff = interpolations.grain.target - interpolations.grain.current;
	if (Math.abs(gDiff) > 0.002) {
		interpolations.grain.current += gDiff * 0.06;
		applyActualGrain(interpolations.grain.current);
	} else if (interpolations.grain.current !== interpolations.grain.target) {
		interpolations.grain.current = interpolations.grain.target;
		applyActualGrain(interpolations.grain.current);
	}
}

// SVGフィルタのノイズ比率（ブレンド）を動的適用するヘルパー（互換性維持用）
function applyGrainStrength(val) {
	applyActualGrain(val);
}

// 4段階設定の物理パラメータ適用処理（CONFIG.MAPS を参照）
function applySpeedSetting(index) {
	const val = CONFIG.MAPS.SPEED[index] !== undefined ? CONFIG.MAPS.SPEED[index] : 0.16;
	CONFIG.AMOEBA.MAX_SPEED = val;
	CONFIG.AMOEBA.PULSE_SPEED_MAX = 0.008 + val * 0.006;
	CONFIG.AMOEBA.PULSE_SPEED_MIN = 0.003 + val * 0.003;
}

function applyLineWidthSetting(index) {
	const val = CONFIG.MAPS.LINE_WIDTH[index] !== undefined ? CONFIG.MAPS.LINE_WIDTH[index] : 22.0;
	interpolations.lineWidth.target = val;
}

function applyAttractionSetting(index) {
	const val = CONFIG.MAPS.ATTRACTION[index] !== undefined ? CONFIG.MAPS.ATTRACTION[index] : 0.35;
	CONFIG.POINTER.PULL_FORCE = val;
}

function applyGrainSetting(index) {
	const val = CONFIG.MAPS.GRAIN[index] !== undefined ? CONFIG.MAPS.GRAIN[index] : 0.38;
	CONFIG.VISUAL.GRAIN_STRENGTH = val;
	interpolations.grain.target = val;
}

// ローテーション・ゲージボタン用の制御ロジック
const GAUGE_GLYPHS = ['□□□', '■□□', '■■□', '■■■'];

function updateGaugeButton(btnId, level) {
	const btn = document.getElementById(btnId);
	if (!btn) return;
	btn.setAttribute('data-value', level);
	btn.innerText = GAUGE_GLYPHS[level] || '□□□';
}

function getGaugeLevel(btnId) {
	const btn = document.getElementById(btnId);
	if (!btn) return 2; // デフォルト MEDIUM (2)
	const val = parseInt(btn.getAttribute('data-value'), 10);
	return isNaN(val) ? 2 : val;
}

function bindGaugeEvents(btnId, callback) {
	const btn = document.getElementById(btnId);
	if (!btn) return;
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		const current = getGaugeLevel(btnId);
		const next = (current + 1) % 4; // 0 -> 1 -> 2 -> 3 -> 0...
		updateGaugeButton(btnId, next);
		callback(next);
		saveSettings();
	});
}

function saveSettings() {
	const speedIdx = getGaugeLevel('btn-speed');
	const lineWidthIdx = getGaugeLevel('btn-line-width');
	const attractionIdx = getGaugeLevel('btn-attraction');
	const grainIdx = getGaugeLevel('btn-grain');

	const settings = {
		ambientVol: CONFIG.AUDIO.DRONE.VOLUME,
		flowVol: CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME,
		bubblesVol: CONFIG.AUDIO.BUBBLE.MAX_VOLUME,
		speedIdx,
		lineWidthIdx,
		attractionIdx,
		grainIdx
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			syncSlidersToConfig();
			return;
		}

		const settings = JSON.parse(raw);

		if (settings.ambientVol !== undefined) CONFIG.AUDIO.DRONE.VOLUME = settings.ambientVol;
		if (settings.flowVol !== undefined) CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME = settings.flowVol;
		if (settings.bubblesVol !== undefined) CONFIG.AUDIO.BUBBLE.MAX_VOLUME = settings.bubblesVol;

		// 4段階インデックスの適用（旧データのマイグレーション対応含む）
		const getFinalIdx = (val, map, defIdx) => {
			if (val === undefined) return defIdx;
			if (typeof val === 'number' && val >= 0 && val <= 3) return val;
			let minDiff = Infinity;
			let bestIdx = defIdx;
			map.forEach((item, idx) => {
				const diff = Math.abs(item - val);
				if (diff < minDiff) {
					minDiff = diff;
					bestIdx = idx;
				}
			});
			return bestIdx;
		};

		const sIdx = getFinalIdx(settings.speedIdx !== undefined ? settings.speedIdx : settings.fluidSpeed, CONFIG.MAPS.SPEED, 2);
		const lIdx = getFinalIdx(settings.lineWidthIdx !== undefined ? settings.lineWidthIdx : settings.lineWidth, CONFIG.MAPS.LINE_WIDTH, 2);
		const aIdx = getFinalIdx(settings.attractionIdx !== undefined ? settings.attractionIdx : settings.attraction, CONFIG.MAPS.ATTRACTION, 2);
		const gIdx = getFinalIdx(settings.grainIdx !== undefined ? settings.grainIdx : settings.grain, CONFIG.MAPS.GRAIN, 2);

		applySpeedSetting(sIdx);
		applyLineWidthSetting(lIdx);
		applyAttractionSetting(aIdx);
		applyGrainSetting(gIdx);

		// WIGGLE_SCALEは1.0に固定
		CONFIG.AMOEBA.WIGGLE_SCALE = 1.0;

		// blurは0.0に固定
		const outlineBlur = document.getElementById('outline-blur');
		if (outlineBlur) outlineBlur.setAttribute('stdDeviation', 0.0);

		syncSlidersToConfig({
			ambientVol: settings.ambientVol,
			flowVol: settings.flowVol,
			bubblesVol: settings.bubblesVol,
			speedIdx: sIdx,
			lineWidthIdx: lIdx,
			attractionIdx: aIdx,
			grainIdx: gIdx
		});
	} catch (e) {
		console.error('Failed to load settings from storage', e);
	}
}

function syncSlidersToConfig(settings = {}) {
	const ambient = settings.ambientVol !== undefined ? settings.ambientVol : CONFIG.AUDIO.DRONE.VOLUME;
	const flow = settings.flowVol !== undefined ? settings.flowVol : CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME;
	const bubbles = settings.bubblesVol !== undefined ? settings.bubblesVol : CONFIG.AUDIO.BUBBLE.MAX_VOLUME;

	const ambEl = document.getElementById('param-ambient-vol');
	const flowEl = document.getElementById('param-flow-vol');
	const bubEl = document.getElementById('param-bubbles-vol');

	if (ambEl) ambEl.value = ambient;
	if (flowEl) flowEl.value = flow;
	if (bubEl) bubEl.value = bubbles;

	// ゲージボタンのアクティブ状態の同期
	const getFinalIdx = (val, map, defIdx) => {
		if (val === undefined) return defIdx;
		if (typeof val === 'number' && val >= 0 && val <= 3) return val;
		let minDiff = Infinity;
		let bestIdx = defIdx;
		map.forEach((item, idx) => {
			const diff = Math.abs(item - val);
			if (diff < minDiff) {
				minDiff = diff;
				bestIdx = idx;
			}
		});
		return bestIdx;
	};

	const sIdx = getFinalIdx(settings.speedIdx !== undefined ? settings.speedIdx : settings.fluidSpeed, CONFIG.MAPS.SPEED, 2);
	const lIdx = getFinalIdx(settings.lineWidthIdx !== undefined ? settings.lineWidthIdx : settings.lineWidth, CONFIG.MAPS.LINE_WIDTH, 2);
	const aIdx = getFinalIdx(settings.attractionIdx !== undefined ? settings.attractionIdx : settings.attraction, CONFIG.MAPS.ATTRACTION, 2);
	const gIdx = getFinalIdx(settings.grainIdx !== undefined ? settings.grainIdx : settings.grain, CONFIG.MAPS.GRAIN, 2);

	updateGaugeButton('btn-speed', sIdx);
	updateGaugeButton('btn-line-width', lIdx);
	updateGaugeButton('btn-attraction', aIdx);
	updateGaugeButton('btn-grain', gIdx);
}

function closeSettingsPanel() {
	const panel = document.getElementById('settings-panel');
	const trigger = document.getElementById('menu-trigger');
	if (panel) panel.classList.remove('open');
	if (trigger) {
		const normalSpan = trigger.querySelector('.normal');
		const activeSpan = trigger.querySelector('.active-glyph');
		if (normalSpan && activeSpan) {
			normalSpan.style.display = 'inline';
			activeSpan.style.display = 'none';
		}
	}
}

function setupSettingsUI() {
	const trigger = document.getElementById('menu-trigger');
	const panel = document.getElementById('settings-panel');

	// メニュー開閉
	if (trigger) {
		trigger.addEventListener('click', (e) => {
			e.stopPropagation();
			const isOpen = panel.classList.toggle('open');
			
			// パネルの開閉状態に応じてトリガー表示を同期
			const normalSpan = trigger.querySelector('.normal');
			const activeSpan = trigger.querySelector('.active-glyph');
			if (normalSpan && activeSpan) {
				if (isOpen) {
					normalSpan.style.display = 'none';
					activeSpan.style.display = 'inline';
				} else {
					normalSpan.style.display = 'inline';
					activeSpan.style.display = 'none';
				}
			}
		});
	}

	// 設定パネル内部タッチがキャンバスに伝播して物理シミュレーションを邪魔するのを防ぎます
	// ただし、インタラクティブ要素（スライダー・ボタン等）以外をタップした時はパネルを閉じます
	panel.addEventListener('pointerdown', (e) => {
		const isInteractive = e.target.closest('input[type="range"]') || 
		                      e.target.closest('.gauge-btn') || 
		                      e.target.closest('#btn-reset');
		if (!isInteractive) {
			closeSettingsPanel();
		} else {
			e.stopPropagation();
		}
	});

	panel.addEventListener('pointermove', (e) => {
		e.stopPropagation();
	});
	panel.addEventListener('pointerup', (e) => {
		e.stopPropagation();
	});

	// パネル外タッチで閉じる
	document.addEventListener('pointerdown', (e) => {
		if (panel && !panel.contains(e.target) && !trigger.contains(e.target)) {
			closeSettingsPanel();
		}
	});

	// 各スライダー変更時のイベント
	document.getElementById('param-ambient-vol').addEventListener('input', (e) => {
		CONFIG.AUDIO.DRONE.VOLUME = parseFloat(e.target.value);
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

	// ゲージボタンのイベント紐付け
	bindGaugeEvents('btn-speed', applySpeedSetting);
	bindGaugeEvents('btn-line-width', applyLineWidthSetting);
	bindGaugeEvents('btn-attraction', applyAttractionSetting);
	bindGaugeEvents('btn-grain', applyGrainSetting);

	// デフォルトへのリセットイベント
	document.getElementById('btn-reset').addEventListener('click', (e) => {
		e.stopPropagation();

		const defaults = {
			ambientVol: 0.10,
			flowVol: 0.030,
			bubblesVol: 0.055,
			speedIdx: 2,      // MEDIUM
			lineWidthIdx: 2,  // MEDIUM (22.0)
			attractionIdx: 2, // MEDIUM (0.35)
			grainIdx: 2       // MEDIUM (0.38)
		};

		// CONFIG パラメータの復元
		CONFIG.AUDIO.DRONE.VOLUME = defaults.ambientVol;
		CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME = defaults.flowVol;
		CONFIG.AUDIO.BUBBLE.MAX_VOLUME = defaults.bubblesVol;

		applySpeedSetting(defaults.speedIdx);
		applyLineWidthSetting(defaults.lineWidthIdx);
		applyAttractionSetting(defaults.attractionIdx);
		applyGrainSetting(defaults.grainIdx);

		// ボタン表示の更新
		updateGaugeButton('btn-speed', defaults.speedIdx);
		updateGaugeButton('btn-line-width', defaults.lineWidthIdx);
		updateGaugeButton('btn-attraction', defaults.attractionIdx);
		updateGaugeButton('btn-grain', defaults.grainIdx);

		// 音量ゲインへ即時反映
		updateAudioDroneDucking(pointer.active, true);

		// スライダーと設定値の同期
		syncSlidersToConfig(defaults);

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

// 初期起動・初期ロード直後は補間の遅延なく即座に反映する
if (typeof interpolations !== 'undefined') {
	interpolations.lineWidth.current = interpolations.lineWidth.target;
	interpolations.grain.current = interpolations.grain.target;
	applyActualLineWidth(interpolations.lineWidth.current);
	applyActualGrain(interpolations.grain.current);
}

requestAnimationFrame(loop);

// 数秒後に画面ヒントをフェードアウト
setTimeout(() => {
	const hint = document.getElementById('hint');
	if (hint) hint.style.opacity = '0';
}, 5000);
