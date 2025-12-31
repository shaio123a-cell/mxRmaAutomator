import configData from '../config.json'

export interface FieldConfig {
  name: string
  type: 'text' | 'textarea' | 'number' | 'password' | 'select'
  label: string
  options?: string[]
}

export interface ScriptStructure {
  delimiter: string
  fields: string[]
  terminator: string
}

export interface ScriptUI {
  allFields: FieldConfig[]
  restmonOrder: string[]
  genericOrder: string[]
}

export interface Config {
  client: string
  scriptStructure: ScriptStructure
  scriptUI: ScriptUI
}

const config: Config = configData as Config

export default config