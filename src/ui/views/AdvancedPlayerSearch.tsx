import { useState } from "react";
import type { View } from "../../common/types";
import useDropdownOptions from "../hooks/useDropdownOptions";
import useTitleBar from "../hooks/useTitleBar";
import { OptionDropdown } from "./PlayerGraphs";
import { isSport, PLAYER, RATINGS } from "../../common";
import { getCols, helpers, realtimeUpdate } from "../util";
import { DataTable } from "../components";
import { wrappedPlayerNameLabels } from "../components/PlayerNameLabels";
import SelectMultiple from "../components/SelectMultiple";

const numericOperators = [">", "<", ">=", "<=", "=", "!="] as const;
type NumericOperator = (typeof numericOperators)[number];
const stringOperators = ["contains", "does not contain"] as const;
type StringOperator = (typeof stringOperators)[number];

type FilterCategory = "rating";

type AdvancedPlayerSearchField = {
	category: FilterCategory;
	key: string;
	colKey: string;
	valueType: "numeric" | "string";
};

export type AdvancedPlayerSearchFilter = {
	category: "rating";
	key: string;
	operator: NumericOperator;
	value: number;
};

type AdvancedPlayerSearchFilterEditing = Omit<
	AdvancedPlayerSearchFilter,
	"value"
> & {
	value: string;
};

const possibleFilters: Record<
	FilterCategory,
	{
		label: string;
		options: AdvancedPlayerSearchField[];
	}
> = {
	rating: {
		label: "Ratings",
		options: ["ovr", "pot", ...RATINGS].map(key => {
			return {
				category: "rating",
				key,
				colKey: key === "ovr" ? "Ovr" : key === "pot" ? "Pot" : `rating:${key}`,
				valueType: "numeric",
			};
		}),
	},
};
console.log(possibleFilters);

const getFilterInfo = (category: FilterCategory, key: string) => {
	return possibleFilters[category].options.find(row => row.key === key);
};

const SelectOperator = <
	Type extends "numeric" | "string",
	Value = Type extends "numeric" ? NumericOperator : StringOperator,
>({
	type,
	value,
	onChange,
}: {
	type: Type;
	value: Value;
	onChange: (value: Value) => void;
}) => {
	const operators = type === "numeric" ? numericOperators : stringOperators;
	const textOverrides =
		type === "numeric"
			? {
					">": "greater than",
					"<": "less than",
					">=": "greater than or equal to",
					"<=": "less than or equal to",
					"=": "equals",
					"!=": "does not equal",
				}
			: undefined;

	return (
		<select
			className="form-select"
			value={value as any}
			onChange={event => {
				onChange(event.target.value as any);
			}}
			style={{
				width: "auto",
			}}
		>
			{operators.map(operator => {
				return (
					<option key={operator} value={operator}>
						{(textOverrides as any)?.[operator] ?? operator}
					</option>
				);
			})}
		</select>
	);
};

const ValueInput = ({
	type,
	value,
	onChange,
}: {
	type: "numeric" | "string";
	value: string;
	onChange: (value: string) => void;
}) => {
	return (
		<input
			type="text"
			className="form-control"
			inputMode={type === "numeric" ? "numeric" : undefined}
			value={value}
			onChange={event => {
				onChange(event.target.value as any);
			}}
			style={{
				width: "auto",
			}}
		/>
	);
};

const Filters = ({
	filters,
	setFilters,
}: {
	filters: AdvancedPlayerSearchFilterEditing[];
	setFilters: React.Dispatch<
		React.SetStateAction<AdvancedPlayerSearchFilterEditing[]>
	>;
}) => {
	const setFilter = (i: number, filter: AdvancedPlayerSearchFilterEditing) => {
		setFilters(oldFilters => {
			return oldFilters.map((oldFilter, j) => (i === j ? filter : oldFilter));
		});
	};

	return (
		<div>
			{filters.map((filter, i) => {
				const filterInfo = getFilterInfo(filter.category, filter.key);
				if (!filterInfo) {
					return null;
				}

				return (
					<div key={i}>
						<div className="p-2 rounded d-inline-flex gap-2 mb-3 bg-body-secondary">
							<div>
								<SelectMultiple
									value={filterInfo}
									options={Object.values(possibleFilters)}
									getOptionLabel={row => {
										const col = getCols([row.colKey])[0];
										return col.title;
									}}
									getOptionValue={row => {
										return JSON.stringify([row.category, row.key]);
									}}
									onChange={row => {
										console.log(row);
									}}
									isClearable={false}
								/>
							</div>
							<SelectOperator
								type={filterInfo.valueType}
								value={filter.operator}
								onChange={operator => {
									setFilter(i, {
										...filter,
										operator,
									});
								}}
							/>
							<ValueInput
								type={filterInfo.valueType}
								value={filter.value}
								onChange={value => {
									setFilter(i, {
										...filter,
										value,
									});
								}}
							/>
						</div>
					</div>
				);
			})}
			<div className="d-flex gap-2">
				<button
					type="button"
					className="btn btn-secondary"
					onClick={() => {
						setFilters(prev => {
							return [
								...prev,
								{
									category: "rating",
									key: "ovr",
									operator: ">=",
									value: "50",
								} satisfies AdvancedPlayerSearchFilterEditing,
							];
						});
					}}
				>
					Add filter
				</button>
				<button type="submit" className="btn btn-primary">
					Search
				</button>
			</div>
		</div>
	);
};

const filtersToEditable = (
	filters: AdvancedPlayerSearchFilter[],
): AdvancedPlayerSearchFilterEditing[] => {
	return filters.map(filter => {
		return {
			...filter,
			value: String(filter.value),
		};
	});
};

const filtersFromEditable = (
	filters: AdvancedPlayerSearchFilterEditing[],
): AdvancedPlayerSearchFilter[] => {
	return filters.map(filter => {
		return {
			...filter,
			value: helpers.localeParseFloat(filter.value),
		};
	});
};

const AdvancedPlayerSearch = (props: View<"advancedPlayerSearch">) => {
	const [[seasonStart, seasonEnd], setSeasonRange] = useState<[number, number]>(
		[props.seasonStart, props.seasonEnd],
	);
	const [singleSeason, setSingleSeason] = useState(props.singleSeason);
	const [playoffs, setPlayoffs] = useState(props.playoffs);
	const [statType, setStatType] = useState(props.statType);
	const [filters, setFilters] = useState(() => {
		return filtersToEditable(props.filters);
	});

	useTitleBar({
		title: "Advanced Player Search",
	});

	const seasons = useDropdownOptions("seasons");
	const playoffsOptions = useDropdownOptions("playoffsCombined");
	const statTypes = useDropdownOptions("statTypesStrict");

	const filtersWithInfos = props.filters
		.map(filter => {
			const info = getFilterInfo(filter.category, filter.key);
			return {
				filter,
				info: info!,
			};
		})
		.filter(row => !!row.info);

	const seenCols = new Set();
	const uniqueColFiltersWithInfo = filtersWithInfos.filter(filter => {
		if (seenCols.has(filter.info.colKey)) {
			return false;
		}

		seenCols.add(filter.info.colKey);
		return true;
	});

	const cols = getCols([
		"Name",
		"Pos",
		"Age",
		"Team",
		"Season",
		...uniqueColFiltersWithInfo.map(filter => filter.info.colKey),
	]);

	const rows = props.players.map((p, i) => {
		const showRatings = !props.challengeNoRatings || p.tid === PLAYER.RETIRED;

		return {
			key: i,
			data: [
				wrappedPlayerNameLabels({
					pid: p.pid,
					injury: p.injury,
					season: p.ratings.season,
					skills: p.ratings.skills,
					jerseyNumber: p.stats.jerseyNumber,
					watch: p.watch,
					firstName: p.firstName,
					firstNameShort: p.firstNameShort,
					lastName: p.lastName,
				}),
				p.ratings.pos,
				p.age,
				<a
					href={helpers.leagueUrl([
						"roster",
						`${p.stats.abbrev}_${p.stats.tid}`,
						p.ratings.season,
					])}
				>
					{p.stats.abbrev}
				</a>,
				p.ratings.season,
				...uniqueColFiltersWithInfo.map(row => {
					if (row.filter.category === "rating") {
						return showRatings ? p.ratings.ovr : null;
					} else {
						throw new Error("Should never happen");
					}
				}),
			],
		};
	});

	return (
		<>
			<form
				className="mb-5"
				onSubmit={event => {
					event.preventDefault();
					realtimeUpdate(
						[],
						helpers.leagueUrl([
							"advanced_player_search",
							seasonStart,
							seasonEnd,
							singleSeason,
							playoffs,
							statType,
							JSON.stringify(filtersFromEditable(filters)),
						]),
					);
				}}
			>
				<div className="row row-cols-md-auto g-3 mb-3">
					<div className="col-12 col-sm-6">
						<div className="input-group">
							<select
								className="form-select"
								value={seasonStart}
								onChange={event => {
									const season = parseInt(event.target.value);
									if (season > seasonEnd) {
										setSeasonRange([season, season]);
									} else {
										setSeasonRange([season, seasonEnd]);
									}
								}}
							>
								{seasons.map(x => {
									return <OptionDropdown key={x.key} value={x} />;
								})}
							</select>
							<span className="input-group-text">to</span>
							<select
								className="form-select"
								value={seasonEnd}
								onChange={event => {
									const season = parseInt(event.target.value);
									if (season < seasonStart) {
										setSeasonRange([season, season]);
									} else {
										setSeasonRange([seasonStart, season]);
									}
								}}
							>
								{seasons.map(x => {
									return <OptionDropdown key={x.key} value={x} />;
								})}
							</select>
						</div>
					</div>
					<div className="col-12 col-sm-6">
						<select
							className="form-select"
							value={singleSeason}
							onChange={event => {
								setSingleSeason(event.target.value as any);
							}}
						>
							<option value="singleSeason">Single season</option>
							<option value="totals">Totals</option>
						</select>
					</div>
					<div className="col-12 col-sm-6">
						<select
							className="form-select"
							onChange={event => {
								const newPlayoffs = event.target.value as any;

								setPlayoffs(newPlayoffs);
							}}
							value={playoffs}
						>
							{playoffsOptions.map(x => {
								return <OptionDropdown key={x.key} value={x} />;
							})}
						</select>
					</div>

					{isSport("basketball") ? (
						<div className="col-12 col-sm-6">
							<select
								className="form-select"
								value={statType}
								onChange={event => {
									setStatType(event.target.value as any);
								}}
							>
								{statTypes.map(x => {
									return <OptionDropdown key={x.key} value={x} />;
								})}
							</select>
						</div>
					) : null}
				</div>
				<Filters filters={filters} setFilters={setFilters} />
			</form>

			<DataTable
				cols={cols}
				defaultSort={[0, "asc"]}
				defaultStickyCols={window.mobile ? 0 : 1}
				name="AdvancedPlayerSearch"
				pagination
				rows={rows}
			/>
		</>
	);
};

export default AdvancedPlayerSearch;
