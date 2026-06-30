import { CONFIG } from './config.js';
import { amebaConsole } from './console.js';

/**
 * 画面をゆっくり漂う単語オブジェクト
 */
class DriftingWord {
	constructor(text, startX, startY, direction, level) {
		this.text = text;
		this.x = startX;
		this.y = startY;
		this.baseY = startY;
		this.direction = direction; // 1: 左から右, -1: 右から左
		this.level = level;

		// 設定パラメータの読み込み
		const settings = CONFIG.WORD_DRIFT.SETTINGS[level] || CONFIG.WORD_DRIFT.SETTINGS[1];
		this.fontSize = settings.FONT_SIZE;
		this.speedScale = settings.SPEED_SCALE;
		this.influence = settings.INFLUENCE;
		this.maxAlpha = settings.ALPHA;

		// 進行スピードをアメーバの最大スピードに連動
		this.baseSpeed = CONFIG.AMOEBA.MAX_SPEED * this.speedScale;

		// 物理パラメータ
		this.vx = this.direction * this.baseSpeed;
		this.vy = 0;
		this.wiggleTime = Math.random() * 100;
		this.wiggleSpeed = 0.02 + Math.random() * 0.02;
		this.wiggleAmplitude = 3 + Math.random() * 4; // 上下ゆらゆらの振幅

		this.alpha = 0;
		this.angle = 0;
		this.angleTarget = 0;
		this.alive = true;

		// 画面のフェードイン・フェードアウト境界設定
		this.fadeAreaWidth = 60; // 画面端からこのピクセル数以内でフェード
	}

	/**
	 * 状態と位置の更新
	 * @param {number} viewWidth 
	 * @param {number} viewHeight 
	 * @param {Array} blobs 
	 */
	update(viewWidth, viewHeight, blobs) {
		// アメーバの最大スピード設定にリアルタイムに進行スピードを同期
		this.baseSpeed = CONFIG.AMOEBA.MAX_SPEED * this.speedScale;

		// アメーバ（液体）との物理的干渉
		let nearestBlobDist = Infinity;
		let totalFx = 0;
		let totalFy = 0;
		let speedRatio = 1.0;

		blobs.forEach(blob => {
			const dx = blob.x - this.x;
			const dy = blob.y - this.y;
			const dist = Math.hypot(dx, dy);

			// アメーバの半径の1.6倍の範囲に入ったら干渉開始
			const activeRange = blob.r * 1.6;
			if (dist < activeRange) {
				const factor = 1.0 - (dist / activeRange); // 近いほど 1.0 に近づく
				
				// 1. 速度の減衰（液体の密な部分を通ると鈍る）
				speedRatio = Math.max(0.4, speedRatio - factor * 0.45);

				// 2. 軌道の揺れ（アメーバの速度ベクトルを穏やかに継承）
				totalFx += blob.vx * this.influence * factor;
				totalFy += blob.vy * this.influence * factor;

				// 3. アメーバの中心方向へのゆるい吸引（吸い寄せられ効果）
				const pull = 0.03 * this.influence * factor;
				totalFx += (dx / dist) * pull;
				totalFy += (dy / dist) * pull;

				if (dist < nearestBlobDist) {
					nearestBlobDist = dist;
				}
			}
		});

		// 速度の適用と摩擦
		// 横移動は基本アメーバ連動スピードを維持しつつ、干渉による変調を加える
		const targetVx = this.direction * this.baseSpeed * speedRatio + totalFx;
		this.vx += (targetVx - this.vx) * 0.1;

		// 縦移動はアメーバの力を受けつつ、元に戻る復元力（摩擦）を加える
		this.vy += totalFy;
		this.vy *= 0.92; // 強い摩擦で縦移動を収束させる

		// 座標更新
		this.x += this.vx;
		this.y += this.vy;

		// 縦方向のビューポートクランプ（15%〜85%に収める）
		const minY = viewHeight * 0.15;
		const maxY = viewHeight * 0.85;
		if (this.y < minY) {
			this.y = minY;
			this.vy = 0;
		} else if (this.y > maxY) {
			this.y = maxY;
			this.vy = 0;
		}

		// 上下のゆるいゆらゆら揺れを基本ベースとして加える
		this.wiggleTime += this.wiggleSpeed;
		const currentWiggle = Math.sin(this.wiggleTime) * this.wiggleAmplitude;
		
		// 描画位置用に物理座標に wiggle を重ねる
		this.drawY = this.y + currentWiggle;

		// --- 生々しい回転(角度)の計算 ---
		// 1. 水面を漂う木の葉のような、自律的なゆったり揺れ
		const wiggleAngle = Math.sin(this.wiggleTime * 0.4) * 0.26; // 最大約15度 (0.26 rad)
		// 2. アメーバから受ける物理的な力による傾き（しなりをさらに大きく）
		const forceAngle = this.vy * 1.8;
		this.angleTarget = wiggleAngle + forceAngle;
		this.angle += (this.angleTarget - this.angle) * 0.08; // 滑らかに追従

		// フェードイン・フェードアウトのアルファ計算
		// 左右の端からの距離に応じてアルファ値をリニアに変化させる
		let currentAlpha = this.maxAlpha;
		
		if (this.direction === 1) { // 左から右へ
			if (this.x < this.fadeAreaWidth) {
				// 出現時フェードイン
				currentAlpha = (this.x / this.fadeAreaWidth) * this.maxAlpha;
			} else if (this.x > viewWidth - this.fadeAreaWidth) {
				// 退場時フェードアウト
				const distFromEnd = viewWidth - this.x;
				currentAlpha = Math.max(0, (distFromEnd / this.fadeAreaWidth)) * this.maxAlpha;
			}
		} else { // 右から左へ
			const distFromRight = viewWidth - this.x;
			if (distFromRight < this.fadeAreaWidth) {
				// 出現時フェードイン
				currentAlpha = (distFromRight / this.fadeAreaWidth) * this.maxAlpha;
			} else if (this.x < this.fadeAreaWidth) {
				// 退場時フェードアウト
				currentAlpha = Math.max(0, (this.x / this.fadeAreaWidth)) * this.maxAlpha;
			}
		}

		this.alpha += (currentAlpha - this.alpha) * 0.1; // アルファ値のイージングで滑らかに

		// 画面外に完全に出た場合、死亡マーク
		if (this.direction === 1 && this.x > viewWidth + 40) {
			this.alive = false;
		} else if (this.direction === -1 && this.x < -40) {
			this.alive = false;
		}
	}

	/**
	 * Canvas への文字の描画
	 * @param {CanvasRenderingContext2D} ctx 
	 */
	draw(ctx) {
		if (this.alpha <= 0.01) return;

		ctx.save();
		
		// 1-bitフィルター下での掠れ表現のため、透明度を設定
		ctx.globalAlpha = this.alpha;
		
		// 座標原点を文字の中心に持っていき、回転を適用
		const drawX = this.x;
		const drawY = this.drawY || this.y;
		ctx.translate(drawX, drawY);
		ctx.rotate(this.angle);

		// Tiny5が日本語非対応のため、システム標準 of ゴシック体を太字で使用
		// フィルター適用下でとろみがつき、角が丸くなります
		ctx.font = `bold ${this.fontSize}px sans-serif`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';

		// 現在のアメーバのぼかし量 (stdDeviation) を取得
		const blurEl = document.getElementById('base-blur');
		const stdDev = blurEl ? parseFloat(blurEl.getAttribute('stdDeviation')) : 8.0;

		// ぼかしによる文字の消失（みじんこ化）を防ぎ、かつ袋文字の隙間を白で埋め潰して「ソリッドな塗り表現」にするフチ取り
		// ぼかし量が大きいほど、文字の内側を塗りつぶし状態に維持するために線幅を太く拡張する
		if (stdDev > 2.0) {
			ctx.strokeStyle = '#ffffff';
			// ぼかし量に応じて、中空を埋め尽くすのに十分な太さ（フォントサイズの 55%〜65%）にスケール
			const strokeWidth = (stdDev - 2.0) * 0.65 + 3.0;
			ctx.lineWidth = Math.min(this.fontSize * 0.65, strokeWidth);
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			ctx.strokeText(this.text, 0, 0);
		}
		
		// 文字色は白。二値化でアメーバとシームレスに結合します。
		ctx.fillStyle = '#ffffff';
		ctx.fillText(this.text, 0, 0);
		ctx.restore();
	}
}

/**
 * Word Drift の出現周期・重複排除・描画更新を管理するマネージャ
 */
export class WordDriftManager {
	constructor() {
		this.level = 1; // 0: OFF, 1: GENTLE, 2: NORMAL
		this.word = null;
		this.recentWords = [];
		this.nextSpawnTime = 0;
		
		// アプリ起動時の初回出現ウェイトを設定 (15〜25秒後)
		this.resetSpawnTimer(true);
	}

	/**
	 * 設定レベルの変更
	 * @param {number} level 
	 */
	setLevel(level) {
		const prevLevel = this.level;
		this.level = level;

		if (level === 0) {
			// OFF になった場合は即座に現在漂っている文字を消去
			if (this.word) {
				this.word = null;
				amebaConsole.log('DRIFT CLR');
			}
		} else if (prevLevel === 0 && level > 0) {
			// OFFからONに戻った場合、次回出現タイマーを再設定
			this.resetSpawnTimer(false);
		} else if (this.word && prevLevel !== level) {
			// 漂っている単語がある状態で設定が切り替わった場合、文字サイズや速度を動的変更
			const settings = CONFIG.WORD_DRIFT.SETTINGS[level] || CONFIG.WORD_DRIFT.SETTINGS[1];
			this.word.fontSize = settings.FONT_SIZE;
			this.word.baseSpeed = settings.SPEED;
			this.word.influence = settings.INFLUENCE;
			this.word.maxAlpha = settings.ALPHA;
			this.word.level = level;
		}
	}

	/**
	 * 次の出現までの時間をランダムに設定する
	 * @param {boolean} isFirstTime 
	 */
	resetSpawnTimer(isFirstTime = false) {
		const now = Date.now();
		
		if (isFirstTime) {
			// 初回起動時: 15秒〜25秒
			const delay = 15000 + Math.random() * 10000;
			this.nextSpawnTime = now + delay;
		} else {
			if (this.level === 0) return;
			
			const settings = CONFIG.WORD_DRIFT.SETTINGS[this.level];
			const min = settings.MIN_INTERVAL;
			const max = settings.MAX_INTERVAL;
			
			// 偶発的な「しばらく何も出ない時間」（15%の確率で間隔を2倍にする）
			const isLongPause = Math.random() < 0.15;
			const multiplier = isLongPause ? 2.0 : 1.0;
			
			const delay = (min + Math.random() * (max - min)) * multiplier;
			this.nextSpawnTime = now + delay;
		}
	}

	/**
	 * 単語プールから重複を避けて単語をランダム選定
	 */
	selectWord() {
		const pool = CONFIG.WORD_DRIFT.WORDS;
		const limit = CONFIG.WORD_DRIFT.RECENT_LIMIT;
		
		// 履歴に含まれていない単語をフィルタリング
		const available = pool.filter(w => !this.recentWords.includes(w));
		
		// 万が一すべての単語が履歴にある場合はプール全体から選択
		const targetPool = available.length > 0 ? available : pool;
		
		const word = targetPool[Math.floor(Math.random() * targetPool.length)];
		
		// 履歴管理
		this.recentWords.push(word);
		if (this.recentWords.length > limit) {
			this.recentWords.shift();
		}
		
		return word;
	}

	/**
	 * 毎フレームの更新ロジック
	 * @param {number} viewWidth 
	 * @param {number} viewHeight 
	 * @param {Array} blobs 
	 */
	update(viewWidth, viewHeight, blobs) {
		if (this.level === 0) return;

		// 1. 漂っている単語があれば更新
		if (this.word) {
			this.word.update(viewWidth, viewHeight, blobs);
			
			if (!this.word.alive) {
				this.word = null;
				// 単語が消滅した瞬間に、次のタイマーを回し始める
				this.resetSpawnTimer(false);
			}
		} 
		// 2. 漂っている単語がなく、出現時間になった場合は生成
		else {
			const now = Date.now();
			if (now >= this.nextSpawnTime) {
				const text = this.selectWord();
				
				// 出現方向の決定
				const direction = Math.random() < 0.5 ? 1 : -1;
				
				// 左右の画面外初期位置
				const startX = direction === 1 ? -30 : viewWidth + 30;
				
				// 上下位置は 15%〜85%
				const minY = viewHeight * 0.15;
				const maxY = viewHeight * 0.85;
				const startY = minY + Math.random() * (maxY - minY);
				
				this.word = new DriftingWord(text, startX, startY, direction, this.level);
				
				// TUIコンソールにイベントをログ記録
				const dirStr = direction === 1 ? 'L->R' : 'R->L';
				amebaConsole.log(`DRIFT: ${text} (${dirStr})`);
			}
		}
	}

	/**
	 * 描画
	 * @param {CanvasRenderingContext2D} ctx 
	 */
	draw(ctx) {
		if (this.level === 0 || !this.word) return;
		this.word.draw(ctx);
	}
}
