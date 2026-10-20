
import { configureStore } from '@reduxjs/toolkit'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'
import fbcskm from './fbcskmSlice'
import { setActiveSystemPromptId, setAiModels, setSystemPrompts, setThemePreference } from './fbcskmSlice'
import type { PersistedAISettings } from '../utils/fileApi'
import config from '../config'

export const store = configureStore({ reducer: { fbcskm } })

const aiSettingsStorageKey = 'mx-rma-agentic-ai-settings'
const legacyDefaultPrompts: Record<string, string[]> = {
	'system-default': [
		`You are a senior infrastructure automation engineer. Produce valid, production-safe scripts for Linux and Windows environments. Keep scripts readable, well-commented, and practical for real-world administration tasks. Return the complete script in a fenced code block, with a concise explanation outside it.`,
	],
	'system-restmon': [
		`You are generating PATROL KM / RestMon automation scripts. Follow the user's requested language and existing script conventions. Keep commands readable, validate inputs, handle errors, and return the complete script in a fenced code block.`,
	],
}
let aiSettingsPersistenceReady = false
let lastAiSettingsSnapshot = ''
let queuedElectronSave = Promise.resolve()

function hashText(value: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16)
}

function readLocalAISettings(): PersistedAISettings | null {
	try {
		const serialized = localStorage.getItem(aiSettingsStorageKey)
		if (!serialized) return null
		const parsed = JSON.parse(serialized)
		if (!Array.isArray(parsed.models) || !Array.isArray(parsed.prompts)) return null
		return {
			models: parsed.models,
			prompts: parsed.prompts,
			activePromptId: typeof parsed.activePromptId === 'string' ? parsed.activePromptId : null,
			themePreference: parsed.themePreference === 'light' || parsed.themePreference === 'dark' || parsed.themePreference === 'system' ? parsed.themePreference : undefined,
			configPromptContentHashes: parsed.configPromptContentHashes && typeof parsed.configPromptContentHashes === 'object' && !Array.isArray(parsed.configPromptContentHashes) ? parsed.configPromptContentHashes : undefined,
		}
	} catch (error) {
		console.warn('Unable to read legacy browser AI settings.', error)
		return null
	}
}

function getCurrentAISettings(): PersistedAISettings {
	const { aiModels, systemPrompts, activeSystemPromptId, themePreference } = store.getState().fbcskm
	return {
		models: aiModels,
		prompts: systemPrompts,
		activePromptId: activeSystemPromptId,
		themePreference,
		configPromptContentHashes: Object.fromEntries((config.ai?.systemPrompts ?? []).map(prompt => [prompt.id, hashText(prompt.content)])),
	}
}

function applyAISettings(settings: PersistedAISettings) {
	store.dispatch(setAiModels(settings.models))
	store.dispatch(setSystemPrompts(settings.prompts))
	store.dispatch(setActiveSystemPromptId(settings.activePromptId))
	if (settings.themePreference) store.dispatch(setThemePreference(settings.themePreference))
}

function isLegacyDefaultPrompt(id: string, content: string): boolean {
	const normalized = content.trim()
	return (legacyDefaultPrompts[id] ?? []).some(item => item.trim() === normalized)
}

function mergeConfigPromptDefaults(settings: PersistedAISettings): PersistedAISettings {
	const configPrompts = config.ai?.systemPrompts ?? []
	if (!configPrompts.length) return settings
	const recorded = settings.configPromptContentHashes ?? {}
	let changed = false
	const prompts = settings.prompts.map(prompt => ({ ...prompt }))
	for (const configPrompt of configPrompts) {
		const index = prompts.findIndex(prompt => prompt.id === configPrompt.id)
		if (index < 0) {
			if (recorded[configPrompt.id] === undefined) {
				prompts.push({ ...configPrompt })
				changed = true
			}
			continue
		}
		const recordedHash = recorded[configPrompt.id]
		const unmodified = recordedHash !== undefined
			? recordedHash === hashText(prompts[index].content)
			: isLegacyDefaultPrompt(configPrompt.id, prompts[index].content)
		if (unmodified && prompts[index].content !== configPrompt.content) {
			prompts[index] = { ...configPrompt }
			changed = true
		}
	}
	let activePromptId = settings.activePromptId
	const configDefaultId = config.ai?.activeSystemPromptId ?? null
	if (!activePromptId || !prompts.some(prompt => prompt.id === activePromptId)) {
		activePromptId = (configDefaultId && prompts.some(prompt => prompt.id === configDefaultId))
			? configDefaultId
			: prompts[0]?.id ?? null
		changed = true
	}
	if (!changed) return settings
	return { ...settings, prompts, activePromptId }
}

export const aiSettingsReady = (async () => {
	let savedSettings: PersistedAISettings | null = null
	if (window.electronAPI.isElectron) {
		savedSettings = await window.electronAPI.loadAiSettings()
		if (!savedSettings) {
			savedSettings = readLocalAISettings()
			if (savedSettings) await window.electronAPI.saveAiSettings(savedSettings)
		}
	} else {
		savedSettings = readLocalAISettings()
	}

	let mergedSettings: PersistedAISettings | null = null
	let needsHashMigration = false
	if (savedSettings) {
		needsHashMigration = Object.keys(savedSettings.configPromptContentHashes ?? {}).length === 0
		mergedSettings = mergeConfigPromptDefaults(savedSettings)
		applyAISettings(mergedSettings)
	}
	aiSettingsPersistenceReady = true
	lastAiSettingsSnapshot = JSON.stringify(getCurrentAISettings())
	if (!savedSettings && window.electronAPI.isElectron) {
		await window.electronAPI.saveAiSettings(getCurrentAISettings())
	} else if (mergedSettings && (mergedSettings !== savedSettings || needsHashMigration)) {
		try {
			const fresh = getCurrentAISettings()
			if (window.electronAPI.isElectron) await window.electronAPI.saveAiSettings(fresh)
			else localStorage.setItem(aiSettingsStorageKey, JSON.stringify(fresh))
		} catch (error) {
			console.warn('Unable to persist merged AI settings.', error)
		}
	}
})().catch(error => {
	console.warn('Unable to initialize persisted AI settings.', error)
	aiSettingsPersistenceReady = true
	lastAiSettingsSnapshot = JSON.stringify(getCurrentAISettings())
})

store.subscribe(() => {
	if (!aiSettingsPersistenceReady) return
	const settings = getCurrentAISettings()
	const snapshot = JSON.stringify(settings)
	if (snapshot === lastAiSettingsSnapshot) return
	lastAiSettingsSnapshot = snapshot

	if (window.electronAPI.isElectron) {
		queuedElectronSave = queuedElectronSave
			.catch(() => {})
			.then(() => window.electronAPI.saveAiSettings(settings))
			.catch(error => console.warn('Unable to save Electron AI settings.', error))
		return
	}

	try {
		localStorage.setItem(aiSettingsStorageKey, snapshot)
	} catch (error) {
		console.warn('Unable to save browser AI settings.', error)
	}
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
