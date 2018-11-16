// @flow

import romanNumerals from "roman-numerals";
import { idb } from "../../db";
import { g, helpers, random } from "../../util";
import type { Player, RelativeType } from "../../../../deion/common/types";

const parseLastName = (lastName: string): [string, number | void] => {
    const parts = lastName.split(" ");
    if (parts.length === 1) {
        return [lastName, undefined];
    }

    const suffix = parts[parts.length - 1];
    const parsedName = parts.slice(0, -1).join(" ");

    if (suffix === "Sr.") {
        return [parsedName, 1];
    }

    if (suffix === "Jr.") {
        return [parsedName, 2];
    }

    try {
        const suffixNumber = romanNumerals.toArabic(suffix);
        return [parsedName, suffixNumber];
    } catch (err) {
        if (err.message !== "toArabic expects a valid roman number") {
            throw err;
        }
        return [lastName, undefined];
    }
};

const getSuffix = (suffixNumber: number): string => {
    if (suffixNumber <= 2) {
        return "Jr.";
    }

    return romanNumerals.toRoman(suffixNumber);
};

const hasRelative = (p: Player<>, type: RelativeType) => {
    return !!p.relatives.find(relative => relative.type === type);
};

const getRelatives = async (
    p: Player<>,
    type: RelativeType,
): Promise<Player<>[]> => {
    const players = await Promise.all(
        p.relatives
            .filter(rel => rel.type === type)
            .map(({ pid }) => idb.getCopy.players({ pid })),
    );

    // $FlowFixMe
    return players.filter(p2 => p2 !== undefined);
};

const addRelative = (
    p: Player<>,
    relative: {
        type: RelativeType,
        pid: number,
        name: string,
    },
) => {
    // Don't add duplicate
    if (
        p.relatives.some(
            ({ type, pid }) => type === relative.type && pid === relative.pid,
        )
    ) {
        return;
    }

    if (relative.type === "father") {
        p.relatives.unshift(relative);
    } else {
        p.relatives.push(relative);
    }
};

export const makeSon = async (p: Player<>) => {
    // Sanity check - player must not already have father
    if (hasRelative(p, "father")) {
        return;
    }

    // Find a player from a draft 21-40 years ago to make the father
    const NUM_SEASONS_IN_NEW_LEAGUE_DEFAULT = 20;
    const maxYearsAgo = helpers.bound(
        p.draft.year - (g.startingSeason - NUM_SEASONS_IN_NEW_LEAGUE_DEFAULT),
        21,
        40,
    );
    const draftYear = p.draft.year - random.randInt(21, maxYearsAgo);

    const possibleFathers = (await idb.getCopies.players({
        draftYear,
    })).filter(
        father =>
            typeof father.diedYear !== "number" ||
            father.diedYear >= p.born.year,
    );
    if (possibleFathers.length === 0) {
        // League must be too new, draft class doesn't exist
        return;
    }

    const father = random.choice(possibleFathers, ({ lastName }) => {
        const out = parseLastName(lastName);
        if (out[1] !== undefined) {
            // 10 for Sr, 15 for Jr, etc - make it more likely for older lineages to continue
            return helpers.bound(5 + 10 * out[1], 0, 40);
        }
        return 1;
    });

    const [fatherLastName, fatherSuffixNumber] = parseLastName(father.lastName);
    const sonSuffixNumber =
        fatherSuffixNumber === undefined ? 2 : fatherSuffixNumber + 1;
    const sonSuffix = getSuffix(sonSuffixNumber);

    // Only rename to be a Jr if the father has no son yet (first is always Jr)
    if (!hasRelative(father, "son")) {
        p.firstName = father.firstName;
        p.lastName = `${fatherLastName} ${sonSuffix}`;

        if (fatherSuffixNumber === undefined) {
            father.lastName += ` Sr.`;
        }
    } else {
        p.lastName = fatherLastName;
    }

    p.born.loc = father.born.loc;

    // Handle case where father has other sons
    if (hasRelative(father, "son")) {
        const existingSons = await getRelatives(father, "son");
        for (const existingSon of existingSons) {
            // Add new brother to each of the existing sons
            addRelative(existingSon, {
                type: "brother",
                pid: p.pid,
                name: `${p.firstName} ${p.lastName}`,
            });
            await idb.cache.players.put(existingSon);

            // Add existing brothers to new son
            addRelative(p, {
                type: "brother",
                pid: existingSon.pid,
                name: `${existingSon.firstName} ${existingSon.lastName}`,
            });
        }
    }

    const relFather = {
        type: "father",
        pid: father.pid,
        name: `${father.firstName} ${father.lastName}`,
    };

    // Handle case where son already has other brothers
    if (hasRelative(p, "brother")) {
        const brothers = await getRelatives(p, "brother");

        for (const brother of brothers) {
            if (!hasRelative(brother, "father")) {
                // Add father to each brother (assuming they don't somehow already have another father)
                brother.born.loc = father.born.loc;
                addRelative(brother, relFather);
                await idb.cache.players.put(brother);

                // Add existing brothers as sons to father
                addRelative(father, {
                    type: "son",
                    pid: brother.pid,
                    name: `${brother.firstName} ${brother.lastName}`,
                });
            }
        }
    }

    addRelative(p, relFather);
    addRelative(father, {
        type: "son",
        pid: p.pid,
        name: `${p.firstName} ${p.lastName}`,
    });

    await idb.cache.players.put(p);
    await idb.cache.players.put(father);
};

export const makeBrother = async (p: Player<>) => {
    // If p already has a brother, this would be hard to get right because the names of various players stored in Player.relatives would need to be updated. It's okay if the player picked to be p's brother has other brothers, though!
    if (hasRelative(p, "brother")) {
        return;
    }

    // Find a player from a draft 0-5 years ago to make the brother
    const draftYear = p.draft.year - random.randInt(0, 5);

    const existingRelativePids = p.relatives.map(rel => rel.pid);

    const possibleBrothers = (await idb.getCopies.players({
        draftYear,
    })).filter(p2 => {
        if (p2.pid === p.pid) {
            return false;
        }

        if (existingRelativePids.includes(p2.pid)) {
            return false;
        }

        return true;
    });

    if (possibleBrothers.length === 0) {
        // League must be too new, draft class doesn't exist
        return;
    }

    const brother = random.choice(possibleBrothers);

    // Two brothers can't have different fathers
    if (hasRelative(p, "father") && hasRelative(brother, "father")) {
        return;
    }

    // In case the brother is a Jr...
    const [brotherLastName] = parseLastName(brother.lastName);

    p.lastName = brotherLastName;
    p.born.loc = brother.born.loc;

    const edgeCases = async (brother1, brother2) => {
        // Handle case where one brother already has a brother
        if (hasRelative(brother1, "brother")) {
            const brothers = await getRelatives(brother1, "brother");

            for (const otherBrother of brothers) {
                // Add brother to other brother
                addRelative(otherBrother, {
                    type: "brother",
                    pid: brother2.pid,
                    name: `${brother2.firstName} ${brother2.lastName}`,
                });
                await idb.cache.players.put(otherBrother);

                // Add other brother to brother
                addRelative(brother2, {
                    type: "brother",
                    pid: otherBrother.pid,
                    name: `${otherBrother.firstName} ${otherBrother.lastName}`,
                });
            }
        }

        // Handle case where one brother already has a father
        if (hasRelative(brother1, "father")) {
            const fathers = await getRelatives(brother1, "father");
            if (fathers.length > 0) {
                const father = fathers[0];

                // Add brother to father
                addRelative(father, {
                    type: "son",
                    pid: brother2.pid,
                    name: `${brother2.firstName} ${brother2.lastName}`,
                });
                await idb.cache.players.put(father);

                // Add father to brother
                addRelative(brother2, {
                    type: "father",
                    pid: father.pid,
                    name: `${father.firstName} ${father.lastName}`,
                });
            }
        }
    };

    await edgeCases(p, brother);
    await edgeCases(brother, p);

    addRelative(p, {
        type: "brother",
        pid: brother.pid,
        name: `${brother.firstName} ${brother.lastName}`,
    });
    addRelative(brother, {
        type: "brother",
        pid: p.pid,
        name: `${p.firstName} ${p.lastName}`,
    });

    await idb.cache.players.put(p);
    await idb.cache.players.put(brother);
};

const addRelatives = async (p: Player<>) => {
    if (Math.random() < g.sonRate) {
        await makeSon(p);
    }
    if (Math.random() < g.brotherRate) {
        await makeBrother(p);
    }
};

export default addRelatives;
