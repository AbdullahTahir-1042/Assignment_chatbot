import { useEffect } from "react";
import { AuthLayout } from "../../layout";
import { TextLink } from "../../ui/TextLink";
import { SignupForm } from "../../features/auth";
import { setDocumentTitle } from "../../lib/documentTitle";

export const SignupPage = () => {
  useEffect(() => {
    setDocumentTitle();
  }, []);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account per business — set it up in a minute."
      footer={
        <>
          Already registered? <TextLink to="/login">Sign in</TextLink>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
};