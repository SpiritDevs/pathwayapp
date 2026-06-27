package expo.modules.pathwayosterminal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PathwayOSTerminalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PathwayOSTerminalSurface")

    View(PathwayOSTerminalView::class) {
      Prop("terminalKey") { view: PathwayOSTerminalView, terminalKey: String ->
        view.terminalKey = terminalKey
      }

      Prop("initialBuffer") { view: PathwayOSTerminalView, initialBuffer: String ->
        view.initialBuffer = initialBuffer
      }

      Prop("fontSize") { view: PathwayOSTerminalView, fontSize: Double ->
        view.fontSize = fontSize.toFloat()
      }

      Prop("appearanceScheme") { view: PathwayOSTerminalView, appearanceScheme: String ->
        view.appearanceScheme = appearanceScheme
      }

      Prop("themeConfig") { view: PathwayOSTerminalView, themeConfig: String ->
        view.themeConfig = themeConfig
      }

      Prop("backgroundColor") { view: PathwayOSTerminalView, backgroundColor: String ->
        view.backgroundColorHex = backgroundColor
      }

      Prop("foregroundColor") { view: PathwayOSTerminalView, foregroundColor: String ->
        view.foregroundColorHex = foregroundColor
      }

      Prop("mutedForegroundColor") { view: PathwayOSTerminalView, mutedForegroundColor: String ->
        view.mutedForegroundColorHex = mutedForegroundColor
      }

      Events("onInput", "onResize")
    }
  }
}
