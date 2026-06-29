import { CONFIG } from './config.js';
import { pointer, ForceField, Amoeba } from './physics.js';
import { drawAmoeba, drawForceField, drawPointer } from './renderer.js';

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
		
		// 音響トリガー用のダミーコールバック (フェーズ2でここに Audio モジュールを繋ぎます)
		blob.onStateChange = (otherBlob, isJoined, xCoord) => {
			// Phase 1 では無音のためログまたは何もしません
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

	// アメーバの物理更新
	blobs.forEach(blob => {
		blob.update(forceFields);
	});
}

// --- 毎フレームの描画ロジック ---
function draw() {
	// Canvas のクリア（アメーバの外側を完全透明にします）
	ctx.clearRect(0, 0, window.VIEW_WIDTH, window.VIEW_HEIGHT);

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

	const hint = document.getElementById('hint');
	if (hint) hint.style.opacity = '0';
});

canvas.addEventListener('pointermove', (e) => {
	if (!pointer.active) return;
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
});

canvas.addEventListener('pointercancel', () => {
	pointer.active = false;
	forceFields.push(new ForceField(pointer.x, pointer.y, pointer.vx, pointer.vy));
	if (forceFields.length > 5) {
		forceFields.shift();
	}
});

// --- 初期化 ---
resizeCanvas();
initBlobs();
requestAnimationFrame(loop);

// 数秒後に画面ヒントをフェードアウト
setTimeout(() => {
	const hint = document.getElementById('hint');
	if (hint) hint.style.opacity = '0';
}, 5000);
