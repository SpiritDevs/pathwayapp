#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
#import "RCTBridge.h"
#import "Utils.h"

@interface PathwayOSMarkdownTextManager : RCTViewManager
@end

@implementation PathwayOSMarkdownTextManager

RCT_EXPORT_MODULE(PathwayOSMarkdownText)

- (UIView *)view
{
  return [[UIView alloc] init];
}

RCT_CUSTOM_VIEW_PROPERTY(color, NSString, UIView)
{
}

@end

@interface PathwayOSMarkdownTextRunManager : RCTViewManager
@end

@implementation PathwayOSMarkdownTextRunManager

RCT_EXPORT_MODULE(PathwayOSMarkdownTextRun)

- (UIView *)view
{
  return nil;
}

@end
