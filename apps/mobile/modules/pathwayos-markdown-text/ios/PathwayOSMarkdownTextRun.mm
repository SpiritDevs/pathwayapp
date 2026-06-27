#import "PathwayOSMarkdownTextRun.h"
#import "PathwayOSMarkdownText.h"
#import "PathwayOSMarkdownTextRunComponentDescriptor.h"
#import <react/renderer/components/PathwayOSMarkdownTextSpec/EventEmitters.h>
#import <react/renderer/components/PathwayOSMarkdownTextSpec/Props.h>
#import <react/renderer/components/PathwayOSMarkdownTextSpec/RCTComponentViewHelpers.h>
#import "RCTFabricComponentsPlugins.h"
#import "Utils.h"

using namespace facebook::react;

@interface PathwayOSMarkdownTextRun () <RCTPathwayOSMarkdownTextRunViewProtocol>

@end

@implementation PathwayOSMarkdownTextRun {
  NSString * _text;
  RCTBubblingEventBlock _onPress;
  RCTBubblingEventBlock _onLongPress;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
    return concreteComponentDescriptorProvider<PathwayOSMarkdownTextRunComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const PathwayOSMarkdownTextRunProps>();
    _props = defaultProps;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<PathwayOSMarkdownTextRunProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<PathwayOSMarkdownTextRunProps const>(props);

  if (newViewProps.text != oldViewProps.text) {
    NSString *text = [NSString stringWithUTF8String:newViewProps.text.c_str()];
    _text = text;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)onPress {
  if (_eventEmitter != nullptr) {
    std::dynamic_pointer_cast<const facebook::react::PathwayOSMarkdownTextRunEventEmitter>(_eventEmitter)
    ->onPress(facebook::react::PathwayOSMarkdownTextRunEventEmitter::OnPress{});
  }
}

- (void)onLongPress {
  if (_eventEmitter != nullptr) {
    std::dynamic_pointer_cast<const facebook::react::PathwayOSMarkdownTextRunEventEmitter>(_eventEmitter)
    ->onLongPress(facebook::react::PathwayOSMarkdownTextRunEventEmitter::OnLongPress{});
  }
}

+ (BOOL)shouldBeRecycled {
  return NO;
}

Class<RCTComponentViewProtocol> PathwayOSMarkdownTextRunCls(void)
{
    return PathwayOSMarkdownTextRun.class;
}

@end
