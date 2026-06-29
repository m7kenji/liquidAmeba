import { CONFIG } from './config.js';

/**
 * アメーバやタッチサークルの描画処理を担うモジュール
 */

/**
 * 2次ベジェスプライン曲線を用いた、とろみのあるアメーバを描画
 */
export function drawAmoeba(ctx, amoeba) {
	if (amoeba.numPoints < 3) return;

	const points = [];
	for (let i = 0; i < amoeba.numPoints; i++) {
		const angle = (i / amoeba.numPoints) * Math.PI * 2;

		// 呼吸のように脈動する周期的変化と、ランダムで滑らかなウネリ (振幅はマイルドな初期値に復元)
		const pulse = Math.sin(amoeba.time * 1.0 + angle * 3) * 0.04;
		const wave = Math.cos(amoeba.time * 0.4 - angle * 2) * 0.03;
		const currentVertexR = amoeba.r * (1 + pulse + wave);

		points.push({
			x: amoeba.x + Math.cos(angle) * currentVertexR,
			y: amoeba.y + Math.sin(angle) * currentVertexR
		});
	}

	ctx.beginPath();
	// 最初の点のペアの中点からカーブを開始
	let xc = (points[0].x + points[1].x) / 2;
	let yc = (points[0].y + points[1].y) / 2;
	ctx.moveTo(xc, yc);

	// 中間点を繋ぐベジェスプラインの描画
	for (let i = 1; i < amoeba.numPoints - 1; i++) {
		xc = (points[i].x + points[i+1].x) / 2;
		yc = (points[i].y + points[i+1].y) / 2;
		ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
	}

	// 最後の点を終点へ繋ぐ
	xc = (points[amoeba.numPoints - 1].x + points[0].x) / 2;
	yc = (points[amoeba.numPoints - 1].y + points[0].y) / 2;
	ctx.quadraticCurveTo(points[amoeba.numPoints - 1].x, points[amoeba.numPoints - 1].y, xc, yc);

	// 開始地点に滑らかに閉じる
	const firstMidX = (points[0].x + points[1].x) / 2;
	const firstMidY = (points[0].y + points[1].y) / 2;
	ctx.quadraticCurveTo(points[0].x, points[0].y, firstMidX, firstMidY);

	ctx.closePath();
	ctx.fill();
}

/**
 * 指を離した場所の「見えない熱源（力場）」をラジアルグラデーションで描画
 */
export function drawForceField(ctx, field) {
	if (field.visualLife <= 0) return;

	const life = Math.max(0, field.visualLife);

	ctx.save();

	// 中心部が明るく、周辺にかけて滑らかに溶けるグラデーション
	const grad = ctx.createRadialGradient(
		field.x, field.y, 0,
		field.x, field.y, field.visualRadius
	);
	grad.addColorStop(0, `rgba(255, 255, 255, ${life * 0.85})`);
	grad.addColorStop(0.5, `rgba(255, 255, 255, ${life * 0.40})`);
	grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

	ctx.beginPath();
	ctx.arc(field.x, field.y, field.visualRadius, 0, Math.PI * 2);
	ctx.fillStyle = grad;
	ctx.fill();

	ctx.restore();
}

/**
 * タッチした指の位置から「すーっ」と浮かび上がり、アメーバに融合するサークルを描画
 */
export function drawPointer(ctx, pointer) {
	if (!pointer.active && pointer.visualRadius <= 0.5) return;

	ctx.save();

	const grad = ctx.createRadialGradient(
		pointer.x, pointer.y, 0,
		pointer.x, pointer.y, pointer.visualRadius
	);

	// アクティブ時とリリース時でアルファ値のターゲットをLerp
	const alpha = pointer.active ? 0.85 : (pointer.visualRadius / pointer.visualTargetRadius) * 0.85;
	grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
	grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.45})`);
	grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

	ctx.beginPath();
	ctx.arc(pointer.x, pointer.y, pointer.visualRadius, 0, Math.PI * 2);
	ctx.fillStyle = grad;
	ctx.fill();

	ctx.restore();
}
