
import { configureStore } from '@reduxjs/toolkit'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'
import fbcskm from './fbcskmSlice'
import { setActiveSystemPromptId, setAiModels, setSystemPrompts, setThemePreference } from './fbcskmSlice'
import type { PersistedAISettings } from '../utils/fileApi'

export const store = configureStore({ reducer: { fbcskm } })

const aiSettingsStorageKey = 'mx-rma-agentic-ai-settings'
let aiSettingsPersistenceReady = false
let lastAiSettingsSnapshot = ''
let queuedElectronSave = Promise.resolve()

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
		}
	} catch (error) {
		console.warn('Unable to read legacy browser AI settings.', error)
		return null
	}
}

function getCurrentAISettings(): PersistedAISettings {
	const { aiModels, systemPrompts, activeSystemPromptId, themePreference } = store.getState().fbcskm
	return { models: aiModels, prompts: systemPrompts, activePromptId: activeSystemPromptId, themePreference }
}

function applyAISettings(settings: PersistedAISettings) {
	store.dispatch(setAiModels(settings.models))
	store.dispatch(setSystemPrompts(settings.prompts))
	store.dispatch(setActiveSystemPromptId(settings.activePromptId))
	if (settings.themePreference) store.dispatch(setThemePreference(settings.themePreference))
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

	if (savedSettings) applyAISettings(savedSettings)
	aiSettingsPersistenceReady = true
	lastAiSettingsSnapshot = JSON.stringify(getCurrentAISettings())
	if (!savedSettings && window.electronAPI.isElectron) {
		await window.electronAPI.saveAiSettings(getCurrentAISettings())
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
