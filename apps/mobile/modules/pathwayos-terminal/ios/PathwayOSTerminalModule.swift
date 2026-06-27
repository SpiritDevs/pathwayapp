import ExpoModulesCore

public class PathwayOSTerminalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PathwayOSTerminalSurface")

    View(PathwayOSTerminalView.self) {
      Prop("terminalKey") { (view: PathwayOSTerminalView, terminalKey: String) in
        view.terminalKey = terminalKey
      }

      Prop("initialBuffer") { (view: PathwayOSTerminalView, initialBuffer: String) in
        view.initialBuffer = initialBuffer
      }

      Prop("fontSize") { (view: PathwayOSTerminalView, fontSize: Double) in
        view.fontSize = CGFloat(fontSize)
      }

      Prop("appearanceScheme") { (view: PathwayOSTerminalView, appearanceScheme: String) in
        view.appearanceScheme = appearanceScheme
      }

      Prop("themeConfig") { (view: PathwayOSTerminalView, themeConfig: String) in
        view.themeConfig = themeConfig
      }

      Prop("backgroundColor") { (view: PathwayOSTerminalView, backgroundColor: String) in
        view.backgroundColorHex = backgroundColor
      }

      Prop("foregroundColor") { (view: PathwayOSTerminalView, foregroundColor: String) in
        view.foregroundColorHex = foregroundColor
      }

      Prop("mutedForegroundColor") { (view: PathwayOSTerminalView, mutedForegroundColor: String) in
        view.mutedForegroundColorHex = mutedForegroundColor
      }

      Events("onInput", "onResize")
    }
  }
}
