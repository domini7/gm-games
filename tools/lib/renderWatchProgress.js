import logSymbols from "log-symbols";
import fs from "node:fs";
// eslint-disable-next-line import/no-unresolved
import { render, Box, Text } from "ink";
// eslint-disable-next-line import/no-unresolved
import Spinner from "ink-spinner";
import React, { useEffect, useReducer } from "react";
import watchCSS from "./watchCSS.ts";
import watchFiles from "./watchFiles.ts";
import watchJS from "./watchJS.ts";
import watchJSONSchema from "./watchJSONSchema.ts";

const TIME_CUTOFF_GREEN = 10000; // 10 seconds
const TIME_CUTOFF_YELLOW = 30000; // 30 seconds

const reducer = (files, { type, filename, error }) => {
	switch (type) {
		case "start":
			if (!files[filename]) {
				return {
					...files,
					[filename]: {
						building: true,
						dateStart: new Date(),
						dateEnd: new Date(),
						error: undefined,
						size: 0,
					},
				};
			}
			return {
				...files,
				[filename]: {
					...files[filename],
					building: true,
					dateStart: new Date(),
					error: undefined,
				},
			};
		case "end": {
			let size;
			if (filename !== "static files") {
				size = fs.statSync(filename).size;
			}

			return {
				...files,
				[filename]: {
					...files[filename],
					building: false,
					dateEnd: new Date(),
					error: undefined,
					size,
				},
			};
		}
		case "error":
			return {
				...files,
				[filename]: {
					...files[filename],
					building: false,
					dateEnd: new Date(),
					error,
				},
			};
		default:
			throw new Error(`Unknown action type "${type}"`);
	}
};

const File = ({ filename, info }) => {
	if (info.error) {
		// Would be nice to capture ESBuild errors and show them here better
		return (
			<Text>{`${logSymbols?.error} ${filename}: ${
				info.error.stack ?? "See error above from ESBuild"
			}`}</Text>
		);
	}

	const time = (
		info.building ? info.dateStart : info.dateEnd
	).toLocaleTimeString();
	const numMillisecondsSinceTime = new Date() - info.dateEnd;

	const colorParams = {};

	if (numMillisecondsSinceTime < TIME_CUTOFF_GREEN) {
		if (!info.building) {
			colorParams.color = "green";
		}
	} else if (numMillisecondsSinceTime < TIME_CUTOFF_YELLOW) {
		colorParams.color = "yellow";
	} else {
		// TEMP DISABLE WITH ESLINT 9 UPGRADE eslint-disable-next-line no-lonely-if
		if (info.building) {
			colorParams.color = "red";
		}
	}

	if (info.building) {
		return (
			<Box>
				<Text color="yellow">
					<Spinner type="dots" />
				</Text>
				<Text>
					{" "}
					{filename}: build started at <Text {...colorParams}>{time}</Text>
				</Text>
			</Box>
		);
	}

	const duration = (info.dateEnd - info.dateStart) / 1000;
	const megabytes =
		info.size !== undefined ? (info.size / 1024 / 1024).toFixed(2) : undefined;

	return (
		<Box>
			<Text>
				{logSymbols?.success} {filename}:{" "}
				{megabytes !== undefined ? `${megabytes} MB in ` : ""}
				{duration} seconds at <Text {...colorParams}>{time}</Text>
			</Text>
		</Box>
	);
};

const Watch = () => {
	const [files, dispatch] = useReducer(reducer, {});
	const [forceUpdateCounter, forceUpdate] = useReducer(x => x + 1, 0);

	useEffect(() => {
		const updateStart = filename => {
			dispatch({
				type: "start",
				filename,
			});
		};

		const updateEnd = filename => {
			dispatch({
				type: "end",
				filename,
			});
		};

		const updateError = (filename, error) => {
			dispatch({
				type: "error",
				filename,
				error,
			});
		};

		// Needs to run first, to create output folder
		watchFiles(updateStart, updateEnd, updateError);

		// Schema is needed for JS bunlde, and watchJSONSchema is async
		watchJSONSchema(updateStart, updateEnd, updateError).then(() => {
			watchJS(updateStart, updateEnd, updateError);
		});

		watchCSS(updateStart, updateEnd, updateError);
	}, []);

	useEffect(() => {
		let id;
		for (const info of Object.values(files)) {
			const numMillisecondsSinceTime = new Date() - info.dateEnd;
			if (numMillisecondsSinceTime < TIME_CUTOFF_YELLOW) {
				// Make sure we check in a little if we need to update the color here, because otherwise there might not be another render to handle the color change
				id = setTimeout(() => {
					forceUpdate();
				}, 2000);
				break;
			}
		}
		if (!id) {
		}

		return () => {
			clearInterval(id);
		};
	}, [files, forceUpdateCounter]);

	return (
		<>
			{Object.entries(files).map(([filename, info]) => (
				<File key={filename} filename={filename} info={info} />
			))}
		</>
	);
};

export default () => {
	render(<Watch />, { experimental: true });
};
