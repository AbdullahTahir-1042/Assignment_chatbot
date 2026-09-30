import { useEffect } from "react";
import { Card } from "../../ui/Card";
import { PageContainer } from "../../ui/PageContainer";
import { TextLink } from "../../ui/TextLink";
import { SignupForm } from "../../features/auth";

export const SignupPage = () => {
  useEffect(() => {
    document.title = "Create an account";
  }, []);

  return (
    <PageContainer size="narrow">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">One account per business.</p>
        <div className="mt-5">
          <SignupForm />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Already registered? <TextLink to="/login">Sign in</TextLink>
        </p>
      </Card>
    </PageContainer>
  );
};
