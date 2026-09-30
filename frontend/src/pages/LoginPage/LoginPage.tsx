import { useEffect } from "react";
import { AuthLayout } from "../../layout";
import { TextLink } from "../../ui/TextLink";
import { LoginForm } from "../../features/auth";
import { setDocumentTitle } from "../../lib/documentTitle";

/**
 * Thin by design: compose ui + feature components, hold no state of its own.
 * The redirect after a successful login is the store's business, handled by
 * PublicOnlyRoute, so this page has no success callback to write.
 */
export const LoginPage = () => {
  useEffect(() => {
    setDocumentTitle();
  }, []);

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to book and manage your appointments."
      footer={
        <>
          No account? <TextLink to="/signup">Create one</TextLink>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
};