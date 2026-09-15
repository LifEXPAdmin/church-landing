-- If optional exposure proof was withdrawn or expired, preserve the submitted
-- feedback without calling it a measured prompt response or voluntary Menu use.
ALTER TABLE "FeedbackSubmission" DROP CONSTRAINT "FeedbackSubmission_entryPoint_check";
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_entryPoint_check" CHECK (
 "entryPoint" IN ('VOLUNTARY','PROMPT','UNATTRIBUTED'));
