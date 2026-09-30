import { useEffect } from "react";
import { Card } from "../../ui/Card";
import { PageContainer } from "../../ui/PageContainer";
import { TextLink } from "../../ui/TextLink";
import { setDocumentTitle } from "../../lib/documentTitle";

export const NotFoundPage = () => {
  useEffect(() => {
    setDocumentTitle();
  }, []);

  return (
    <PageContainer size="narrow">
      <Card className="p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">That URL does not exist.</p>
        <p className="mt-4 text-sm">
          <TextLink to="/dashboard">Back to appointments</TextLink>
        </p>
      </Card>
    </PageContainer>
  );
};
