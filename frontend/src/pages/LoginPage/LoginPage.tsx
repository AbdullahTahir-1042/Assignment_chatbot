import { useEffect } from "react";
import { Card } from "../../ui/Card";
import { PageContainer } from "../../ui/PageContainer";
import { TextLink } from "../../ui/TextLink";
import { LoginForm } from "../../features/auth";

/**
 * Thin by design: compose ui + feature components, hold no state of its own.
 * The redirect after a successful login is the store's business, handled by
 * PublicOnlyRoute, so this page has no success callback to write.
 */
export const LoginPage = () => {
  useEffect(() => {
    document.title = "Sign in";
  }, []);

  return (
    <PageContainer size="narrow">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Book appointments in plain language.</p>
        <div className="mt-5">
          <LoginForm />
        </div>
        <p className="mt-4 text-sm text-slate-600">
          No account? <TextLink to="/signup">Create one</TextLink>
        </p>
      </Card>
    </PageContainer>
  );
};
