import {spawnSync} from 'node:child_process';
import {handleCommand} from '../arguments/command.js';
import {handleOptions} from '../arguments/options.js';
import {makeError, makeEarlyError, makeSuccessResult} from '../return/result.js';
import {handleResult} from '../return/reject.js';
import {handleStdioSync} from '../stdio/handle-sync.js';
import {stripNewline} from '../io/strip-newline.js';
import {addInputOptionsSync} from '../io/input-sync.js';
import {transformOutputSync} from '../io/output-sync.js';
import {getMaxBufferSync} from '../io/max-buffer.js';
import {logEarlyResult} from '../verbose/complete.js';
import {getAllSync} from '../resolve/all-sync.js';
import {getExitResultSync} from '../resolve/exit-sync.js';

export const execaCoreSync = (rawFile, rawArguments, rawOptions) => {
	const {file, commandArguments, command, escapedCommand, startTime, verboseInfo, options, fileDescriptors} = handleSyncArguments(rawFile, rawArguments, rawOptions);
	const result = spawnSubprocessSync({
		file,
		commandArguments,
		options,
		command,
		escapedCommand,
		verboseInfo,
		fileDescriptors,
		startTime,
	});
	return handleResult(result, verboseInfo, options);
};

const handleSyncArguments = (rawFile, rawArguments, rawOptions) => {
	const {command, escapedCommand, startTime, verboseInfo} = handleCommand(rawFile, rawArguments, rawOptions);

	try {
		const syncOptions = normalizeSyncOptions(rawOptions);
		const {file, commandArguments, options} = handleOptions(rawFile, rawArguments, syncOptions);
		validateSyncOptions(options);
		const fileDescriptors = handleStdioSync(options, verboseInfo);
		return {
			file,
			commandArguments,
			command,
			escapedCommand,
			startTime,
			verboseInfo,
			options,
			fileDescriptors,
		};
	} catch (error) {
		logEarlyResult(error, startTime, verboseInfo);
		throw error;
	}
};

const normalizeSyncOptions = options => options.node && !options.ipc ? {...options, ipc: false} : options;

const validateSyncOptions = ({ipc, detached, cancelSignal}) => {
	if (ipc) {
		throwInvalidSyncOption('ipc: true');
	}

	if (detached) {
		throwInvalidSyncOption('detached: true');
	}

	if (cancelSignal) {
		throwInvalidSyncOption('cancelSignal');
	}
};

const throwInvalidSyncOption = value => {
	throw new TypeError(`The "${value}" option cannot be used with synchronous methods.`);
};

const spawnSubprocessSync = ({file, commandArguments, options, command, escapedCommand, verboseInfo, fileDescriptors, startTime}) => {
	const syncResult = runSubprocessSync({
		file,
		commandArguments,
		options,
		command,
		escapedCommand,
		fileDescriptors,
		startTime,
	});
	if (syncResult.failed) {
		return syncResult;
	}

	const {resultError, exitCode, signal, timedOut, isMaxBuffer} = getExitResultSync(syncResult, options);
	const {output, error = resultError} = transformOutputSync({
		fileDescriptors,
		syncResult,
		options,
		isMaxBuffer,
		verboseInfo,
	});
	const stdio = output.map((stdioOutput, fdNumber) => stripNewline(stdioOutput, options, fdNumber));
	const all = stripNewline(getAllSync(output, options), options, 'all');
	return getSyncResult({
		error,
		exitCode,
		signal,
		timedOut,
		isMaxBuffer,
		stdio,
		all,
		options,
		command,
		escapedCommand,
		startTime,
	});
};

const runSubprocessSync = ({file, commandArguments, options, command, escapedCommand, fileDescriptors, startTime}) => {
	try {
		addInputOptionsSync(fileDescriptors, options);
		const normalizedOptions = normalizeSpawnSyncOptions(options);
		return spawnSync(file, commandArguments, normalizedOptions);
	} catch (error) {
		return makeEarlyError({
			error,
			command,
			escapedCommand,
			fileDescriptors,
			options,
			startTime,
			isSync: true,
		});
	}
};

const normalizeSpawnSyncOptions = ({encoding, maxBuffer, ...options}) => ({...options, encoding: 'buffer', maxBuffer: getMaxBufferSync(maxBuffer)});

const getSyncResult = ({error, exitCode, signal, timedOut, isMaxBuffer, stdio, all, options, command, escapedCommand, startTime}) => error === undefined
	? makeSuccessResult({
		command,
		escapedCommand,
		stdio,
		all,
		options,
		startTime,
	})
	: makeError({
		error,
		command,
		escapedCommand,
		timedOut,
		isCanceled: false,
		isMaxBuffer,
		exitCode,
		signal,
		stdio,
		all,
		options,
		startTime,
		isSync: true,
	});