import {getStdioOptionType, isRegularUrl, isUnknownStdioString} from './type.js';
import {addStreamDirection} from './direction.js';
import {normalizeStdio} from './normalize.js';
import {handleNativeStream} from './native.js';
import {handleInputOptions} from './input.js';

// Handle `input`, `inputFile`, `stdin`, `stdout` and `stderr` options, before spawning, in async/sync mode
export const handleInput = (addProperties, options) => {
	const stdio = normalizeStdio(options);
	const [stdinStreams, ...otherStreamsGroups] = stdio.map((stdioOption, index) => getStdioStreams(stdioOption, index));
	const stdioStreamsGroups = [[...stdinStreams, ...handleInputOptions(options)], ...otherStreamsGroups]
		.map(stdioStreams => validateStreams(stdioStreams))
		.map(stdioStreams => addStreamDirection(stdioStreams))
		.map(stdioStreams => addStreamsProperties(stdioStreams, addProperties));
	options.stdio = transformStdio(stdioStreamsGroups);
	return stdioStreamsGroups.flat();
};

// We make sure passing an array with a single item behaves the same as passing that item without an array.
// This is what users would expect.
// For example, `stdout: ['ignore']` behaves the same as `stdout: 'ignore'`.
const getStdioStreams = (stdioOption, index) => {
	const optionName = getOptionName(index);
	const stdioOptions = Array.isArray(stdioOption) ? [...new Set(stdioOption)] : [stdioOption];
	const isStdioArray = stdioOptions.length > 1;
	validateStdioArray(stdioOptions, isStdioArray, optionName);
	return stdioOptions.map(stdioOption => getStdioStream({stdioOption, optionName, index, isStdioArray}));
};

const getOptionName = index => KNOWN_OPTION_NAMES[index] ?? `stdio[${index}]`;
const KNOWN_OPTION_NAMES = ['stdin', 'stdout', 'stderr'];

const validateStdioArray = (stdioOptions, isStdioArray, optionName) => {
	if (stdioOptions.length === 0) {
		throw new TypeError(`The \`${optionName}\` option must not be an empty array.`);
	}

	if (!isStdioArray) {
		return;
	}

	for (const invalidStdioOption of INVALID_STDIO_ARRAY_OPTIONS) {
		if (stdioOptions.includes(invalidStdioOption)) {
			throw new Error(`The \`${optionName}\` option must not include \`${invalidStdioOption}\`.`);
		}
	}
};

// Using those `stdio` values together with others for the same stream does not make sense, so we make it fail.
// However, we do allow it if the array has a single item.
const INVALID_STDIO_ARRAY_OPTIONS = ['ignore', 'ipc'];

const getStdioStream = ({stdioOption, optionName, index, isStdioArray}) => {
	const type = getStdioOptionType(stdioOption);
	const stdioStream = {type, value: stdioOption, optionName, index};
	return handleNativeStream(stdioStream, isStdioArray);
};

const validateStreams = stdioStreams => {
	for (const stdioStream of stdioStreams) {
		validateFileStdio(stdioStream);
	}

	return stdioStreams;
};

const validateFileStdio = ({type, value, optionName}) => {
	if (isRegularUrl(value)) {
		throw new TypeError(`The \`${optionName}: URL\` option must use the \`file:\` scheme.
For example, you can use the \`pathToFileURL()\` method of the \`url\` core module.`);
	}

	if (isUnknownStdioString(type, value)) {
		throw new TypeError(`The \`${optionName}: { file: '...' }\` option must be used instead of \`${optionName}: '...'\`.`);
	}
};

// Some `stdio` values require Execa to create streams.
// For example, file paths create file read/write streams.
// Those transformations are specified in `addProperties`, which is both direction-specific and type-specific.
const addStreamsProperties = (stdioStreams, addProperties) => stdioStreams.map(stdioStream => ({
	...stdioStream,
	...addProperties[stdioStream.direction][stdioStream.type]?.(stdioStream),
}));

// When the `std*: Iterable | WebStream | URL | filePath`, `input` or `inputFile` option is used, we pipe to `spawned.std*`.
// When the `std*: Array` option is used, we emulate some of the native values ('inherit', Node.js stream and file descriptor integer). To do so, we also need to pipe to `spawned.std*`.
// Therefore the `std*` options must be either `pipe` or `overlapped`. Other values do not set `spawned.std*`.
const transformStdio = stdioStreamsGroups => stdioStreamsGroups.map(stdioStreams => transformStdioItem(stdioStreams));

const transformStdioItem = stdioStreams => {
	if (stdioStreams.length > 1) {
		return stdioStreams.some(({value}) => value === 'overlapped') ? 'overlapped' : 'pipe';
	}

	const [stdioStream] = stdioStreams;
	return stdioStream.type !== 'native' && stdioStream.value !== 'overlapped' ? 'pipe' : stdioStream.value;
};