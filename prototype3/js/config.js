/**
 * prototype3 用の設定パラメータ一元管理モジュール
 */
export const CONFIG = {
	// 解像度と描画設定
	BASE_HEIGHT: 640,
	NUM_BLOBS: 14,
	TARGET_FPS: 30,

	// アメーバの物理パラメータ
	AMOEBA: {
		MIN_RADIUS: 18,
		MAX_RADIUS_ADD: 32,
		WIGGLE_SCALE: 1.0,     // アメーバの形状うねりのスケール（1.0が基準値）
		WANDER_DRIFT: 0.004,
		WANDER_ANGLE_CHANGE: 0.05,
		MIN_SPEED: 0.02,
		MAX_SPEED: 0.16,
		DEFAULT_FRICTION: 0.965,
		FUSION_EXPANSION_RATE: 0.30,
		FUSION_RANGE_MULTIPLIER: 4.0,
		WALL_AVOID_FORCE: 0.008,
		WALL_EDGE_BUFFER: 35,
		PULSE_SPEED_MIN: 0.006,
		PULSE_SPEED_MAX: 0.014
	},

	// ポインター（タッチ）物理
	POINTER: {
		RADIUS: 56,           // 28 -> 56 LINE WIDTH最大時の視認性維持のため大きさを2倍に拡張
		PULL_RANGE_MULTIPLIER: 1.6, // 3.0 -> 1.6 吸引影響範囲を大幅に縮小し、指の直近のみに限定
		PULL_FORCE: 0.35,     // 0.22 -> 0.35 指の直下での初期吸引力を強化
		MAX_FRICTION_DECREASE: 0.32, // 0.24 -> 0.32 指の直下で滑らかに吸い付くブレーキ感
		EXPAND_EASING: 0.10,
		SHRINK_EASING: 0.08
	},

	// 指を離したあとの力場物理
	FORCE_FIELD: {
		VELOCITY_INHERITANCE: 0.3,
		DECAY: 0.010,         // 物理的寿命の減衰速度
		VISUAL_DECAY: 0.015,  // 視覚的寿命の減衰速度
		PULL_STRENGTH: 0.025,
		FLOW_STRENGTH: 0.006,
		INITIAL_RADIUS: 65,
		MAX_RADIUS: 110,
		RADIUS_GROWTH: 0.015,
		INITIAL_VISUAL_RADIUS: 18,
		MAX_VISUAL_RADIUS: 80,
		VISUAL_RADIUS_GROWTH: 0.04
	},

	// ビジュアルエフェクト
	VISUAL: {
		GRAIN_STRENGTH: 0.40 // アナログ砂嵐ノイズの強さ（0.0〜1.0）
	},

	// 音響合成（Web Audio API）パラメータ
	AUDIO: {
		DRONE: {
			VOLUME: 0.20,         // 背景としての適度な音量へ引き上げ
			FADE_IN_TIME: 4.0,
			LFO_FREQ: 0.015,
			LFO_GAIN: 30,          // 変動幅を少し抑えておだやかに
			LOWPASS_FREQ: 90       // 140 -> 90Hz 超低域に特化させ、中域を空けます
		},
		WATER_FLOW: {
			MAX_VOLUME: 0.10,     // 物理音量引き上げのため最大出力をアップ
			BPF_Q: 2.4,            // 1.8 -> 2.4 摩擦音の存在感をクリアに
			BASE_FREQ: 170,        // 120 -> 170Hz
			FREQ_SPEED_MULTIPLIER: 220,
			MAX_FREQ_ADD: 160      // 最大 330Hz 付近
		},
		BUBBLE: {
			BASE_FREQ_MIN: 150,    // 75 -> 150Hz 中音域の抜けを良くします
			BASE_FREQ_RANDOM: 60,
			DURATION_MIN: 0.10,
			DURATION_RANDOM: 0.06,
			MAX_VOLUME: 0.15,      // 泡音の出力を引き上げ
			LOWPASS_FREQ: 520,     // 260 -> 520Hz 泡が弾けるぷつっとした高域アタック成分を微かに残します
			THROTTLING_MS: 250,
			PAN_WIDTH: 0.8
		}
	},

	// Word Drift (漂う単語) 設定
	WORD_DRIFT: {
		RECENT_LIMIT: 10,
		WORDS: [
			'コップ', 'つくえ', 'カーテン', 'りんご', 'ボタン', 'もうふ', 'えんぴつ', 'しずく', 
			'ココア', 'パン', 'ストロー', 'ハンカチ', 'ノート', 'ひきだし', 'あかり', 'きっぷ', 
			'さとう', 'くも', 'まど', 'かみ', 'ふね', 'すな', 'てがみ', 'かぎ', 
			'このは', 'かいがら', 'とけい', 'ほん', 'かげ', 'こいし', 'なみ', 'よぞら'
		],
		SETTINGS: {
			1: { // GENTLE (ひかえめ)
				MIN_INTERVAL: 40000, // 40秒
				MAX_INTERVAL: 90000, // 90秒
				FONT_SIZE: 48,       // 1.5倍に拡大 (32 -> 48)
				SPEED_SCALE: 0.60,   // アメーバ最大速度に対する移動速度倍率
				INFLUENCE: 0.12,    // アメーバから受ける物理影響力 (軌道吸着や減衰)
				ALPHA: 0.70         // 描画時の最大アルファ値
			},
			2: { // NORMAL (ふつう)
				MIN_INTERVAL: 20000, // 20秒
				MAX_INTERVAL: 60000, // 60秒
				FONT_SIZE: 68,       // 1.5倍に拡大 (45 -> 68)
				SPEED_SCALE: 0.90,   // アメーバ最大速度に対する移動速度倍率
				INFLUENCE: 0.30,
				ALPHA: 0.90
			}
		}
	},

	// 4段階設定のマッピング値 (0=完全OFF/極小、1=弱、2=中、3=強)
	MAPS: {
		SPEED: [0.0, 0.15, 0.45, 0.80],
		LINE_WIDTH: [4.0, 10.0, 30.0, 60.0],
		ATTRACTION: [0.0, 0.12, 0.35, 2.00],
		GRAIN: [0.0, 0.20, 0.40, 0.80]
	}
};
