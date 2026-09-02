// SillyTavern - Inline Summary Extension - Common

// =========================
// Constants
// =========================

export const kExtensionName = "InlineSummary";

function ResolveExtensionBaseUrl()
{
	try
	{
		return new URL("./", import.meta.url).href;
	}
	catch
	{
		return `scripts/extensions/third-party/${kExtensionName}/`;
	}
}

export const kExtensionBaseUrl = ResolveExtensionBaseUrl();
export const kExtensionFolderPath = kExtensionBaseUrl;
export const kSettingsFile = new URL("settings.html", kExtensionBaseUrl).href;
export const kDefaultsFile = new URL("defaults.json", kExtensionBaseUrl).href;
export const kExtraDataKey = "ILS_Data";
export const kOriginalMessagesKey = "OriginalMessages";
export const kMessageEstimatedTokenCountKey = "EstimatedTokens";

const kILSGlobalKey = Symbol.for("InlineSummary.ILS");

// =========================
// Includes/API/Globals
// =========================

import { amount_gen } from "../../../../script.js";

// =========================
// Globals
// =========================

export function GetILSInstance()
{
	const g = globalThis;

	if (!g[kILSGlobalKey])
		g[kILSGlobalKey] = {};

	return g[kILSGlobalKey];
}

export function IsOperationLockEngaged()
{
	const ilsInstance = GetILSInstance()
	if (ilsInstance.operationLock)
		return true;

	return false;
}

// =========================
// Util
// =========================

export function ShowError(text, exception)
{
	let errText = "[ILS] " + text;
	if (exception)
		errText += "\nError Info:\n" + exception;
	console.error(errText);
	toastr.error(errText);
}

export function ShowWarning(text, exception)
{
	let errText = "[ILS] " + text;
	if (exception)
		errText += "\nWarning Info:\n" + exception;
	console.warn(errText);
	toastr.warning(errText);
}

export function SafeJsonStringify(obj)
{
	try
	{
		return JSON.stringify(obj);
	}
	catch
	{
		return String(obj);
	}
}

export function Sleep(ms)
{
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function Debounce(fn, delay)
{
	let timeout;
	return function (...args)
	{
		clearTimeout(timeout);
		timeout = setTimeout(() => fn.apply(this, args), delay);
	};
}

// =========================
// ST Helpers
// =========================

export function GetMessageByIndex(msgIndex, stContext)
{
	return stContext.chat[msgIndex];
}

export function GetContextSize(stContext)
{
	const apiMode = String(stContext.mainApi ?? "").toLowerCase();
	const cc = stContext.chatCompletionSettings || {};

	let ctxSize = 0;
	let reservedSize = 0;

	if (apiMode === "openai")
	{
		ctxSize = Number(cc.openai_max_context) || Number(stContext.maxContext) || 0;
		reservedSize = Number(cc.openai_max_tokens) || Number(amount_gen) || 0;
	}
	else
	{
		ctxSize = Number(stContext.maxContext) || Number(cc.openai_max_context) || 0;
		reservedSize = Number(amount_gen) || Number(cc.openai_max_tokens) || 0;
	}

	if (!(ctxSize > 0))
	{
		ShowError("Could not read context size for API '" + stContext.mainApi + "'.");
		return [false, 0, 0];
	}

	if (!(reservedSize > 0))
		reservedSize = 0;

	return [true, ctxSize, reservedSize];
}
