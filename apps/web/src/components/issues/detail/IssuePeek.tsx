import { RightPanelSheet } from "~/components/RightPanelSheet";
import { useIssuePeekStore } from "../issuePeekStore";
import { IssueDetailPage } from "./IssueDetailPage";

export function IssuePeek() {
  const issueRef = useIssuePeekStore((state) => state.peekIssueRef);
  const closePeek = useIssuePeekStore((state) => state.closePeek);
  return (
    <RightPanelSheet onClose={closePeek} open={issueRef !== null}>
      {issueRef ? <IssueDetailPage condensed issueRef={issueRef} onClose={closePeek} /> : null}
    </RightPanelSheet>
  );
}
