import { PythonDiscovery } from './python';
import { BundledTools } from './bundledTools';
import type { LocalStore } from '../core/store';
import type { TaskWorkspaces } from '../git/taskWorkspaces';
import { type ExecutionUpdate } from '../shared/execution';
import { Inference } from '../providers/inference';
import { RunRecords } from './records';
import { type CommandRunner } from './commands';
import type { Active } from './runtimeTypes';
import {
  initialize,
  recoverySummary,
  persist,
  operation,
  newOperation,
  move,
  restore,
  recoveryStep,
} from './recoveryCoordinator';
import {
  requireTask,
  sendMessage,
  serializeMessage,
  finishMessages,
  launchMessages,
  processMessages,
} from './conversationCoordinator';
import {
  projection,
  cleanError,
  clean,
  redact,
  emit,
  beginActivity,
  endActivity,
} from './recordProjection';
import { compactContext, clearToolPause, pauseForTools, toolResult, agent } from './agentTurn';
import { check, fingerprint, pythonObserver, tool } from './toolExecutor';
import {
  subscribe,
  snapshot,
  notify,
  assertMutable,
  request,
  requireActive,
  state,
  boundary,
  start,
  stop,
  gitJob,
  deleteTask,
  setPlan,
  execute,
  directory,
  preview,
  shutdown,
} from './runController';
export class ExecutionRuntime {
  initialize = initialize;
  recoverySummary = recoverySummary;
  persist = persist;
  operation = operation;
  newOperation = newOperation;
  move = move;
  restore = restore;
  recoveryStep = recoveryStep;
  requireTask = requireTask;
  sendMessage = sendMessage;
  serializeMessage = serializeMessage;
  finishMessages = finishMessages;
  launchMessages = launchMessages;
  processMessages = processMessages;
  projection = projection;
  cleanError = cleanError;
  clean = clean;
  redact = redact;
  emit = emit;
  beginActivity = beginActivity;
  endActivity = endActivity;
  compactContext = compactContext;
  clearToolPause = clearToolPause;
  pauseForTools = pauseForTools;
  toolResult = toolResult;
  agent = agent;
  check = check;
  fingerprint = fingerprint;
  pythonObserver = pythonObserver;
  tool = tool;
  subscribe = subscribe;
  snapshot = snapshot;
  notify = notify;
  assertMutable = assertMutable;
  request = request;
  requireActive = requireActive;
  state = state;
  boundary = boundary;
  start = start;
  stop = stop;
  gitJob = gitJob;
  deleteTask = deleteTask;
  setPlan = setPlan;
  execute = execute;
  directory = directory;
  preview = preview;
  shutdown = shutdown;
  readonly ready: Promise<void>;
  active?: Active;
  starting?: string;
  gitOperationTaskId?: string;
  gitDone?: Promise<void>;
  messageAdmission: Promise<unknown> = Promise.resolve();
  readonly listeners = new Set<(update: ExecutionUpdate) => void>();
  disposed = false;
  shutdownUnconfirmed = false;
  readonly unconfirmedRuns = new Set<string>();
  constructor(
    readonly store: LocalStore,
    readonly workspaces: TaskWorkspaces,
    readonly records: RunRecords,
    readonly commands: CommandRunner,
    readonly inference = new Inference(),
    readonly bundledTools?: BundledTools,
    readonly python = new PythonDiscovery(),
  ) {
    this.ready = this.initialize();
  }
}
