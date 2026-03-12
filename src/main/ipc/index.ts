import { registerSessionHandlers } from './sessions'
import { registerSpeakerHandlers } from './speakers'
import { registerSettingsHandlers } from './settings'
import { registerDialogHandlers } from './dialog'
import { registerModelHandlers } from './models'

export function registerHandlers(): void {
  registerSessionHandlers()
  registerSpeakerHandlers()
  registerSettingsHandlers()
  registerDialogHandlers()
  registerModelHandlers()
}
