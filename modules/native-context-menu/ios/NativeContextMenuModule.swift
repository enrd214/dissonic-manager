import ExpoModulesCore
import UIKit

final class NativeContextMenuView: ExpoView, UIContextMenuInteractionDelegate {
  let onAction = EventDispatcher()
  var actionTitles: [String] = [] {
    didSet {
      setNeedsLayout()
    }
  }

  private lazy var contextMenuInteraction = UIContextMenuInteraction(delegate: self)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(contextMenuInteraction)
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    let actions = actionTitles.enumerated().map { index, title in
      UIAction(title: title) { [weak self] _ in
        self?.onAction([
          "index": index,
          "name": title
        ])
      }
    }

    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in
      UIMenu(title: "", children: actions)
    }
  }
}

public final class NativeContextMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeContextMenu")

    View(NativeContextMenuView.self) {
      Events("onAction")

      Prop("actions") { (view: NativeContextMenuView, actions: [String]) in
        view.actionTitles = actions
      }
    }
  }
}
