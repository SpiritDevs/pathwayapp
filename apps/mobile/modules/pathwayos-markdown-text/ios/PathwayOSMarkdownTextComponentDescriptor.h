#pragma once

#include "PathwayOSMarkdownTextShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

namespace facebook::react {
using PathwayOSMarkdownTextComponentDescriptor = ConcreteComponentDescriptor<PathwayOSMarkdownTextShadowNode>;

void PathwayOSMarkdownTextSpec_registerComponentDescriptorsFromCodegen(
  std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
}
