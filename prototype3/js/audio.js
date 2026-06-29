import { CONFIG } from './config.js';

let audioCtx = null;
let initializedAudio = false;

// Web Audio API ノード参照用
let droneFilter = null;
let droneGain = null;
let flowSource = null;
let flowFilter = null;
let flowGain = null;

/**
 * 積分フィルタを施したブラウンノイズ（赤色ノイズ）バッファを生成
 */
function createBrownNoiseBuffer() {
	const sampleRate = audioCtx.sampleRate;
	const bufferSize = sampleRate * 4; // 4秒ループ
	const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
	const data = buffer.getChannelData(0);
	let lastOut = 0.0;

	for (let i = 0; i < bufferSize; i++) {
		const white = Math.random() * 2 - 1;
		data[i] = (lastOut + (0.02 * white)) / 1.02;
		lastOut = data[i];
		data[i] *= 4.0; // こもり過ぎによる減衰を補正
	}
	return buffer;
}

/**
 * 特化フィルタを施したピンクノイズ（1/fノイズ）バッファを生成
 */
function createPinkNoiseBuffer() {
	const sampleRate = audioCtx.sampleRate;
	const bufferSize = sampleRate * 4;
	const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
	const data = buffer.getChannelData(0);
	let b0, b1, b2, b3, b4, b5, b6;
	b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;

	for (let i = 0; i < bufferSize; i++) {
		const white = Math.random() * 2 - 1;
		b0 = 0.99886 * b0 + white * 0.0555179;
		b1 = 0.99332 * b1 + white * 0.0750759;
		b2 = 0.96900 * b2 + white * 0.1538520;
		b3 = 0.86650 * b3 + white * 0.3104856;
		b4 = 0.55000 * b4 + white * 0.5329522;
		b5 = -0.7616 * b5 - white * 0.0168980;
		data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
		data[i] *= 0.11;
		b6 = white * 0.115926;
	}
	return buffer;
}

/**
 * 深海ドローンの構築と再生
 */
function setupDeepSeaDrone() {
	const noiseSource = audioCtx.createBufferSource();
	noiseSource.buffer = createBrownNoiseBuffer();
	noiseSource.loop = true;

	// 微弱な低音ドローン（A1=55Hz, E2=82.5Hz）を重ねることで、深い音響空間を作ります
	const osc1 = audioCtx.createOscillator();
	const osc2 = audioCtx.createOscillator();
	osc1.frequency.value = 55.0;
	osc2.frequency.value = 82.5;
	osc1.type = 'sine';
	osc2.type = 'sine';

	const oscGain1 = audioCtx.createGain();
	const oscGain2 = audioCtx.createGain();
	oscGain1.gain.value = 0.04;
	oscGain2.gain.value = 0.02;
	osc1.connect(oscGain1);
	osc2.connect(oscGain2);

	// ローパスフィルタで高域をカット
	droneFilter = audioCtx.createBiquadFilter();
	droneFilter.type = 'lowpass';
	droneFilter.frequency.value = CONFIG.AUDIO.DRONE.LOWPASS_FREQ;

	// フェードイン用のゲインノード
	droneGain = audioCtx.createGain();
	droneGain.gain.setValueAtTime(0.001, audioCtx.currentTime);
	// 数秒かけてマイルドにフェードイン
	droneGain.gain.exponentialRampToValueAtTime(CONFIG.AUDIO.DRONE.VOLUME, audioCtx.currentTime + CONFIG.AUDIO.DRONE.FADE_IN_TIME);

	noiseSource.connect(droneFilter);
	oscGain1.connect(droneFilter);
	oscGain2.connect(droneFilter);
	droneFilter.connect(droneGain);
	droneGain.connect(audioCtx.destination);

	// 約66秒周期のLFOでカットオフ周波数を穏やかに揺らし、満ち引き（潮汐）を表現
	const lfo = audioCtx.createOscillator();
	const lfoGain = audioCtx.createGain();
	lfo.frequency.value = CONFIG.AUDIO.DRONE.LFO_FREQ;
	lfoGain.gain.value = CONFIG.AUDIO.DRONE.LFO_GAIN;

	lfo.connect(lfoGain);
	lfoGain.connect(droneFilter.frequency);

	noiseSource.start(0);
	osc1.start(0);
	osc2.start(0);
	lfo.start(0);
}

/**
 * 指の動きに同期する水流ASMR音の構築
 */
function setupWaterFlowSound() {
	flowSource = audioCtx.createBufferSource();
	flowSource.buffer = createPinkNoiseBuffer();
	flowSource.loop = true;

	// バンドパスフィルタ
	flowFilter = audioCtx.createBiquadFilter();
	flowFilter.type = 'bandpass';
	flowFilter.Q.value = CONFIG.AUDIO.WATER_FLOW.BPF_Q;
	flowFilter.frequency.value = CONFIG.AUDIO.WATER_FLOW.BASE_FREQ;

	flowGain = audioCtx.createGain();
	flowGain.gain.value = 0.001; // 最初は無音

	flowSource.connect(flowFilter);
	flowFilter.connect(flowGain);
	flowGain.connect(audioCtx.destination);

	flowSource.start(0);
}

/**
 * 外部にエクスポートする音声再生モジュールAPI
 */

export function initAudio() {
	if (initializedAudio) return;
	initializedAudio = true;

	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	audioCtx = new AudioContextClass();

	setupDeepSeaDrone();
	setupWaterFlowSound();
}

export function ensureAudioPlay() {
	if (!audioCtx) {
		initAudio();
	}
	if (audioCtx && audioCtx.state === 'suspended') {
		audioCtx.resume();
	}
}

/**
 * ドラッグ速度に応じて、水流の「ザー…」という音のピッチと音量を動的に変化させます
 */
export function updateWaterFlowSound(speed) {
	if (!flowGain || !audioCtx) return;

	const targetFreq = CONFIG.AUDIO.WATER_FLOW.BASE_FREQ + Math.min(speed * CONFIG.AUDIO.WATER_FLOW.FREQ_SPEED_MULTIPLIER, CONFIG.AUDIO.WATER_FLOW.MAX_FREQ_ADD);
	const targetVolume = Math.min(speed * 0.14, CONFIG.AUDIO.WATER_FLOW.MAX_VOLUME);

	// 変化が激しくならないよう、イージング付きで適用
	flowFilter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.12);
	flowGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.20);
}

/**
 * 「コポッ」という水泡音の合成
 */
export function playBubbleSound(xRatio) {
	if (!audioCtx || audioCtx.state === 'suspended') return;

	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();
	const filter = audioCtx.createBiquadFilter();
	const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;

	const baseFreq = CONFIG.AUDIO.BUBBLE.BASE_FREQ_MIN + Math.random() * CONFIG.AUDIO.BUBBLE.BASE_FREQ_RANDOM;
	const endFreq = baseFreq * (1.6 + Math.random() * 0.3);
	const duration = CONFIG.AUDIO.BUBBLE.DURATION_MIN + Math.random() * CONFIG.AUDIO.BUBBLE.DURATION_RANDOM;

	osc.type = 'sine';
	osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);

	// アタックと急峻な指数減衰エンベロープ
	gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
	gain.gain.linearRampToValueAtTime(CONFIG.AUDIO.BUBBLE.MAX_VOLUME, audioCtx.currentTime + 0.006);
	gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

	// 耳障りな高音成分を排除するローパス
	filter.type = 'lowpass';
	filter.frequency.value = CONFIG.AUDIO.BUBBLE.LOWPASS_FREQ;

	osc.connect(gain);
	gain.connect(filter);

	let dest = audioCtx.destination;
	if (panner) {
		// 画面上のX座標に応じたステレオ定位
		const pan = (xRatio * 2 - 1) * CONFIG.AUDIO.BUBBLE.PAN_WIDTH;
		panner.pan.setValueAtTime(pan, audioCtx.currentTime);
		filter.connect(panner);
		panner.connect(dest);
	} else {
		filter.connect(dest);
	}

	osc.start();
	osc.stop(audioCtx.currentTime + duration + 0.05);
}

// 連続再生による耳障り感を防ぐためのスロットリング制限
let lastBubbleTime = 0;
export function triggerAmebaBubble(xRatio) {
	const now = Date.now();
	if (now - lastBubbleTime > CONFIG.AUDIO.BUBBLE.THROTTLING_MS) {
		lastBubbleTime = now;
		playBubbleSound(xRatio);
	}
}

/**
 * タッチ中に深海ドローンの音量を自動的に下げ（ダッキング）、離すとゆっくり復元します
 */
export function updateAudioDroneDucking(isPointerActive) {
	if (!droneGain || !audioCtx) return;

	// タッチ時は音量を通常の40%に抑えて操作ASMRを浮かび上がらせます
	const targetVolume = isPointerActive 
		? CONFIG.AUDIO.DRONE.VOLUME * 0.4 
		: CONFIG.AUDIO.DRONE.VOLUME;

	// 0.3秒のディレイ（時定数）で滑らかに移行させます
	droneGain.gain.setTargetAtTime(targetVolume, audioCtx.currentTime, 0.3);
}
