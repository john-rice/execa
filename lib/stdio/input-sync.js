import {joinToUint8Array, isUint8Array} from './uint-array.js';
import {TYPE_TO_MESSAGE} from './type.js';
import {getGenerators, runGeneratorsSync} from './generator.js';

// Apply `stdin`/`input`/`inputFile` options, before spawning, in sync mode, by converting it to the `input` option
export const addInputOptionsSync = (fileDescriptors, options) => {
	for (const fdNumber of getInputFdNumbers(fileDescriptors)) {
		addInputOptionSync(fileDescriptors, fdNumber, options);
	}
};

const getInputFdNumbers = fileDescriptors => new Set(fileDescriptors
	.filter(({direction}) => direction === 'input')
	.map(({fdNumber}) => fdNumber));

const addInputOptionSync = (fileDescriptors, fdNumber, options) => {
	const selectedStdioItems = fileDescriptors
		.filter(fileDescriptor => fileDescriptor.fdNumber === fdNumber)
		.flatMap(({stdioItems}) => stdioItems);
	const allStdioItems = selectedStdioItems.filter(({contents}) => contents !== undefined);
	if (allStdioItems.length === 0) {
		return;
	}

	if (fdNumber !== 0) {
		const [{type, optionName}] = allStdioItems;
		throw new TypeError(`Only the \`stdin\` option, not \`${optionName}\`, can be ${TYPE_TO_MESSAGE[type]} with synchronous methods.`);
	}

	const allContents = allStdioItems.map(({contents}) => contents);
	const transformedContents = allContents.map(contents => applySingleInputGeneratorsSync(contents, selectedStdioItems));
	options.input = joinToUint8Array(transformedContents);
};

const applySingleInputGeneratorsSync = (contents, selectedStdioItems) => {
	const generators = getGenerators(selectedStdioItems).reverse();
	const newContents = runGeneratorsSync(contents, generators);
	validateSerializable(newContents);
	return joinToUint8Array(newContents);
};

const validateSerializable = newContents => {
	const invalidItem = newContents.find(item => typeof item !== 'string' && !isUint8Array(item));
	if (invalidItem !== undefined) {
		throw new TypeError(`The \`stdin\` option is invalid: when passing objects as input, a transform must be used to serialize them to strings or Uint8Arrays: ${invalidItem}.`);
	}
};