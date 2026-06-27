#pragma once

#include <react/renderer/components/PathwayOSMarkdownTextSpec/EventEmitters.h>
#include <react/renderer/components/PathwayOSMarkdownTextSpec/Props.h>
#include <react/renderer/components/PathwayOSMarkdownTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char PathwayOSMarkdownTextRunComponentName[];

using PathwayOSMarkdownTextRunShadowNode = ConcreteViewShadowNode<
    PathwayOSMarkdownTextRunComponentName,
    PathwayOSMarkdownTextRunProps,
    PathwayOSMarkdownTextRunEventEmitter,
    PathwayOSMarkdownTextRunState>;
}
