import type { PlayerRatings } from "../../../common/types.basketball";

/**
 * Calculates the overall rating by averaging together all the other ratings.
 *
 * @memberOf core.player
 * @param {Object.<string, number>} ratings Player's ratings object.
 * @return {number} Overall rating.
 */
const ovr = (ratings: PlayerRatings): number => {
	// See analysis/player-ovr-basketball
	const r =
		0.159 * (ratings.hgt - 29.0) +
		0.0777 * (ratings.stre - 30.6) +
		0.123 * (ratings.spd - 31.0) +
		0.051 * (ratings.jmp - 29.7) +
		0.0632 * (ratings.endu - 24.3) +
		0.0126 * (ratings.ins - 25.9) +
		0.0286 * (ratings.dnk - 30.2) +
		0.0202 * (ratings.ft - 28.7) +
		0.0726 * (ratings.tp - 28.7) +
		0.133 * (ratings.oiq - 28.5) +
		0.159 * (ratings.diq - 28.5) +
		0.059 * (ratings.drb - 33.4) +
		0.062 * (ratings.pss - 31.3) +
		0.01 * (ratings.fg - 28.7) +
		0.01 * (ratings.reb - 31.4) +
		49.5;

	// Fudge factor to keep ovr ratings the same as they used to be (back before 2018 ratings rescaling)
	// +8 at 68
	// +4 at 50
	// -5 at 42
	// -10 at 31
	let fudgeFactor = 0;
	if (r >= 90) {
		fudgeFactor = 8;
	} else if (r >= 67) {
		fudgeFactor = 4 + (r - 67) * (4 / 18);
	} else if (r >= 56) {
		fudgeFactor = -5 + (r - 56) * (9 / 8);
	} else if (r >= 41) {
		fudgeFactor = -5 - (56 - r) * (5 / 11);
	} else {
		fudgeFactor = -10;
	}

	const val = Math.round(r + fudgeFactor);

	if (val > 110) {
		return 110;
	}
	if (val < 0) {
		return 0;
	}

	return val;
};

export default ovr;
