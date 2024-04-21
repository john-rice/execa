import {createReadStream, createWriteStream} from 'node:fs';
import {Buffer} from 'node:buffer';
import {Readable, Writable, Duplex} from 'node:stream';
import {isStandardStream} from '../utils/standard-stream.js';
import {generatorToStream} from '../transform/generator.js';
import {handleStdio} from './handle.js';
import {TYPE_TO_MESSAGE} from './type.js';

// Handle `input`, `inputFile`, `stdin`, `stdout` and `stderr` options, before spawning, in async mode
export const handleStdioAsync = (options, verboseInfo) => handleStdio(addPropertiesAsync, options, verboseInfo, false);

const forbiddenIfAsync = ({type, optionName}) => {
	throw new TypeError(`The \`${optionName}\` option cannot be ${TYPE_TO_MESSAGE[type]}.`);
};

const addProperties = {
	generator: generatorToStream,
	asyncGenerator: generatorToStream,
	nodeStream: ({value}) => ({stream: value}),
	webTransform({value: {transform, writableObjectMode, readableObjectMode}}) {
		const objectMode = writableObjectMode || readableObjectMode;
		const stream = Duplex.fromWeb(transform, {objectMode});
		return {stream};
	},
	duplex: ({value: {transform}}) => ({stream: transform}),
	native() {},
};

const addPropertiesAsync = {
	input: {
		...addProperties,
		fileUrl: ({value}) => ({stream: createReadStream(value)}),
		filePath: ({value: {file}}) => ({stream: createReadStream(file)}),
		webStream: ({value}) => ({stream: Readable.fromWeb(value)}),
		iterable: ({value}) => ({stream: Readable.from(value)}),
		asyncIterable: ({value}) => ({stream: Readable.from(value)}),
		string: ({value}) => ({stream: Readable.from(value)}),
		uint8Array: ({value}) => ({stream: Readable.from(Buffer.from(value))}),
	},
	output: {
		...addProperties,
		fileUrl: ({value}) => ({stream: createWriteStream(value)}),
		filePath: ({value: {file}}) => ({stream: createWriteStream(file)}),
		webStream: ({value}) => ({stream: Writable.fromWeb(value)}),
		iterable: forbiddenIfAsync,
		asyncIterable: forbiddenIfAsync,
		string: forbiddenIfAsync,
		uint8Array: forbiddenIfAsync,
	},
};

// The stream error handling is performed by the piping logic above, which cannot be performed before subprocess spawning.
// If the subprocess spawning fails (e.g. due to an invalid command), the streams need to be manually destroyed.
// We need to create those streams before subprocess spawning, in case their creation fails, e.g. when passing an invalid generator as argument.
// Like this, an exception would be thrown, which would prevent spawning a subprocess.
export const cleanupCustomStreams = fileDescriptors => {
	for (const {stdioItems} of fileDescriptors) {
		for (const {stream} of stdioItems) {
			if (stream !== undefined && !isStandardStream(stream)) {
				stream.destroy();
			}
		}
	}
};