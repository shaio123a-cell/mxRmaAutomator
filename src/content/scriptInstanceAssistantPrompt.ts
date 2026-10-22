import config, { type AIBuiltInSkill } from '../config'
import { renderScriptInstanceFieldCatalog } from './scriptInstanceFields'

export const SCRIPT_INSTANCE_ASSISTANT_SKILL_ID = 'script-instance-assistant'

const FALLBACK_PROMPT = `You are the Script Instance AI Assistant for BMC PATROL for Scripting.
Work only on the open Script Instance draft. Never save, run, or deploy anything.
Never change isRestmon, never read or set password, and never invent URLs, credentials, paths, or secrets.
Return only a valid JSON object with summary, assessment, issues, updates, needsUserInput, and confidence.

## Field catalog
{{FIELD_CATALOG}}`

export function getScriptInstanceAssistantSkill(): AIBuiltInSkill | undefined {
  return config.ai?.builtInSkills?.find(skill => skill.id === SCRIPT_INSTANCE_ASSISTANT_SKILL_ID)
}

export function buildScriptInstanceAssistantPrompt(): string {
  const skill = getScriptInstanceAssistantSkill()
  const template = skill?.content?.trim() || FALLBACK_PROMPT
  const catalog = renderScriptInstanceFieldCatalog()
  if (template.includes('{{FIELD_CATALOG}}')) {
    return template.replace(/\{\{FIELD_CATALOG\}\}/g, catalog)
  }
  return `${template}\n\n## Field catalog\n${catalog}`
}
