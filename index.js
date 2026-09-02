// SillyTavern - Inline Summary Extension

// =========================
// Constants
// =========================
const kMsgBtnColours = {
	default: null,
	selected: "#4CAF50",
	between: "#FFEB3B",
	clearable: "#2196F3",
};

const kDepthColours = [
	"#FF9AA2",
	"#FFB347",
	"#FFF275",
	"#B5E550",
	"#8EE5D8",
	"#89CFF0",
	"#A28CFF",
	"#FFB7CE",
	"#C7FF8F",
];

// =========================
// Includes/API/Globals
// =========================

import { getGeneratingApi, getGeneratingModel, this_chid, system_avatar, default_avatar } from "../../../../script.js";
import { timestampToMoment } from '../../../../scripts/utils.js';
import { getMessageTimeStamp } from '../../../../scripts/RossAscends-mods.js';
import { power_user } from '../../../../scripts/power-user.js';
import { getRegexedString, regex_placement } from "../../../extensions/regex/engine.js";

import
{
	kSettingsFile,
	kExtraDataKey,
	kOriginalMessagesKey,
	kMessageEstimatedTokenCountKey,
	ShowError,
	ShowWarning,
	Sleep,
	SafeJsonStringify,
	GetILSInstance,
	IsOperationLockEngaged,
	GetMessageByIndex
} from './common.js';

import
{
	gSettings,
	LoadSettings,
	UpdateSettingsUI,
	SetupOnSettingChangeEvents
} from './settings.js'

import
{
	MakeSummaryPrompt,
	StartGenerate,
	FinishGenerate,
	CancelGenerate,
} from './generate.js'

// =========================
// Helpers
// =========================
function GetDepthColour(depth)
{
	return kDepthColours[depth % kDepthColours.length];
}

function GetDepthColourWithAlpha(depth, alpha)
{
	const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
	return GetDepthColour(depth) + alphaHex;
}

function MakeSpinner()
{
	const spinner = document.createElement("div");
	spinner.className = "ils_loading_spinner";
	spinner.innerHTML = '<i class="fa-solid fa-spinner"></i>';

	return spinner;
}

async function SaveAndReloadChat(stContext, errorMsg = null)
{
	try
	{
		await stContext.saveChat();
		await stContext.reloadCurrentChat();
	}
	catch (e)
	{
		if (errorMsg)
			ShowError(errorMsg);

		return false;
	}

	return true;
}

// =========================
// Selection Helpers
// =========================
function GetSelection(stContext)
{
	if (!stContext.chatMetadata.ils_selection)
		stContext.chatMetadata.ils_selection = { start: null, end: null };
	return stContext.chatMetadata.ils_selection;
}

function ClearSelection(stContext, refresh = true)
{
	stContext.chatMetadata.ils_selection = { start: null, end: null };
	if (refresh)
		RefreshAllMessageButtons();
}

function IsMsgInRange(msgIndex, selection)
{
	return selection.start !== null
		&& selection.end !== null
		&& msgIndex >= selection.start
		&& msgIndex <= selection.end;
}

function IsValidRangeSelection(selection)
{
	return selection.start !== null
		&& selection.end !== null
		&& (selection.end - selection.start) >= 1;
}

// =========================
// Legacy Functions
// =========================

function HasLegacyOriginalMessages(msgObject)
{
	return msgObject && msgObject.extra && msgObject.extra[kExtraDataKey] && Array.isArray(msgObject.extra[kExtraDataKey][kOriginalMessagesKey]);
}

function RecoverOldData(msgObject)
{
	if (HasLegacyOriginalMessages(msgObject))
	{
		msgObject[kExtraDataKey] = msgObject.extra[kExtraDataKey];
		delete msgObject.extra[kExtraDataKey];

		for (const swipe of msgObject.swipe_info)
		{
			delete swipe.extra[kExtraDataKey];
		}

		const originalMessges = msgObject[kExtraDataKey][kOriginalMessagesKey] ?? null;
		if (originalMessges)
		{
			for (let msg of originalMessges)
			{
				RecoverOldData(msg);
			}
		}

		return true;
	}

	return false;
}

// =========================
// Chat Message Functions
// =========================

function HasOriginalMessages(msgObject)
{
	return msgObject && msgObject[kExtraDataKey] && Array.isArray(msgObject[kExtraDataKey][kOriginalMessagesKey]);
}

function GetIlsData(msgObject)
{
	if (!msgObject)
		return null;
	if (msgObject[kExtraDataKey])
		return msgObject[kExtraDataKey];
	if (msgObject.extra && msgObject.extra[kExtraDataKey])
		return msgObject.extra[kExtraDataKey];
	return null;
}

function GetOriginalMessagesTokenCache(msgObject)
{
	const cache = GetIlsData(msgObject)?.[kMessageEstimatedTokenCountKey];
	return Array.isArray(cache) ? cache : null;
}

function EnsureMessageExtra(msgObject)
{
	if (!msgObject)
		return {};

	msgObject.extra ??= {};
	return msgObject.extra;
}

function WriteExtraTokenCount(msgObject, tokenCount)
{
	if (!msgObject)
		return;

	const extra = EnsureMessageExtra(msgObject);
	extra.token_count = tokenCount;

	// ST may rehydrate extra from swipe_info on reload; keep both in sync
	const swipeId = Number.isInteger(msgObject.swipe_id) ? msgObject.swipe_id : 0;
	if (Array.isArray(msgObject.swipe_info) && msgObject.swipe_info[swipeId])
	{
		msgObject.swipe_info[swipeId].extra ??= {};
		msgObject.swipe_info[swipeId].extra.token_count = tokenCount;
	}
}

async function EnsureMessageTokenCount(msgObject, stContext)
{
	if (!msgObject || !stContext)
		return 0;

	const existing = Number(msgObject.extra?.token_count);
	if (Number.isFinite(existing) && existing > 0)
	{
		WriteExtraTokenCount(msgObject, existing);
		return existing;
	}

	const tokenText = String(msgObject.extra?.reasoning || "") + String(msgObject.mes || "");
	const tokenCount = await stContext.getTokenCountAsync(tokenText);
	WriteExtraTokenCount(msgObject, tokenCount);
	return tokenCount;
}

function ApplyTokenCountToMessageDom(messageDiv, tokenCount)
{
	if (!messageDiv || !tokenCount)
		return;

	const tokenEl = messageDiv.querySelector(".tokenCounterDisplay");
	if (tokenEl)
		tokenEl.textContent = `${tokenCount}t`;
}

function RestoreOriginalsInPlace(stContext, msgIndex)
{
	const summaryMsg = GetMessageByIndex(msgIndex, stContext);
	if (!HasOriginalMessages(summaryMsg))
		return false;

	const originals = summaryMsg[kExtraDataKey][kOriginalMessagesKey];
	stContext.chat.splice(msgIndex + 1, 0, ...originals);
	stContext.chat.splice(msgIndex, 1);
	return true;
}

function FindLastSummaryIndex(stContext)
{
	for (let i = stContext.chat.length - 1; i >= 0; --i)
	{
		if (HasOriginalMessages(stContext.chat[i]))
			return i;
	}
	return -1;
}

async function RestoreSummaries(count, { save = true, reload = true } = {})
{
	const stContext = SillyTavern.getContext();
	const ilsInstance = GetILSInstance();
	if (ilsInstance.operationLock)
		return 0;

	const limit = count === Infinity ? Number.POSITIVE_INFINITY : Math.max(0, Number(count) || 0);
	if (limit === 0)
		return 0;

	ilsInstance.operationLock = true;
	stContext.deactivateSendButtons();

	let restored = 0;
	try
	{
		while (restored < limit)
		{
			const lastSummary = FindLastSummaryIndex(stContext);
			if (lastSummary < 0)
				break;

			await stContext.eventSource.emit("ILS_RestoreOriginalsBegin", { msgIndex: lastSummary });
			if (!RestoreOriginalsInPlace(stContext, lastSummary))
				break;
			restored++;
			await stContext.eventSource.emit("ILS_RestoreOriginalsEnd", { msgIndex: lastSummary });
		}

		ClearSelection(stContext, restored === 0);

		if (restored > 0 && save)
		{
			if (reload)
				await SaveAndReloadChat(stContext, "Failed to Save and Reload chat. Failed to Restore messages. Refreshing the page is recommended.");
			else
				await stContext.saveChat();
		}
	}
	finally
	{
		stContext.activateSendButtons();
		ilsInstance.operationLock = false;
	}

	return restored;
}

async function FlattenCurrentChatForUninstall(reason)
{
	try
	{
		const stContext = SillyTavern.getContext();
		if (!Array.isArray(stContext.chat) || FindLastSummaryIndex(stContext) < 0)
			return 0;

		const restored = await RestoreSummaries(Infinity, { save: true, reload: false });
		if (restored > 0)
		{
			toastr.warning("[ILS] Restored originals from " + restored + " summaries in the current chat before extension " + reason + ". Other chats still contain summaries — open each one and run /ils-restore all if needed.");
		}
		return restored;
	}
	catch (e)
	{
		console.error("[ILS] Failed to flatten chat on " + reason, e);
		return 0;
	}
}

export async function onDelete()
{
	await FlattenCurrentChatForUninstall("delete");
}

export async function onClean()
{
	await FlattenCurrentChatForUninstall("clean");
}

async function CreateEmptySummaryMessage(originalMessages, stContext)
{
	const summary = {
		is_user: false,
		is_system: false,
		mes: "Generating...",
		extra: {}
	};

	switch (gSettings.summaryNameMode)
	{
		case "user":
			summary.name = stContext.name1;
			summary.is_user = true;
			break;
		case "character":
			summary.name = stContext.name2;
			break;
		case "custom":
		default:
			summary.name = gSettings.summaryName;
			break;
	}

	// Store original messages
	summary[kExtraDataKey] = {};
	summary[kExtraDataKey][kOriginalMessagesKey] = originalMessages;
	summary[kExtraDataKey][kMessageEstimatedTokenCountKey] = await Promise.all(originalMessages.map(item => stContext.getTokenCountAsync(item.mes)));

	EnsureMessageExtra(summary);
	WriteExtraTokenCount(summary, await stContext.getTokenCountAsync(summary.mes));

	return summary;
}

async function BringIntoView(msgIndex)
{
	if (!gSettings.autoScroll)
		return;

	// Still need sleep since 'chat-scrollto' is not 100% reliable
	await Sleep(100);

	const stContext = SillyTavern.getContext();
	await stContext.executeSlashCommandsWithOptions(`/chat-scrollto ${msgIndex}`);
}

// =========================
// Generation Functions
// =========================

async function SwapToSummaryProfile(stContext, ilsInstance)
{
	const apiMode = stContext.mainApi?.toLowerCase();
	const presetName = gSettings?.apiPresets?.[apiMode] ?? "";

	let useDifferentProfile = gSettings.useDifferentProfile && gSettings.profileName !== "" && gSettings.profileName !== "<None>" && ilsInstance.connProfEnabled;
	let useDifferentApiPreset = gSettings.useDifferentApiPreset && presetName !== "" && ilsInstance.connProfEnabled;

	let success = true;

	let prevProfile = "";
	let prevPreset = "";
	if (useDifferentProfile)
	{
		prevProfile = (await stContext.executeSlashCommandsWithOptions("/profile")).pipe;

		const swapResult = await stContext.executeSlashCommandsWithOptions("/profile " + gSettings.profileName);
		stContext = SillyTavern.getContext(); // Update context just in case
		if (swapResult.isError)
		{
			ShowError("Failed to swap connection profile to:\n" + gSettings.profileName + "\nGeneration Aborted.");
			success = false;
		}
	}

	if (useDifferentApiPreset && success)
	{
		const presetManager = stContext.getPresetManager();
		prevPreset = presetManager.getSelectedPresetName();

		const swapResult = await stContext.executeSlashCommandsWithOptions("/preset " + presetName);
		stContext = SillyTavern.getContext(); // Update context just in case
		if (swapResult.isError)
		{
			ShowError("Failed to swap API Preset " + apiMode + " to:\n" + presetName + "\nGeneration Aborted.");
			success = false;
		}
	}

	return { success, useDifferentProfile, prevProfile, useDifferentApiPreset, prevPreset };
}

async function SwapBackFromSummaryProfile(stContext, profileSwap)
{
	if (profileSwap.useDifferentProfile)
	{
		const swapResult = await stContext.executeSlashCommandsWithOptions("/profile " + profileSwap.prevProfile);
		if (swapResult.isError)
		{
			ShowError("Failed to restore connection profile to:\n" + profileSwap.prevProfile + "\nPlease check the profile manually.");
		}
	}

	if (profileSwap.useDifferentApiPreset)
	{
		const swapResult = await stContext.executeSlashCommandsWithOptions("/preset " + profileSwap.prevPreset);
		if (swapResult.isError)
		{
			ShowError("Failed to restore preset to:\n" + profileSwap.prevPreset + "\nPlease check the preset manually.");
		}
	}
}

async function PopulateSummaryMessage(stContext, summaryMsg, msgText, msgReasoning)
{
	const ilsInstance = GetILSInstance();
	const runRegex = (ilsInstance.regexEnabled && gSettings.regexPostGenerate);

	const extra = EnsureMessageExtra(summaryMsg);

	if (msgText != null)
		summaryMsg.mes = runRegex ? getRegexedString(msgText, regex_placement.AI_OUTPUT, { isPrompt: false, isEdit: true, depth: 0 }) : msgText;

	if (msgReasoning != null)
		extra.reasoning = runRegex ? getRegexedString(msgReasoning, regex_placement.REASONING, { isPrompt: false, isEdit: true, depth: 0 }) : msgReasoning;

	summaryMsg.send_date = getMessageTimeStamp();
	extra.api = getGeneratingApi();
	extra.model = getGeneratingModel();

	const tokenText = String(extra.reasoning || "") + String(summaryMsg.mes || "");
	WriteExtraTokenCount(summaryMsg, await stContext.getTokenCountAsync(tokenText));
}

function HideGeneratingToast()
{
	const ilsInstance = GetILSInstance();
	if (ilsInstance.generatingToast)
	{
		try { toastr.clear(ilsInstance.generatingToast); }
		catch { /* ignore */ }
		ilsInstance.generatingToast = null;
	}
}

function ShowGeneratingToast()
{
	HideGeneratingToast();
	const ilsInstance = GetILSInstance();
	ilsInstance.generatingToast = toastr.info(
		"Generating summary… Click this toast or press Stop to cancel.",
		"[ILS]",
		{
			timeOut: 0,
			extendedTimeOut: 0,
			tapToDismiss: false,
			closeButton: true,
			onclick: () => CancelGenerate(),
		}
	);
}

async function GenerateSummaryAI()
{
	let stContext = SillyTavern.getContext();
	const selection = GetSelection(stContext);
	if (!IsValidRangeSelection(selection))
		return false;

	const ilsInstance = GetILSInstance()
	if (ilsInstance.operationLock)
		return false;

	ilsInstance.operationLock = true;
	stContext.deactivateSendButtons();

	let profileSwap = { success: false, useDifferentProfile: false, useDifferentApiPreset: false };
	let inserted = false;

	try
	{
		profileSwap = await SwapToSummaryProfile(stContext, ilsInstance);
		if (!profileSwap.success)
			return false;

		const originalMessages = stContext.chat.slice(selection.start, selection.end + 1);
		const { promptOk, promptMsg, promptError } = await MakeSummaryPrompt(selection.start, stContext.chat.length - (selection.end + 1), originalMessages, stContext, gSettings);

		if (!promptOk)
		{
			ShowError("Failed to make summary prompt.\n" + promptError);
			return false;
		}

		ShowGeneratingToast();
		const genStart = await StartGenerate(stContext, promptMsg, gSettings.tokenLimit);
		const genResponse = await FinishGenerate(stContext, genStart);
		HideGeneratingToast();

		if (genResponse.cancelled || ilsInstance.cancelRequested)
		{
			toastr.info("[ILS] Summary cancelled. Chat was not changed.");
			return false;
		}

		if (!genResponse.isOk)
		{
			ShowError("Summary generation failed. Original messages were left in place.");
			return false;
		}

		const newSummaryMsg = await CreateEmptySummaryMessage(originalMessages, stContext);
		await PopulateSummaryMessage(stContext, newSummaryMsg, genResponse.mainMsg, genResponse.reasoning);

		stContext.chat.splice(selection.start, originalMessages.length);
		stContext.chat.splice(selection.start, 0, newSummaryMsg);
		inserted = true;

		await stContext.eventSource.emit("ILS_SummaryAdded", { msgIndex: selection.start, originalMessages: originalMessages, isManual: false, isRegenerate: false });
		ClearSelection(stContext, false);

		const chatReload = await SaveAndReloadChat(stContext, "Failed to Save and Reload chat. Summary could not be saved. Refreshing the page is recommended.");
		if (!chatReload)
		{
			try { RestoreOriginalsInPlace(SillyTavern.getContext(), selection.start); }
			catch (e) { ShowError("Failed to roll back original messages after a save error.", e); }
			return false;
		}

		BringIntoView(selection.start);
		return true;
	}
	finally
	{
		HideGeneratingToast();
		await SwapBackFromSummaryProfile(SillyTavern.getContext(), profileSwap);
		SillyTavern.getContext().activateSendButtons();
		ilsInstance.operationLock = false;
		ilsInstance.abortCtrl = null;
		ilsInstance.cancelRequested = false;
		void inserted;
	}
}

async function GenerateSummaryManual()
{
	const stContext = SillyTavern.getContext();
	const selection = GetSelection(stContext);
	if (!IsValidRangeSelection(selection))
		return false;

	const ilsInstance = GetILSInstance();
	if (ilsInstance.operationLock)
		return false;

	ilsInstance.operationLock = true;

	// Prepare original messages and prompt
	const originalMessages = stContext.chat.slice(selection.start, selection.end + 1);

	const newSummaryMsg = await CreateEmptySummaryMessage(originalMessages, stContext);
	newSummaryMsg.mes = "_Manual Summary_\n_Edit and replace this message with a summary_";
	newSummaryMsg.send_date = getMessageTimeStamp();
	const extra = EnsureMessageExtra(newSummaryMsg);
	extra.api = "custom";
	extra.model = "Inline Summary Extension - Manual Summary";
	WriteExtraTokenCount(newSummaryMsg, await stContext.getTokenCountAsync(newSummaryMsg.mes));

	// Delete Originals
	stContext.chat.splice(selection.start, originalMessages.length);
	// Add Summary
	stContext.chat.splice(selection.start, 0, newSummaryMsg);

	await stContext.eventSource.emit("ILS_SummaryAdded", { msgIndex: selection.start, originalMessages: originalMessages, isManual: true, isRegenerate: false });

	ClearSelection(stContext, false);

	const chatReload = await SaveAndReloadChat(stContext, "Failed to Save and Reload chat. Summary could not be saved. Refreshing the page is recommended.");

	if (chatReload)
		BringIntoView(selection.start);
	ilsInstance.operationLock = false;

	return chatReload;
}

async function RegenerateSummary(msgIndex)
{
	let stContext = SillyTavern.getContext();

	const summaryMsg = GetMessageByIndex(msgIndex, stContext);
	if (!HasOriginalMessages(summaryMsg))
		return;

	const ilsInstance = GetILSInstance()
	if (ilsInstance.operationLock)
		return;

	ilsInstance.operationLock = true;
	stContext.deactivateSendButtons();

	let profileSwap = { success: false, useDifferentProfile: false, useDifferentApiPreset: false };

	try
	{
		profileSwap = await SwapToSummaryProfile(stContext, ilsInstance);
		if (!profileSwap.success)
			return;

		const originalMessages = summaryMsg[kExtraDataKey][kOriginalMessagesKey];
		const { promptOk, promptMsg, promptError } = await MakeSummaryPrompt(msgIndex, stContext.chat.length - (msgIndex + 1), originalMessages, stContext, gSettings);

		if (!promptOk)
		{
			ShowError("Failed to make summary prompt.\n" + promptError);
			return;
		}

		ShowGeneratingToast();
		const genStart = await StartGenerate(stContext, promptMsg, gSettings.tokenLimit);
		const genResponse = await FinishGenerate(stContext, genStart);
		HideGeneratingToast();

		if (genResponse.cancelled || ilsInstance.cancelRequested)
		{
			toastr.info("[ILS] Re-summarise cancelled. Existing summary was kept.");
			return;
		}

		if (!genResponse.isOk)
		{
			ShowError("Re-summarise failed. Existing summary was kept.");
			return;
		}

		summaryMsg[kExtraDataKey][kMessageEstimatedTokenCountKey] = await Promise.all(originalMessages.map(item => stContext.getTokenCountAsync(item.mes)));
		await PopulateSummaryMessage(stContext, summaryMsg, genResponse.mainMsg, genResponse.reasoning);
		ApplyTokenCountToMessageDom(
			document.querySelector(`.mes[mesid="${msgIndex}"]`),
			summaryMsg?.extra?.token_count);

		await stContext.eventSource.emit("ILS_SummaryAdded", { msgIndex: msgIndex, originalMessages: originalMessages, isManual: false, isRegenerate: true });
		await SaveAndReloadChat(stContext, "Failed to Save and Reload chat. New Summary could not be saved. Refreshing the page is recommended.");
		BringIntoView(msgIndex);
	}
	finally
	{
		HideGeneratingToast();
		await SwapBackFromSummaryProfile(SillyTavern.getContext(), profileSwap);
		SillyTavern.getContext().activateSendButtons();
		ilsInstance.operationLock = false;
		ilsInstance.abortCtrl = null;
		ilsInstance.cancelRequested = false;
	}
}

// =========================
// Message Action Buttons
// =========================
const kMsgActionButtons = [
	// Select Message Range End
	{
		className: "ils_msg_btn_selectEnd",
		icon: "fa-arrow-right-to-bracket",
		title: "Select Summary End",

		async OnClick(msgIndex)
		{
			if (IsOperationLockEngaged())
				return;

			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			selection.end = msgIndex;
			RefreshAllMessageButtons();

			await stContext.eventSource.emit("ILS_EndMsgSelected", { msgIndex });
		},

		GetColor(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			if (selection.end === null)
				return kMsgBtnColours.default;
			if (msgIndex === selection.end)
				return kMsgBtnColours.selected;
			if (IsMsgInRange(msgIndex, selection))
				return kMsgBtnColours.between;
			return kMsgBtnColours.default;
		}
	},
	// Select Message Range Start
	{
		className: "ils_msg_btn_selectStart",
		icon: "fa-arrow-right-from-bracket",
		title: "Select Summary Start",

		async OnClick(msgIndex)
		{
			if (IsOperationLockEngaged())
				return;

			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			selection.start = msgIndex;
			RefreshAllMessageButtons();

			await stContext.eventSource.emit("ILS_StartMsgSelected", { msgIndex });
		},

		GetColor(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			if (selection.start === null)
				return kMsgBtnColours.default;
			if (msgIndex === selection.start)
				return kMsgBtnColours.selected;
			if (IsMsgInRange(msgIndex, selection))
				return kMsgBtnColours.between;
			return kMsgBtnColours.default;
		}
	},
	// Clear Selection
	{
		className: "ils_msg_btn_clearSel",
		icon: "fa-broom",
		title: "Clear Selection",

		ShowCondition(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			return IsMsgInRange(msgIndex, selection) || selection.start === msgIndex || selection.end === msgIndex;
		},

		async OnClick(msgIndex)
		{
			if (IsOperationLockEngaged())
				return;

			const stContext = SillyTavern.getContext();
			ClearSelection(stContext);

			await stContext.eventSource.emit("ILS_SelectionCleared", {});
		},

		GetColor(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			const canClear = selection.start !== null || selection.end !== null;
			return canClear ? kMsgBtnColours.clearable : kMsgBtnColours.default;
		}
	},
	// Summarise Selected Range - LLM
	{
		className: "ils_msg_btn_summarise",
		icon: "fa-robot",
		title: "Summarise (AI)",

		ShowCondition(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			return IsMsgInRange(msgIndex, selection);
		},

		async OnClick(msgIndex)
		{
			await GenerateSummaryAI();
		},

		GetColor(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			const valid = selection.start !== null && selection.end !== null && selection.end > selection.start;
			return valid ? kMsgBtnColours.selected : kMsgBtnColours.default;
		}
	},
	// Summarise Selected Range - Manual
	{
		className: "ils_msg_btn_summarise_manual",
		icon: "fa-user-tag",
		title: "Summarise (Manual)",

		ShowCondition(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			return IsMsgInRange(msgIndex, selection);
		},

		async OnClick(msgIndex)
		{
			await GenerateSummaryManual();
		},

		GetColor(msgIndex)
		{
			const stContext = SillyTavern.getContext();
			const selection = GetSelection(stContext);
			const valid = selection.start !== null && selection.end !== null && selection.end > selection.start;
			return valid ? kMsgBtnColours.selected : kMsgBtnColours.default;
		}
	},
];

// =========================
// Header Buttons
// =========================
const kHeaderButtons = [
	// Restore Original Messages
	{
		className: "ils_hrd_btn_restore",
		icon: "fa-file-arrow-up",
		title: "Restore Original and Delete Summary",

		async OnClick(msgIndex)
		{
			const ilsInstance = GetILSInstance()
			if (ilsInstance.operationLock)
				return;

			const stContext = SillyTavern.getContext();

			ilsInstance.operationLock = true;
			stContext.deactivateSendButtons();

			await stContext.eventSource.emit("ILS_RestoreOriginalsBegin", { msgIndex });

			const summaryMsg = GetMessageByIndex(msgIndex, stContext);

			// Technically this being false should be an error, since we shouldn't be able to click restore
			// on a message that doesn't have Original Messages.
			RestoreOriginalsInPlace(stContext, msgIndex);

			ClearSelection(stContext, false);

			await stContext.eventSource.emit("ILS_RestoreOriginalsEnd", { msgIndex });

			await SaveAndReloadChat(stContext, "Failed to Save and Reload chat. Original Messages could not be restored. Refreshing the page is recommended.");

			stContext.activateSendButtons();
			ilsInstance.operationLock = false;

			BringIntoView(msgIndex);
		}
	},
	// Regenerate
	{
		className: "ils_hdr_btn_regenerate",
		icon: "fa-robot",
		title: "Re-Summarise (AI)",

		async OnClick(msgIndex)
		{
			await RegenerateSummary(msgIndex);
		}
	},
];

// =========================
// Message Action Button Rendering
// =========================
function RefreshAllMessageButtons()
{
	document.querySelectorAll(".mes").forEach(node =>
	{
		const msgId = Number(node.getAttribute("mesid"));
		if (!isNaN(msgId))
			RefreshMessageElements(node, msgId);
	});
}

function RefreshMessageElements(messageDiv, msgIndex)
{
	const stContext = SillyTavern.getContext();

	const msgObject = GetMessageByIndex(msgIndex, stContext);
	if (!msgObject)
		return;

	kMsgActionButtons.forEach(def =>
	{
		const msgButton = messageDiv.querySelector("." + def.className);
		if (msgButton)
		{
			msgButton.style.display = (def.ShowCondition && !def.ShowCondition(msgIndex)) ? "none" : null;
			msgButton.style.color = def.GetColor ? def.GetColor(msgIndex) : kMsgBtnColours.default;
		}
	});

	if (HasOriginalMessages(msgObject) && power_user.message_token_count_enabled)
	{
		const tokenCount = Number(msgObject.extra?.token_count);
		if (Number.isFinite(tokenCount) && tokenCount > 0)
			ApplyTokenCountToMessageDom(messageDiv, tokenCount);
	}

	const existingOrigMsgDiv = messageDiv.querySelector(".ils_original_messages_root");
	if (HasOriginalMessages(msgObject))
	{
		if (existingOrigMsgDiv)
		{
			// This is a strange one, for some reason we can end up with a div with a wrong `mesid`
			// And just deleting the existing one seems fine too as the refresh is actually called twice
			// I'm guessing one call might be manual, the other caused by the observer?

			// In any case, I think chat refresh may not destroy all ofthe chat message html elements
			// so some retain the original message blocks

			// We do a few sanity checks and delete the blocks if they're invalid

			// Ensure the correct ID
			if (existingOrigMsgDiv.getAttribute("mesid") != msgIndex)
			{
				existingOrigMsgDiv.remove();
				return;
			}

			// Ensure correct message count
			const containerElement = messageDiv.querySelector(".ils_messages_container_root");
			if (containerElement)
			{
				if (containerElement.getAttribute("msgCount") != msgObject[kExtraDataKey][kOriginalMessagesKey].length)
				{
					existingOrigMsgDiv.remove();
					return;
				}
			}
		}
		else
		{
			const newOrigMsgDiv = document.createElement("div");
			newOrigMsgDiv.className = "ils_original_messages_root";
			newOrigMsgDiv.setAttribute("mesid", msgIndex);

			newOrigMsgDiv.appendChild(CreateOriginalMessagesContainer(msgIndex, msgObject));

			messageDiv.querySelector(".mes_block")?.appendChild(newOrigMsgDiv);
		}

		// Remove swipe button on Summaries as swiping on a summary would likely break stuff
		/* Revert for now, apparently causes issues on mobile?
		const swipeButton = messageDiv.querySelector(".swipeRightBlock");
		if (swipeButton)
			swipeButton.remove();
		*/
	}
	else if (existingOrigMsgDiv)
	{
		existingOrigMsgDiv.remove();
	}
}

// =========================
// Original Message Display Handling
// =========================
function GetMessageFromPath(path, stContext)
{
	if (!Array.isArray(path) || path.length === 0)
		return null;

	const [msgIndex, ...subpath] = path;

	let msg = GetMessageByIndex(msgIndex, stContext);
	if (!msg || !HasOriginalMessages(msg))
		return null;

	for (const index of subpath)
	{
		if (!HasOriginalMessages(msg))
			return null;

		msg = msg[kExtraDataKey][kOriginalMessagesKey][index];
		if (!msg)
			return null;
	}

	return msg;
}

function CreateOriginalMessagesContainer(msgIndex, msgObject, depth = 0, path = [])
{
	const originals = (msgObject[kExtraDataKey] && Array.isArray(msgObject[kExtraDataKey][kOriginalMessagesKey]))
		? msgObject[kExtraDataKey][kOriginalMessagesKey]
		: [];

	const containerRoot = document.createElement("div");
	containerRoot.setAttribute("msgCount", originals.length);
	containerRoot.className = "ils_messages_container_root";
	containerRoot.style.borderLeft = `2px solid ${GetDepthColour(depth)}`;
	containerRoot.style.paddingLeft = "2px";

	// Header (flex with label on left and expand icon on right)
	const containerHeader = document.createElement("div");
	containerHeader.className = "ils_msg_container_header";
	containerHeader.setAttribute("ils-msg-depth", depth);
	containerHeader.setAttribute("ils-msg-index", msgIndex);
	containerHeader.setAttribute("ils-msg-path", JSON.stringify([...path, msgIndex]));
	containerHeader.style.background = `linear-gradient(90deg, ${GetDepthColourWithAlpha(depth, 0.3)}, transparent)`;
	containerHeader.style.border = `1px solid ${GetDepthColourWithAlpha(depth, 0.18)}`;

	const buttonsDiv = document.createElement("div");
	if (depth === 0)
	{
		kHeaderButtons.forEach(def =>
		{
			const btn = document.createElement("div");
			btn.className = `mes_button fa-solid ${def.icon} interactable ${def.className}`;
			btn.setAttribute("mesid", msgIndex);
			btn.title = def.title;
			btn.tabIndex = 0;

			buttonsDiv.appendChild(btn);
		});
	}
	containerHeader.appendChild(buttonsDiv);

	const headerLabel = document.createElement("div");
	let origTokens = 0;
	let visMsg = 0;
	for (let i = 0; i < originals.length; ++i)
	{
		const msg = originals[i];

		if (msg?.is_system)
			continue;

		visMsg++;

		const tokenCache = GetOriginalMessagesTokenCache(msgObject);
		const cachedTokenCount = tokenCache ? tokenCache[i] : null;
		// token_count does include reasoning, which we do not summarise, so only use it on chats where we do our own maths.
		origTokens += Number((cachedTokenCount == null) ? (msg?.extra?.token_count ?? 0) : cachedTokenCount) || 0;
	}
	headerLabel.textContent = `Original Messages: ${visMsg}/${originals.length} used | ~${origTokens} tokens`;

	const expandIcon = document.createElement("div");
	expandIcon.className = "ils_expand_icon mes_button fa-solid fa-caret-right";

	containerHeader.appendChild(headerLabel);
	containerHeader.appendChild(expandIcon);

	// Contents - Empty by default, filled in when expanding
	const containerContents = document.createElement("div");
	containerContents.className = "ils_msg_container_contents";
	containerContents.setAttribute("ils-msg-depth", depth);

	// Add to root
	containerRoot.appendChild(containerHeader);
	containerRoot.appendChild(containerContents);

	return containerRoot;
}
function OrigMsgHeaderSeparator(depth)
{
	const sep = document.createElement("div");
	sep.className = "ils_separator";
	sep.style.background = `${GetDepthColourWithAlpha(depth, 0.22)}`;
	return sep;
}

function CreateOriginalMessageBody(msgIndex, msgObject, stContext, depth = 0, path = [])
{
	// Main Element
	const messageRoot = document.createElement("div");
	messageRoot.className = "ils_original_message";
	messageRoot.style.border = `1px solid ${GetDepthColourWithAlpha(depth, 0.22)}`;

	// Header
	const headerRow = document.createElement("div");
	headerRow.className = "ils_original_message_header flex-container";
	messageRoot.appendChild(headerRow);

	// Avatar Image
	if (!power_user.hideChatAvatars_enabled)
	{
		const avatarImg = document.createElement("img");
		avatarImg.className = "ils_avi_img";
		if (!msgObject.is_user)
		{
			if (msgObject.force_avatar)
				avatarImg.src = msgObject.force_avatar;
			else if (this_chid === undefined)
				avatarImg.src = system_avatar;
			else if (stContext.characters[this_chid] && stContext.characters[this_chid].avatar !== 'none')
				avatarImg.src = stContext.getThumbnailUrl('avatar', stContext.characters[this_chid].avatar);
			else
				avatarImg.src = default_avatar;
		}
		else if (msgObject.is_user && msgObject.force_avatar)
		{
			avatarImg.src = msgObject.force_avatar;
		}
		headerRow.appendChild(avatarImg);

		headerRow.appendChild(OrigMsgHeaderSeparator(depth));
	}

	// Message Index
	const msgIndexElem = document.createElement("div");
	msgIndexElem.className = "mesIDDisplay";
	msgIndexElem.textContent = `#${msgIndex}`;
	headerRow.appendChild(msgIndexElem);

	headerRow.appendChild(OrigMsgHeaderSeparator(depth));

	// Characetr Name
	const nameSpan = document.createElement("span");
	nameSpan.className = "name_text";
	nameSpan.textContent = msgObject.name || "Unknown";
	headerRow.appendChild(nameSpan);

	headerRow.appendChild(OrigMsgHeaderSeparator(depth));

	// Token Counter
	if (power_user.message_token_count_enabled)
	{
		const tokenDisp = document.createElement("div");
		tokenDisp.className = "tokenCounterDisplay";
		tokenDisp.textContent = (msgObject.extra?.token_count ?? "--") + "t";
		headerRow.appendChild(tokenDisp);

		headerRow.appendChild(OrigMsgHeaderSeparator(depth));
	}

	// Timestamp
	if (power_user.timestamps_enabled)
	{
		const timestamp = document.createElement("div");
		timestamp.className = "timestamp";
		const momentDate = timestampToMoment(msgObject.send_date);
		timestamp.textContent = momentDate.isValid() ? momentDate.format('LL LT') : '';
		headerRow.appendChild(timestamp);

		headerRow.appendChild(OrigMsgHeaderSeparator(depth));
	}

	// Messae Contents
	const contentDiv = document.createElement("div");
	contentDiv.className = "ils_mes_text";
	messageRoot.appendChild(contentDiv);

	// Check if there are images
	if (Array.isArray(msgObject.extra?.media) && msgObject.extra.media.length > 0)
	{
		const mediaArray = msgObject.extra.media;
		const requestedIndex = Number.isInteger(msgObject.extra.media_index) ? msgObject.extra.media_index : 0;
		const safeIndex = (requestedIndex >= 0 && requestedIndex < mediaArray.length) ? requestedIndex : 0;

		const mediaItem = mediaArray[safeIndex];
		if (mediaItem?.url)
		{
			const imgElem = document.createElement("img");
			imgElem.className = "ils_mes_img";
			imgElem.src = mediaItem.url;
			contentDiv.appendChild(imgElem);
		}
	}
	else
	{
		contentDiv.innerHTML = stContext.messageFormatting(msgObject.mes || "(empty message)", msgObject.name || "Unknown", msgObject.is_system, msgObject.is_user, 0);
	}

	// Add any child messages
	if (HasOriginalMessages(msgObject))
	{
		messageRoot.appendChild(CreateOriginalMessagesContainer(msgIndex, msgObject, depth + 1, path));
	}

	return messageRoot;
}

function HandleMessagesHeaderClick(containerHeaderDiv)
{
	const stContext = SillyTavern.getContext();

	const msgDepth = Number(containerHeaderDiv.getAttribute("ils-msg-depth"));
	const msgIndex = Number(containerHeaderDiv.getAttribute("ils-msg-index"));
	const pathStr = containerHeaderDiv.getAttribute("ils-msg-path");

	if (isNaN(msgDepth) || isNaN(msgIndex))
		return;

	const containerContents = containerHeaderDiv.parentElement.querySelector(".ils_msg_container_contents");
	if (!containerContents)
		return;

	const expandIcon = containerHeaderDiv.querySelector('.ils_expand_icon');

	if (containerContents.childNodes.length === 0)
	{
		let path;
		try
		{
			path = JSON.parse(pathStr);
		}
		catch (e)
		{
			console.error("[ILS] Failed to parse message path:", e);
			return;
		}

		const msgObject = GetMessageFromPath(path, stContext);
		if (!msgObject)
			return;

		const messages = (msgObject[kExtraDataKey] && Array.isArray(msgObject[kExtraDataKey][kOriginalMessagesKey]))
			? msgObject[kExtraDataKey][kOriginalMessagesKey]
			: [];

		messages.forEach((orgiMsg, origIndex) =>
		{
			const origMsgBody = CreateOriginalMessageBody(origIndex, orgiMsg, stContext, msgDepth + 1, path);
			if (origMsgBody)
				containerContents.appendChild(origMsgBody);
		});

		if (expandIcon)
			expandIcon.className = "ils_expand_icon mes_button fa-solid fa-caret-down";
	}
	else
	{
		containerContents.innerHTML = "";
		if (expandIcon)
			expandIcon.className = "ils_expand_icon mes_button fa-solid fa-caret-right";
	}
}

// =========================
// Event Handlers
// =========================
function MainClickHandler(e)
{
	// Header Buttons
	for (const def of kHeaderButtons)
	{
		const btn = e.target.closest("." + def.className);
		if (btn)
		{
			const msgIndex = Number(btn.getAttribute("mesid"));
			if (!isNaN(msgIndex))
			{
				def.OnClick(msgIndex);
				return;
			}
		}
	}

	// Header Click
	const containerHeaderDiv = e.target.closest(".ils_msg_container_header");
	if (containerHeaderDiv)
	{
		HandleMessagesHeaderClick(containerHeaderDiv);
		return;
	}

	// Message Action Buttons
	const btn = e.target.closest(".mes_button");
	if (!btn)
		return;

	const messageDiv = e.target.closest(".mes");
	if (!messageDiv)
		return;

	const messageId = Number(messageDiv.getAttribute("mesid"));
	if (isNaN(messageId))
		return;

	for (const def of kMsgActionButtons)
	{
		if (btn.classList.contains(def.className))
		{
			def.OnClick(messageId);
			break;
		}
	}
}

async function OnChatChanged(data)
{
	const stContext = SillyTavern.getContext();

	ClearSelection(stContext);

	// Legacy Recovery
	if (gSettings.doLegacyRecovery)
	{
		let didRecover = false;
		for (const msg of stContext.chat)
		{
			if (RecoverOldData(msg))
				didRecover = true;
		}

		if (didRecover)
		{
			ShowWarning("Legacy chat summaries have been recovered.");
			await SaveAndReloadChat(stContext, "Failed to Save and Reload chat while recovering legacy summaries... Well, that's less than ideal.");
		}
	}

	// Backfill missing token counts on summary messages so ST can render "Nt"
	if (power_user.message_token_count_enabled)
	{
		let didCount = false;
		for (const msg of stContext.chat)
		{
			if (!HasOriginalMessages(msg))
				continue;

			const existing = Number(msg.extra?.token_count);
			if (Number.isFinite(existing) && existing > 0)
			{
				WriteExtraTokenCount(msg, existing);
				continue;
			}

			await EnsureMessageTokenCount(msg, stContext);
			didCount = true;
		}

		if (didCount)
			await stContext.saveChat();
	}
}

function OnMoreMsgLoaded(data)
{
	RefreshAllMessageButtons();
}

function OnMainApiChanged(data)
{
	UpdateSettingsUI();
}

async function OnMessageEdited(data)
{
	const msgIdx = Number(data);

	const stContext = SillyTavern.getContext();
	const msg = GetMessageByIndex(msgIdx, stContext);

	if (HasOriginalMessages(msg))
		await EnsureMessageTokenCount(msg, stContext);
}

// =========================
// Slash Command Handling
// =========================
async function SummariseCommand(namedArgs, unnamedArgs)
{
	const stContext = SillyTavern.getContext();
	const selection = GetSelection(stContext);

	const idParams = String(unnamedArgs).split(' ');

	selection.start = idParams[0] ? Math.max(0, parseInt(idParams[0], 10)) : null;
	selection.end = idParams[1] ? Math.min(parseInt(idParams[1], 10), stContext.chat.length - 1) : null;

	if (!IsValidRangeSelection(selection))
	{
		toastr.error("[ILS] Invalid message range: " + String(selection.start) + " - " + String(selection.end));
		ClearSelection(stContext);
		return "";
	}

	const manualMode = String(namedArgs.manual).trim().toLowerCase() == "true";
	if (manualMode)
		await GenerateSummaryManual();
	else
		await GenerateSummaryAI();
	return "";
}

async function RestoreCommand(namedArgs, unnamedArgs)
{
	const raw = String(unnamedArgs ?? "").trim().toLowerCase();
	const token = raw.split(/\s+/)[0] || "";
	const restoreAll = token === "all" || token === "*";
	const numToRestore = restoreAll ? Infinity : Math.max(0, parseInt(token, 10) || 0);

	if (!restoreAll && numToRestore === 0)
	{
		toastr.error("[ILS] Usage: /ils-restore <count|all>");
		return "";
	}

	const restored = await RestoreSummaries(numToRestore);
	if (restored === 0)
		toastr.info("[ILS] No summaries to restore.");
	else
		toastr.success("[ILS] Restored originals from " + restored + " summar" + (restored === 1 ? "y." : "ies."));

	return String(restored);
}

async function Experiment1(namedArgs, unnamedArgs)
{
	const idParams = String(unnamedArgs).split(' ');
	const chunkSize = idParams[0] ? Math.max(2, parseInt(idParams[0], 10)) : 2;

	const manualMode = String(namedArgs.manual).trim().toLowerCase() == "true";

	while (true)
	{
		const stContext = SillyTavern.getContext();
		const selection = GetSelection(stContext);

		let lastSummary = -1;
		for (let i = stContext.chat.length - 1; i >= 0; --i)
		{
			if (HasOriginalMessages(stContext.chat[i]))
			{
				lastSummary = i;
				break;
			}
		}

		// Count summarisable messages, skipping over hidden messages
		let summaryFrom = lastSummary + 1;
		let summaryTo = summaryFrom;
		let messageCount = 0;
		for (let i = summaryFrom; (i < stContext.chat.length) && (messageCount < chunkSize); ++i)
		{
			if (!stContext.chat[i].is_system)
				++messageCount;

			summaryTo = i;
		}

		// Not Enough Messages
		if (messageCount < chunkSize)
			break;

		// Count reamining messages, skipping over hidden messages
		let remainingMessages = 0;
		for (let i = summaryTo + 1; i < stContext.chat.length; ++i)
		{
			if (!stContext.chat[i].is_system)
				++remainingMessages;
		}

		// Not Enough Messages
		if (remainingMessages < chunkSize)
			break;

		selection.start = summaryFrom;
		selection.end = summaryTo;

		let isOk = true;
		if (manualMode)
			isOk = await GenerateSummaryManual();
		else
			isOk = await GenerateSummaryAI();

		if (!isOk)
			break;
	}

	return "";
}

async function Experiment2(namedArgs, unnamedArgs)
{
	const idParams = String(unnamedArgs).split(' ');
	const chunkSize = idParams[0] ? Math.max(2, parseInt(idParams[0], 10)) : 2;

	const manualMode = String(namedArgs.manual).trim().toLowerCase() == "true";

	while (true)
	{
		const stContext = SillyTavern.getContext();
		const selection = GetSelection(stContext);

		// Count summarisable messages, skipping over hidden messages
		let summaryFrom = 0;
		let summaryTo = summaryFrom;
		let messageCount = 0;
		for (let i = summaryFrom; (i < stContext.chat.length) && (messageCount < chunkSize); ++i)
		{
			if (!stContext.chat[i].is_system)
				++messageCount;

			summaryTo = i;
		}

		// Not Enough Messages
		if (messageCount < chunkSize)
			break;

		// Count reamining messages, skipping over hidden messages
		let remainingMessages = 0;
		for (let i = summaryTo + 1; i < stContext.chat.length; ++i)
		{
			if (!stContext.chat[i].is_system)
				++remainingMessages;
		}

		// Not Enough Messages
		if (remainingMessages < chunkSize)
			break;

		selection.start = summaryFrom;
		selection.end = summaryTo;

		let isOk = true;
		if (manualMode)
			isOk = await GenerateSummaryManual();
		else
			isOk = await GenerateSummaryAI();

		if (!isOk)
			break;
	}

	return "";
}

// =========================
// Initialise
// =========================
jQuery(async () =>
{
	const stContext = SillyTavern.getContext();
	const ilsInstance = GetILSInstance();

	await LoadSettings(stContext);

	// Setup Settings Menu. Resolve from this module's folder so GitHub installs
	// named InlineSummary_by_ego (or any other folder) still find settings.html.
	const settingsUrls = [
		kSettingsFile,
		new URL("settings.html", import.meta.url).href,
		"scripts/extensions/third-party/InlineSummary/settings.html",
		"scripts/extensions/third-party/InlineSummary_by_ego/settings.html",
	];

	let settingsHtml = "";
	for (const url of settingsUrls)
	{
		try
		{
			settingsHtml = await $.get(url);
			if (settingsHtml)
				break;
		}
		catch
		{
			settingsHtml = "";
		}
	}

	if (settingsHtml)
	{
		const $extensions = $("#extensions_settings");
		const $existing = $extensions.find(".inline-summary-settings");
		if ($existing.length > 0)
			$existing.replaceWith(settingsHtml);
		else
			$extensions.append(settingsHtml);

		await UpdateSettingsUI();
		SetupOnSettingChangeEvents();
	}
	else
	{
		ShowError("Could not load settings.html. The extension folder name does not match the hardcoded path. Message buttons still work.");
	}

	// Message Action Buttons
	const templateContainer = document.querySelector("#message_template .mes_buttons .extraMesButtons");
	if (templateContainer)
	{
		// Prepend buttons, this will result in reverse ordering, but it will be to the left of the button list.
		kMsgActionButtons.forEach(def =>
		{
			if (templateContainer.querySelector("." + def.className))
				return;

			const btn = document.createElement("div");
			btn.className = `mes_button fa-solid ${def.icon} interactable ${def.className}`;
			btn.title = def.title;
			btn.tabIndex = 0;
			btn.style.color = kMsgBtnColours.default;

			templateContainer.prepend(btn);
		});
	}
	else
	{
		console.error("[ILS] Could not find message template to inject buttons");
	}

	// Chat Observer
	const chatContainer = document.getElementById("chat");
	if (chatContainer)
	{
		if (ilsInstance.chatObs)
			ilsInstance.chatObs.disconnect();

		ilsInstance.chatObs = new MutationObserver(mutations =>
		{
			for (const m of mutations)
			{
				for (const node of m.addedNodes)
				{
					if (node.classList?.contains("mes"))
					{
						const msgId = Number(node.getAttribute("mesid"));
						if (!isNaN(msgId))
							RefreshMessageElements(node, msgId);
					}
				}
			}
		});

		ilsInstance.chatObs.observe(chatContainer, { childList: true, subtree: true });
	}
	else
	{
		console.error("[ILS] Failed to setup Observer.")
	}

	// Other Events
	const kEventsToRegister = [
		{ type: stContext.eventTypes.CHAT_CHANGED, handler: OnChatChanged },
		{ type: stContext.eventTypes.MORE_MESSAGES_LOADED, handler: OnMoreMsgLoaded },
		{ type: stContext.eventTypes.MAIN_API_CHANGED, handler: OnMainApiChanged },
		{ type: stContext.eventTypes.MESSAGE_EDITED, handler: OnMessageEdited },
		{ type: stContext.eventTypes.GENERATION_STOPPED, handler: () => { if (GetILSInstance().operationLock) CancelGenerate(); } },
	];

	for (const { type, handler } of kEventsToRegister)
	{
		const flagName = `evt_${type}_registered`;
		if (!ilsInstance[flagName])
		{
			stContext.eventSource.on(type, handler);
			ilsInstance[flagName] = true;
		}
	}

	document.removeEventListener("click", MainClickHandler);
	document.addEventListener("click", MainClickHandler);

	stContext.SlashCommandParser.addCommandObject(stContext.SlashCommand.fromProps({
		name: "ils",
		aliases: ["ils-sum", "ils-summarise", "ils-summarize"],
		callback: SummariseCommand,
		namedArgumentList: [
			stContext.SlashCommandNamedArgument.fromProps({
				name: 'manual',
				description: 'Insert manual summary message instead of using AI.',
				typeList: stContext.ARGUMENT_TYPE.BOOLEAN,
				defaultValue: 'false',
			}),
		],
		unnamedArgumentList: [
			stContext.SlashCommandArgument.fromProps({
				description: 'First message index',
				typeList: stContext.ARGUMENT_TYPE.NUMBER,
				isRequired: true,
			}),
			stContext.SlashCommandArgument.fromProps({
				description: 'Last message index',
				typeList: stContext.ARGUMENT_TYPE.NUMBER,
				isRequired: true,
			}),
		],
		helpString: `
		<div>
			Summarise a message range with AI. Inclusive, at least 2 messages.
			Aliases: <code>/ils-sum</code>, <code>/ils-summarise</code>, <code>/ils-summarize</code>
		</div>
		<div>
			<strong>Examples:</strong>
			<pre><code class="language-stscript">/ils 8 16</code></pre>
			<pre><code class="language-stscript">/ils manual=true 10 20</code></pre>
		</div>
		`
	}));

	GetILSInstance().RestoreSummaries = RestoreSummaries;

	stContext.SlashCommandParser.addCommandObject(stContext.SlashCommand.fromProps({
		name: "ils-undo",
		aliases: ["ils-restore", "ils-back"],
		callback: RestoreCommand,
		unnamedArgumentList: [
			stContext.SlashCommandArgument.fromProps({
				description: 'Number of latest summaries to restore, or "all"',
				typeList: stContext.ARGUMENT_TYPE.STRING,
				isRequired: true,
			}),
		],
		helpString: `
		<div>
			Restore original messages from the newest summaries. Use <code>all</code> to expand every summary in the current chat, including nested ones.
			Aliases: <code>/ils-restore</code>, <code>/ils-back</code>
		</div>
		<div>
			<strong>Examples:</strong>
			<pre><code class="language-stscript">/ils-restore 3</code></pre>
			<pre><code class="language-stscript">/ils-restore all</code></pre>
		</div>
		`
	}));

	stContext.SlashCommandParser.addCommandObject(stContext.SlashCommand.fromProps({
		name: "ils-linear",
		aliases: ["ils-experimental-summarise-linear"],
		callback: Experiment1,
		namedArgumentList: [
			stContext.SlashCommandNamedArgument.fromProps({
				name: 'manual',
				description: 'Insert manual summary message instead of using AI.',
				typeList: stContext.ARGUMENT_TYPE.BOOLEAN,
				defaultValue: 'false',
			}),
		],
		unnamedArgumentList: [
			stContext.SlashCommandArgument.fromProps({
				description: 'Chunk size',
				typeList: stContext.ARGUMENT_TYPE.NUMBER,
				isRequired: true,
			}),
		],
		helpString: `
		<div>
			Experimental: walk forward from the last summary and compress the chat in chunks. Use at your own risk.
			Alias: <code>/ils-experimental-summarise-linear</code>
		</div>
		<div>
			<strong>Examples:</strong>
			<pre><code class="language-stscript">/ils-linear 10</code></pre>
			<pre><code class="language-stscript">/ils-linear manual=true 10</code></pre>
		</div>
		`
	}));

	stContext.SlashCommandParser.addCommandObject(stContext.SlashCommand.fromProps({
		name: "ils-stack",
		aliases: ["ils-experimental-summarise-stacked"],
		callback: Experiment2,
		namedArgumentList: [
			stContext.SlashCommandNamedArgument.fromProps({
				name: 'manual',
				description: 'Insert manual summary message instead of using AI.',
				typeList: stContext.ARGUMENT_TYPE.BOOLEAN,
				defaultValue: 'false',
			}),
		],
		unnamedArgumentList: [
			stContext.SlashCommandArgument.fromProps({
				description: 'Chunk size',
				typeList: stContext.ARGUMENT_TYPE.NUMBER,
				isRequired: true,
			}),
		],
		helpString: `
		<div>
			Experimental: keep compressing from the start of the chat into stacked summaries. Use at your own risk.
			Alias: <code>/ils-experimental-summarise-stacked</code>
		</div>
		<div>
			<strong>Examples:</strong>
			<pre><code class="language-stscript">/ils-stack 10</code></pre>
			<pre><code class="language-stscript">/ils-stack manual=true 10</code></pre>
		</div>
		`
	}));

	console.log("[ILS] Inline Summary - Ready");
});
