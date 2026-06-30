import { CONFIG } from './config.js';

class AmebaConsole {
	constructor(elementId) {
		this.element = document.getElementById(elementId);
		
		// サブパネル要素への参照
		this.sysPanel = null;
		this.focusPanel = null;
		this.logPanel = null;
		
		this.logs = ['SYSTEM INITIALIZED', 'SCANNING AREA...', 'OBSERVE ACTIVE'];
		this.maxLogs = 3;
		
		this.focusIndex = 0;
		this.lastFocusSwitch = 0;
		this.focusSwitchInterval = 5000; // 5秒ごとにフォーカス変更
		
		this.updateInterval = 100; // 100msごとにDOM更新 (負荷対策)
		this.lastUpdate = 0;
		
		this.bootTime = Date.now();
		this.enabled = true;
	}

	initPanels() {
		if (!this.element) return;
		this.sysPanel = this.element.querySelector('.panel-sys');
		this.focusPanel = this.element.querySelector('.panel-focus');
		this.logPanel = this.element.querySelector('.panel-log');
	}

	setEnabled(enabled) {
		this.enabled = enabled;
		if (this.element) {
			this.element.style.display = enabled ? 'block' : 'none';
		}
	}

	log(message) {
		const timeStr = new Date().toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
		this.logs.push(`[${timeStr}] ${message}`);
		if (this.logs.length > this.maxLogs) {
			this.logs.shift();
		}
		// 有効な時のみ即時描画更新
		if (this.enabled) {
			this.draw();
		}
	}

	update(blobs, pointer) {
		if (!this.enabled) return;

		// パネル要素が未設定の場合は初期化する
		if (!this.sysPanel || !this.focusPanel || !this.logPanel) {
			this.initPanels();
		}

		const now = Date.now();
		
		// フォーカス対象の更新
		if (pointer && pointer.active) {
			// タッチ中: 指に最も近い（＝最も反応している）アメーバを強制的にロックオン
			if (blobs.length > 0) {
				let minDst = Infinity;
				let closestIdx = this.focusIndex;
				
				blobs.forEach((blob, idx) => {
					const dx = pointer.x - blob.x;
					const dy = pointer.y - blob.y;
					const dist = Math.hypot(dx, dy);
					if (dist < minDst) {
						minDst = dist;
						closestIdx = idx;
					}
				});
				
				this.focusIndex = closestIdx;
			}
			// タッチ中は自動切り替えタイマーを常に現在時刻にリセットし、自動切り替えを抑止する
			this.lastFocusSwitch = now;
		} else {
			// 通常時: 一定時間ごとにランダムな個体に自動スキャン切り替え
			if (now - this.lastFocusSwitch > this.focusSwitchInterval) {
				if (blobs.length > 0) {
					this.focusIndex = Math.floor(Math.random() * blobs.length);
				}
				this.lastFocusSwitch = now;
			}
		}

		// 定期的なテキスト描画
		if (now - this.lastUpdate > this.updateInterval) {
			this.lastUpdate = now;
			this.draw(blobs, pointer);
		}
	}

	draw(blobs = [], pointer = {}) {
		if (!this.element) return;
		if (!this.sysPanel || !this.focusPanel || !this.logPanel) {
			this.initPanels();
		}

		// 1. システム全体情報のテキスト
		const activeBlobs = blobs.length;
		
		let avgTemp = 36.5;
		if (blobs.length > 0) {
			const sumTemp = blobs.reduce((sum, b) => sum + (b.temperature !== undefined ? b.temperature : 0.5), 0);
			avgTemp = 35.5 + (sumTemp / blobs.length) * 2.0;
		}
		
		let avgBpm = 60;
		if (blobs.length > 0) {
			const sumSpeed = blobs.reduce((sum, b) => sum + (b.pulseSpeed !== undefined ? b.pulseSpeed : 0.01), 0);
			const avgPulse = sumSpeed / blobs.length;
			const ratio = (avgPulse - 0.006) / (0.014 - 0.006);
			avgBpm = Math.floor(55 + Math.max(0, Math.min(1, ratio)) * 30);
		}

		let flowSpeed = 0;
		if (pointer && pointer.active) {
			flowSpeed = Math.hypot(pointer.vx || 0, pointer.vy || 0);
		} else if (blobs.length > 0) {
			const sumV = blobs.reduce((sum, b) => sum + Math.hypot(b.vx || 0, b.vy || 0), 0);
			flowSpeed = sumV / blobs.length;
		}
		const flowDisplay = (flowSpeed * 5).toFixed(2);
		
		const uptime = Math.floor((Date.now() - this.bootTime) / 1000);

		const sysText = `SYS.MONITOR v0.9
UPTIME : ${uptime} SEC
BLOBS  : ${activeBlobs}
AVG TMP: ${avgTemp.toFixed(1)} *C
SYS BPM: ${avgBpm}
FLOW   : ${flowDisplay} M/S`;

		if (this.sysPanel) this.sysPanel.textContent = sysText;

		// 2. フォーカス対象情報のテキスト（常に4行をキープし、チラつきを完全に防止）
		let focusText = `FOCUS  : NONE
SIZE   : --.- MM
TEMP   : --.- *C
PULSE  : --- BPM`;

		if (blobs.length > 0 && blobs[this.focusIndex]) {
			const fb = blobs[this.focusIndex];
			const size = (fb.r * 1.5).toFixed(1);
			const fTemp = (35.5 + (fb.temperature !== undefined ? fb.temperature : 0.5) * 2.0).toFixed(1);
			const fRatio = ((fb.pulseSpeed !== undefined ? fb.pulseSpeed : 0.01) - 0.006) / (0.014 - 0.006);
			const fBpm = Math.floor(55 + Math.max(0, Math.min(1, fRatio)) * 30);
			
			focusText = `FOCUS  : BLOB #${String(this.focusIndex).padStart(2, '0')}
SIZE   : ${size} MM
TEMP   : ${fTemp} *C
PULSE  : ${fBpm} BPM`;
		}

		if (this.focusPanel) this.focusPanel.textContent = focusText;

		// 3. ログ表示のテキスト（右下配置用）
		const logsText = this.logs.map(log => `> ${log}`).join('\n');
		
		if (this.logPanel) this.logPanel.textContent = logsText;
	}
}

export const amebaConsole = new AmebaConsole('observer-console');
