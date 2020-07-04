import { PHASE, helpers } from "../../common";
import { idb } from "../db";
import g from "./g";
import type { TeamFiltered } from "../../common/types";

type Team = TeamFiltered<
	["tid"],
	undefined,
	[
		"gp",
		"ptsPerDrive",
		"oppPtsPerDrive",
		"pts",
		"oppPts",
		"drives",
		"pss",
		"pssYds",
		"pssTD",
		"pssInt",
		"rus",
		"rusYds",
		"rec",
		"recYds",
		"fga0",
		"fga20",
		"fga30",
		"fga40",
		"fga50",
		"xpa",
		"pnt",
		"pntYds",
		"pntBlk",
	],
	number
>;

const TCK_CONSTANT = {
	DL: 0.6,
	LB: 0.3,
	CB: 0,
	S: 0,
};
const DEFENSIVE_POSITIONS = ["DL", "LB", "CB", "S"] as const;

// Approximate Value: https://www.sports-reference.com/blog/approximate-value-methodology/
const calculateAV = (players: any[], teamsInput: Team[], league: any) => {
	const teams = teamsInput.map(t => {
		const offPts =
			league.ptsPerDrive === 0
				? 0
				: (100 * t.stats.ptsPerDrive) / league.ptsPerDrive;
		const ptsOL = (5 / 11) * offPts;
		const ptsSkill = offPts - ptsOL;
		const ptsRus =
			t.stats.rusYds + t.stats.recYds === 0
				? 0
				: (ptsSkill *
						0.22 *
						(t.stats.rusYds / (t.stats.rusYds + t.stats.recYds))) /
				  0.37;
		const ptsPss = (ptsSkill - ptsRus) * 0.26;
		const ptsRec = (ptsSkill - ptsRus) * 0.74;

		let defPts = 0;
		if (league.ptsPerDrive !== 0) {
			const M = t.stats.oppPtsPerDrive / league.ptsPerDrive;
			defPts = (100 * (1 + 2 * M - M ** 2)) / (2 * M);
		}
		const ptsFront7 = (2 / 3) * defPts;
		const ptsSecondary = (1 / 3) * defPts;

		const kPlayingTime =
			t.stats.xpa +
			3 *
				(t.stats.fga0 +
					t.stats.fga20 +
					t.stats.fga30 +
					t.stats.fga40 +
					t.stats.fga50);

		return {
			...t,
			stats: {
				...t.stats,
				ptsOL,
				ptsRus,
				ptsPss,
				ptsRec,
				ptsFront7,
				ptsSecondary,
				individualPtsOL: 0,
				individualPtsFront7: 0,
				individualPtsSecondary: 0,
				kPlayingTime,
			},
		};
	});

	const individualPts = players.map(p => {
		let score = 0;

		const t = teams.find(t => t.tid === p.tid);

		if (t === undefined) {
			throw new Error("Should never happen");
		}

		if (p.ratings.pos === "OL" || p.ratings.pos === "TE") {
			const posMultiplier = p.ratings.pos === "OL" ? 1.1 : 0.2;
			score = p.stats.gp + 5 * p.stats.gs * posMultiplier;
			t.stats.individualPtsOL += score;
		} else if (DEFENSIVE_POSITIONS.includes(p.ratings.pos)) {
			score =
				p.stats.gp +
				5 * p.stats.gs +
				p.stats.defSk +
				4 * p.stats.defFmbRec +
				4 * p.stats.defInt +
				5 * (p.stats.defIntTD + p.stats.defFmbTD) +
				// https://github.com/microsoft/TypeScript/issues/21732
				// @ts-ignore
				TCK_CONSTANT[p.ratings.pos] * p.stats.defTck;

			if (p.ratings.pos === "DL" || p.ratings.pos === "LB") {
				t.stats.individualPtsFront7 += score;
			} else {
				t.stats.individualPtsSecondary += score;
			}
		}

		return score;
	});

	const av = players.map((p, i) => {
		let score = 0;

		const t = teams.find(t => t.tid === p.tid);

		if (t === undefined) {
			throw new Error("Should never happen");
		}

		// OL
		if (p.ratings.pos === "OL" || p.ratings.pos === "TE") {
			score += (individualPts[i] / t.stats.individualPtsOL) * t.stats.ptsOL;
		}

		// Rushing
		score += (p.stats.rusYds / t.stats.rusYds) * t.stats.ptsRus;

		if (p.stats.rus / p.stats.gp >= 200 / 16) {
			if (p.stats.rusYdsPerAtt > league.rusYdsPerAtt) {
				score += 0.75 * (p.stats.rusYdsPerAtt - league.rusYdsPerAtt);
			} else {
				score += 2 * (p.stats.rusYdsPerAtt - league.rusYdsPerAtt);
			}
		}

		// Receiving
		score += (p.stats.recYds / t.stats.recYds) * t.stats.ptsRec;

		if (p.stats.rec / p.stats.gp >= 70 / 16) {
			if (p.stats.recYdsPerAtt > league.recYdsPerAtt) {
				score += 0.5 * (p.stats.recYdsPerAtt - league.recYdsPerAtt);
			} else {
				score += 2 * (p.stats.recYdsPerAtt - league.recYdsPerAtt);
			}
		}

		// Passing
		score += (p.stats.pssYds / t.stats.pssYds) * t.stats.ptsPss;

		if (p.stats.pss / p.stats.gp >= 400 / 16) {
			if (p.stats.pssAdjYdsPerAtt > league.pssAdjYdsPerAtt) {
				score += 0.5 * (p.stats.pssAdjYdsPerAtt - league.pssAdjYdsPerAtt);
			} else {
				score += 2 * (p.stats.pssAdjYdsPerAtt - league.pssAdjYdsPerAtt);
			}
		}

		// Defense
		if (p.ratings.pos === "DL" || p.ratings.pos === "LB") {
			score +=
				(individualPts[i] / t.stats.individualPtsFront7) * t.stats.ptsFront7;
		}

		if (p.ratings.pos === "S" || p.ratings.pos === "CB") {
			score +=
				(individualPts[i] / t.stats.individualPtsSecondary) *
				t.stats.ptsSecondary;
		}

		// Returns
		score += p.stats.prTD + p.stats.krTD;

		// Kicking
		{
			// Ignore schedule length normalization

			const kPlayingTime =
				p.stats.xpa +
				3 *
					(p.stats.fga0 +
						p.stats.fga20 +
						p.stats.fga30 +
						p.stats.fga40 +
						p.stats.fga50);
			if (kPlayingTime > 0) {
				let paaTotal = p.stats.xp - p.stats.xpa * league.xpp;
				paaTotal += 3 * (p.stats.fg0 - p.stats.fga0 * league.fgp0);
				paaTotal += 3 * (p.stats.fg20 - p.stats.fga20 * league.fgp20);
				paaTotal += 3 * (p.stats.fg30 - p.stats.fga30 * league.fgp30);
				paaTotal += 3 * (p.stats.fg40 - p.stats.fga40 * league.fgp40);
				paaTotal += 3 * (p.stats.fg50 - p.stats.fga50 * league.fgp50);

				const pctTeamPlayingTime = kPlayingTime / t.stats.kPlayingTime;
				const avgAV = 3.125 * pctTeamPlayingTime;
				const rawAV = avgAV + paaTotal / 5;
				score += rawAV;
			}
		}

		// Punting
		{
			// Ignore schedule length normalization
			if (
				p.stats.pnt + p.stats.pntBlk > 0 &&
				t.stats.pnt + t.stats.pntBlk > 0
			) {
				const adjPntYPA =
					(p.stats.pntYds - 13 * p.stats.pntBlk) /
					(p.stats.pnt + p.stats.pntBlk);
				const adjPuntYdsAboveAvg =
					(p.stats.pnt + p.stats.pntBlk) * (adjPntYPA - league.adjPntYPA);
				const pctTeamPlayingTime =
					(p.stats.pnt + p.stats.pntBlk) / (t.stats.pnt + t.stats.pntBlk);
				const avgAV = 2.1875 * pctTeamPlayingTime;
				const rawAV = avgAV + adjPuntYdsAboveAvg / 200;
				score += rawAV;
			}
		}

		// Adjust for GP... docs don't say to do this, but it feels right
		score *= t.stats.gp / g.get("numGames");

		return score;
	});
	return {
		av,
	};
};

const advStats = async () => {
	const playersRaw = await idb.cache.players.indexGetAll("playersByTid", [
		0, // Active players have tid >= 0
		Infinity,
	]);
	const players = await idb.getCopies.playersPlus(playersRaw, {
		attrs: ["pid", "tid"],
		stats: [
			"gp",
			"gs",
			"pss",
			"pssYds",
			"pssAdjYdsPerAtt",
			"rus",
			"rusYds",
			"rusYdsPerAtt",
			"rec",
			"recYds",
			"recYdsPerAtt",
			"defSk",
			"defFmbRec",
			"defInt",
			"defIntTD",
			"defFmbTD",
			"defTck",
			"prTD",
			"krTD",
			"fg0",
			"fg20",
			"fg30",
			"fg40",
			"fg50",
			"fga0",
			"fga20",
			"fga30",
			"fga40",
			"fga50",
			"xp",
			"xpa",
			"pnt",
			"pntYds",
			"pntBlk",
		],
		ratings: ["pos"],
		season: g.get("season"),
		playoffs: PHASE.PLAYOFFS === g.get("phase"),
		regularSeason: PHASE.PLAYOFFS !== g.get("phase"),
	});
	const teamStats = [
		"gp",
		"ptsPerDrive",
		"oppPtsPerDrive",
		"pts",
		"oppPts",
		"drives",
		"pss",
		"pssYds",
		"pssTD",
		"pssInt",
		"rus",
		"rusYds",
		"rec",
		"recYds",
		"fg0",
		"fg20",
		"fg30",
		"fg40",
		"fg50",
		"fga0",
		"fga20",
		"fga30",
		"fga40",
		"fga50",
		"xp",
		"xpa",
		"pnt",
		"pntYds",
		"pntBlk",
	] as const;
	const teams = await idb.getCopies.teamsPlus({
		attrs: ["tid"],
		stats: teamStats,
		season: g.get("season"),
		playoffs: PHASE.PLAYOFFS === g.get("phase"),
		regularSeason: PHASE.PLAYOFFS !== g.get("phase"),
		addDummySeason: true,
		active: true,
	});
	const league: any = teams.reduce((memo: any, t) => {
		for (const key of teamStats) {
			if (memo.hasOwnProperty(key)) {
				memo[key] += t.stats[key];
			} else {
				memo[key] = t.stats[key];
			}
		}

		return memo;
	}, {});
	league.ptsPerDrive = league.pts / league.drives;
	league.pssAdjYdsPerAtt =
		(league.pssYds + 20 * league.pssTD - 45 * league.pssInt) / league.pss;
	league.rusYdsPerAtt = league.rusYds / league.rus;
	league.recYdsPerAtt = league.recYds / league.rec;
	league.fgp0 = league.fg0 / league.fga0;
	league.fgp20 = league.fg20 / league.fga20;
	league.fgp30 = league.fg30 / league.fga30;
	league.fgp40 = league.fg40 / league.fga40;
	league.fgp50 = league.fg50 / league.fga50;
	league.xpp = league.xp / league.xpa;
	league.adjPntYPA =
		(league.pntYds - 13 * league.pntBlk) / (league.pnt + league.pntBlk);
	const updatedStats = { ...calculateAV(players, teams, league) };

	// Save to database
	const keys = helpers.keys(updatedStats);
	await Promise.all(
		players.map(async ({ pid }, i) => {
			const p = playersRaw.find(p2 => p2.pid === pid);

			if (p) {
				const ps = p.stats[p.stats.length - 1];

				if (ps) {
					for (const key of keys) {
						if (!Number.isNaN(updatedStats[key][i])) {
							ps[key] = updatedStats[key][i];
						}
					}

					await idb.cache.players.put(p);
				}
			}
		}),
	);
};

export default advStats;
