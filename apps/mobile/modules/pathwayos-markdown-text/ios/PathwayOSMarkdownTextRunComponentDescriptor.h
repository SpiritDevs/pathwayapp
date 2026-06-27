#pragma once

#include "PathwayOSMarkdownTextRunShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

namespace facebook::react {
using PathwayOSMarkdownTextRunComponentDescriptor = ConcreteComponentDescriptor<PathwayOSMarkdownTextRunShadowNode>;

void PathwayOSMarkdownTextRunSpec_registerComponentDescriptorsFromCodegen(
  std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
}
