#pragma once

#include <react/renderer/components/PathwayOSMarkdownTextSpec/EventEmitters.h>
#include <react/renderer/components/PathwayOSMarkdownTextSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNode.h>

#include <string>
#include <vector>

namespace facebook::react {

extern const char PathwayOSMarkdownTextComponentName[];

struct PathwayOSMarkdownTextParagraphStyleRange {
  size_t location;
  size_t length;
  Float firstLineHeadIndent;
  Float headIndent;
  Float paragraphSpacing;
};

struct PathwayOSMarkdownTextAttachmentRange {
  size_t location;
  size_t length;
  std::string imageUri;
};

inline Float PathwayOSMarkdownTextAttachmentSize(const PathwayOSMarkdownTextAttachmentRange &) {
  return 14;
}

inline Float PathwayOSMarkdownTextAttachmentBaselineOffset(
    const PathwayOSMarkdownTextAttachmentRange &) {
  return -2;
}

class PathwayOSMarkdownTextStateReal final {
 public:
  AttributedString attributedString;
  std::vector<PathwayOSMarkdownTextParagraphStyleRange> paragraphStyleRanges;
  std::vector<PathwayOSMarkdownTextAttachmentRange> attachmentRanges;
};

class PathwayOSMarkdownTextShadowNode final : public ConcreteViewShadowNode<
PathwayOSMarkdownTextComponentName,
PathwayOSMarkdownTextProps,
PathwayOSMarkdownTextEventEmitter,
PathwayOSMarkdownTextStateReal> {
public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  PathwayOSMarkdownTextShadowNode(
   const ShadowNode& sourceShadowNode,
   const ShadowNodeFragment& fragment
  );

  static ShadowNodeTraits BaseTraits() {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
    return traits;
  }

  void layout(LayoutContext layoutContext) override;

  Size measureContent(
      const LayoutContext& layoutContext,
      const LayoutConstraints& layoutConstraints) const override;

private:
  mutable AttributedString _attributedString;
  mutable std::vector<PathwayOSMarkdownTextParagraphStyleRange> _paragraphStyleRanges;
  mutable std::vector<PathwayOSMarkdownTextAttachmentRange> _attachmentRanges;
};
} // namespace facebook::React
