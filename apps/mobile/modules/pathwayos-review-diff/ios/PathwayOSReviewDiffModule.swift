import ExpoModulesCore

public class PathwayOSReviewDiffModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PathwayOSReviewDiffSurface")

    View(PathwayOSReviewDiffView.self) {
      Prop("rowsJson") { (view: PathwayOSReviewDiffView, rowsJson: String) in
        view.setRowsJson(rowsJson)
      }

      Prop("tokensJson") { (view: PathwayOSReviewDiffView, tokensJson: String) in
        view.setTokensJson(tokensJson)
      }

      Prop("tokensPatchJson") { (view: PathwayOSReviewDiffView, tokensPatchJson: String) in
        view.setTokensPatchJson(tokensPatchJson)
      }

      Prop("tokensResetKey") { (view: PathwayOSReviewDiffView, tokensResetKey: String) in
        view.setTokensResetKey(tokensResetKey)
      }

      Prop("collapsedFileIdsJson") { (view: PathwayOSReviewDiffView, collapsedFileIdsJson: String) in
        view.setCollapsedFileIdsJson(collapsedFileIdsJson)
      }

      Prop("viewedFileIdsJson") { (view: PathwayOSReviewDiffView, viewedFileIdsJson: String) in
        view.setViewedFileIdsJson(viewedFileIdsJson)
      }

      Prop("selectedRowIdsJson") { (view: PathwayOSReviewDiffView, selectedRowIdsJson: String) in
        view.setSelectedRowIdsJson(selectedRowIdsJson)
      }

      Prop("collapsedCommentIdsJson") { (view: PathwayOSReviewDiffView, collapsedCommentIdsJson: String) in
        view.setCollapsedCommentIdsJson(collapsedCommentIdsJson)
      }

      Prop("appearanceScheme") { (view: PathwayOSReviewDiffView, appearanceScheme: String) in
        view.setAppearanceScheme(appearanceScheme)
      }

      Prop("themeJson") { (view: PathwayOSReviewDiffView, themeJson: String) in
        view.setThemeJson(themeJson)
      }

      Prop("styleJson") { (view: PathwayOSReviewDiffView, styleJson: String) in
        view.setStyleJson(styleJson)
      }

      Prop("rowHeight") { (view: PathwayOSReviewDiffView, rowHeight: Double) in
        view.setRowHeight(CGFloat(rowHeight))
      }

      Prop("contentWidth") { (view: PathwayOSReviewDiffView, contentWidth: Double) in
        view.setContentWidth(CGFloat(contentWidth))
      }

      Prop("initialRowIndex") { (view: PathwayOSReviewDiffView, initialRowIndex: Double) in
        view.setInitialRowIndex(initialRowIndex)
      }

      Events("onDebug", "onToggleFile", "onToggleViewedFile", "onPressLine", "onToggleComment")
    }
  }
}
