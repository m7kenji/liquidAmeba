import { CONFIG } from './config.js';

/**
 * 指のタッチ状態を表現するポインターオブジェクト
 */
export const pointer = {
	x: -1000,
	y: -1000,
	active: false,

	vx: 0,
	vy: 0,
	lastX: 0,
	lastY: 0,

	radius: CONFIG.POINTER.RADIUS,
	visualRadius: 0,
	visualTargetRadius: CONFIG.POINTER.RADIUS,

	update() {
		// 最新の config 値を動的に同期しつつ、ぼかし量(LINE WIDTH)に応じて半径をマイルドにスケールします
		const blurEl = document.getElementById('base-blur');
		const stdDev = blurEl ? parseFloat(blurEl.getAttribute('stdDeviation')) : 8.0;
		// 基準8.0pxから最大75.0pxのぼかし量に対して、サイズ倍率を1.0倍〜約1.6倍に線形マッピング
		const sizeFactor = 1.0 + Math.max(0, stdDev - 8.0) * 0.009;

		this.radius = CONFIG.POINTER.RADIUS * sizeFactor;
		this.visualTargetRadius = CONFIG.POINTER.RADIUS * sizeFactor;

		if (this.active) {
			this.vx = this.x - this.lastX;
			this.vy = this.y - this.lastY;
			this.lastX = this.x;
			this.lastY = this.y;

			// 心地よく「すーっ」と円が膨らむ
			this.visualRadius += (this.visualTargetRadius - this.visualRadius) * CONFIG.POINTER.EXPAND_EASING;
		} else {
			this.vx = 0;
			this.vy = 0;
			// 心地よく「すーっ」と消えていく
			this.visualRadius += (0 - this.visualRadius) * CONFIG.POINTER.SHRINK_EASING;
		}
	}
};

/**
 * 指を離した瞬間にその場に残る、見えない穏やかな熱源（力場）
 */
export class ForceField {
	constructor(x, y, vx, vy) {
		this.x = x;
		this.y = y;

		// 運動量の継承はマイルドに減衰させます
		this.vx = vx * CONFIG.FORCE_FIELD.VELOCITY_INHERITANCE;
		this.vy = vy * CONFIG.FORCE_FIELD.VELOCITY_INHERITANCE;

		this.life = 1.0;
		this.decay = CONFIG.FORCE_FIELD.DECAY;

		this.radius = CONFIG.FORCE_FIELD.INITIAL_RADIUS;
		this.maxRadius = CONFIG.FORCE_FIELD.MAX_RADIUS;

		this.pullStrength = CONFIG.FORCE_FIELD.PULL_STRENGTH;
		this.flowStrength = CONFIG.FORCE_FIELD.FLOW_STRENGTH;

		// 描画用のフェードアウト寿命
		this.visualLife = 1.0;
		this.visualDecay = CONFIG.FORCE_FIELD.VISUAL_DECAY;

		this.visualRadius = CONFIG.FORCE_FIELD.INITIAL_VISUAL_RADIUS;
		this.visualMaxRadius = CONFIG.FORCE_FIELD.MAX_VISUAL_RADIUS;
	}

	update() {
		this.life -= this.decay;
		this.visualLife -= this.visualDecay;

		// 半径を緩やかに拡張
		this.radius += (this.maxRadius - this.radius) * CONFIG.FORCE_FIELD.RADIUS_GROWTH;
		this.visualRadius += (this.visualMaxRadius - this.visualRadius) * CONFIG.FORCE_FIELD.VISUAL_RADIUS_GROWTH;
	}

	applyTo(blob) {
		if (this.life <= 0) return;

		const dx = this.x - blob.x;
		const dy = this.y - blob.y;
		const dist = Math.hypot(dx, dy);

		if (dist <= 0 || dist > this.radius) return;

		// 安全対策の Math.max クランプ
		const pct = Math.max(0, 1 - dist / this.radius);
		const ease = pct * pct * (3 - 2 * pct);
		const power = ease * this.life;

		// 中心へ引き寄せる力と、指の流れの伝播
		blob.vx += (dx / dist) * this.pullStrength * power;
		blob.vy += (dy / dist) * this.pullStrength * power;

		blob.vx += this.vx * this.flowStrength * power;
		blob.vy += this.vy * this.flowStrength * power;
	}

	get alive() {
		return this.life > 0 || this.visualLife > 0;
	}
}

/**
 * ぬるぬると動き、融合するアメーバの物理計算クラス
 */
export class Amoeba {
	constructor(x, y, r, index, allBlobsRef) {
		this.x = x;
		this.y = y;
		this.baseR = r;
		this.r = r;
		this.index = index;

		// 他の全アメーバへの参照（近接判定用）
		this.allBlobs = allBlobsRef;

		const initialAngle = Math.random() * Math.PI * 2;
		const initialSpeed = 0.05 + Math.random() * 0.05;

		this.vx = Math.cos(initialAngle) * initialSpeed;
		this.vy = Math.sin(initialAngle) * initialSpeed;

		this.wanderAngle = initialAngle;
		this.time = Math.random() * 100;
		this.pulseSpeed = CONFIG.AMOEBA.PULSE_SPEED_MIN + Math.random() * (CONFIG.AMOEBA.PULSE_SPEED_MAX - CONFIG.AMOEBA.PULSE_SPEED_MIN);

		this.numPoints = Math.max(12, Math.floor(r * 0.6));

		// アメーバ同士の接触状態（融合判定・将来の音響トリガー用）
		this.nearBlobStates = new Map();

		// 接触状態が変わった（融合・分裂した）瞬間に呼ばれるコールバック
		this.onStateChange = null; // function(otherBlob, isJoined, xRatio)

		// 簡易ラバランプ（対流）物理用
		this.temperature = Math.random(); // 0.0〜1.0 の初期温度
		this.targetTemperature = Math.random() > 0.5 ? 1.0 : 0.0; // 加熱中(1.0)か冷却中(0.0)かの目標温度
	}

	update(forceFields) {
		// ウネウネする変形スピードのみを WIGGLE_SCALE に完全に連動させます
		this.time += this.pulseSpeed * CONFIG.AMOEBA.WIGGLE_SCALE;

		// 座標移動速度スケール（基準値 0.16 に対する比率）
		const speedScale = CONFIG.AMOEBA.MAX_SPEED / 0.16;

		// ゆるやかなランダム漂流（MOTION SPEED に同期して推進力もダイナミックに変調）
		this.wanderAngle += (Math.random() - 0.5) * CONFIG.AMOEBA.WANDER_ANGLE_CHANGE;
		const driftForce = CONFIG.AMOEBA.WANDER_DRIFT * speedScale;
		this.vx += Math.cos(this.wanderAngle) * driftForce;
		this.vy += Math.sin(this.wanderAngle) * driftForce;

		// --- アプローチ①：S字ローリング（蛇行上昇/下降） ---
		// アメーバ自身の脈動時間（this.time）に同期したサイン波により、ゆったりと左右に蛇行させます
		const rollingForce = Math.sin(this.time * 0.6) * 0.025 * speedScale;
		this.vx += rollingForce;

		// --- アプローチ②：深海潮汐（グローバルな深海水流） ---
		// Date.now()を用いた超低周波（約35秒周期）のグローバルな潮の満ち引きで、全体をゆっくり押し流します
		const currentForce = Math.sin(Date.now() * 0.00018) * 0.012 * speedScale;
		this.vx += currentForce;

		// --- 簡易ラバランプ（熱対流）物理 ---
		// ヒステリシス（履歴制御）: 画面中段でのスタックを防ぎ、上端と下端の完全な循環往復を保証します
		// 画面の最下部（下から20%以内）に達した時に「加熱モード（目標 1.0）」へ移行
		if (this.y > window.VIEW_HEIGHT * 0.8) {
			this.targetTemperature = 1.0;
		}
		// 画面の最上部（上から20%以内）に達した時に「冷却モード（目標 0.0）」へ移行
		else if (this.y < window.VIEW_HEIGHT * 0.2) {
			this.targetTemperature = 0.0;
		}
		// 中間領域を移動している間は、上昇・下降の状態をそのまま維持し続けます

		// じわじわと現在の温度が目標温度へ追従変化
		this.temperature += (this.targetTemperature - this.temperature) * 0.005;

		// 温度に応じた上下の浮力・重力を発生（速度スケールに連動、中央で最も交差しやすくなる強さに調整）
		const convectionForce = (this.temperature - 0.5) * -0.012 * speedScale;
		this.vy += convectionForce;

		let targetR = this.baseR;
		let maxExpansion = 0;

		// --- アメーバ同士の融合・膨張物理 ＆ 状態変化の検知 ---
		this.allBlobs.forEach(other => {
			if (other === this) return;

			const dx = other.x - this.x;
			const dy = other.y - this.y;
			const dist = Math.hypot(dx, dy);
			const combineRange = (this.baseR + other.baseR) * CONFIG.AMOEBA.FUSION_RANGE_MULTIPLIER;

			if (dist < combineRange) {
				// 【NaNバグ対策】 Math.max(0, ...) で確実に負数入力を排除します
				const overlap = Math.max(0, 1 - (dist / combineRange));
				const expansion = Math.pow(overlap, 1.4) * CONFIG.AMOEBA.FUSION_EXPANSION_RATE * this.baseR;

				if (expansion > maxExpansion) {
					maxExpansion = expansion;
				}
			}

			// 音響トリガー用の近接状態変化検出 (しきい値はマイルドに1.35倍)
			const contactRange = (this.baseR + other.baseR) * 1.35;
			const wasNear = this.nearBlobStates.get(other) || false;
			const isNear = dist < contactRange;

			if (isNear !== wasNear) {
				this.nearBlobStates.set(other, isNear);
				// 重複呼び出し防止のため、配列のインデックスで片方のみからコールバックを実行
				if (this.index < other.index && this.onStateChange) {
					this.onStateChange(other, isNear, this.x);
				}
			}
		});

		targetR += maxExpansion;
		this.r += (targetR - this.r) * 0.06;

		// --- タッチポインターによる吸引物理 ---
		let currentFriction = CONFIG.AMOEBA.DEFAULT_FRICTION;
		let isBeingPulled = false;

		if (pointer.active) {
			const dx = pointer.x - this.x;
			const dy = pointer.y - this.y;
			const dist = Math.hypot(dx, dy);
			const pullRange = pointer.radius * CONFIG.POINTER.PULL_RANGE_MULTIPLIER;

			if (dist < pullRange) {
				isBeingPulled = true;

				// 【NaNバグ対策】 Math.max(0, ...) で確実に負数入力を排除します
				const pct = Math.max(0, 1 - dist / pullRange);

				if (dist > 1) {
					// 3.5乗の急激な減衰：指の直近でのみ強い引力が発生し、遠くのアメーバを刺激しない
					const pullForce = Math.pow(pct, 3.5) * CONFIG.POINTER.PULL_FORCE;
					this.vx += (dx / dist) * pullForce;
					this.vy += (dy / dist) * pullForce;
				}

				// 指に本当に近い（捕まった）アメーバだけ、指の速度を強く継承
				if (pct > 0.5) {
					const followPct = (pct - 0.5) * 2; // 0〜1に補間
					this.vx += pointer.vx * 0.35 * followPct;
					this.vy += pointer.vy * 0.35 * followPct;
				}

				// 指に近いほど摩擦力を強めてアメーバを指に吸い着かせます
				currentFriction = CONFIG.AMOEBA.DEFAULT_FRICTION - (pct * CONFIG.POINTER.MAX_FRICTION_DECREASE);
			}
		}

		// 残響力場（ForceField）の物理適用
		forceFields.forEach(field => {
			field.applyTo(this);
		});

		// 摩擦適用
		this.vx *= currentFriction;
		this.vy *= currentFriction;

		const currentSpeed = Math.hypot(this.vx, this.vy);

		// 指に引っ張られていない時のためのゆったりとした速度制限
		if (!isBeingPulled) {
			if (currentSpeed < CONFIG.AMOEBA.MIN_SPEED && currentSpeed > 0) {
				this.vx = (this.vx / currentSpeed) * CONFIG.AMOEBA.MIN_SPEED;
				this.vy = (this.vy / currentSpeed) * CONFIG.AMOEBA.MIN_SPEED;
			} else if (currentSpeed > CONFIG.AMOEBA.MAX_SPEED) {
				this.vx *= 0.90;
				this.vy *= 0.90;
			}
		}

		// 座標の更新
		this.x += this.vx;
		this.y += this.vy;

		// --- 画面外へのはみ出し・境界回避 (マイルドな反発) ---
		const margin = this.r * 0.5;
		const buffer = CONFIG.AMOEBA.WALL_EDGE_BUFFER;
		const force = CONFIG.AMOEBA.WALL_AVOID_FORCE * speedScale;

		if (this.x < margin + buffer) this.vx += force;
		if (this.x > window.VIEW_WIDTH - margin - buffer) this.vx -= force;
		if (this.y < margin + buffer) this.vy += force;
		if (this.y > window.VIEW_HEIGHT - margin - buffer) this.vy -= force;

		// 確実な境界クランプと跳ね返り
		if (this.x < margin) {
			this.x = margin;
			this.vx *= -0.2;
		}
		if (this.x > window.VIEW_WIDTH - margin) {
			this.x = window.VIEW_WIDTH - margin;
			this.vx *= -0.2;
		}
		if (this.y < margin) {
			this.y = margin;
			this.vy *= -0.2;
		}
		if (this.y > window.VIEW_HEIGHT - margin) {
			this.y = window.VIEW_HEIGHT - margin;
			this.vy *= -0.2;
		}
	}
}
