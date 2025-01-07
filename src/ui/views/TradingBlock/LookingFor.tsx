import clsx from "clsx";
import { helpers } from "../../util";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import useLookingForState, { categories } from "./useLookingForState";

type UseLookingForState = ReturnType<typeof useLookingForState>;
type LookingForState = UseLookingForState[0];
type SetLookingForState = UseLookingForState[1];

const LookingFor = ({
	disabled,
	state,
	setState,
}: {
	disabled: boolean;
	state: LookingForState;
	setState: SetLookingForState;
}) => {
	return (
		<div>
			<h3 className="mb-0">What are you looking for?</h3>
			<table>
				<tbody>
					{helpers.keys(categories).map(categoryKey => {
						const category = categories[categoryKey];
						return (
							<tr className="pt-2" key={categoryKey}>
								<td style={{ width: 0 }} className="p-0 pt-2 text-end">
									{category.name}
								</td>
								<td className="p-0 ps-2 pt-2 d-flex gap-3">
									{category.options.map(option => {
										const toggleButton = (
											<label
												key={option.key}
												className={clsx(
													"rounded-pill py-1 px-2",
													state[categoryKey][option.key]
														? "bg-secondary"
														: "bg-body-secondary",
												)}
											>
												<input
													type="checkbox"
													className="form-check-input me-1"
													disabled={disabled}
													checked={state[categoryKey][option.key]}
													onChange={() => {
														setState(state => {
															return {
																...state,
																[categoryKey]: {
																	...state[categoryKey],
																	[option.key]: !state[categoryKey][option.key],
																},
															};
														});
													}}
												/>
												{option.name}
											</label>
										);

										if (option.tooltip === undefined) {
											return toggleButton;
										}

										// position-fixed is for https://stackoverflow.com/a/75264190/786644
										return (
											<OverlayTrigger
												key={option.key}
												overlay={
													<Tooltip className="position-fixed">
														{option.tooltip}
													</Tooltip>
												}
											>
												{toggleButton}
											</OverlayTrigger>
										);
									})}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
};

export default LookingFor;
